'use strict';

/**
 * Regression tests for check-visual-state.cjs — the render-debt backstop.
 *
 * Root cause these tests lock down (observed in a real Copilot CLI session,
 * events.jsonl ffddcb58): the model accepted the visual companion, launched the
 * server, announced the URL, and then ended TWO turns (complexity checkpoint,
 * deep-research consent gate) with an empty browser open, until the user typed
 * "atualize o mockup visual". The prose rule ("use the companion at least once")
 * is session-scoped and therefore never violated by any individual turn — so it
 * never fires. This script makes the debt checkable NOW, per turn.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/check-visual-state.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-visual-state.cjs');
const { evaluate, listScreens, isPlaceholder, findLiveSession, isLiveSession } = require(SCRIPT);

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'visual-state-'));
}

/**
 * A pid that is provably NOT running right now.
 *
 * Do not hardcode one: Linux allows `/proc/sys/kernel/pid_max` up to 4194304, so a
 * "surely impossible" constant can be a live process there while looking safe on macOS
 * (smaller default range). Probe downward from the ceiling instead and assert we found
 * a free slot, so a dead-pid fixture can never silently become a live-pid fixture.
 */
function freePid() {
  for (let pid = 4194303; pid > 4194000; pid--) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      // Anything but EPERM means we could not signal it because it is not there.
      // Matching on "not EPERM" rather than "=== ESRCH" keeps this correct on Windows,
      // where the error code for an absent pid is not guaranteed to be the POSIX one —
      // and it mirrors isLiveSession()'s own aliveness test in check-visual-state.cjs.
      if (e.code !== 'EPERM') return pid;
    }
  }
  throw new Error('could not find a free pid to use as a dead-server fixture');
}

/**
 * Build a companion session dir. `alive: true` uses this test process's own pid,
 * which is by definition alive, so liveness needs no spawned server.
 */
function makeSession(root, { id = 'sess-1', alive = true, stopped = false, url = 'http://localhost:4242' } = {}) {
  const sessionDir = path.join(root, '.superpowers', 'brainstorm', id);
  const stateDir = path.join(sessionDir, 'state');
  const contentDir = path.join(sessionDir, 'content');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'server-info'), JSON.stringify({ type: 'server-started', url }));
  fs.writeFileSync(path.join(stateDir, 'server.pid'), String(alive ? process.pid : freePid()));
  if (stopped) fs.writeFileSync(path.join(stateDir, 'server-stopped'), '');
  return { sessionDir, stateDir, contentDir };
}

/** Write a screen with an explicit mtime so ordering is deterministic, not scheduler-dependent. */
function writeScreen(contentDir, name, html, ageSeconds = 0) {
  const p = path.join(contentDir, name);
  fs.writeFileSync(p, html);
  const when = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(p, when, when);
  return p;
}

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' }));
}

// ---------------------------------------------------------------- the regression

test('server up with zero screens is a hard render debt (the exact observed bug)', () => {
  const root = tmpRoot();
  makeSession(root);
  const out = run(['--project-dir', root]);

  assert.equal(out.companionActive, true);
  assert.equal(out.renderDebt, true);
  assert.equal(out.reason, 'no-screen-rendered');
  assert.equal(out.screens, 0);
  assert.match(out.action, /BEFORE ending this turn/);
});

test('the debt message names the turn-ending steps it pre-empts', () => {
  const root = tmpRoot();
  makeSession(root);
  const out = run(['--project-dir', root]);
  assert.match(out.action, /approach proposals/);
  assert.match(out.action, /deep-research offer/);
});

test('a real screen clears the debt', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'modal-version.html', '<div class="mockup">…</div>');
  const out = run(['--project-dir', root]);

  assert.equal(out.renderDebt, false);
  assert.equal(out.reason, 'current');
  assert.equal(out.screens, 1);
  assert.equal(out.newestRealScreen, 'modal-version.html');
});

// ------------------------------------------------------- placeholders are not screens

test('a waiting screen alone does NOT clear the debt (parking the browser is not showing something)', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'waiting.html', '<p class="subtitle">Continuing in terminal…</p>');
  const out = run(['--project-dir', root]);

  assert.equal(out.renderDebt, true);
  assert.equal(out.reason, 'no-screen-rendered');
  assert.equal(out.screens, 0);
  assert.equal(out.placeholders, 1);
});

