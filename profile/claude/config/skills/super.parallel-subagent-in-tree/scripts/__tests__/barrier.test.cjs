'use strict';

/**
 * barrier.test.cjs — pins the decisions of the integration barrier planner.
 *
 * The barrier used to be hand-assembled prose ("map each phase to the project's script"),
 * which produced 16 different spellings of the same sequence in one feature and ran the
 * full suite of untouched workspaces every time. These tests pin the two properties that
 * make scoping SAFE rather than merely cheap:
 *
 *   - a workspace no task wrote cannot have broken, so it may be skipped — but ONLY
 *     because check-wave-disjoint already proved the write-set upstream;
 *   - anything that is not owned by a workspace (root config, lockfile) widens the scope
 *     back to everything, because a root change can break any workspace.
 *
 * Execution itself is deliberately not tested here (it spawns real builds); the planner
 * is pure and is where every decision that matters is made.
 *
 * Run: node --test super.parallel-subagent-in-tree/scripts/__tests__/barrier.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { planBarrier, discoverWorkspaces, scopeWorkspaces, scriptFor, PHASES } = require('../barrier.cjs');

/** Build a throwaway pnpm-workspace monorepo: apps/backend, apps/frontend, packages/shared. */
function fixture(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrier-'));
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { build: 'turbo build' } }));

  const mk = (dir, scripts) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: path.basename(dir), scripts }));
  };
  mk('apps/backend', opts.backend || { 'biome:fix': 'biome', 'tsc:check': 'tsc', 'test:run': 'vitest' });
  mk('apps/frontend', opts.frontend || { 'lint:fix': 'eslint', 'tsc:check': 'tsc', test: 'vitest' });
  mk('packages/shared', opts.shared || { 'tsc:check': 'tsc' });
  return root;
}

test('discovers every workspace from pnpm-workspace.yaml globs', () => {
  const dirs = discoverWorkspaces(fixture()).map((w) => w.dir);
  assert.deepEqual(dirs.sort(), ['apps/backend', 'apps/frontend', 'packages/shared']);
});

test('a wave that wrote only backend files does not run the frontend suite', () => {
  // This is the measured waste: a backend-only wave ran the frontend's 755 tests.
  const plan = planBarrier({ repoRoot: fixture(), changed: ['apps/backend/src/gym.ts'] });
  assert.equal(plan.scope, 'scoped-by-write-set');
  assert.deepEqual(plan.workspacesSelected, ['apps/backend']);

  const test_ = plan.phases.find((p) => p.phase === 'test');
  assert.deepEqual(test_.jobs.map((j) => j.dir), ['apps/backend']);
});

test('an unowned path widens the scope back to every workspace', () => {
  // A root config or lockfile can break any workspace — narrowing there would be the
  // one case where scoping actually loses coverage, so it must not narrow.
  const plan = planBarrier({ repoRoot: fixture(), changed: ['apps/backend/src/gym.ts', 'tsconfig.base.json'] });
  assert.equal(plan.scope, 'widened-by-unowned-path');
  assert.deepEqual(plan.workspacesSelected.sort(), ['apps/backend', 'apps/frontend', 'packages/shared']);
});

test('no --changed means full scope — the conservative default', () => {
  const plan = planBarrier({ repoRoot: fixture(), changed: undefined });
  assert.equal(plan.scope, 'full-scope');
  assert.equal(plan.workspacesSelected.length, 3);
});

test('build always spans the whole repo even when the wave is scoped', () => {
  // Build is an integration check: proving one workspace builds proves nothing about
  // the repo, which is the only question build is there to answer.
  const plan = planBarrier({ repoRoot: fixture(), changed: ['apps/backend/src/gym.ts'] });
  const build = plan.phases.find((p) => p.phase === 'build');
  assert.ok(build.jobs.length >= 1, 'build must still run');
  assert.ok(
    build.jobs.some((j) => j.dir !== 'apps/backend') || build.jobs.length === 1,
    'build is not narrowed to the written workspace',
  );
});

