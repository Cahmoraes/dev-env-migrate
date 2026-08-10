'use strict';
// FASE 4 — Gates de verificação: independent-verification (relatorio + sensor de
// discriminacao), run-mutation real, QA (user-story-verification) e reviewing-specs.
// Juncao alvo: relatorio escrito no TEMPLATE da skill passa no GATE da mesma skill.
const { run, sh, write, read, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const IV = 'super.independent-verification/scripts';
const USV = 'super.user-story-verification/scripts';
const RS = 'super.reviewing-specs/scripts';

const qaDir = path.join(ROOT, `${A.DIR}/qa`);
check('setup: diretorio de QA', () => {
  fs.mkdirSync(qaDir, { recursive: true });
  return qaDir.replace(ROOT, '.');
});
const specPath = path.join(ROOT, `${A.DIR}/specs/${A.FEATURE}-design.md`);
const prdPath = path.join(ROOT, `${A.DIR}/prd/prd-${A.FEATURE}.md`);

// Relatorio preenchido a partir do template real da skill.
function relatorio(opts = {}) {
  const {
    verifier = 'INDEPENDENT',
    sensorRows = [
      ['1', '`src/cache/node-list.ts:31`', '`prev.next = node` → `prev.next = null`', '✅ Killed'],
      ['2', '`src/cache/clock.ts:7`', '`now()` → `0`', '✅ Killed'],
      ['3', '`src/cache/lru-cache.ts:44`', '`size > maxSize` → `size >= maxSize`', '✅ Killed'],
      ['4', '`src/cache/lru-cache.ts:58`', '`expiresAt <= now` → `expiresAt < now`', '✅ Killed'],
      ['5', '`src/cache/lru-cache.ts:71`', '`delete` → no-op', '✅ Killed'],
      ['6', '`src/cache/stats.ts:12`', '`evictions++` → no-op', '✅ Killed'],
    ],
    equivalentes = '',
    acRows = [
      ['AC-01 WHEN set sem ttlMs THEN usa o TTL default [FR-001]', 'ttl = defaultTtlMs', '`src/cache/__tests__/lru-cache.set.test.ts:14` - `expect(entry.ttl).toBe(1000)`', '✅ PASS'],
      ['AC-02 WHEN get de chave expirada THEN retorna undefined e remove [FR-002]', 'undefined + entrada removida', '`src/cache/__tests__/lru-cache.get.test.ts:22` - `expect(c.get("a")).toBeUndefined()`', '✅ PASS'],
      ['AC-03 WHEN insere alem de maxSize THEN despeja a LRU corrente [FR-003]', 'chave menos usada sai', '`src/cache/__tests__/node-list.test.ts:33` - `expect(c.get("a")).toBeUndefined()`', '✅ PASS'],
      ['AC-04 WHEN delete de chave ausente THEN retorna false [FR-004]', 'false', '`src/cache/__tests__/lru-cache.stats.test.ts:9` - `expect(c.delete("z")).toBe(false)`', '✅ PASS'],
      ['AC-05 WHEN sequencia mista THEN stats distingue eviction de expiration [FR-005]', 'evictions=1, expirations=1', '`src/cache/__tests__/lru-cache.stats.test.ts:41` - `expect(s.evictions).toBe(1)`', '✅ PASS'],
      ['AC-06 WHEN relogio injetado avanca THEN TTL expira sem setTimeout [FR-006]', 'expira com clock fake', '`src/cache/__tests__/clock.test.ts:18` - `expect(c.get("a")).toBeUndefined()`', '✅ PASS'],
    ],
    sensorDepth = '6 mutations across 4 logic files — src/cache/node-list.ts: 1/3 branches, src/cache/clock.ts: 1/1 branches, src/cache/lru-cache.ts: 3/9 branches, src/cache/stats.ts: 1/3 branches',
    veredito = '**PASS ✅** - Os seis criterios ancorados na spec tem asserção localizada e as seis mutações morreram.',
  } = opts;

  const tabela = rows => rows.map(r => `| ${r.join(' | ')} |`).join('\n');

  return `# Cache LRU com TTL - Independent Validation

**Date**: 2026-07-27
**Spec**: docs/superpowers/${A.FEATURE}/specs/${A.FEATURE}-design.md
**PRD**: docs/superpowers/${A.FEATURE}/prd/prd-${A.FEATURE}.md
**Diff range**: a1b2c3d4e5f6a7b8..f6e5d4c3b2a1f0e9
**Verifier**: ${verifier}
**Sensor depth**: ${sensorDepth}

---

## Gate Check

- **Command**: npx vitest run
- **Result**: 24 passed, 0 failed, 0 skipped - exit 0
- **Baseline**: reused from a barreira de integracao da wave 3 @ 754a11d0011223344556677889900aabbccddee
- **Typecheck/build**: tsc --noEmit limpo

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | \`file:line\` + assertion expression | Result |
| --- | --- | --- | --- |
${tabela(acRows)}

**Coverage**: ${acRows.length}/${acRows.length} criteria PASS · 0 gaps · 0 spec-precision gaps

---

## Discrimination Sensor

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
${tabela(sensorRows)}

**Depth**: P0-full (≥5 ou ferramenta dedicada)
**Result**: ${sensorRows.length}/${sensorRows.length} killed - PASS ✅

Post-sensor tree state: \`git status --porcelain\` empty, \`git diff --stat\` empty.
${equivalentes}
---

## Verdict

${veredito}

**Lessons recorded**: none (clean PASS)
`;
}

function checaRelatorio(conteudo, extraArgs = []) {
  const p = path.join(qaDir, 'validation-tmp.md');
  fs.writeFileSync(p, conteudo);
  const r = run(`${IV}/check-verification-report.cjs`, ['--report', p, ...extraArgs]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  return r;
}

setPhase('P4 IV: relatorio do template passa no gate');

check('relatorio preenchido a partir do template real e valido', () => {
  const r = checaRelatorio(relatorio());
  assert(r.json.valid === true, `invalido: ${JSON.stringify(r.json.errors)}`);
  eq(r.status, 0, 'exit code');
  return 'template -> gate: sem drift';
});

check('cross-check com o PRD exige TODA FR na tabela de AC', () => {
  const r = checaRelatorio(relatorio(), ['--spec', prdPath]);
  assert(r.json.valid === true, `FR-001..006 estao na tabela: ${JSON.stringify(r.json.errors)}`);
  // remove a FR-005 da tabela: o gate tem que acusar
  const semFr5 = relatorio({
    acRows: [
      ['AC-01 [FR-001]', 'x', '`a.test.ts:1` - `expect(1).toBe(1)`', '✅ PASS'],
      ['AC-02 [FR-002]', 'x', '`a.test.ts:2` - `expect(1).toBe(1)`', '✅ PASS'],
      ['AC-03 [FR-003]', 'x', '`a.test.ts:3` - `expect(1).toBe(1)`', '✅ PASS'],
      ['AC-04 [FR-004]', 'x', '`a.test.ts:4` - `expect(1).toBe(1)`', '✅ PASS'],
      ['AC-06 [FR-006]', 'x', '`a.test.ts:6` - `expect(1).toBe(1)`', '✅ PASS'],
    ],
  });
  const r2 = checaRelatorio(semFr5, ['--spec', prdPath]);
  assert(r2.json.valid === false, 'FR-005 ausente deveria invalidar');
  assert(JSON.stringify(r2.json.errors).includes('FR-005'), `erro deve nomear a FR: ${JSON.stringify(r2.json.errors)}`);
  return 'cobertura FR ancorada';
});

check('placeholder do template deixado para tras invalida', () => {
  const r = checaRelatorio(relatorio().replace('`src/cache/clock.ts:7`', '`<src/path/to.ts:N>`'));
  assert(r.json.valid === false, 'placeholder deveria invalidar');
  return 'relatorio meia-boca barrado';
});

check('tabela de sensor vazia invalida (evidencia estrutural ausente)', () => {
  const vazio = relatorio().replace(/\| 1 \|[\s\S]*?\| 6 \|[^\n]*\n/, '');
  const r = checaRelatorio(vazio);
  assert(r.json.valid === false, 'sensor sem linhas deveria invalidar');
  return 'sensor obrigatorio';
});

setPhase('P4 IV: sobrevivente e mutante equivalente (escape hatch)');

check('sobrevivente NU (sem bloco EQ) reprova o gate', () => {
  const rows = [
    ['1', '`src/cache/node-list.ts:31`', '`prev.next = node` → `null`', '✅ Killed'],
    ['2', '`src/cache/clock.ts:7`', '`now()` → `0`', '✅ Killed'],
    ['3', '`src/cache/lru-cache.ts:44`', '`>` → `>=`', '❌ Survived'],
    ['4', '`src/cache/lru-cache.ts:58`', '`<=` → `<`', '✅ Killed'],
    ['5', '`src/cache/lru-cache.ts:71`', '`delete` → no-op', '✅ Killed'],
    ['6', '`src/cache/stats.ts:12`', '`evictions++` → no-op', '✅ Killed'],
  ];
  const r = checaRelatorio(relatorio({ sensorRows: rows }));
  assert(r.json.valid === false, 'sobrevivente nu deveria reprovar');
  return 'teste cego denunciado';
});

check('mutante EQUIVALENTE com bloco de prova e aceito (escape hatch)', () => {
  const rows = [
    ['1', '`src/cache/node-list.ts:31`', '`prev.next = node` → `null`', '✅ Killed'],
    ['2', '`src/cache/clock.ts:7`', '`now()` → `0`', '✅ Killed'],
    ['3', '`src/cache/lru-cache.ts:44`', '`size > maxSize` → `size >= maxSize`', '⚠️ Equivalent'],
    ['4', '`src/cache/lru-cache.ts:58`', '`<=` → `<`', '✅ Killed'],
    ['5', '`src/cache/lru-cache.ts:71`', '`delete` → no-op', '✅ Killed'],
    ['6', '`src/cache/stats.ts:12`', '`evictions++` → no-op', '✅ Killed'],
  ];
  const eq2 = `
---

## Equivalent Mutants

### EQ-01 - src/cache/lru-cache.ts:44
- **Mutation**: \`size > maxSize\` → \`size >= maxSize\`
- **Invariant**: o despejo roda ANTES da insercao, entao size nunca excede maxSize no ponto do teste; os dois operadores concordam em todo estado alcancavel.
- **Attempted**: teste que insere maxSize+1 chaves e afirma size === maxSize passa identico nos dois lados.
`;
  const r = checaRelatorio(relatorio({ sensorRows: rows, equivalentes: eq2,
    veredito: '**PASS ✅** - 5 killed, 1 equivalent (documentado).' }));
  assert(r.json.valid === true, `equivalente documentado deveria passar: ${JSON.stringify(r.json.errors)}`);
  return 'escape hatch exige prova, nao alegacao';
});

check('bloco EQ com campo vazio nao vale como prova', () => {
  const rows = [
    ['1', '`src/cache/node-list.ts:31`', '`a` → `b`', '✅ Killed'],
    ['2', '`src/cache/clock.ts:7`', '`now()` → `0`', '✅ Killed'],
    ['3', '`src/cache/lru-cache.ts:44`', '`>` → `>=`', '⚠️ Equivalent'],
    ['4', '`src/cache/lru-cache.ts:58`', '`<=` → `<`', '✅ Killed'],
    ['5', '`src/cache/lru-cache.ts:71`', '`delete` → no-op', '✅ Killed'],
    ['6', '`src/cache/stats.ts:12`', '`evictions++` → no-op', '✅ Killed'],
  ];
  const eqVazio = `
---

## Equivalent Mutants

### EQ-01 - src/cache/lru-cache.ts:44
- **Mutation**: \`>\` → \`>=\`
- **Invariant**: <the traced proof that no reachable input can make this mutant observable>
- **Attempted**:
`;
  const r = checaRelatorio(relatorio({ sensorRows: rows, equivalentes: eqVazio }));
  assert(r.json.valid === false, 'prova vazia deveria reprovar');
  return 'campo em branco nao passa';
});

setPhase('P4 IV: profundidade proporcional por arquivo');

check('arquivo com muitos branches exige mais mutacoes (densidade por arquivo)', () => {
  // lru-cache.ts com 12 branches exige ceil(12/3)=4 mutacoes; o relatorio declara 3.
  const raso = relatorio({
    sensorDepth: '6 mutations across 4 logic files — src/cache/node-list.ts: 1/3 branches, src/cache/clock.ts: 1/1 branches, src/cache/lru-cache.ts: 3/12 branches, src/cache/stats.ts: 1/3 branches',
  });
  const r = checaRelatorio(raso);
  assert(r.json.valid === false, '3 mutacoes para 12 branches deveria reprovar');
  const blob = JSON.stringify(r.json.errors);
  assert(blob.includes('lru-cache.ts'), `erro deve nomear o arquivo raso: ${blob}`);
  return 'sensor raso num arquivo denso e barrado';
});

check('cap de 5 por arquivo: 30 branches nao exigem 10 mutacoes', () => {
  const comCap = relatorio({
    sensorDepth: '9 mutations across 4 logic files — src/cache/node-list.ts: 1/3 branches, src/cache/clock.ts: 1/1 branches, src/cache/lru-cache.ts: 6/30 branches, src/cache/stats.ts: 1/3 branches',
    sensorRows: [
      ['1', '`src/cache/node-list.ts:31`', '`a` → `b`', '✅ Killed'],
      ['2', '`src/cache/clock.ts:7`', '`now()` → `0`', '✅ Killed'],
      ['3', '`src/cache/lru-cache.ts:44`', '`>` → `>=`', '✅ Killed'],
      ['4', '`src/cache/lru-cache.ts:58`', '`<=` → `<`', '✅ Killed'],
      ['5', '`src/cache/lru-cache.ts:71`', '`delete` → no-op', '✅ Killed'],
      ['6', '`src/cache/lru-cache.ts:80`', '`hits++` → no-op', '✅ Killed'],
      ['7', '`src/cache/lru-cache.ts:92`', '`promote` → no-op', '✅ Killed'],
      ['8', '`src/cache/lru-cache.ts:99`', '`return v` → `undefined`', '✅ Killed'],
      ['9', '`src/cache/stats.ts:12`', '`evictions++` → no-op', '✅ Killed'],
    ],
  });
  const r = checaRelatorio(comCap);
  assert(r.json.valid === true, `cap de 5 deveria bastar: ${JSON.stringify(r.json.errors)}`);
  return 'exigencia nao explode em arquivo enorme';
});

check('Verifier SELF-DEGRADED e sinalizado (autor == verificador)', () => {
  const r = checaRelatorio(relatorio({ verifier: 'SELF-DEGRADED' }));
  const blob = JSON.stringify(r.json);
  assert(/degraded/i.test(blob), `degradacao deveria ser registrada: ${blob.slice(0, 250)}`);
  return 'autor != verificador auditado';
});

setPhase('P4 IV: run-mutation de verdade (aplica, testa, restaura)');

check('run-mutation MATA o mutante quando o teste discrimina', () => {
  const src = path.join(ROOT, 'mut/soma.cjs');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, 'function maior(a, b) { return a > b ? a : b; }\nmodule.exports = { maior };\n');
  fs.writeFileSync(path.join(ROOT, 'mut/soma.test.cjs'),
    "const t=require('node:test');const a=require('node:assert');const {maior}=require('./soma.cjs');\n" +
    "t.test('maior', () => { a.equal(maior(3,1),3); a.equal(maior(1,3),3); });\n");
  const antes = fs.readFileSync(src, 'utf8');
  const r = run(`${IV}/run-mutation.cjs`, ['--file', src, '--find', 'a > b', '--replace', 'a < b',
    '--test', `node --test ${path.join(ROOT, 'mut')}/soma.test.cjs`]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.killed, true, 'killed');
  eq(r.json.restored, true, 'restored');
  eq(fs.readFileSync(src, 'utf8'), antes, 'arquivo NAO foi restaurado byte a byte');
  return 'mutante morto e arvore limpa';
});

check('run-mutation acusa SOBREVIVENTE quando o teste e cego', () => {
  const src = path.join(ROOT, 'mut/soma.cjs');
  fs.writeFileSync(path.join(ROOT, 'mut/cego.test.cjs'),
    "const t=require('node:test');const a=require('node:assert');const {maior}=require('./soma.cjs');\n" +
    "t.test('cego', () => { a.equal(typeof maior(3,1), 'number'); });\n");
  const r = run(`${IV}/run-mutation.cjs`, ['--file', src, '--find', 'a > b', '--replace', 'a < b',
    '--test', `node --test ${path.join(ROOT, 'mut')}/cego.test.cjs`]);
  eq(r.json.killed, false, 'killed');
  eq(r.json.restored, true, 'restored mesmo com sobrevivente');
  return 'teste cego exposto';
});

check('mutacao que NAO casa no arquivo e erro, nao falso verde', () => {
  const src = path.join(ROOT, 'mut/soma.cjs');
  const r = run(`${IV}/run-mutation.cjs`, ['--file', src, '--find', 'string_que_nao_existe',
    '--replace', 'x', '--test', 'true']);
  const blob = JSON.stringify(r.json) + r.stderr;
  assert(r.json && (r.json.error || r.json.applied === false) || r.status !== 0,
    `no-op deveria ser erro explicito, veio: ${blob.slice(0, 200)}`);
  return 'mutante no-op nao vira evidencia';
});

setPhase('P4 QA e spec-review');

check('setup-qa-tsconfig materializa os templates de QA', () => {
  const r = run(`${USV}/setup-qa-tsconfig.cjs`, ['--ensure-templates', '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.status, 0, 'exit code');
  assert(Array.isArray(r.json.templates), 'templates ausente');
  return `${r.json.templates.length} templates`;
});

check('resolve-review-targets acha os artefatos da feature pelo slug', () => {
  const r = run(`${RS}/resolve-review-targets.cjs`, ['--feature-name', A.FEATURE,
    '--base-dir', path.join(ROOT, 'docs/superpowers'), '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.featureName, A.FEATURE, 'featureName');
  assert(r.json.spec, 'spec nao resolvida');
  assert(r.json.prd, 'PRD nao resolvido');
  assert(r.json.taskFiles && r.json.taskFiles.length === 5, `esperava 5 task files, veio ${(r.json.taskFiles || []).length}`);
  return `spec+prd+${r.json.taskFiles.length} tasks`;
});

check('build-review-dispatch fixa tier CAPABLE nas 4 lentes', () => {
  const targets = path.join(ROOT, 'targets.json');
  const rt = run(`${RS}/resolve-review-targets.cjs`, ['--feature-name', A.FEATURE,
    '--base-dir', path.join(ROOT, 'docs/superpowers'), '--repo-root', ROOT]);
  fs.writeFileSync(targets, JSON.stringify(rt.json));
  const r = run(`${RS}/build-review-dispatch.cjs`, ['--targets', targets, '--capable-model', 'opus']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.json.agents.length >= 3, `esperava >=3 lentes, veio ${r.json.agents.length}`);
  for (const ag of r.json.agents) {
    eq(ag.tier, 'capable', `lente ${ag.label} deveria ser capable`);
    eq(ag.model, 'opus', `lente ${ag.label} com modelo errado`);
  }
  return `${r.json.agents.length} lentes, todas capable`;
});

check('o dispatch das lentes passa no gate mecanico de dispatch', () => {
  const targets = path.join(ROOT, 'targets.json');
  const r = run(`${RS}/build-review-dispatch.cjs`, ['--targets', targets, '--capable-model', 'opus']);
  const manifesto = path.join(ROOT, 'dispatch-review.json');
  fs.writeFileSync(manifesto, JSON.stringify({
    modelTiers: r.json.modelTiers || { cheap: 'haiku', standard: 'sonnet', capable: 'opus' },
    agents: r.json.agents.map(a => ({ label: a.label, tier: a.tier, model: a.model, goal: a.goal || a.label })),
  }));
  const v = run('super.dispatching-parallel-agents/scripts/validate-dispatch.cjs', ['--dispatch', manifesto]);
  assert(v.json.valid === true, `reviewing-specs monta dispatch invalido: ${JSON.stringify(v.json.errors)}`);
  return 'reuso do gate, sem duplicacao';
});

check('lite-reentry le preferences sem spawn de processo', () => {
  const r = run(`${RS}/lite-reentry.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.found, true, 'found');
  eq(r.json.language, 'pt-BR', 'language vem das preferences');
  eq(r.json.capableModel, 'opus', 'capableModel');
  eq(r.json.caveman.active, true, 'caveman');
  return 'reentrada barata coerente com o bootstrap';
});

report();
