#!/usr/bin/env bash
# Start the brainstorm server and output connection info
# Usage: start-server.sh [--project-dir <path>] [--host <bind-host>] [--url-host <display-host>] [--foreground] [--background]
#
# Starts server on a random high port, outputs JSON with URL.
# Each session gets its own directory to avoid conflicts.
#
# Options:
#   --project-dir <path>  Store session files under <path>/.superpowers/brainstorm/
#                         instead of /tmp. Files persist after server stops.
#   --host <bind-host>    Host/interface to bind (default: 127.0.0.1).
#                         Use 0.0.0.0 in remote/containerized environments.
#   --url-host <host>     Hostname shown in returned URL JSON.
#   --foreground          Run server in the current terminal (no backgrounding).
#   --background          Force background mode (overrides Codex auto-foreground).
#   --reuse               If a live server already exists for this --project-dir, print
#                         its connection info and exit instead of launching a new one.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Parse arguments
PROJECT_DIR=""
FOREGROUND="false"
FORCE_BACKGROUND="false"
REUSE="false"
BIND_HOST="127.0.0.1"
URL_HOST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --reuse)
      REUSE="true"
      shift
      ;;
    --host)
      BIND_HOST="$2"
      shift 2
      ;;
    --url-host)
      URL_HOST="$2"
      shift 2
      ;;
    --foreground|--no-daemon)
      FOREGROUND="true"
      shift
      ;;
    --background|--daemon)
      FORCE_BACKGROUND="true"
      shift
      ;;
    *)
      echo "{\"error\": \"Unknown argument: $1\"}"
      exit 1
      ;;
  esac
done

if [[ -z "$URL_HOST" ]]; then
  if [[ "$BIND_HOST" == "127.0.0.1" || "$BIND_HOST" == "localhost" ]]; then
    URL_HOST="localhost"
  else
    URL_HOST="$BIND_HOST"
  fi
fi

# Some environments reap detached/background processes. Auto-foreground when detected.
if [[ -n "${CODEX_CI:-}" && "$FOREGROUND" != "true" && "$FORCE_BACKGROUND" != "true" ]]; then
  FOREGROUND="true"
fi

# Windows/Git Bash reaps nohup background processes. Auto-foreground when detected.
if [[ "$FOREGROUND" != "true" && "$FORCE_BACKGROUND" != "true" ]]; then
  case "${OSTYPE:-}" in
    msys*|cygwin*|mingw*) FOREGROUND="true" ;;
  esac
  if [[ -n "${MSYSTEM:-}" ]]; then
    FOREGROUND="true"
  fi
fi

