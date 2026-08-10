'use strict';

/**
 * Tests for check-verification-report.cjs, the structural gate that replaces
 * super.finishing-a-development-branch's inline `grep -Eiq 'verdict:?\s*PASS'`
 * precondition. That grep only confirms the word PASS appears somewhere in the
 * file — it cannot tell a genuine Verifier report from a thin, self-authored one
 * written only to satisfy the precondition (the v16-large benchmark's skipped-gate
 * deviation). It also never matches the real template, since "## Verdict" and
 * "**PASS ✅**" sit on separate lines and grep is line-oriented.
 *
 * Run with: node --test super.independent-verification/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-verification-report.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-verification-report-'));
}

function run(args) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    return { code: err.status, json: JSON.parse(err.stdout) };
  }
}

const GENUINE_REPORT = `# job-queue - Independent Validation

**Date**: 2026-07-14
**Spec**: docs/superpowers/job-queue/specs/job-queue-design.md
**Diff range**: afea973deadbeef1234567890abcdef12345678..754a11d0011223344556677889900aabbccddee
**Verifier**: INDEPENDENT
**Sensor depth**: 3 mutations across 2 logic files — retry.ts: 2/3 branches, job-queue.ts: 1/1 branches

## Gate Check
- Command: npm test
- Result: 33 passed, 0 failed - exit 0
- **Baseline**: ran
- **Typecheck/build**: \`npm run build\` exit 0

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | file:line + assertion | Result |
| --- | --- | --- | --- |
| FR-003 enqueue unregistered handler | throws on claim | src/job-queue.test.ts:40 - expect(() => q.claim()).toThrow() | ✅ PASS |

**Coverage**: 1/1 criteria PASS

## Discrimination Sensor

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | src/retry.ts:11 | Math.min -> Math.max | Killed |
| 2 | src/retry.ts:19 | attempts > cap -> attempts >= cap | Killed |
| 3 | src/job-queue.ts:52 | drop the notify() call | Killed |

**Result**: 3/3 killed

## Verdict

**PASS ✅** - all criteria covered, all mutants killed.

**Lessons recorded**: none (clean PASS)
`;

test('a genuine, fully-populated report is valid', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, GENUINE_REPORT, 'utf8');
    const { code, json } = run(['--report', p]);
    assert.equal(code, 0);
    assert.equal(json.valid, true);
    assert.deepEqual(json.errors, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a thin self-attested report (PASS header, no evidence) is rejected', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, '# job-queue - Independent Validation\n\n## Verdict\n\n**PASS ✅** - tests pass and typecheck is clean.\n', 'utf8');
    const { code, json } = run(['--report', p]);
    assert.equal(code, 1);
    assert.equal(json.valid, false);
    assert.ok(json.errors.some((e) => /Diff range/.test(e.message)));
    assert.ok(json.errors.some((e) => /Acceptance Criteria table has no data rows/.test(e.message)));
    assert.ok(json.errors.some((e) => /Discrimination Sensor table has no data rows/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the old grep gate never matched the real template (regression documented, not exercised here)', () => {
  // Documents why the replacement was needed: "## Verdict" and "**PASS ✅**" are on
  // separate lines in the template, so a single-line grep for verdict:?\s*PASS never
  // matches a genuine report. No assertion against grep itself (shell-specific); this
  // script's own **Verdict** section scan (extractSection + regex on the section body)
  // is what correctly handles the multi-line layout, proven by the two tests above.
  assert.ok(true);
});

test('an unfilled template (copy-paste placeholders left in) is rejected', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    const templateCopy = GENUINE_REPORT.replace('afea973deadbeef1234567890abcdef12345678..754a11d0011223344556677889900aabbccddee', '<BASE_SHA>..<HEAD_SHA>');
    fs.writeFileSync(p, templateCopy, 'utf8');
    const { code, json } = run(['--report', p]);
    assert.equal(code, 1);
    assert.equal(json.valid, false);
    assert.ok(json.errors.some((e) => /placeholders/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a FAIL verdict is rejected even with populated tables', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, GENUINE_REPORT.replace('**PASS ✅**', '**FAIL ❌**'), 'utf8');
    const { code, json } = run(['--report', p]);
    assert.equal(code, 1);
    assert.equal(json.valid, false);
    assert.ok(json.errors.some((e) => /Verdict is FAIL/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a self-contradictory report (PASS header but a listed gap) is rejected', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    const contradictory = GENUINE_REPORT.replace(
      '| FR-003 enqueue unregistered handler | throws on claim | src/job-queue.test.ts:40 - expect(() => q.claim()).toThrow() | ✅ PASS |',
      '| FR-003 enqueue unregistered handler | throws on claim | not located | ❌ Gap (uncovered) |',
    );
    fs.writeFileSync(p, contradictory, 'utf8');
    const { code, json } = run(['--report', p]);
    assert.equal(code, 1);
    assert.equal(json.valid, false);
    assert.ok(json.errors.some((e) => /self-contradictory/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing report file fails with a clear message', () => {
  const { code, json } = run(['--report', '/nonexistent/validation-x.md']);
  assert.equal(code, 1);
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /Report not found/.test(e.message)));
});

test('--spec cross-check flags an FR present in the spec but absent from the report', () => {
  const dir = mkdir();
  try {
    const reportPath = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(reportPath, GENUINE_REPORT, 'utf8');
    const specPath = path.join(dir, 'job-queue-design.md');
    fs.writeFileSync(specPath, '# Design\n\nFR-003: throws immediately.\nFR-010: persists across restart.\n', 'utf8');
    const { code, json } = run(['--report', reportPath, '--spec', specPath]);
    assert.equal(code, 1);
    assert.equal(json.valid, false);
    assert.ok(json.errors.some((e) => /FR-010/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Gate hardening after the 2026-07-25 benchmark ---------------------------
// Brief C measured the gate degrading in three distinct ways at once: the sensor
// was argued instead of executed (rows with no target), the run self-verified
// (author == verifier) while still reporting a clean PASS, and the report was
// unsatisfiable by construction because the feature was never committed, which
// removed any incentive to run this script at all.

function withReport(mutate) {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, mutate(GENUINE_REPORT), 'utf8');
    return { ...run(['--report', p]), dir };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a report that never states whether author != verifier is rejected', () => {
  const { json } = withReport((r) => r.replace('**Verifier**: INDEPENDENT\n', ''));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /\*\*Verifier\*\*/.test(e.message)));
});

