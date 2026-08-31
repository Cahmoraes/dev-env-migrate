'use strict';

/**
 * The read∩write hazard is the one concurrency defect worktree isolation does NOT
 * remove, and it was reachable by nothing in this mode.
 *
 * Write∩write is what isolation solves: two tasks writing one file cannot clobber
 * each other when each writes in its own tree. A stale READ is the opposite — task B
 * reads `src/x.js` while task A creates it in a sibling worktree, so B reads the
 * pre-change version, produces coherent-looking work, and merges clean. Nothing
 * downstream reports it: no conflict, no failing test, no gate.
 *
 * Two things had to be true for that to slip through, and both were:
 *   1. `check-wave-disjoint.cjs` — the only script that sees `readWriteHazards` —
 *      belonged to the in-tree skill and this mode never ran it, on the stated
 *      premise that "worktrees are safe regardless of write-set disjointness".
 *   2. `validate-dispatch.cjs` DOES catch it, but only when the manifest carries
 *      `readFiles`, and this SKILL.md enumerated the manifest fields without it.
 *
 * So this file pins both halves: the scripts still detect the hazard (behaviour),
 * and the prose still tells the controller to run them (the part that decayed).
 *
 * Run: node --test super.parallel-subagent-development/scripts/__tests__/readwrite-hazard-gate.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const DISJOINT = path.join(SKILLS, 'super.parallel-subagent-in-tree', 'scripts', 'check-wave-disjoint.cjs');
const VALIDATE = path.join(SKILLS, 'super.dispatching-parallel-agents', 'scripts', 'validate-dispatch.cjs');
const PSD_SKILL = path.join(SKILLS, 'super.parallel-subagent-development', 'SKILL.md');

/** task-01 creates the file; task-02 reads it. Neither declares a dependency on the other. */
function plantHazard(dir) {
  fs.writeFileSync(
    path.join(dir, 'tasks-x.md'),
    ['# Tarefas: X', '', '## Tarefas',
      '- [ ] 1. Thumbnailer → `task-01.md`',
      '- [ ] 2. HTTP handler → `task-02.md`', ''].join('\n'),
    'utf8',
  );
  const body = (depends, files) => [
    '# Task: thing', '', '**Status:** PENDING', '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`', `**Depends on:** ${depends}`, '',
    '## Arquivos', ...files, '', '## Passos',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'task-01.md'), body('N/A', ['- Create: `src/thumbnailer.js`']), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'task-02.md'),
    body('N/A', ['- Create: `src/http/thumb-handler.js`', '- Read: `src/thumbnailer.js`']),
    'utf8',
  );
  return path.join(dir, 'tasks-x.md');
}

function runJson(script, args) {
  return JSON.parse(execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}

function validate(dir, manifest) {
  const p = path.join(dir, 'dispatch.json');
  fs.writeFileSync(p, JSON.stringify(manifest), 'utf8');
  return runJson(VALIDATE, ['--dispatch', p]);
}

const TIERS = { cheap: 'test-cheap-model', standard: 'test-standard-model', capable: 'test-capable-model' };

function manifest({ withReads }) {
  return {
    modelTiers: TIERS,
    agents: [
      { label: 'task-01', model: TIERS.cheap, goal: 'create the thumbnailer', tier: 'cheap',
        writeFiles: ['src/thumbnailer.js'] },
      { label: 'task-02', model: TIERS.cheap, goal: 'wire the http handler', tier: 'cheap',
        writeFiles: ['src/http/thumb-handler.js'],
        ...(withReads ? { readFiles: ['src/thumbnailer.js'] } : {}) },
    ],
  };
}

test('the wave pre-flight names the hazard, tasks and file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-hazard-'));
  try {
    const out = runJson(DISJOINT, ['--tasks-index', plantHazard(dir), '--tasks', '1,2']);
    assert.equal(out.safeForInTreeParallel, false);
    assert.deepEqual(out.writeOverlaps, [], 'the write-sets ARE disjoint — that is the trap');
    assert.equal(out.readWriteHazards.length, 1);
    assert.deepEqual(out.readWriteHazards[0].tasks, [1, 2]);
    assert.deepEqual(out.readWriteHazards[0].files, ['src/thumbnailer.js']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the dispatch gate catches it ONLY when the manifest carries readFiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-hazard-'));
  try {
    // The shape the SKILL.md used to enumerate: label + model + tier + writeFiles.
    const blind = validate(dir, manifest({ withReads: false }));
    assert.equal(blind.valid, true, 'write-sets are disjoint, so write_conflict never fires');

    const seeing = validate(dir, manifest({ withReads: true }));
    assert.equal(seeing.valid, false);
    const hazard = seeing.errors.find((e) => e.type === 'read_write_hazard');
    assert.ok(hazard, `expected read_write_hazard, got ${JSON.stringify(seeing.errors)}`);
    assert.equal(hazard.writer, 'task-01');
    assert.equal(hazard.reader, 'task-02');
    assert.equal(hazard.file, 'src/thumbnailer.js');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the worktrees SKILL.md orders the pre-flight before any dispatch', () => {
  const md = fs.readFileSync(PSD_SKILL, 'utf8');

  assert.match(md, /check-wave-disjoint\.cjs/,
    'the worktrees mode must run the only script that sees a readWriteHazard');
  assert.match(md, /Non-empty `readWriteHazards` → \*\*STOP\*\*, serialize those tasks in dependency order/,
    'a detected hazard has to halt the wave, not be reported and dispatched anyway');

  // Ordering: the gate is worth nothing after the implementers are already running.
  const gate = md.indexOf('Read∩write pre-flight');
  const dispatch = md.indexOf('**Dispatch implementers in parallel**');
  assert.ok(gate > 0 && dispatch > 0 && gate < dispatch,
    'the pre-flight must be stated before the dispatch step');

  // The manifest field list is what the controller copies. Omit `readFiles` there and
  // the deterministic backstop silently degrades to write∩write only.
  assert.match(md, /`readFiles` from its `Read:` lines/,
    'the enumerated manifest shape must include readFiles and say where it comes from');
  assert.match(md, /`read_write_hazard` = one reads what another writes/,
    'the enumerated error list must include read_write_hazard');
});

test('nothing claims worktrees are safe regardless of disjointness', () => {
  // The premise that licensed skipping the gate. Isolation neutralizes write∩write; it
  // is precisely useless against a stale read.
  for (const rel of [
    'super.parallel-subagent-development/SKILL.md',
    'super.writing-plans/references/execution-handoff-message.md',
  ]) {
    const md = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    assert.doesNotMatch(md, /safe regardless of write-set disjointness/,
      `${rel} still carries the premise that made the hazard unreachable`);
  }
});
