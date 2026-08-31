'use strict';
/*
 * feature-history-recall.test.cjs — recall is a DISPATCH: the feature index and the
 * artifacts behind it are read by a subagent, never by the main thread.
 *
 * Two measured sessions, both real entries into super.brainstorming, drove this file to its
 * current shape.
 *
 * The first: after the controller loaded the index inline, it went on to open the artifacts
 * itself — one `find` over two feature trees returning ~70 raw paths, then a full design doc
 * via `Read`. The fix at the time was to dispatch only that deep read, keeping the index
 * inline on the argument that it was "already in hand".
 *
 * The second, with that fix in place, showed the argument was wrong. The inline index landed
 * ~27.000 characters in the controller, and the controller then did the deep read inline
 * anyway (~24.000 more) — because an index sitting in your context is an invitation to act
 * on it where you are. It also surfaced only ONE of two features the topic touched, having
 * fixed on the closest match and stopped.
 *
 * So the whole of recall — index, selection, artifact reading — is now one subagent
 * dispatched with the rest of the fan-out. The three lessons pinned here:
 *
 *   1. The INDEX itself must not be an inline read. Its size grows with the repo, and it is
 *      retrieval, which is what the fan-out exists for. Dispatching costs no wall-clock: it
 *      rides a turn that was already happening.
 *   2. Selection must not stop at the closest match. A topic usually touches the feature
 *      that built the thing AND the ones that later changed it.
 *   3. PROCEDURE beats prohibition. "Do not read inline" alone has failed twice; the rule
 *      only holds because there is a named track with a template for the impulse to go to.
 *
 * The contract then moved out of `references/research-subagent-templates.md` into
 * `agents/feature-history-recall.md`. It had outgrown the file: 5.760 of its 8.692 characters,
 * against 1.092 for the three sibling tracks put together, and it is the only one carrying a
 * declarative dispatch block, a model slot and an output contract — which is exactly what the
 * repo's other `agents/` files are. The three that stayed are four-line fill-ins.
 *
 * Two traps that cost a red suite when the file was written, both worth knowing before editing it:
 *
 *   - Several assertions below match a phrase VERBATIM ("Do not stop at the best match",
 *     "Do not read the implementation source", "running in parallel right now"). Re-wrapping a
 *     paragraph splits the phrase across a newline and the match dies, with no change in meaning.
 *     The prompt scalar keeps one long line per paragraph for that reason.
 *   - The prompt-scalar stray-line check requires every line under `prompt: |` to be indented
 *     into it. A dedented line reads fine and silently stops being sent to the subagent.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/feature-history-recall.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const FAN_OUT = 'super.brainstorming/references/research-fan-out.md';
const TEMPLATES = 'super.brainstorming/references/research-subagent-templates.md';
const AGENT = 'super.brainstorming/agents/feature-history-recall.md';
const SKILL = 'super.brainstorming/SKILL.md';

test('the RESEARCH-GATE exemption is scoped to the one load call, not to the phase', () => {
  const body = read(FAN_OUT);
  // The boundary is stated as a COUNT, and the two exemptions agree on it: this one is "first
  // of exactly two", the deep-research path test below is "second and last". The earlier
  // wording claimed this call was the only one ("and nothing else"), which the second
  // exemption then contradicted — and a file that disagrees with itself about how many
  // exceptions exist is read as having no fixed number at all, which is how a third one
  // (an inline `ls`) gets taken.
  assert.match(body, /first of exactly two things outside the `<RESEARCH-GATE>`/i,
    'the exemption must name its own boundary — an open-ended one reads as covering the phase');
  assert.match(body, /second and last thing outside the `<RESEARCH-GATE>`/i,
    'the two exemptions must agree on the count, or neither bounds anything');
  assert.match(body, /does not extend to anything you decide to open afterwards/i,
    'the exemption must say explicitly that later reads are NOT covered');
  // The feature history is the specific thing a reader carried the exemption to, twice.
  assert.match(body, /least of all to the feature history/i,
    'the exemption must name the read it was actually stretched to cover');
});

test('the index itself is dispatched, not read inline', () => {
  const body = read(FAN_OUT);
  // The regression this file exists for. An inline index is what both measured sessions had.
  assert.doesNotMatch(body, /main thread[^.\n]*not a subagent/i,
    'the feature index must no longer be described as a main-thread read');
  assert.match(body, /Feature history recall subagent, dispatched with the rest of the fan-out/i,
    'the fan-out must say where the index runs');
  // The rationale has to travel with the rule: a bare prohibition is the shape that failed.
  assert.match(body, /many KB|thousands of tokens/i,
    'the fan-out must state the cost that makes the main thread the wrong place');
  assert.match(body, /No extra wall-clock/i,
    'the one real objection to dispatching — a round trip — must be answered where the rule is stated');
});

test('investigating a past feature is classified as research, in the paid layer', () => {
  // SKILL.md is what the controller has when it decides. Both measured sessions had the
  // RESEARCH-GATE in front of them and still ran `find`/`Read` over docs/superpowers/,
  // because "investigating history" did not read as "research".
  const body = read(SKILL);
  assert.match(body, /Reading a past feature counts as research/i,
    'SKILL.md must classify history reading as research — the gate alone did not cover it');
  assert.match(body, /feature-history recall/i,
    'SKILL.md must name the track that owns it, or the classification has no destination');
  assert.match(body, /\*every\* feature the topic touches/i,
    'the no-stopping-at-the-first rule must survive compaction, not live only in a reference');
});

test('the recall is a row in the dispatch table, so the fan-out actually launches it', () => {
  const body = read(FAN_OUT);
  const table = body.slice(body.indexOf('| Subagent | When | Agent type |'), body.indexOf('**Project constitution'));
  assert.ok(table.length > 0, 'the dispatch table must exist');
  assert.match(table, /\*\*Feature history recall\*\*/,
    'a track with no row in the table is a track the fan-out never launches');
  assert.match(table, /never one per slug/i,
    'one subagent covers every slug — per-slug fan-out multiplies dispatches for one topic');
  // "Only when you think you need it" is how the old deep-read row was worded, and it is
  // why a session never dispatched one: the controller always thinks it can judge relevance
  // from the index it is already holding.
  assert.match(table, /\*\*Always\*\*/,
    'recall must be unconditional — a discretionary row is one the controller talks itself out of');
  // The condition used to read "Always, UNLESS this repo has no docs/superpowers/" — which
  // cannot be evaluated without looking, and a measured session duly ran `ls docs/superpowers/`
  // inline to evaluate it. A precondition that requires the forbidden read is a defect in
  // the precondition, not in the reader: the empty case already costs one cheap dispatch.
  assert.match(table, /do \*\*not\*\* check the directory first/i,
    'the row must not make the controller look before dispatching — that look is the inline read');
});

