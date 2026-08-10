'use strict'

/**
 * The independent-verification report (`qa/validation-<slug>.md`) is part of the
 * canonical artifact set.
 *
 * Why this file exists — the defect it locks out. The inventory used to know four
 * artifacts, and its QA slot pointed at `qa/qa-report-<slug>.md`, which
 * super.user-story-verification only writes when a PRD exists. The IV report, written
 * by the always-on gate and required to PASS before any merge, was invisible. A
 * feature planned, built, verified and merged without a PRD therefore synced to memory
 * as a spec and nothing else — textually indistinguishable from one abandoned right
 * after brainstorming. A later session asked which features had shipped, found no
 * verification note for the slug, and reported a delivered feature as "still in
 * planning". Measured on a real repo: 5 of 56 features carried an IV report and no QA
 * report, and every one of them was mislabelled.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/iv-report-inventory.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const lib = require('../lib/artifact-hash.cjs')
const COMPUTE = path.resolve(__dirname, '..', 'compute-inventory.cjs')
const CHECK = path.resolve(__dirname, '..', 'check-resync.cjs')
const UPDATE = path.resolve(__dirname, '..', 'update-manifest.cjs')
const RESYNC_DOC = path.resolve(__dirname, '..', '..', 'references', 'memory-resync.md')

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-inventory-'))
  fs.mkdirSync(path.join(root, '.memory'), { recursive: true })
  return root
}

function docsPath(root) {
  return path.join(root, 'docs', 'superpowers')
}

function writeArtifact(root, slug, rel, content) {
  const full = path.join(docsPath(root), slug, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  return full
}

function writeManifest(root, syncedFeatures) {
  fs.writeFileSync(
    path.join(root, '.memory', 'resync-manifest.json'),
    JSON.stringify({
      last_synced_at: '2026-01-01T00:00:00Z',
      last_synced_tree_hash: 'sha256:whatever',
      last_synced_hash_method: 'artifact-content',
      synced_features: syncedFeatures,
    }),
    'utf8',
  )
}

function inventory(root, extra = []) {
  const out = execFileSync('node', [COMPUTE, '--repo-root', root, ...extra], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return JSON.parse(out)
}

function featureBySlug(result, slug) {
  return result.features.find((f) => f.slug === slug)
}

// ─── The path itself ──────────────────────────────────────────────────────────

test('hashFeatureArtifacts exposes iv at qa/validation-<slug>.md, distinct from qa', () => {
  const root = mkRepo()
  try {
    const a = lib.hashFeatureArtifacts(docsPath(root), 'my-feature')
    assert.equal(a.iv.path, path.join(docsPath(root), 'my-feature', 'qa', 'validation-my-feature.md'))
    assert.equal(a.qa.path, path.join(docsPath(root), 'my-feature', 'qa', 'qa-report-my-feature.md'))
    assert.notEqual(a.iv.path, a.qa.path)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a QA report does not satisfy the iv slot, and an IV report does not satisfy the qa slot', () => {
  const root = mkRepo()
  try {
    writeArtifact(root, 'my-feature', 'specs/my-feature-design.md', '# spec')
    writeArtifact(root, 'my-feature', 'qa/qa-report-my-feature.md', '# qa report')
    const a = lib.hashFeatureArtifacts(docsPath(root), 'my-feature')
    assert.equal(a.qa.exists, true)
    assert.equal(a.iv.exists, false)

    writeArtifact(root, 'other-feature', 'qa/validation-other-feature.md', '# iv report')
    const b = lib.hashFeatureArtifacts(docsPath(root), 'other-feature')
    assert.equal(b.iv.exists, true)
    assert.equal(b.qa.exists, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ─── The reported shape ───────────────────────────────────────────────────────

test('the PRD-less delivered feature: inventory reports its IV report as present', () => {
  const root = mkRepo()
  try {
    writeArtifact(root, 'broker-fanout', 'specs/broker-fanout-design.md', '# spec')
    writeArtifact(root, 'broker-fanout', 'qa/validation-broker-fanout.md', '# IV\n\n**PASS**')

    const f = featureBySlug(inventory(root), 'broker-fanout')
    assert.equal(f.artifacts.iv.exists, true)
    assert.match(f.artifacts.iv.hash, /^sha256:/)
    // The three artifacts a PRD-less feature legitimately lacks stay absent — the point
    // is that "no PRD" must no longer imply "no record that the work was verified".
    assert.equal(f.artifacts.prd.exists, false)
    assert.equal(f.artifacts.qa.exists, false)
    assert.equal(f.artifacts.adrs.exists, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a deleted feature still reports the iv slot, so consumers never read undefined', () => {
  const root = mkRepo()
  try {
    fs.mkdirSync(docsPath(root), { recursive: true })
    writeManifest(root, { gone: { spec_hash: 'sha256:a', prd_hash: null, qa_hash: null, iv_hash: 'sha256:b', adr_hash: null } })

    const f = featureBySlug(inventory(root), 'gone')
    assert.equal(f.status, 'deleted')
    assert.equal(f.artifacts.iv.exists, false)
    assert.equal(f.artifacts.iv.path, path.join(docsPath(root), 'gone', 'qa', 'validation-gone.md'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ─── Classification ───────────────────────────────────────────────────────────

test('a legacy manifest entry with no iv_hash reclassifies a feature carrying an IV report as changed', () => {
  const root = mkRepo()
  try {
    const specPath = writeArtifact(root, 'broker-fanout', 'specs/broker-fanout-design.md', '# spec')
    writeArtifact(root, 'broker-fanout', 'qa/validation-broker-fanout.md', '# IV\n\n**PASS**')
    const specHash = lib.hashFile(specPath).hash

    // Exactly what a manifest written before the IV report was inventoried looks like:
    // the spec matches, iv_hash is simply absent.
    writeManifest(root, { 'broker-fanout': { spec_hash: specHash, prd_hash: null, qa_hash: null, adr_hash: null } })

    assert.equal(featureBySlug(inventory(root), 'broker-fanout').status, 'changed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('once iv_hash is recorded the feature settles to unchanged — the re-sync is one-time, not a loop', () => {
  const root = mkRepo()
  try {
    const specPath = writeArtifact(root, 'broker-fanout', 'specs/broker-fanout-design.md', '# spec')
    const ivPath = writeArtifact(root, 'broker-fanout', 'qa/validation-broker-fanout.md', '# IV\n\n**PASS**')
    writeManifest(root, {
      'broker-fanout': {
        spec_hash: lib.hashFile(specPath).hash,
        prd_hash: null,
        qa_hash: null,
        iv_hash: lib.hashFile(ivPath).hash,
        adr_hash: null,
      },
    })

    assert.equal(featureBySlug(inventory(root), 'broker-fanout').status, 'unchanged')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a feature with no IV report on disk and none in the manifest is not dragged into changed', () => {
  const root = mkRepo()
  try {
    const specPath = writeArtifact(root, 'spec-only', 'specs/spec-only-design.md', '# spec')
    writeManifest(root, { 'spec-only': { spec_hash: lib.hashFile(specPath).hash, prd_hash: null, qa_hash: null, adr_hash: null } })

    assert.equal(featureBySlug(inventory(root), 'spec-only').status, 'unchanged')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('editing only the IV report makes the feature changed (its content is tracked, not just its presence)', () => {
  const root = mkRepo()
  try {
    const specPath = writeArtifact(root, 'broker-fanout', 'specs/broker-fanout-design.md', '# spec')
    const ivPath = writeArtifact(root, 'broker-fanout', 'qa/validation-broker-fanout.md', '# IV\n\n**FAIL**')
    writeManifest(root, {
      'broker-fanout': {
        spec_hash: lib.hashFile(specPath).hash,
        prd_hash: null,
        qa_hash: null,
        iv_hash: lib.hashFile(ivPath).hash,
        adr_hash: null,
      },
    })
    assert.equal(featureBySlug(inventory(root), 'broker-fanout').status, 'unchanged')

    fs.writeFileSync(ivPath, '# IV\n\n**PASS**', 'utf8')
    assert.equal(featureBySlug(inventory(root), 'broker-fanout').status, 'changed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ─── The other consumer of the shared hashing lib ─────────────────────────────

test('check-resync goes dirty on an IV-report-only change, agreeing with compute-inventory', () => {
  const root = mkRepo()
  try {
    const specPath = writeArtifact(root, 'broker-fanout', 'specs/broker-fanout-design.md', '# spec')
    const ivPath = writeArtifact(root, 'broker-fanout', 'qa/validation-broker-fanout.md', '# IV\n\n**FAIL**')
    writeManifest(root, {
      'broker-fanout': {
        spec_hash: lib.hashFile(specPath).hash,
        prd_hash: null,
        qa_hash: null,
        iv_hash: lib.hashFile(ivPath).hash,
        adr_hash: null,
      },
    })

    const clean = JSON.parse(execFileSync('node', [CHECK, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    assert.equal(clean.dirty, false)

    fs.writeFileSync(ivPath, '# IV\n\n**PASS**', 'utf8')
    const dirty = JSON.parse(execFileSync('node', [CHECK, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    assert.equal(dirty.dirty, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ─── Round-trip through the manifest writer ───────────────────────────────────

test('update-manifest persists iv_hash, so the next gate can settle the feature', () => {
  const root = mkRepo()
  try {
    const payload = JSON.stringify({
      treeHash: 'sha256:tree',
      hashMethod: 'artifact-content',
      syncedFeatures: {
        'broker-fanout': { spec_hash: 'sha256:aaa', prd_hash: null, qa_hash: null, iv_hash: 'sha256:bbb', adr_hash: null },
      },
      deletedSlugs: [],
    })
    const tmp = path.join(root, 'payload.json')
    fs.writeFileSync(tmp, payload, 'utf8')
    const r = spawnSync('node', [UPDATE, '--repo-root', root, '--input-file', tmp], { encoding: 'utf8' })
    assert.equal(r.status, 0)

    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.memory', 'resync-manifest.json'), 'utf8'))
    assert.equal(manifest.synced_features['broker-fanout'].iv_hash, 'sha256:bbb')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('update-manifest canonicalizes a bare iv_hash digest like every other hash field', () => {
  const root = mkRepo()
  try {
    const tmp = path.join(root, 'payload.json')
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        treeHash: 'sha256:tree',
        hashMethod: 'artifact-content',
        syncedFeatures: { 'broker-fanout': { spec_hash: 'aaa', iv_hash: 'bbb' } },
        deletedSlugs: [],
      }),
      'utf8',
    )
    const r = spawnSync('node', [UPDATE, '--repo-root', root, '--input-file', tmp], { encoding: 'utf8' })
    assert.equal(r.status, 0)

    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.memory', 'resync-manifest.json'), 'utf8'))
    assert.equal(manifest.synced_features['broker-fanout'].iv_hash, 'sha256:bbb')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ─── Textual contract: the prose the sync-worker actually runs on ─────────────

test('memory-resync.md hands the sync-worker the iv path and a synthesis rule for it', () => {
  const doc = fs.readFileSync(RESYNC_DOC, 'utf8')

  // The dispatch prompt must name the path, or the worker never reads the report
  // no matter what the inventory found.
  assert.match(doc, /iv `<iv\.path>`/)
  // And a synthesis rule, or the worker has nothing to turn the report into.
  assert.match(doc, /\*\*From an independent-verification report \(`validation-\*\.md`\)/)
  assert.match(doc, /Verification: <PASS\|PASS \(degraded\)\|FAIL>/)
  // The manifest example must show the field the writer now persists.
  assert.match(doc, /"iv_hash"/)
})
