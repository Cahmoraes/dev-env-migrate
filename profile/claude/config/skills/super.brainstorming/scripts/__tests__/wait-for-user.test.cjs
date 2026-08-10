'use strict';

/**
 * Tests for wait-for-user.cjs — the agent's side of the browser → agent bridge.
 *
 * Two properties carry the weight here, and neither is about the happy path:
 *
 *  1. **It must work when the long poll does not.** `--reuse` deliberately keeps
 *     companion servers alive across skill updates, so the agent will meet a server
 *     that predates `/poll` and answers 404. The journal-watch fallback is not a
 *     nicety; it is the path that keeps the skill working the day it ships. It is also
 *     the OS-portability guarantee: `fs.watchFile` stat-polls instead of relying on
 *     inotify/FSEvents/ReadDirectoryChangesW, which behave differently per platform and
 *     are unreliable on WSL mounts and network shares.
 *
 *  2. **The answer must be self-describing.** `_instructions` carries the authoritative
 *     next step with the real seq substituted, so the prose reference stays lean and
 *     cannot drift from what the script does. The selection case must always restate
 *     the finalSelection-vs-path footgun, because that is the one mistake that silently
 *     produces a confidently wrong answer.
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

const WAIT_FOR_USER = path.resolve(__dirname, '..', 'wait-for-user.cjs');
const SERVER = path.resolve(__dirname, '..', 'server.cjs');
const {
  parseArgs, connectHost, watchJournal, instructionsFor,
} = require('../wait-for-user.cjs');
const { readEvents } = require('../check-visual-state.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-wait-'));
  const sessionDir = path.join(root, '.superpowers', 'brainstorm', 'session-1');
  fs.mkdirSync(path.join(sessionDir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'state'), { recursive: true });
  return { root, sessionDir, stateDir: path.join(sessionDir, 'state'), contentDir: path.join(sessionDir, 'content') };
}

function appendClick(stateDir, choice, selectedChoices) {
  fs.appendFileSync(
    path.join(stateDir, 'events'),
    JSON.stringify({ type: 'click', choice, selected: true, selectedChoices }) + '\n'
  );
}

/** Run the CLI and resolve with its parsed stdout once it exits. */
function runWait(args, { onReady } = {}) {
  const proc = spawn('node', [WAIT_FOR_USER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (c) => { stdout += c; });
  proc.stderr.on('data', (c) => { stderr += c; });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', () => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) { reject(new Error('no stdout. stderr: ' + stderr)); return; }
      try { resolve(JSON.parse(line)); } catch (e) { reject(new Error('bad JSON: ' + stdout)); }
    });
  });
  if (onReady) onReady(proc);
  return done;
}

// ---- Argument and address handling -------------------------------------------

test('a valueless flag does not swallow the next argument', () => {
  // Same footgun check-visual-state.cjs carries: `--foo --project-dir X` must not
  // bind "--project-dir" as --foo's value and orphan X.
  const args = parseArgs(['--help', '--project-dir', '/repo']);
  assert.equal(args.help, true);
  const args2 = parseArgs(['--project-dir', '/repo', '--since', '3']);
  assert.equal(args2['project-dir'], '/repo');
  assert.equal(args2.since, '3');
});

test('connectHost dials a reachable address, never a bind wildcard', () => {
  // The documented remote/container setup binds 0.0.0.0 and advertises it in
  // server-info. That is a bind address, not a destination: dialing it fails on
  // Windows and on some Linux stacks.
  assert.equal(connectHost({ host: '0.0.0.0' }), '127.0.0.1');
  assert.equal(connectHost({ host: '::' }), '127.0.0.1');
  assert.equal(connectHost({}), '127.0.0.1');
  assert.equal(connectHost({ host: '192.168.1.10' }), '192.168.1.10');
});

// ---- Self-describing answers --------------------------------------------------

test('a selection instruction restates the finalSelection footgun and how to wait again', () => {
  const text = instructionsFor(
    { type: 'selection', seq: 3, finalSelection: ['b'], path: ['a', 'b', 'b'], renderDebt: false },
    { selfPath: '/skills/wait-for-user.cjs', projectDir: '/repo' }
  );
  assert.match(text, /finalSelection/);
  assert.match(text, /DESELECT/i, 'names the deselection trap explicitly');
  assert.match(text, /--since 3/, 'hands back a runnable command anchored at the consumed seq');
});

