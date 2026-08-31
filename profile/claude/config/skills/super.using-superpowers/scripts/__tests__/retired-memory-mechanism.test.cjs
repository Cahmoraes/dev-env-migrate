'use strict';

/**
 * retired-memory-mechanism.test.cjs — the vector-memory mechanism is gone, and no shipped
 * artifact may still route a consumer into it.
 *
 * What was removed and why: recall used to mean a local SQLite store (`.memory/memory.db`),
 * a manifest of what had been ingested (`resync-manifest.json`), a `pmem` CLI over an
 * embedding model, and three consent gates to repair the three ways that store could go
 * stale. Measured against the artifacts it indexed, the store held zero exclusive
 * information — every note was derived from a versioned file still on disk — while costing
 * ~80s of critical path and ~30k tokens per brainstorming. Recall now derives from
 * `docs/superpowers/` at call time (`super.brainstorming/scripts/feature-index.cjs`), so
 * there is no store, no sync and no gate.
 *
 * Why a sweep and not a diff: a removal this wide fails by REMAINDER. One surviving line —
 * a `pmem search` in a prompt template, a `session_memory_enabled` branch in a gate, a
 * mention of `.memory/` in the preferences template — sends a controller after a script
 * that no longer exists, and the measured behaviour there is not an error message: it is a
 * silent skip (see cross-skill-base-dir.test.cjs for the transcript). Enumerating the
 * tokens is what turns "we think we got them all" into something a commit can prove.
 *
 * Scope: everything a consumer can be instructed by — SKILL.md, references/, template/,
 * assets/, agents/ and the runtime scripts. `__tests__/` is deliberately OUT: the retired
 * names legitimately survive there, as fixtures asserting a legacy `memory:` key is
 * ignored and as the recorded reason a guard changed shape.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/retired-memory-mechanism.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

/**
 * Anti-staleness floor. A sweep whose walk stops matching reports zero violations over zero
 * files and passes forever — the failure mode every registry in this suite guards against.
 * Set below the real count with room for normal churn; it exists to catch a walk that broke,
 * not to pin the file count.
 */
const MIN_FILES_SWEPT = 150;

const SWEPT_EXTENSIONS = new Set(['.md', '.mmd', '.cjs', '.js', '.mjs', '.py', '.sh', '.yaml', '.yml', '.html', '.txt']);
const SKIPPED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules', 'evals']);

/**
 * The retired vocabulary. Each entry is a token that only ever meant the vector-memory
 * mechanism, so a match is a leftover rather than a coincidence — `memory` on its own is
 * NOT here, because human memory, session memory and in-process caches are ordinary words
 * this codebase uses correctly.
 */
const RETIRED = [
  { token: 'pmem', what: 'the memory CLI' },
  { token: 'super.persistent-memory', what: 'the removed skill' },
  { token: 'persistent_memory', what: 'the removed preference key' },
  { token: 'session_memory_enabled', what: 'the removed session variable' },
  { token: 'session_resync_completed', what: 'the removed session latch' },
  { token: 'resync-manifest', what: 'the removed manifest file' },
  { token: 'memory.db', what: 'the removed database' },
  { token: 'check-resync.cjs', what: 'the removed dirty probe' },
  { token: 'compute-inventory.cjs', what: 'the removed inventory script' },
  { token: 'update-manifest.cjs', what: 'the removed manifest writer' },
  { token: 'verify-sync.cjs', what: 'the removed sync audit' },
  { token: 'artifact-sync', what: 'the removed pmem source namespace' },
  { token: 'GateResync', what: 'the removed state-diagram gate' },
  { token: 'Memory Re-Sync', what: 'the removed entry gate' },
];

function sweptFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(abs, relPath); continue; }
      if (SWEPT_EXTENSIONS.has(path.extname(entry.name))) out.push({ abs, rel: relPath });
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return out;
}

function violationsIn(files) {
  const found = [];
  for (const file of files) {
    const body = fs.readFileSync(file.abs, 'utf8');
    body.split('\n').forEach((line, i) => {
      for (const { token, what } of RETIRED) {
        if (line.includes(token)) found.push(`${file.rel}:${i + 1}: ${token} (${what})`);
      }
    });
  }
  return found;
}

test('no shipped artifact still routes a consumer into the retired memory mechanism', () => {
  const files = sweptFiles();
  assert.ok(
    files.length >= MIN_FILES_SWEPT,
    `the sweep only reached ${files.length} files (floor ${MIN_FILES_SWEPT}) — the walk is broken, `
    + 'and a sweep over nothing passes forever',
  );
  assert.deepEqual(
    violationsIn(files),
    [],
    'these lines still name the removed mechanism. There is no script behind them, and a '
    + 'controller that follows one skips the step in silence rather than erroring. Recall is '
    + 'super.brainstorming/scripts/feature-index.cjs, run by a subagent, with nothing to sync.',
  );
});

test('the sweep really reads the files — a planted token is caught', () => {
  // Without this, a walk that silently returned unreadable/empty bodies would pass the
  // check above while proving nothing. Plants in a temp file rather than the tree so a
  // crashed run cannot leave a mutation behind.
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'retired-sweep-'));
  const abs = path.join(dir, 'planted.md');
  try {
    fs.writeFileSync(abs, 'Run `pmem search "<feature>"` before dispatching.\n');
    const found = violationsIn([{ abs, rel: 'planted.md' }]);
    assert.equal(found.length, 1, 'a planted `pmem` line must be reported');
    assert.match(found[0], /planted\.md:1: pmem/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the replacement is installed where the removed recall used to be dispatched', () => {
  // The sweep proves the old mechanism is gone; on its own that is also what deleting the
  // feature outright would look like. This is the other half: the recall step still exists,
  // in the skill that owns it, with a script behind it.
  const script = path.join(SKILLS, 'super.brainstorming', 'scripts', 'feature-index.cjs');
  assert.ok(fs.existsSync(script), 'feature-index.cjs must ship with super.brainstorming');

  const fanOut = fs.readFileSync(
    path.join(SKILLS, 'super.brainstorming', 'references', 'research-fan-out.md'), 'utf8',
  );
  assert.match(fanOut, /feature-index\.cjs/, 'the fan-out reference must still name the index script');

  // Where it runs is the part that moved. The first shape of the replacement read the index
  // inline "because it is already in hand"; a measured session then showed the inline index
  // is what invites the inline deep read that follows it. Recall — index, selection and
  // artifacts — is now one dispatched track. What must NOT come back is a store to sync;
  // that is what the sweep above covers, and it is orthogonal to where the read happens.
  const table = fanOut.slice(fanOut.indexOf('| Subagent | When | Agent type |'), fanOut.indexOf('**Project constitution'));
  assert.ok(table.length > 0, 'the fan-out must still carry its dispatch table');
  assert.match(table, /\*\*Feature history recall\*\*/,
    'recall must be a dispatched track — see super.brainstorming feature-history-recall.test.cjs');

  // The derived-on-demand property is the one the removal bought, and it is easy to lose
  // by re-introducing a cached index file. Pin the claim, not just the script name.
  assert.match(fanOut, /derives the index from `docs\/superpowers\/` at the moment of the call/,
    'the no-store property must stay written down — it is why there is no re-sync gate');
});
