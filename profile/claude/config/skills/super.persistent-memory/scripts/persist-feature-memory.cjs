#!/usr/bin/env node
/**
 * persist-feature-memory.cjs — Persist a feature's planning-memory entries via
 * `pmem add`, as one auditable, idempotent operation.
 *
 * Replaces three loose, manual `pmem add` calls at the Planejando-state exit
 * (see super.writing-plans/references/memory-persistence.md) with a single call
 * that runs every entry, classifies each result (added | skipped-duplicate |
 * failed), and returns a structured summary plus a deterministic exit code. The
 * LLM still SYNTHESIZES the entry contents — that is the irreducible judgment
 * part; this script only executes and audits the writes.
 *
 * Performance: it sends all entries to `pmem add-batch` in ONE process, so the
 * embedding model is imported and loaded once for the whole set rather than once
 * per entry (measured ~3x faster for 3 entries). If the target pmem predates
 * add-batch, it falls back to per-entry `pmem add`.
 *
 * Idempotency is inherited from pmem: it deduplicates by content hash, so
 * re-running this script after a partial failure is safe — already-written
 * entries come back as "skipped".
 *
 * Input (JSON via --input-file <path> or stdin):
 *   {
 *     "pmem": "pmem",                       // optional: pmem command/path (default "pmem")
 *     "feature": "<slug>",                  // optional: echoed back for auditing
 *     "deferEmbed": false,                  // optional: insert now, embed later via backfill (fast)
 *     "entries": [
 *       { "content": "...", "tags": "a,b" | ["a","b"], "source": "assistant" }
 *     ]
 *   }
 *
 * Usage:
 *   node scripts/persist-feature-memory.cjs --input-file entries.json
 *   echo '<json>' | node scripts/persist-feature-memory.cjs
 *
 * Exit codes:
 *   0  all entries added or skipped-as-duplicate (success), OR pmem unavailable
 *      (graceful degradation — memory-persistence is best-effort)
 *   2  at least one entry failed to write
 *   1  usage error (bad/missing input)
 *
 * Output (stdout): JSON
 *   {
 *     "feature": string|null,
 *     "pmem": string,
 *     "pmemAvailable": boolean,
 *     "total": number, "added": number, "skipped": number, "failed": number,
 *     "results": [{ index, status: "added"|"skipped"|"failed", noteId, message }]
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HELP = `
persist-feature-memory.cjs — Persist a feature's planning-memory entries via pmem, auditably.

Usage:
  node scripts/persist-feature-memory.cjs --input-file <path>
  echo '<json>' | node scripts/persist-feature-memory.cjs

Input JSON: { pmem?, feature?, entries: [{ content, tags, source }] }
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
  let inputFile = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--input-file') {
      if (!args[i + 1]) usage('--input-file <path> requires a value');
      inputFile = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${args[i]}`);
  }
  return { inputFile };
}

function readInput(inputFile) {
  let raw;
  if (inputFile) {
    if (!fs.existsSync(inputFile)) usage(`input file not found: ${inputFile}`);
    raw = fs.readFileSync(inputFile, 'utf8');
  } else {
    try {
      raw = fs.readFileSync(0, 'utf8'); // stdin
    } catch {
      usage('no --input-file given and stdin is empty');
    }
  }
  if (!raw || !raw.trim()) usage('input is empty');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    usage(`input is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    usage('input must contain a non-empty "entries" array');
  }
  return parsed;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).join(',');
  return String(tags || '').trim();
}

/** Map a `pmem add` run to a status. */
function classify(run) {
  if (run.error && run.error.code === 'ENOENT') return { status: 'enoent' };
  const stdout = `${run.stdout || ''}`;
  const addedMatch = stdout.match(/added note id=(\d+)/i);
  if (addedMatch) return { status: 'added', noteId: Number.parseInt(addedMatch[1], 10), message: stdout.trim() };
  if (/skipped duplicate/i.test(stdout)) return { status: 'skipped', message: stdout.trim() };
  if (run.status === 0) return { status: 'added', message: stdout.trim() || 'ok' }; // succeeded, unrecognized output
  return { status: 'failed', message: (run.stderr || stdout || `exit ${run.status}`).trim() };
}

function buildEntries(input) {
  return input.entries.map((entry, i) => ({
    index: i,
    content: String((entry && entry.content) || '').trim(),
    tags: normalizeTags(entry && entry.tags),
    source: (entry && entry.source && String(entry.source).trim()) || 'assistant',
  }));
}

