'use strict';

/**
 * Detachment regression tests for start-server.sh (background mode).
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/
 *
 * Root cause these tests lock down:
 *   Agent harnesses (Copilot CLI, Codex, and similar) run each shell tool call
 *   in its own session/process-group and tear that session down when the call
 *   returns. A server started with `nohup ... & disown` stays in the SAME
 *   session as the launching shell, so the teardown reaps it — the server came
 *   up, reported success, then died the moment the bash call ended.
 *
 * The fix is `setsid`: the server becomes the leader of a brand-new session, so
 * the parent session's teardown can no longer reach it. The observable, machine-
 * checkable invariant of "is this process detached?" is exactly that:
 *
 *     the server's session id (SID) equals its own pid
 *
 * i.e. it leads its own session rather than sharing the launcher's. That is what
 * we assert here, plus that the launcher returns (does not block) and that the
 * pid file is authoritative (written by the server itself).
 *
 * Skipped when `setsid` is unavailable (e.g. Git Bash on Windows), where the
 * skill auto-foregrounds instead and this invariant does not apply.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPTS_DIR = path.resolve(__dirname, '..');
const START = path.join(SCRIPTS_DIR, 'start-server.sh');
const STOP = path.join(SCRIPTS_DIR, 'stop-server.sh');

const hasSetsid = spawnSync('bash', ['-c', 'command -v setsid'], { encoding: 'utf8' }).status === 0;

/** Read a process's session id, or null if the process is gone. */
function sessionId(pid) {
  const r = spawnSync('ps', ['-o', 'sid=', '-p', String(pid)], { encoding: 'utf8' });
  const sid = (r.stdout || '').trim();
  return sid ? Number.parseInt(sid, 10) : null;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

test('background launch detaches the server into its own session and survives the launcher', { skip: !hasSetsid }, () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-detach-'));
  let pid = null;
  let sessionDir = null;
  try {
    // --background forces the detached path even on harnesses that auto-foreground.
    const out = execFileSync('bash', [START, '--background', '--project-dir', projectDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const info = JSON.parse(out.trim().split(/\r?\n/u).filter(Boolean).pop());
    assert.equal(info.type, 'server-started', 'launcher reports a started server');
    sessionDir = path.dirname(info.state_dir);

    // The launcher returned (execFileSync did not hang) — background mode is non-blocking.
    const pidFile = path.join(info.state_dir, 'server.pid');
    assert.ok(fs.existsSync(pidFile), 'server.pid exists');
    pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    assert.ok(Number.isFinite(pid), 'server.pid holds a numeric pid');

    // The pid file is authoritative: it names the actual listening node process.
    assert.ok(isAlive(pid), 'the server named by server.pid is alive after the launcher exited');

    // Root-cause invariant: the server leads its OWN session (SID == PID), so a
    // teardown of the launcher's session cannot reap it. With the old nohup path
    // the SID would be the launcher shell's session instead.
    assert.equal(sessionId(pid), pid, 'server is a session leader (detached from the launcher)');
  } finally {
    if (sessionDir) {
      try { execFileSync('bash', [STOP, sessionDir], { stdio: 'ignore' }); } catch (e) { /* best effort */ }
    }
    if (pid && isAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already gone */ }
    }
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('stop-server.sh stops the detached server via its authoritative pid file', { skip: !hasSetsid }, () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-stop-'));
  let pid = null;
  try {
    const out = execFileSync('bash', [START, '--background', '--project-dir', projectDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const info = JSON.parse(out.trim().split(/\r?\n/u).filter(Boolean).pop());
    const sessionDir = path.dirname(info.state_dir);
    pid = Number.parseInt(fs.readFileSync(path.join(info.state_dir, 'server.pid'), 'utf8').trim(), 10);
    assert.ok(isAlive(pid), 'server is alive before stop');

    const stopOut = execFileSync('bash', [STOP, sessionDir], { encoding: 'utf8' });
    assert.match(stopOut, /"status":\s*"stopped"/u, 'stop-server reports stopped');

    // Give the OS a beat to reap, then confirm it is gone.
    spawnSync('bash', ['-c', 'sleep 0.3']);
    assert.equal(isAlive(pid), false, 'server process is gone after stop-server');
  } finally {
    if (pid && isAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already gone */ }
    }
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
