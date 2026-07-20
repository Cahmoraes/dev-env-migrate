#!/usr/bin/env node
/**
 * compute-inventory.cjs — Scan docs/superpowers/ and diff artifacts against the sync manifest.
 *
 * Usage:
 *   node scripts/compute-inventory.cjs [--repo-root <path>] [--manifest-path <path>]
 *
 * Exit codes:
 *   0 — success (including "no features found")
 *   1 — usage error or unrecoverable runtime failure
 *
 * Output (stdout): JSON
 * Diagnostics (stderr): warnings for per-artifact read errors
 *
 * Artifact hashing is imported from lib/artifact-hash.cjs — the SAME module
 * check-resync.cjs uses for dirty detection, so the two never drift apart.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { detectRepoRoot } = require('./lib/repo-root.cjs');
const {
  hashFile,
  hashAdrs,
  bareDigest,
  normalizeManifestEntry,
  listFeatureSlugs,
  computeDiskMap,
  fingerprintOfMap,
} = require('./lib/artifact-hash.cjs');
const { queryPresentSlugs } = require('./lib/db-presence.cjs');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const HELP = `
compute-inventory.cjs — Scan docs/superpowers/ and diff artifacts against sync manifest.

Usage:
  node scripts/compute-inventory.cjs [--repo-root <path>] [--manifest-path <path>]

Options:
  --repo-root      <path>  Explicit repository root (overrides git detection)
  --manifest-path  <path>  Explicit manifest path (overrides default .memory/resync-manifest.json)
  --help                   Show this help text and exit 0

Artifact paths per feature (slug = directory name):
  spec:  docs/superpowers/<slug>/specs/<slug>-design.md
  prd:   docs/superpowers/<slug>/prd/prd-<slug>.md
  qa:    docs/superpowers/<slug>/qa/qa-report-<slug>.md
  adrs:  docs/superpowers/<slug>/adrs/*.md  (combined hash of all ADR files, sorted by name)

Output (JSON to stdout):
  {
    "treeHash": string | null,   // content fingerprint of the canonical artifact set
    "hashMethod": "artifact-content" | "none",
    "docsPath": string,
    "repoRoot": string,
    "features": Feature[],
    "errors": Error[],
    "driftedSlugs": string[]  // features whose content is unchanged but which had no
                              // note in memory.db, so they were reclassified "changed"
  }

  Feature:
  {
    "slug": string,
    "status": "new" | "changed" | "unchanged" | "deleted",
    "dbPresent": boolean | null,  // has >=1 note in memory.db; null if DB unverifiable
    "artifacts": {
      "spec":  ArtifactResult,
      "prd":   ArtifactResult,
      "qa":    ArtifactResult,
      "adrs":  AdrsResult
    }
  }

  ArtifactResult:
  {
    "path": string,          // absolute path checked
    "hash": string | null,   // sha256:<hex> or null
    "exists": boolean,
    "readable": boolean,     // false on permission/IO error (exists may still be true)
    "error": string | null   // error message if !readable
  }

  AdrsResult:
  {
    "path": string,          // absolute path to adrs/ directory
    "hash": string | null,   // combined SHA-256 of all .md files sorted by name
    "exists": boolean,       // true if directory exists (even if empty)
    "readable": boolean,
    "files": string[],       // names of .md files found (sorted)
    "error": string | null
  }

  Error:
  {
    "slug": string,
    "artifact": "spec" | "prd" | "qa" | "adrs",
    "error": string
  }

Status semantics:
  "new"       — slug not in manifest's synced_features
  "changed"   — slug in manifest but at least one hash differs (including new adr_hash),
                OR content is unchanged but the slug has no note in memory.db (presence
                drift — reclassified so the sync loop re-adds it; see driftedSlugs)
  "unchanged" — slug in manifest, all hashes match, AND a note exists in memory.db
                (or the DB could not be consulted)
  "deleted"   — slug in manifest but directory no longer exists in docs/superpowers/

Exit codes:
  0  success
  1  usage error or unrecoverable failure
`.trimStart();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

let repoRoot = null;
let manifestPathOverride = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--repo-root' && args[i + 1]) {
    repoRoot = path.resolve(args[++i]);
  } else if (args[i] === '--manifest-path' && args[i + 1]) {
    manifestPathOverride = path.resolve(args[++i]);
  }
}

// ─── Git root detection ───────────────────────────────────────────────────────

// Git working-tree root, resolved in-process (no `git` spawn) — see lib/repo-root.cjs.
function detectGitRoot() {
  return detectRepoRoot();
}

// ─── Feature classification ───────────────────────────────────────────────────

function classifyFeature(slug, artifacts, manifestEntry) {
  if (!manifestEntry) return 'new';

  const norm = normalizeManifestEntry(manifestEntry);

  const specChanged = bareDigest(artifacts.spec.hash) !== bareDigest(norm.spec_hash);
  const prdChanged = bareDigest(artifacts.prd.hash) !== bareDigest(norm.prd_hash);
  const qaChanged = bareDigest(artifacts.qa.hash) !== bareDigest(norm.qa_hash);
  const adrsChanged = bareDigest(artifacts.adrs.hash) !== bareDigest(norm.adr_hash);

  return specChanged || prdChanged || qaChanged || adrsChanged ? 'changed' : 'unchanged';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!repoRoot) {
  repoRoot = detectGitRoot();
  if (!repoRoot) {
    process.stderr.write('Warning: no git root found and no --repo-root given; using cwd\n');
    repoRoot = process.cwd();
  }
}

const docsPath = path.join(repoRoot, 'docs', 'superpowers');
const manifestPath = manifestPathOverride || path.join(repoRoot, '.memory', 'resync-manifest.json');

// docs/superpowers/ doesn't exist
if (!fs.existsSync(docsPath)) {
  const result = {
    treeHash: null,
    hashMethod: 'none',
    docsPath,
    repoRoot,
    features: [],
    errors: [],
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

// Read manifest
let manifest = null;
if (fs.existsSync(manifestPath)) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Warning: could not parse resync-manifest.json: ${err.message}\n`);
  }
}

const synced = (manifest && manifest.synced_features) ? manifest.synced_features : {};

// Presence in the memory DB, queried once. A feature whose content is UNCHANGED but
// which has no note in the DB is a phantom sync — the manifest claims it, the DB
// lacks it. We must re-sync it, so it is reclassified `changed` below (that is the
// status the sync loop already prunes-and-re-adds). Degrades gracefully: when the DB
// can't be consulted, `dbPresent` is null and classification stays hash-only.
const presence = queryPresentSlugs({
  dbPath: path.join(repoRoot, '.memory', 'memory.db'),
  source: 'artifact-sync',
});

// Content fingerprint of the canonical artifact set — identical computation to
// check-resync.cjs (shared lib), so a value written here matches what dirty
// detection reads next session.
const diskMap = computeDiskMap(docsPath);
const treeHash = fingerprintOfMap(diskMap);
const hashMethod = treeHash === null ? 'none' : 'artifact-content';

// List feature directories
const slugDirs = listFeatureSlugs(docsPath);

const features = [];
const errors = [];
const driftedSlugs = []; // unchanged-by-hash but absent from the DB → reclassified changed
const seenSlugs = new Set();

for (const slug of slugDirs) {
  seenSlugs.add(slug);
  const slugDir = path.join(docsPath, slug);

  const specPath = path.join(slugDir, 'specs', `${slug}-design.md`);
  const prdPath = path.join(slugDir, 'prd', `prd-${slug}.md`);
  const qaPath = path.join(slugDir, 'qa', `qa-report-${slug}.md`);
  const adrsDir = path.join(slugDir, 'adrs');

  const specResult = hashFile(specPath);
  const prdResult = hashFile(prdPath);
  const qaResult = hashFile(qaPath);
  const adrsResult = hashAdrs(adrsDir);

  // Collect read errors for reporting
  if (!specResult.readable && specResult.exists) {
    errors.push({ slug, artifact: 'spec', error: specResult.error });
  }
  if (!prdResult.readable && prdResult.exists) {
    errors.push({ slug, artifact: 'prd', error: prdResult.error });
  }
  if (!qaResult.readable && qaResult.exists) {
    errors.push({ slug, artifact: 'qa', error: qaResult.error });
  }
  if (!adrsResult.readable && adrsResult.exists) {
    errors.push({ slug, artifact: 'adrs', error: adrsResult.error });
  }

  const artifacts = {
    spec: { path: specPath, ...specResult },
    prd: { path: prdPath, ...prdResult },
    qa: { path: qaPath, ...qaResult },
    adrs: { path: adrsDir, ...adrsResult },
  };

  let status = classifyFeature(slug, artifacts, synced[slug]);

  // Presence override: an unchanged feature absent from the DB is drift → re-sync it.
  // Only applies when the slug is actually in the manifest (an `unchanged` classification
  // already implies that) and the DB was consulted.
  const dbPresent = presence.available
    ? presence.presentSlugs.has(slug.toLowerCase())
    : null;
  if (status === 'unchanged' && dbPresent === false) {
    status = 'changed';
    driftedSlugs.push(slug);
  }

  features.push({ slug, status, dbPresent, artifacts });
}

// Detect deleted features (in manifest but no longer on filesystem)
for (const slug of Object.keys(synced)) {
  if (!seenSlugs.has(slug)) {
    features.push({
      slug,
      status: 'deleted',
      dbPresent: presence.available ? presence.presentSlugs.has(slug.toLowerCase()) : null,
      artifacts: {
        spec: { path: path.join(docsPath, slug, 'specs', `${slug}-design.md`), hash: null, exists: false, readable: false, error: null },
        prd: { path: path.join(docsPath, slug, 'prd', `prd-${slug}.md`), hash: null, exists: false, readable: false, error: null },
        qa: { path: path.join(docsPath, slug, 'qa', `qa-report-${slug}.md`), hash: null, exists: false, readable: false, error: null },
        adrs: { path: path.join(docsPath, slug, 'adrs'), hash: null, exists: false, readable: false, files: [], error: null },
      },
    });
  }
}

const result = {
  treeHash,
  hashMethod,
  docsPath,
  repoRoot,
  features,
  errors,
  driftedSlugs, // features reclassified unchanged→changed because the DB lacked a note
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(0);
