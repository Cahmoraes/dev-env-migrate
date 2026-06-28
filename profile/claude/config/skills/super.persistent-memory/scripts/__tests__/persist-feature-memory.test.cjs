'use strict';

/**
 * Tests for persist-feature-memory.cjs using a fake `pmem` executable so no real
 * Python/SQLite environment is needed. The fake speaks both the new `add-batch`
 * (JSON in/out) and the legacy per-entry `add` protocols.
 *
 * Run with: node --test super.persistent-memory/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'persist-feature-memory.cjs');

// Fake pmem supporting `add-batch` (preferred) and `add` (fallback). Dedup state
// is tracked in FAKE_PMEM_STATE; content with "FAIL" fails; the rest is added.
const FAKE_PMEM = [
  '#!/usr/bin/env node',
  '"use strict";',
  'const fs = require("fs");',
  'const argv = process.argv.slice(2);',
  'const cmd = argv[0];',
  'const stateFile = process.env.FAKE_PMEM_STATE;',
  'const load = () => (stateFile && fs.existsSync(stateFile)) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : [];',
  'const save = (s) => { if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(s)); };',
  'const classify = (content, seen) => {',
  '  if (content.includes("FAIL")) return { status: "failed" };',
  '  if (seen.includes(content)) return { status: "skipped" };',
  '  seen.push(content); return { status: "added", noteId: seen.length };',
  '};',
  'if (cmd === "add-batch") {',
  '  const noEmbed = argv.includes("--no-embed");',
  '  const payload = JSON.parse(fs.readFileSync(0, "utf8"));',
  '  const entries = payload.entries || payload;',
  '  const seen = load();',
  '  const results = entries.map((e, i) => {',
  '    const content = String((e.content || "")).trim();',
  '    if (!content) return { index: i, status: "failed", note_id: null, message: "empty content" };',
  '    const c = classify(content, seen);',
  '    return { index: i, status: c.status, note_id: c.noteId || null, message: "" };',
  '  });',
  '  save(seen);',
  '  const count = (s) => results.filter((r) => r.status === s).length;',
  '  process.stdout.write(JSON.stringify({ total: entries.length, added: count("added"), skipped: count("skipped"), failed: count("failed"), embedded: !noEmbed, embed_error: null, results }));',
  '  process.exit(0);',
  '}',
  'if (cmd === "add") {',
  '  const content = argv[1] || "";',
  '  if (content.includes("FAIL")) { process.stderr.write("boom\\n"); process.exit(1); }',
  '  const seen = load();',
  '  if (seen.includes(content)) { process.stdout.write("skipped duplicate note\\n"); process.exit(0); }',
  '  seen.push(content); save(seen);',
  '  process.stdout.write("added note id=" + seen.length + "\\n"); process.exit(0);',
  '}',
  'process.stderr.write("unknown command\\n"); process.exit(1);',
].join('\n');

// A pmem that predates add-batch: rejects it like argparse would, supports `add`.
const FAKE_PMEM_NO_BATCH = [
  '#!/usr/bin/env node',
  '"use strict";',
  'const fs = require("fs");',
  'const argv = process.argv.slice(2);',
  'const cmd = argv[0];',
  'const stateFile = process.env.FAKE_PMEM_STATE;',
  'if (cmd === "add-batch") { process.stderr.write("memory.py: error: argument command: invalid choice: \'add-batch\'\\n"); process.exit(2); }',
  'if (cmd === "add") {',
  '  const content = argv[1] || "";',
  '  const seen = (stateFile && fs.existsSync(stateFile)) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : [];',
  '  if (seen.includes(content)) { process.stdout.write("skipped duplicate note\\n"); process.exit(0); }',
  '  seen.push(content); if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(seen));',
  '  process.stdout.write("added note id=" + seen.length + "\\n"); process.exit(0);',
  '}',
  'process.exit(1);',
].join('\n');

function mkdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-mem-'));
  const pmem = path.join(dir, 'fake-pmem.cjs');
  fs.writeFileSync(pmem, FAKE_PMEM, 'utf8');
  fs.chmodSync(pmem, 0o755);
  const pmemNoBatch = path.join(dir, 'fake-pmem-nobatch.cjs');
  fs.writeFileSync(pmemNoBatch, FAKE_PMEM_NO_BATCH, 'utf8');
  fs.chmodSync(pmemNoBatch, 0o755);
  return { dir, pmem, pmemNoBatch };
}

function run(input, { dir, env = {} } = {}) {
  const inputFile = path.join(dir, 'input.json');
  fs.writeFileSync(inputFile, JSON.stringify(input), 'utf8');
  try {
    const stdout = execFileSync('node', [SCRIPT, '--input-file', inputFile], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...env },
    });
    const json = JSON.parse(stdout);
    return { code: 0, json, ...json };
  } catch (err) {
    const json = JSON.parse(err.stdout);
    return { code: err.status, json, ...json };
  }
}

function entries(pmem, contents, extra = {}) {
  return {
    pmem,
    feature: 'demo',
    ...extra,
    entries: contents.map((content) => ({ content, tags: 'demo,test', source: 'assistant' })),
  };
}

test('persists all entries via add-batch (one process) and reports added + exit 0', () => {
  const { dir, pmem } = mkdir();
  try {
    const state = path.join(dir, 'state.json');
    const r = run(entries(pmem, ['decisions A', 'scope B', 'artifacts C']), { dir, env: { FAKE_PMEM_STATE: state } });
    assert.equal(r.code, 0);
    assert.equal(r.mode, 'batch');
    assert.equal(r.added, 3);
    assert.equal(r.failed, 0);
    assert.equal(r.embedded, true);
    assert.equal(r.pmemAvailable, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('is idempotent — re-running classifies entries as skipped', () => {
  const { dir, pmem } = mkdir();
  try {
    const state = path.join(dir, 'state.json');
    const payload = entries(pmem, ['decisions A', 'scope B']);
    run(payload, { dir, env: { FAKE_PMEM_STATE: state } });
    const second = run(payload, { dir, env: { FAKE_PMEM_STATE: state } });
    assert.equal(second.code, 0);
    assert.equal(second.skipped, 2);
    assert.equal(second.added, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reports a failed entry and exits 2 (auditable failure)', () => {
  const { dir, pmem } = mkdir();
  try {
    const r = run(entries(pmem, ['ok one', 'this will FAIL', 'ok two']), { dir });
    assert.equal(r.code, 2);
    assert.equal(r.failed, 1);
    assert.equal(r.added, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deferEmbed passes --no-embed (embedded:false, fast path)', () => {
  const { dir, pmem } = mkdir();
  try {
    const r = run(entries(pmem, ['x', 'y'], { deferEmbed: true }), { dir });
    assert.equal(r.code, 0);
    assert.equal(r.embedded, false);
    assert.equal(r.added, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('falls back to per-entry add when pmem has no add-batch', () => {
  const { dir, pmemNoBatch } = mkdir();
  try {
    const state = path.join(dir, 'state.json');
    const r = run(entries(pmemNoBatch, ['alpha', 'beta', 'gamma']), { dir, env: { FAKE_PMEM_STATE: state } });
    assert.equal(r.code, 0);
    assert.equal(r.mode, 'per-entry');
    assert.equal(r.added, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('degrades gracefully (exit 0, pmemAvailable:false) when pmem is missing', () => {
  const { dir } = mkdir();
  try {
    const r = run(entries(path.join(dir, 'does-not-exist-pmem'), ['x']), { dir });
    assert.equal(r.code, 0);
    assert.equal(r.pmemAvailable, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 on empty entries array (usage error)', () => {
  const { dir, pmem } = mkdir();
  try {
    let code = 0;
    try {
      const f = path.join(dir, 'bad.json');
      fs.writeFileSync(f, JSON.stringify({ pmem, entries: [] }), 'utf8');
      execFileSync('node', [SCRIPT, '--input-file', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      code = err.status;
    }
    assert.equal(code, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('add-batch returning fewer results than entries is treated as failure (no silent under-count)', () => {
  const { dir } = mkdir();
  try {
    // A pmem whose add-batch exits 0 but returns a SHORT results array (one
    // result for N entries) — the silent-under-count case the guard must catch.
    const shortPmem = path.join(dir, 'fake-pmem-short.cjs');
    fs.writeFileSync(shortPmem, [
      '#!/usr/bin/env node',
      '"use strict";',
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'if (argv[0] === "add-batch") {',
      '  const payload = JSON.parse(fs.readFileSync(0, "utf8"));',
      '  const n = (payload.entries || payload).length;',
      '  // Return only ONE result regardless of how many entries came in.',
      '  process.stdout.write(JSON.stringify({ total: n, added: 1, skipped: 0, failed: 0, embedded: true, results: [{ index: 0, status: "added", note_id: 1, message: "" }] }));',
      '  process.exit(0);',
      '}',
      'process.exit(1);',
    ].join('\n'), 'utf8');
    fs.chmodSync(shortPmem, 0o755);
    const r = run(entries(shortPmem, ['one', 'two', 'three']), { dir });
    assert.equal(r.code, 2);          // treated as failure, not silent success
    assert.equal(r.mode, 'batch');
    assert.equal(r.failed, 3);        // all N counted failed, not 1 added
    assert.equal(r.added, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
