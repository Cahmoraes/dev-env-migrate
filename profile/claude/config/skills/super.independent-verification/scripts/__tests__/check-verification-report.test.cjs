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
**Verifier**: fresh independent subagent (author != verifier)

## Gate Check
- Command: npm test
- Result: 33 passed, 0 failed - exit 0

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | file:line + assertion | Result |
| --- | --- | --- | --- |
| FR-003 enqueue unregistered handler | throws on claim | src/job-queue.test.ts:40 - expect(() => q.claim()).toThrow() | ✅ PASS |

**Coverage**: 1/1 criteria PASS

## Discrimination Sensor

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | src/retry.ts:11 | Math.min -> Math.max | Killed |

**Result**: 1/1 killed

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