// Comparing options and changing your mind is how the screen is MEANT to be used — the
// Send button exists so that exploration costs nothing. An instruction that replays the
// trail invites the agent to interrogate the user about it, which charges them a question
// for having thought. The trail stays in `path` for debugging; it never becomes prose.
test('exploring before confirming is never quoted back or turned into a question', () => {
  const text = instructionsFor(
    { type: 'selection', seq: 4, submitted: true, finalSelection: ['a'], path: ['a', 'b', 'c', 'b', 'a'], renderDebt: false },
    { selfPath: '/skills/wait-for-user.cjs', projectDir: '/repo' }
  );
  assert.doesNotMatch(text, /a → b → c/, 'does not replay the click trail into the answer');
  assert.doesNotMatch(text, /hesitat/i, 'does not frame exploration as hesitation');
  assert.match(text, /not a signal/i, 'names exploration as normal use, not evidence');
  assert.match(text, /confirmed selection alone/i, 'says positively what to act on');
});

test('a render debt in the answer changes the instruction, not just the data', () => {
  const withDebt = instructionsFor(
    { type: 'selection', seq: 1, finalSelection: ['a'], path: ['a'], renderDebt: true },
    { selfPath: '/s.cjs', projectDir: '/repo' }
  );
  assert.match(withDebt, /owe a render/);
  const withoutDebt = instructionsFor(
    { type: 'selection', seq: 1, finalSelection: ['a'], path: ['a'], renderDebt: false },
    { selfPath: '/s.cjs', projectDir: '/repo' }
  );
  assert.doesNotMatch(withoutDebt, /owe a render/);
});

test('a timeout instruction forbids blind re-waiting', () => {
  // The failure mode is an agent that re-parks forever while the user is typing in
  // the terminal, burning the whole session on a poll nobody will answer.
  const text = instructionsFor({ type: 'timeout', seq: 0 }, { selfPath: '/s.cjs', projectDir: '/repo' });
  assert.match(text, /Do NOT immediately wait again/);
});

test('no-server and server-stopped instructions both demand a re-render, not silence', () => {
  const none = instructionsFor({ type: 'no-server' }, { selfPath: '/s.cjs', projectDir: '/repo' });
  assert.match(none, /start-server\.sh/);
  assert.match(none, /SAME turn/);
  const stopped = instructionsFor({ type: 'server-stopped', seq: 2 }, { selfPath: '/s.cjs', projectDir: '/repo' });
  assert.match(stopped, /relaunch/i);
  assert.match(stopped, /re-render/i);
});

// ---- The portable fallback ----------------------------------------------------

test('the journal watch notices an append', async () => {
  const { stateDir } = makeSession();
  const pending = watchJournal({ stateDir, since: 0, timeoutMs: 8000 });
  await sleep(100);
  appendClick(stateDir, 'b', ['b']);
  const result = await pending;
  assert.equal(result.type, 'selection');
  assert.equal(result.seq, 1);
  assert.deepEqual(result.finalSelection, ['b']);
});

test('the journal watch re-anchors when a new screen truncates the journal', async () => {
  const { stateDir } = makeSession();
  appendClick(stateDir, 'a', ['a']);
  appendClick(stateDir, 'b', ['b']);

  const pending = watchJournal({ stateDir, since: 2, timeoutMs: 8000 });
  await sleep(100);
  // A new screen deletes the journal. Watching for a count above 2 would wait
  // forever, because the counter restarts at zero.
  fs.unlinkSync(path.join(stateDir, 'events'));
  await sleep(100);
  appendClick(stateDir, 'c', ['c']);

  const result = await pending;
  assert.equal(result.type, 'selection');
  assert.deepEqual(result.finalSelection, ['c']);
});

test('the journal watch times out with a verdict', async () => {
  const { stateDir } = makeSession();
  const result = await watchJournal({ stateDir, since: 0, timeoutMs: 600 });
  assert.equal(result.type, 'timeout');
  assert.equal(result.waitedMs, 600);
});

