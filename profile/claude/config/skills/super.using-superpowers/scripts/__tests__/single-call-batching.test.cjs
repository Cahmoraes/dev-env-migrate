'use strict';

/**
 * Prose-guard: deterministic probes that fire back-to-back with nothing between them
 * must be ordered as ONE tool call, not one call each.
 *
 * Background — what this locks:
 *   Every `node …cjs` / `python3 …` snippet a skill writes becomes one Bash round trip at
 *   runtime. Three places used to spend two round trips where one carries the same
 *   information, because two scripts read the SAME file with no user interaction and no
 *   data dependency between them:
 *
 *     1. Session start — read-preferences.cjs then derive-session-state.cjs. The second
 *        one calls the first's loader IN-PROCESS and now also emits `preferencesFound`,
 *        `malformed`, `session_has_corporate_artifacts` and the `corporateArtifacts` disk
 *        probe, so it returns a superset.
 *        The first call became dead weight: a second parse of a file already parsed.
 *     2. Brainstorming entry — resolved by removal: the index lives in the recall
 *        subagent, and the phase makes no main-thread script call at all. The assertion
 *        below guards the other direction — that no script call comes back into it.
 *     3. Execution entry — parse-plan.cjs then parse-tasks.cjs. Same tasks index, one
 *        answers "what shape is the plan", the other "what is already done"; neither
 *        reads the other's output.
 *
 * These are prose-in-SKILL.md invariants (no script owns them), so this grades the raw
 * bytes — same rationale as the cross-skill await-not-poll enumeration test.
 *
 * What this does NOT claim: that batching is always right. A pair separated by a user
 * question, or whose second call takes an argument from the first's output, MUST stay
 * split — those are asserted as still-split where they exist.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/single-call-batching.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const ROUTER = 'super.using-superpowers/SKILL.md';

/** Every fenced ```bash block's body, so we can ask "are these two commands in ONE call?" */
function bashFences(body) {
  const out = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

// ─── 1. Session start is ONE call ────────────────────────────────────────────

test('router loads the session in a single derive-session-state.cjs call', () => {
  const body = read(ROUTER);
  const fences = bashFences(body);

  assert.ok(
    fences.some((f) => f.includes('derive-session-state.cjs')),
    'the router must show the derive-session-state.cjs call it makes at session start',
  );
  assert.match(
    body,
    /One call, not two/i,
    'the router must state the one-call rule so the redundant read does not creep back',
  );
});

test('router never invokes read-preferences.cjs as a second read', () => {
  const body = read(ROUTER);

  // Naming the script in prose is required (it is the loader and the option-0 wizard's
  // entry point). Ordering a RUN of it is the duplicate round trip that was removed.
  assert.doesNotMatch(
    body,
    /scripts\/read-preferences\.cjs/,
    'the router must not invoke scripts/read-preferences.cjs — derive-session-state.cjs already returns its fields',
  );
  assert.match(
    body,
    /read-preferences\.cjs/,
    'the router must still NAME read-preferences.cjs (loader / option-0 wizard entry point)',
  );
});

test('the one-call read still carries every signal the router branches on', () => {
  const body = read(ROUTER);

  // The exact fields that made the second call look necessary. If any is dropped from
  // the prose, the router loses a branch and someone re-adds read-preferences.cjs.
  // `corporateArtifacts` is the newest of them and the one most likely to be split back
  // out: it is a DISK probe, not a preference, so it reads like a separate concern — but
  // it answers a question about the same `.superpowers/` directory the loader already
  // opened, and paying a second round trip for it would undo this whole file.
  for (const field of ['preferencesFound', 'malformed', 'session_has_corporate_artifacts', 'corporateArtifacts']) {
    assert.match(
      body,
      new RegExp(`\\b${field}\\b`),
      `the router must read ${field} off the single call — it is why the second read was droppable`,
    );
  }
});

test('derive-session-state.cjs actually emits what the router now expects of it', () => {
  // The prose promise above is only safe while the script keeps its side of it.
  // This is the seam where a script change would silently break the router.
  const script = read('super.using-superpowers/scripts/derive-session-state.cjs');
  for (const field of ['preferencesFound', 'malformed', 'session_has_corporate_artifacts', 'corporateArtifacts']) {
    assert.match(
      script,
      new RegExp(`\\b${field}\\b`),
      `derive-session-state.cjs must emit ${field}, or the router's single call loses a signal`,
    );
  }
});

// ─── 2. The bootstrap and the brainstorming entry are each ONE call ──────────

test('the bootstrap batches the state read AND the session-start read into one call', () => {
  // Round trips dominate start time: measured transcripts ran 4 calls/45s, 3/52s, 2/21s
  // while the scripts together cost well under a second of CPU. So the batch must live in
  // the bootstrap block, not merely be described elsewhere.
  const body = read(ROUTER);
  const block = body.slice(body.indexOf('**Deterministic read'), body.indexOf('It emits JSON'));

  assert.match(block, /derive-session-state\.cjs/, 'the bootstrap call must derive session state');
  assert.match(block, /cat \$B\/references\/session-start\.md/,
    'the bootstrap call must include the session-start read (dropping it costs a round trip)');
  // A pending-work probe here reads a tracker only as true as the execution loop marks it
  // (it announced a finished feature as "0/4 tasks"). Pending work is located on option 5.
  assert.doesNotMatch(block, /superpowers-status\.cjs/,
    'the bootstrap must not probe pending work — a stale tracker announces done work as pending');
  assert.match(block, /One call, two outputs/i,
    'the block must state how many outputs the one call carries, so a third does not creep in unnoticed');
});

test('brainstorming entry makes no main-thread script call, and the index is not in it', () => {
  // The index belongs to the Feature history recall subagent: it is retrieval that grows with
  // the repo, and an index sitting in the controller's context invites inline artifact reads.
  const body = read('super.brainstorming/references/research-fan-out.md');
  const fences = bashFences(body);
  const mainThread = fences.filter((f) => /^\s*(node|python3?)\s/m.test(f));
  assert.equal(mainThread.length, 0,
    `the entry must make no main-thread script call; found ${mainThread.length} fenced script blocks`);
});

test('the one shell call of the phase is counted where it is written', () => {
  // The gate forbids direct shell in the main agent during this phase. The single allowed
  // call (the path test for a pre-existing research artifact) is bounded by a count, so a
  // second call reads as a violation instead of as "one more exemption".
  const body = read('super.brainstorming/references/research-fan-out.md');
  assert.match(body, /only thing outside the `<RESEARCH-GATE>`/i,
    'the exemption must bound itself by counting the calls the phase is allowed');
  assert.match(body, /<RESEARCH-GATE>/, 'the gate the exemption refers to must exist');
});

// ─── 3. Execution entry parses plan + tasks in one call ─────────────────────

const EXECUTION_SKILLS = [
  'super.subagent-driven-development/SKILL.md',
];

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: parse-plan.cjs and parse-tasks.cjs share one fenced call`, () => {
    // 2026-09-22 (S10): the entry call grew into sdd-start.cjs, which runs both parsers plus
    // derive-session-state and branch-guard — one Bash call where there were four.
    const fences = bashFences(read(rel));
    const batched = fences.filter((f) => f.includes('sdd-start.cjs'));
    assert.ok(batched.length >= 1, `${rel} must open with the one start call`);
    const start = read('super.subagent-driven-development/scripts/sdd-start.cjs');
    for (const script of ['parse-plan.cjs', 'parse-tasks.cjs', 'derive-session-state.cjs', 'branch-guard.cjs']) {
      assert.ok(start.includes(`'${script}'`), `sdd-start.cjs must run ${script}`);
    }
  });

  test(`${rel}: states why the two parsers batch`, () => {
    const body = read(rel);
    assert.match(
      body,
      /one call reads the session, the plan, the progress and the branch/,
      `${rel} must justify the batch, so a later edit does not split it back apart`,
    );
  });
}

// ─── 4. Pairs that must STAY split ───────────────────────────────────────────
// Batching is not a blanket rule. This is the counter-example: the second call takes an
// argument computed from the first's output, so merging them would build a dispatch
// against targets that do not exist yet.

test('reviewing-specs keeps its targets/session reads ahead of the dispatch build', () => {
  const body = read('super.reviewing-specs/SKILL.md');
  const fences = bashFences(body);
  const merged = fences.filter(
    (f) => f.includes('resolve-review-targets.cjs') && f.includes('build-review-dispatch.cjs'),
  );
  assert.equal(
    merged.length,
    0,
    'must stay split: build-review-dispatch takes --targets and --capable-model from the earlier calls',
  );
});
