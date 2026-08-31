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
 *     2. Brainstorming entry — feature-index.cjs then lessons.py. Two local reads of
 *        already-digested content, neither consuming the other's output, both made in
 *        the main thread before the research fan-out. RESOLVED BY REMOVAL, 2026-08-11:
 *        the index moved into the recall subagent, so one call remains and there is
 *        nothing left to batch. The assertion below now guards the other direction —
 *        that the index does not come back into the main-thread block.
 *     3. Execution entry — parse-waves.cjs then parse-tasks.cjs. Same tasks index, one
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
  assert.match(block, /One call, two outputs/i,
    'the block must state how many outputs the one call carries, so a third does not creep in unnoticed');
});

test('brainstorming entry is ONE main-thread call, and the index is not in it', () => {
  // This entry used to be a batched pair (feature-index.cjs + lessons.py) and is now
  // deliberately unbatched — recorded here because the file's default reading is that two
  // adjacent probes should be merged, and merging these back would undo two fixes at once.
  //
  // The index moved into the Feature history recall subagent: it is retrieval that grows
  // with the repo (~27.000 chars measured), and an index sitting in the controller's
  // context is what invited the inline artifact reads that followed it. Its removal from
  // the block also removed the batching that let two skills' base-dirs collapse into one
  // variable (base-dir-collapse.test.cjs). What is left is one call, which is the floor.
  const body = read('super.brainstorming/references/research-fan-out.md');
  const fences = bashFences(body);
  const mainThread = fences.filter((f) => /^\s*(node|python3?)\s/m.test(f));
  assert.equal(mainThread.length, 1,
    `the entry must be exactly one main-thread call; found ${mainThread.length} fenced command blocks`);
  assert.match(mainThread[0], /lessons\.py/, 'the surviving call is the confirmed-lessons load');
  assert.doesNotMatch(mainThread[0], /feature-index\.cjs/,
    'the index must not be re-batched into the main thread — it belongs to the recall subagent');
});

test('the lessons read is exempted from the RESEARCH-GATE in writing, not by assumption', () => {
  // The gate forbids direct `bash` in the main agent during this phase. Without a written
  // exemption a reader either hesitates or wraps a two-line read in a subagent.
  const body = read('super.brainstorming/references/research-fan-out.md');
  // Anchored to the load section itself: the exemption has to be where the call is
  // written, not further down beside the gate, where a reader running the call is no
  // longer looking.
  const exemption = body.slice(body.indexOf('lessons.py'), body.indexOf('## Detect a pre-existing'));
  assert.match(exemption, /RESEARCH-GATE/,
    'the inline load must name the gate it is exempt from, above the gate itself');
  assert.match(exemption, /it needs no subagent/i,
    'the exemption must say this read runs inline, not through a subagent');
  // Scope matters as much as the exemption itself: stated without a boundary, a reader
  // carries it forward to whatever they open next (measured twice — a `find` plus a full
  // design doc landed in the main thread right after this block, both times).
  // The boundary is a COUNT, not a closing phrase: the phase legitimately has a second
  // exempt call, and the earlier wording ("and nothing else") contradicted it, which is how
  // a third call stopped reading as a violation of anything.
  assert.match(exemption, /first of exactly two things outside the `<RESEARCH-GATE>`/i,
    'the exemption must bound itself by counting the calls the phase is allowed');
  assert.match(read('super.brainstorming/references/research-fan-out.md'),
    /second and last thing outside the `<RESEARCH-GATE>`/i,
    'the two exemptions must agree on the count, or neither bounds anything');
});

// ─── 3. Execution entry parses waves + tasks in one call ─────────────────────

const EXECUTION_SKILLS = [
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
];

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: parse-waves.cjs and parse-tasks.cjs share one fenced call`, () => {
    const fences = bashFences(read(rel));
    const batched = fences.filter(
      (f) => f.includes('parse-waves.cjs') && f.includes('parse-tasks.cjs'),
    );
    assert.ok(
      batched.length >= 1,
      `${rel} must show both parsers in ONE bash block — same index, no data dependency, nothing in between`,
    );
  });

  test(`${rel}: states why the two parsers batch`, () => {
    const body = read(rel);
    assert.match(
      body,
      /[Bb]oth parsers go in this one call/,
      `${rel} must justify the batch, so a later edit does not split it back apart`,
    );
  });
}

// ─── 4. The caveman block is rendered once per window, not once per dispatch ──
// It is a pure function of two session-constant inputs, so a wave of N tasks was
// paying 3N identical calls for one identical answer. Reuse is safe ONLY while the
// bytes still come from the renderer — the anti-hand-assembly invariant is unchanged.

test('caveman propagation renders both formats once and reuses them', () => {
  const canonical = 'super.subagent-driven-development/SKILL.md';
  const body = read(canonical);
  const fences = bashFences(body);

  assert.ok(
    fences.some((f) => {
      const n = (f.match(/render-caveman-block\.cjs/g) || []).length;
      return n >= 2 && f.includes('--format field');
    }),
    'both block formats (default + --format field) must be rendered in ONE call',
  );
  assert.match(
    body,
    /reuse the two strings|do not re-run the renderer per dispatch/i,
    'the canonical skill must state that the rendered blocks are reused across dispatches',
  );
});

test('caveman reuse keeps the anti-hand-assembly invariant and names its invalidation', () => {
  const body = read('super.subagent-driven-development/SKILL.md');

  // Reuse must never become "write it from memory" — that is the bug the renderer exists for.
  assert.match(
    body,
    /never retyping it from recollection|never hand-assemble/i,
    'reuse must not license reconstructing the block from recollection',
  );
  // A cache with no invalidation rule is a correctness bug waiting on a level change.
  assert.match(
    body,
    /[Rr]e-render when/,
    'the reuse rule must name when the cached blocks go stale',
  );
  for (const trigger of ['session_caveman_level', 'compaction']) {
    assert.match(
      body,
      new RegExp(trigger, 'i'),
      `the invalidation rule must cover ${trigger}`,
    );
  }
});

// ─── 5. Pairs that must STAY split ───────────────────────────────────────────
// Batching is not a blanket rule. These two are the counter-examples: each one's second
// call takes an argument computed from the first's output, so merging them would dispatch
// against a manifest that does not exist yet.

test('in-tree keeps check-wave-disjoint.cjs and validate-dispatch.cjs as separate calls', () => {
  const fences = bashFences(read('super.parallel-subagent-in-tree/SKILL.md'));
  const merged = fences.filter(
    (f) => f.includes('check-wave-disjoint.cjs') && f.includes('validate-dispatch.cjs'),
  );
  assert.equal(
    merged.length,
    0,
    'these must stay split: validate-dispatch consumes the writeSet that check-wave-disjoint computes',
  );
});

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
