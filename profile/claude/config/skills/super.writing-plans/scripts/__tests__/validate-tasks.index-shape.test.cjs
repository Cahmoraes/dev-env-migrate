'use strict';
/**
 * Index-shape guard — validate-tasks.cjs fails the plan when the tasks index carries
 * anything beyond its fixed shape: header (title, **Spec:**, **PRD:**, `---`) plus the three
 * bullet-list sections, whose task lines carry no FR tags.
 *
 * Measured 2026-09-21 (consumer plan `tasks-notice-audience.md`): the planner answered two
 * reach warnings by pasting a "Conjunto de verificação" paragraph and an "imports are
 * additive" justification into the index header. Nothing reads the index header beyond
 * the three fields; the executor resolves the verification commands itself. The prose in
 * the template and SKILL.md says "nothing else"; this guard is what makes it hold.
 *
 * Also rejects **Tech Stack:** (2026-09-24): its one reader was the task writer, whose briefing
 * already carries the verified per-file command; the index is the tracker a person reads.
 *
 * Also pins: the shipped template validates clean (its HTML comments and example bullets
 * are not prose), English headings are accepted, wrapped field lines are continuations.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const VALIDATE = path.join(SKILL_DIR, 'scripts', 'validate-tasks.cjs');
const TEMPLATE = path.join(SKILL_DIR, 'templates', 'tasks-template.md');

function runJson(args) {
  const r = spawnSync(process.execPath, [VALIDATE, ...args], { encoding: 'utf8' });
  const start = r.stdout.indexOf('{');
  assert.ok(start >= 0, `no JSON on stdout:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout.slice(start));
}

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'idx-shape-'));
}

const HEADER = ['# Tarefas: X', '', '**Spec:** `../specs/x-design.md`', '', '**PRD:** `../prd/prd-x.md`', '', '---', ''];
const TASKS = ['## Tarefas', '', '- [ ] 1. First thing → `task-01.md`', '- [ ] 2. Second thing → `task-02.md`', ''];
const LENS = ['## Restrições Globais', '', '- Node ≥ 20 (spec, "Decisões")', '', '## Foco de Revisão', '', '- Empty input → empty output → `task-02`', ''];

function validate(lines) {
  const dir = mkdir();
  try {
    const p = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
    return runJson(['--tasks-index', p, '--index-only']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const shapeErrors = (r) => r.errors.filter((e) => /Unknown section|has no reader|Prose outside a bullet|carries FR tags/u.test(e.message));

test('the canonical shape validates with no shape error', () => {
  const r = validate([...HEADER, ...TASKS, ...LENS]);
  assert.deepEqual(shapeErrors(r), []);
  assert.equal(r.valid, true);
});

test('the template puts Spec and PRD on separate rendered lines, each still a line-start field', () => {
  // A Markdown preview joins adjacent lines into one paragraph; the blank line keeps them apart.
  // Bullets would too, but build-task-dispatch.cjs (final reviewer) reads `^**Spec:**`/`^**PRD:**`.
  assert.match(fs.readFileSync(TEMPLATE, 'utf8'), /^\*\*Spec:\*\* [^\n]+\n\n\*\*PRD:\*\* /mu);
});

test('the shipped template validates with no shape error (comments and examples are not prose)', () => {
  const r = validate(fs.readFileSync(TEMPLATE, 'utf8').split('\n'));
  assert.deepEqual(shapeErrors(r), []);
});

test('the measured failure: a verification-command paragraph in the header is an ERROR that names the line', () => {
  const lines = [...HEADER];
  lines.splice(6, 0, '**Conjunto de verificação (barreira de cada onda):** backend `pnpm test:run`; raiz `pnpm build`. As importações são aditivas, então esses arquivos não entram em nenhum conjunto de escrita.', '');
  const r = validate([...lines, ...TASKS, ...LENS]);
  const errs = shapeErrors(r);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].line, 7);
  assert.match(errs[0].message, /has no reader/u);
  assert.match(errs[0].message, /Conjunto de verificação/u);
  assert.match(errs[0].message, /never by writing the answer here/u);
  assert.equal(r.valid, false);
});

test('an extra heading is an ERROR that says where the content belongs, and its body is not re-reported', () => {
  const r = validate([...HEADER, ...TASKS, '## Notas para o executor', '', 'Rodar `docker:up` antes da task 3.', '', 'Outra frase.', '', ...LENS]);
  const errs = shapeErrors(r);
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /Unknown section `## Notas para o executor`/u);
  assert.match(errs[0].message, /task file/u);
  assert.match(errs[0].message, /Restrições Globais/u);
});

test('prose outside a bullet inside a known section is an ERROR', () => {
  const r = validate([...HEADER, ...TASKS, '## Restrições Globais', '', 'Todas as regras abaixo vêm da spec.', '', '- Node ≥ 20', '', '## Foco de Revisão', '']);
  const errs = shapeErrors(r);
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /Prose outside a bullet in `## Restrições Globais`/u);
});

test('what is NOT prose: a wrapped field, an indented bullet continuation, English headings', () => {
  const header = ['# Tasks: X', '', '**Spec:** `../specs/x-design.md`,', 'wrapped onto a second line', '', '---', ''];
  const tasks = ['## Tasks', '', '- [ ] 1. First thing → `task-01.md`', '- [ ] 2. Second thing → `task-02.md`', ''];
  const lens = ['## Global Constraints', '', '- Output: `word<TAB>n`, one per line,', '  sorted by n desc (spec §3)', '', '## Review Focus', ''];
  const r = validate([...header, ...tasks, ...lens]);
  assert.deepEqual(shapeErrors(r), []);
});

test('a **Tech Stack:** line is an ERROR that sends the runner to the briefing, continuation included', () => {
  const header = (tech) => ['# Tarefas: X', '', '**Spec:** `../specs/x-design.md`', '', ...tech, '', '---', ''];
  const one = shapeErrors(validate([...header(['**Tech Stack:** node · vitest — `npx vitest run <file>`']), ...TASKS, ...LENS]));
  assert.equal(one.length, 1);
  assert.match(one[0].message, /\*\*Tech Stack:\*\* has no reader in the tasks index/u);
  assert.match(one[0].message, /task-writer briefing/u);
  assert.match(one[0].message, /`Run:` lines/u);

  // A wrapped continuation is not a way back in: it is reported too.
  const wrapped = shapeErrors(validate([...header(['**Tech Stack:** node · vitest,', 'backend from `apps/api`']), ...TASKS, ...LENS]));
  assert.equal(wrapped.length, 2);
});

test('an index task line carrying [FR-XXX] tags is an ERROR; the same line without them passes', () => {
  const tagged = ['## Tarefas', '', '- [ ] 1. First thing [FR-001, FR-002] → `task-01.md`', '- [ ] 2. Second thing → `task-02.md`', ''];
  const errs = shapeErrors(validate([...HEADER, ...tagged, ...LENS]));
  assert.equal(errs.length, 1);
  assert.equal(errs[0].line, 11);
  assert.match(errs[0].message, /index line carries FR tags \(FR-001, FR-002\)/u);
  assert.match(errs[0].message, /# Task 1: <title> \[FR-XXX\]/u);
  assert.deepEqual(shapeErrors(validate([...HEADER, ...TASKS, ...LENS])), []);
});

test('the prose chain says "nothing else": template, SKILL.md and the self-review item 8', () => {
  const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), 'utf8');
  assert.match(read('templates/tasks-template.md'), /nothing else\. No verification-command inventory/u);
  assert.match(read('SKILL.md'), /Nothing else goes in the index/u);
  assert.match(read('references/self-review-checklist.md'), /never by writing the justification into the index/u);
  // Order: the tracker (tasks) leads; the reviewer lens follows.
  const tpl = read('templates/tasks-template.md');
  const at = (re) => tpl.search(re);
  assert.ok(at(/^## Tarefas$/mu) < at(/^## Restrições Globais$/mu) && at(/^## Restrições Globais$/mu) < at(/^## Foco de Revisão$/mu));
});