test('no gate asks the controller to inspect docs/superpowers before dispatching', () => {
  const body = read(FAN_OUT);
  const offenders = body.split('\n').filter((l) =>
    /\b(ls|find|check whether|verify that)\b[^\n]{0,60}docs\/superpowers/i.test(l)
    && !/do \*\*not\*\*|never|forbid/i.test(l));
  assert.deepEqual(offenders, [],
    'a condition the controller can only evaluate by reading docs/superpowers/ turns the '
    + 'gate itself into the inline read it forbids');
});

test('the recall contract lives in agents/, and the templates file does not restate it', () => {
  // Placement follows the convention the rest of the repo already uses: agents/ holds a
  // dispatched agent's full contract (purpose, toolset bound, model slot, output shape) —
  // implementer.md, verifier.md, spec-reviewer.md. What stays in the templates file are the
  // three four-line fill-ins that have no contract at all. Restating the recall in both is
  // the duplication that drifts: two copies, one of them stale, and no signal which.
  assert.ok(fs.existsSync(path.join(SKILLS, AGENT)), 'the recall contract must exist in agents/');
  const templates = read(TEMPLATES);
  assert.match(templates, /\.\.\/agents\/feature-history-recall\.md/,
    'the templates file must route the recall track, or a reader stops at the three it still holds');
  assert.doesNotMatch(templates, /STEP 1 —|feature-index\.cjs/,
    'the recall steps must live in exactly one file — a second copy is the one that goes stale');
});

test('the template forbids stopping at the closest match', () => {
  const section = read(AGENT);

  assert.match(section, /Do not stop at the best match/i,
    'the measured miss was a second relevant feature left unreported');
  assert.match(section, /Err toward including/i,
    'the tie-break must be written, or an uncertain reader drops the second feature');
  // The forcing function: a report with an empty rejection list is evidence of no search.
  assert.match(section, /\*\*Considered and rejected\*\*/,
    'the near-misses must be reported, so under-selection is visible instead of invisible');
  assert.match(section, /an empty one means you did not look/i,
    'the rejection list needs a stated failure reading, otherwise it is skipped as optional');
});

