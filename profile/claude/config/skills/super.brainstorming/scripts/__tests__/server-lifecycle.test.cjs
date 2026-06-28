'use strict';

/**
 * Lifecycle regression tests for the brainstorm visual-companion server.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/
 *
 * Root cause these tests lock down:
 *   The server watches BRAINSTORM_OWNER_PID and used to call
 *   shutdown('owner process exited') the moment that pid disappeared. In agent
 *   harnesses (Claude Code / Copilot / Codex on WSL, SSH, containers) the
 *   resolved owner is an EPHEMERAL per-tool-call process that dies BETWEEN turns
 *   while the user is still actively using the server. The startup guard only
 *   covered the owner being dead at boot — an owner that died mid-session still
 *   killed an in-use server, which surfaced as "the modal froze / stopped
 *   updating and the URL stopped responding".
 *
 * The fix: a runtime owner death disables owner monitoring and falls back to the
 * idle timeout instead of shutting the server down. These tests assert:
 *   1. Owner death mid-session does NOT stop the server (the regression).
 *   2. The idle-timeout fallback still stops an abandoned server.
 *
 * Both run server.cjs directly with a fast lifecycle clock (BRAINSTORM_LIFECYCLE_MS)
 * so they finish in well under a second instead of waiting real minutes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.resolve(__dirname, '..', 'server.cjs');

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `predicate` until it returns true, or the deadline passes. Returns the
 *  final predicate value. Used instead of a fixed sleep so a slow scheduler
 *  (parallel test load) widens the window rather than flaking the assertion. */
async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  return predicate();
}

/** Wait until the server has written server-info (it is listening), or throw. */
async function waitForStarted(stateDir, timeoutMs = 4000) {
  const infoFile = path.join(stateDir, 'server-info');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(infoFile)) return JSON.parse(fs.readFileSync(infoFile, 'utf8').trim());
    await sleep(25);
  }
  throw new Error('server did not start within timeout');
}

/** Spawn server.cjs directly with a controlled environment. */
function spawnServer(sessionDir, env) {
  fs.mkdirSync(path.join(sessionDir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'state'), { recursive: true });
  return spawn('node', [SERVER], {
    env: {
      ...process.env,
      BRAINSTORM_DIR: sessionDir,
      BRAINSTORM_HOST: '127.0.0.1',
      BRAINSTORM_LIFECYCLE_MS: '120', // fast lifecycle clock for the test
      ...env,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

test('owner death mid-session does NOT stop an in-use server', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-life-'));
  // A throwaway "owner" we can kill on demand to simulate the harness tearing
  // down the ephemeral per-tool-call process between turns.
  const owner = spawn('sleep', ['30']);
  let server = null;
  try {
    server = spawnServer(sessionDir, {
      BRAINSTORM_OWNER_PID: String(owner.pid),
      BRAINSTORM_IDLE_TIMEOUT_MS: String(10 * 60 * 1000), // never idle-out during the test
    });
    const info = await waitForStarted(path.join(sessionDir, 'state'));
    const serverPid = info ? Number(fs.readFileSync(path.join(sessionDir, 'state', 'server.pid'), 'utf8').trim()) : null;
    assert.ok(isAlive(serverPid), 'server is alive after startup');

    // The harness reaps the ephemeral owner mid-session.
    owner.kill('SIGKILL');

    // Let several lifecycle ticks elapse (interval is 120ms).
    await sleep(700);

    // Regression: the server must still be alive and must NOT have written a
    // server-stopped marker with the owner-exit reason.
    assert.ok(isAlive(serverPid), 'server survives the owner dying mid-session');
    const stoppedFile = path.join(sessionDir, 'state', 'server-stopped');
    assert.equal(fs.existsSync(stoppedFile), false, 'no server-stopped written on owner death');
  } finally {
    if (server && server.pid && isAlive(server.pid)) server.kill('SIGKILL');
    if (owner.pid && isAlive(owner.pid)) owner.kill('SIGKILL');
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('idle timeout still stops an abandoned server (fallback intact)', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-idle-'));
  let server = null;
  try {
    // No owner pid → monitoring disabled; rely entirely on the idle timeout.
    server = spawnServer(sessionDir, {
      BRAINSTORM_IDLE_TIMEOUT_MS: '150', // idle out almost immediately
    });
    const info = await waitForStarted(path.join(sessionDir, 'state'));
    const serverPid = info ? Number(fs.readFileSync(path.join(sessionDir, 'state', 'server.pid'), 'utf8').trim()) : null;
    assert.ok(serverPid, 'server reported a pid');

    // Poll for shutdown instead of a fixed sleep: under parallel test load the
    // idle-out + marker write can take longer than any single guessed delay, which
    // is exactly what flaked here. The condition resolves in ~250ms normally.
    const stoppedFile = path.join(sessionDir, 'state', 'server-stopped');
    await waitUntil(() => !isAlive(serverPid) && fs.existsSync(stoppedFile), 8000);

    assert.equal(isAlive(serverPid), false, 'server shut down via idle timeout');
    const stopped = JSON.parse(fs.readFileSync(stoppedFile, 'utf8').trim());
    assert.equal(stopped.reason, 'idle timeout', 'shutdown reason is the idle timeout');
  } finally {
    if (server && server.pid && isAlive(server.pid)) server.kill('SIGKILL');
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});
