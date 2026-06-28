'use strict'

/**
 * Coverage tests for compute-inventory.cjs — the branches the regression suite
 * (resync-scripts.test.cjs) does not reach: --help, --manifest-path override,
 * git-root detection + cwd fallback, docs-missing, corrupt manifest, per-artifact
 * read errors, and the deleted-feature path.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/compute-inventory.coverage.test.cjs
 *
 * The legacy/prefixed/changed classification paths are already covered by
 * resync-scripts.test.cjs and are NOT duplicated here.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCRIPT = path.resolve(__dirname, '..', 'compute-inventory.cjs')

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'compute-inv-cov-'))
}

function writeSpec(root, slug, content) {
  const dir = path.join(root, 'docs', 'superpowers', slug, 'specs')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${slug}-design.md`), content, 'utf8')
}

function runJson(args, opts = {}) {
  const out = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...opts,
  })
  return JSON.parse(out)
}

function featureBySlug(result, slug) {
  return result.features.find((f) => f.slug === slug)
}

// ─── --help / -h (lines 114-117) ──────────────────────────────────────────────

test('compute-inventory: --help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' })
  assert.match(out, /compute-inventory\.cjs/)
})

test('compute-inventory: -h is an alias for --help', () => {
  const out = execFileSync('node', [SCRIPT, '-h'], { encoding: 'utf8' })
  assert.match(out, /compute-inventory\.cjs/)
})

// ─── --manifest-path override (lines 125-127) ─────────────────────────────────

test('compute-inventory: --manifest-path overrides the default manifest location', () => {
  const repo = mkTmp()
  try {
    const content = '# Design\n\nstable\n'
    writeSpec(repo, 'feat', content)
    const crypto = require('node:crypto')
    const bare = crypto.createHash('sha256').update(content, 'utf8').digest('hex')
    const customManifest = path.join(repo, 'custom-manifest.json')
    fs.writeFileSync(
      customManifest,
      JSON.stringify({ synced_features: { feat: { spec_hash: bare, prd_hash: null, qa_hash: null } } }),
      'utf8',
    )
    const result = runJson(['--repo-root', repo, '--manifest-path', customManifest])
    // The override manifest matches disk content → unchanged (proves it was read).
    assert.equal(featureBySlug(result, 'feat').status, 'unchanged')
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── git-root detection: cwd fallback when not in a git repo (lines 162-167) ──

test('compute-inventory: no --repo-root outside a git repo falls back to cwd', () => {
  const nonGit = mkTmp() // os.tmpdir() is not a git work tree, no docs/ inside
  try {
    const result = runJson([], { cwd: nonGit })
    // repoRoot resolves to cwd; docs/superpowers absent → empty inventory.
    assert.equal(fs.realpathSync(result.repoRoot), fs.realpathSync(nonGit))
    assert.deepEqual(result.features, [])
    assert.equal(result.hashMethod, 'none')
    assert.equal(result.treeHash, null)
  } finally {
    fs.rmSync(nonGit, { recursive: true, force: true })
  }
})

// ─── git-root detection success path (line 138 + 161-163) ─────────────────────

test('compute-inventory: no --repo-root inside a git repo detects the toplevel', () => {
  const repo = mkTmp()
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    const result = runJson([], { cwd: repo })
    assert.equal(fs.realpathSync(result.repoRoot), fs.realpathSync(repo))
    assert.deepEqual(result.features, [])
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── docs/superpowers missing (lines 173-184) ─────────────────────────────────

test('compute-inventory: docs/superpowers absent → empty inventory', () => {
  const repo = mkTmp()
  try {
    const result = runJson(['--repo-root', repo])
    assert.equal(result.treeHash, null)
    assert.equal(result.hashMethod, 'none')
    assert.deepEqual(result.features, [])
    assert.deepEqual(result.errors, [])
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── corrupt manifest catch (lines 192-194) ───────────────────────────────────

test('compute-inventory: unparseable manifest is ignored → every feature is new', () => {
  const repo = mkTmp()
  try {
    writeSpec(repo, 'feat', '# Design\n')
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.memory', 'resync-manifest.json'), 'not-json{', 'utf8')
    const result = runJson(['--repo-root', repo])
    assert.equal(featureBySlug(result, 'feat').status, 'new')
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── per-artifact read errors (lines 228-239) ─────────────────────────────────
// Deterministic, permission-free: making an artifact PATH a directory forces
// fs.readFileSync to throw EISDIR (exists:true, readable:false → spec/prd/qa
// error push). Making the adrs PATH a file forces fs.readdirSync to throw
// ENOTDIR (exists:true, readable:false → adrs error push).

test('compute-inventory: unreadable spec/prd/qa/adrs all get reported as errors', () => {
  const repo = mkTmp()
  try {
    const slug = 'broken'
    const base = path.join(repo, 'docs', 'superpowers', slug)
    // spec/prd/qa canonical paths created AS DIRECTORIES → readFileSync EISDIR.
    fs.mkdirSync(path.join(base, 'specs', `${slug}-design.md`), { recursive: true })
    fs.mkdirSync(path.join(base, 'prd', `prd-${slug}.md`), { recursive: true })
    fs.mkdirSync(path.join(base, 'qa', `qa-report-${slug}.md`), { recursive: true })
    // adrs canonical path created AS A FILE → readdirSync ENOTDIR.
    fs.writeFileSync(path.join(base, 'adrs'), 'i am a file, not a dir\n', 'utf8')

    const result = runJson(['--repo-root', repo])
    const artifacts = result.errors.filter((e) => e.slug === slug).map((e) => e.artifact).sort()
    assert.deepEqual(artifacts, ['adrs', 'prd', 'qa', 'spec'])
    // Each error entry carries a non-null message.
    for (const e of result.errors) {
      assert.ok(typeof e.error === 'string' && e.error.length > 0)
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── deleted feature path (lines 255-266) ─────────────────────────────────────
// docs/superpowers exists (kept-feat present); the manifest also lists gone-feat
// whose directory is absent → it must surface with status 'deleted'.

test('compute-inventory: manifest slug absent from disk → status deleted', () => {
  const repo = mkTmp()
  try {
    writeSpec(repo, 'kept-feat', '# kept\n')
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    fs.writeFileSync(
      path.join(repo, '.memory', 'resync-manifest.json'),
      JSON.stringify({
        synced_features: {
          'kept-feat': { spec_hash: null, prd_hash: null, qa_hash: null },
          'gone-feat': { spec_hash: 'sha256:whatever', prd_hash: null, qa_hash: null },
        },
      }),
      'utf8',
    )
    const result = runJson(['--repo-root', repo])
    const gone = featureBySlug(result, 'gone-feat')
    assert.equal(gone.status, 'deleted')
    assert.equal(gone.artifacts.spec.exists, false)
    assert.equal(gone.artifacts.adrs.exists, false)
    assert.deepEqual(gone.artifacts.adrs.files, [])
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})