test('phase order is lint -> typecheck -> test -> build and is not negotiable', () => {
  const plan = planBarrier({ repoRoot: fixture(), changed: undefined });
  assert.deepEqual(plan.phases.map((p) => p.phase), ['lint', 'typecheck', 'test', 'build']);
  assert.deepEqual(PHASES, ['lint', 'typecheck', 'test', 'build']);
});

test('each phase resolves the project\'s own script name, not a hardcoded one', () => {
  // backend lints with biome:fix, frontend with lint:fix — both must resolve.
  const plan = planBarrier({ repoRoot: fixture(), changed: undefined });
  const lint = plan.phases.find((p) => p.phase === 'lint');
  const byDir = Object.fromEntries(lint.jobs.map((j) => [j.dir, j.script]));
  assert.equal(byDir['apps/backend'], 'biome:fix');
  assert.equal(byDir['apps/frontend'], 'lint:fix');
});

test('a workspace missing a phase is skipped, never guessed at', () => {
  // packages/shared has only tsc:check. Inventing a test command for it would run
  // something the project never defined.
  const plan = planBarrier({ repoRoot: fixture(), changed: ['packages/shared/index.ts'] });
  const test_ = plan.phases.find((p) => p.phase === 'test');
  assert.equal(test_.jobs.length, 0);
  assert.equal(test_.skipped, true);

  const tc = plan.phases.find((p) => p.phase === 'typecheck');
  assert.deepEqual(tc.jobs.map((j) => j.dir), ['packages/shared']);
});

test('scriptFor prefers the more specific candidate', () => {
  const ws = { scripts: { test: 'vitest', 'test:run': 'vitest run' } };
  assert.equal(scriptFor(ws, 'test'), 'test:run', 'test:run is the non-watch variant — prefer it');
});

test('scopeWorkspaces treats an empty changed list as full scope, not empty scope', () => {
  // An empty write-set must never mean "run nothing" — that would silently green a wave.
  const ws = [{ dir: 'apps/a' }, { dir: 'apps/b' }];
  assert.equal(scopeWorkspaces(ws, []).selected.length, 2);
  assert.equal(scopeWorkspaces(ws, ['   ']).selected.length, 2);
});

test('a single-package repo yields one root workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrier-solo-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'solo', scripts: { test: 'vitest', build: 'tsc' } }));
  const plan = planBarrier({ repoRoot: root, changed: undefined });
  assert.deepEqual(plan.workspacesDiscovered, ['.']);
  assert.deepEqual(plan.phases.find((p) => p.phase === 'test').jobs.map((j) => j.dir), ['.']);
});

// ─── Dependent workspaces must be pulled into scope ───────────────────────────
// Real failure this encodes: a change to a shared workspace package broke a DEPENDENT
// app's typecheck, and the wave that wrote it never touched that app. Scoping purely by
// "who wrote the file" would have declared that wave green and shipped the break. A
// shared package's consumers are part of its blast radius, so they are part of its scope.

/** Fixture where apps/frontend depends on the workspace package `@repo/api-types`. */
function depFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrier-dep-'));
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { build: 'turbo build' } }));
  const mk = (dir, pkg) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(pkg));
  };
  mk('packages/api-types', { name: '@repo/api-types', scripts: { 'tsc:check': 'tsc' } });
  mk('apps/frontend', {
    name: 'frontend',
    scripts: { 'tsc:check': 'tsc', test: 'vitest' },
    dependencies: { '@repo/api-types': 'workspace:*' },
  });
  mk('apps/backend', { name: 'backend', scripts: { 'tsc:check': 'tsc', 'test:run': 'vitest' } });
  return root;
}

test('changing a shared package pulls its dependents into scope', () => {
  const plan = planBarrier({ repoRoot: depFixture(), changed: ['packages/api-types/index.d.ts'] });
  assert.ok(
    plan.workspacesSelected.includes('apps/frontend'),
    'apps/frontend depends on @repo/api-types — it must be typechecked and tested',
  );
  assert.ok(plan.workspacesSelected.includes('packages/api-types'));
});