# Reuse an existing live server for this project, if requested.
# Avoids redundant startups and session-dir sprawl across turns.
if [[ "$REUSE" == "true" && -n "$PROJECT_DIR" ]]; then
  BRAINSTORM_ROOT="${PROJECT_DIR}/.superpowers/brainstorm"
  if [[ -d "$BRAINSTORM_ROOT" ]]; then
    # Newest session first; reuse the first one whose pid is still alive.
    while IFS= read -r info; do
      [[ -z "$info" ]] && continue
      sdir="$(dirname "$info")"
      [[ -f "$sdir/server-stopped" ]] && continue
      pidf="$sdir/server.pid"
      if [[ -f "$pidf" ]] && kill -0 "$(cat "$pidf" 2>/dev/null)" 2>/dev/null; then
        cat "$info"
        exit 0
      fi
    done < <(ls -1dt "$BRAINSTORM_ROOT"/*/state/server-info 2>/dev/null)
  fi
fi

# Generate unique session directory
SESSION_ID="$$-$(date +%s)"

if [[ -n "$PROJECT_DIR" ]]; then
  SESSION_DIR="${PROJECT_DIR}/.superpowers/brainstorm/${SESSION_ID}"
else
  SESSION_DIR="/tmp/brainstorm-${SESSION_ID}"
fi

STATE_DIR="${SESSION_DIR}/state"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"

# Create fresh session directory with content and state peers.
# SESSION_ID is unique per run ($$ + epoch), so the dir is always new — no prior
# server.pid can live here, which is why there is no "kill existing server" step.
mkdir -p "${SESSION_DIR}/content" "$STATE_DIR"

cd "$SCRIPT_DIR"

# Resolve the harness PID (grandparent of this script).
# $PPID is the ephemeral shell the harness spawned to run us — it dies
# when this script exits. The harness itself is $PPID's parent.
OWNER_PID="$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')"
if [[ -z "$OWNER_PID" || "$OWNER_PID" == "1" ]]; then
  OWNER_PID="$PPID"
fi

# Foreground mode for environments that reap detached/background processes.
if [[ "$FOREGROUND" == "true" ]]; then
  echo "$$" > "$PID_FILE"
  env BRAINSTORM_DIR="$SESSION_DIR" BRAINSTORM_HOST="$BIND_HOST" BRAINSTORM_URL_HOST="$URL_HOST" BRAINSTORM_OWNER_PID="$OWNER_PID" node server.cjs
  exit $?
fi

# Start the server fully detached so it survives this shell's exit.
#
# nohup + disown is NOT enough in agent harnesses (Copilot CLI, Codex, and
# similar) that run each shell tool call in its own session/process group and
# tear that session down when the call returns: nohup only ignores SIGHUP and
# disown only drops the job from this shell's table — the server still lives in
# the SAME session as this shell, so the teardown reaps it. The server comes up,
# the alive-check below passes, and then it dies the instant the bash call ends.
#
# The solution is to create a BRAND-NEW session (setsid syscall), making the
# server its own session leader so the parent session's teardown cannot reach it.
# Priority order:
#   1. setsid binary   — available on Linux; not present on macOS by default.
#   2. perl POSIX      — macOS ships perl with the POSIX module, which exposes the
#                        same setsid(2) syscall. Used as fallback when setsid is absent.
#   3. nohup + disown  — last resort for exotic envs without setsid OR perl.
#                        Insufficient for session-based reapers; Windows/Git Bash and
#                        Codex are handled by the auto-foreground blocks above.
if command -v setsid >/dev/null 2>&1; then
  setsid env BRAINSTORM_DIR="$SESSION_DIR" BRAINSTORM_HOST="$BIND_HOST" BRAINSTORM_URL_HOST="$URL_HOST" BRAINSTORM_OWNER_PID="$OWNER_PID" node server.cjs > "$LOG_FILE" 2>&1 < /dev/null &
  SERVER_PID=$!
elif [[ "$(uname -s 2>/dev/null)" == "Darwin" ]] && command -v perl >/dev/null 2>&1; then
  # macOS lacks the setsid binary but ships perl with POSIX module, which exposes
  # the same setsid(2) syscall. This creates a brand-new session so the server
  # survives agent-harness (Copilot CLI, etc.) session teardown on macOS.
  perl -e 'use POSIX "setsid"; setsid() or die; exec @ARGV' -- \
    env BRAINSTORM_DIR="$SESSION_DIR" BRAINSTORM_HOST="$BIND_HOST" BRAINSTORM_URL_HOST="$URL_HOST" BRAINSTORM_OWNER_PID="$OWNER_PID" node server.cjs > "$LOG_FILE" 2>&1 < /dev/null &
  SERVER_PID=$!
else
  nohup env BRAINSTORM_DIR="$SESSION_DIR" BRAINSTORM_HOST="$BIND_HOST" BRAINSTORM_URL_HOST="$URL_HOST" BRAINSTORM_OWNER_PID="$OWNER_PID" node server.cjs > "$LOG_FILE" 2>&1 < /dev/null &
  SERVER_PID=$!
  disown "$SERVER_PID" 2>/dev/null
fi
echo "$SERVER_PID" > "$PID_FILE"

# Wait for server-started message (check log file)
for i in {1..50}; do
  if grep -q "server-started" "$LOG_FILE" 2>/dev/null; then
    # The server writes its own authoritative pid to PID_FILE before printing
    # server-started, so by now PID_FILE names the real listener even if setsid
    # forked and changed what $! pointed at. Adopt it for the alive-check.
    if [[ -s "$PID_FILE" ]]; then SERVER_PID="$(cat "$PID_FILE")"; fi
    # Short liveness window to catch an immediate post-listen crash (e.g. the node
    # process dies right after binding). This does NOT guard against agent-harness
    # session reapers — those kill the server AFTER this bash call returns, so they
    # cannot be observed here; setsid (above) is what defends against them. A
    # half-second is ample for a self-crash, which happens in milliseconds.
    alive="true"
    for _ in {1..5}; do
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        alive="false"
        break
      fi
      sleep 0.1
    done
    if [[ "$alive" != "true" ]]; then
      echo "{\"error\": \"Server started but was killed. Retry in a persistent terminal with: $SCRIPT_DIR/start-server.sh${PROJECT_DIR:+ --project-dir $PROJECT_DIR} --host $BIND_HOST --url-host $URL_HOST --foreground\"}"
      exit 1
    fi
    grep "server-started" "$LOG_FILE" | head -1
    exit 0
  fi
  sleep 0.1
done

# Timeout - server didn't start
echo '{"error": "Server failed to start within 5 seconds"}'
exit 1