test('a SELF-DEGRADED run cannot report a clean PASS', () => {
  const { json } = withReport((r) =>
    r.replace('**Verifier**: INDEPENDENT', '**Verifier**: SELF-DEGRADED (author == verifier)'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /SELF-DEGRADED/.test(e.message)));
});

test('WORKING-TREE is an accepted diff range when the feature was never committed', () => {
  const { json } = withReport((r) =>
    r.replace(/\*\*Diff range\*\*: [0-9a-f]+\.\.[0-9a-f]+/,
      '**Diff range**: WORKING-TREE - never committed (workflow.auto_commit: false)'));
  assert.equal(json.valid, true);
  assert.deepEqual(json.errors, []);
});

test('a sensor row with no file:line is rejected as reasoned rather than executed', () => {
  const { json } = withReport((r) =>
    r.replace('| 3 | src/job-queue.ts:52 | drop the notify() call | Killed |',
      '| 3 | the strategy chain | reordering it would break the precedence tests | Killed |'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /file:line/.test(e.message)));
});

test('sensor depth below the floor of 3 is rejected', () => {
  const { json } = withReport((r) =>
    r.replace('**Sensor depth**: 3 mutations across 2 logic files',
      '**Sensor depth**: 2 mutations across 2 logic files'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /below the floor/.test(e.message)));
});

test('sensor depth that leaves logic files unmutated is rejected', () => {
  const { json } = withReport((r) =>
    r.replace('**Sensor depth**: 3 mutations across 2 logic files',
      '**Sensor depth**: 3 mutations across 18 logic files'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /logic files/.test(e.message)));
});

test('a missing **Sensor depth** declaration is rejected', () => {
  const { json } = withReport((r) => r.replace('**Sensor depth**: 3 mutations across 2 logic files — retry.ts: 2/3 branches, job-queue.ts: 1/1 branches\n', ''));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /Sensor depth/.test(e.message)));
});

// --- Per-file proportional depth (2026-07-25 gate refinement) ----------------
// The old floor ("≥1 mutation per new logic file, cap 10") is satisfiable by a
// dense file that gets exactly one mutation while a trivial file "spends" the
// same budget. Benchmark 2026-07-25: hash-to-bucket.ts and lru-ttl-cache.ts each
// concentrated 5 survivors out of ~8 mutants despite the floor being met. Depth
// must now scale with each file's OWN branches/operators, not just its presence
// in the diff.

test('a per-file branch/operator breakdown missing from Sensor depth is rejected', () => {
  const { json } = withReport((r) =>
    r.replace(' — retry.ts: 2/3 branches, job-queue.ts: 1/1 branches', ''));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /breakdown/.test(e.message)));
});

