'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  slugsFromTags,
  queryPresentSlugs,
  driftedSlugs,
} = require('../lib/db-presence.cjs');

// ─── slugsFromTags: current + legacy conventions ───────────────────────────────

test('slugsFromTags: current convention <source>,<slug>,<type> → the slug only', () => {
  assert.deepStrictEqual(
    slugsFromTags('artifact-sync,landing-hero-copy,spec', 'artifact-sync'),
    ['landing-hero-copy'],
  );
});

test('slugsFromTags: legacy convention feature:<slug>,type:<type> → the slug only', () => {
  assert.deepStrictEqual(
    slugsFromTags('feature:table-page-size-picker,type:spec', 'artifact-sync'),
    ['table-page-size-picker'],
  );
});

test('slugsFromTags: legacy note with two type: tags still yields one slug', () => {
  assert.deepStrictEqual(
    slugsFromTags('feature:nav-drawer-pin,type:spec,type:prd', 'artifact-sync'),
    ['nav-drawer-pin'],
  );
});

test('slugsFromTags: source label and artifact-type tokens are never slugs', () => {
  // Only the genuine slug survives; source + spec/prd/qa/adr are filtered.
  assert.deepStrictEqual(
    slugsFromTags('artifact-sync,my-feature,prd,qa,adr', 'artifact-sync'),
    ['my-feature'],
  );
});

test('slugsFromTags: empty / whitespace tags yield no slugs', () => {
  assert.deepStrictEqual(slugsFromTags('', 'artifact-sync'), []);
  assert.deepStrictEqual(slugsFromTags('  ,  ,', 'artifact-sync'), []);
});

// ─── queryPresentSlugs: graceful degradation ───────────────────────────────────

test('queryPresentSlugs: missing DB → available:false, empty set (no signal)', () => {
  const res = queryPresentSlugs({ dbPath: '/nonexistent/memory.db' });
  assert.strictEqual(res.available, false);
  assert.match(res.reason, /not found/);
  assert.strictEqual(res.presentSlugs.size, 0);
});

test('queryPresentSlugs: undefined dbPath → available:false', () => {
  const res = queryPresentSlugs({});
  assert.strictEqual(res.available, false);
});

// ─── queryPresentSlugs against a real DB (skips if node:sqlite absent) ──────────

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch { /* older runtime — real-DB tests skipped */ }

function makeDb(dir, rows) {
  const dbPath = path.join(dir, 'memory.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT ''
  );`);
  const stmt = db.prepare('INSERT INTO notes (source, tags, content_hash) VALUES (?, ?, ?)');
  let i = 0;
  for (const r of rows) stmt.run(r.source, r.tags, `h${i++}`);
  db.close();
  return dbPath;
}

test('queryPresentSlugs: current + legacy tagged notes are both recognized', { skip: !DatabaseSync }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpres-'));
  const dbPath = makeDb(dir, [
    { source: 'artifact-sync', tags: 'artifact-sync,landing-hero-copy,spec' },
    { source: 'artifact-sync', tags: 'feature:table-page-size-picker,type:spec' },
    { source: 'assistant', tags: 'something-else' }, // different source → ignored
  ]);

  const res = queryPresentSlugs({ dbPath, source: 'artifact-sync' });
  assert.strictEqual(res.available, true);
  assert.ok(res.presentSlugs.has('landing-hero-copy'));
  assert.ok(res.presentSlugs.has('table-page-size-picker'), 'legacy-tagged slug must be present');
  assert.ok(!res.presentSlugs.has('something-else'), 'other sources are excluded');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── driftedSlugs ──────────────────────────────────────────────────────────────

test('driftedSlugs: returns manifest slugs absent from the DB', () => {
  const presence = { available: true, presentSlugs: new Set(['a', 'b']) };
  assert.deepStrictEqual(driftedSlugs(['a', 'b', 'c'], presence), ['c']);
});

test('driftedSlugs: comparison is case-insensitive', () => {
  const presence = { available: true, presentSlugs: new Set(['landing-hero-copy']) };
  assert.deepStrictEqual(driftedSlugs(['Landing-Hero-Copy'], presence), []);
});

test('driftedSlugs: unavailable presence → null (unknown, never [])', () => {
  assert.strictEqual(driftedSlugs(['a'], { available: false, presentSlugs: new Set() }), null);
  assert.strictEqual(driftedSlugs(['a'], null), null);
});
