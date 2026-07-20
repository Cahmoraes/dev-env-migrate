#!/usr/bin/env node
/**
 * verify-sync.cjs — Audit that the re-sync manifest and the memory database agree.
 *
 * Closes the loop on the artifact-sync flow: after update-manifest.cjs records a
 * feature as synced, this script confirms the database actually holds at least one
 * entry for that feature in the sync namespace. A manifest slug with zero matching
 * entries means the sync drifted (e.g. a pmem add silently failed) — the next
 * session would wrongly treat that feature as already synced.
 *
 * Read-only: it opens the SQLite DB read-only via node:sqlite. When node:sqlite is
 * unavailable (older Node) or the DB is missing, it degrades gracefully —
 * verifiable:false, exit 0 — so it never blocks a flow it cannot audit.
 *
 * Tag conventions: sync notes are tagged `<source>,<slug>,<type>` today, but legacy
 * notes used `feature:<slug>,type:<type>`. Both are recognized (see slugsFromTags),
 * so an old-format note is never mis-reported as a missing sync.
 *
 * Usage:
 *   node scripts/verify-sync.cjs [--repo-root <path>] [--manifest <path>]
 *        [--db <path>] [--source <label>]
 *
 * Defaults: repo-root = git root; manifest = <root>/.memory/resync-manifest.json;
 *           db = <root>/.memory/memory.db; source = "artifact-sync".
 *
 * Exit codes:
 *   0  manifest and DB agree, or nothing to verify, or not verifiable (graceful)
 *   2  drift detected — at least one manifest slug has no entries in the DB
 *   1  usage error
 *
 * Output (stdout): JSON
 *   {
 *     "found": boolean,            // manifest exists
 *     "verifiable": boolean,       // DB could be opened and queried
 *     "reason": string|null,       // why not verifiable, when applicable
 *     "source": string,
 *     "features": [{ slug, entries, ok }],
 *     "missing": string[],         // manifest slugs with zero DB entries (drift)
 *     "extraSlugs": string[],      // sync-namespace slugs not in the manifest
 *     "allPresent": boolean
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HELP = `
verify-sync.cjs — Audit that the re-sync manifest and memory DB agree.

Usage:
  node scripts/verify-sync.cjs [--repo-root <path>] [--manifest <path>] [--db <path>] [--source <label>]

Options:
  --repo-root <path>  Repository root (default: git root of cwd)
  --manifest <path>   Manifest path (default: <root>/.memory/resync-manifest.json)
  --db <path>         Memory DB path (default: <root>/.memory/memory.db)
  --source <label>    Sync source label to audit (default: artifact-sync)
  --help              Show this help and exit 0
`.trimStart();

function usage(message) {
  process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const options = { repoRoot: null, manifest: null, db: null, source: 'artifact-sync' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--repo-root') { options.repoRoot = path.resolve(args[++i] || usage('--repo-root needs a value')); continue; }
    if (arg === '--manifest') { options.manifest = path.resolve(args[++i] || usage('--manifest needs a value')); continue; }
    if (arg === '--db') { options.db = path.resolve(args[++i] || usage('--db needs a value')); continue; }
    if (arg === '--source') { options.source = args[++i] || usage('--source needs a value'); continue; }
    usage(`Unknown argument: ${arg}`);
  }
  return options;
}

// Git working-tree root, resolved in-process (no `git` spawn): walk up looking for
// a `.git` entry (a dir in a clone, a FILE in a linked worktree — both match). Same
// discovery `git rev-parse --show-toplevel` does; null when not in a repo.
function detectGitRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Artifact-type tokens are never feature slugs.
const ARTIFACT_TYPE_TAGS = new Set(['spec', 'prd', 'qa', 'adr', 'adrs']);

// Extract the feature slugs a note's tag string refers to, tolerant of both the
// current convention (`<source>,<slug>,<type>`) and the legacy one
// (`feature:<slug>,type:<type>`). Kept deliberately in sync with slugsFromTags in
// super.using-superpowers/scripts/lib/db-presence.cjs — the two skills are
// distributed independently, so the small parser is duplicated rather than shared.
// Without this, legacy-tagged notes are read as `feature:<slug>` / `type:<t>`, none
// of which equals the manifest slug, so a real note is wrongly reported as missing.
function slugsFromTags(tags, source) {
  const src = String(source || '').trim().toLowerCase();
  const out = [];
  for (const raw of String(tags || '').split(',')) {
    const tag = raw.trim().toLowerCase();
    if (!tag || tag === src) continue;
    if (tag.startsWith('type:')) continue;
    if (ARTIFACT_TYPE_TAGS.has(tag)) continue;
    if (tag.startsWith('feature:')) { const s = tag.slice('feature:'.length); if (s) out.push(s); continue; }
    out.push(tag);
  }
  return out;
}

function emit(result, code) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(code);
}

function main() {
  const opts = parseArgs(process.argv);
  const repoRoot = opts.repoRoot || detectGitRoot();
  if (!repoRoot && (!opts.manifest || !opts.db)) {
    emit({ found: false, verifiable: false, reason: 'repo root not found', source: opts.source, features: [], missing: [], extraSlugs: [], allPresent: false }, 0);
  }
  const manifestPath = opts.manifest || path.join(repoRoot, '.memory', 'resync-manifest.json');
  const dbPath = opts.db || path.join(repoRoot, '.memory', 'memory.db');

  if (!fs.existsSync(manifestPath)) {
    emit({ found: false, verifiable: false, reason: 'manifest not found', source: opts.source, features: [], missing: [], extraSlugs: [], allPresent: true }, 0);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    emit({ found: true, verifiable: false, reason: `manifest unparseable: ${err.message}`, source: opts.source, features: [], missing: [], extraSlugs: [], allPresent: false }, 0);
  }
  const manifestSlugs = Object.keys(manifest.synced_features || {});

  // Open the DB read-only via node:sqlite — degrade gracefully if unavailable.
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (err) {
    emit({ found: true, verifiable: false, reason: 'node:sqlite unavailable in this runtime', source: opts.source, features: manifestSlugs.map((slug) => ({ slug, entries: null, ok: null })), missing: [], extraSlugs: [], allPresent: true }, 0);
  }
  if (!fs.existsSync(dbPath)) {
    emit({ found: true, verifiable: false, reason: 'memory db not found', source: opts.source, features: manifestSlugs.map((slug) => ({ slug, entries: 0, ok: false })), missing: manifestSlugs, extraSlugs: [], allPresent: manifestSlugs.length === 0 }, manifestSlugs.length === 0 ? 0 : 2);
  }

  let rows;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      rows = db.prepare('SELECT tags FROM notes WHERE source = ?').all(opts.source);
    } finally {
      db.close();
    }
  } catch (err) {
    emit({ found: true, verifiable: false, reason: `db read failed: ${err.message}`, source: opts.source, features: [], missing: [], extraSlugs: [], allPresent: false }, 0);
  }

  // Count entries per slug found in the sync namespace.
  const entriesPerSlug = new Map();
  const slugsInDb = new Set();
  for (const row of rows) {
    for (const slug of slugsFromTags(row.tags, opts.source)) {
      slugsInDb.add(slug);
      entriesPerSlug.set(slug, (entriesPerSlug.get(slug) || 0) + 1);
    }
  }

  const features = manifestSlugs.map((slug) => {
    const entries = entriesPerSlug.get(slug.toLowerCase()) || 0;
    return { slug, entries, ok: entries > 0 };
  });
  const missing = features.filter((f) => !f.ok).map((f) => f.slug);
  const manifestSlugSetLower = new Set(manifestSlugs.map((s) => s.toLowerCase()));
  // slugsInDb already holds only genuine feature slugs (slugsFromTags strips the
  // source label and artifact-type tokens), so "extra" is simply any DB slug the
  // manifest does not list.
  const extraSlugs = [...slugsInDb].filter((s) => !manifestSlugSetLower.has(s));

  const allPresent = missing.length === 0;
  emit({
    found: true,
    verifiable: true,
    reason: null,
    source: opts.source,
    features,
    missing,
    extraSlugs,
    allPresent,
  }, allPresent ? 0 : 2);
}

main();
