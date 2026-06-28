'use strict';

/**
 * Tests for init-feature-dir.cjs.
 *
 * Run with: node --test super.deep-research/scripts/__tests__/
 *
 * Covers:
 *  - creates docs/superpowers/<slug>/research/ → created=true, alreadyExisted=false
 *  - second run is idempotent → created=false, alreadyExisted=true
 *  - invalid slugs are rejected with a non-zero exit code
 *  - the stdout JSON shape is stable
 *
 * Uses a fresh tmp directory per test (os.tmpdir + mkdtempSync), cleaned up in
 * finally. It passes --repo-root explicitly so it never touches the real repo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'init-feature-dir.cjs');

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'init-feature-dir-'));
}

/** Run the script, returning { json, status }. status === 0 on success. */
function run(root, slug) {
  const args = [SCRIPT, '--slug', slug, '--repo-root', root];
  try {
    const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { json: JSON.parse(out), status: 0 };
  } catch (error) {
    // execFileSync throws on non-zero exit; capture status + stdout JSON.
    let json = null;
    try {
      json = JSON.parse(error.stdout || '{}');
    } catch {
      json = null;
    }
    return { json, status: error.status };
  }
}

test('creates the research directory and reports created=true, alreadyExisted=false', () => {
  const root = mkRoot();
  try {
    const { json, status } = run(root, 'realtime-sync-strategy');
    assert.equal(status, 0);
    assert.equal(json.slug, 'realtime-sync-strategy');
    assert.equal(json.created, true);
    assert.equal(json.alreadyExisted, false);
    assert.equal(json.repoRoot, root);
    const expected = path.join(root, 'docs', 'superpowers', 'realtime-sync-strategy', 'research');
    assert.equal(json.path, expected);
    assert.ok(fs.existsSync(expected), 'research directory must exist on disk');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('second run is idempotent: created=false, alreadyExisted=true', () => {
  const root = mkRoot();
  try {
    const first = run(root, 'state-management-comparison');
    assert.equal(first.status, 0);
    assert.equal(first.json.created, true);

    const second = run(root, 'state-management-comparison');
    assert.equal(second.status, 0);
    assert.equal(second.json.created, false);
    assert.equal(second.json.alreadyExisted, true);
    assert.equal(second.json.path, first.json.path);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('output JSON shape has exactly the documented keys', () => {
  const root = mkRoot();
  try {
    const { json } = run(root, 'cache-eviction-policy');
    assert.deepEqual(
      Object.keys(json).sort(),
      ['alreadyExisted', 'created', 'path', 'repoRoot', 'slug'],
    );
    assert.equal(typeof json.slug, 'string');
    assert.equal(typeof json.path, 'string');
    assert.equal(typeof json.created, 'boolean');
    assert.equal(typeof json.alreadyExisted, 'boolean');
    assert.equal(typeof json.repoRoot, 'string');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects invalid slugs with a non-zero exit code', () => {
  const root = mkRoot();
  try {
    for (const bad of ['Foo_Bar', 'foo--', 'Foo Bar', '-leading', 'trailing-', 'UPPER', 'has.dot']) {
      const { status } = run(root, bad);
      assert.notEqual(status, 0, `slug "${bad}" must be rejected`);
      // No directory should have been created for a rejected slug.
      const leaked = path.join(root, 'docs', 'superpowers', bad, 'research');
      assert.ok(!fs.existsSync(leaked), `slug "${bad}" must not create a directory`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts representative valid slugs', () => {
  const root = mkRoot();
  try {
    for (const ok of ['a', 'feature', 'multi-word-slug', 'v2-migration', 'oauth2-flow']) {
      const { json, status } = run(root, ok);
      assert.equal(status, 0, `slug "${ok}" must be accepted`);
      assert.equal(json.slug, ok);
      assert.ok(fs.existsSync(json.path));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
