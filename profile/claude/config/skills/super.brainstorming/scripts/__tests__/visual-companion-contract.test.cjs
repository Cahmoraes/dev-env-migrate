'use strict';

/**
 * Textual contract tests for the visual companion's render-debt invariants.
 *
 * These lock the PROSE, because the prose is what the model actually executes.
 * The backstop script (check-visual-state.cjs) has its own behavioural suite.
 *
 * Root cause (real Copilot CLI session, events.jsonl ffddcb58, 2026-07-27):
 *   15:25:39  user accepts the companion
 *   15:26:04  server launched
 *   15:26:22  URL announced + clarifying question  → turn ends, EMPTY browser
 *   15:26:59  user: "apenas me apresente uma versão do sheet em modal"
 *   15:27-30  ~45 exploration tool calls, zero writes to content/
 *   15:31:19  deep-research consent gate           → turn ends, EMPTY browser
 *   15:32:21  user: "atualize o mockup visual"
 *   15:32:59  first screen finally written
 *
 * PROGRESSIVE DISCLOSURE (the reason these tests are asymmetric — do not "fix" that):
 *   SKILL.md            — paid EVERY brainstorming session, companion or not. Carries only
 *                         the TRIGGER: the debt exists, it blocks, details are elsewhere.
 *   operation.md        — paid only on acceptance. Carries the RULES, the turn-end command,
 *                         the reason codes and the evidence.
 *   references/visual-companion.md — paid only on acceptance. Carries the operational loop.
 *   reference.md        — paid only for bespoke layouts / platform notes.
 * Two earlier versions of this fix got this wrong: v1 restated everything in all three
 * files (+8456 bytes), v2 kept the full rule block in the always-paid tier (+2020 bytes
 * of SKILL.md). Neither bought anything — the failing session proves the model had all
 * three files in context and still failed, so redundancy is pure token cost.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/visual-companion-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', '..');
const skillMd = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const operationMd = fs.readFileSync(path.join(SKILL_DIR, 'references', 'visual-companion-operation.md'), 'utf8');
const quickStartMd = fs.readFileSync(path.join(SKILL_DIR, 'references', 'visual-companion.md'), 'utf8');

// =================================================== always-paid tier: the TRIGGER only

test('SKILL.md states the debt exists and what does NOT settle it', () => {
  assert.match(skillMd, /Settle the render debt/);
  assert.match(skillMd, /a debt, not a promise/i);
  assert.match(skillMd, /not by launching, not by announcing the URL, not by a placeholder/);
});

test('SKILL.md names the steps the debt pre-empts — the ones that stole the turn', () => {
  assert.match(skillMd, /pre-empts every turn-ending step/);
  assert.match(skillMd, /clarifying questions, the `super\.deep-research` offer/);
});

test('SKILL.md flags explicit render requests as blocking, in the words the user used', () => {
  assert.match(skillMd, /is blocking/);
  assert.match(skillMd, /atualize o mockup/);
});

test('SKILL.md says the debt reopens and points at the acceptance-tier file', () => {
  assert.match(skillMd, /reopens whenever the screen falls behind/);
  assert.match(skillMd, /references\/visual-companion-operation\.md/);
  assert.match(skillMd, /read on acceptance, before showing anything/);
});

test('the always-paid trigger stays within budget (a token-cost regression guard)', () => {
  // .trim() so a CRLF checkout does not add a phantom byte to the measurement.
  const line = (skillMd.split('\n').find((l) => l.startsWith('**Settle the render debt.**')) || '').trim();
  assert.ok(line, 'trigger paragraph is missing from SKILL.md');
  assert.ok(
    Buffer.byteLength(line) <= 900,
    `trigger grew to ${Buffer.byteLength(line)} bytes; keep detail in the acceptance tier`
  );
});

// ================================================ acceptance tier: the RULES and the how

test('rule 1: launch and first render belong to the same turn', () => {
  assert.match(operationMd, /Launch and first render belong to the same turn/);
  assert.match(quickStartMd, /Launching is not rendering/);
});

test('rule 2: an open debt pre-empts every turn-ending step', () => {
  assert.match(operationMd, /An open debt pre-empts every turn-ending step/);
  assert.match(operationMd, /clarifying questions, the `super\.deep-research` offer, approach proposals/);
});

test('rule 3: an explicit render request is blocking, quoting what the user actually typed', () => {
  assert.match(operationMd, /An explicit render request is blocking/);
  for (const phrase of [/me mostre/, /me apresente uma versão/, /atualize o mockup/]) {
    assert.match(operationMd, phrase);
  }
});

test('the debt reopens: a stale screen is the same bug one iteration later', () => {
  assert.match(operationMd, /Keep the screen current/);
  assert.match(operationMd, /same bug as never rendering it, one iteration later/);
  assert.match(operationMd, /parks the browser on a placeholder/);
});

test('an unsettleable debt must be declared in-thread, never left silent', () => {
  assert.match(operationMd, /When the debt truly cannot be settled/);
  assert.match(operationMd, /offer only when you are ready to deliver/);
});

// ------------------------------------------------------------- evidence and boundaries

test('operation.md records that reachability was NOT the problem — every file was in context', () => {
  assert.match(operationMd, /already in context/);
  assert.match(operationMd, /no turn-level trigger/);
});

test('operation.md keeps the table of things that do NOT settle the debt', () => {
  for (const row of [/Launching the server/, /Announcing the URL/, /design-token subagent/, /waiting\/placeholder screen/]) {
    assert.match(operationMd, row);
  }
});

test('operation.md documents every reason code the script can return', () => {
  // Derived from the script, not restated: a code added to ACTIONS and documented nowhere
  // is the drift this guard exists to catch, and a hardcoded list cannot see it.
  const { ACTIONS } = require(path.join(SKILL_DIR, 'scripts', 'check-visual-state.cjs'));
  const reasons = Object.keys(ACTIONS);
  assert.ok(reasons.length >= 6, `only ${reasons.length} reason codes found — the sweep lost its corpus`);
  for (const reason of reasons) {
    assert.match(operationMd, new RegExp(reason), `reason code ${reason} is undocumented in the acceptance tier`);
  }
});

test('prose states the presence-vs-correspondence boundary instead of overclaiming the script', () => {
  assert.match(operationMd, /decides \*\*presence\*\*/);
  assert.match(operationMd, /not \*\*correspondence\*\*/);
});

