'use strict';
/**
 * preflight.test.cjs — lib/preflight.cjs, the ledger's pre-flight table (upstream 6.4.1 scans the
 * plan for conflicts before Task 1 and writes the table to the ledger; ours derives the rows from
 * each task file's `## Arquivos` and `**Consome:**`). sdd-start.test.cjs covers
 * the write-once and ruling round trip; this file covers each finding the scan can emit.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/preflight.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const preflight = require('../lib/preflight.cjs');

function plan(tasks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  const index = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(index, ['# Tarefas', '', '## Tarefas', '', ...tasks.map((t, i) => `- [ ] ${i + 1}. T${i + 1} → \`task-0${i + 1}.md\``), ''].join('\n'));
  tasks.forEach((t, i) => {
    fs.writeFileSync(path.join(dir, `task-0${i + 1}.md`), [
      `# Task ${i + 1}: T`, '', '**Status:** PENDING', '',
      '## Arquivos', '', ...t.files.map(([verb, p]) => `- ${verb}: \`${p}\``), '',
      '### Conformidade', '', '- `not/a/manifest.ts` is prose under a subsection', '',
      '## Interfaces', '', `- **Consome:** ${t.consumes || 'N/A'}`, t.consumesWrap ? `  ${t.consumesWrap}` : '', '- **Produz:** N/A', '',
    ].join('\n'));
  });
  return index;
}

const findings = (index) => Object.fromEntries(preflight.scan(index).map((r) => [r.id, r.finding]));

test('a file two tasks create is a conflict; sequential edits after the creator are in order', () => {
  const f = findings(plan([
    { files: [['Create', 'src/a.ts'], ['Create', 'src/b.ts']] },
    { files: [['Create', 'src/a.ts']] },
    { files: [['Modify', 'src/b.ts']] },
  ]));
  assert.strictEqual(f.F1, 'conflict: created by tasks 1 and 2');
  assert.strictEqual(f.F2, 'in order');
  assert.strictEqual(Object.keys(f).filter((k) => k.startsWith('F')).length, 2, 'a file only one task touches gets no row; subsection prose is not the manifest');
});

test('a task touching a file before the task that creates it is a conflict', () => {
  const f = findings(plan([
    { files: [['Modify', 'src/late.ts']] },
    { files: [['Create', 'src/late.ts']] },
  ]));
  assert.strictEqual(f.F1, 'conflict: task 1 touches it before task 2 creates it');
});

test('Consome: a later task is a conflict, an earlier one ok (the index order runs it first)', () => {
  const f = findings(plan([
    { files: [['Create', 'src/1.ts']] },
    { files: [['Create', 'src/2.ts']] },
    { files: [['Create', 'src/3.ts']], consumes: '`one()` (task-01)' },
    { files: [['Create', 'src/4.ts']], consumes: '`two()`,', consumesWrap: 'from task-02 and `five()` (task-05)' },
    { files: [['Create', 'src/5.ts']], consumes: '`three()` (task-03)' },
  ]));
  assert.strictEqual(f.T3, 'ok');
  assert.strictEqual(f.T4, 'conflict: consumes task 5, which runs later', 'the wrapped continuation line is read');
  assert.strictEqual(f.T5, 'ok');
});

test('the table escapes pipes, flags only conflict rows, and a ruling line clears a row', () => {
  const rows = [
    { id: 'F1', subject: '`a|b.ts`', tasks: '1 Create · 2 Create', finding: 'conflict: created by tasks 1 and 2', involves: [1, 2] },
    { id: 'T1', subject: 'task-01.md', tasks: 'Consome ↔ order', finding: 'ok', involves: [1] },
  ];
  const table = preflight.table(rows);
  assert.match(table, /^## Pre-flight\n/);
  assert.match(table, /\| F1 \| `a\\\|b\.ts` \|/);
  assert.doesNotMatch(table, /Ruling:/, 'the instruction line is never mistaken for a ruling at finish');
  assert.deepStrictEqual(preflight.flagged(rows).map((r) => r.id), ['F1']);
  assert.strictEqual(preflight.isRuled('Pre-flight F1: Ruling: x — y — z', 'F1'), true);
  assert.strictEqual(preflight.isRuled('Pre-flight F10: Ruling: x', 'F1'), false);
  assert.strictEqual(preflight.hasTable(`# Ledger — x\n\n${table}\n`), true);
});

test('a resumed plan is not asked to rule on rows whose tasks are all done', () => {
  const rows = preflight.scan(plan([
    { files: [['Create', 'src/a.ts']] },
    { files: [['Create', 'src/a.ts']] },
    { files: [['Create', 'src/c.ts']], consumes: '`d()` (task-04)' },
    { files: [['Create', 'src/d.ts']] },
  ]));
  assert.deepStrictEqual(preflight.flagged(rows).map((r) => r.id), ['F1', 'T3']);
  assert.deepStrictEqual(preflight.flagged(rows, new Set([1, 2])).map((r) => r.id), ['T3'], 'tasks 3 and 4 are still ahead');
  assert.deepStrictEqual(preflight.flagged(rows, new Set([1, 2, 3, 4])), []);
});
