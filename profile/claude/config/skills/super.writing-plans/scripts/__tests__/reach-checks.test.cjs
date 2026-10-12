'use strict';

/**
 * Tests for reach-checks.cjs — the coverage half of plan validation.
 *
 * Fixtures use deliberately synthetic vocabulary (model/handler/alpha/beta).
 * Superpowers runs against arbitrary repositories, so its own tests must assert
 * the *shape* a check reacts to — a kind-suffixed sibling set, an enrollment file
 * that names modules without importing them, a repo with several runner configs —
 * never the domain nouns of whatever project the shape was first observed in.
 *
 * Sensitivity (the gap is flagged) and specificity (a correct plan is silent) are
 * asserted for every check: a validator that cries wolf on good plans gets
 * ignored, and stops catching the bad ones.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/reach-checks.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildRepoIndex,
  discoverTestSuites,
  identifiersFor,
  kindSuffix,
  specifierResolvesTo,
  suiteMatches,
  validateReach,
} = require('../reach-checks.cjs');

function mkRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-checks-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

function run(root, writeSets, testPaths = {}) {
  const errors = [];
  const warnings = [];
  const result = validateReach({
    repoRoot: root,
    writeSetsByTask: new Map(Object.entries(writeSets).map(([k, v]) => [Number(k), v])),
    testPathsByTask: new Map(Object.entries(testPaths).map(([k, v]) => [Number(k), v])),
  }, errors, warnings);
  return { errors, warnings, result };
}

// --- specifier resolution -------------------------------------------------

test('relative specifiers resolve exactly', () => {
  assert.equal(specifierResolvesTo('src/app/use-case.ts', './model', 'src/app/model.ts'), true);
  assert.equal(specifierResolvesTo('src/app/use-case.ts', '../domain/model', 'src/domain/model.ts'), true);
  assert.equal(specifierResolvesTo('src/app/use-case.ts', './other', 'src/app/model.ts'), false);
});

test('alias specifiers match on a two-segment path tail', () => {
  assert.equal(
    specifierResolvesTo('src/a/b.ts', '@/core/domain/model', 'apps/api/src/core/domain/model.ts'),
    true,
  );
});

test('a one-segment bare specifier never matches (npm package, not a repo file)', () => {
  assert.equal(specifierResolvesTo('src/a/b.ts', 'inversify', 'src/inversify.ts'), false);
});

test('index files resolve through their directory specifier', () => {
  assert.equal(specifierResolvesTo('src/a/b.ts', './things', 'src/a/things/index.ts'), true);
});

// --- R1: importer coverage ------------------------------------------------

const IMPORTER_REPO = {
  'package.json': JSON.stringify({ name: 'fixture' }),
  'src/domain/model.ts': 'export class Model { static restore(p: Props) { return new Model() } }',
  'src/store/memory-store.ts': "import { Model } from '@/domain/model'\nModel.restore({})",
  'src/store/db-store.ts': "import { Model } from '../domain/model'\nModel.restore({})",
  'src/unrelated.ts': 'export const x = 1',
};

test('R1 flags importers of a modified file that belong to no write-set', () => {
  const root = mkRepo(IMPORTER_REPO);
  const { warnings, result } = run(root, { 1: ['src/domain/model.ts'] });

  assert.equal(result.importerCoverage.length, 1);
  assert.deepEqual(result.importerCoverage[0].uncovered, [
    'src/store/db-store.ts',
    'src/store/memory-store.ts',
  ]);
  assert.match(warnings[0].message, /importers are in no task's write-set/u);
});

test('R1 is silent once every importer is in some task write-set', () => {
  const root = mkRepo(IMPORTER_REPO);
  const { result } = run(root, {
    1: ['src/domain/model.ts'],
    2: ['src/store/memory-store.ts', 'src/store/db-store.ts'],
  });

  assert.deepEqual(result.importerCoverage, []);
});

test('R1 ignores files the plan creates (nothing imports them yet)', () => {
  const root = mkRepo(IMPORTER_REPO);
  const { result } = run(root, { 1: ['src/domain/brand-new.ts'] });

  assert.equal(result.modifiedCount, 0);
  assert.equal(result.createdCount, 1);
  assert.deepEqual(result.importerCoverage, []);
});

// --- R2: registry / enrollment coverage -----------------------------------

/**
 * The shape that defeats import-graph analysis: an enrollment file names each
 * module through a container token and imports none of them.
 */