// ------------------------------------------------- the mechanical backstop is reachable

test('the turn-end command lives in both acceptance-tier files, and SKILL.md names the script', () => {
  for (const doc of [operationMd, quickStartMd]) {
    assert.match(doc, /scripts\/check-visual-state\.cjs --project-dir/);
  }
  assert.match(skillMd, /check-visual-state\.cjs/);
});

test('the script referenced by the prose actually exists and is executable as a module', () => {
  const scriptPath = path.join(SKILL_DIR, 'scripts', 'check-visual-state.cjs');
  assert.ok(fs.existsSync(scriptPath), 'check-visual-state.cjs is missing');
  assert.equal(typeof require(scriptPath).evaluate, 'function');
});

test('the documented waiting snippet carries the marker the script detects', () => {
  assert.match(quickStartMd, /data-companion-placeholder/);
  const script = fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'check-visual-state.cjs'), 'utf8');
  assert.match(script, /data-companion-placeholder/);
});

// =========================================== the ENTRY gate: when the offer may go out
//
// Second measured failure of this section, 2026-08-11 (transcript 22fdef80, 22:44-22:46).
// The request was "refatorar o módulo de analytics do admin com novas informações". The
// offer went out 52s later, before any answer — "analytics" matched the user-facing-UI
// signal on vocabulary alone, while nobody yet knew whether "novas informações" meant new
// backend metrics, new charts, or both. The user accepted; the only thing owed to them at
// that moment was a scope question; so the scope question is what got rendered, as five
// generator text cards. Every rule in this file was satisfied, and the user's verdict was
// "essas perguntas conceituais poderiam ser respondidas no terminal sem abrir o servidor".
//
// So the gate has two halves, and both live in the always-paid tier because they decide
// whether the acceptance-tier files are ever read: a signal fires on what the CONVERSATION
// established, and a matched signal becomes an offer only when you can NAME the artifact.

