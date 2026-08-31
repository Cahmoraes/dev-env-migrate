'use strict';
/*
 * opening-phase-dispatch-turn.test.cjs — the Opening Phase reaches the user in ONE turn.
 *
 * A measured session drove this file. From the topic sentence to the first clarifying
 * question the user waited 159,8s, and only 84,6s of that was subagents:
 *
 *   27,9s  user states the topic
 *   36,1s  the two Opening Phase references are loaded (legitimate)
 *   40,5s  the confirmed-lessons load (legitimate, exemption #1)
 *   45,1s  `ls docs/superpowers/` in the main thread — 1.295 chars, gate violation
 *   52,7s  ten sequential task-creation calls, one per numbered step, 11,6s of bookkeeping
 *   84,2s  the fan-out — one message, three tracks, 56,3s after the topic was stated
 *  168,8s  last report lands
 *  187,7s  a research digest, then the first clarifying question
 *
 * The fan-out itself was never the problem: every arm measured, before and after, emitted
 * all three `task` calls in one assistant message. What the transcript shows as three
 * entries seconds apart is one response streaming its blocks, sharing one message id.
 *
 * Three defects, and none of them is the research itself:
 *
 *   1. The ten task-creation calls came from the SKILL.md line "You MUST create a task for
 *      each of these items", against a list of exactly ten numbered items. The instruction
 *      wanted ordering and completeness; what it bought was ten model turns of bookkeeping.
 *      It now states the ordering without commanding the bookkeeping.
 *   2. The inline `ls` happened nine seconds after the file forbidding it was read. The
 *      reason is in the file: the gate said "no `bash`" while the phase REQUIRES two `bash`
 *      calls, so the blanket was already false and a third call did not feel like crossing
 *      anything. The gate now names the two and permits only those — and the two exemptions
 *      agree on the count, which they did not before ("and nothing else" vs "second and last").
 *   3. The first clarifying question was "what is the objective of this service? A/B/C/D".
 *      No report was needed to ask it, and none of the three reports changed it. Holding it
 *      until the fan-out returned cost the user 84,6s of silence for nothing, so it now goes
 *      out WITH the dispatches.
 *
 * The ordering hazard in fix 3, and why the rule reads the way it does: step 2 of the SKILL.md
 * list requires the visual-companion offer to be its OWN message, never combined with a
 * clarifying question, and to come before the questions. So the dispatch turn carries the
 * offer when a visual signal matches and the clarifying question only when none does. A rule
 * that just said "ask the first question with the dispatch" would silently invert those two.
 *
 * SKILL.md sits at the 20.000-character compaction cap, so these rules are split: the
 * behaviour-defining clause is in SKILL.md, the reasoning and the rootness test are in the
 * fan-out reference, which the measured session did load, at 36,1s, before dispatching.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/opening-phase-dispatch-turn.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const SKILL = 'super.brainstorming/SKILL.md';
const FAN_OUT = 'super.brainstorming/references/research-fan-out.md';

test('the numbered list orders the work without commanding a task-tracking detour', () => {
  const body = read(SKILL);
  const steps = (body.match(/^\d+\. \*\*/gm) || []).length;
  assert.ok(steps >= 8, `the list must still be a numbered procedure, found ${steps} items`);
  // One bookkeeping call per numbered item is the cost of asking for one, and it is paid
  // before any research is dispatched. Ordering and completeness are what the line wanted.
  assert.doesNotMatch(body, /create a task for each/i,
    'a task per numbered item buys ordering that the wording already carries, at one model '
    + 'turn each — state the ordering, not the bookkeeping');
  assert.match(body, /work these items in order, skipping none/i,
    'dropping the bookkeeping must not drop the ordering or the completeness requirement');
});

test('the dispatch turn also carries the message the user is owed', () => {
  const body = read(SKILL);
  assert.match(body, /single turn\*\*, and close that turn with the message step 2 or 3 owes the user/i,
    'the dispatch turn must speak to the user — otherwise the fan-out is dead air');
  assert.match(body, /neither waits on research/i,
    'the rule only holds if the message is stated to be research-independent');
});

test('the dispatch turn respects the visual-companion ordering', () => {
  // Step 2 requires the offer to be its own message and to precede the clarifying questions.
  // Sending the first clarifying question with the dispatches would jump over it, so the
  // rule has to name which of the two goes out.
  for (const [file, rel] of [[read(SKILL), SKILL], [read(FAN_OUT), FAN_OUT]]) {
    assert.match(file, /companion offer (if|when) a visual signal matches, otherwise (your|the) first clarifying question/i,
      `${rel} must route between the offer and the question, not assume the question`);
  }
});

