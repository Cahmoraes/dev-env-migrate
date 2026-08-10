'use strict';

/**
 * Tests for validate-tasks.cjs's task-step SCOPE check.
 *
 * What it guards: a `## Passos` section is pasted verbatim into the implementer's
 * prompt, and the same text reaches the reviewer as its requirements. A step that
 * runs the whole suite / the typecheck / the build / the formatter in fix mode
 * therefore reads as an instruction that OUTRANKS the execution skill's
 * prohibition against exactly that command — which is how a plan makes every
 * implementer and every reviewer re-run what the integration barrier already runs
 * once per wave.
 *
 * The check is deliberately stack-neutral: it classifies by ROLE (test runner,
 * typecheck, build, fix-mode formatter), so the fixtures below span JS, Python,
 * Go and Rust. A JS-only fixture set would let a monoculture regression pass.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/task-step-scope.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'task-step-scope-'));
}

function runJson(args) {
  // validate-tasks always exits 0; invalid plans are reported via valid:false.
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

/** A task file with the required headers, so nothing but the scope check is exercised. */
function taskFile({ steps = '', criteria = '' } = {}) {
  return [
    '# Task 1: Do the thing',
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    '**Depends on:** N/A',
    '',
    '## Passos',
    steps,
    '',
    '## Critérios de Sucesso',
    criteria,
    '',
  ].join('\n');
}