test('the template returns a summary, never raw artifact text or the index', () => {
  const section = read(AGENT);

  for (const heading of ['Features found', 'Closed decisions', 'Out of scope', 'Considered and rejected', 'Where to look next']) {
    assert.ok(section.includes(heading), `the template must ask for "${heading}"`);
  }
  assert.match(section, /Never paste whole sections, and never paste the index/i,
    'the index is the biggest single payload here — forbidding it by name is the point');
  assert.match(section, /at most 15 bullets/i, 'the response must be capped');
});

test('the template narrows before it deepens, so the index scales past a few dozen features', () => {
  // The index grows ~485 chars/feature and its budget ladder degrades GLOBALLY: measured on
  // a synthetic repo, 200 features lands on `brief` (every out-of-scope line gone) and 300
  // on `slugs` (names only) — the worst-measured rung, arriving exactly when telling two
  // similar features apart is hardest. Scoping the second call with --feature makes the cost
  // O(candidates) instead of O(repo), and the ladder stops firing at all.
  const section = read(AGENT);

  assert.match(section, /--detail slugs/,
    'step 1 must list every feature by name only — that is what stays cheap at any repo size');
  assert.match(section, /--feature <slug-1>,<slug-2>/,
    'step 2 must pull full detail for the CANDIDATES only, via the scoping flag');
  // Order matters twice over: full-detail-then-narrow is the shape that blows the budget,
  // and a prompt whose STEP labels run out of sequence is one the reader executes out of
  // sequence. Check the commands AND the labels — a mutation that renames only the labels
  // leaves the commands ordered and would otherwise pass.
  assert.ok(section.indexOf('--detail slugs') < section.indexOf('--feature <slug-1>'),
    'the cheap breadth pass must come first — narrowing after a full call saves nothing');
  const steps = [...section.matchAll(/^\s*STEP (\d+) —/gm)].map((m) => Number(m[1]));
  assert.deepEqual(steps, [1, 2, 3, 4],
    `the prompt's steps must read 1..4 in order, got ${JSON.stringify(steps)} — a reader `
    + 'follows the numbering, not the position');
  // The evidence for the split, kept here because a test header is dev-only and free:
  // slugs alone scored recall 0,91 on candidate FINDING, while `full` returned 3 false
  // positives where `slugs` returned 8 — breadth is cheap on names, precision needs the
  // out-of-scope lines. The reference states the rule; this records why it is true.
  assert.match(section, /slugs alone are enough to \*find\* candidates/,
    'the reason slugs suffice for FINDING candidates must travel with the step');
  assert.match(section, /out-of-scope lines are what let you \*reject\*/,
    'the other half — what the full rung buys — must be stated too, or step 3 reads as optional');
  assert.match(section, /O\(candidates\), not O\(repo\)/,
    'the scaling claim is the whole point of the split and must be stated');
});

