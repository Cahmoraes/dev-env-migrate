'use strict'

/**
 * Coverage tests for lib/artifact-hash.cjs — the shared hashing library.
 *
 * Exercised directly (require) so the defensive branches that the two CLI
 * scripts never reach in normal use are hit: hashFile read failure, the full
 * hashAdrs body (readdir failure, filter edge cases, empty-dir, partial and
 * total read failures, combined hash), normalizeManifestEntry's non-object
 * guard, and listFeatureSlugs' two catch clauses.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/artifact-hash.coverage.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const lib = require(path.resolve(__dirname, '..', 'lib', 'artifact-hash.cjs'))

// chmod(000) does not block the superuser, so the "unreadable file" cases below
// can only be observed as a non-root user. Skip (don't falsely assert) on root.
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0
const skipIfRoot = IS_ROOT ? { skip: 'chmod 000 does not block root; cannot force a read error' } : {}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-hash-cov-'))
}

const sha = (s) => 'sha256:' + crypto.createHash('sha256').update(s, 'utf8').digest('hex')

// ─── hashFile ─────────────────────────────────────────────────────────────────

test('hashFile: missing path → exists false', () => {
  const repo = mkTmp()
  try {
    assert.deepEqual(lib.hashFile(path.join(repo, 'nope.md')), {
      hash: null,
      exists: false,
      readable: false,
      error: null,
    })
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashFile: readable file → prefixed sha256 of content', () => {
  const repo = mkTmp()
  try {
    const p = path.join(repo, 'a.md')
    fs.writeFileSync(p, 'hello\n', 'utf8')
    const r = lib.hashFile(p)
    assert.equal(r.hash, sha('hello\n'))
    assert.equal(r.exists, true)
    assert.equal(r.readable, true)
    assert.equal(r.error, null)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashFile: path is a directory → read error (exists true, readable false)', () => {
  // Deterministic + permission-free: readFileSync on a directory throws EISDIR.
  const repo = mkTmp()
  try {
    const dirAsFile = path.join(repo, 'looks-like-file.md')
    fs.mkdirSync(dirAsFile)
    const r = lib.hashFile(dirAsFile)
    assert.equal(r.hash, null)
    assert.equal(r.exists, true)
    assert.equal(r.readable, false)
    assert.ok(typeof r.error === 'string' && r.error.length > 0)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── hashAdrs ───────────────────────────────────────────────────────────────

test('hashAdrs: missing dir → exists false, readable true', () => {
  const repo = mkTmp()
  try {
    assert.deepEqual(lib.hashAdrs(path.join(repo, 'adrs')), {
      hash: null,
      exists: false,
      readable: true,
      files: [],
      error: null,
    })
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashAdrs: adrs path is a file → readdir error (exists true, readable false)', () => {
  // Deterministic + permission-free: readdirSync on a file throws ENOTDIR.
  const repo = mkTmp()
  try {
    const adrsAsFile = path.join(repo, 'adrs')
    fs.writeFileSync(adrsAsFile, 'not a dir\n', 'utf8')
    const r = lib.hashAdrs(adrsAsFile)
    assert.equal(r.hash, null)
    assert.equal(r.exists, true)
    assert.equal(r.readable, false)
    assert.deepEqual(r.files, [])
    assert.ok(typeof r.error === 'string' && r.error.length > 0)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashAdrs: dir with no usable .md files → empty (filters non-.md, dirs, broken links)', () => {
  const repo = mkTmp()
  try {
    const adrs = path.join(repo, 'adrs')
    fs.mkdirSync(adrs)
    fs.writeFileSync(path.join(adrs, 'notes.txt'), 'x', 'utf8') // wrong extension → filtered (line 58)
    fs.mkdirSync(path.join(adrs, 'subdir.md')) // a directory ending in .md → filtered (line 60)
    fs.symlinkSync(path.join(repo, 'does-not-exist'), path.join(adrs, 'broken.md')) // dangling → statSync throws → filtered (lines 61-63)
    const r = lib.hashAdrs(adrs)
    assert.deepEqual(r, {
      hash: null,
      exists: true,
      readable: true,
      files: [],
      error: null,
    })
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashAdrs: multiple .md files → combined sorted hash', () => {
  const repo = mkTmp()
  try {
    const adrs = path.join(repo, 'adrs')
    fs.mkdirSync(adrs)
    fs.writeFileSync(path.join(adrs, '0002-b.md'), 'B\n', 'utf8')
    fs.writeFileSync(path.join(adrs, '0001-a.md'), 'A\n', 'utf8')
    const r = lib.hashAdrs(adrs)
    assert.equal(r.exists, true)
    assert.equal(r.readable, true)
    assert.deepEqual(r.files, ['0001-a.md', '0002-b.md']) // sorted
    // hash is the combined "name\ncontent" joined by \n---\n, hashed.
    const expected = sha(['0001-a.md\nA\n', '0002-b.md\nB\n'].join('\n---\n'))
    assert.equal(r.hash, expected)
    assert.equal(r.error, null)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashAdrs: one readable + one unreadable .md → hashes the readable, skips the other', skipIfRoot, () => {
  // Covers the per-file readErrors branch (lines 77-79) while parts stays non-empty.
  const repo = mkTmp()
  try {
    const adrs = path.join(repo, 'adrs')
    fs.mkdirSync(adrs)
    fs.writeFileSync(path.join(adrs, 'ok.md'), 'OK\n', 'utf8')
    const locked = path.join(adrs, 'locked.md')
    fs.writeFileSync(locked, 'SECRET\n', 'utf8')
    fs.chmodSync(locked, 0o000) // statSync still works (parent perms), readFileSync → EACCES
    const r = lib.hashAdrs(adrs)
    assert.equal(r.readable, true)
    assert.deepEqual(r.files, ['locked.md', 'ok.md']) // both listed
    assert.equal(r.hash, sha('ok.md\nOK\n')) // only the readable one contributes
    fs.chmodSync(locked, 0o644) // restore so rmSync can clean up
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('hashAdrs: all .md files unreadable → readable false with aggregate error', skipIfRoot, () => {
  // Covers the parts.length === 0 branch (lines 82-90).
  const repo = mkTmp()
  try {
    const adrs = path.join(repo, 'adrs')
    fs.mkdirSync(adrs)
    const locked = path.join(adrs, 'locked.md')
    fs.writeFileSync(locked, 'SECRET\n', 'utf8')
    fs.chmodSync(locked, 0o000)
    const r = lib.hashAdrs(adrs)
    assert.equal(r.hash, null)
    assert.equal(r.exists, true)
    assert.equal(r.readable, false)
    assert.deepEqual(r.files, ['locked.md'])
    assert.match(r.error, /all ADR files unreadable/)
    fs.chmodSync(locked, 0o644)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── bareDigest ─────────────────────────────────────────────────────────────

test('bareDigest: strips prefix, passes through bare, maps nullish to null', () => {
  assert.equal(lib.bareDigest('sha256:abc'), 'abc')
  assert.equal(lib.bareDigest('abc'), 'abc')
  assert.equal(lib.bareDigest(null), null)
  assert.equal(lib.bareDigest(undefined), null)
})

// ─── normalizeManifestEntry ─────────────────────────────────────────────────

test('normalizeManifestEntry: non-object inputs → all-null shape (lines 110-112)', () => {
  const allNull = { spec_hash: null, prd_hash: null, qa_hash: null, adr_hash: null }
  assert.deepEqual(lib.normalizeManifestEntry(null), allNull)
  assert.deepEqual(lib.normalizeManifestEntry(undefined), allNull)
  assert.deepEqual(lib.normalizeManifestEntry('a-string'), allNull)
  assert.deepEqual(lib.normalizeManifestEntry(42), allNull)
})

test('normalizeManifestEntry: object fills missing fields with null', () => {
  assert.deepEqual(lib.normalizeManifestEntry({ spec_hash: 'x' }), {
    spec_hash: 'x',
    prd_hash: null,
    qa_hash: null,
    adr_hash: null,
  })
})

// ─── listFeatureSlugs ─────────────────────────────────────────────────────────

test('listFeatureSlugs: nonexistent docs path → [] (outer catch, lines 157-159)', () => {
  assert.deepEqual(lib.listFeatureSlugs(path.join(os.tmpdir(), 'no-such-dir-xyz-12345')), [])
})

test('listFeatureSlugs: returns only directories, skipping files and broken links', () => {
  // The broken symlink exercises the per-entry statSync catch (lines 152-154).
  const repo = mkTmp()
  try {
    const docs = path.join(repo, 'docs', 'superpowers')
    fs.mkdirSync(path.join(docs, 'feat-b'), { recursive: true })
    fs.mkdirSync(path.join(docs, 'feat-a'), { recursive: true })
    fs.writeFileSync(path.join(docs, 'loose-file.md'), 'x', 'utf8') // not a dir → filtered
    fs.symlinkSync(path.join(repo, 'nowhere'), path.join(docs, 'dangling')) // statSync throws → filtered
    assert.deepEqual(lib.listFeatureSlugs(docs), ['feat-a', 'feat-b']) // sorted, dirs only
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

// ─── hashFeatureArtifacts + content-map helpers (direct smoke) ────────────────

test('hashFeatureArtifacts + map helpers agree disk-vs-manifest', () => {
  const repo = mkTmp()
  try {
    const docs = path.join(repo, 'docs', 'superpowers')
    const specDir = path.join(docs, 'feat', 'specs')
    fs.mkdirSync(specDir, { recursive: true })
    const specContent = '# Design\n'
    fs.writeFileSync(path.join(specDir, 'feat-design.md'), specContent, 'utf8')

    const arts = lib.hashFeatureArtifacts(docs, 'feat')
    assert.equal(arts.spec.hash, sha(specContent))
    assert.equal(arts.prd.exists, false)
    assert.equal(arts.adrs.exists, false)

    const diskMap = lib.computeDiskMap(docs)
    assert.equal(lib.fingerprintOfMap({}), null) // empty map → null fingerprint
    assert.ok(lib.fingerprintOfMap(diskMap).startsWith('sha256:'))

    const manifest = {
      synced_features: {
        feat: { spec_hash: lib.bareDigest(arts.spec.hash), prd_hash: null, qa_hash: null, adr_hash: null },
      },
    }
    const manifestMap = lib.deriveManifestMap(manifest)
    assert.equal(lib.mapsEqual(diskMap, manifestMap), true)

    // A differing manifest must not be equal.
    assert.equal(lib.mapsEqual(diskMap, lib.deriveManifestMap({ synced_features: {} })), false)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})
