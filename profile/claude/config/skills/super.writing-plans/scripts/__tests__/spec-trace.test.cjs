'use strict';

/**
 * spec-trace.cjs — the spec's AC/INV and migration block reach the owning task with the spec's
 * own text. Each case below differs from a traced plan in exactly one defect; the last one runs
 * the real validate-tasks.cjs to lock the wiring (no flag: the spec comes from **Spec:**).
 *
 * Run: node --test super.writing-plans/scripts/__tests__/spec-trace.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { validateSpecTrace, resolveSpecPath } = require('../spec-trace.cjs');

const VALIDATE = path.resolve(__dirname, '..', 'validate-tasks.cjs');

const SPEC = [
  '# Emissão: Design',
  '',
  '## Dados e Consistência',
  '| ID | Enunciado | Categoria | Garantidor | Rede |',
  '|---|---|---|---|---|',
  '| INV-01 | Uma matrícula tem no máximo um certificado | unique | db | - |',
  '',
  '**Mecanismo:** lotes de 1.000 por `id > último`, uma transação por lote.',
  '**Volume e orçamento:** 80 mil; 20 min.',
  '**Critério de fim:** concluídas sem certificado = 0.',
  '**Legado que viola:** duplicado vai para descartados.',
  '',
  '## Testes',
  '- AC-01 · WHEN o curso é concluído THEN um pedido é gravado (origem: D1)',
  '- AC-03 · WHEN a conclusão chega duas vezes THEN sai o mesmo certificado (origem: D2)',
  '',
].join('\n');

const INDEX = [
  '# Tarefas: Emissão',
  '',
  '**Spec:** `../specs/emissao-design.md`',
  '',
  '---',
  '',
  '## Tarefas',
  '',
  '- [ ] 1. Gravar o pedido de emissão → `task-01.md`',
  '- [ ] 2. Migrar certificados existentes → `task-02.md`',
  '',
  '## Restrições Globais',
  '',
  '## Foco de Revisão',
  '',
  '- Uma transação por lote no backfill (task-02)',
  '',
].join('\n');

function task(n, criteria, steps = '') {
  return [
    `# Task ${n}: Tarefa ${n}`,
    '',
    '**Status:** TODO',
    '**Spec:** `../specs/emissao-design.md`',
    '**PRD:** none',
    '',
    '## Passos',
    '',
    steps,
    '',
    '## Critérios de Sucesso',
    '',
    ...criteria,
    '',
  ].join('\n');
}

const TASK1 = task(1, [
  '- AC-01 [unit]: WHEN o curso é concluído THEN um pedido é gravado',
  '- AC-03 [int]: WHEN a conclusão chega duas vezes   THEN sai o mesmo certificado',
], "it('AC-01 grava o pedido', …); it('ac_03 reemissão', …)");
const TASK2 = task(2, [
  '- INV-01 [db]: Uma matrícula tem no máximo um certificado · Run: `npx jest test/inv01.int-spec.ts`',
  '- **Mecanismo:** lotes de 1.000 por `id > último`, uma transação por lote.',
  '- **Critério de fim:** concluídas sem certificado = 0.',
], '- **Step 1: Write the failing test** — `test/inv01.int-spec.ts`: test("INV-01 rejeita o segundo", …) contra o Postgres de teste');

function fixture({ spec = SPEC, index = INDEX, tasks = [TASK1, TASK2] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-trace-'));
  const plans = path.join(root, 'plans');
  fs.mkdirSync(plans);
  fs.mkdirSync(path.join(root, 'specs'));
  if (spec !== null) fs.writeFileSync(path.join(root, 'specs', 'emissao-design.md'), spec);
  fs.writeFileSync(path.join(plans, 'tasks-emissao.md'), index);
  tasks.forEach((body, i) => fs.writeFileSync(path.join(plans, `task-0${i + 1}.md`), body));
  return { root, plans, indexPath: path.join(plans, 'tasks-emissao.md') };
}

function run(opts = {}, { indexOnly = false } = {}) {
  const { plans } = fixture(opts);
  const indexContent = fs.readFileSync(path.join(plans, 'tasks-emissao.md'), 'utf8');
  const parsedTasks = [...indexContent.matchAll(/^- \[ \] (\d+)\. (.+?) → `([^`]+)`$/gmu)]
    .map((m, i) => ({ taskNumber: Number(m[1]), rawTitle: m[2], taskFile: m[3], lineNumber: i + 1 }));
  const bodies = indexOnly ? null : new Map(parsedTasks.map((t) => {
    const filePath = path.join(plans, t.taskFile);
    return [t.taskNumber, { filePath, body: fs.readFileSync(filePath, 'utf8') }];
  }));
  const errors = [];
  const warnings = [];
  const result = validateSpecTrace({ indexContent, indexDir: plans, parsedTasks, bodies }, errors, warnings);
  return { result, errors, warnings };
}

test('a traced plan: no errors, no warnings, owners per ID and the migration owner', () => {
  const { result, errors, warnings } = run();
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(result.checked, true);
  assert.deepEqual(result.acceptance, [{ id: 'AC-01', owners: [1] }, { id: 'AC-03', owners: [1] }]);
  assert.deepEqual(result.invariants, [{ id: 'INV-01', guarantor: 'db', owners: [2] }]);
  assert.deepEqual(result.migration, { labels: ['Mecanismo', 'Critério de fim'], owners: [2], reviewFocus: true });
});

test('error: a spec ID in no task', () => {
  const { errors, result } = run({ tasks: [task(1, ['- AC-01 [unit]: WHEN o curso é concluído THEN um pedido é gravado'], 'AC-01'), TASK2] });
  assert.deepEqual(result.missing, ['AC-03']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Spec AC-03 is in no task/);
});

test('error: text different from the spec', () => {
  const t1 = TASK1.replace('um pedido é gravado', 'um pedido é salvo');
  const { errors } = run({ tasks: [t1, TASK2] });
  assert.deepEqual(errors.map((e) => e.message.match(/AC-\d+|INV-\d+/)[0]), ['AC-01']);
  assert.match(errors[0].message, /differs from the spec/);
});

test('error: missing or unknown level token', () => {
  const t1 = TASK1.replace('AC-01 [unit]:', 'AC-01:').replace('AC-03 [int]:', 'AC-03 [e2e]:');
  const { errors } = run({ tasks: [t1, TASK2] });
  assert.equal(errors.length, 2);
  assert.ok(errors.every((e) => /needs a level token/.test(e.message)));
});

test('error: an ID the spec does not define', () => {
  const t1 = TASK1.replace('- AC-03 [int]', '- AC-04 [int]');
  const { errors } = run({ tasks: [t1, TASK2] });
  assert.ok(errors.some((e) => /AC-04 is not defined in the spec/.test(e.message)));
  assert.ok(errors.some((e) => /Spec AC-03 is in no task/.test(e.message)));
});

test('error: an AC/INV on an index line, even under --index-only', () => {
  const index = INDEX.replace('Gravar o pedido de emissão', 'Gravar o pedido AC-01');
  const { errors } = run({ index }, { indexOnly: true });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /index line carries a spec ID \(AC-01\)/);
});

test('error: the migration mechanism rewritten in the task', () => {
  const t2 = TASK2.replace('uma transação por lote', 'uma transação por cliente');
  const { errors } = run({ tasks: [TASK1, t2] });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /\*\*Mecanismo:\*\* differs from the spec/);
});

test('error: the migration end criterion in no task', () => {
  const t2 = TASK2.replace('- **Critério de fim:** concluídas sem certificado = 0.\n', '');
  const { errors } = run({ tasks: [TASK1, t2] });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /migration \*\*Critério de fim:\*\* is in no task/);
});

test('error: no Foco de Revisão line names the migration task', () => {
  const index = INDEX.replace('(task-02)', '(task-01)');
  const { errors } = run({ index });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /No `## Foco de Revisão` line names the migration's task \(task-02\)/);
});

test('warning: a traced ID no test name carries; [unverified] is exempt', () => {
  const t1 = TASK1.replace("it('AC-01 grava o pedido', …); ", '');
  const { warnings } = run({ tasks: [t1, TASK2] });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /no test in the task names AC-01/);
  const t1u = t1.replace('AC-01 [unit]', 'AC-01 [unverified]');
  assert.deepEqual(run({ tasks: [t1u, TASK2] }).warnings, []);
});

test('the ID in a test name must match exactly: AC-01 does not cover AC-010', () => {
  const t1 = TASK1.replace("it('AC-01 grava o pedido'", "it('AC-010 grava o pedido'");
  const { warnings } = run({ tasks: [t1, TASK2] });
  assert.equal(warnings.length, 1);
});

test('trace off: spec not found, or no AC, is a warning and never an error', () => {
  const missing = run({ spec: null });
  assert.deepEqual(missing.errors, []);
  assert.match(missing.warnings[0].message, /Spec `\.\.\/specs\/emissao-design\.md` not found: the AC\/INV trace is off/);
  assert.equal(missing.result.checked, false);

  const noIds = run({ spec: '# X\n\n## Testes\nCenários em prosa.\n' });
  assert.deepEqual(noIds.errors, []);
  assert.match(noIds.warnings[0].message, /declares no AC-NN: the acceptance-criteria trace is off/);
  assert.equal(noIds.result.checked, false);
});

test('a spec with INV but no AC still traces the INV', () => {
  const spec = SPEC.replace(/## Testes[\s\S]*$/, '## Testes\nsem AC\n');
  const { errors, warnings, result } = run({ spec, tasks: [task(1, []), TASK2] });
  assert.deepEqual(errors, []);
  assert.match(warnings[0].message, /its INV are still traced/);
  assert.equal(result.checked, true);
  assert.deepEqual(result.invariants, [{ id: 'INV-01', guarantor: 'db', owners: [2] }]);
  const dropped = run({ spec, tasks: [task(1, []), TASK2.replace(/- INV-01 .*\n/, '')] });
  assert.ok(dropped.errors.some((e) => /Spec INV-01 is in no task/.test(e.message)));
});

test('resolveSpecPath: index dir first, then the repo root', () => {
  const { root, plans } = fixture();
  assert.equal(resolveSpecPath('**Spec:** `../specs/emissao-design.md`', plans).resolved, path.join(root, 'specs', 'emissao-design.md'));
  assert.equal(resolveSpecPath('**Spec:** `specs/emissao-design.md`', plans, root).resolved, path.join(root, 'specs', 'emissao-design.md'));
  assert.deepEqual(resolveSpecPath('# no spec', plans), { declared: null, resolved: null });
});

test('validate-tasks.cjs runs the trace with no flag and reports it under specTrace', () => {
  const { indexPath } = fixture({ tasks: [TASK1, TASK2.replace('uma transação por lote', 'uma por cliente')] });
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const out = JSON.parse(execFileSync('node', [VALIDATE, '--tasks-index', indexPath], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.equal(out.specTrace.checked, true);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /\*\*Mecanismo:\*\* differs from the spec/.test(e.message)));
});

test('F3: an INV guaranteed by db or app+lock needs [db]/[int] with Run:, or [unverified] with a check query', () => {
  const unit = TASK2.replace('INV-01 [db]:', 'INV-01 [unit]:');
  assert.ok(run({ tasks: [TASK1, unit] }).errors.some((e) => /guaranteed by `db`/.test(e.message)));
  const noRun = TASK2.replace(' · Run: `npx jest test/inv01.int-spec.ts`', '');
  assert.ok(run({ tasks: [TASK1, noRun] }).errors.some((e) => /guaranteed by `db`/.test(e.message)));
  const elsewhere = TASK2.replace('Run: `npx jest test/inv01.int-spec.ts`', 'Run: `npx jest test/other.int-spec.ts`');
  assert.ok(run({ tasks: [TASK1, elsewhere] }).errors.some((e) => /names no test file this task writes/.test(e.message)));
  const unverified = TASK2.replace('INV-01 [db]: Uma matrícula tem no máximo um certificado · Run: `npx jest test/inv01.int-spec.ts`',
    'INV-01 [unverified]: Uma matrícula tem no máximo um certificado · sem banco de teste (decisão da spec) · conferência: `SELECT matricula_id FROM certificados GROUP BY 1 HAVING count(*) > 1` = 0');
  const r = run({ tasks: [TASK1, unverified] });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.result.unverified.map((u) => [u.id, u.task]), [['INV-01', 2]]);
  const noCheck = unverified.replace(/ · conferência: .*$/m, '');
  assert.ok(run({ tasks: [TASK1, noCheck] }).errors.some((e) => /needs its reason and `conferência:/.test(e.message)));
});

test('F3: an AC (no guarantor) may be [unit]; an app-pure INV is not forced to a database', () => {
  const spec = SPEC.replace('| unique | db | - |', '| unique | app-pure | - |');
  const t2 = TASK2.replace('INV-01 [db]:', 'INV-01 [unit]:');
  assert.deepEqual(run({ spec, tasks: [TASK1, t2] }).errors, []);
});

test('F3: a [db]/[int] task whose tests skip on a missing env var is warned (green without running)', () => {
  const t2 = TASK2.replace('contra o Postgres de teste', "const d = process.env.DATABASE_URL ? describe : describe.skip;");
  const { warnings } = run({ tasks: [TASK1, t2] });
  assert.ok(warnings.some((w) => /skip themselves when an env var is missing/.test(w.message)));
  assert.ok(!run().warnings.some((w) => /skip themselves/.test(w.message)));
});

test('F4: a spec risk scored 6+ with no task citing it and no human-action marker is warned', () => {
  const riscos = '\n## Riscos\n\n| Risco | Onde | Impacto | Probabilidade | Score | Mitigação |\n|---|---|---|---|---|---|\n| Fila parada sem alerta | emissão | 3 | 3 | 9 🔴 | alerta |\n| Contrato do fornecedor muda | adaptador | 2 | 1 | 2 🟢 | teste |\n';
  const w = run({ spec: SPEC + riscos }).warnings;
  assert.equal(w.length, 1);
  assert.match(w[0].message, /Spec risk "Fila parada sem alerta" \(score 9\) is in no task/);
  const cited = TASK1 + '\nRisco: Fila parada sem alerta — task cria o alerta\n';
  assert.deepEqual(run({ spec: SPEC + riscos, tasks: [cited, TASK2] }).warnings, []);
  const human = riscos.replace('| alerta |', '| alerta (ação humana · SRE · antes do release) |');
  assert.deepEqual(run({ spec: SPEC + human }).warnings, []);
});

test('F5: an app-pure INV without a Property step, or a Property step without Sabotage, is warned', () => {
  const spec = SPEC.replace('| unique | db | - |', '| unique | app-pure | - |');
  const unit = TASK2.replace('INV-01 [db]:', 'INV-01 [unit]:');
  assert.ok(run({ spec, tasks: [TASK1, unit] }).warnings.some((w) => /has no `Property: INV-01` step/.test(w.message)));
  const prop = unit.replace('- **Step 1: Write the failing test**', '- **Step 2: Property: INV-01 — um por matrícula**\n- **Step 1: Write the failing test**');
  assert.ok(run({ spec, tasks: [TASK1, prop] }).warnings.some((w) => /has no `Sabotage:` line/.test(w.message)));
  const full = prop.replace('- **Step 1:', '- **Sabotage:** `src/emissao.ts:12` — permitir o segundo\n- **Step 1:');
  assert.ok(!run({ spec, tasks: [TASK1, full] }).warnings.some((w) => /Property|Sabotage/.test(w.message)));
  assert.ok(!run().warnings.some((w) => /Property/.test(w.message)), 'a db INV is not asked for a property');
});

test('contract: a spec operation no task names is warned; the task that copies the row silences it', () => {
  const contrato = '\n## Fronteiras e Contratos\n\n**Contrato:**\n\n| Operação | Entrada | Saída | Erros |\n|---|---|---|---|\n| `POST /matriculas/:id/certificado` | — | `202 {pedidoId}` | `MATRICULA_INEXISTENTE` → 404 |\n';
  const w = run({ spec: SPEC + contrato }).warnings;
  assert.equal(w.length, 1);
  assert.match(w[0].message, /Spec contract operation POST \/matriculas\/:id\/certificado is in no task/);
  const carried = TASK1 + '\n| `POST /matriculas/{id}/certificado` | — | `202 {pedidoId}` | `MATRICULA_INEXISTENTE` → 404 |\n';
  assert.deepEqual(run({ spec: SPEC + contrato, tasks: [carried, TASK2] }).warnings, []);
});
