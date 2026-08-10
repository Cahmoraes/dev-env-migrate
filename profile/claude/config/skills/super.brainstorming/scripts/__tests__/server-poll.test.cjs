'use strict';

/**
 * Tests for the server → agent long-poll bridge (`GET /poll`).
 *
 * Root cause these tests lock down:
 *   The companion had both other legs — agent → browser (file write → fs.watch →
 *   WebSocket `reload`) and browser → server (WebSocket frame → `state/events`) — but
 *   nothing carried a click back to the AGENT. A click only surfaced on the agent's
 *   next turn, and a turn only begins when the user types in the terminal. So the
 *   browser was an output device: clicking a mockup did literally nothing until the
 *   user ALSO said something.
 *
 * The load-bearing test is "a parked poll is resolved by a real browser click": it
 * exercises the whole chain (HTTP park → WebSocket frame → journal append → poll
 * resolve) rather than any one function, because every previous leg already worked in
 * isolation and the defect was that they were never connected.
 *
 * These spawn a real server.cjs. A hand-rolled masked WebSocket client stands in for
 * the browser, so the test speaks the same protocol the injected helper does instead
 * of reaching behind it to touch the journal directly (which would prove nothing about
 * the wake-up path).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.resolve(__dirname, '..', 'server.cjs');
const {
  clampPollTimeout, resolvePollSince,
  POLL_SLICE_CAP_MS, POLL_SLICE_MIN_MS, DEFAULT_POLL_TIMEOUT_MS,
} = require('../server.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForStarted(stateDir, timeoutMs = 5000) {
  const infoFile = path.join(stateDir, 'server-info');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(infoFile)) {
      try { return JSON.parse(fs.readFileSync(infoFile, 'utf8').trim()); } catch (e) { /* half-written */ }
    }
    await sleep(20);
  }
  throw new Error('server did not start within timeout');
}

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-poll-'));
  const sessionDir = path.join(root, '.superpowers', 'brainstorm', 'session-1');
  fs.mkdirSync(path.join(sessionDir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'state'), { recursive: true });
  return { root, sessionDir, stateDir: path.join(sessionDir, 'state'), contentDir: path.join(sessionDir, 'content') };
}

