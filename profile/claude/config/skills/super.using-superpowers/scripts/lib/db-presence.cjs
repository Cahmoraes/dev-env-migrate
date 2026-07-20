'use strict';

/**
 * db-presence.cjs — Single source of truth for "which feature slugs actually have
 * at least one note in the persistent-memory DB (`.memory/memory.db`)".
 *
 * The re-sync manifest (`resync-manifest.json`) records which features are supposed
 * to be synced, but nothing structurally guarantees the DB agrees: a `pmem add`
 * can fail silently, or a manifest can be seeded ahead of the actual inserts. When
 * that happens the feature is marked synced but has NO recoverable note — and
 * because dirty detection is content-only (see artifact-hash.cjs), the gap stays
 * permanently invisible to the automatic flow.
 *
 * This helper closes that loop by making DB presence an INPUT to the gate:
 *   - check-resync.cjs      → flips `dirty` when a manifest slug is absent from the DB
 *   - compute-inventory.cjs → reclassifies an unchanged-but-absent feature as `changed`
 *   - update-manifest.cjs   → refuses to record a slug the DB cannot back
 *
 * Every consumer degrades gracefully: when `node:sqlite` is unavailable (older Node)
 * or the DB is missing, `available` is false and callers fall back to their prior
 * content-only behaviour — presence is additive signal, it never removes capability.
 *
 * Read-only: opens the DB with `{ readOnly: true }` and never mutates it. No model
 * load, no torch — a single `SELECT tags` — so it is cheap enough to run on the
 * gate every session.
 */

const fs = require('fs');

// Tags on a sync note follow `<source>,<feature-slug>,<artifact-type>` today, but
// legacy notes used `feature:<slug>,type:<artifact-type>`. Both must resolve to the
// same feature slug so an old note is not mistaken for a missing one. These are the
// artifact-type tokens that are NEVER a feature slug.
const ARTIFACT_TYPE_TAGS = new Set(['spec', 'prd', 'qa', 'adr', 'adrs']);

/**
 * Extract the set of feature slugs referenced by a single note's tag string,
 * tolerant of both the current and the legacy tag conventions.
 *
 * @param {string} tags   comma-separated tag string from a note row
 * @param {string} source the sync source label (dropped — it is not a slug)
 * @returns {string[]} lowercased feature slugs found in this note
 */
function slugsFromTags(tags, source) {
  const src = String(source || '').trim().toLowerCase();
  const out = [];
  for (const raw of String(tags || '').split(',')) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    if (tag === src) continue;                 // the source label, not a slug
    if (tag.startsWith('type:')) continue;      // legacy artifact-type token
    if (ARTIFACT_TYPE_TAGS.has(tag)) continue;  // current artifact-type token
    if (tag.startsWith('feature:')) {           // legacy slug: strip the prefix
      const slug = tag.slice('feature:'.length);
      if (slug) out.push(slug);
      continue;
    }
    out.push(tag);                              // current slug
  }
  return out;
}

/**
 * Query the memory DB for the set of feature slugs present in the sync namespace.
 *
 * @param {object}  opts
 * @param {string}  opts.dbPath  absolute path to `.memory/memory.db`
 * @param {string} [opts.source] sync source label (default "artifact-sync")
 * @returns {{
 *   available: boolean,          // DB could be opened and queried
 *   reason: string|null,         // why not available, when applicable
 *   presentSlugs: Set<string>,   // lowercased slugs with >=1 note (empty when !available)
 *   entriesPerSlug: Map<string,number>
 * }}
 */
function queryPresentSlugs(opts) {
  const dbPath = opts && opts.dbPath;
  const source = (opts && opts.source) || 'artifact-sync';

  const unavailable = (reason) => ({
    available: false,
    reason,
    presentSlugs: new Set(),
    entriesPerSlug: new Map(),
  });

  if (!dbPath || !fs.existsSync(dbPath)) {
    return unavailable('memory db not found');
  }

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (err) {
    return unavailable('node:sqlite unavailable in this runtime');
  }

  let rows;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      rows = db.prepare('SELECT tags FROM notes WHERE source = ?').all(source);
    } finally {
      db.close();
    }
  } catch (err) {
    return unavailable(`db read failed: ${err.message}`);
  }

  const presentSlugs = new Set();
  const entriesPerSlug = new Map();
  for (const row of rows) {
    for (const slug of slugsFromTags(row.tags, source)) {
      presentSlugs.add(slug);
      entriesPerSlug.set(slug, (entriesPerSlug.get(slug) || 0) + 1);
    }
  }

  return { available: true, reason: null, presentSlugs, entriesPerSlug };
}

/**
 * Given the manifest slugs and a presence result, return the slugs that the
 * manifest claims are synced but the DB has no note for. Returns `null` (unknown)
 * when presence could not be verified — callers MUST treat null as "no signal",
 * never as "no drift".
 *
 * @param {string[]} manifestSlugs
 * @param {{available:boolean, presentSlugs:Set<string>}} presence
 * @returns {string[]|null}
 */
function driftedSlugs(manifestSlugs, presence) {
  if (!presence || !presence.available) return null;
  return (manifestSlugs || []).filter(
    (slug) => !presence.presentSlugs.has(String(slug).toLowerCase()),
  );
}

module.exports = {
  ARTIFACT_TYPE_TAGS,
  slugsFromTags,
  queryPresentSlugs,
  driftedSlugs,
};