test('a dense logic file with disproportionately few mutations relative to its branches is rejected', () => {
  const { json } = withReport((r) =>
    r.replace('retry.ts: 2/3 branches, job-queue.ts: 1/1 branches',
      'retry.ts: 1/12 branches, job-queue.ts: 2/1 branches'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /retry\.ts declares 12 branches.*proportional depth/i.test(e.message)));
});

test('a per-file breakdown whose file count does not match the declared logic file count is rejected', () => {
  const { json } = withReport((r) =>
    r.replace(', job-queue.ts: 1/1 branches', ''));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /declares 2 logic file.*lists 1/i.test(e.message)));
});

test('a per-file breakdown whose mutation sum does not match the declared total is rejected', () => {
  const { json } = withReport((r) =>
    r.replace('retry.ts: 2/3 branches', 'retry.ts: 5/3 branches'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /sums to 6 mutations but the declared total is 3/.test(e.message)));
});

test('a per-file breakdown proportional to a dense file is accepted', () => {
  const { json } = withReport((r) =>
    r.replace('**Sensor depth**: 3 mutations across 2 logic files — retry.ts: 2/3 branches, job-queue.ts: 1/1 branches',
      '**Sensor depth**: 5 mutations across 2 logic files — retry.ts: 4/12 branches, job-queue.ts: 1/1 branches'));
  assert.equal(json.valid, true);
  assert.deepEqual(json.errors, []);
});

// --- Equivalent mutants (2026-07-25 validation benchmark) --------------------
// Re-running the fixed framework on a fresh cell (G-v10new-session2) surfaced a
// genuine equivalent mutant: `lruEntry !== undefined` right after
// `this.store.get(lruKey)` for a key that was just confirmed present — no input
// can ever make it false, so no test can kill the mutant that flips it to `true`.
// Before this, the gate treated every survivor as "assertion missing or too
// weak" with no escape hatch, which would push a verifier into either an
// infinite fix-loop or weakening a real invariant just to force a kill. The
// escape hatch must still be effortful and auditable: a dedicated block per
// survivor with the invariant proof and a description of the kill attempt that
// still failed, cross-checked against the sensor table by file:line - a bare
// "Survived" row is still a hard gate failure.

const EQUIVALENT_REPORT = GENUINE_REPORT
  .replace('| 3 | src/job-queue.ts:52 | drop the notify() call | Killed |', '| 3 | src/job-queue.ts:52 | drop the notify() call | Equivalent |')
  .replace('**Result**: 3/3 killed', '**Result**: 2/3 killed, 1 equivalent (documented)')
  .replace('## Verdict', [
    '## Equivalent Mutants',
    '',
    '### EQ-01 - src/job-queue.ts:52',
    '- **Mutation**: drop the notify() call',
    '- **Invariant**: notify() sits behind the same enqueue-success guard the test already forces true; no reachable state reaches the call site without that guard holding, so removing the call cannot change any observable output.',
    '- **Attempted**: added a spy call-count assertion in isolation; it still passed under the mutation because the return value never depended on notify() being invoked.',
    '',
    '## Verdict',
  ].join('\n'));

function withEquivalentReport(mutate = (r) => r) {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, mutate(EQUIVALENT_REPORT), 'utf8');
    return { ...run(['--report', p]), dir };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a sensor row marked Equivalent with a well-formed Equivalent Mutants block is accepted', () => {
  const { json } = withEquivalentReport();
  assert.equal(json.valid, true);
  assert.deepEqual(json.errors, []);
});

test('a bare Survived sensor row (not marked equivalent) still makes a PASS verdict self-contradictory', () => {
  const { json } = withReport((r) =>
    r.replace('| 3 | src/job-queue.ts:52 | drop the notify() call | Killed |', '| 3 | src/job-queue.ts:52 | drop the notify() call | Survived |'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /self-contradictory/.test(e.message)));
});

