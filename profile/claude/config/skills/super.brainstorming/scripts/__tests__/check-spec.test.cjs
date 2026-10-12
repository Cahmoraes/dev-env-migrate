'use strict';

/**
 * check-spec.cjs — the mechanical half of the spec self-review (brainstorming step 7).
 *
 * Every error code is exercised by a spec that differs from a valid one in exactly the defect,
 * so a check that stops firing fails here. The warnings are locked on both sides: they fire on
 * the defect and stay silent on the escape the message offers (cite the INV, declare the lens
 * closed, `**Contrato:** nenhuma operação nova ou alterada`).
 *
 * Run: node --test super.brainstorming/scripts/__tests__/check-spec.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { checkSpec, previousCommittedVersion, splitTopLevel } = require('../check-spec.cjs');

const SCRIPT = path.resolve(__dirname, '..', 'check-spec.cjs');

// A valid spec in the neutral certificates domain. Each test swaps one part.
function spec(parts = {}) {
  const p = {
    escopo: '**Dentro:** emissão.\n**Fora de escopo:** revogação (feature própria).',
    dados: [
      '**Fonte de verdade:** `certificates`.',
      '',
      '| ID | Enunciado | Categoria | Garantidor | Rede |',
      '|---|---|---|---|---|',
      '| INV-01 | Um certificado por matrícula | unique | db | - |',
      '| INV-02 | Emissão repetida devolve o mesmo certificado | idempotent | app+lock | INV-01 |',
      '',
      '**Modelo:** `certificates` (tabela nova)',
      '',
      '| Coluna | Tipo | Nulo | Restrição |',
      '|---|---|---|---|',
      '| `enrollment_id` | uuid | não | UNIQUE · INV-01 |',
    ].join('\n'),
    fronteiras: 'Só o módulo de cursos consome.',
    bancoTeste: '**Banco de teste:** nenhum; INV-01 e INV-02 conferidos à mão com `SELECT …` (fato do usuário (Testes)).',
    extra: '',
    testes: [
      'Runner: `npm test`.',
      '',
      '- AC-01 · WHEN a matrícula conclui THEN um pedido de emissão é gravado (origem: D1)',
      '- AC-02 · WHEN o gerador de PDF falha THEN o pedido volta à fila (origem: Falhas: PDF indisponível)',
    ].join('\n'),
    ...parts,
  };
  return [
    '# Emissão de Certificados: Design',
    '',
    '## Visão Geral',
    'O aluno recebe o certificado sem ação manual.',
    '',
    '## Escopo',
    p.escopo,
    '',
    '## Características Arquiteturais',
    'Disponibilidade da emissão.',
    '',
    '## Fronteiras e Contratos',
    p.fronteiras,
    '',
    '## Dados e Consistência',
    p.dados,
    '',
    '## Falhas e Erros',
    '| Falha | AC |',
    '|---|---|',
    '| PDF indisponível | AC-02 |',
    '',
    p.extra,
    '## Decisões Arquiteturais',
    '### D1. Vamos emitir de forma assíncrona',
    'Nunca emitir na mesma requisição.',
    '',
    '## Testes',
    p.bancoTeste,
    p.testes,
    '',
  ].join('\n');
}

const codes = (list) => list.map((i) => i.code);

test('the base spec is valid with no warnings except the undeclared Rollout lens', () => {
  const r = checkSpec(spec());
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.deepEqual(r.acceptance, ['AC-01', 'AC-02']);
  assert.deepEqual(r.invariants, [
    { id: 'INV-01', category: 'unique', guarantor: 'db' },
    { id: 'INV-02', category: 'idempotent', guarantor: 'app+lock' },
  ]);
  assert.deepEqual(codes(r.warnings), ['closed-lens-undeclared']);
  assert.equal(r.warnings[0].section, 'Rollout e Compatibilidade');
});

test('error: a spec without acceptance criteria', () => {
  const r = checkSpec(spec({ testes: 'Runner: `npm test`.\n\nCenários: emitir e reemitir.' }));
  assert.equal(r.valid, false);
  assert.deepEqual(codes(r.errors), ['no-acceptance-criteria']);
});

test('error: a spec without the Testes section', () => {
  const md = spec().replace(/## Testes[\s\S]*$/, '');
  assert.deepEqual(codes(checkSpec(md).errors), ['missing-section']);
});

test('error: AC without WHEN/THEN, without origin, with an invalid origin', () => {
  const r = checkSpec(spec({
    testes: [
      '- AC-01 · quando conclui, grava o pedido (origem: D1)',
      '- AC-02 · WHEN falha THEN volta à fila',
      '- AC-03 · WHEN pede de novo THEN mesmo certificado (origem: D1, conversa)',
      '- AC-04 · WHEN a THEN b (origem: Decisão de produto)',
    ].join('\n'),
  }));
  assert.deepEqual(codes(r.errors), ['ac-missing-when-then', 'ac-missing-origin', 'ac-invalid-origin', 'ac-invalid-origin']);
  assert.deepEqual(r.errors.map((e) => e.id), ['AC-01', 'AC-02', 'AC-03', 'AC-04']);
});

test('every documented origin form is accepted', () => {
  const r = checkSpec(spec({
    testes: [
      '- AC-01 · WHEN a THEN b (origem: D1, D12)',
      '- AC-02 · WHEN a THEN b (origem: Falhas e Erros: PDF indisponível)',
      '- AC-03 · WHEN a THEN b (origem: fato do usuário (Escopo, Dentro))',
      '- AC-04 · WHEN a THEN b (origem: corp ref CA-7 · CA001)',
      '- AC-05 · WHEN a THEN b (origin: user fact (Scope))',
    ].join('\n'),
  }));
  assert.deepEqual(r.errors, []);
});

test('error: FR-/US- on a definition line, even inside the origin', () => {
  const r = checkSpec(spec({ testes: '- AC-01 · WHEN a THEN b cobre FR-001 (origem: D1)\n- AC-02 · WHEN a THEN b (origem: US-02)' }));
  assert.deepEqual(codes(r.errors), ['fr-in-definition', 'fr-in-definition', 'ac-invalid-origin']);
});

test('error: duplicate and malformed IDs', () => {
  const r = checkSpec(spec({
    testes: '- AC-01 · WHEN a THEN b (origem: D1)\n- AC-01 · WHEN c THEN d (origem: D1)\n- AC-3 · WHEN e THEN f (origem: D1)',
  }));
  assert.deepEqual(codes(r.errors), ['id-duplicate', 'id-format']);
});

test('gaps in the numbering are allowed', () => {
  const r = checkSpec(spec({ testes: '- AC-01 · WHEN a THEN b (origem: D1)\n- AC-07 · WHEN c THEN d (origem: D1)' }));
  assert.equal(r.valid, true);
});

test('error: INV with a category or guarantor outside the tokens, missing columns, empty net', () => {
  const r = checkSpec(spec({
    dados: [
      '| ID | Enunciado | Categoria | Garantidor | Rede |',
      '|---|---|---|---|---|',
      '| INV-01 | Um por matrícula | unicidade | db | - |',
      '| INV-02 | Repetir não duplica | idempotent | banco | - |',
      '| INV-03 | Só três colunas | limit |',
      '| INV-04 | Rede vazia | limit | app |  |',
    ].join('\n'),
  }));
  assert.deepEqual(codes(r.errors), ['inv-invalid-category', 'inv-invalid-guarantor', 'inv-missing-columns', 'inv-missing-net', 'inv-db-unmodeled']);
});

test('localized labels beside the ASCII token are accepted', () => {
  const r = checkSpec(spec({
    dados: '| ID | E | C | G | R |\n|---|---|---|---|---|\n| INV-01 | Um por matrícula | unique (unicidade) | db (banco) | - |\n\n**Modelo:**\n\n| Coluna | Restrição |\n|---|---|\n| `enrollment_id` | UNIQUE · INV-01 |',
  }));
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test('error: existing data migrated without the four labels; partial labels name what is missing', () => {
  const signal = checkSpec(spec({ dados: 'O `backfill` roda em lotes depois da migration.' }));
  assert.deepEqual(codes(signal.errors), ['migration-incomplete']);
  assert.equal(signal.errors[0].missing.length, 4);

  const partial = checkSpec(spec({ dados: '**Mecanismo:** lotes de 5 mil com `INSERT … ON CONFLICT DO NOTHING`.\n**Critério de fim:** `SELECT count(*) …` = 0.' }));
  assert.deepEqual(partial.errors[0].missing, ['Volume e orçamento', 'Legado que viola']);
});

test('the complete migration block is valid and its values are exposed, wrapped lines joined', () => {
  const r = checkSpec(spec({
    dados: [
      '**Mecanismo:** lotes de 5 mil por `id > último`,',
      'com `INSERT … ON CONFLICT DO NOTHING`, uma transação por lote.',
      '**Volume e orçamento:** 1,2 M linhas, até 2 h, sem lock de tabela.',
      '**Critério de fim:** `SELECT count(*) FROM courses c WHERE NOT EXISTS (…)` = 0, sobre todas as matrículas concluídas.',
      '**Legado que viola:** matrículas duplicadas vão para `certificates_quarantine`.',
    ].join('\n'),
  }));
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(r.migration.present, true);
  assert.equal(r.migration.labels.Mecanismo, 'lotes de 5 mil por `id > último`, com `INSERT … ON CONFLICT DO NOTHING`, uma transação por lote.');
});

test('error: a migration label with no value', () => {
  const r = checkSpec(spec({ dados: '**Mecanismo:**\n\n**Volume e orçamento:** 80 mil\n**Critério de fim:** y\n**Legado que viola:** z' }));
  assert.deepEqual(codes(r.errors), ['migration-empty-label']);
});

test('a negated migration mention is not a signal, but a negation elsewhere on the line does not hide one', () => {
  assert.equal(checkSpec(spec({ dados: 'Coluna calculada, sem backfill: nada existe antes.' })).valid, true);
  assert.equal(checkSpec(spec({ dados: 'Não há dados existentes a migrar.' })).valid, true);
  const hidden = checkSpec(spec({ dados: 'O backfill termina com a varredura de clientes sem endereço padrão.' }));
  assert.deepEqual(codes(hidden.errors), ['migration-incomplete']);
});

test('warning: universal quantifiers outside the table, aggregated; silent when the line cites an INV', () => {
  const extra = '## Componentes\nCada aluno tem no máximo 5 certificados.\nO número é único por curso.\nO código é único (INV-01).\n\n';
  const r = checkSpec(spec({ extra }));
  const q = r.warnings.filter((w) => w.code === 'quantifier-outside-table');
  assert.equal(q.length, 1);
  assert.equal(q[0].lines.length, 2);
  assert.match(q[0].message, /"no máximo"/);
});

test('quantifiers in Escopo, Decisões, Riscos and Rollout are not rules of the domain', () => {
  const r = checkSpec(spec());
  assert.ok(!codes(r.warnings).includes('quantifier-outside-table'), 'the base spec has "Nunca" under a decision');
});

test('warning: a definition-shaped line outside the owner section', () => {
  const r = checkSpec(spec({ extra: '## Riscos\n- AC-09 · WHEN x THEN y (origem: D1)\n\n' }));
  assert.equal(r.valid, true);
  assert.ok(codes(r.warnings).includes('definition-outside-owner'));
});

test('warning: an absent conditional section is silent only when its lens is declared closed', () => {
  const open = checkSpec(spec());
  assert.deepEqual(open.warnings.map((w) => w.lens), ['Evolução e rollout']);
  const closed = checkSpec(spec({ escopo: '**Dentro:** emissão.\n**Lentes fechadas:** Evolução e rollout (nada publicado consome isto); Segurança e privacidade (sem dado pessoal novo)' }));
  assert.deepEqual(closed.warnings, []);
  const bySection = checkSpec(spec({ escopo: '**Lentes fechadas:** Rollout e Compatibilidade (feature nova)' }));
  assert.deepEqual(bySection.warnings, []);
});

test('warning: an ID whose text changed since the previous version; unchanged and new IDs are silent', () => {
  const before = spec();
  const after = spec({
    testes: [
      '- AC-01 · WHEN a matrícula conclui THEN um pedido de emissão é    gravado (origem: D1)',
      '- AC-02 · WHEN o gerador de PDF falha THEN o aluno vê um erro (origem: Falhas: PDF indisponível)',
      '- AC-03 · WHEN novo THEN novo (origem: D1)',
    ].join('\n'),
  });
  const r = checkSpec(after, { previousMarkdown: before });
  assert.deepEqual(r.warnings.filter((w) => w.code === 'id-text-changed').map((w) => w.id), ['AC-02']);
});

test('splitTopLevel keeps parentheses together', () => {
  assert.deepEqual(splitTopLevel('D2, fato do usuário (Escopo, Dentro); D3'), ['D2', 'fato do usuário (Escopo, Dentro)', 'D3']);
});

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-'));
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  run('config', 'commit.gpgsign', 'false');
  return { dir, run };
}

test('previous version: the last commit when the working copy differs, else the one before', () => {
  const { dir, run } = gitRepo();
  const file = path.join(dir, 'spec.md');
  fs.writeFileSync(file, 'v1\n');
  assert.equal(previousCommittedVersion(file), null, 'untracked file has no previous version');
  run('add', '.');
  run('commit', '-qm', 'v1');
  assert.equal(previousCommittedVersion(file), null, 'the only version is the current one');
  fs.writeFileSync(file, 'v2\n');
  assert.equal(previousCommittedVersion(file), 'v1\n');
  run('commit', '-qam', 'v2');
  assert.equal(previousCommittedVersion(file), 'v1\n', 'step 7 runs right after the commit');
  assert.equal(previousCommittedVersion(path.join(os.tmpdir(), 'nowhere', 'spec.md')), null);
});

test('CLI: JSON on stdout, exit 0 even when invalid; usage error exits 1', () => {
  const { dir } = gitRepo();
  const file = path.join(dir, 'spec.md');
  fs.writeFileSync(file, '## Testes\nsem critérios\n');
  const out = JSON.parse(execFileSync('node', [SCRIPT, file], { encoding: 'utf8' }));
  assert.equal(out.valid, false);
  assert.equal(out.spec, file);
  assert.deepEqual(codes(out.errors), ['no-acceptance-criteria']);
  assert.throws(() => execFileSync('node', [SCRIPT], { stdio: 'ignore' }), (e) => e.status === 1);
  assert.throws(() => execFileSync('node', [SCRIPT, path.join(dir, 'missing.md')], { stdio: 'ignore' }), (e) => e.status === 1);
});

test('error: an invariant table outside Dados e Consistência (a stateless feature has none)', () => {
  const r = checkSpec(spec({ testes: '- AC-01 · WHEN a THEN b (origem: D1)\n\n| INV-09 | prazo nunca negativo | limit | app-pure | - |' }));
  assert.deepEqual(codes(r.errors), ['inv-outside-dados']);
});

const MIGRATION = (volume) => [
  '**Mecanismo:** lotes de 1.000 por `id > último`, uma transação por lote.',
  `**Volume e orçamento:** ${volume}`,
  '**Critério de fim:** `SELECT count(*) …` = 0.',
  '**Legado que viola:** linhas incompletas vão para o log.',
].join('\n');

test('error: a volume label without a measured number (the values measured in the AI-DLC comparison)', () => {
  const unasked = [
    'o número de clientes não foi informado (suposição: cabe numa só instrução); se passar de ~1 milhão de linhas, reavaliar.',
    'volume de clientes não informado (premissa: cabe em minutos); sem lock de tabela.',
    'volume de clientes desconhecido (premissa: cabe num só statement); sem lock de tabela.',
    'número de clientes não medido (suposição: até centenas de milhares); medir com `SELECT count(*)` antes.',
    'volume de clientes não informado; padrão de lotes de 10.000, sem lock de tabela.',
    'sem lock de tabela.',
  ];
  for (const v of unasked) {
    assert.deepEqual(codes(checkSpec(spec({ dados: MIGRATION(v) })).errors), ['migration-volume-unasked'], v);
  }
  const asked = [
    '1,2 milhão de clientes, cerca de 120 lotes; estimativa de poucos minutos (a medir em staging).',
    '1,2 milhão de clientes (confirmado pelo usuário), cerca de 1.200 lotes de 1.000; sem lock de tabela.',
    '80 mil matrículas; até 20 min; sem lock de tabela.',
    'não medido (fato do usuário (Dados e Consistência)); o custo independe do volume.',
  ];
  for (const v of asked) assert.equal(checkSpec(spec({ dados: MIGRATION(v) })).valid, true, v);
});

test('error: a db or app+lock invariant, or a migration, without a Banco de teste line', () => {
  const inv = checkSpec(spec({ bancoTeste: '' }));
  assert.deepEqual(codes(inv.errors), ['test-db-missing']);
  assert.deepEqual(inv.errors[0].needs, ['INV-01', 'INV-02']);

  const migration = checkSpec(spec({ bancoTeste: '', dados: MIGRATION('80 mil linhas.') }));
  assert.deepEqual(codes(migration.errors), ['test-db-missing']);
  assert.match(migration.errors[0].message, /the migration/);
});

test('no Banco de teste is asked of a feature whose invariants the application guarantees and that migrates nothing', () => {
  const appOnly = '| ID | E | C | G | R |\n|---|---|---|---|---|\n| INV-01 | Prazo nunca negativo | limit | app-pure | - |\n| INV-02 | No máximo 5 | limit | app | - |';
  assert.equal(checkSpec(spec({ bancoTeste: '', dados: appOnly })).valid, true);
  assert.equal(checkSpec(spec({ bancoTeste: '', dados: 'Nada persiste.' })).valid, true);
});

test('Banco de teste is sourced by the user fact or by a repo file that exists; a file the spec will add is not a source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-db-'));
  try {
    fs.mkdirSync(path.join(root, 'test'));
    fs.writeFileSync(path.join(root, 'docker-compose.test.yml'), 'services: {}\n');
    const at = (line) => checkSpec(spec({ bancoTeste: line }), { repoRoot: root });

    assert.equal(at('**Banco de teste:** Postgres do `docker-compose.test.yml`, URL em `TEST_DATABASE_URL`.').valid, true);
    assert.equal(at('**Banco de teste:** nenhum; conferência manual (fato do usuário (Testes)).').valid, true);

    const planned = at('**Banco de teste:** Postgres real em `test/addresses.int.spec.ts`, URL em `TEST_DATABASE_URL`.');
    assert.deepEqual(codes(planned.errors), ['test-db-unsourced']);
    assert.deepEqual(planned.errors[0].paths, ['test/addresses.int.spec.ts']);

    assert.deepEqual(codes(at('**Banco de teste:** Postgres, URL em `TEST_DATABASE_URL`.').errors), ['test-db-unsourced']);
    assert.deepEqual(codes(at('**Banco de teste:**').errors), ['test-db-missing']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // Outside git the path cannot be checked: its form is accepted.
  assert.equal(checkSpec(spec({ bancoTeste: '**Banco de teste:** o de `test/setup-db.ts`.' })).valid, true);
});

test('CLI: a Banco de teste path is checked against the repository that holds the spec', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-cli-db-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const file = path.join(root, 'spec.md');
    fs.writeFileSync(file, spec({ bancoTeste: '**Banco de teste:** o de `test/db.ts`.' }));
    const missing = JSON.parse(execFileSync('node', [SCRIPT, file], { encoding: 'utf8' }));
    assert.deepEqual(codes(missing.errors), ['test-db-unsourced']);
    fs.mkdirSync(path.join(root, 'test'));
    fs.writeFileSync(path.join(root, 'test', 'db.ts'), '');
    assert.equal(JSON.parse(execFileSync('node', [SCRIPT, file], { encoding: 'utf8' })).valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('error: a high risk whose mitigation the plan cannot carry; an AC/INV, a human action or the user accepting it traces it', () => {
  const riscos = (mitigation, score = '9 🔴') => [
    '## Riscos',
    '| Risco | Onde | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |',
    '|---|---|---|---|---|---|',
    `| Gerador de PDF cai na virada do semestre | emissão | 3 | 3 | ${score} | ${mitigation} |`,
    '',
  ].join('\n');
  const at = (m, score) => checkSpec(spec({ extra: riscos(m, score) }));
  assert.deepEqual(codes(at('Fila com retentativa e alerta').errors), ['risk-untraced']);
  assert.deepEqual(codes(at('Fila com retentativa e alerta', '6').errors), ['risk-untraced']);
  assert.equal(at('Fila com retentativa e alerta', '4 🟡').valid, true);
  assert.equal(at('Fila com retentativa (AC-02)').valid, true);
  assert.equal(at('Restrição do banco (INV-01)').valid, true);
  assert.equal(at('Contrato de SLA com o fornecedor (ação humana · Compras · antes do semestre)').valid, true);
  assert.equal(at('Nenhuma; aceito pelo usuário').valid, true);
});

const CONTRACT = [
  '**Contrato:**',
  '',
  '| Operação | Entrada | Saída | Erros |',
  '|---|---|---|---|',
  '| `POST /enrollments/:id/certificate` | — | `202 {requestId}` | `ENROLLMENT_NOT_DONE` → 409; `ENROLLMENT_NOT_FOUND` → 404 |',
].join('\n');

test('error: a route named in the spec with no contract table; the `nenhuma operação` escape silences it', () => {
  const extra = '## Arquitetura e Fluxo\nO aluno chama `POST /enrollments/:id/certificate`.\n\n';
  const without = checkSpec(spec({ extra }));
  assert.deepEqual(codes(without.errors), ['contract-missing']);
  assert.deepEqual(without.errors[0].routes, ['POST /enrollments/:id/certificate']);
  assert.equal(checkSpec(spec({ extra, fronteiras: CONTRACT })).valid, true);
  const escaped = checkSpec(spec({ extra, fronteiras: '**Contrato:** nenhuma operação nova ou alterada (só lê a rota existente).' }));
  assert.equal(escaped.valid, true);
});

test('error: a contract row without a success status or with an unmapped error', () => {
  const noStatus = CONTRACT.replace('`202 {requestId}`', '`{requestId}`');
  assert.deepEqual(codes(checkSpec(spec({ fronteiras: noStatus })).errors), ['contract-row-incomplete']);
  const unmapped = CONTRACT.replace('`ENROLLMENT_NOT_FOUND` → 404', '`ENROLLMENT_NOT_FOUND`');
  const res = checkSpec(spec({ fronteiras: unmapped }));
  assert.deepEqual(codes(res.errors), ['contract-row-incomplete']);
  assert.match(res.errors[0].message, /ENROLLMENT_NOT_FOUND/);
  const short = '| Operação | Saída |\n|---|---|\n| `GET /certificates/:code` | 200 |';
  assert.deepEqual(codes(checkSpec(spec({ fronteiras: short })).errors), ['contract-row-incomplete']);
  const none = CONTRACT.replace(/`ENROLLMENT_NOT_DONE`.*\|$/m, 'nenhum novo |');
  assert.equal(checkSpec(spec({ fronteiras: none })).valid, true);
});

test('warning: a route outside the contract table once the table exists; same route in another spelling is matched', () => {
  const extra = '## Arquitetura e Fluxo\n`POST /enrollments/{id}/certificate` grava o pedido; `GET /certificates/:code` segue igual.\n\n';
  const res = checkSpec(spec({ extra, fronteiras: CONTRACT }));
  assert.equal(res.valid, true);
  const outside = res.warnings.filter((w) => w.code === 'route-outside-contract');
  assert.equal(outside.length, 1);
  assert.deepEqual(outside[0].routes, ['GET /certificates/:code']);
});

test('error: a db invariant no model row cites, and a new table with no model block', () => {
  const dados = (model) => [
    '| ID | Enunciado | Categoria | Garantidor | Rede |',
    '|---|---|---|---|---|',
    '| INV-01 | Um certificado por matrícula | unique | db | - |',
    '',
    'Criamos uma tabela nova `certificates`.',
    model,
  ].join('\n');
  const res = checkSpec(spec({ dados: dados('') }));
  assert.deepEqual(codes(res.errors).sort(), ['data-model-missing', 'inv-db-unmodeled']);
  const uncited = '**Modelo:**\n\n| Coluna | Tipo | Nulo | Restrição |\n|---|---|---|---|\n| `enrollment_id` | uuid | não | UNIQUE |';
  assert.deepEqual(codes(checkSpec(spec({ dados: dados(uncited) })).errors), ['inv-db-unmodeled']);
  assert.equal(checkSpec(spec({ dados: dados(uncited.replace('UNIQUE |', 'UNIQUE · INV-01 |')) })).valid, true);
});

test('a negated new-table line does not ask for a model', () => {
  const dados = '**Fonte de verdade:** `orders`, sem tabela nova; o prazo é calculado na leitura.';
  const res = checkSpec(spec({ dados, bancoTeste: '' }));
  assert.deepEqual(codes(res.errors), []);
});

test('warning: a Riscos table with only low risks nobody carries; one medium risk or a traced mitigation silences it', () => {
  const table = (rows) => `## Riscos\n\n| Risco | Score | Mitigação |\n|---|---|---|\n${rows}\n\n`;
  const low = checkSpec(spec({ extra: table('| UF minúscula cai no padrão | 2 🟢 | igual ao frete |') }));
  assert.deepEqual(low.warnings.filter((w) => w.code === 'risks-all-low').length, 1);
  for (const row of ['| UF minúscula | 4 🟡 | revisar |', '| UF minúscula | 2 🟢 | teste AC-01 |']) {
    assert.ok(!checkSpec(spec({ extra: table(row) })).warnings.some((w) => w.code === 'risks-all-low'), row);
  }
});
