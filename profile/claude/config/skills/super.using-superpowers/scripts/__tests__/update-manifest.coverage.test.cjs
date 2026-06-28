'use strict';

/**
 * Line/function coverage for update-manifest.cjs.
 *
 * The script has no module export — it runs top-to-bottom at load — so every
 * branch is driven as a subprocess (Node 24 captures subprocess coverage),
 * feeding input via --input-file or stdin and shaping the on-disk state to hit
 * the help/git-detection/read-error/merge/canonicalization/write-error legs.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/update-manifest.coverage.test.cjs
 *
 * Deliberately uncovered (defensive, not hacked around):
 *   - Lines 118-120: the readStdin() catch. fs.readFileSync('/dev/stdin') only
 *     throws when /dev/stdin is absent (non-Linux / chrooted environments). On a
 *     normal Linux test host it always resolves to fd 0, so the fallback is
 *     unreachable here. Forcing it would mean faking the platform, not testing it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'update-manifest.cjs');

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-manifest-cov-'));
  fs.mkdirSync(path.join(root, '.memory'), { recursive: true });
  return root;
}

function manifestPath(root) {
  return path.join(root, '.memory', 'resync-manifest.json');
}

function writeManifest(root, obj) {
  fs.writeFileSync(manifestPath(root), JSON.stringify(obj), 'utf8');
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(manifestPath(root), 'utf8'));
}

// spawnSync so failing branches (exit 1) can be asserted on status + stderr.
function run(args, opts = {}) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}

// The script reads stdin via fs.readFileSync('/dev/stdin'), which only sees a
// real fd-0 (spawnSync's `input` option does not feed /dev/stdin). So back stdin
// with an actual file descriptor.
function runStdin(args, stdinContent, opts = {}) {
  const tmp = path.join(os.tmpdir(), `stdin-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, stdinContent, 'utf8');
  const fd = fs.openSync(tmp, 'r');
  try {
    return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: [fd, 'pipe', 'pipe'], ...opts });
  } finally {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
  }
}

// ─── help / arg handling ───────────────────────────────────────────────────────

test('--help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /update-manifest\.cjs/);
});

// ─── input acquisition: stdin success, errors ──────────────────────────────────

test('reads payload from stdin (no --input-file) and writes the manifest', () => {
  const root = mkRepo();
  try {
    const payload = JSON.stringify({
      treeHash: 'tree-1',
      hashMethod: 'git',
      syncedFeatures: { feat: { spec_hash: 'sha256:abc', prd_hash: null, qa_hash: null, adr_hash: null } },
      deletedSlugs: [],
    });
    const r = runStdin(['--repo-root', root], payload);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.written, true);
    assert.equal(readManifest(root).synced_features.feat.spec_hash, 'sha256:abc');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty stdin → usage error, exit 1', () => {
  const root = mkRepo();
  try {
    const r = runStdin(['--repo-root', root], '');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no input provided/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid JSON input → exit 1', () => {
  const root = mkRepo();
  try {
    const r = runStdin(['--repo-root', root], 'not json at all');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /invalid JSON input/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('JSON that is not an object → exit 1', () => {
  const root = mkRepo();
  try {
    const r = runStdin(['--repo-root', root], '123');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must be a JSON object/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--input-file pointing at a missing file → exit 1', () => {
  const root = mkRepo();
  try {
    const r = run(['--repo-root', root, '--input-file', path.join(root, 'nope.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read --input-file/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── git-root detection ────────────────────────────────────────────────────────

test('no --repo-root, non-git cwd → warns and falls back to cwd', () => {
  const root = mkRepo(); // not a git repo
  try {
    const r = runStdin(
      [],
      JSON.stringify({ treeHash: null, hashMethod: 'none', syncedFeatures: {}, deletedSlugs: [] }),
      { cwd: root },
    );
    assert.equal(r.status, 0);
    assert.match(r.stderr, /no git root found/);
    assert.ok(fs.existsSync(manifestPath(root)), 'manifest written under cwd fallback');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no --repo-root, git cwd → detects the repo root', () => {
  const root = mkRepo();
  try {
    execFileSync('git', ['init', '-q', root]);
    const r = runStdin(
      [],
      JSON.stringify({ treeHash: 't', hashMethod: 'git', syncedFeatures: {}, deletedSlugs: [] }),
      { cwd: root },
    );
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(manifestPath(root)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── existing manifest, merge, canonicalization ────────────────────────────────

test('merges existing entries, canonicalizes mixed/non-object hashes, applies deletes', () => {
  const root = mkRepo();
  try {
    writeManifest(root, {
      last_synced_at: 'x',
      last_synced_tree_hash: 'old',
      last_synced_hash_method: 'git',
      synced_features: {
        legacy: { spec_hash: 'beef', prd_hash: null, qa_hash: null }, // bare → prefixed
        prefixed: { spec_hash: 'sha256:cafe' }, // already canonical
        weird: 'not-an-object', // canonicalizeEntry falls back to {}
        doomed: { spec_hash: 'sha256:dead' }, // removed via deletedSlugs
      },
    });
    const input = {
      treeHash: 'new-tree',
      hashMethod: 'git',
      syncedFeatures: { fresh: { spec_hash: 'sha256:abc', prd_hash: 'def', qa_hash: null, adr_hash: null } },
      deletedSlugs: ['doomed'],
    };
    const inputFile = path.join(root, 'in.json');
    fs.writeFileSync(inputFile, JSON.stringify(input), 'utf8');
    const r = run(['--repo-root', root, '--input-file', inputFile]);
    assert.equal(r.status, 0);

    const m = readManifest(root);
    assert.equal(m.last_synced_tree_hash, 'new-tree');
    assert.ok(m.synced_features.legacy.spec_hash.startsWith('sha256:'));
    assert.equal(m.synced_features.prefixed.spec_hash, 'sha256:cafe');
    assert.deepEqual(m.synced_features.weird, { spec_hash: null, prd_hash: null, qa_hash: null, adr_hash: null });
    assert.equal(m.synced_features.fresh.spec_hash, 'sha256:abc');
    assert.equal(m.synced_features.fresh.prd_hash, 'sha256:def'); // bare → prefixed
    assert.equal(m.synced_features.doomed, undefined); // deleted
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unparseable existing manifest → warns and starts fresh', () => {
  const root = mkRepo();
  try {
    fs.writeFileSync(manifestPath(root), '{ this is : not json', 'utf8');
    const inputFile = path.join(root, 'in.json');
    fs.writeFileSync(
      inputFile,
      JSON.stringify({ treeHash: 't', hashMethod: 'git', syncedFeatures: {}, deletedSlugs: [] }),
      'utf8',
    );
    const r = run(['--repo-root', root, '--input-file', inputFile]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /could not parse existing manifest/);
    assert.deepEqual(readManifest(root).synced_features, {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── write-side failures ───────────────────────────────────────────────────────

test('.memory occupied by a file → mkdir fails, exit 1', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-manifest-cov-'));
  try {
    fs.writeFileSync(path.join(root, '.memory'), 'I am a file, not a dir', 'utf8');
    const inputFile = path.join(root, 'in.json');
    fs.writeFileSync(
      inputFile,
      JSON.stringify({ treeHash: 't', hashMethod: 'git', syncedFeatures: {}, deletedSlugs: [] }),
      'utf8',
    );
    const r = run(['--repo-root', root, '--input-file', inputFile]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not create .memory\/ directory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest path occupied by a non-empty directory → rename fails, exit 1', () => {
  const root = mkRepo();
  try {
    // Make resync-manifest.json a NON-EMPTY directory: existsSync→true, readFileSync
    // throws (covers the parse warning), mkdir(.memory) is a no-op, the temp file
    // writes, and renameSync(tmp → dir) fails (covers the write/cleanup catch).
    const asDir = manifestPath(root);
    fs.mkdirSync(asDir, { recursive: true });
    fs.writeFileSync(path.join(asDir, 'blocker'), 'x', 'utf8');
    const inputFile = path.join(root, 'in.json');
    fs.writeFileSync(
      inputFile,
      JSON.stringify({ treeHash: 't', hashMethod: 'git', syncedFeatures: {}, deletedSlugs: [] }),
      'utf8',
    );
    const r = run(['--repo-root', root, '--input-file', inputFile]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not (parse existing manifest|write manifest)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