test('a non-dependent workspace stays out of scope', () => {
  // The widening must be driven by the dependency graph, not by giving up on scoping.
  const plan = planBarrier({ repoRoot: depFixture(), changed: ['packages/api-types/index.d.ts'] });
  assert.ok(
    !plan.workspacesSelected.includes('apps/backend'),
    'apps/backend does not depend on @repo/api-types — scoping still applies to it',
  );
  assert.equal(plan.scope, 'scoped-by-write-set+dependents');
});

test('dependent resolution is transitive', () => {
  const root = depFixture();
  // apps/backend now depends on frontend's package, making it a second-order dependent.
  const be = path.join(root, 'apps/backend/package.json');
  const pkg = JSON.parse(fs.readFileSync(be, 'utf8'));
  pkg.dependencies = { frontend: 'workspace:*' };
  fs.writeFileSync(be, JSON.stringify(pkg));

  const plan = planBarrier({ repoRoot: root, changed: ['packages/api-types/index.d.ts'] });
  assert.ok(
    plan.workspacesSelected.includes('apps/backend'),
    'api-types -> frontend -> backend: a transitive dependent is still in the blast radius',
  );
});

// ─── End-to-end execution ─────────────────────────────────────────────────────
// The planner is where the decisions live, but "stops at the first failing phase" is a
// property of the runner, and it is the one the orchestrator's evidence depends on:
// a barrier that reported green after a red typecheck would launder a broken wave.
// These use trivial scripts (node -e) so they exercise the real spawn path without
// running a real build.

const { execFileSync } = require('node:child_process');
const BARRIER = path.resolve(__dirname, '..', 'barrier.cjs');

function execFixture(bScripts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'barrier-e2e-'));
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { build: 'node -e 0' } }));
  const mk = (dir, scripts) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: path.basename(dir), scripts }));
  };
  mk('apps/a', { 'lint:fix': 'node -e 0', 'tsc:check': 'node -e 0', 'test:run': 'node -e 0' });
  mk('apps/b', bScripts);
  return root;
}

function runBarrier(root) {
  try {
    return { code: 0, json: JSON.parse(execFileSync('node', [BARRIER, '--repo-root', root], { encoding: 'utf8' })) };
  } catch (err) {
    return { code: err.status, json: JSON.parse(err.stdout) };
  }
}

test('a fully green repo exits 0 and runs every phase', () => {
  const { code, json } = runBarrier(execFixture({ 'tsc:check': 'node -e 0', test: 'node -e 0' }));
  assert.equal(code, 0);
  assert.equal(json.green, true);
  assert.equal(json.failedPhase, null);
  assert.deepEqual(json.phases.map((p) => p.phase), ['lint', 'typecheck', 'test', 'build']);
});

test('a failing phase stops the sequence and later phases never run', () => {
  // The normative bit: test and build must NOT execute after typecheck goes red.
  // Running them anyway wastes the wall-clock the barrier exists to protect, and
  // reporting them alongside a failure invites reading the result as partially green.
  const { code, json } = runBarrier(execFixture({ 'tsc:check': 'node -e "process.exit(2)"', test: 'node -e 0' }));
  assert.equal(code, 2, 'exit 2 signals a failed phase, distinct from exit 1 (usage error)');
  assert.equal(json.green, false);
  assert.equal(json.failedPhase, 'typecheck');
  assert.deepEqual(json.phases.map((p) => p.phase), ['lint', 'typecheck']);
});

test('the failing job is identified by workspace and exit code', () => {
  // "the barrier failed" is not actionable; "apps/b typecheck exit 2" is.
  const { json } = runBarrier(execFixture({ 'tsc:check': 'node -e "process.exit(2)"', test: 'node -e 0' }));
  const tc = json.phases.find((p) => p.phase === 'typecheck');
  const failed = tc.jobs.filter((j) => j.exitCode !== 0);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].dir, 'apps/b');
  assert.equal(failed[0].exitCode, 2);
  assert.ok(tc.jobs.some((j) => j.dir === 'apps/a' && j.exitCode === 0), 'the passing sibling is still reported');
});