test('a signal fires on what the conversation established, not on the topic vocabulary', () => {
  assert.match(skillMd, /established/);
  assert.match(skillMd, /never on the topic's vocabulary/);
  assert.match(skillMd, /Surface unknown = no signal fires/,
    'the unknown-surface case needs a single branch, or the model picks the one that offers');
});

test('the unknown surface is resolved in the terminal, and the checklist re-runs later', () => {
  assert.match(skillMd, /frontend, backend or both/);
  assert.match(skillMd, /keeps the session text-only until the conversation reaches the frontend/);
  // One-shot evaluation is the other half of the bug: a checklist that only ever runs at
  // the opening turn cannot fire when the backend conversation later reaches a screen.
  assert.match(skillMd, /re-run it whenever the conversation reaches a new decision/);
  assert.match(skillMd, /re-run the checklist when the conversation reaches the UI/);
});

test('readiness is a named artifact, not a feeling of confidence', () => {
  assert.match(skillMd, /Readiness test — name the artifact/);
  assert.match(skillMd, /becomes an offer only when you can name the first thing you would draw/);
  assert.match(skillMd, /options I could have typed in the terminal/,
    'the failure has to be named in the shape it actually takes');
  assert.match(skillMd, /\*\*name the artifact\*\* in the offer/,
    'naming it in the offer is what makes the promise checkable by the user');
});

test('the always-paid tier states that text cards never settle the debt', () => {
  // The Layout gate covers layout questions. It said nothing about a CONCEPTUAL question
  // rendered as cards, which is precisely how the debt got "settled" in the measured run.
  assert.match(skillMd, /\*\*Text cards never settle the debt\*\*/);
  assert.match(skillMd, /a conceptual question with nothing up yet belongs in the terminal/);
});

test('the acceptance tier carries the evidence and the inverse-misfire diagnosis', () => {
  assert.match(operationMd, /moving a terminal question into the browser/);
  assert.match(operationMd, /a terminal message wearing a URL/);
  assert.match(operationMd, /generated-only/);
  assert.match(operationMd, /What settles it is the artifact you named in the offer/);
});

test('the settlement table names the text-card screen as a non-settlement', () => {
  const table = operationMd.slice(operationMd.indexOf('| Not a settlement'), operationMd.indexOf('### Why the debt needs'));
  assert.match(table, /render-screen\.cjs/,
    'the table is where the model checks what counts — a row missing here is a rule nobody reads');
});

test('the generator licence in the loop tier is scoped to an already-visual thread', () => {
  assert.match(quickStartMd, /raised \*inside\n?\s*an already-visual thread\*/);
  assert.match(quickStartMd, /nothing visual up yet is a \*\*terminal\*\* question/);
});

// ------------------------------------------------------------ checklist integration

test('checklist step 2 stays open until a real screen is served', () => {
  assert.match(skillMd, /this step stays open until a real screen is served/);
});

test('checklist step 3 deep-research offer defers to an open render debt', () => {
  assert.match(skillMd, /Settle any open render debt before offering it/);
  assert.match(skillMd, /strands the user at an empty browser/);
});

test('Process Flow states the render happens before advancing past the offer', () => {
  assert.match(skillMd, /on acceptance render before advancing/);
});

// ------------------------------- progressive-disclosure guards (token-cost regressions)

test('the numbered rules are NOT restated in the always-paid tier', () => {
  assert.doesNotMatch(skillMd, /^\s*1\.\s+\*\*Launch and first render belong to the same turn/m);
  assert.doesNotMatch(skillMd, /Keep the screen current/);
});

test('the turn-end bash command is not printed in the always-paid tier', () => {
  assert.doesNotMatch(skillMd, /node <super\.brainstorming-base-dir>\/scripts\/check-visual-state\.cjs/);
});

test('the reason-code table lives only in the acceptance tier', () => {
  assert.doesNotMatch(skillMd, /no-screen-rendered/);
  assert.match(operationMd, /no-screen-rendered/);
});

test('the browser-vs-terminal rule is stated once, in the file that also carries the layout gate', () => {
  // Both files are read at the same trigger (acceptance), so a second copy is pure cost —
  // and the two copies this guard replaced had already drifted (operation.md had dropped
  // "technical/API/data-model decisions" from its terminal list).
  assert.match(quickStartMd, /## When browser, when terminal/);
  assert.match(quickStartMd, /Layout gate \(mandatory\)/);
  assert.doesNotMatch(operationMd, /Use the browser\*\* for content that IS visual/);
  assert.match(operationMd, /live in `references\/visual-companion\.md`, "When browser, when terminal"/);
});

test('the Layout gate names the mechanical signal that detects its own violation', () => {
  // The gate used to be judgment-only, and a real session violated it twice (927B of text
  // cards for "bottom sheet vs centered dialog") while the render debt read as settled.
  assert.match(quickStartMd, /newestScreenKind/);
  assert.match(quickStartMd, /`generated` means text cards are on screen/);
});

test('no tier tells the model to render EVERY screen with the generator', () => {
  // A CLASS guard, not a case fix. The always-paid tier carried "Hard rule — never
  // hand-write raw HTML/JSX… render every screen from a compact JSON spec", which is the
  // exact opposite of the Layout gate one tier down, and operation.md repeated it while
  // its own opening deferred to the gate. Two mandatory rules, mutually exclusive, with
  // the wrong one in the tier that is read first and read always.
  //
  // The generator is right for conceptual screens and forbidden for layout ones, so any
  // UNIVERSAL claim about it is the defect regardless of how it is worded.
  const universalGeneratorClaims = [
    /never hand-write/i,
    /render every screen/i,
    /instead of writing HTML inline/i,
    /always use `?scripts\/render-screen/i,
  ];
  const tiers = {
    'SKILL.md': skillMd,
    'references/visual-companion.md': quickStartMd,
    'references/visual-companion-operation.md': operationMd,
    'references/visual-companion-reference.md': referenceMd,
  };
  for (const [name, text] of Object.entries(tiers)) {
    for (const claim of universalGeneratorClaims) {
      assert.equal(claim.test(text), false, `${name} states ${claim} — that contradicts the Layout gate`);
    }
  }

  // Anti-staleness floor: a sweep whose corpus lost the rule would report zero violations
  // over zero statements. The split has to be stated where the model decides which to write.
  assert.match(skillMd, /render-screen\.cjs/, 'the always-paid tier still names the generator');
  assert.match(skillMd, /bespoke mockup/i, 'and still names its mandatory alternative');
  assert.match(quickStartMd, /Layout gate \(mandatory\)/);
});

// ============================================ bidirectional wait: the browser as INPUT

/**
 * Root cause this block locks down:
 *   The companion had both other legs — agent → browser and browser → server — but
 *   nothing carried a click to the AGENT. A click only surfaced on the agent's next
 *   turn, and a turn only begins when the user types. So the browser was an output
 *   device: clicking a mockup did nothing until the user ALSO said something.
 *
 * These assert the acceptance tier carries the PROCEDURE (a positive condition for when
 * to wait), not a prohibition. A rule phrased as "do not block unless…" is the shape
 * that has repeatedly failed to change behaviour in this repo; the shape that works is
 * "condition X holds → run this command".
 */

const referenceMd = fs.readFileSync(path.join(SKILL_DIR, 'references', 'visual-companion-reference.md'), 'utf8');

test('the acceptance tier gives a positive condition for waiting, not just a prohibition', () => {
  assert.match(quickStartMd, /Wait for the confirmation when the screen IS the question/);
  assert.match(quickStartMd, /wait-for-user\.cjs/);
  // The negative branch must ALSO be procedural (what to do instead), not a bare "don't".
  assert.match(quickStartMd, /Ask them to answer \*\*in the terminal\*\* instead when/);
});

test('the acceptance tier names the harness policy, because blocking the shell hangs the session', () => {
  assert.match(quickStartMd, /run this as a background task/i);
  assert.match(quickStartMd, /never block the shell/i);
});

test('_instructions is declared authoritative where the agent will actually read it', () => {
  // The whole token argument for shipping instructions in the payload collapses if the
  // prose does not tell the model to prefer them over its recollection of the prose.
  assert.match(quickStartMd, /_instructions/);
  assert.match(quickStartMd, /follow `_instructions` when it\s+conflicts/);
  assert.match(referenceMd, /`_instructions` wins/);
});

test('the acceptance tier stays a summary — the protocol table lives one tier down', () => {
  // Progressive disclosure, same asymmetry the render-debt tests lock above.
  assert.match(referenceMd, /## Waiting for the browser/);
  assert.match(referenceMd, /--settle-ms/);
  assert.doesNotMatch(quickStartMd, /--settle-ms/, 'flag reference belongs in the on-demand tier');
  assert.doesNotMatch(skillMd, /wait-for-user/, 'the always-paid tier must not carry this at all');
});

test('the reference explains why the fallback exists, not just that it does', () => {
  // A fallback whose REASON is undocumented gets deleted by the next person who reads
  // it as dead code. Both reasons are load-bearing: --reuse keeps old servers alive,
  // and fs.watch is not uniform across the platforms this skill supports.
  assert.match(referenceMd, /--reuse/);
  assert.match(referenceMd, /404/);
  assert.match(referenceMd, /fs\.watchFile/);
  assert.match(referenceMd, /WSL/);
});

test('the script every tier points at exists and loads', () => {
  const scriptPath = path.join(SKILL_DIR, 'scripts', 'wait-for-user.cjs');
  assert.ok(fs.existsSync(scriptPath), 'wait-for-user.cjs exists');
  assert.equal(typeof require(scriptPath).waitForEvent, 'function');
});

/**
 * Closes a class of defect rather than a case: adding step 4 to "The loop" renumbered
 * everything after it and silently invalidated two pointers that named "step 5". A
 * numbered pointer is a cross-file reference with no compiler behind it, so it drifts
 * the moment anyone inserts a step.
 */
test('every "The loop" step pointer resolves to a step that exists', () => {
  const loopSection = quickStartMd.split('## The loop')[1].split(/\n## /)[0];
  const stepCount = (loopSection.match(/^\d+\. \*\*/gm) || []).length;
  assert.ok(stepCount >= 6, `anti-staleness floor: found only ${stepCount} steps`);

  const sources = {
    'references/visual-companion-reference.md': referenceMd,
    'references/visual-companion-operation.md': operationMd,
    'scripts/check-visual-state.cjs': fs.readFileSync(
      path.join(SKILL_DIR, 'scripts', 'check-visual-state.cjs'), 'utf8'
    ),
  };
  const pointers = [];
  for (const [file, body] of Object.entries(sources)) {
    for (const m of body.matchAll(/"The loop" step (\d+)/g)) {
      pointers.push({ file, step: Number(m[1]) });
    }
  }
  assert.ok(pointers.length >= 3, `anti-staleness floor: found only ${pointers.length} pointers`);
  for (const { file, step } of pointers) {
    assert.ok(step >= 1 && step <= stepCount, `${file} points at "The loop" step ${step}, but the loop has ${stepCount} steps`);
  }
});

/**
 * The confirmation is the difference between "the agent saw a click" and "the user
 * answered". Without it, a misclick becomes a decision nobody made, and a screen can
 * only ever carry one question.
 */
test('the acceptance tier states that a click is NOT an answer', () => {
  assert.match(quickStartMd, /A click is exploration; only the Send button is an answer/);
  assert.match(quickStartMd, /submitted/, 'names the field that distinguishes the two');
});

test('the acceptance tier tells the model not to truncate a multi-select answer', () => {
  // The failure this prevents is silent: acting on finalSelection[0] looks correct and
  // throws away every other option the user deliberately confirmed.
  assert.match(quickStartMd, /data-multiselect/);
  assert.match(quickStartMd, /not just the\s+first/);
});

test('the model is told the Send button is rendered for it, not by it', () => {
  // The skill already forbids hand-written selection JavaScript for the same reason;
  // a hand-rolled submit would bypass the digest the agent reads.
  assert.match(quickStartMd, /never write it/);
});

test('the reference explains the version-skew reconcile, with its measured cause', () => {
  // A defence whose reason is undocumented gets deleted as redundant by the next
  // reader — this one exists because a live session deadlocked on it.
  assert.match(referenceMd, /re-derives the digest from the journal/);
  assert.match(referenceMd, /--reuse/);
  assert.match(referenceMd, /Sent ✓/, 'keeps the observed symptom, which is what makes it credible');
});

// ============================== end of design: the companion is an INPUT surface

/**
 * Root cause: the companion had NO explicit shutdown trigger anywhere. `stop-server.sh`
 * appeared only as a bare command with no firing condition, invoked by no gate and no
 * other skill, so the only thing that ever closed a companion was the 30-minute idle
 * timeout. That leaves a live input path open for half an hour after the design was
 * decided — and a click arriving through it is indistinguishable from a real answer.
 */
const afterDesignMd = fs.readFileSync(
  path.join(SKILL_DIR, 'references', 'after-the-design.md'), 'utf8'
);

test('the shutdown is a STOP step in the file that ends the brainstorming', () => {
  assert.match(afterDesignMd, /Close the visual companion — STOP/);
  assert.match(afterDesignMd, /stop-companion\.cjs/);
});

test('the shutdown fires where the design lands on disk, before the self-review', () => {
  // Position is the rule here: after the commit (every browser-informed decision is
  // written) and before the review loop (which is where the turn can end).
  const commitAt = afterDesignMd.indexOf('Commit the design document to git');
  const stopAt = afterDesignMd.indexOf('Close the visual companion');
  const reviewAt = afterDesignMd.indexOf('**Spec Self-Review:**');
  assert.ok(commitAt > 0 && stopAt > 0 && reviewAt > 0, 'all three anchors exist');
  assert.ok(commitAt < stopAt, 'the stop comes after the design is committed');
  assert.ok(stopAt < reviewAt, 'and before the self-review, not at the very end');
});

test('the shutdown states WHY, in terms of an input surface', () => {
  // A shutdown justified as tidiness gets deferred; one justified as closing an input
  // path does not. The measured lesson in this repo is that removing a REASON is what
  // makes a prose rule stop firing.
  assert.match(afterDesignMd, /INPUT surface/);
  assert.match(afterDesignMd, /already written and committed/);
});

test('the shutdown is unconditional, because a condition is where a step gets skipped', () => {
  assert.match(afterDesignMd, /unconditionally/);
  assert.match(afterDesignMd, /idempotent/);
  assert.match(afterDesignMd, /no-live-companion/, 'names the answer for "never launched"');
});

test('the shutdown promises the screens survive, so accepting it is cheap', () => {
  // If stopping could lose approved mockups, the safe move would be to keep the
  // surface open — which is the outcome this gate exists to prevent.
  assert.match(afterDesignMd, /sessions keep their screens/);
  assert.match(quickStartMd, /stopping loses nothing/);
});

test('the Stop section names its trigger instead of being a bare command', () => {
  const stopSection = quickStartMd.split('## Stop')[1];
  assert.match(stopSection, /Trigger: the spec is written and committed/);
  assert.match(stopSection, /stop-companion\.cjs/);
});

test('the shutdown script exists and loads', () => {
  const scriptPath = path.join(SKILL_DIR, 'scripts', 'stop-companion.cjs');
  assert.ok(fs.existsSync(scriptPath));
  assert.equal(typeof require(scriptPath).stopSession, 'function');
});
