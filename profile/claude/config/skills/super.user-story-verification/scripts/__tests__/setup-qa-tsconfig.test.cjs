'use strict';

/**
 * Tests for setup-qa-tsconfig.cjs — gives QA evidence folders a TypeScript
 * "owner" (tsconfig.json extending a centralized template + node_modules
 * symlink) so aliases and plain package imports resolve without copying
 * acceptance tests into the project source tree.
 *
 * Regression target: BUG-QA-02 — QA subagents independently invented ad-hoc
 * workarounds (copying a test file into apps/backend/src to resolve aliases),
 * which caused a real race condition when another subagent's full-suite run
 * picked up the transient copy mid-removal. This script is the official,
 * scaffolded alternative.
 *
 * Run with: node --test super.user-story-verification/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'setup-qa-tsconfig.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tsconfig-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function run(args) {
  const out = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function runExpectFailure(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    throw new Error('expected non-zero exit');
  } catch (error) {
    return error;
  }
}

// A minimal but realistic monorepo: solution-style root tsconfig + a React
// frontend app + a Node backend app, each with their own tsconfig paths and
// a node_modules directory (so the symlink step has something real to point at).
function scaffoldMonorepo(root) {
  writeJson(path.join(root, 'package.json'), { name: 'monorepo', private: true });
  writeJson(path.join(root, 'tsconfig.json'), {
    files: [],
    references: [{ path: './apps/backend' }, { path: './apps/frontend' }],
  });

  writeJson(path.join(root, 'apps/frontend/package.json'), {
    name: 'frontend',
    dependencies: { react: '19.0.0', next: '16.0.0' },
  });
  writeJson(path.join(root, 'apps/frontend/tsconfig.json'), {
    compilerOptions: {
      jsx: 'react-jsx',
      paths: {
        '@/*': ['./src/*'],
        '@/lib/*': ['./src/lib/*'],
      },
    },
    include: ['**/*.ts', '**/*.tsx'],
  });
  fs.mkdirSync(path.join(root, 'apps/frontend/node_modules/react'), { recursive: true });

  writeJson(path.join(root, 'apps/backend/package.json'), {
    name: 'backend',
    dependencies: { fastify: '5.0.0' },
  });
  writeJson(path.join(root, 'apps/backend/tsconfig.json'), {
    compilerOptions: {
      paths: {
        '@/*': ['./src/*'],
        'test/*': ['./test/*'],
      },
    },
    include: ['**/*.ts'],
  });
  fs.mkdirSync(path.join(root, 'apps/backend/node_modules/fastify'), { recursive: true });
}