/** Writes a one-task plan and returns the parsed validate-tasks output. */
function scopeOf({ steps, criteria }) {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ steps, criteria }), 'utf8');
    const content = ['# Tarefas: X', '', '## Tarefas', '- [ ] 1. Do the thing → `task-01.md`', ''].join('\n');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(index, content, 'utf8');
    return runJson(['--tasks-index', index]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const kinds = (r) => r.stepScope.findings.map((f) => f.kind).sort();

// ─── The four barrier-owned command roles ────────────────────────────────────
//
// Table-driven so that adding an ecosystem is a one-line change, and so a
// regression that only survives in one language is visible as a single red row.

const BARRIER_OWNED = [
  // [label, step body, expected kind]
  ['js full suite', 'Run: `pnpm test`', 'full test suite'],
  ['js full suite via runner', 'Run: `npx vitest run`', 'full test suite'],
  ['python full suite', 'Run: `pytest`', 'full test suite'],
  ['go full suite', 'Run: `go test ./...`', 'full test suite'],
  ['rust full suite', 'Run: `cargo test`', 'full test suite'],
  // A workspace selector picks a PROJECT, not a test target: this runs that
  // workspace's entire suite, and its path argument must not read as narrowing.
  ['workspace-filtered full suite', 'Run: `pnpm --filter ./apps/frontend test`', 'full test suite'],

  ['tsc typecheck', 'Run: `tsc --noEmit`', 'typecheck/compile step'],
  ['pnpm typecheck script', 'Run: `pnpm tsc:check`', 'typecheck/compile step'],
  ['python typecheck', 'Run: `mypy src/`', 'typecheck/compile step'],
  ['rust typecheck', 'Run: `cargo check`', 'typecheck/compile step'],
  ['go compile', 'Run: `go build ./...`', 'typecheck/compile step'],

  ['js build', 'Run: `pnpm build`', 'build'],
  ['next build', 'Run: `next build`', 'build'],
  ['rust build', 'Run: `cargo build --release`', 'build'],

  ['biome fix mode', 'Run: `pnpm lint:fix`', 'formatter/linter in fix mode'],
  ['eslint fix mode', 'Run: `eslint --fix src/`', 'formatter/linter in fix mode'],
  ['prettier write mode', 'Run: `prettier --write src/`', 'formatter/linter in fix mode'],
  ['gofmt write mode', 'Run: `gofmt -w ./cmd`', 'formatter/linter in fix mode'],
  ['cargo fmt', 'Run: `cargo fmt`', 'formatter/linter in fix mode'],
  ['ruff format', 'Run: `ruff format src/`', 'formatter/linter in fix mode'],
];

test('every barrier-owned command role is flagged, in every ecosystem', () => {
  // Anti-staleness: a fixture table that silently empties would pass a loop.
  assert.ok(BARRIER_OWNED.length >= 20, 'fixture table shrank — re-derive it before trusting this file');
  const roles = new Set(BARRIER_OWNED.map(([, , kind]) => kind));
  assert.equal(roles.size, 4, 'all four barrier-owned roles must be represented');

  for (const [label, steps, expected] of BARRIER_OWNED) {
    const r = scopeOf({ steps });
    assert.deepEqual(kinds(r), [expected], `${label}: expected exactly one ${expected} finding`);
    assert.equal(r.valid, false, `${label}: a barrier-owned step must invalidate the plan`);
  }
});

// ─── The two shapes that look scoped and are not ─────────────────────────────

test('a name-only test filter is flagged — the runner still collects every file', () => {
  const r = scopeOf({ steps: 'Run: `pnpm test -t "seleção em massa"`' });
  assert.deepEqual(kinds(r), ['test command filtered by name with no test target']);
});

test('a name-only filter is flagged in python too (pytest -k)', () => {
  const r = scopeOf({ steps: 'Run: `pytest -k bulk_status`' });
  assert.deepEqual(kinds(r), ['test command filtered by name with no test target']);
});

test('a path swallowed by `--` is flagged even though a file is named', () => {
  // Measured on a real repo: `pnpm test -- --run <file>` collected 130 files
  // while naming one. The path never reached the runner.
  const r = scopeOf({ steps: 'Run: `pnpm test -- --run src/features/admin/user-row.test.tsx`' });
  assert.deepEqual(kinds(r), ['test command whose path is swallowed by `--`']);
});

// ─── What must NOT be flagged ────────────────────────────────────────────────
//
// False positives are the expensive failure here: they train the plan author to
// ignore the check. Each entry below bit an earlier revision of the classifier.

const MUST_STAY_CLEAN = [
  ['scoped js test naming a file', 'Run: `npx vitest run src/features/admin/user-row.test.tsx`'],
  ['scoped python test naming a file and an id', 'Run: `pytest tests/test_bulk.py::test_disables_user -v`'],
  ['scoped go test naming a package file', 'Run: `go test ./internal/user -run TestDisable`'],
  // Bare filenames, no directory: the shape a `Run:` line takes when the step
  // already runs from the workspace. These are what make the FILE token
  // load-bearing — every path-shaped fixture above would narrow without it.
  ['scoped js test naming a bare file', 'Run: `npx vitest run user-row.test.tsx`'],
  ['scoped python test naming a bare file and an id', 'Run: `pytest test_bulk.py::test_disables_user`'],
  ['shell test builtin', 'Run: `test -f src/components/checkbox.tsx && echo ok`'],
  ['find over test files', 'Run: `find src -name "*.test.tsx"`'],
  ['git add of a test path', '```bash\ngit add tests/path/test.py src/path/file.py\ngit commit -m "feat: x"\n```'],
  ['check-only linter (reports, does not rewrite)', 'Run: `biome check src/`'],
  ['prose that merely mentions the suite', 'Expected: PASS — the full test suite is the barrier\'s job, not this step.'],
];

test('legitimate scoped commands and non-test shell verbs are not flagged', () => {
  assert.ok(MUST_STAY_CLEAN.length >= 10, 'false-positive corpus shrank — re-derive it before trusting this file');
  for (const [label, steps] of MUST_STAY_CLEAN) {
    const r = scopeOf({ steps });
    assert.deepEqual(r.stepScope.findings, [], `${label}: must not be flagged`);
  }
});

// ─── Where the check looks, and how it reports ───────────────────────────────

test('the criteria section is scanned too — the same demand leaks through it', () => {
  // Observed in a real task-writer run: the steps were clean but the success
  // criteria restated `lint:fix` and `tsc:check`, which reaches the implementer
  // and the reviewer just the same.
  const r = scopeOf({
    steps: 'Run: `npx vitest run src/features/admin/user-row.test.tsx`',
    criteria: '- `pnpm lint:fix` e `pnpm tsc:check` passam sem erros.',
  });
  assert.deepEqual(kinds(r), ['formatter/linter in fix mode', 'typecheck/compile step']);
});

test('the same role repeated in one task reports once, not once per line', () => {
  const r = scopeOf({
    steps: ['Run: `pnpm test`', 'Run: `pnpm test`', 'Run: `pytest`'].join('\n\n'),
  });
  assert.deepEqual(kinds(r), ['full test suite']);
});

test('a finding names the task, the file, the role and the offending command', () => {
  const r = scopeOf({ steps: 'Run: `pnpm build`' });
  const [f] = r.stepScope.findings;
  assert.equal(f.taskNumber, 1);
  assert.equal(f.file, 'task-01.md');
  assert.equal(f.kind, 'build');
  assert.match(f.command, /pnpm build/u);
  // The error must send the author to the rule, not just name the symptom.
  assert.ok(
    r.errors.some((e) => /required-task-step-pattern\.md/u.test(e.message) && /integration barrier/u.test(e.message)),
    'the error must cite the barrier and point at the reference that states the rule',
  );
});

test('a clean plan reports checked > 0 — an empty scan must not read as clean', () => {
  const r = scopeOf({ steps: 'Run: `pytest tests/test_bulk.py::test_x -v`' });
  assert.equal(r.stepScope.clean, true);
  assert.ok(r.stepScope.checked >= 1, 'checked must count the tasks actually scanned');
});

test('--index-only does not run the scope check (task bodies are not read)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ steps: 'Run: `pnpm test`' }), 'utf8');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(index, ['# Tarefas: X', '', '## Tarefas', '- [ ] 1. X → `task-01.md`', ''].join('\n'), 'utf8');
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.stepScope, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