test('a server without /poll falls back to the journal watch instead of failing', async () => {
  const { root, sessionDir, stateDir } = makeSession();
  // Stand-in for a companion started before this feature shipped: alive, serving, but
  // 404 on /poll. `--reuse` guarantees the agent will meet one of these.
  const legacy = http.createServer((req, res) => { res.writeHead(404); res.end('Not found'); });
  await new Promise((r) => legacy.listen(0, '127.0.0.1', r));
  const port = legacy.address().port;
  fs.writeFileSync(
    path.join(stateDir, 'server-info'),
    JSON.stringify({ type: 'server-started', port, host: '127.0.0.1', url: `http://localhost:${port}` }) + '\n'
  );
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid) + '\n');

  try {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '8000', '--settle-ms', '200', '--on', 'any']);
    await sleep(700);
    appendClick(stateDir, 'b', ['b']);
    const result = await pending;
    assert.equal(result.type, 'selection');
    assert.deepEqual(result.finalSelection, ['b']);
  } finally {
    legacy.close();
  }
});

test('no live companion is reported as a verdict with a launch instruction', async () => {
  const { root } = makeSession();
  fs.rmSync(path.join(root, '.superpowers'), { recursive: true, force: true });
  const result = await runWait(['--project-dir', root, '--timeout-ms', '3000']);
  assert.equal(result.type, 'no-server');
  assert.match(result._instructions, /start-server\.sh/);
});

// ---- End to end: a click in the browser wakes the CLI --------------------------

/** Client → server WebSocket frames must be masked. */
function maskedTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const header = Buffer.alloc(2);
  header[0] = 0x80 | 0x01;
  header[1] = 0x80 | payload.length;
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
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
    let handshakeDone = false;
    socket.on('data', () => {
      if (handshakeDone) return;
      handshakeDone = true;
      resolve({
        send: (obj) => socket.write(maskedTextFrame(JSON.stringify(obj))),
        close: () => socket.destroy(),
      });
    });
    socket.on('error', reject);
  });
}

async function withLiveCompanion(fn) {
  const session = makeSession();
  const proc = spawn('node', [SERVER], {
    env: { ...process.env, BRAINSTORM_DIR: session.sessionDir, BRAINSTORM_HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  try {
    const infoFile = path.join(session.stateDir, 'server-info');
    const deadline = Date.now() + 5000;
    let info = null;
    while (Date.now() < deadline && !info) {
      if (fs.existsSync(infoFile)) {
        try { info = JSON.parse(fs.readFileSync(infoFile, 'utf8').trim()); } catch (e) { /* half-written */ }
      }
      if (!info) await sleep(20);
    }
    if (!info) throw new Error('server did not start');
    const browser = await connectBrowser(info.port);
    try { await fn({ ...session, info, browser }); } finally { browser.close(); }
  } finally {
    proc.kill('SIGKILL');
  }
}

test('--on any: a browser click wakes the waiting CLI with the consolidated companion state', async () => {
  await withLiveCompanion(async ({ root, browser }) => {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '20000', '--settle-ms', '300', '--on', 'any']);
    await sleep(900); // let the CLI resolve the session and park its poll
    browser.send({ type: 'click', choice: 'b', selected: true, selectedChoices: ['b'] });

    const result = await pending;
    assert.equal(result.type, 'selection');
    assert.deepEqual(result.finalSelection, ['b']);
    // Consolidation: the agent wakes up already knowing where to write and whether it
    // owes a render, instead of paying a second round trip to check-visual-state.
    assert.ok(result.screenDir, 'screenDir rides along');
    assert.ok(result.url, 'url rides along');
    assert.equal(typeof result.renderDebt, 'boolean');
    assert.match(result._instructions, /finalSelection/);
  });
});

test('--on any: a burst of clicks settles into ONE wake carrying the whole path', async () => {
  await withLiveCompanion(async ({ root, browser }) => {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '20000', '--settle-ms', '900', '--on', 'any']);
    await sleep(900);

    // A user comparing options clicks a → b → b. Waking three times would pay three
    // turns to watch someone think, and each wake would report a partial answer.
    browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });
    await sleep(150);
    browser.send({ type: 'click', choice: 'b', selected: true, selectedChoices: ['b'] });
    await sleep(150);
    browser.send({ type: 'click', choice: 'b', selected: false, selectedChoices: [] });

    const result = await pending;
    assert.equal(result.type, 'selection');
    assert.equal(result.seq, 3, 'all three clicks are in the single answer');
    assert.deepEqual(result.path, ['a', 'b', 'b'], 'the hesitation survives');
    // The last click DESELECTED b. Reading the last `choice` would report "b"; the
    // truth is that nothing is selected.
    assert.deepEqual(result.finalSelection, []);
  });
});

