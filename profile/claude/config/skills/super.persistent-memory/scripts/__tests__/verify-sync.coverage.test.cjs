'use strict';

/**
 * Coverage top-up for verify-sync.cjs. Targets the branches the original suite
 * leaves uncovered:
 *   - usage() (60-63) + parseArgs unknown arg (78) and missing-value (74-77)
 *   - parseArgs --help (68-70)
 *   - parseArgs --manifest / --db / --source option branches (75-77)
 *   - detectGitRoot success (84-87) and failure catch (88-90)
 *   - repo-root-not-found emit (106-107)
 *   - manifest unparseable emit (119-120)
 *   - node:sqlite unavailable emit (128-129) — forced via --no-experimental-sqlite
 *   - db read failed emit (143-144)
 *
 * Same house style as verify-sync.test.cjs. A real memory.db is built with
 * node:sqlite when available; the sqlite-dependent cases are skipped otherwise
 * (and one case deliberately disables sqlite to cover the degraded branch).
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sync-cov-'));
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
  const p = path.join(root, '.memory', 'resync-manifest.json');
  fs.writeFileSync(p, JSON.stringify({ last_synced_at: '2026-01-01T00:00:00Z', synced_features: synced }), 'utf8');
  return p;
}

/** Run the CLI. `nodeFlags` lets us inject e.g. --no-experimental-sqlite. */
function run(args, { cwd, nodeFlags = [] } = {}) {
  try {
    const out = execFileSync('node', [...nodeFlags, SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd });
    return { code: 0, stdout: out, stderr: '', json: out ? safeJson(out) : null };
  } catch (err) {
    return { code: err.status, stdout: `${err.stdout || ''}`, stderr: `${err.stderr || ''}`, json: err.stdout ? safeJson(err.stdout) : null };
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// --- parseArgs / usage --------------------------------------------------------

test('--help prints usage and exits 0 (lines 68-70)', () => {
  const r = run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /verify-sync\.cjs/);
  assert.match(r.stdout, /Usage:/);
});

test('unknown argument → usage error, exit 1 (lines 60-63, 78)', () => {
  const r = run(['--bogus']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown argument/);
});

test('option flag without a value → usage error, exit 1 (74-77 || usage path)', () => {
  const r = run(['--db']); // no value follows → args[++i] undefined → usage()
  assert.equal(r.code, 1);
  assert.match(r.stderr, /needs a value/);
});

// --- detectGitRoot + happy path through every option branch -------------------

test('all option branches (--manifest/--db/--source) + detectGitRoot success (75-77, 84-87)', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    const manifest = writeManifest(root, ['feat-a']);
    const db = buildDb(root, [{ source: 'custom-src', tags: 'custom-src,feat-a,spec', content: 'A' }]);
    // No --repo-root → detectGitRoot runs (cwd is inside this project's git repo);
    // explicit --manifest/--db/--source exercise those parseArgs branches.
    const r = run(['--manifest', manifest, '--db', db, '--source', 'custom-src']);
    assert.equal(r.code, 0);
    assert.equal(r.json.found, true);
    assert.equal(r.json.verifiable, true);
    assert.equal(r.json.source, 'custom-src');
    assert.equal(r.json.allPresent, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('artifact-type tags (spec/prd/qa/adrs) are not reported as extra slugs', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    const manifest = writeManifest(root, ['feat-a']);
    // feat-a is in the manifest; its entries carry the artifact-type tags. A
    // genuinely-orphan feature slug must still surface as extra.
    const db = buildDb(root, [
      { source: 'artifact-sync', tags: 'artifact-sync,feat-a,spec', content: 'A spec' },
      { source: 'artifact-sync', tags: 'artifact-sync,feat-a,prd', content: 'A prd' },
      { source: 'artifact-sync', tags: 'artifact-sync,feat-orphan,qa', content: 'orphan' },
    ]);
    const r = run(['--manifest', manifest, '--db', db, '--source', 'artifact-sync']);
    assert.equal(r.code, 0);
    for (const t of ['spec', 'prd', 'qa', 'adr', 'adrs']) {
      assert.ok(!r.json.extraSlugs.includes(t), `${t} is an artifact type, not a feature slug`);
    }
    assert.ok(r.json.extraSlugs.includes('feat-orphan'), 'a real orphan slug is still reported');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no --repo-root in a non-git dir, no manifest/db → repo root not found (88-90, 106-107)', () => {
  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sync-nogit-'));
  try {
    // cwd is a fresh tmp dir outside any git repo → detectGitRoot catch → null.
    const r = run([], { cwd: nonGit });
    assert.equal(r.code, 0);
    assert.equal(r.json.found, false);
    assert.equal(r.json.verifiable, false);
    assert.match(r.json.reason, /repo root not found/);
  } finally {
    fs.rmSync(nonGit, { recursive: true, force: true });
  }
});

// --- manifest / db failure paths ---------------------------------------------

test('unparseable manifest → verifiable:false, exit 0 (lines 119-120)', () => {
  const root = mkRepo();
  try {
    fs.writeFileSync(path.join(root, '.memory', 'resync-manifest.json'), '{ broken json', 'utf8');
    const r = run(['--repo-root', root]);
    assert.equal(r.code, 0);
    assert.equal(r.json.found, true);
    assert.equal(r.json.verifiable, false);
    assert.match(r.json.reason, /manifest unparseable/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('node:sqlite unavailable → degrades gracefully, exit 0 (lines 128-129)', () => {
  const root = mkRepo();
  try {
    writeManifest(root, ['feat-a']);
    // Force the require('node:sqlite') to throw by disabling the built-in module.
    const r = run(['--repo-root', root], { nodeFlags: ['--no-experimental-sqlite'] });
    assert.equal(r.code, 0);
    assert.equal(r.json.found, true);
    assert.equal(r.json.verifiable, false);
    assert.match(r.json.reason, /node:sqlite unavailable/);
    assert.equal(r.json.allPresent, true);
    assert.deepEqual(r.json.features, [{ slug: 'feat-a', entries: null, ok: null }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('db present but unreadable (not a sqlite file) → db read failed, exit 0 (lines 143-144)', { skip: SKIP }, () => {
  const root = mkRepo();
  try {
    writeManifest(root, ['feat-a']);
    // A non-sqlite file at the db path: opening/querying it throws → caught.
    fs.writeFileSync(path.join(root, '.memory', 'memory.db'), 'this is not a sqlite database', 'utf8');
    const r = run(['--repo-root', root]);
    assert.equal(r.code, 0);
    assert.equal(r.json.found, true);
    assert.equal(r.json.verifiable, false);
    assert.match(r.json.reason, /db read failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
