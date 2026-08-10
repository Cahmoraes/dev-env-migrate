'use strict';

/**
 * Tests for stop-companion.cjs — the gate that closes the companion once the design
 * is on disk.
 *
 * What actually has to hold, and why each is load-bearing:
 *
 *  1. **It really removes the input surface.** The point of the gate is that a click in
 *     a tab left open cannot reach the agent any more. A "stop" that leaves the port
 *     listening has done nothing, so the test asserts the socket is refused afterwards
 *     rather than trusting the reported verdict.
 *  2. **It is idempotent and never errors on "no companion".** A gate that only runs
 *     when a companion exists is a gate with a condition, and a condition is where a
 *     step gets skipped. Callers must be able to run it unconditionally.
 *  3. **A parked agent poll is released with a reason.** Shutting the server while an
 *     agent waits is the normal case at end-of-design, and the agent must learn WHY
 *     instead of reading a socket error.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const STOP_COMPANION = path.resolve(__dirname, '..', 'stop-companion.cjs');
const SERVER = path.resolve(__dirname, '..', 'server.cjs');
const { parseArgs, isAlive } = require('../stop-companion.cjs');
const { isLiveSession } = require('../check-visual-state.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-stop-'));
  const sessionDir = path.join(root, '.superpowers', 'brainstorm', 'session-1');
  fs.mkdirSync(path.join(sessionDir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'state'), { recursive: true });
  return { root, sessionDir, stateDir: path.join(sessionDir, 'state'), contentDir: path.join(sessionDir, 'content') };
}

async function bootCompanion(sessionDir) {
  const proc = spawn('node', [SERVER], {
    env: { ...process.env, BRAINSTORM_DIR: sessionDir, BRAINSTORM_HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const infoFile = path.join(sessionDir, 'state', 'server-info');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(infoFile)) {
      try { return { proc, info: JSON.parse(fs.readFileSync(infoFile, 'utf8').trim()) }; } catch (e) { /* half-written */ }
    }
    await sleep(20);
  }
  proc.kill('SIGKILL');
  throw new Error('server did not start');
}

function runStop(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [STOP_COMPANION, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('error', reject);
    proc.on('close', () => {
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (!line) { reject(new Error('no stdout. stderr: ' + err)); return; }
      try { resolve(JSON.parse(line)); } catch (e) { reject(new Error('bad JSON: ' + out)); }
    });
  });
}

/** Is anything still listening? This is the property the gate actually promises. */
function portRefused(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(true));
  });
}

test('a valueless flag does not swallow the next argument', () => {
  const args = parseArgs(['--help', '--project-dir', '/repo']);
  assert.equal(args.help, true);
  assert.equal(parseArgs(['--project-dir', '/repo'])['project-dir'], '/repo');
});

test('stopping actually removes the input surface, not just the verdict', async () => {
  const { root, sessionDir } = makeSession();
  const { proc, info } = await bootCompanion(sessionDir);
  try {
    assert.equal(await portRefused(info.port), false, 'precondition: the companion is reachable');

    const result = await runStop(['--project-dir', root]);
    assert.equal(result.stopped, true);
    assert.equal(result.sessionDir, sessionDir);

    // The whole point: a click in a tab left open can no longer reach anything.
    assert.equal(await portRefused(info.port), true, 'nothing is listening any more');
    assert.equal(isLiveSession(sessionDir), false, 'and the session reads as closed');
  } finally {
    proc.kill('SIGKILL');
  }
});

test('a parked agent poll is released with a reason, not a socket error', async () => {
  // End-of-design is exactly when an agent may be waiting on the browser. It has to
  // learn the companion closed, instead of surfacing ECONNRESET.
  const { root, sessionDir } = makeSession();
  const { proc, info } = await bootCompanion(sessionDir);
  try {
    const parked = new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: info.port, path: '/poll?since=0&timeout=20000' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
    });
    await sleep(250);

    await runStop(['--project-dir', root]);
    assert.equal((await parked).type, 'server-stopped');
  } finally {
    proc.kill('SIGKILL');
  }
});