test('a sensor row marked Equivalent with no ## Equivalent Mutants section at all is rejected', () => {
  const { json } = withEquivalentReport((r) => r.replace(/## Equivalent Mutants[\s\S]*?## Verdict/, '## Verdict'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /Equivalent/.test(e.message) && /block/.test(e.message)));
});

test('an Equivalent Mutants block with a placeholder Invariant is rejected', () => {
  const { json } = withEquivalentReport((r) =>
    r.replace(/\*\*Invariant\*\*:.*/, '**Invariant**: <TODO>'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /Invariant/.test(e.message)));
});

test('an Equivalent Mutants block with a placeholder Attempted is rejected', () => {
  const { json } = withEquivalentReport((r) =>
    r.replace(/\*\*Attempted\*\*:.*/, '**Attempted**: <TODO>'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /Attempted/.test(e.message)));
});

test('an Equivalent Mutants block whose file:line does not match any Equivalent sensor row is rejected', () => {
  const { json } = withEquivalentReport((r) =>
    r.replace('### EQ-01 - src/job-queue.ts:52', '### EQ-01 - src/other-file.ts:99'));
  assert.equal(json.valid, false);
  assert.ok(json.errors.some((e) => /does not match any sensor row/.test(e.message)));
});

// ─── Pre-existing failures must leave an actionable trace ─────────────────────
// Encoded from a real report: the Gate Check reported a contract-test script at
// "2 failed, 30 passed - exit 1" and the verdict was still PASS, justified in prose as
// "the two failures are exactly the pre-existing, unrelated ones". The diligence was
// real — they HAD been measured on the base — but prose leaves no trace anyone can act
// on. The same report waved through a broken code-generation script as "pre-existing,
// out of scope"; it became a post-merge fix commit the next morning.
//
// Accepting a pre-existing failure is legitimate. Accepting it INVISIBLY is what turns
// a known problem into someone else's surprise. So: a red gate may still PASS, but only
// if every failure is registered with the baseline SHA it was measured on.

const REPORT_WITH_RED_GATE = (gateResult, extraSection = '') =>
  GENUINE_REPORT.replace('- Result: 33 passed, 0 failed - exit 0', `- Result: ${gateResult}`)
    .replace('## Verdict', `${extraSection}## Verdict`);

test('a red gate with no pre-existing-failure register is rejected', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, REPORT_WITH_RED_GATE('30 passed, 2 failed - exit 1'), 'utf8');
    const { json } = run(['--report', p]);
    assert.equal(json.valid, false, 'a failing gate cannot pass on prose alone');
    assert.ok(
      json.errors.some((e) => /pre-existing/i.test(e.message)),
      `expected a pre-existing-failure error, got: ${JSON.stringify(json.errors)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a red gate IS accepted when every failure is registered with a baseline SHA', () => {
  const dir = mkdir();
  const register = `## Pre-Existing Failures

| Failing test | Baseline SHA | Evidence |
| --- | --- | --- |
| contract: 409 for missing check-in | afea973d | fails identically on base, untouched by this diff |
| contract: POST /gyms returns 201 | afea973d | fails identically on base, untouched by this diff |

`;
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, REPORT_WITH_RED_GATE('30 passed, 2 failed - exit 1', register), 'utf8');
    const { json } = run(['--report', p]);
    assert.deepEqual(json.errors, [], 'a registered pre-existing failure is a legitimate PASS');
    assert.equal(json.valid, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the register must cover every failure, not just one of them', () => {
  const dir = mkdir();
  const register = `## Pre-Existing Failures

| Failing test | Baseline SHA | Evidence |
| --- | --- | --- |
| contract: 409 for missing check-in | afea973d | fails identically on base |

`;
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, REPORT_WITH_RED_GATE('30 passed, 2 failed - exit 1', register), 'utf8');
    const { json } = run(['--report', p]);
    assert.equal(json.valid, false, '2 failures with 1 registered row leaves one unaccounted for');
    assert.ok(json.errors.some((e) => /2 failing test\(s\)|registers only 1/i.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a register row without a baseline SHA proves nothing', () => {
  const dir = mkdir();
  const register = `## Pre-Existing Failures

| Failing test | Baseline SHA | Evidence |
| --- | --- | --- |
| contract: 409 for missing check-in | | it was already broken |

`;
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, REPORT_WITH_RED_GATE('32 passed, 1 failed - exit 1', register), 'utf8');
    const { json } = run(['--report', p]);
    assert.equal(json.valid, false);
    assert.ok(
      json.errors.some((e) => /baseline SHA/i.test(e.message)),
      '"already broken" without a measured baseline is an assertion, not evidence',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a green gate needs no register (the gate only fires on red)', () => {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'validation-job-queue.md');
    fs.writeFileSync(p, GENUINE_REPORT, 'utf8');
    const { json } = run(['--report', p]);
    assert.equal(json.valid, true);
    assert.equal(json.errors.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Typecheck/build is the one gate scoped tests cannot substitute for ───────
// Also from that same report, and the half that actually leaked: it answered
// "**Typecheck/build**: não executado nesta verificação (fora do escopo do dispatch)"
// and still returned PASS. The template had always called that answer unacceptable —
// but only in prose, so nothing enforced it, and the broken code-generation script
// it waved through came back as a post-merge fix the next morning.
//
// A type error crosses module boundaries by definition, so a suite scoped to the diff's
// own files stays green while the consumer breaks. Two answers are acceptable and they
// are not the same thing: an outcome, or "this project defines no such script".
// "I chose not to run it" is neither.

const REPORT_WITH_TYPECHECK = (value) =>
  value === null
    ? GENUINE_REPORT.replace(/\n- \*\*Typecheck\/build\*\*:.*/, '')
    : GENUINE_REPORT.replace(/- \*\*Typecheck\/build\*\*:.*/, `- **Typecheck/build**: ${value}`);

const typecheckCase = (label, value, expectValid, matcher) => {
  test(label, () => {
    const dir = mkdir();
    try {
      const p = path.join(dir, 'validation-job-queue.md');
      fs.writeFileSync(p, REPORT_WITH_TYPECHECK(value), 'utf8');
      const { json } = run(['--report', p]);
      assert.equal(json.valid, expectValid, `errors: ${JSON.stringify(json.errors)}`);
      if (matcher) {
        assert.ok(
          json.errors.some((e) => matcher.test(e.message)),
          `expected a Typecheck/build error, got: ${JSON.stringify(json.errors)}`,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};

typecheckCase(
  'Typecheck/build answered "não executado / fora do escopo" is rejected (the real observed wording)',
  'não executado nesta verificação (fora do escopo do dispatch)',
  false,
  /Typecheck\/build/i,
);

typecheckCase(
  'Typecheck/build answered "not run — out of scope" is rejected (English wording)',
  'not run - out of scope for this dispatch',
  false,
  /Typecheck\/build/i,
);

typecheckCase(
  'an absent Typecheck/build field is rejected — omission is not a neutral answer',
  null,
  false,
  /no \*\*Typecheck\/build\*\* field/i,
);

typecheckCase(
  'a real outcome is accepted',
  '`npm run typecheck` exit 0; `npm run build` exit 0',
  true,
);

typecheckCase(
  'the escape hatch is accepted — a project may genuinely define no such script',
  'no such script in this project.',
  true,
);

typecheckCase(
  'an unfilled Typecheck/build placeholder is reported as a placeholder, not as "not run"',
  '<result — or "no such script in this project". "Not run / out of scope" is not an acceptable answer>',
  false,
  /still the template placeholder/i,
);

// ─── Where the green came from ───────────────────────────────────────────────
// The Verifier is blind: it can only reuse a previous gate's green if the dispatch
// actually handed it one. Measured 2026-08-03 — with no baseline in the payload,
// two dispatches each ran the full suite to re-establish a green that already held
// at the same SHA (~143s), and paid it again on the re-verify round. The cost was
// invisible because nothing in the report said which branch was taken.
//
// This field does NOT force reuse - the tree may genuinely have moved. It forces the
// choice to be visible, and an inherited green to be traceable to the SHA it was
// measured on. "Already green" with no SHA is the same unevidenced claim the rest of
// this gate rejects everywhere else.

const REPORT_WITH_BASELINE = (value) =>
  value === null
    ? GENUINE_REPORT.replace(/\n- \*\*Baseline\*\*:.*/, '')
    : GENUINE_REPORT.replace(/- \*\*Baseline\*\*:.*/, `- **Baseline**: ${value}`);

const baselineCase = (label, value, expectValid, matcher) => {
  test(label, () => {
    const dir = mkdir();
    try {
      const p = path.join(dir, 'validation-job-queue.md');
      fs.writeFileSync(p, REPORT_WITH_BASELINE(value), 'utf8');
      const { json } = run(['--report', p]);
      assert.equal(json.valid, expectValid, `errors: ${JSON.stringify(json.errors)}`);
      if (matcher) {
        assert.ok(
          json.errors.some((e) => matcher.test(e.message)),
          `expected a Baseline error, got: ${JSON.stringify(json.errors)}`,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};

baselineCase('an absent Baseline field is rejected — the re-run it hides is invisible otherwise', null, false, /no \*\*Baseline\*\* field/i);
baselineCase('"ran" is accepted — executing it yourself is always a legitimate branch', 'ran', true);
baselineCase(
  'a reused baseline naming its source and SHA is accepted',
  'reused from wave-3 integration barrier @ 7cd81df377dfe1150ab34442e732aa76fce1f444',
  true,
);
baselineCase('a reused baseline with a short-but-valid SHA is accepted', 'reused from the final review @ 7cd81df', true);
baselineCase(
  'a reused baseline with no SHA is rejected — inheritance without a SHA is an assertion',
  'reused from the previous gate (it was already green)',
  false,
  /names no SHA/i,
);
baselineCase(
  'an unfilled Baseline placeholder is reported as a placeholder',
  '<"ran" when you executed the suite yourself, or "reused from <source> @ <sha>">',
  false,
  /still the template placeholder/i,
);