const REGISTRY_REPO = {
  'package.json': JSON.stringify({ name: 'fixture' }),
  'src/api/alpha.handler.ts': 'export class AlphaHandler {}',
  'src/api/beta.handler.ts': 'export class BetaHandler {}',
  'src/api/gamma.handler.ts': 'export class GammaHandler {}',
  'src/bootstrap/register-handlers.ts': [
    "import { TOKENS } from '@/ioc/tokens'",
    'export function registerHandlers() {',
    '  return [',
    '    resolve(TOKENS.Handlers.Alpha),',
    '    resolve(TOKENS.Handlers.Beta),',
    '    resolve(TOKENS.Handlers.Gamma),',
    '  ]',
    '}',
  ].join('\n'),
  'src/elsewhere.ts': 'export const unrelated = 1',
};

test('R2 flags the enrollment file for a newly created module, despite zero imports', () => {
  const root = mkRepo(REGISTRY_REPO);
  const { warnings, result } = run(root, { 1: ['src/api/delta.handler.ts'] });

  assert.equal(result.registryCoverage.length, 1);
  const [finding] = result.registryCoverage;
  assert.equal(finding.file, 'src/api/delta.handler.ts');
  assert.equal(finding.siblingCount, 3);
  assert.ok(
    finding.registries.some((entry) => entry.file === 'src/bootstrap/register-handlers.ts'),
    'the token-based enrollment file should be detected',
  );
  assert.match(warnings.map((w) => w.message).join('\n'), /does not exist at runtime/u);
});

test('R2 is silent when the enrollment file is already in the write-set', () => {
  const root = mkRepo(REGISTRY_REPO);
  const { result } = run(root, {
    1: ['src/api/delta.handler.ts', 'src/bootstrap/register-handlers.ts'],
  });

  assert.deepEqual(result.registryCoverage, []);
});

test('R2 does not fire when a created file has no siblings of its kind', () => {
  const root = mkRepo({
    'package.json': JSON.stringify({ name: 'fixture' }),
    'src/solo/only.handler.ts': 'export class OnlyHandler {}',
  });
  const { result } = run(root, { 1: ['src/fresh/area.handler.ts'] });

  assert.deepEqual(result.registryCoverage, []);
});

test('a file mentioning only one sibling is not an enrollment point', () => {
  const root = mkRepo({
    ...REGISTRY_REPO,
    'src/bootstrap/register-handlers.ts': 'resolve(TOKENS.Handlers.Alpha)',
  });
  const { result } = run(root, { 1: ['src/api/delta.handler.ts'] });

  assert.deepEqual(result.registryCoverage, []);
});

test('an enrollment candidate in a different package is not a registry', () => {
  const root = mkRepo({
    'apps/api/package.json': JSON.stringify({ name: 'api' }),
    'apps/api/src/handlers/alpha.handler.ts': 'export class AlphaHandler {}',
    'apps/api/src/handlers/beta.handler.ts': 'export class BetaHandler {}',
    'apps/web/package.json': JSON.stringify({ name: 'web' }),
    'apps/web/src/page.tsx': 'const labels = { Alpha: "a", Beta: "b", Delta: "d" }',
  });
  const { result } = run(root, { 1: ['apps/api/src/handlers/delta.handler.ts'] });

  assert.deepEqual(result.registryCoverage, [], 'shared vocabulary across packages is not enrollment');
});

test('identifiersFor derives both the bare and kind-suffixed identifier', () => {
  assert.deepEqual(
    [...identifiersFor('src/x/fetch-all-items.controller.ts')].sort(),
    ['FetchAllItems', 'FetchAllItemsController'],
  );
});