test('placeholder detected by explicit marker, not only by filename', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'pause.html', '<div data-companion-placeholder><p>Continuing in terminal…</p></div>');
  const out = run(['--project-dir', root]);

  assert.equal(out.reason, 'no-screen-rendered');
  assert.equal(out.placeholders, 1);
});

test('parking on a placeholder AFTER a real screen is legitimate, not a debt', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'modal-version.html', '<div class="mockup">…</div>', 120);
  writeScreen(contentDir, 'waiting.html', '<p>Continuing in terminal…</p>', 0);
  const out = run(['--project-dir', root]);

  assert.equal(out.renderDebt, false);
  assert.equal(out.reason, 'terminal-parked');
  assert.equal(out.newestIsPlaceholder, true);
  assert.equal(out.newestRealScreen, 'modal-version.html');
});

// ------------------------------------------------------------------- staleness (opt-in)

test('staleness is opt-in: an old screen is "current" until --max-age-seconds is passed', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'layout.html', '<div class="mockup">…</div>', 3600);

  const noThreshold = run(['--project-dir', root]);
  assert.equal(noThreshold.reason, 'current');
  assert.equal(noThreshold.renderDebt, false);
  assert.ok(noThreshold.ageSeconds >= 3600, 'age is always reported so the model can judge correspondence');

  const withThreshold = run(['--project-dir', root, '--max-age-seconds', '600']);
  assert.equal(withThreshold.reason, 'stale-screen');
  assert.equal(withThreshold.renderDebt, true);
});

test('--max-age-seconds rejects a non-numeric value via the error field, not a stack trace', () => {
  const root = tmpRoot();
  makeSession(root);
  let out;
  try {
    execFileSync(process.execPath, [SCRIPT, '--project-dir', root, '--max-age-seconds', 'soon'], { encoding: 'utf8' });
    assert.fail('expected a non-zero exit');
  } catch (e) {
    out = JSON.parse(e.stdout);
  }
  assert.match(out.error, /--max-age-seconds/);
});

// ----------------------------------------------------------------- liveness discovery

test('no companion at all reports no-server and owes nothing', () => {
  const out = run(['--project-dir', tmpRoot()]);
  assert.equal(out.companionActive, false);
  assert.equal(out.renderDebt, false);
  assert.equal(out.reason, 'no-server');
});

test('a stopped session is not live even with screens on disk', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root, { stopped: true });
  writeScreen(contentDir, 'layout.html', '<div>…</div>');
  const out = run(['--project-dir', root]);
  assert.equal(out.companionActive, false);
  assert.equal(out.reason, 'no-server');
});

test('a session whose pid is dead is not live', () => {
  const root = tmpRoot();
  makeSession(root, { alive: false });
  assert.equal(run(['--project-dir', root]).reason, 'no-server');
});

test('discovery picks the newest LIVE session, skipping newer dead ones', () => {
  const root = tmpRoot();
  const dead = makeSession(root, { id: 'sess-dead', alive: false });
  const live = makeSession(root, { id: 'sess-live', alive: true });
  // Make the dead session look newest by server-info mtime.
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(dead.stateDir, 'server-info'), future, future);
  writeScreen(live.contentDir, 'layout.html', '<div>…</div>');

  const out = run(['--project-dir', root]);
  assert.equal(out.sessionDir, live.sessionDir);
  assert.equal(out.reason, 'current');
});

test('--session-dir targets one session directly and still enforces liveness', () => {
  const root = tmpRoot();
  const { sessionDir, contentDir } = makeSession(root);
  writeScreen(contentDir, 'layout.html', '<div>…</div>');
  assert.equal(run(['--session-dir', sessionDir]).reason, 'current');

  const deadRoot = tmpRoot();
  const deadSession = makeSession(deadRoot, { alive: false }).sessionDir;
  assert.equal(run(['--session-dir', deadSession]).reason, 'no-server');
});

test('missing both --project-dir and --session-dir fails with a JSON error', () => {
  let out;
  try {
    execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.fail('expected a non-zero exit');
  } catch (e) {
    out = JSON.parse(e.stdout);
  }
  assert.match(out.error, /--project-dir or --session-dir/);
});

// ------------------------------------------------------------------- script contract

test('verdict lives in the JSON, never in the exit code (repo-wide script contract)', () => {
  const root = tmpRoot();
  makeSession(root);
  // renderDebt:true must still exit 0 — exit codes signal usage/IO failure only.
  const raw = execFileSync(process.execPath, [SCRIPT, '--project-dir', root], { encoding: 'utf8' });
  assert.equal(JSON.parse(raw).renderDebt, true);
});