test('the recall dispatch is declared, not described in prose', () => {
  // Prose stating "use tier standard" is a sentence the controller may or may not act on.
  // The convention that works elsewhere in this repo (agents/implementer.md) is a
  // declarative dispatch block: the fields are the contract, and `model:` is a slot that
  // has to be filled rather than a claim in a paragraph.
  const section = read(AGENT);

  assert.match(section, /```yaml\nSubagent \(explore\):/,
    'the dispatch must be a declared block headed by the role (`Subagent`), matching the '
    + 'implementer template convention — never by a harness tool name, which is per-platform '
    + 'and wrong on any harness whose dispatch tool is not called Task');
  assert.match(section, /^\s{2}model: \[REQUIRED\./m,
    'model must be a REQUIRED slot — an omitted model inherits the controller and over-provisions');
  assert.match(section, /Subagent \(explore\):.*agent TYPE.*never a tool/,
    'the agent type is declared in the header slot (where every sibling template puts '
    + '`general-purpose`), and the warning must ride on that line — dispatching `explore` '
    + 'as a tool fails with "No such tool available"');

  // The boundary that decides what the subagent actually receives: anything above
  // `prompt: |` is controller-facing and never reaches it. The four steps must be inside.
  const promptAt = section.indexOf('  prompt: |');
  assert.ok(promptAt > 0, 'the block must carry a prompt scalar');
  const promptBody = section.slice(promptAt);
  for (const step of ['STEP 1', 'STEP 2', 'STEP 3', 'STEP 4', 'Features found']) {
    assert.ok(promptBody.includes(step),
      `"${step}" sits above prompt: | — content there is read by the controller and never sent`);
  }
  const stray = promptBody.split('\n').slice(1)
    .filter((l) => l.trim() && !l.startsWith('    ') && l.trim() !== '```');
  assert.deepEqual(stray, [],
    'every line under prompt: | must be indented into the scalar; a dedented line silently '
    + 'leaves the prompt and becomes controller-only text');
});

test('the interview has a route back into a feature, so the gate is not a dead end', () => {
  // The gate correctly forbids opening artifacts inline. Without a named alternative that is
  // a prohibition with no procedure — the shape that has already failed twice here. The
  // first recall judges relevance from the topic sentence alone; three questions in, the
  // controller knows more than it did.
  const body = read(FAN_OUT);
  assert.match(body, /The gate does not lapse when the interview starts/i,
    'the gate must state its own duration — "during this phase" is read as "before the questions"');
  assert.match(body, /dispatch a scoped second recall/i,
    'the pull to look again needs a destination, not just a prohibition');
  assert.match(body, /never re-run the unscoped index/i,
    'the second pass must be scoped — re-running breadth pays for what is already known');
});

test('the deep-research existence check is exempted, so the gate does not swallow it', () => {
  // Measured on a dry-run entry into the Opening Phase: the controller read the gate plus the
  // recall row's "do not check the directory first", concluded that ALL of docs/superpowers/
  // was off-limits to it, and skipped the pre-existing-artifact detection entirely — reporting
  // that it had done so. The cost of that reading is the opposite of what the gate is for: a
  // full fan-out re-run over ground an adversarially-verified artifact already covers.
  //
  // Two reads of docs/superpowers/ that look alike and are not: testing ONE path for existence
  // (bounded, one call) versus walking the feature trees (grows with the repo, and is the
  // dispatch's whole job). The gate is about volume, so the boundary has to be drawn on volume.
  const body = read(FAN_OUT);
  assert.match(body, /second and last thing outside the `<RESEARCH-GATE>`/i,
    'the exemption must be enumerated — an unnumbered second exemption is how a third appears');
  assert.match(body, /not the read the recall track owns/i,
    'it must distinguish itself from the recall dispatch, which is what the reader confused it with');
  assert.match(body, /Skipping this check because the gate looks like it covers it/i,
    'the observed misreading must be named, or the same reading is available to the next reader');
});

test('the recall track pins its tier, and it is not cheap', () => {
  // The general rule above offers cheap (inventory) OR standard (synthesis) and leaves the
  // choice to the reader. Recall reads like inventory and is not. Measured on the mechanism
  // this replaced: a cheap synthesizer reported "no relevant memory" over a store that had
  // it — and an empty recall report is indistinguishable from a repo with no history, so
  // the failure is invisible at the point where it matters.
  const section = read(AGENT);
  assert.match(section, /Tier `standard`\.\s*NOT `cheap`/,
    'the track must name its own tier — the general rule alone leaves it to judgment');
  assert.match(section, /indistinguishable from a repo with no history/i,
    'the reason must travel with the rule: this failure mode is silent, not loud');
});

test('the template keeps the recall off the codebase, which another track owns', () => {
  const section = read(AGENT);
  assert.match(section, /Do not read the implementation source/i,
    'two subagents reading the same ground is duplicated cost and contradictory reports');
  assert.match(section, /running in parallel right now/i,
    'the scope fence must say WHY, or it reads as an arbitrary limit');
});

test('the template tells the controller to resolve the base-dir placeholder', () => {
  // A subagent prompt is plain text: the harness expands `<super.X-base-dir>` for the skill
  // it invoked, not for anything the controller pastes into a dispatch. Left unresolved,
  // the subagent runs `node "<super.brainstorming-base-dir>/..."` literally and fails.
  const section = read(AGENT);
  assert.match(section, /Resolve the placeholder before dispatching/i,
    'the controller must be told the subagent gets no placeholder expansion');
  // Only ONE skill's base-dir may appear here: feature-index.cjs lives in this skill, so
  // there is no sibling path to get wrong (see base-dir-collapse.test.cjs).
  const placeholders = new Set(section.match(/<super\.[a-z-]+-base-dir>/g) || []);
  assert.deepEqual([...placeholders], ['<super.brainstorming-base-dir>'],
    'the recall prompt must reference this skill only — a second skill here reopens the collapse');
});