function emit(out, code) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(code);
}

function degraded(input, pmem) {
  process.stderr.write(`Warning: pmem ("${pmem}") not found — skipping persistence (graceful degradation).\n`);
  emit({ feature: input.feature || null, pmem, pmemAvailable: false, mode: null, total: input.entries.length, added: 0, skipped: 0, failed: 0, embedded: false, results: [] }, 0);
}

/** Primary path: one `pmem add-batch` process for all entries (one model load). */
function runBatch(pmem, entries, deferEmbed) {
  const payload = JSON.stringify({ entries: entries.map((e) => ({ content: e.content, tags: e.tags, source: e.source })) });
  const args = ['add-batch'];
  if (deferEmbed) args.push('--no-embed');
  const run = spawnSync(pmem, args, { encoding: 'utf8', input: payload });
  if (run.error && run.error.code === 'ENOENT') return { enoent: true };
  const stderr = `${run.stderr || ''}`;
  if (run.status !== 0 && /invalid choice: ?'?add-batch/i.test(stderr)) return { unsupported: true };
  if (run.status !== 0) return { error: stderr || `exit ${run.status}` };
  try {
    return { parsed: JSON.parse(`${run.stdout || ''}`) };
  } catch {
    return { error: `add-batch output not JSON: ${(run.stdout || '').slice(0, 200)}` };
  }
}

/** Fallback: per-entry `pmem add` (for a pmem that predates add-batch). */
function runPerEntry(pmem, entries, deferEmbed, input) {
  const results = [];
  for (const e of entries) {
    if (!e.content) {
      results.push({ index: e.index, status: 'failed', noteId: null, message: 'empty content' });
      continue;
    }
    const args = ['add', e.content, '--tags', e.tags, '--source', e.source];
    if (deferEmbed) args.push('--no-embed');
    const c = classify(spawnSync(pmem, args, { encoding: 'utf8' }));
    if (c.status === 'enoent') return degraded(input, pmem); // exits
    results.push({ index: e.index, status: c.status, noteId: c.noteId || null, message: c.message });
  }
  return results;
}

function main() {
  const { inputFile } = parseArgs(process.argv);
  const input = readInput(inputFile);
  const pmem = (input.pmem && String(input.pmem).trim()) || 'pmem';
  const deferEmbed = input.deferEmbed === true;
  const entries = buildEntries(input);

  const batch = runBatch(pmem, entries, deferEmbed);
  if (batch.enoent) return degraded(input, pmem); // exits

  let results;
  let embedded = false;
  let mode;
  if (batch.parsed) {
    mode = 'batch';
    results = (batch.parsed.results || []).map((r) => ({
      index: r.index, status: r.status, noteId: r.note_id ?? null, message: r.message || '',
    }));
    embedded = Boolean(batch.parsed.embedded);
    // add-batch must return exactly one result per input entry. A short or empty
    // results array (even with exit 0) means the batch did not fully process —
    // never report that as success; it would silently under-count and exit 0.
    if (results.length !== entries.length) {
      process.stderr.write(
        `Error: add-batch returned ${results.length} result(s) for ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} — treating as failure.\n`,
      );
      return emit({ feature: input.feature || null, pmem, pmemAvailable: true, mode: 'batch', total: entries.length, added: 0, skipped: 0, failed: entries.length, embedded: false, results }, 2);
    }
  } else if (batch.unsupported) {
    mode = 'per-entry';
    results = runPerEntry(pmem, entries, deferEmbed, input); // may exit on enoent
    embedded = !deferEmbed; // per-entry add embeds inline unless deferred
  } else {
    process.stderr.write(`Error: add-batch failed: ${batch.error}\n`);
    return emit({ feature: input.feature || null, pmem, pmemAvailable: true, mode: 'batch', total: entries.length, added: 0, skipped: 0, failed: entries.length, embedded: false, results: [] }, 2);
  }

  const added = results.filter((r) => r.status === 'added').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  const out = {
    feature: input.feature || null,
    pmem,
    pmemAvailable: true,
    mode,
    total: entries.length,
    added,
    skipped,
    failed,
    embedded,
    results,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (failed > 0) {
    process.stderr.write(`Error: ${failed} of ${entries.length} memory entries failed to persist.\n`);
    process.exit(2);
  }
  process.exit(0);
}

main();
