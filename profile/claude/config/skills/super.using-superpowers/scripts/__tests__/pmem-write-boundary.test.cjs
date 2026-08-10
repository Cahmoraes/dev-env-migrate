'use strict';

/**
 * Prose-guard: `pmem` writes are ONE-SHOT PER FEATURE, never per wave or task.
 *
 * The bug this locks out (observed in a real Copilot in-tree run, 2026-08-04):
 * the orchestrator wrote a `pmem add` at the end of every wave — "Wave 1
 * concluída…", "Wave 2 concluída…" — turning the semantic-recall DB into an
 * execution journal. Three notes for one feature's planning became seven, and
 * the recall signal drowns in progress chatter as the DB grows.
 *
 * Nothing in the skills asked for it, and that was the defect: the rule was
 * ABSENT, not wrong. Three surfaces had to carry it, because a session can
 * touch any one of them without the others:
 *
 *   1. super.persistent-memory's `description` — the ONLY memory-governing text
 *      in a session that runs `pmem` without ever loading the skill (exactly
 *      what happened: the run entered an execution skill directly, so the
 *      frontmatter in the harness's skill roster was the whole rulebook).
 *      Its old "storing durable preferences/facts" read as an open invitation:
 *      a finished wave is a durable fact.
 *   2. super.persistent-memory/SKILL.md's body — for sessions that do load it.
 *   3. The execution phase's Memory Gate Check — the one place that AUTHORIZES
 *      an execution-time `pmem add` (the planning-missed fallback). Authorizing
 *      a write without bounding it is what made "once more, per wave" plausible.
 *
 * The redirect matters as much as the prohibition: the orchestrator wanted
 * continuity across a compaction — a legitimate need that is ALREADY met by the
 * plan's task files, which it marks DONE and commits at every wave, and which
 * this flow declares its single source of truth for completion. So the per-wave
 * `pmem add` was duplicating a record that already existed. A bare "don't"
 * leaves the need looking unmet and the behaviour returns; naming the record
 * that already covers it removes the motive.
 *
 * (An earlier draft pointed at a per-feature STATE.md snapshot. That mechanism
 * was prose-only — 52 features in the reference consumer repo had produced zero
 * STATE.md files, and no script ever wrote one — so it was removed rather than
 * left as a destination that never materialises.)
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/pmem-write-boundary.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const PMEM = 'super.persistent-memory/SKILL.md';
const CANONICAL = 'super.subagent-driven-development/SKILL.md';
const PARALLEL_SKILLS = [
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
];

/** The harness re-injects only the first 20.000 characters of a SKILL.md after a compaction. */
const COMPACTION_WINDOW = 20000;

const frontmatterOf = (body) => {
  const m = body.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md must open with a YAML frontmatter block');
  return m[1];
};

test('super.persistent-memory: the description carries the per-feature write boundary', () => {
  const description = frontmatterOf(read(PMEM))
    .split('\n')
    .find((l) => l.startsWith('description:'));
  assert.ok(description, 'frontmatter must declare a description');

  // The boundary itself. This is the surface a session sees when it never loads
  // the skill, so the rule cannot live only in the body.
  assert.match(
    description,
    /never per wave\/task/i,
    'the description must state that writes are never per wave/task — it is the only memory rule '
      + 'present in a session that runs pmem without loading this skill',
  );
  assert.match(
    description,
    /per-feature/i,
    'the description must state the positive form of the rule (writes are per-feature)',
  );
  // The redirect: a prohibition with no destination leaves the motive intact.
  assert.match(
    description,
    /task files/i,
    'the description must name where execution progress goes instead',
  );
  // The old open-ended phrasing is what read as an invitation.
  assert.doesNotMatch(
    description,
    /storing durable preferences\/facts/,
    'the unqualified "storing durable preferences/facts" invited per-wave writes — '
      + 'durable knowledge must be qualified as cross-feature',
  );
});

test('super.persistent-memory: the body states the write boundary and the redirect', () => {
  const body = read(PMEM);
  const idx = body.indexOf('Write boundary');
  assert.notEqual(idx, -1, 'SKILL.md must carry a "Write boundary" note for `add`');

  const note = body.slice(idx, idx + 900);
  assert.match(note, /task files/i, 'the write boundary must redirect progress to the task files');
  assert.match(
    note,
    /wave|task/i,
    'the write boundary must name the per-step writes it rules out (wave / task progress)',
  );

  // Positioned with the commands, where a reader of `add` will actually meet it —
  // not stranded at the end of the file behind the availability gate.
  const addIdx = body.indexOf('- `add "<memory text>"');
  assert.notEqual(addIdx, -1, 'the `add` command entry must still be listed');
  assert.ok(
    idx > addIdx,
    'the write boundary must follow the command list, so it reads as a rule about `add`',
  );
});