test('--ensure-templates auto-detects both apps and writes both templates', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const result = run(['--ensure-templates', '--repo-root', root]);

    assert.equal(result.templates.length, 2);
    assert.deepEqual(result.warnings, []);

    const frontend = result.templates.find((t) => t.kind === 'frontend');
    const backend = result.templates.find((t) => t.kind === 'backend');
    assert.equal(frontend.created, true);
    assert.equal(backend.created, true);
    assert.equal(frontend.appRoot, 'apps/frontend');
    assert.equal(backend.appRoot, 'apps/backend');
    assert.equal(frontend.source, 'auto-detected');

    const frontendTemplate = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/superpowers/tsconfig.frontend-qa.json'), 'utf8'),
    );
    assert.equal(frontendTemplate.extends, '../../apps/frontend/tsconfig.json');
    assert.deepEqual(frontendTemplate.compilerOptions.paths, {
      '@/*': ['../../apps/frontend/src/*'],
      '@/lib/*': ['../../apps/frontend/src/lib/*'],
    });
    assert.deepEqual(frontendTemplate.include, ['**/qa/evidence/**/*.ts', '**/qa/evidence/**/*.tsx']);

    const backendTemplate = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/superpowers/tsconfig.backend-qa.json'), 'utf8'),
    );
    assert.deepEqual(backendTemplate.compilerOptions.paths, {
      '@/*': ['../../apps/backend/src/*'],
      'test/*': ['../../apps/backend/test/*'],
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/superpowers/.qa-tsconfig-manifest.json'), 'utf8'),
    );
    assert.equal(manifest.frontend.appRoot, 'apps/frontend');
    assert.equal(manifest.backend.appRoot, 'apps/backend');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--ensure-templates is idempotent — second run without --force creates nothing new', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    run(['--ensure-templates', '--repo-root', root]);
    const second = run(['--ensure-templates', '--repo-root', root]);
    assert.equal(second.templates.every((t) => t.created === false), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--ensure-templates --force overwrites existing templates', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    run(['--ensure-templates', '--repo-root', root]);
    const forced = run(['--ensure-templates', '--repo-root', root, '--force']);
    assert.equal(forced.templates.every((t) => t.created === true), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--ensure-templates skips the solution-style root tsconfig (no false frontend/backend match)', () => {
  const root = mkRepo();
  try {
    // Only the root tsconfig exists (solution-style) — no real apps.
    writeJson(path.join(root, 'package.json'), { name: 'monorepo', private: true, dependencies: { react: '19.0.0' } });
    writeJson(path.join(root, 'tsconfig.json'), { files: [], references: [] });
    const result = run(['--ensure-templates', '--repo-root', root]);
    assert.equal(result.templates.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--ensure-templates reports ambiguous when two candidates classify as the same kind', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    // A second frontend-shaped app confuses auto-detection.
    writeJson(path.join(root, 'apps/admin/package.json'), { name: 'admin', dependencies: { react: '19.0.0' } });
    writeJson(path.join(root, 'apps/admin/tsconfig.json'), { compilerOptions: { paths: {} }, include: ['**/*.ts'] });

    const result = run(['--ensure-templates', '--repo-root', root]);
    const frontend = result.templates.find((t) => t.kind === 'frontend');
    assert.equal(frontend, undefined);
    assert.equal(result.warnings.some((w) => w.includes('Ambiguous frontend')), true);

    const backend = result.templates.find((t) => t.kind === 'backend');
    assert.equal(backend.created, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--frontend-app-root override resolves an ambiguous auto-detection', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    writeJson(path.join(root, 'apps/admin/package.json'), { name: 'admin', dependencies: { react: '19.0.0' } });
    writeJson(path.join(root, 'apps/admin/tsconfig.json'), { compilerOptions: { paths: {} }, include: ['**/*.ts'] });

    const result = run(['--ensure-templates', '--repo-root', root, '--frontend-app-root', 'apps/frontend']);
    const frontend = result.templates.find((t) => t.kind === 'frontend');
    assert.equal(frontend.created, true);
    assert.equal(frontend.source, 'override');
    assert.equal(frontend.appRoot, 'apps/frontend');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('regression: a backend using vitest (which pulls in "vite") is still auto-detected as backend', () => {
  // Reproduces a real target repo: vitest is a common backend test runner and
  // brings "vite" into devDependencies. "vite" used to be a frontend marker,
  // so this backend matched both marker sets and was silently dropped.
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const backendPkgPath = path.join(root, 'apps/backend/package.json');
    const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    backendPkg.devDependencies = { vitest: '4.0.0', vite: '8.0.0' };
    writeJson(backendPkgPath, backendPkg);

    const result = run(['--ensure-templates', '--repo-root', root]);
    const backend = result.templates.find((t) => t.kind === 'backend');
    assert.equal(backend.created, true);
    assert.equal(backend.source, 'auto-detected');
    assert.equal(result.warnings.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('regression: a directory matching both frontend and backend markers is reported as ambiguous, not silently skipped', () => {
  // Reproduces a real target repo: a backend that also depends on react (e.g.
  // for server-rendered email templates) classifies as neither kind cleanly.
  // classifyAppRoot returns kind:null for it, which used to be filtered out
  // of BOTH the frontend and backend candidate lists before the ambiguity
  // check ran, so it disappeared with zero warning instead of surfacing.
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const backendPkgPath = path.join(root, 'apps/backend/package.json');
    const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    backendPkg.dependencies.react = '19.0.0';
    writeJson(backendPkgPath, backendPkg);

    const result = run(['--ensure-templates', '--repo-root', root]);
    const backend = result.templates.find((t) => t.kind === 'backend');
    assert.equal(backend, undefined);
    assert.equal(result.warnings.some((w) => w.includes('Ambiguous backend') && w.includes('apps/backend')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--backend-app-root override is honored even when the directory matches both marker sets', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const backendPkgPath = path.join(root, 'apps/backend/package.json');
    const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    backendPkg.dependencies.react = '19.0.0';
    writeJson(backendPkgPath, backendPkg);

    const result = run(['--ensure-templates', '--repo-root', root, '--backend-app-root', 'apps/backend']);
    const backend = result.templates.find((t) => t.kind === 'backend');
    assert.equal(backend.created, true);
    assert.equal(backend.source, 'override');
    assert.equal(backend.appRoot, 'apps/backend');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('regression: a .claude/worktrees/ copy of the apps does not create a false ambiguity', () => {
  // Reproduces a real target repo mid-parallel-development: super.parallel-
  // subagent-development creates a git worktree under .claude/worktrees/<name>/
  // that contains its own copy of apps/frontend and apps/backend. Before
  // .claude was added to SKIP_DIRS, the walk found two frontend (and two
  // backend) candidates and reported the run as ambiguous even on a repo with
  // exactly one real frontend/backend pair.
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const worktreeRoot = path.join(root, '.claude/worktrees/some-feature');
    writeJson(path.join(worktreeRoot, 'apps/frontend/package.json'), {
      name: 'frontend',
      dependencies: { react: '19.0.0', next: '16.0.0' },
    });
    writeJson(path.join(worktreeRoot, 'apps/frontend/tsconfig.json'), {
      compilerOptions: { paths: { '@/*': ['./src/*'] } },
    });

    const result = run(['--ensure-templates', '--repo-root', root]);
    const frontend = result.templates.find((t) => t.kind === 'frontend');
    assert.equal(frontend.created, true);
    assert.equal(frontend.source, 'auto-detected');
    assert.equal(frontend.appRoot, 'apps/frontend');
    assert.equal(result.warnings.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--ensure-templates tolerates JSONC comments in the app tsconfig', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const tsconfigPath = path.join(root, 'apps/frontend/tsconfig.json');
    const withComment = `{
      // generated by create-next-app
      "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
      "include": ["**/*.ts", "**/*.tsx"],
    }`;
    fs.writeFileSync(tsconfigPath, withComment, 'utf8');

    const result = run(['--ensure-templates', '--repo-root', root]);
    const frontend = result.templates.find((t) => t.kind === 'frontend');
    assert.equal(frontend.created, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--scaffold-evidence without --ensure-templates first returns ok:false with a clear reason', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    const evidenceDir = 'docs/superpowers/my-feature/qa/evidence/us-01-story';
    const result = run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);
    assert.equal(result.ok, false);
    assert.match(result.reason, /ensure-templates first/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--scaffold-evidence writes a 1-line tsconfig.json and a node_modules symlink', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    run(['--ensure-templates', '--repo-root', root]);
    const evidenceDir = 'docs/superpowers/my-feature/qa/evidence/us-01-story';
    const result = run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);

    assert.equal(result.ok, true);
    assert.equal(result.tsconfigCreated, true);
    assert.equal(result.symlinkCreated, true);
    assert.deepEqual(result.warnings, []);

    const absEvidenceDir = path.join(root, evidenceDir);
    const tsconfig = JSON.parse(fs.readFileSync(path.join(absEvidenceDir, 'tsconfig.json'), 'utf8'));
    const expectedExtends = path
      .relative(absEvidenceDir, path.join(root, 'docs/superpowers/tsconfig.frontend-qa.json'))
      .split(path.sep)
      .join('/');
    assert.equal(tsconfig.extends, expectedExtends.startsWith('.') ? expectedExtends : `./${expectedExtends}`);

    const symlinkPath = path.join(absEvidenceDir, 'node_modules');
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);
    assert.equal(
      fs.realpathSync(symlinkPath),
      fs.realpathSync(path.join(root, 'apps/frontend/node_modules')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--scaffold-evidence is idempotent — second run without --force creates nothing new', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    run(['--ensure-templates', '--repo-root', root]);
    const evidenceDir = 'docs/superpowers/my-feature/qa/evidence/us-01-story';
    run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);
    const second = run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);
    assert.equal(second.tsconfigCreated, false);
    assert.equal(second.symlinkCreated, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--scaffold-evidence warns and skips instead of clobbering a real node_modules directory', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    run(['--ensure-templates', '--repo-root', root]);
    const evidenceDir = 'docs/superpowers/my-feature/qa/evidence/us-01-story';
    const absEvidenceDir = path.join(root, evidenceDir);
    fs.mkdirSync(path.join(absEvidenceDir, 'node_modules'), { recursive: true });

    const result = run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);
    assert.equal(result.symlinkCreated, false);
    assert.equal(result.warnings.some((w) => w.includes('not a symlink')), true);
    assert.equal(fs.lstatSync(path.join(absEvidenceDir, 'node_modules')).isDirectory(), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--scaffold-evidence warns (does not fail) when the app node_modules is missing', () => {
  const root = mkRepo();
  try {
    scaffoldMonorepo(root);
    fs.rmSync(path.join(root, 'apps/frontend/node_modules'), { recursive: true, force: true });
    run(['--ensure-templates', '--repo-root', root]);
    const evidenceDir = 'docs/superpowers/my-feature/qa/evidence/us-01-story';
    const result = run(['--scaffold-evidence', '--repo-root', root, '--evidence-dir', evidenceDir, '--kind', 'frontend']);
    assert.equal(result.ok, true);
    assert.equal(result.symlinkCreated, false);
    assert.equal(result.warnings.some((w) => w.includes('does not exist')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('regression: --frontend-app-root pointing at a malformed tsconfig.json warns instead of crashing', () => {
  // classifyAppRoot already tries and fails to parse this same tsconfig.json
  // (kind:null), but the override path bypasses that mismatch check and used
  // to re-read/re-parse it unprotected, crashing the whole process instead of
  // surfacing the same clean warning classifyAppRoot's own try/catch produces.
  const root = mkRepo();
  try {
    writeJson(path.join(root, 'broken-app/package.json'), { dependencies: { react: '19.0.0' } });
    fs.writeFileSync(path.join(root, 'broken-app/tsconfig.json'), '{ not json at all !!', 'utf8');

    const result = run(['--ensure-templates', '--repo-root', root, '--frontend-app-root', 'broken-app']);
    assert.equal(result.templates.length, 0);
    assert.equal(result.warnings.some((w) => w.includes('unreadable tsconfig.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /setup-qa-tsconfig\.cjs/);
});

test('missing mode flag exits non-zero', () => {
  const error = runExpectFailure(['--repo-root', '/tmp']);
  assert.equal(error.status !== 0, true);
});

test('--scaffold-evidence without --kind exits non-zero', () => {
  const error = runExpectFailure(['--scaffold-evidence', '--repo-root', '/tmp', '--evidence-dir', 'x']);
  assert.equal(error.status !== 0, true);
});
