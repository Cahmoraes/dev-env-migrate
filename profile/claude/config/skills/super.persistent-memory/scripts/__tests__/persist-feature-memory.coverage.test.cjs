'use strict';

/**
 * Coverage top-up for persist-feature-memory.cjs. Targets the branches the
 * original suite leaves uncovered:
 *   - parseArgs: --help (76-78), --input-file missing value (82), unknown arg (87-88)
 *   - readInput: stdin path (98-103), invalid-JSON catch (109-110), empty input
 *   - classify: skipped-duplicate (128) and status-0-unrecognized-output (129),
 *     both reachable only through the per-entry fallback
 *   - runBatch: add-batch output not JSON (165-166), which drives main's
 *     add-batch-failed branch (210-212)
 *   - runPerEntry: empty-content entry (174-176)
 *
 * Same house style as persist-feature-memory.test.cjs: fake `pmem` executables in
 * a tmpdir, CLI run via execFileSync, JSON parsed off stdout.
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

// add-batch returns exit 0 but emits non-JSON → runBatch's JSON.parse catch fires
// (165-166), main falls into the add-batch-failed else branch (210-212).
const FAKE_PMEM_BAD_BATCH = [
  '#!/usr/bin/env node',
  '"use strict";',
  'const argv = process.argv.slice(2);',
  'if (argv[0] === "add-batch") { process.stdout.write("this is not json"); process.exit(0); }',
  'process.exit(1);',
].join('\n');

// No add-batch (forces per-entry fallback); `add` always exits 0 with output that
// matches neither "added note id" nor "skipped duplicate" → classify line 129.
const FAKE_PMEM_UNRECOGNIZED = [
  '#!/usr/bin/env node',
  '"use strict";',
  'const argv = process.argv.slice(2);',
  'if (argv[0] === "add-batch") { process.stderr.write("error: argument command: invalid choice: \'add-batch\'\\n"); process.exit(2); }',
  'if (argv[0] === "add") { process.stdout.write("persisted, all good\\n"); process.exit(0); }',
  'process.exit(1);',
].join('\n');

// No add-batch; stateful `add` that reports "skipped duplicate" on repeat content
// → exercises classify's skipped branch (128) through the per-entry path.
const FAKE_PMEM_DUP = [
  '#!/usr/bin/env node',
  '"use strict";',
  'const fs = require("fs");',
  'const argv = process.argv.slice(2);',
  'const sf = process.env.FAKE_PMEM_STATE;',
  'if (argv[0] === "add-batch") { process.stderr.write("invalid choice: \'add-batch\'\\n"); process.exit(2); }',
  'if (argv[0] === "add") {',
  '  const c = argv[1] || "";',
  '  const seen = (sf && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, "utf8")) : [];',
  '  if (seen.includes(c)) { process.stdout.write("skipped duplicate note\\n"); process.exit(0); }',
  '  seen.push(c); if (sf) fs.writeFileSync(sf, JSON.stringify(seen));',
  '  process.stdout.write("added note id=" + seen.length + "\\n"); process.exit(0);',
  '}',
  'process.exit(1);',
].join('\n');

function mkdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-mem-cov-'));
  const write = (name, body) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, body, 'utf8');
    fs.chmodSync(p, 0o755);
    return p;
  };
  return {
    dir,
    badBatch: write('fake-pmem-badbatch.cjs', FAKE_PMEM_BAD_BATCH),
    unrecognized: write('fake-pmem-unrecognized.cjs', FAKE_PMEM_UNRECOGNIZED),
    dup: write('fake-pmem-dup.cjs', FAKE_PMEM_DUP),
  };
}

/** Run with --input-file; returns { code, json }. */
function runFile(input, { dir, env = {} } = {}) {
  const f = path.join(dir, `input-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(input), 'utf8');
  try {
    const stdout = execFileSync('node', [SCRIPT, '--input-file', f], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env },
    });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, json: err.stdout ? JSON.parse(err.stdout) : null, stderr: `${err.stderr || ''}` };
  }
}

/** Run feeding JSON via stdin (no --input-file). */
function runStdin(rawString) {
  try {
    const stdout = execFileSync('node', [SCRIPT], { encoding: 'utf8', input: rawString, stdio: ['pipe', 'pipe', 'ignore'] });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, json: err.stdout ? JSON.parse(err.stdout) : null, stderr: `${err.stderr || ''}` };
  }
}

function rawRun(args, input) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: `${err.stdout || ''}`, stderr: `${err.stderr || ''}` };
  }
}

function entryList(pmem, contents, extra = {}) {
  return { pmem, feature: 'demo', ...extra, entries: contents.map((content) => ({ content, tags: 'demo,test', source: 'assistant' })) };
}

// --- parseArgs ----------------------------------------------------------------

test('--help prints usage and exits 0 (lines 76-78)', () => {
  const r = rawRun(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /persist-feature-memory\.cjs/);
});

test('--input-file without a value → usage error, exit 1 (line 82)', () => {
  const r = rawRun(['--input-file']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /requires a value/);
});

test('unknown argument → usage error, exit 1 (lines 87-88)', () => {
  const r = rawRun(['--bogus']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown argument/);
});

// --- readInput ----------------------------------------------------------------

test('reads input from stdin when no --input-file is given (lines 98-103)', () => {
  // pmem points nowhere → graceful degradation, but the stdin read path runs.
  const json = JSON.stringify(entryList(path.join(os.tmpdir(), 'no-such-pmem-xyz'), ['from stdin']));
  const r = runStdin(json);
  assert.equal(r.code, 0);
  assert.equal(r.json.pmemAvailable, false);
  assert.equal(r.json.feature, 'demo');
});

test('empty stdin → usage error, exit 1', () => {
  const r = rawRun([], '');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /empty/);
});

test('stdin fd that cannot be read → usage error, exit 1 (lines 100-102 catch)', () => {
  // A write-only fd handed to the child as stdin makes readFileSync(0) throw,
  // exercising readInput's "stdin read failed" catch branch (not just empty stdin).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-mem-cov-'));
  const wfd = fs.openSync(path.join(dir, 'wo.txt'), 'w');
  try {
    let code = 0;
    let stderr = '';
    try {
      execFileSync('node', [SCRIPT], { encoding: 'utf8', stdio: [wfd, 'pipe', 'pipe'] });
    } catch (err) {
      code = err.status;
      stderr = `${err.stderr || ''}`;
    }
    assert.equal(code, 1);
    assert.match(stderr, /stdin is empty/);
  } finally {
    fs.closeSync(wfd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tags given as an array are normalized (normalizeTags array branch)', () => {
  const { dir, unrecognized } = mkdir();
  try {
    const payload = {
      pmem: unrecognized,
      feature: 'demo',
      entries: [{ content: 'arr-tags', tags: [' a ', 'b', '', 'c'], source: 'assistant' }],
    };
    const r = runFile(payload, { dir });
    assert.equal(r.code, 0);
    assert.equal(r.json.added, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid JSON input → usage error, exit 1 (lines 109-110)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-mem-cov-'));
  try {
    const f = path.join(dir, 'bad.json');
    fs.writeFileSync(f, '{ not valid json', 'utf8');
    const r = rawRun(['--input-file', f]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not valid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--input-file pointing at a missing file → usage error, exit 1', () => {
  const r = rawRun(['--input-file', path.join(os.tmpdir(), 'definitely-missing-input.json')]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /input file not found/);
});

// --- classify (per-entry path) ------------------------------------------------

test('per-entry add with unrecognized 0-exit output → counted as added (line 129)', () => {
  const { dir, unrecognized } = mkdir();
  try {
    const r = runFile(entryList(unrecognized, ['one', 'two']), { dir });
    assert.equal(r.code, 0);
    assert.equal(r.mode || r.json.mode, 'per-entry');
    assert.equal(r.json.added, 2);
    assert.equal(r.json.failed, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('per-entry duplicate content → classified as skipped (line 128)', () => {
  const { dir, dup } = mkdir();
  try {
    const state = path.join(dir, 'state.json');
    const payload = entryList(dup, ['dup-a', 'dup-b']);
    runFile(payload, { dir, env: { FAKE_PMEM_STATE: state } });
    const second = runFile(payload, { dir, env: { FAKE_PMEM_STATE: state } });
    assert.equal(second.code, 0);
    assert.equal(second.json.mode, 'per-entry');
    assert.equal(second.json.skipped, 2);
    assert.equal(second.json.added, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('per-entry with an empty-content entry → that entry fails, exit 2 (lines 174-176)', () => {
  const { dir, dup } = mkdir();
  try {
    const payload = {
      pmem: dup,
      feature: 'demo',
      entries: [{ content: '   ', tags: 'demo', source: 'assistant' }, { content: 'real', tags: 'demo', source: 'assistant' }],
    };
    const r = runFile(payload, { dir });
    assert.equal(r.code, 2);
    assert.equal(r.json.mode, 'per-entry');
    assert.equal(r.json.failed, 1);
    const empty = r.json.results.find((res) => res.index === 0);
    assert.equal(empty.status, 'failed');
    assert.match(empty.message, /empty content/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- runBatch failure → main else branch -------------------------------------

test('add-batch emitting non-JSON → batch error → exit 2, failed=total (lines 165-166, 210-212)', () => {
  const { dir, badBatch } = mkdir();
  try {
    const r = runFile(entryList(badBatch, ['x', 'y']), { dir });
    assert.equal(r.code, 2);
    assert.equal(r.json.mode, 'batch');
    assert.equal(r.json.pmemAvailable, true);
    assert.equal(r.json.failed, 2);
    assert.equal(r.json.total, 2);
    assert.equal(r.json.added, 0);
    assert.deepEqual(r.json.results, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