test('the execution Memory Gate Check bounds the write it authorizes', () => {
  const body = read(CANONICAL);
  const start = body.indexOf('### Memory Gate Check');
  assert.notEqual(start, -1, 'the canonical execution skill must keep the Memory Gate Check');
  const end = body.indexOf('### Caveman Mode Activation', start);
  assert.ok(end > start, 'Memory Gate Check must still be followed by Caveman Mode Activation');

  const gate = body.slice(start, end);
  // The bound lives in the gate's OPENING sentence, not in a trailing bullet. A
  // smoke run measured why: with it phrased as a third bullet under `pmem search`,
  // Copilot read it as another possible search RESULT and re-ran the whole gate at
  // the top of every wave. Moved into the entry condition, the same model skipped it.
  const opening = gate.slice(0, gate.indexOf('```'));
  assert.match(
    opening,
    /one-shot per feature/i,
    'the gate authorizes an execution-time pmem write, so its OPENING must bound that write to '
      + 'one shot per feature — a bound stated only after the procedure reads as another branch '
      + 'of the procedure',
  );
  assert.match(
    opening,
    /not a per-wave checkpoint/i,
    'the bound must name the exact failure mode it rules out',
  );
  // Temporal, not semantic. Every candidate passes a content test — a finished wave
  // IS a durable fact — so a rule phrased as "only durable things" is one relabel away
  // from being satisfied. The smoke run caught exactly that: Copilot wrote the wave's
  // review findings after tagging them "lessons-learned, cross-feature, not per-wave".
  assert.match(
    opening,
    /writes no memory at all/i,
    'the bound must be temporal (nothing is written during execution), not a judgement about '
      + 'which content is durable enough — the content test is trivially passed by relabelling',
  );
  assert.match(
    gate,
    /never per wave or per task/i,
    'the gate must still spell out the per-wave/per-task prohibition',
  );
  assert.match(
    gate,
    /review findings/i,
    'review findings are the relabelling escape hatch a measured run used; name them explicitly',
  );
  assert.match(
    gate,
    /task files/i,
    'the gate must redirect wave/task progress to the task files rather than merely forbidding pmem',
  );
  // The gate states the norm inline and defers the rationale, per this repo's
  // "the other skills defer, they do not redefine" rule. It is also a hard budget
  // question: the canonical skill has ~28 chars of slack before "an index, not a
  // substitute" — the finish tail's own STOP — falls past the compaction cut.
  // Spelling the full argument out here costs that STOP.
  assert.match(
    gate,
    /super\.persistent-memory.{0,40}Write boundary/s,
    'the gate must point at super.persistent-memory\'s "Write boundary" for the full rule, '
      + 'rather than restating it (a second copy drifts, and this file has no room for one)',
  );
});

test('the bounded gate survives a compaction (inside the 20.000-char window)', () => {
  const body = read(CANONICAL);
  const idx = body.indexOf('one-shot per feature');
  assert.notEqual(idx, -1, 'the boundary bullet must exist');
  assert.ok(
    idx < COMPACTION_WINDOW,
    `the boundary must sit inside the first ${COMPACTION_WINDOW} characters (found at ${idx}); `
      + 'past the cut the harness drops it silently on resume — and a resumed run is precisely '
      + 'when the orchestrator reaches for a "checkpoint" write',
  );
});

test('the redirect names a real artifact — no prose-only STATE.md comes back', () => {
  // The removed mechanism's failure mode, locked out: a per-feature STATE.md was
  // specified in full (path, two sections, an AD-NNN decision log, a section-scoped
  // write rule) and produced NOTHING — zero files across 52 features, no script that
  // writes one, no test that read one. Prose-only state is worse than absent: the
  // resume step read "if STATE.md exists" forever, it never did, and pointing the
  // pmem boundary at it would have redirected a real write into a destination that
  // does not materialise. If a snapshot file is wanted again, ship the writer first.
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full);
      } else if (e.name.endsWith('.md') && fs.readFileSync(full, 'utf8').includes('STATE.md')) {
        offenders.push(path.relative(SKILLS, full));
      }
    }
  };
  for (const e of fs.readdirSync(SKILLS, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith('super.')) walk(path.join(SKILLS, e.name));
  }

  // Anti-staleness: a sweep that stopped finding markdown would pass vacuously.
  const scanned = fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('super.')).length;
  assert.ok(scanned >= 10, `anti-staleness: expected to sweep 10+ skills, swept ${scanned}`);

  assert.deepEqual(
    offenders,
    [],
    'STATE.md is referenced again in skill prose. It has no writer and no consumer — either '
      + 'ship the script that writes it, or keep the redirect on the task files:\n      '
      + offenders.join('\n      '),
  );
});

test('the parallel skills inherit the boundary by pointer, and stay inside the window', () => {
  // Anti-staleness floor: both parallel modes must be covered. A sweep that
  // silently stopped matching would assert nothing over an empty set.
  assert.equal(PARALLEL_SKILLS.length, 2, 'both parallel execution modes must be checked');

  for (const rel of PARALLEL_SKILLS) {
    const body = read(rel);

    // They carry no memory rules of their own; the boundary reaches them only
    // through the pointer. A copy here would drift, so the pointer IS the contract.
    assert.match(
      body,
      /Memory Gate Check|super\.parallel-subagent-development.{0,80}Step 2/s,
      `${rel} must keep delegating the memory gate instead of redefining it`,
    );

    assert.ok(
      body.length <= COMPACTION_WINDOW,
      `${rel} is ${body.length} chars — over ${COMPACTION_WINDOW} its tail (Red Flags) is dropped `
        + 'after a compaction. The boundary was added to the canonical skill for exactly this '
        + 'reason; do not pay for it here.',
    );
  }
});