test('kindSuffix reads the compound suffix, falling back to the extension', () => {
  assert.equal(kindSuffix('a/b/delta.handler.ts'), '.handler.ts');
  assert.equal(kindSuffix('a/b/model.ts'), '.ts');
});

// --- R3: test-suite coverage ----------------------------------------------

const SUITE_REPO = {
  'package.json': JSON.stringify({ name: 'root' }),
  'apps/api/package.json': JSON.stringify({
    name: 'api',
    scripts: {
      'test:run': 'vitest --run --config ./test/vite.config.unit.ts',
      'test:integration': 'vitest run --config ./test/vite.config.integration.ts',
    },
  }),
  'apps/api/test/vite.config.unit.ts': 'export default { test: { include: ["**/**/*.test.ts"] } }',
  'apps/api/test/vite.config.integration.ts': 'export default { test: { include: ["**/**/*.integration-test.ts"] } }',
  'apps/api/src/core/model.ts': 'export class Model {}',
};

test('R3 inventories every runner config with the npm script that drives it', () => {
  const root = mkRepo(SUITE_REPO);
  const suites = discoverTestSuites(root, buildRepoIndex(root));

  assert.equal(suites.length, 2);
  const unit = suites.find((s) => s.config.endsWith('vite.config.unit.ts'));
  assert.deepEqual(unit.include, ['**/**/*.test.ts']);
  assert.deepEqual(unit.commands, [{ package: 'api', script: 'test:run' }]);
});

test('R3 warns that a multi-config repo has no single "full suite" command', () => {
  const root = mkRepo(SUITE_REPO);
  const { warnings } = run(root, { 1: ['apps/api/src/core/model.ts'] });

  const inventory = warnings.find((w) => /no single command is "the full suite"/u.test(w.message));
  assert.ok(inventory, 'expected the suite-inventory warning');
  assert.match(inventory.message, /test:run/u);
  assert.match(inventory.message, /test:integration/u);
  // Measured 2026-09-21: "state the command set in the plan" made a planner paste the
  // inventory into the index header, where nothing reads it. The executor resolves it.
  assert.match(inventory.message, /do not copy it into the plan/u);
  assert.doesNotMatch(inventory.message, /State the complete verification command set/u);
});