test('the artifact test is conditional on being handed a slug, not on finding one', () => {
  // Three measured runs, three different improvisations, all of them enumerations:
  // `ls docs/superpowers | grep -i meteor`, a glob on a guessed slug, and a compound
  // `test -f ... || (ls ... | grep ...)` fallback. Two rounds of prohibition made it worse
  // (1 violation, then 2). The cause is not compliance: the instruction asked for a path
  // built from a `<feature>` slug that does not exist yet at this point in the flow, so the
  // only way to obey was to go find one. Removing the unknown removes the improvisation —
  // no slug in hand, no path, no call.
  const body = read(FAN_OUT);
  assert.match(body, /This test runs only when you were handed the slug/i,
    'the precondition is the fix: an unknown slug in the path is what forces the enumeration');
  assert.match(body, /Without a slug in hand there is no path to test, and this section is skipped entirely/i,
    'the skip has to be stated as the default, or a missing slug reads as something to go resolve');
  assert.match(body, /```bash\ntest -f docs\/superpowers\/<slug>\/research\/research-<slug>\.md /,
    'the call must be literal and fenced — the fenced lessons load was run verbatim in every '
    + 'measured run, while the prose-described path test was improvised in every one');
});

test('SKILL.md carries the shape of the opening phase, not just its steps', () => {
  // Both rules had lived only in the fan-out reference, which is read ~40s and five tool
  // calls before the dispatch. Neither held. SKILL.md is the file still in the window.
  const body = read(SKILL);
  assert.match(body, /with no slug there is nothing to test, and no second call/i,
    'the default of one shell call belongs where the step is ordered, not only in the reference');
  assert.match(body, /launch every applicable track as `task` calls \*\*in a single message\*\*/i,
    'the dispatch shape belongs in the always-loaded file, not only in a reference read earlier');
  // Same lesson, third time: an A/B where the executor did not re-open the fan-out scored the
  // fixed prose 1/8 — the same as the unfixed prose. The reports land ~6 tool calls after the
  // reference was read, so the rule has to be in the file that is still there.
  assert.match(body, /one line naming the track that finished/i,
    'the returning-report turn happens far enough from the fan-out read that a reference-only rule '
    + 'does not reach it');
  // "never a restatement of the question" left a gap the cold A/B walked through: "ainda
  // aguardando as outras duas tracks e sua resposta anterior" restates nothing and is the
  // same noise. The exclusion has to cover everything still pending, not just the question.
  assert.match(body, /never a word about what is still pending/i,
    'naming what the line contains without excluding the filler leaves the filler available');
});

test('a returning report gets one line naming its track, because silence is not available', () => {
  // Asking the opening question up front leaves the controller with nothing to do while the
  // reports land. A measured run filled that gap with two agent-listing calls and three
  // "still waiting" messages. "Say nothing while you wait" removed the polling half and not
  // the messaging half: a later run tried the silent turn, got "[Your previous response had
  // no visible output. Please continue and produce a user-visible response.]", and then
  // restated the pending question once per returning subagent — three times.
  const body = read(FAN_OUT);
  assert.match(body, /the whole turn is one line naming the track that finished/i,
    'the dead turn is mandatory, so the rule has to say what goes in it, not that it is empty');
  assert.match(body, /Silence is not available/i,
    'without naming the constraint, the rule reads as optional and silence gets attempted again');
  assert.match(body, /Never report that you are still waiting/i,
    'the improvised filler is a restatement of the pending question; it has to be named to be excluded');
  assert.doesNotMatch(body, /Say nothing while you wait/i,
    'the superseded rule would win against the one-liner — the harness rejects the silent turn');
  assert.match(body, /list running agents/i,
    'the anti-polling rule must name the agent-listing call, which is how the poll actually happens');
});

test('the fan-out states the turn budget between loading it and dispatching', () => {
  const body = read(FAN_OUT);
  assert.match(body, /Between finishing this file and the dispatch turn, nothing goes in between/i,
    'the phase needs a stated turn budget — every step in between is latency the user pays');
  assert.match(body, /Exactly two shell calls belong to this phase/i,
    'the budget must be a countable enumeration; "no bash" was already false and got ignored');
});

test('the gate permits the two shell calls it actually needs, and no more', () => {
  const gate = read(FAN_OUT).match(/<RESEARCH-GATE>[\s\S]*?<\/RESEARCH-GATE>/);
  assert.ok(gate, 'the RESEARCH-GATE block must exist');
  // A prohibition the procedure itself has to break twice is not a prohibition. Naming the
  // two permitted calls is what makes a third one visibly outside the list.
  const forbidden = gate[0].match(/Do NOT call([^\n]*?)or any web-search tool/i);
  assert.ok(forbidden, 'the gate must enumerate the tools it forbids outright');
  assert.doesNotMatch(forbidden[1], /`bash`/i,
    'the gate must not blanket-forbid `bash` while the phase requires two `bash` calls');
  assert.match(gate[0], /call `bash` only for the two commands named above/i,
    'the gate must bound `bash` by enumeration rather than by a prohibition it contradicts');
});

test('the opening question is defined by what research cannot answer', () => {
  const body = read(FAN_OUT);
  assert.match(body, /The opening question is the one no research can answer/i,
    'without a test for which question qualifies, a branch question goes out unresearched');
  assert.match(body, /it is a branch question, not the opening one/i,
    'the test needs its failing side named, or every question looks like an opening one');
  assert.match(body, /the question goes out alone and the dispatch waits for the answer/i,
    'a topic too vague to aim any track is the one case where the dispatch must wait');
});

test('the reports land without a digest, because the user is already answering', () => {
  const body = read(FAN_OUT);
  assert.match(body, /There is no digest to post\*\* when the reports land|There is no digest to post when the reports land/i,
    'a digest is a turn between the reports and the next question, and the user did not ask for it');
  assert.match(body, /the one-line track acknowledgment above is the whole message/i,
    '"nothing to announce" now sits next to a rule that mandates one line — unreconciled, the '
    + 'absolute reading wins and the silent turn comes back');
  assert.match(body, /fold what you learned into the next question/i,
    'suppressing the digest must say where the findings go instead');
});

test('SKILL.md stays under the compaction cap that these rules were sized against', () => {
  const chars = read(SKILL).length;
  assert.ok(chars < 20000,
    `SKILL.md is ${chars} characters; past 20.000 the tail is dropped after a compaction, and `
    + 'the dispatch-turn rule lives close enough to the end to be what goes');
});
