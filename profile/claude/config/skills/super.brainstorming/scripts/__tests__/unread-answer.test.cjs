'use strict';

/**
 * The unread-answer invariant: A CONFIRMED ANSWER IS NEVER LOST IN SILENCE.
 *
 * This file exists because the defect it closes is a SEQUENCE defect, invisible to any
 * single-script test. Every piece behaved as specified; the composition dropped the
 * user's decision. Measured in simulation against a live companion:
 *
 *   1. The user pressed Send. The journal recorded the submit; the browser said "Sent ✓".
 *   2. The agent — which was not waiting, a branch the loop explicitly allows — moved to a
 *      textual question and parked the browser with the step-6 placeholder.
 *   3. Writing that placeholder truncated the journal. The next state call reported
 *      `events.present:false` with `reason:"terminal-parked"`: a destroyed decision, and
 *      every signal saying the loop was healthy.
 *   4. On the other leg, a Send landing before the agent armed its wait was baselined as
 *      "history" by the default cursor, so the wait ran to its 600s timeout and reported
 *      `_instructions: "No click arrived"` while the answer sat on disk.
 *
 * Three layers now carry the invariant, and each is tested SEPARATELY here because they
 * fail independently: the server keeps one displaced generation (recoverable), the sensor
 * reports `pendingAnswer` in the default payload (the turn-end check runs without
 * `--with-events`), and the wait client records what it delivered (the only thing that
 * distinguishes an unread answer from one already acted on).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.resolve(__dirname, '..', 'server.cjs');
const WAIT_FOR_USER = path.resolve(__dirname, '..', 'wait-for-user.cjs');
const {
  evaluate, readConsumed, consumedSubmitsFor, PENDING_ANSWER_ACTION,
} = require('../check-visual-state.cjs');
const { recordConsumed, instructionsFor } = require('../wait-for-user.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-unread-'));
  const sessionDir = path.join(root, '.superpowers', 'brainstorm', 'session-1');
  const contentDir = path.join(sessionDir, 'content');
  const stateDir = path.join(sessionDir, 'state');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  // A live session is server-info present + server-stopped absent + pid alive.
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({ url: 'http://localhost:1', port: 1 }));
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid));
  return { root, sessionDir, contentDir, stateDir };
}

function screen(contentDir, name, html) {
  fs.writeFileSync(path.join(contentDir, name), html || `<h2>q</h2><div data-choice="a">A</div>`);
}

function appendSubmit(stateDir, choices, file) {
  fs.appendFileSync(
    path.join(stateDir, file || 'events'),
    JSON.stringify({ type: 'submit', choice: choices[0], selectedChoices: choices }) + '\n'
  );
}

function appendClick(stateDir, choice, file) {
  fs.appendFileSync(
    path.join(stateDir, file || 'events'),
    JSON.stringify({ type: 'click', choice, selected: true, selectedChoices: [choice] }) + '\n'
  );
}

const state = (sessionDir, withEvents) =>
  evaluate({ sessionDir, maxAgeSeconds: null, now: Date.now(), withEvents: !!withEvents });

// ---- Layer 1: the sensor reports the axis on the payload that the loop actually reads --

test('an unread submit raises pendingAnswer in the DEFAULT payload', () => {
  // Not behind --with-events: step 3 of the loop re-runs the check WITHOUT it, and that
  // is the call standing between the user's answer and the screen that would erase it.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendClick(s.stateDir, 'b');
  appendSubmit(s.stateDir, ['b']);

  const out = state(s.sessionDir);
  assert.equal(out.pendingAnswer, true);
  assert.equal(out.events, undefined, 'the digest itself still costs --with-events');
  assert.match(out.action, /UNREAD ANSWER/);
});

test('exploration without a Send is not a pending answer', () => {
  // Clicking is how the screen is meant to be used. Only a commit is an answer.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendClick(s.stateDir, 'a');
  appendClick(s.stateDir, 'b');

  assert.equal(state(s.sessionDir).pendingAnswer, false);
});

test('a delivered answer stops being pending', () => {
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['b']);
  assert.equal(state(s.sessionDir).pendingAnswer, true);

  recordConsumed(s.sessionDir, { type: 'selection', seq: 1, submits: 1 });

  const out = state(s.sessionDir);
  assert.equal(out.pendingAnswer, false);
  assert.equal(out.action.includes('UNREAD ANSWER'), false, 'a delivered answer must not nag');
  assert.equal(readConsumed(s.stateDir).screen, 'layout.html', 'the record is keyed by screen');
});

test('a consumption record from another screen does not silence the new screen', () => {
  // The journal truncates per screen, so a raw submit count carried over would mask the
  // FIRST answer on the new screen — the exact shape of the bug being closed.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['b']);
  recordConsumed(s.sessionDir, { type: 'selection', seq: 1, submits: 1 });

  fs.rmSync(path.join(s.stateDir, 'events'));
  screen(s.contentDir, 'layout-v2.html');
  appendSubmit(s.stateDir, ['a']);

  assert.equal(consumedSubmitsFor(s.stateDir, 'layout-v2.html'), 0);
  assert.equal(state(s.sessionDir).pendingAnswer, true);
});

test('a second Send on the same screen is pending again', () => {
  // The client-side lock makes this rare, not impossible (reload, second tab). Counting
  // submits rather than storing a boolean is what keeps it detectable.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['b']);
  recordConsumed(s.sessionDir, { type: 'selection', seq: 1, submits: 1 });
  appendSubmit(s.stateDir, ['a']);

  assert.equal(state(s.sessionDir).pendingAnswer, true);
});

test('pendingAnswer is reported on a dead companion too, as false', () => {
  const out = evaluate({ sessionDir: null, maxAgeSeconds: null, now: Date.now(), withEvents: false });
  assert.equal(out.pendingAnswer, false, 'the field is part of the shape, not conditional on liveness');
});

// ---- Layer 2: the displaced journal stays recoverable ---------------------------------

test('a displaced answer surfaces as previousAnswer under --with-events', () => {
  const s = makeSession();
  screen(s.contentDir, 'waiting.html', '<div data-companion-placeholder>x</div>');
  appendSubmit(s.stateDir, ['b'], 'events.prev');

  const out = state(s.sessionDir, true);
  assert.deepEqual(out.previousAnswer.finalSelection, ['b']);
  assert.match(out.previousAnswer.note, /displaced by a newer screen/);
  assert.equal(state(s.sessionDir).previousAnswer, undefined, 'recovery data costs --with-events');
});

test('a displaced journal with no Send in it is not reported', () => {
  // Pure exploration on a screen the user moved past is noise, and it would be paid for
  // on every turn of the loop.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendClick(s.stateDir, 'a', 'events.prev');

  assert.equal(state(s.sessionDir, true).previousAnswer, undefined);
});

test('the server displaces the journal instead of destroying it', async () => {
  // End to end against the real server: this is the only place the rename is exercised,
  // and a unit test cannot reach it — the truncation is driven by fs.watch on the
  // content dir, not by any exported function.
  const s = makeSession();
  fs.rmSync(path.join(s.stateDir, 'server-info'));
  const proc = spawn('node', [SERVER], {
    env: { ...process.env, BRAINSTORM_DIR: s.sessionDir, BRAINSTORM_HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  try {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !fs.existsSync(path.join(s.stateDir, 'server-info'))) await sleep(20);
    assert.ok(fs.existsSync(path.join(s.stateDir, 'server-info')), 'server did not start');

    screen(s.contentDir, 'layout.html');
    await sleep(400);
    appendSubmit(s.stateDir, ['b']);

    screen(s.contentDir, 'waiting.html', '<div data-companion-placeholder>x</div>');
    const gone = Date.now() + 5000;
    while (Date.now() < gone && fs.existsSync(path.join(s.stateDir, 'events'))) await sleep(40);

    assert.equal(fs.existsSync(path.join(s.stateDir, 'events')), false, 'the live journal still truncates');
    assert.equal(
      fs.existsSync(path.join(s.stateDir, 'events.prev')), true,
      'the answer the placeholder displaced is still on disk'
    );
    assert.deepEqual(state(s.sessionDir, true).previousAnswer.finalSelection, ['b']);

    // Only one generation is kept, so the recovery would be worthless if an untouched
    // screen could overwrite it with an empty journal. It cannot: with no journal to
    // displace there is nothing to rename, and the archived answer stays put until the
    // user actually interacts again.
    screen(s.contentDir, 'next.html');
    await sleep(400);
    screen(s.contentDir, 'next-2.html');
    await sleep(400);
    const stillThere = state(s.sessionDir, true).previousAnswer;
    assert.ok(stillThere, 'screens that saw no clicks must not overwrite the archived answer');
    assert.deepEqual(stillThere.finalSelection, ['b']);
  } finally {
    proc.kill('SIGKILL');
  }
});

test('a rewritten screen does not inherit "already answered"', () => {
  // Rewriting a filename is not a new file, so the server does NOT truncate — the record
  // and the journal both survive. What must not survive is the CONCLUSION: the second
  // Send is a second answer, and counting submits (rather than storing a boolean) is what
  // keeps it visible.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['a']);
  recordConsumed(s.sessionDir, { type: 'selection', seq: 1, submits: 1 });
  assert.equal(state(s.sessionDir).pendingAnswer, false);

  screen(s.contentDir, 'layout.html', '<h2>another question</h2><div data-choice="c">C</div>');
  appendSubmit(s.stateDir, ['c']);

  assert.equal(state(s.sessionDir).pendingAnswer, true);
});

test('a corrupt consumption record degrades to "unread", never to "handled"', () => {
  // The asymmetry is the whole point: a redundant reminder costs a sentence, a wrongly
  // consumed answer costs the user's decision.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['a']);
  fs.writeFileSync(path.join(s.stateDir, 'consumed'), '{not json');

  assert.equal(readConsumed(s.stateDir), null);
  assert.equal(state(s.sessionDir).pendingAnswer, true);
});

// ---- Layer 3: the wait client -------------------------------------------------------

function runWait(args) {
  const proc = spawn('node', [WAIT_FOR_USER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  return new Promise((resolve, reject) => {
    proc.stdout.on('data', (c) => { stdout += c; });
    proc.on('error', reject);
    proc.on('close', () => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) { reject(new Error('no stdout')); return; }
      resolve(JSON.parse(line));
    });
  });
}

test('without --since, a Send already on disk ends the wait', async () => {
  // The documented call is `wait-for-user.cjs --project-dir <root>`; nothing in the prose
  // tells the agent to pass --since 0. Defaulting the cursor to the journal's line count
  // filed the answer under history and waited out the full timeout.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendClick(s.stateDir, 'a');
  appendSubmit(s.stateDir, ['a']);

  const result = await runWait(['--project-dir', s.root, '--timeout-ms', '4000']);
  assert.equal(result.type, 'selection');
  assert.equal(result.submitted, true);
  assert.deepEqual(result.finalSelection, ['a']);
});

test('without --since, an answer already delivered does NOT end the wait again', async () => {
  // The other half: re-serving a consumed answer would make the agent act twice on one
  // decision. The consumption record, not the cursor, is what separates the two.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['a']);
  recordConsumed(s.sessionDir, { type: 'selection', seq: 1, submits: 1 });

  const result = await runWait(['--project-dir', s.root, '--timeout-ms', '2500']);
  assert.equal(result.type, 'timeout', 'a delivered answer is history for the next wait');
});

test('delivering an answer writes the consumption record', async () => {
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendSubmit(s.stateDir, ['b']);

  const result = await runWait(['--project-dir', s.root, '--timeout-ms', '4000']);
  assert.equal(result.type, 'selection');
  assert.equal(result.pendingAnswer, false, 'the payload already reflects its own delivery');

  const record = readConsumed(s.stateDir);
  assert.equal(record.screen, 'layout.html');
  assert.equal(record.submits, 1);
});

test('an explicit --since still means what the agent said it means', async () => {
  // Regression guard for the fix itself: `--since N` is a consumption claim this script
  // handed the agent, and honouring it is what keeps the documented re-park protocol
  // (and the anchor for a truncated journal) working.
  const s = makeSession();
  screen(s.contentDir, 'layout.html');
  appendClick(s.stateDir, 'a');
  appendSubmit(s.stateDir, ['a']);

  const result = await runWait(['--project-dir', s.root, '--timeout-ms', '2500', '--since', '2']);
  assert.equal(result.type, 'timeout', 'everything up to the quoted cursor is consumed');
});

test('a timeout never claims nothing happened while an answer is on disk', () => {
  const withAnswer = instructionsFor(
    { type: 'timeout', seq: 0, pendingAnswer: true },
    { selfPath: '/x/wait-for-user.cjs', projectDir: '/repo' }
  );
  assert.match(withAnswer, /check-visual-state\.cjs --with-events/);
  assert.equal(/No click arrived/.test(withAnswer), false);

  const genuine = instructionsFor(
    { type: 'timeout', seq: 0, pendingAnswer: false },
    { selfPath: '/x/wait-for-user.cjs', projectDir: '/repo' }
  );
  assert.match(genuine, /No click arrived/);
});

// ---- The prose that drives the loop --------------------------------------------------

test('the loop tells the agent to drain a pending answer before parking', () => {
  // A mechanism nothing points at is dead prose. `pendingAnswer` is only checked if step
  // 6 of the loop says to check it, and only helps if it says so where parking happens.
  const quickStart = fs.readFileSync(path.resolve(__dirname, '..', '..', 'references', 'visual-companion.md'), 'utf8');
  const step6 = quickStart.slice(quickStart.indexOf('6. **Unload when returning to the terminal'));
  assert.ok(step6.length > 0, 'step 6 must exist');
  assert.match(step6, /pendingAnswer/, 'step 6 names the field that guards the park');
  assert.match(quickStart, /truncates the journal|truncate the journal/i);
  assert.equal(PENDING_ANSWER_ACTION.includes('--with-events'), true);
});