test('R1 never invites the planner to record an "additive" confirmation in the plan', () => {
  const root = mkRepo(IMPORTER_REPO);
  const { warnings } = run(root, { 1: ['src/domain/model.ts'] });
  const r1 = warnings.filter((x) => /importers are in no task's write-set/u.test(x.message));
  assert.equal(r1.length, 1);
  assert.match(r1[0].message, /never a line in the plan/u);
  assert.doesNotMatch(r1[0].message, /confirm the change is additive/u);
});

test('a config under docs/ is not a suite even when it sits at its own package root', () => {
  const root = mkRepo({
    'apps/api/package.json': JSON.stringify({
      name: 'api',
      scripts: { 'test:run': 'vitest --config ./test/vite.config.unit.ts' },
    }),
    'apps/api/test/vite.config.unit.ts': 'export default { test: { include: ["**/*.test.ts"] } }',
    'docs/superpowers/x/qa/evidence/us-01/package.json': JSON.stringify({ name: 'evidence-us-01' }),
    'docs/superpowers/x/qa/evidence/us-01/vitest.config.ts': 'export default { test: { include: ["*.acceptance.test.tsx"] } }',
  });
  const suites = discoverTestSuites(root, buildRepoIndex(root));
  assert.deepEqual(suites.map((s) => s.config), ['apps/api/test/vite.config.unit.ts']);
});

/**
 * The trap this catches: a suite selected by a non-default filename pattern. A
 * test named outside every include glob is never executed and therefore never
 * fails, which reads identically to passing.
 */
test('R3 errors on a declared test file no runner config would select', () => {
  const root = mkRepo(SUITE_REPO);
  const { errors } = run(
    root,
    { 1: ['apps/api/src/core/model.ts'] },
    { 1: ['apps/api/src/core/model.contract-check.ts'] },
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /matches the include globs of none of the 2 discovered runner configs/u);
});

test('R3 accepts a test file that a suite does select', () => {
  const root = mkRepo(SUITE_REPO);
  const { errors } = run(
    root,
    { 1: ['apps/api/src/core/model.ts'] },
    { 1: ['apps/api/src/core/model.integration-test.ts'] },
  );

  assert.deepEqual(errors, []);
});

test('suiteMatches resolves include globs against the config dir and its package root', () => {
  const suite = {
    config: 'apps/api/test/vite.config.unit.ts',
    dir: 'apps/api/test',
    include: ['**/**/*.test.ts'],
  };
  assert.equal(suiteMatches(suite, 'apps/api/src/core/model.test.ts'), true);
  assert.equal(suiteMatches(suite, 'apps/api/src/core/model.integration-test.ts'), false);
});

// --- noise control --------------------------------------------------------

test('a test file whose subject is in the write-set is covered by proxy, not flagged', () => {
  const root = mkRepo({
    'package.json': JSON.stringify({ name: 'fixture' }),
    'src/domain/model.ts': 'export class Model {}',
    'src/app/create-item.usecase.ts': "import { Model } from '../domain/model'",
    'src/app/create-item.usecase.test.ts': "import { Model } from '../domain/model'",
  });
  const { result } = run(root, { 1: ['src/domain/model.ts', 'src/app/create-item.usecase.ts'] });

  assert.deepEqual(result.importerCoverage, [], 'the .test.ts of a covered subject is in scope');
});

test('a test file whose subject is NOT in the write-set is still flagged', () => {
  const root = mkRepo({
    'package.json': JSON.stringify({ name: 'fixture' }),
    'src/domain/model.ts': 'export class Model {}',
    'src/app/create-item.usecase.test.ts': "import { Model } from '../domain/model'",
  });
  const { result } = run(root, { 1: ['src/domain/model.ts'] });

  assert.deepEqual(result.importerCoverage[0].uncovered, ['src/app/create-item.usecase.test.ts']);
});

test('nested git worktrees under a dot-directory are not indexed as a second repo', () => {
  const root = mkRepo({
    'package.json': JSON.stringify({ name: 'fixture' }),
    'src/domain/model.ts': 'export class Model {}',
    'src/store/db-store.ts': "import { Model } from '../domain/model'",
    '.worktrees/copy/src/domain/model.ts': 'export class Model {}',
    '.worktrees/copy/src/store/db-store.ts': "import { Model } from '../domain/model'",
  });
  const { result } = run(root, { 1: ['src/domain/model.ts'] });

  assert.deepEqual(result.importerCoverage[0].uncovered, ['src/store/db-store.ts']);
});

test('a shared base config nothing runs is not counted as a suite', () => {
  const root = mkRepo({
    'apps/api/package.json': JSON.stringify({
      name: 'api',
      scripts: { 'test:run': 'vitest --config ./test/vite.config.unit.ts' },
    }),
    'apps/api/test/vite.config.unit.ts': 'export default { test: { include: ["**/*.test.ts"] } }',
    'apps/api/test/vite.config.shared.ts': 'export default { test: {} }',
    'docs/evidence/case-01/vitest.config.ts': 'export default { test: { include: ["**/*.test.ts"] } }',
  });
  const suites = discoverTestSuites(root, buildRepoIndex(root));

  assert.deepEqual(suites.map((s) => s.config), ['apps/api/test/vite.config.unit.ts']);
});

// --- guard rails ----------------------------------------------------------

test('a missing repo root disables reach entirely rather than failing the plan', () => {
  const errors = [];
  const warnings = [];
  const result = validateReach({
    repoRoot: '/nonexistent/path/for/reach/test',
    writeSetsByTask: new Map(),
    testPathsByTask: new Map(),
  }, errors, warnings);

  assert.equal(result, null);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});
