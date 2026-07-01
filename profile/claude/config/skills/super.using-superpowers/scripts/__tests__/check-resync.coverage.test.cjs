'use strict'

/**
 * Coverage tests for check-resync.cjs — the branches the regression suite
 * (resync-scripts.test.cjs) does not reach: --help, git-root detection,
 * the repoNotFound path, the docs-missing path, and the corrupt-manifest catch.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/check-resync.coverage.test.cjs
 *
 * The dirty/clean/new/deleted classification paths are already covered by
 * resync-scripts.test.cjs and are NOT duplicated here.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCRIPT = path.resolve(__dirname, '..', 'check-resync.cjs')

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-resync-cov-'))
}

function writeSpec(root, slug, content) {
  const dir = path.join(root, 'docs', 'superpowers', slug, 'specs')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${slug}-design.md`), content, 'utf8')
}

// ─── --help / -h (lines 87-90) ────────────────────────────────────────────────

test('check-resync: --help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' })
  assert.match(out, /check-resync\.cjs/)
  assert.match(out, /Usage:/)
})

test('check-resync: -h is an alias for --help', () => {
  const out = execFileSync('node', [SCRIPT, '-h'], { encoding: 'utf8' })
  assert.match(out, /check-resync\.cjs/)
})

// ─── git-root detection: not a git repo → repoNotFound (lines 101-133) ────────

test('check-resync: no --repo-root and cwd outside any git repo → repoNotFound', () => {
  const nonGit = mkTmp() // os.tmpdir() is not a git work tree
  try {
    const out = execFileSync('node', [SCRIPT], { cwd: nonGit, encoding: 'utf8' })
    const result = JSON.parse(out)
    assert.equal(result.repoNotFound, true)
    assert.equal(result.dirty, false)
    assert.equal(result.docsExists, false)
    assert.equal(result.memoryExists, false)
    assert.equal(result.repoRoot, null)
    assert.equal(result.hashMethod, 'none')
  } finally {
    fs.rmSync(nonGit, { recursive: true, force: true })
  }
})

// ─── git-root detection success path (line 107 + 116-117) ─────────────────────
// `git init` makes detectGitRoot() return a real toplevel; with no docs/ dir the
// run then falls into the docs-missing branch using the detected root.

test('check-resync: no --repo-root inside a git repo detects the toplevel', () => {
  const repo = mkTmp()
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    const out = execFileSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' })
    const result = JSON.parse(out)
    assert.equal(result.repoNotFound, false)
    assert.equal(result.docsExists, false)
    // git's toplevel may resolve through /private on macOS; compare by realpath.
    assert.equal(fs.realpathSync(result.repoRoot), fs.realpathSync(repo))
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── docs/superpowers missing (lines 140-155) ─────────────────────────────────

test('check-resync: docs/superpowers absent → docsExists false, not dirty', () => {
  const repo = mkTmp()
  try {
    const out = execFileSync('node', [SCRIPT, '--repo-root', repo], { encoding: 'utf8' })
    const result = JSON.parse(out)
    assert.equal(result.docsExists, false)
    assert.equal(result.dirty, false)
    assert.equal(result.repoNotFound, false)
    assert.equal(result.memoryExists, false) // no .memory dir
    assert.equal(result.manifest, null)
    assert.equal(result.hashMethod, 'none')
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('check-resync: docs absent but .memory present → memoryExists true', () => {
  const repo = mkTmp()
  try {
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    const out = execFileSync('node', [SCRIPT, '--repo-root', repo], { encoding: 'utf8' })
    const result = JSON.parse(out)
    assert.equal(result.docsExists, false)
    assert.equal(result.memoryExists, true)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── corrupt manifest catch (lines 163-166) ───────────────────────────────────
// docs exist + manifest is invalid JSON → parse throws → manifest stays null →
// dirty is true (never synced) and a warning goes to stderr.

test('check-resync: unparseable manifest is treated as never-synced (dirty)', () => {
  const repo = mkTmp()
  try {
    writeSpec(repo, 'feat', '# Design\n')
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.memory', 'resync-manifest.json'), '{ not json', 'utf8')
    const out = execFileSync('node', [SCRIPT, '--repo-root', repo], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // swallow the warning on stderr
    })
    const result = JSON.parse(out)
    assert.equal(result.dirty, true)
    assert.equal(result.manifest, null)
    assert.equal(result.docsExists, true)
    assert.equal(result.hashMethod, 'artifact-content')
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── manifest body is omitted by default, included only with --with-manifest ──
// Token economy: a present, parseable manifest is NOT echoed into stdout unless
// the caller opts in. dirty is still computed from the manifest internally.

test('check-resync: a present manifest is omitted from stdout by default', () => {
  const repo = mkTmp()
  try {
    writeSpec(repo, 'feat', '# Design\n')
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    // valid JSON, but no synced_features → content differs from disk → dirty
    fs.writeFileSync(
      path.join(repo, '.memory', 'resync-manifest.json'),
      JSON.stringify({ version: 1, synced_features: {} }),
      'utf8',
    )
    const out = execFileSync('node', [SCRIPT, '--repo-root', repo], { encoding: 'utf8' })
    const result = JSON.parse(out)
    assert.equal(result.manifest, null) // omitted despite existing on disk
    assert.equal(result.dirty, true) // still computed correctly from the manifest
    assert.equal(result.hashMethod, 'artifact-content')
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('check-resync: --with-manifest includes the parsed manifest inline', () => {
  const repo = mkTmp()
  try {
    writeSpec(repo, 'feat', '# Design\n')
    fs.mkdirSync(path.join(repo, '.memory'), { recursive: true })
    const manifest = { version: 1, synced_features: {} }
    fs.writeFileSync(
      path.join(repo, '.memory', 'resync-manifest.json'),
      JSON.stringify(manifest),
      'utf8',
    )
    const out = execFileSync('node', [SCRIPT, '--repo-root', repo, '--with-manifest'], {
      encoding: 'utf8',
    })
    const result = JSON.parse(out)
    assert.deepEqual(result.manifest, manifest)
    assert.equal(result.dirty, true)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})
