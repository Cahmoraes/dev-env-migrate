'use strict';

/**
 * Tests for verify-sync.cjs — manifest↔DB audit. Builds a real memory.db with
 * node:sqlite when available; otherwise the whole suite is skipped (the script
 * itself degrades gracefully on those runtimes, covered by the last test).
 *
 * Run with: node --test super.persistent-memory/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'verify-sync.cjs');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}
const SKIP = DatabaseSync ? false : 'node:sqlite unavailable in this runtime';

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sync-'));
  fs.mkdirSync(path.join(root, '.memory'), { recursive: true });
  return root;
}

function buildDb(root, notes) {
  const dbPath = path.join(root, '.memory', 'memory.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL, source TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE,
    hits INTEGER NOT NULL DEFAULT 0, last_seen_at TEXT
  )`);
  const stmt = db.prepare('INSERT INTO notes(created_at, source, tags, content, content_hash) VALUES (?,?,?,?,?)');
  notes.forEach((n, i) => stmt.run('2026-01-01T00:00:00Z', n.source, n.tags, n.content, `h${i}`));
  db.close();
  return dbPath;
}

function writeManifest(root, slugs) {
  const synced = {};
  for (const slug of slugs) synced[slug] = { spec_hash: 'sha256:x', prd_hash: null, qa_hash: null };
  fs.writeFileSync(
    path.join(root, '.memory', 'resync-manifest.json'),
    JSON.stringify({ last_synced_at: '2026-01-01T00:00:00Z', synced_features: synced }),
    'utf8',
  );
}

function run(root) {
  try {
    const out = execFileSync('node', [SCRIPT, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    return { code: err.status, json: JSON.parse(err.stdout) };
  }
}

test('manifest and DB agree → allPresent, exit 0', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    buildDb(root, [
      { source: 'artifact-sync', tags: 'artifact-sync,feat-a,spec', content: 'A spec' },
      { source: 'artifact-sync', tags: 'artifact-sync,feat-b,prd', content: 'B prd' },
      { source: 'assistant', tags: 'feat-a,architecture', content: 'unrelated' },
    ]);
    writeManifest(root, ['feat-a', 'feat-b']);
    const r = run(root);
    assert.equal(r.code, 0);
    assert.equal(r.json.allPresent, true);
    assert.deepEqual(r.json.missing, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest slug with no sync entries → drift detected, exit 2', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    buildDb(root, [{ source: 'artifact-sync', tags: 'artifact-sync,feat-a,spec', content: 'A spec' }]);
    writeManifest(root, ['feat-a', 'feat-b']); // feat-b never persisted
    const r = run(root);
    assert.equal(r.code, 2);
    assert.equal(r.json.allPresent, false);
    assert.deepEqual(r.json.missing, ['feat-b']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports sync-namespace slugs not in the manifest as extraSlugs', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    buildDb(root, [
      { source: 'artifact-sync', tags: 'artifact-sync,feat-a,spec', content: 'A' },
      { source: 'artifact-sync', tags: 'artifact-sync,ghost,spec', content: 'ghost' },
    ]);
    writeManifest(root, ['feat-a']);
    const r = run(root);
    assert.equal(r.code, 0);
    assert.ok(r.json.extraSlugs.includes('ghost'));
    assert.ok(!r.json.extraSlugs.includes('artifact-sync')); // the source label is not a slug
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing manifest → found:false, exit 0 (nothing to verify)', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    const r = run(root);
    assert.equal(r.code, 0);
    assert.equal(r.json.found, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing DB but present manifest → not verifiable / drift, never crashes', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    writeManifest(root, ['feat-a']);
    const r = run(root); // no DB file
    // With slugs present and no DB, they cannot be verified → treated as drift (exit 2).
    assert.equal(r.code, 2);
    assert.equal(r.json.verifiable, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
