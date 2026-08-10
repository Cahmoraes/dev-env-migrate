'use strict';

/**
 * Prose-guard: deterministic probes that fire back-to-back with nothing between them
 * must be ordered as ONE tool call, not one call each.
 *
 * Background — what this locks:
 *   Every `node …cjs` / `pmem …` snippet a skill writes becomes one Bash round trip at
 *   runtime. Three places used to spend two round trips where one carries the same
 *   information, because two scripts read the SAME file with no user interaction and no
 *   data dependency between them:
 *
 *     1. Session start — read-preferences.cjs then derive-session-state.cjs. The second
 *        one calls the first's loader IN-PROCESS and now also emits `preferencesFound`,
 *        `malformed` and `session_has_corporate_artifacts`, so it returns a superset.
 *        The first call became dead weight: a second parse of a file already parsed.
 *     2. Memory re-sync gate — check-resync.cjs then `pmem embedding-status`. Step 4 is
 *        unconditional and consumes nothing from step 1, so on the common `dirty:false`
 *        path they are two probes with nothing in between.
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

  // Naming the script in prose is required (it is the loader, the option-0 wizard's
  // entry point, and the path anchor for check-resync.cjs). Ordering a RUN of it is the
  // duplicate round trip that was removed.
  assert.doesNotMatch(
    body,
    /scripts\/read-preferences\.cjs/,
    'the router must not invoke scripts/read-preferences.cjs — derive-session-state.cjs already returns its fields',
  );
  assert.match(
    body,
    /read-preferences\.cjs/,
    'the router must still NAME read-preferences.cjs (loader / option-0 wizard / check-resync path anchor)',
  );
});

test('the one-call read still carries every signal the router branches on', () => {
  const body = read(ROUTER);

  // The exact fields that made the second call look necessary. If any is dropped from
  // the prose, the router loses a branch and someone re-adds read-preferences.cjs.
  for (const field of ['preferencesFound', 'malformed', 'session_has_corporate_artifacts']) {
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
  for (const field of ['preferencesFound', 'malformed', 'session_has_corporate_artifacts']) {
    assert.match(
      script,
      new RegExp(`\\b${field}\\b`),
      `derive-session-state.cjs must emit ${field}, or the router's single call loses a signal`,
    );
  }
});

// ─── 2. The two silent memory probes share one call ──────────────────────────

test('memory re-sync gate runs check-resync.cjs and embedding-status in one call', () => {
  const body = read(ROUTER);
  const start = body.indexOf('### Memory Re-Sync Gate');
  assert.ok(start >= 0, 'the router must have a Memory Re-Sync Gate section');
  const region = body.slice(start, start + 4000);

  assert.match(region, /check-resync\.cjs/, 'the gate must run check-resync.cjs');
  assert.match(region, /pmem embedding-status/, 'the gate must probe pmem embedding-status');
  assert.match(
    region,
    /same call/i,
    'the gate must order both silent probes in the same call (step 4 consumes nothing from step 1)',
  );
});

test('the bootstrap batches the state read AND both probes into one call', () => {
  // Round trips dominate start time: measured transcripts ran 4 calls/45s, 3/52s, 2/21s
  // while the three scripts together cost ~0.5s of CPU. So the batch must live in the
  // bootstrap block, not just be described in the gate. A mutation that deleted the two
  // probe lines from that block left the gate-side test above green — this closes it.
  const body = read(ROUTER);
  const block = body.slice(body.indexOf('**Deterministic read'), body.indexOf('It emits JSON'));

  assert.match(block, /derive-session-state\.cjs/, 'the bootstrap call must derive session state');
  assert.match(block, /check-resync\.cjs/,
    'the bootstrap call must include the dirty probe (dropping it costs a round trip)');
  assert.match(block, /pmem embedding-status/,
    'the bootstrap call must include the embedding probe (dropping it costs a round trip)');
  // The pmem path must be derivable from this skill's base dir. Leaving it as an
  // unresolvable placeholder is what made a real run burn a whole call on `find`.
  assert.match(block, /super\.persistent-memory\/scripts\/pmem/,
    'the pmem path must be derived from the base dir, not left as a placeholder to hunt for');
  assert.match(block, /never hunt for it with `find`/i,
    'the block must explicitly rule out discovering the pmem path with find');
  // Unconditional probing is the trade that makes one call possible — if a future edit
  // re-gates the probes behind session_memory_enabled, the round trip comes back.
  assert.match(block, /unconditionally/i,
    'the block must justify running the probes unconditionally (0.5s CPU vs ~10s latency)');
});

test('the batched probe still re-runs embedding-status when the sync actually ran', () => {
  // The ONE case batching is not equivalent: the sync prunes and adds notes, so the
  // counts the pre-sync probe reported no longer describe the DB. Dropping this caveat
  // would trade a round trip for a wrong re-embed decision.
  const body = read(ROUTER);
  const start = body.indexOf('### Memory Re-Sync Gate');
  const region = body.slice(start, start + 4000);
  assert.match(
    region,
    /re-?run `pmem embedding-status`|re-?probe/i,
    'the gate must re-probe embedding-status after a sync that actually ran',
  );
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