test('the session URL is echoed back so the reminder can name it', () => {
  const root = tmpRoot();
  makeSession(root, { url: 'http://localhost:52353' });
  assert.equal(run(['--project-dir', root]).url, 'http://localhost:52353');
});

test('non-html files in the content dir are ignored', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  fs.writeFileSync(path.join(contentDir, 'notes.md'), '# not a screen');
  fs.writeFileSync(path.join(contentDir, 'logo.png'), '');
  const out = run(['--project-dir', root]);
  assert.equal(out.screens, 0);
  assert.equal(out.reason, 'no-screen-rendered');
});

// --------------------------------------------------------------------- unit surface

test('evaluate() is pure with respect to `now`, so age is testable without sleeping', () => {
  const root = tmpRoot();
  const { sessionDir, contentDir } = makeSession(root);
  writeScreen(contentDir, 'layout.html', '<div>…</div>', 0);
  const out = evaluate({ sessionDir, maxAgeSeconds: null, now: Date.now() + 5000 });
  assert.ok(out.ageSeconds >= 5, `expected >=5s, got ${out.ageSeconds}`);
});

test('listScreens returns newest first and tags placeholders', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'old.html', '<div>…</div>', 300);
  writeScreen(contentDir, 'waiting.html', '<p>…</p>', 0);
  const screens = listScreens(contentDir);
  assert.deepEqual(screens.map((s) => s.name), ['waiting.html', 'old.html']);
  assert.equal(screens[0].placeholder, true);
  assert.equal(screens[1].placeholder, false);
});

test('listScreens on a missing content dir returns empty instead of throwing', () => {
  assert.deepEqual(listScreens(path.join(tmpRoot(), 'nope')), []);
});

test('isPlaceholder tolerates an unreadable file', () => {
  assert.equal(isPlaceholder(path.join(tmpRoot(), 'nope'), 'gone.html'), false);
});

test('findLiveSession / isLiveSession return null/false on a project with no .superpowers', () => {
  assert.equal(findLiveSession(tmpRoot()), null);
  assert.equal(isLiveSession(path.join(tmpRoot(), 'nope')), false);
});

// ------------------------------------------------------------- session-language names

test('placeholder names are matched in the session language, not only English', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  // pt-BR is the default session language, so this is the realistic filename a model picks.
  writeScreen(contentDir, 'aguardando.html', '<p class="subtitle">Continuando no terminal…</p>');
  const out = run(['--project-dir', root]);

  assert.equal(out.reason, 'no-screen-rendered');
  assert.equal(out.placeholders, 1);
  assert.equal(out.screens, 0);
});

test('a real screen whose name merely starts with a content word is not a placeholder', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'modal-version.html', '<div class="mockup">…</div>');
  assert.equal(run(['--project-dir', root]).screens, 1);
});

// ------------------------------------------------------------------ --with-events digest
//
// Why the digest exists at all: the loop used to spend one tool call checking liveness and
// another reading <state_dir>/events. Both are answered here, so the render loop drops from
// four round trips per iteration to three — and the deselect footgun below stops being the
// model's problem.

/** Append click events exactly as server.cjs writes them (one JSON object per line). */
function writeEvents(stateDir, clicks) {
  fs.writeFileSync(path.join(stateDir, 'events'), clicks.map((c) => JSON.stringify(c)).join('\n') + '\n');
}

test('--with-events returns the click digest alongside the render verdict', () => {
  const root = tmpRoot();
  const { stateDir, contentDir } = makeSession(root);
  // A BESPOKE screen on purpose: the verdict asserted below is "current", and a session
  // whose only screen is generator text cards is `generated-only` (see the debt tests).
  writeScreen(contentDir, 'opts.html', '<style>.m{}</style><div class="mockup" data-choice="a">…</div>');
  writeEvents(stateDir, [
    { type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] },
    { type: 'click', choice: 'b', selected: true, selectedChoices: ['a', 'b'] },
  ]);

  const out = run(['--project-dir', root, '--with-events']);
  assert.equal(out.reason, 'current', 'the render verdict still comes back in the same call');
  assert.equal(out.events.present, true);
  assert.equal(out.events.count, 2);
  assert.deepEqual(out.events.path, ['a', 'b']);
  assert.deepEqual(out.events.finalSelection, ['a', 'b']);
});