// ---- Submit: the user COMMITS, instead of every click being an answer ----------

const { satisfies } = require('../wait-for-user.cjs');

function appendSubmit(stateDir, choices) {
  fs.appendFileSync(
    path.join(stateDir, 'events'),
    JSON.stringify({ type: 'submit', choice: choices[0], selectedChoices: choices }) + '\n'
  );
}

test('a click alone does not end a submit-mode wait', () => {
  // The whole point: a misclick must not become a decision nobody made.
  const clickOnly = { type: 'selection', seq: 1, submits: 0 };
  assert.equal(satisfies(clickOnly, { on: 'submit', submitsAtStart: 0 }), false);
  assert.equal(satisfies(clickOnly, { on: 'any', submitsAtStart: 0 }), true);
});

test('a submit that predates the wait is history, not an answer to this question', () => {
  // Otherwise the agent instantly "answers" the question it already handled last turn.
  const stale = { type: 'selection', seq: 4, submits: 1 };
  assert.equal(satisfies(stale, { on: 'submit', submitsAtStart: 1 }), false);
  assert.equal(satisfies({ ...stale, submits: 2 }, { on: 'submit', submitsAtStart: 1 }), true);
});

test('a truncated journal re-baselines instead of deadlocking the wait', () => {
  // A new screen resets the counter to 0. Comparing against the old baseline would
  // require a submit count that can never be reached again.
  const afterReset = { type: 'selection', seq: 1, submits: 1 };
  assert.equal(satisfies(afterReset, { on: 'submit', submitsAtStart: 5 }), true);
});

test('non-selection verdicts always end the wait', () => {
  for (const type of ['timeout', 'server-stopped', 'no-server']) {
    assert.equal(satisfies({ type }, { on: 'submit', submitsAtStart: 0 }), true, type);
  }
});

test('the digest treats the submit as the answer and keeps clicks as the trail', () => {
  const { stateDir } = makeSession();
  appendClick(stateDir, 'a', ['a']);
  appendClick(stateDir, 'b', ['b']);
  appendSubmit(stateDir, ['b']);
  // Exploration continues after confirming — it must NOT overwrite the committed answer.
  appendClick(stateDir, 'a', ['a']);

  const digest = readEvents(stateDir);
  assert.deepEqual(digest.finalSelection, ['b'], 'the confirmed answer wins over later clicks');
  assert.deepEqual(digest.path, ['a', 'b', 'a'], 'the submit is not a phantom click in the trail');
  assert.equal(digest.submitted, true);
  assert.equal(digest.submits, 1);
});

test('multi-select survives the round trip as a set, not a first-wins scalar', () => {
  const { stateDir } = makeSession();
  appendSubmit(stateDir, ['a', 'c']);
  const digest = readEvents(stateDir);
  assert.deepEqual(digest.finalSelection, ['a', 'c']);
});

test('a submit instruction says CONFIRMED; a bare click warns it is not an answer', () => {
  const confirmed = instructionsFor(
    { type: 'selection', seq: 3, finalSelection: ['a', 'c'], path: ['a', 'c'], submitted: true, submits: 1 },
    { selfPath: '/s.cjs', projectDir: '/repo' }
  );
  assert.match(confirmed, /CONFIRMED/);
  assert.match(confirmed, /2 options at once/, 'multi-select is called out so it is not truncated to the first');
  assert.doesNotMatch(confirmed, /not an answer/);

  const unconfirmed = instructionsFor(
    { type: 'selection', seq: 1, finalSelection: ['a'], path: ['a'], submitted: false },
    { selfPath: '/s.cjs', projectDir: '/repo' }
  );
  assert.match(unconfirmed, /NOT confirmed/);
  assert.match(unconfirmed, /do not act on it as a decision/);
});

