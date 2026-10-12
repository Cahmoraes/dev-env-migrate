'use strict';
// FASE 4 — Gates de verificação: a mutação do TDD (run-mutation real), QA
// (user-story-verification) e reviewing-specs.
// Juncao alvo: o artefato que uma etapa produz e aceito pelo gate da etapa seguinte.
const { run, sh, write, read, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const TDD = 'super.test-driven-development/scripts';
const USV = 'super.user-story-verification/scripts';
const RS = 'super.reviewing-specs/scripts';

const qaDir = path.join(ROOT, `${A.DIR}/qa`);
check('setup: diretorio de QA', () => {
  fs.mkdirSync(qaDir, { recursive: true });
  return qaDir.replace(ROOT, '.');
});
const specPath = path.join(ROOT, `${A.DIR}/specs/${A.FEATURE}-design.md`);
const prdPath = path.join(ROOT, `${A.DIR}/prd/prd-${A.FEATURE}.md`);

setPhase('P4 TDD: run-mutation de verdade (aplica, testa, restaura)');

check('run-mutation MATA o mutante quando o teste discrimina', () => {
  const src = path.join(ROOT, 'mut/soma.cjs');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, 'function maior(a, b) { return a > b ? a : b; }\nmodule.exports = { maior };\n');
  fs.writeFileSync(path.join(ROOT, 'mut/soma.test.cjs'),
    "const t=require('node:test');const a=require('node:assert');const {maior}=require('./soma.cjs');\n" +
    "t.test('maior', () => { a.equal(maior(3,1),3); a.equal(maior(1,3),3); });\n");
  const antes = fs.readFileSync(src, 'utf8');
  const r = run(`${TDD}/run-mutation.cjs`, ['--file', src, '--find', 'a > b', '--replace', 'a < b',
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
  const r = run(`${TDD}/run-mutation.cjs`, ['--file', src, '--find', 'a > b', '--replace', 'a < b',
    '--test', `node --test ${path.join(ROOT, 'mut')}/cego.test.cjs`]);
  eq(r.json.killed, false, 'killed');
  eq(r.json.restored, true, 'restored mesmo com sobrevivente');
  return 'teste cego exposto';
});

check('mutacao que NAO casa no arquivo e erro, nao falso verde', () => {
  const src = path.join(ROOT, 'mut/soma.cjs');
  const r = run(`${TDD}/run-mutation.cjs`, ['--file', src, '--find', 'string_que_nao_existe',
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
  const r = run(`${RS}/build-review-dispatch.cjs`, ['--targets', targets, '--capable-model', 'opus', '--language', 'pt-BR',
    '--prompt-dir', path.join(ROOT, 'dispatch-prompts')]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.json.agents.length >= 3, `esperava >=3 lentes, veio ${r.json.agents.length}`);
  for (const ag of r.json.agents) {
    eq(ag.tier, 'capable', `lente ${ag.label} deveria ser capable`);
    eq(ag.model, 'opus', `lente ${ag.label} com modelo errado`);
  }
  eq(r.json.dispatches.length, r.json.agents.length, 'um despacho por lente');
  for (const d of r.json.dispatches) {
    eq(d.model, 'opus', `${d.label}: despacho sem o modelo capable`);
    assert(d.block === undefined, `${d.label}: bloco renderizado voltou ao stdout`);
    assert(!d.prompt.includes('\n') && d.prompt.includes(d.promptFile), `${d.label}: prompt deve ser um ponteiro de uma linha`);
    const instrucoes = fs.readFileSync(d.promptFile, 'utf8');
    assert(!/\{[A-Z_]+\}/.test(instrucoes), `${d.label}: placeholder sobrando`);
    assert(instrucoes.includes(r.json.agents[0].readFiles[0]), `${d.label}: spec resolvida pelo resolve-review-targets nao chegou ao prompt`);
  }
  return `${r.json.agents.length} lentes, todas capable, prompts em arquivo`;
});

check('resolve-review-targets -> build-review-lead-dispatch: o controller despacha so o lead, e o comando das lentes no prompt do lead roda', () => {
  const targets = path.join(ROOT, 'targets.json');
  const dir = path.join(ROOT, 'lead-prompts');
  const r = run(`${RS}/build-review-lead-dispatch.cjs`, ['--targets', targets, '--capable-model', 'opus', '--language', 'pt-BR', '--prompt-dir', dir]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.dispatches.length, 1, 'um despacho so: o lead');
  eq(r.json.dispatches[0].model, 'opus', 'lead no tier capable');
  const corpo = fs.readFileSync(r.json.dispatches[0].promptFile, 'utf8');
  const cmd = corpo.split('\n').find((l) => /^ {4}node ".*\/build-review-dispatch\.cjs"/.test(l));
  assert(cmd, 'o prompt do lead traz o comando das lentes');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const b = require('node:child_process').spawnSync('bash', ['-c', cmd.trim()], { encoding: 'utf8', env });
  eq(b.status, 0, `comando das lentes falhou: ${b.stderr}`);
  const manifesto = JSON.parse(fs.readFileSync(path.join(dir, 'lens-manifest.json'), 'utf8'));
  eq(manifesto.agents.length, 4, 'as 4 lentes (spec + tasks)');
  assert(manifesto.dispatches.every((d) => d.model === 'opus'), 'o lead repassa o capable a toda lente');
  return 'controller -> lead -> 4 lentes: caminho resolvido';
});

check('o dispatch das lentes passa no gate mecanico de dispatch', () => {
  const targets = path.join(ROOT, 'targets.json');
  const r = run(`${RS}/build-review-dispatch.cjs`, ['--targets', targets, '--capable-model', 'opus', '--language', 'pt-BR',
    '--prompt-dir', path.join(ROOT, 'dispatch-prompts')]);
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
  eq(r.json.capableModel, 'opus', 'capableModel');
  return 'reentrada barata coerente com o bootstrap';
});

check('generate-slugs -> build-qa-dispatch: um bloco por historia, modelo standard', () => {
  const slugs = run(`${USV}/generate-slugs.cjs`, ['--prd', prdPath]);
  assert(slugs.json && Array.isArray(slugs.json.userStories), `sem JSON: ${slugs.stderr}`);
  const arq = path.join(ROOT, 'slugs.json');
  fs.writeFileSync(arq, JSON.stringify(slugs.json));
  const r = run(`${USV}/build-qa-dispatch.cjs`, ['--slugs', arq, '--feature-name', A.FEATURE, '--prd', prdPath,
    '--spec', specPath, '--test-runner', 'npx vitest run <file>', '--browser', 'not available', '--language', 'pt-BR',
    '--repo-root', ROOT, '--prompt-dir', path.join(ROOT, 'dispatch-prompts')]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.dispatches.length, slugs.json.userStories.length, 'um despacho por historia do PRD');
  for (const d of r.json.dispatches) {
    eq(d.model, 'sonnet', `${d.usId}: QA pisa em standard`);
    assert(!d.prompt.includes('\n') && d.prompt.includes(d.promptFile), `${d.usId}: prompt deve ser um ponteiro de uma linha`);
    const instrucoes = fs.readFileSync(d.promptFile, 'utf8');
    assert(!/\{[A-Z_]+\}/.test(instrucoes), `${d.usId}: placeholder sobrando`);
  }
  return `${r.json.dispatches.length} despachos, standard=sonnet`;
});

report();