test('finalSelection follows the LAST selectedChoices, not the last choice (deselect footgun)', () => {
  const root = tmpRoot();
  const { stateDir, contentDir } = makeSession(root);
  writeScreen(contentDir, 'opts.html', '<div>…</div>');
  // The user selects a, selects b, then clicks b again — which DESELECTS it.
  // A naive read of the last `choice` says "b"; the truth is "a".
  writeEvents(stateDir, [
    { type: 'click', choice: 'a', selected: true, selectedChoices: ['a'] },
    { type: 'click', choice: 'b', selected: true, selectedChoices: ['a', 'b'] },
    { type: 'click', choice: 'b', selected: false, selectedChoices: ['a'] },
  ]);

  const out = run(['--project-dir', root, '--with-events']);
  assert.deepEqual(out.events.path, ['a', 'b', 'b'], 'the exploration path is preserved as signal');
  assert.deepEqual(out.events.finalSelection, ['a'], 'the last choice (b) was a deselect');
});

test('no events file means the user never touched the browser', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'opts.html', '<div>…</div>');
  const out = run(['--project-dir', root, '--with-events']);
  assert.equal(out.events.present, false);
  assert.equal(out.events.count, 0);
  assert.deepEqual(out.events.finalSelection, []);
});

test('a truncated event line is counted, not fatal (the file is appended to live)', () => {
  const root = tmpRoot();
  const { stateDir, contentDir } = makeSession(root);
  writeScreen(contentDir, 'opts.html', '<div>…</div>');
  fs.writeFileSync(
    path.join(stateDir, 'events'),
    JSON.stringify({ type: 'click', choice: 'a', selectedChoices: ['a'] }) + '\n{"type":"cli'
  );

  const out = run(['--project-dir', root, '--with-events']);
  assert.equal(out.events.count, 1);
  assert.equal(out.events.malformed, 1);
  assert.deepEqual(out.events.finalSelection, ['a']);
});

test('--with-events on a dead companion still returns the events shape', () => {
  const out = run(['--project-dir', tmpRoot(), '--with-events']);
  assert.equal(out.reason, 'no-server');
  assert.equal(out.events.present, false);
});

test('omitting --with-events omits the field entirely (callers that do not need it pay nothing)', () => {
  const root = tmpRoot();
  const { stateDir, contentDir } = makeSession(root);
  writeScreen(contentDir, 'opts.html', '<div>…</div>');
  writeEvents(stateDir, [{ type: 'click', choice: 'a', selectedChoices: ['a'] }]);
  assert.equal('events' in run(['--project-dir', root]), false);
});

// ------------------------------------------------------------------- flag parsing

test('a valueless flag does not swallow the next flag', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'opts.html', '<div>…</div>');
  // --with-events first: the naive parser bound "--project-dir" as its value and orphaned root.
  const out = run(['--with-events', '--project-dir', root]);
  assert.equal(out.companionActive, true, '--project-dir survived the boolean flag before it');
  assert.equal(out.events.present, false);
});

test('valued flags still parse when they follow a boolean flag', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'layout.html', '<div>…</div>', 3600);
  const out = run(['--with-events', '--project-dir', root, '--max-age-seconds', '600']);
  assert.equal(out.reason, 'stale-screen');
  assert.equal(out.renderDebt, true);
});

// ------------------------------------------------------- generated vs bespoke screens
//
// Real session (.superpowers/brainstorm/6191-1785176348): the open question was
// "bottom sheet vs centered dialog" — pure layout — and the first two screens were 927B
// of render-screen.cjs TEXT CARDS, which cannot draw a layout at all. The Layout gate
// forbids exactly that. Presence alone said "current", so the kind has to be reported
// too for the violation to be visible.

const { classifyScreen } = require(SCRIPT);
const { GENERATED_MARKER } = require(path.resolve(__dirname, '..', 'render-screen.cjs'));

test('generator output is reported as generated, bespoke markup as bespoke', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'cards.html', `${GENERATED_MARKER}\n<h2>Pick</h2>\n\n<div class="cards">…</div>`);
  const out = run(['--project-dir', root]);
  assert.equal(out.newestScreenKind, 'generated');

  writeScreen(contentDir, 'mockup.html', '<style>.panel{}</style><div class="panel" data-choice="a">…</div>');
  assert.equal(run(['--project-dir', root]).newestScreenKind, 'bespoke');
});