test('end to end: clicks do not wake the agent, pressing Send does', async () => {
  await withLiveCompanion(async ({ root, browser }) => {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '20000']);
    await sleep(900);

    // The user explores — and changes their mind. None of this may wake the agent.
    browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });
    await sleep(200);
    browser.send({ type: 'click', choice: 'b', selected: true, selectedChoices: ['b'] });
    await sleep(1500); // well past the settle window that used to end the wait here

    const raced = await Promise.race([pending, sleep(300).then(() => 'still-waiting')]);
    assert.equal(raced, 'still-waiting', 'exploration alone must not be treated as an answer');

    browser.send({ type: 'submit', choice: 'b', selectedChoices: ['a', 'b'] });
    const result = await pending;
    assert.equal(result.type, 'selection');
    assert.equal(result.submitted, true);
    assert.deepEqual(result.finalSelection, ['a', 'b'], 'both confirmed options come through');
    assert.deepEqual(result.path, ['a', 'b'], 'the exploration trail is preserved separately');
    assert.match(result._instructions, /CONFIRMED/);
  });
});

test('a --since from the previous screen does not swallow the Send on the new one', async () => {
  // The measured failure, from the agent's side. Rendering the next screen truncates the
  // journal back to zero, but `_instructions` hands the agent the seq it just consumed —
  // a cursor now past the end of the file. Every event on the NEW screen lands below it,
  // so the Send is invisible and only extra clicks (which inflate the count past the old
  // high-water mark) get through. Fixing this only in the server is not enough: `--reuse`
  // keeps older servers alive, so the client re-anchors with its own read of the journal.
  await withLiveCompanion(async ({ root, stateDir, browser }) => {
    // Screen 1, already answered and consumed: the journal stands at 2.
    appendClick(stateDir, 'b', ['b']);
    appendSubmit(stateDir, ['b']);
    // Screen 2 truncates it. The agent still re-parks at --since 2.
    fs.unlinkSync(path.join(stateDir, 'events'));

    const pending = runWait(['--project-dir', root, '--timeout-ms', '9000', '--since', '2']);
    await sleep(900);

    browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });
    await sleep(200);
    browser.send({ type: 'submit', choice: 'a', selectedChoices: ['a'] });

    const result = await pending;
    assert.equal(result.type, 'selection', 'pressing Send once ended the wait');
    assert.equal(result.submitted, true);
    assert.deepEqual(result.finalSelection, ['a']);
  });
});

test('a Send that lands before the agent parks still ends the wait', async () => {
  // The second half of the same defect, and the one the re-anchor above would otherwise
  // expose: the agent spends seconds writing the screen and checking state before it
  // starts listening, so an eager user can press Send first. Baselining `submitsAtStart`
  // on the WHOLE journal files that submit under "history" and waits for a second Send
  // that will never come. The baseline belongs to the prefix the agent declared consumed
  // (`--since`), not to everything on disk.
  await withLiveCompanion(async ({ root, stateDir }) => {
    appendClick(stateDir, 'a', ['a']);
    appendSubmit(stateDir, ['a']);

    const result = await runWait(['--project-dir', root, '--timeout-ms', '4000', '--since', '0']);
    assert.equal(result.type, 'selection', 'the answer already on disk ended the wait');
    assert.equal(result.submitted, true);
    assert.deepEqual(result.finalSelection, ['a']);
  });
});

test('--on any keeps the old click-driven behaviour for screens without a Send', async () => {
  await withLiveCompanion(async ({ root, browser }) => {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '20000', '--settle-ms', '300', '--on', 'any']);
    await sleep(900);
    browser.send({ type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] });
    const result = await pending;
    assert.equal(result.type, 'selection');
    assert.deepEqual(result.finalSelection, ['a']);
  });
});

// ---- Version skew: a server older than this client -----------------------------