test('no companion is a successful no-op, so the gate needs no condition', async () => {
  // A gate that must first ask "was a companion launched?" is a gate that gets skipped.
  const { root } = makeSession();
  fs.rmSync(path.join(root, '.superpowers'), { recursive: true, force: true });
  const result = await runStop(['--project-dir', root]);
  assert.equal(result.stopped, false);
  assert.equal(result.reason, 'no-live-companion');
  assert.equal(result.error, undefined, 'absence is not an error');
});

test('running it twice is safe', async () => {
  const { root, sessionDir } = makeSession();
  const { proc, info } = await bootCompanion(sessionDir);
  try {
    assert.equal((await runStop(['--project-dir', root])).stopped, true);
    const second = await runStop(['--project-dir', root]);
    assert.equal(second.error, undefined, 'the second run does not fail');
    assert.equal(await portRefused(info.port), true);
  } finally {
    proc.kill('SIGKILL');
  }
});

test('a session whose process already died is still marked closed', async () => {
  // Otherwise start-server.sh --reuse could re-attach to a session this gate declared
  // finished, quietly reopening the surface it just removed.
  const { sessionDir, stateDir } = makeSession();
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({ port: 1, host: '127.0.0.1' }) + '\n');
  fs.writeFileSync(path.join(stateDir, 'server.pid'), '999999999\n');

  const result = await runStop(['--session-dir', sessionDir]);
  assert.equal(result.stopped, true);
  assert.ok(fs.existsSync(path.join(stateDir, 'server-stopped')), 'the closed marker is written');
  assert.equal(fs.existsSync(path.join(stateDir, 'server-info')), false, 'and the live marker is gone');
});

test('screens are preserved, so stopping never destroys the mockups', async () => {
  // The gate must be cheap to accept. If stopping could lose approved screens, the
  // right move would be to keep the companion running — and the surface open.
  const { root, sessionDir, contentDir } = makeSession();
  fs.writeFileSync(path.join(contentDir, 'layout.html'), '<div data-choice="a">A</div>');
  fs.writeFileSync(path.join(contentDir, 'layout-v2.html'), '<div data-choice="b">B</div>');
  const { proc } = await bootCompanion(sessionDir);
  try {
    const result = await runStop(['--project-dir', root]);
    assert.equal(result.screensKept, 2);
    assert.ok(fs.existsSync(path.join(contentDir, 'layout-v2.html')), 'the screens survive');
  } finally {
    proc.kill('SIGKILL');
  }
});

test('isAlive rejects nonsense pids instead of throwing', () => {
  assert.equal(isAlive(0), false);
  assert.equal(isAlive(-1), false);
  assert.equal(isAlive(NaN), false);
  assert.equal(isAlive(process.pid), true);
});

test('a server that ignores SIGTERM is escalated, and still marked closed', async () => {
  // The graceful path is self-marking: server.cjs writes `server-stopped` during its
  // own shutdown. So this script's marker only carries weight when the server never
  // gets to run that code — a hung process killed with SIGKILL. Without covering the
  // escalation, removing the marker looks harmless and start-server.sh --reuse could
  // later re-attach to a session this gate declared finished, reopening the surface.
  const { sessionDir, stateDir } = makeSession();
  const stubborn = spawn('node', ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await sleep(300);
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({ port: 1, host: '127.0.0.1' }) + '\n');
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(stubborn.pid) + '\n');

  try {
    const result = await runStop(['--session-dir', sessionDir]);
    assert.equal(result.stopped, true);
    assert.equal(result.escalated, true, 'SIGTERM was ignored, so it escalated');
    assert.equal(isAlive(stubborn.pid), false, 'the process is really gone');
    assert.ok(
      fs.existsSync(path.join(stateDir, 'server-stopped')),
      'the marker is written by THIS script, since the server never ran its own shutdown'
    );
    assert.equal(isLiveSession(sessionDir), false);
  } finally {
    try { process.kill(stubborn.pid, 'SIGKILL'); } catch (e) { /* already dead */ }
  }
});