test('screens written before the marker existed are still classified by shape', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  // Exactly the shape of the real session's 927B files: generator containers, no <style>.
  writeScreen(
    contentDir,
    'modal-style-options.html',
    '<h2>Qual estilo de modal?</h2>\n<p class="subtitle">Escolha</p>\n\n<div class="cards">\n  <div class="card" data-choice="bottom-sheet"></div>\n</div>'
  );
  assert.equal(run(['--project-dir', root]).newestScreenKind, 'generated');
});

test('a bespoke mockup that reuses a generator container class is still bespoke', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'm.html', '<style>.cards{gap:24px}</style><div class="cards" data-choice="a">…</div>');
  assert.equal(run(['--project-dir', root]).newestScreenKind, 'bespoke');
});

test('newestScreenKind tracks the newest REAL screen, ignoring a placeholder on top', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'mockup.html', '<style>.p{}</style><div data-choice="a">…</div>', 120);
  writeScreen(contentDir, 'waiting.html', '<p>Continuing in terminal…</p>', 0);
  const out = run(['--project-dir', root]);
  assert.equal(out.reason, 'terminal-parked');
  assert.equal(out.newestScreenKind, 'bespoke');
});

test('classifyScreen tolerates an unreadable file', () => {
  assert.equal(classifyScreen(path.join(tmpRoot(), 'nope'), 'gone.html'), 'bespoke');
});

// ------------------------------------------------- generated-only: the debt that "settled"
//
// Real session (2026-08-11, 22:44-22:46): the request was "refatorar o módulo de analytics
// do admin com novas informações". The offer went out on the word "analytics" — before any
// answer had established whether the refactor touched a screen — the user accepted, and the
// only thing owed to them at that moment was a SCOPE question. So the scope question is what
// was rendered: five text cards, A/B/C/D/E, in a browser the user had been told to open.
// check-visual-state answered `renderDebt:false, reason:current`, because presence was the
// whole test. The user's report: "essas perguntas conceituais poderiam ser respondidas no
// terminal sem abrir o servidor".
//
// The prose gate (SKILL.md: a signal fires on what the conversation established; a matched
// signal becomes an offer only when you can name the artifact) is the fix. This is its
// backstop: if the browser only ever showed text cards, the promised artifact never came.

const cards = (name) => `${GENERATED_MARKER}\n<h2>${name}</h2>\n<div class="options">…</div>`;

test('a companion whose every screen is generator text cards owes a render', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'novas-informacoes-options.html', cards('Que tipo de novas informações?'));
  const out = run(['--project-dir', root]);
  assert.equal(out.reason, 'generated-only');
  assert.equal(out.renderDebt, true, 'text cards are a terminal message behind a URL — they settle nothing');
  assert.match(out.action, /artifact you named/);
  assert.match(out.action, /stop the server/, 'the escape hatch is named, or the debt has no exit');
});

test('one bespoke screen in the history settles the debt, even under newer text cards', () => {
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'layout.html', '<style>.p{}</style><div class="panel" data-choice="a">…</div>', 300);
  writeScreen(contentDir, 'follow-up-options.html', cards('E os filtros?'), 0);
  const out = run(['--project-dir', root]);
  assert.equal(out.reason, 'current', 'the generator is legitimate for a conceptual choice inside an already-visual thread');
  assert.equal(out.renderDebt, false);
  assert.equal(out.newestScreenKind, 'generated');
});

test('generated-only outranks terminal-parked: parking on a placeholder does not pay the debt', () => {
  // Same shape as the placeholder rule itself — the control arm of the render-debt eval
  // settled its conscience with waiting.html. Text cards plus a placeholder is that move
  // with one extra step.
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'scope-options.html', cards('Escopo?'), 120);
  writeScreen(contentDir, 'waiting.html', '<p>Continuando no terminal…</p>', 0);
  const out = run(['--project-dir', root]);
  assert.equal(out.reason, 'generated-only');
  assert.equal(out.renderDebt, true);
});

test('an empty browser is still no-screen-rendered, not generated-only', () => {
  // `[].every(...)` is true, so the empty case has to be decided before this branch or the
  // harder, older diagnosis would be silently relabelled.
  const root = tmpRoot();
  const { contentDir } = makeSession(root);
  writeScreen(contentDir, 'waiting.html', '<p>Continuing in terminal…</p>');
  const out = run(['--project-dir', root]);
  assert.equal(out.reason, 'no-screen-rendered');
});