test('a stale-payload server does not deadlock the wait (measured live)', async () => {
  // Reproduces a real failure. `--reuse` keeps companion servers alive across skill
  // updates, and a server holds its DIGEST CODE in memory (unlike helper.js and the
  // frame template, which it re-reads per request). A server started before `submits`
  // existed answers /poll without that field. The user pressed Send, the journal
  // recorded the submit, the browser showed "Sent ✓" — and the agent waited forever.
  //
  // The 404 fallback cannot catch this: the route exists, only the payload is old.
  const { root, stateDir } = makeSession();

  const stale = http.createServer((req, res) => {
    if (!req.url.startsWith('/poll')) { res.writeHead(404); res.end(); return; }
    const wait = setInterval(() => {
      if (!fs.existsSync(path.join(stateDir, 'events'))) return;
      clearInterval(wait);
      // Exactly the old shape: a selection, with NO `submits` and NO `submitted`.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'selection', seq: 1, since: 0, present: true, count: 1,
        path: ['a'], finalSelection: ['a'] }));
    }, 50);
    req.on('close', () => clearInterval(wait));
  });
  await new Promise((r) => stale.listen(0, '127.0.0.1', r));
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({
    port: stale.address().port, host: '127.0.0.1', url: 'http://localhost',
  }) + '\n');
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid) + '\n');

  try {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '10000']);
    await sleep(600);
    appendSubmit(stateDir, ['a']);

    const result = await pending;
    assert.equal(result.type, 'selection', 'the wait ended instead of hanging');
    // The client re-derived the digest from the journal with its OWN code, so the
    // answer is correct even though the server never mentioned a submit.
    assert.equal(result.submitted, true, 'reconciled locally, not trusted from the server');
    assert.deepEqual(result.finalSelection, ['a']);
  } finally {
    stale.close();
  }
});

test('a server that never re-anchors is rescued by the client, not deadlocked', async () => {
  // The half of the stranded-cursor fix that the server cannot cover for itself.
  // `--reuse` keeps companion servers alive across skill updates, so the agent will meet
  // one that still compares a stale `since` against a journal a new screen truncated —
  // and parks forever below the old high-water mark. The client re-anchors its cursor
  // from its OWN read of the journal before each slice, so the request that goes out
  // asks a question the old server can actually answer.
  const { root, stateDir } = makeSession();

  // Screen 1 was answered and consumed (the journal stood at 2); screen 2 truncated it.
  // The agent re-parks at --since 2, exactly what its last answer told it to use.
  const legacy = http.createServer((req, res) => {
    if (!req.url.startsWith('/poll')) { res.writeHead(404); res.end(); return; }
    const since = Number(new URL(req.url, 'http://x').searchParams.get('since'));
    const wait = setInterval(() => {
      const digest = readEvents(stateDir);
      // The old semantics verbatim: no re-anchoring, so `since=2` can never be reached
      // again on a journal that restarted at zero.
      if (digest.count <= since) return;
      clearInterval(wait);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'selection', seq: digest.count, since, ...digest }));
    }, 50);
    req.on('close', () => clearInterval(wait));
  });
  await new Promise((r) => legacy.listen(0, '127.0.0.1', r));
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({
    port: legacy.address().port, host: '127.0.0.1', url: 'http://localhost',
  }) + '\n');
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid) + '\n');

  try {
    const pending = runWait(['--project-dir', root, '--timeout-ms', '9000', '--since', '2']);
    await sleep(700);
    appendClick(stateDir, 'a', ['a']);
    await sleep(200);
    appendSubmit(stateDir, ['a']);

    const result = await pending;
    assert.equal(result.type, 'selection', 'one Send ended the wait against an old server');
    assert.equal(result.submitted, true);
    assert.deepEqual(result.finalSelection, ['a']);
  } finally {
    legacy.close();
  }
});

test('satisfies fails OPEN on a payload with no submits field', () => {
  // A spurious wake costs one turn; a deadlock costs the session. When the shape is
  // unknown, end the wait and let the agent look.
  assert.equal(satisfies({ type: 'selection', seq: 1 }, { on: 'submit', submitsAtStart: 0 }), true);
});
