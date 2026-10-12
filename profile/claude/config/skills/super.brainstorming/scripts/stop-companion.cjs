#!/usr/bin/env node
'use strict'

/**
 * stop-companion.cjs — close the visual companion once the design is on disk.
 *
 * Why this exists as its own script, when stop-server.sh already stops a server:
 *
 *   stop-server.sh takes a <session_dir> the model has to remember or re-derive from a
 *   launch that may have happened many turns earlier. A shutdown step whose first move
 *   is "go find the session directory" is a step that gets skipped — and the skipped
 *   version is silent, because nothing looks broken when a server keeps running.
 *   This resolves the live session itself, so the gate is ONE command with the same
 *   `--project-dir "$(git rev-parse --show-toplevel)"` every other companion call uses.
 *
 * Why shutting down matters more than tidiness:
 *
 *   The companion is an INPUT surface. Once the design is written, a click in a browser
 *   tab someone left open still travels the full path — WebSocket → journal → the
 *   agent's next state call — and lands as user intent in a phase where the decision it
 *   refers to has already been made and committed. Deleting the surface is the only
 *   thing that makes that impossible; a rule saying "ignore late clicks" is not
 *   enforceable by anything.
 *
 * Usage:
 *   node stop-companion.cjs --project-dir <repo-root>
 *   node stop-companion.cjs --session-dir <.superpowers/brainstorm/<session>>
 *
 * Output (stdout, always JSON — exit code is 0 except on usage error):
 *   {"stopped": true,  "sessionDir": "...", "pid": 4711, "screensKept": 3}
 *   {"stopped": false, "reason": "no-live-companion"}
 *
 * Verdict lives in `stopped`, NEVER in the exit code (repo-wide script contract).
 * Idempotent by construction: running it twice, or with no companion up, is a
 * successful no-op — so a gate can call it unconditionally without first asking
 * whether a companion was ever launched.
 */

const fs = require('fs')
const path = require('path')

const {
  parseArgs, isAlive, fail, findLiveSession, isLiveSession, listScreens,
} = require('./check-visual-state.cjs')

// SIGTERM lets server.cjs run its own shutdown (drains parked agent polls with a
// reason, writes the server-stopped marker). Only escalate when it does not go.
const TERM_GRACE_MS = 3000
const POLL_INTERVAL_MS = 100

function readPid(stateDir) {
  try {
    return parseInt(fs.readFileSync(path.join(stateDir, 'server.pid'), 'utf8').trim(), 10)
  } catch (e) {
    return NaN
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Mark the session closed even when the process was already gone. `isLiveSession`
 * needs this marker (plus a dead pid) to agree the companion is down, and
 * start-server.sh --reuse reads the same signal — without it a later turn could
 * re-attach to a session this gate just declared finished.
 */
function markStopped(stateDir, reason) {
  try {
    fs.writeFileSync(
      path.join(stateDir, 'server-stopped'),
      JSON.stringify({ reason, timestamp: Date.now() }) + '\n'
    )
  } catch (e) { /* state dir vanished — nothing left to mark */ }
  try {
    fs.rmSync(path.join(stateDir, 'server-info'), { force: true })
  } catch (e) { /* already gone */ }
}

async function stopSession(sessionDir) {
  const stateDir = path.join(sessionDir, 'state')
  const screenDir = path.join(sessionDir, 'content')
  const screensKept = listScreens(screenDir).filter((s) => !s.placeholder).length
  const pid = readPid(stateDir)

  if (!isAlive(pid)) {
    markStopped(stateDir, 'design-complete')
    return { stopped: true, sessionDir, pid: Number.isNaN(pid) ? null : pid, screensKept, alreadyDown: true }
  }

  let escalated = false
  try {
    process.kill(pid, 'SIGTERM')
  } catch (e) { /* raced with its own exit */ }

  const deadline = Date.now() + TERM_GRACE_MS
  while (Date.now() < deadline && isAlive(pid)) await sleep(POLL_INTERVAL_MS)

  if (isAlive(pid)) {
    // A hung server still holds the port and the WebSocket clients, which is exactly
    // the input surface this gate exists to remove.
    escalated = true
    try { process.kill(pid, 'SIGKILL') } catch (e) { /* gone between check and kill */ }
    const hardDeadline = Date.now() + TERM_GRACE_MS
    while (Date.now() < hardDeadline && isAlive(pid)) await sleep(POLL_INTERVAL_MS)
  }

  markStopped(stateDir, 'design-complete')
  return { stopped: !isAlive(pid), sessionDir, pid, screensKept, escalated }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write('Usage: stop-companion.cjs --project-dir <repo-root> | --session-dir <dir>\n')
    return
  }

  let sessionDir = null
  if (args['session-dir']) {
    sessionDir = isLiveSession(args['session-dir']) ? args['session-dir'] : null
    // An explicitly named session that is already down still gets its marker, so the
    // caller gets the same answer whether it ran once or three times.
    if (!sessionDir && fs.existsSync(path.join(args['session-dir'], 'state'))) {
      markStopped(path.join(args['session-dir'], 'state'), 'design-complete')
      process.stdout.write(JSON.stringify({ stopped: true, sessionDir: args['session-dir'], alreadyDown: true }) + '\n')
      return
    }
  } else if (args['project-dir']) {
    sessionDir = findLiveSession(args['project-dir'])
  } else {
    fail('one of --project-dir or --session-dir is required')
  }

  if (!sessionDir) {
    // Not an error: the companion may never have been offered, or was already closed.
    process.stdout.write(JSON.stringify({ stopped: false, reason: 'no-live-companion' }) + '\n')
    return
  }

  process.stdout.write(JSON.stringify(await stopSession(sessionDir)) + '\n')
}

if (require.main === module) {
  main().catch((err) => fail(err && err.message ? err.message : String(err)))
}

module.exports = { parseArgs, stopSession, markStopped, isAlive, TERM_GRACE_MS }