function spawnServer(sessionDir) {
  return spawn('node', [SERVER], {
    env: {
      ...process.env,
      BRAINSTORM_DIR: sessionDir,
      BRAINSTORM_HOST: '127.0.0.1',
      BRAINSTORM_LIFECYCLE_MS: '250',
      BRAINSTORM_AGENT_LEAVE_MS: '600',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

/**
 * Block until the journal holds `n` lines. Waiting on the file rather than sleeping a
 * fixed amount keeps a slow scheduler from flaking a test whose subject is the poll.
 */
async function waitForJournal(stateDir, n, timeoutMs = 3000) {
  const file = path.join(stateDir, 'events');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length >= n) return;
    } catch (e) { /* not written yet */ }
    await sleep(20);
  }
  throw new Error(`journal never reached ${n} lines`);
}

/** GET /poll, resolving to the parsed JSON body (or the status code on non-200). */
function poll(port, query, { socketTimeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/poll${query}` }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve({ statusCode: res.statusCode }); return; }
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('bad JSON: ' + body)); }
      });
    });
    req.setTimeout(socketTimeoutMs, () => req.destroy(new Error('socket timeout')));
    req.on('error', reject);
    req.end();
  });
}

// ---- Minimal browser stand-in: a masked RFC 6455 client -----------------------

/** Client → server frames MUST be masked (the server rejects unmasked ones). */
function maskedTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  }
  header[0] = 0x80 | 0x01;
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

/** Decode unmasked server → client TEXT frames out of a buffer. */
function drainServerFrames(buffer) {
  const out = [];
  let buf = buffer;
  while (buf.length >= 2) {
    const opcode = buf[0] & 0x0f;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
    if (buf.length < offset + len) break;
    if (opcode === 0x01) out.push(buf.slice(offset, offset + len).toString('utf8'));
    buf = buf.slice(offset + len);
  }
  return { messages: out, rest: buf };
}

function connectBrowser(port) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(
        'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\n' +
        'Connection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    const received = [];
    let buf = Buffer.alloc(0);
    let handshakeDone = false;
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        const end = buf.indexOf('\r\n\r\n');
        if (end === -1) return;
        handshakeDone = true;
        buf = buf.slice(end + 4);
        resolve({
          send: (obj) => socket.write(maskedTextFrame(JSON.stringify(obj))),
          messages: received,
          close: () => socket.destroy(),
        });
      }
      const { messages, rest } = drainServerFrames(buf);
      buf = rest;
      for (const m of messages) received.push(JSON.parse(m));
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => reject(new Error('browser socket timeout')));
  });
}

/** Boot a server + a connected browser, and guarantee teardown. */
async function withCompanion(fn) {
  const session = makeSession();
  const proc = spawnServer(session.sessionDir);
  try {
    const info = await waitForStarted(session.stateDir);
    const browser = await connectBrowser(info.port);
    try {
      await fn({ ...session, info, port: info.port, browser, proc });
    } finally {
      browser.close();
    }
  } finally {
    proc.kill('SIGTERM');
  }
}

const CLICK_B = { type: 'click', choice: 'b', text: 'Option B', selected: true, selectedChoices: ['b'] };

// ---- Pure helpers -------------------------------------------------------------

test('clampPollTimeout keeps every slice inside the HTTP-safe window', () => {
  assert.equal(clampPollTimeout('5000'), 5000);
  // Capped below Node's 300s server.requestTimeout so the HTTP layer never aborts a
  // parked poll mid-flight; longer waits are the client's job to synthesize.
  assert.equal(clampPollTimeout(String(10 * 60 * 1000)), POLL_SLICE_CAP_MS);
  assert.equal(clampPollTimeout('10'), POLL_SLICE_MIN_MS);
  assert.equal(clampPollTimeout('not-a-number'), DEFAULT_POLL_TIMEOUT_MS);
  assert.equal(clampPollTimeout(null), DEFAULT_POLL_TIMEOUT_MS);
});

test('resolvePollSince accepts an explicit anchor and rejects a negative one', () => {
  assert.equal(resolvePollSince('4'), 4);
  assert.equal(resolvePollSince('0'), 0);
  // Garbage and negatives fall back to "from now on", never to 0 — replaying a
  // decision the agent already consumed would answer a question nobody asked.
  assert.equal(typeof resolvePollSince('-1'), 'number');
  assert.equal(typeof resolvePollSince(undefined), 'number');
});

// ---- The bridge ---------------------------------------------------------------

test('a parked poll is resolved by a real browser click', async () => {
  await withCompanion(async ({ port, browser }) => {
    const pending = poll(port, '?since=0&timeout=15000');
    await sleep(150); // let the poll park before the click lands

    browser.send(CLICK_B);

    const event = await pending;
    assert.equal(event.type, 'selection');
    assert.equal(event.seq, 1);
    assert.deepEqual(event.finalSelection, ['b']);
    assert.deepEqual(event.path, ['b']);
  });
});

test('a click that already landed answers the next poll immediately', async () => {
  await withCompanion(async ({ port, browser, stateDir }) => {
    browser.send(CLICK_B);
    // Wait for the journal, not a fixed sleep: the assertion is about the poll, and a
    // slow scheduler should widen the window rather than flake the test.
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !fs.existsSync(path.join(stateDir, 'events'))) await sleep(20);

    const started = Date.now();
    const event = await poll(port, '?since=0&timeout=15000');
    assert.equal(event.type, 'selection');
    assert.ok(Date.now() - started < 2000, 'answered without parking');
  });
});

test('omitting since anchors on the current journal, so old clicks are not replayed', async () => {
  await withCompanion(async ({ port, browser, stateDir }) => {
    browser.send(CLICK_B);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !fs.existsSync(path.join(stateDir, 'events'))) await sleep(20);

    // No `since`: the already-consumed click must NOT come back.
    const event = await poll(port, '?timeout=1200');
    assert.equal(event.type, 'timeout');
  });
});

test('a poll with nothing to report times out with a verdict, not an error', async () => {
  await withCompanion(async ({ port }) => {
    const event = await poll(port, '?since=0&timeout=1200');
    assert.equal(event.type, 'timeout');
    assert.equal(event.seq, 0);
    assert.equal(event.waitedMs, 1200);
  });
});

test('the browser is told when an agent starts and stops listening', async () => {
  await withCompanion(async ({ port, browser }) => {
    // Connect-time sync: without a parked poll the browser must learn it is alone.
    await sleep(200);
    const first = browser.messages.filter((m) => m.type === 'agent-waiting');
    assert.ok(first.length >= 1, 'agent-waiting sent on connect');
    assert.equal(first[0].waiting, false);

    const pending = poll(port, '?since=0&timeout=1200');
    await sleep(250);
    assert.ok(
      browser.messages.some((m) => m.type === 'agent-waiting' && m.waiting === true),
      'browser learns an agent parked a poll'
    );

    await pending; // times out
    await sleep(1200); // outlast the leave-debounce (see the flicker test below)
    const last = browser.messages.filter((m) => m.type === 'agent-waiting').pop();
    assert.equal(last.waiting, false, 'browser learns the agent stopped listening');
  });
});

test('a new screen re-anchors parked polls instead of stranding them', async () => {
  await withCompanion(async ({ port, browser, contentDir, stateDir }) => {
    // Consume one click so the journal (and the agent's `since`) is at 1.
    browser.send(CLICK_B);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !fs.existsSync(path.join(stateDir, 'events'))) await sleep(20);
    assert.equal((await poll(port, '?since=0&timeout=5000')).seq, 1);

    const pending = poll(port, '?since=1&timeout=15000');
    await sleep(150);

    // A new screen truncates the journal back to zero. Without re-anchoring, a poll
    // parked at since=1 waits for a count that can never be reached again.
    fs.writeFileSync(path.join(contentDir, 'next-screen.html'), '<div data-choice="a">A</div>');
    await sleep(400);
    browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });

    const event = await pending;
    assert.equal(event.type, 'selection');
    assert.deepEqual(event.finalSelection, ['a']);
  });
});

test('a poll opened AFTER a new screen is re-anchored, so the first Send is not swallowed', async () => {
  // Reproduces a measured failure, twice in one session. `rebasePolls()` above only
  // rescues polls ALREADY parked when the journal is truncated. The agent's real loop
  // does not look like that: it wakes, renders the next screen (which truncates), and
  // only THEN re-parks — with the `--since N` its own `_instructions` handed it. That
  // cursor is now past the end of a journal that restarted at zero, so the poll waits
  // for a count it can only reach by the user clicking MORE times than the old screen
  // had events. The user pressed Send, the browser said "Sent ✓", and nothing happened
  // until they clicked the option again.
  await withCompanion(async ({ port, browser, contentDir, stateDir }) => {
    // Screen 1, answered in full: one click plus the Send that confirmed it.
    browser.send(CLICK_B);
    browser.send({ type: 'submit', choice: 'b', selectedChoices: ['b'] });
    await waitForJournal(stateDir, 2);
    assert.equal((await poll(port, '?since=0&timeout=5000')).seq, 2);

    fs.writeFileSync(path.join(contentDir, 'screen-2.html'), '<div data-choice="a">A</div>');
    await sleep(400);
    assert.equal(fs.existsSync(path.join(stateDir, 'events')), false, 'a new screen truncates the journal');

    // The agent re-parks with the seq it just consumed — exactly what it is told to do.
    // Everything the user does on screen 2 now lands BELOW that cursor.
    const first = await (async () => {
      const pending = poll(port, '?since=2&timeout=6000');
      await sleep(150);
      browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });
      return pending;
    })();
    assert.equal(first.type, 'selection', 'the cursor was re-anchored, not stranded above the journal');
    assert.equal(first.seq, 1, 'the count restarted at zero with the new screen');

    // And the Send that follows is reported on its own, instead of being the event that
    // merely nudges a stale counter past the old high-water mark.
    const second = await (async () => {
      const pending = poll(port, `?since=${first.seq}&timeout=6000`);
      await sleep(150);
      browser.send({ type: 'submit', choice: 'a', selectedChoices: ['a'] });
      return pending;
    })();
    assert.equal(second.type, 'selection');
    assert.equal(second.submits, 1, 'the Send is what ended this wait');
    assert.deepEqual(second.finalSelection, ['a']);
  });
});

test('shutdown releases parked polls with a reason the agent can act on', async () => {
  const session = makeSession();
  const proc = spawnServer(session.sessionDir);
  try {
    const info = await waitForStarted(session.stateDir);
    const pending = poll(info.port, '?since=0&timeout=20000');
    await sleep(200);
    proc.kill('SIGTERM');
    const event = await pending;
    // Not a socket error: `server.close()` waits on in-flight requests, so a parked
    // poll would otherwise hang the shutdown until its own timeout fired.
    assert.equal(event.type, 'server-stopped');
  } finally {
    proc.kill('SIGKILL');
  }
});

test('unknown routes still 404, which is what the client fallback detects', async () => {
  await withCompanion(async ({ port }) => {
    // `--reuse` keeps servers alive across skill updates, so wait-for-user.cjs must be
    // able to recognize a server that predates /poll. A 404 is that signal.
    const res = await poll(port, '-not-a-route');
    assert.equal(res.statusCode, 404);
  });
});

test('the listening indicator does not flicker while the agent absorbs a click burst', async () => {
  await withCompanion(async ({ port, browser }) => {
    // Reproduces the defect the end-to-end simulation exposed and no unit test could:
    // every individual transition was correct, but the SEQUENCE flipped the browser
    // indicator false → true under the user's cursor on each click. A user comparing
    // options hesitates (a → b → a), and that is exactly when they are reading it.
    await sleep(200);
    const before = browser.messages.filter((m) => m.type === 'agent-waiting').length;

    let since = 0;
    for (const choice of ['a', 'b', 'a']) {
      const pending = poll(port, `?since=${since}&timeout=8000`);
      await sleep(120);
      browser.send({ type: 'click', choice, selected: true, selectedChoices: [choice] });
      since = (await pending).seq;   // resolve and immediately re-park, as settle does
    }
    await sleep(200);

    const during = browser.messages.filter((m) => m.type === 'agent-waiting').slice(before);
    assert.equal(
      during.filter((m) => m.waiting === false).length, 0,
      'no departure is announced while the agent keeps re-parking: ' + JSON.stringify(during)
    );

    // The debounce must still SETTLE, not swallow the departure forever.
    await sleep(1200);
    const last = browser.messages.filter((m) => m.type === 'agent-waiting').pop();
    assert.equal(last.waiting, false, 'departure still lands once the agent really stops');
  });
});
