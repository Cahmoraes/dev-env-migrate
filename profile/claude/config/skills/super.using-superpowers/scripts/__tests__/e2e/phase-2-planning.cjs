'use strict';
// FASE 2 — Planejamento: init-feature-dir -> spec/PRD -> find-feature-files ->
// validate-tasks (index/full/--prd/--mockups) -> generate-slugs.
// Juncao alvo: artefato escrito no formato do TEMPLATE passa no VALIDADOR da skill seguinte.
const { run, sh, write, read, exists, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const DR = 'super.deep-research/scripts';
const WP = 'super.writing-plans/scripts';
const US = 'super.user-story-verification/scripts';

setPhase('P2 planejamento: scaffolding da feature');

check('init-feature-dir cria APENAS research/ (escopo da propria skill)', () => {
  const r = run(`${DR}/init-feature-dir.cjs`, ['--slug', A.FEATURE, '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.slug, A.FEATURE, 'slug');
  eq(r.json.created, true, 'created');
  assert(exists(`${A.DIR}/research`), 'research/ ausente');
  // Fronteira deliberada: specs/prd/plans sao criados pela skill que os escreve.
  for (const sub of ['specs', 'prd', 'plans']) {
    assert(!exists(`${A.DIR}/${sub}`), `${sub}/ nao deveria ser criado pelo deep-research`);
  }
  return r.json.path.replace(ROOT, '.');
});

check('init-feature-dir e idempotente (re-entrada de sessao)', () => {
  const r = run(`${DR}/init-feature-dir.cjs`, ['--slug', A.FEATURE, '--repo-root', ROOT]);
  eq(r.json.alreadyExisted, true, 'alreadyExisted');
  eq(r.json.created, false, 'created deve ser false na 2a vez');
  return 're-entrada segura';
});

// Materializa os artefatos nos caminhos que o pipeline espera. Precisa ser um check()
// e nao top-level: os dois checks acima afirmam que specs/prd/plans AINDA nao existem.
check('setup: spec, PRD e plano materializados', () => {
  write(`${A.DIR}/specs/${A.FEATURE}-design.md`, A.spec);
  write(`${A.DIR}/prd/prd-${A.FEATURE}.md`, A.prd);
  write(`${A.DIR}/plans/tasks-${A.FEATURE}.md`, A.tasksIndex);
  for (const t of A.TASKS) {
    write(`${A.DIR}/plans/task-0${t.n}.md`, A.taskFile(t));
  }
  return `${A.TASKS.length} tasks + spec + prd`;
});

setPhase('P2 planejamento: descoberta de artefatos');

check('find-feature-files localiza spec, PRD e plano pelo slug', () => {
  const r = run(`${WP}/find-feature-files.cjs`, ['--feature-name', A.FEATURE, '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  const blob = JSON.stringify(r.json);
  assert(blob.includes(`${A.FEATURE}-design.md`), 'spec nao encontrada');
  assert(blob.includes(`prd-${A.FEATURE}.md`), 'PRD nao encontrado');
  assert(blob.includes(`tasks-${A.FEATURE}.md`), 'indice de tasks nao encontrado');
  return 'tres artefatos localizados';
});

setPhase('P2 planejamento: validate-tasks');

const idx = path.join(ROOT, `${A.DIR}/plans/tasks-${A.FEATURE}.md`);
const prdPath = path.join(ROOT, `${A.DIR}/prd/prd-${A.FEATURE}.md`);

check('validacao completa do plano gerado pelo template: valid=true', () => {
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx]);
  assert(r.json, `sem JSON: ${r.stderr}\n${r.stdout.slice(0, 300)}`);
  assert(r.json.valid === true, `invalido: ${JSON.stringify(r.json.errors || r.json)}`);
  const rf = r.json.reviewFocus;
  assert(rf && rf.present === true && rf.pinsChecked === true, `Foco de Revisão não lido: ${JSON.stringify(rf)}`);
  assert(rf.lines.length === 2 && rf.unpinned.length === 0 && rf.unknownTasks.length === 0, `Foco de Revisão com forma errada: ${JSON.stringify(rf)}`);
  assert(!r.json.warnings.some((w) => /Foco de Revisão/u.test(w.message)), `aviso inesperado: ${JSON.stringify(r.json.warnings)}`);
  return 'template -> validador: sem drift; Foco de Revisão lido e pinado nas tasks donas';
});

check('exit code e 0 mesmo quando o plano e invalido (veredito mora no JSON)', () => {
  const quebrado = path.join(ROOT, `${A.DIR}/plans/tasks-quebrado.md`);
  fs.writeFileSync(quebrado, A.tasksIndex.replace('→ `task-05.md`', '→ `task-99.md`'));
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', quebrado]);
  eq(r.status, 0, 'exit code DEVE ser 0 (contrato travado)');
  assert(r.json.valid === false, 'deveria ser invalido: task-99.md nao existe');
  fs.unlinkSync(quebrado);
  return `valid=false com exit 0`;
});

check('--prd exige bijecao FR->task (todas as 6 FRs cobertas)', () => {
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--prd', prdPath]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.json.valid === true, `invalido com --prd: ${JSON.stringify(r.json.errors)}`);
  return 'FR-001..FR-006 rastreadas';
});

check('--prd pega FR orfa (regressao do gate de cobertura)', () => {
  const prd7 = path.join(ROOT, `${A.DIR}/prd/prd-com-fr-orfa.md`);
  fs.writeFileSync(prd7, A.prd.replace('## Experiência do Usuário',
    '- **FR-007**: expõe um hook de invalidação manual por prefixo de chave.\n\n## Experiência do Usuário'));
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--prd', prd7]);
  assert(r.json.valid === false, 'FR-007 sem task deveria invalidar');
  assert(JSON.stringify(r.json).includes('FR-007'), 'o erro deve NOMEAR a FR orfa');
  fs.unlinkSync(prd7);
  return 'FR-007 orfa detectada e nomeada';
});

check('--index-only nao exige corpo das tasks', () => {
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--index-only']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.json.valid === true, `index-only invalido: ${JSON.stringify(r.json.errors)}`);
  return 'modo leve ok';
});

setPhase('P2 planejamento: grafo de dependencias');

check('parse-plan aceita o grafo do plano do template sem erro', () => {
  const r = run(`${WP}/parse-plan.cjs`, ['--tasks-index', idx]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.errors, [], 'grafo do template e valido');
  assert(!('waves' in r.json) && !('executionRecommendation' in r.json), 'nenhuma maquinaria de ondas na saida');
  return `${r.json.tasks.length} tasks, grafo valido`;
});

check('Consome de uma task POSTERIOR e ERRO, nao warning', () => {
  // A ordem do indice e a ordem de execucao: task-02 nao pode consumir a task-03.
  const dir = `${A.DIR}/plans-conflito`;
  write(`${dir}/tasks-conflito.md`, A.tasksIndex);
  for (const t of A.TASKS) write(`${dir}/task-0${t.n}.md`, A.taskFile(t));
  write(`${dir}/task-02.md`, A.taskFile({ ...A.TASKS[1], consumes: '`LruCache` (task-03)' }));
  const r = run(`${WP}/parse-plan.cjs`, ['--tasks-index', path.join(ROOT, `${dir}/tasks-conflito.md`)]);
  assert(r.json.errors.some(e => /Task 2 \*\*Consome:\*\* cites task 3, which comes later/.test(e.message)),
    `esperava erro de dependencia adiante: ${JSON.stringify(r.json.errors)}`);
  return 'forward dependency detectada';
});

setPhase('P2 planejamento: briefing transiente');

check('pre-despacho: indice + briefing do controller liberam o writer; briefing sem runner por arquivo o segura', () => {
  const briefing = path.join(ROOT, `${A.DIR}/plans/task-writer-briefing.md`);
  fs.writeFileSync(briefing, A.taskWriterBriefing);
  const ok = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--index-only']);
  assert(ok.json.valid === true, `briefing do fixture deveria liberar: ${JSON.stringify(ok.json.errors)}`);
  eq(ok.json.briefingRunner.commands, ['npx vitest run <arquivo>'], 'runner lido da secao');
  fs.writeFileSync(briefing, A.taskWriterBriefing.replace('`npx vitest run <arquivo>`', '`npx vitest run`'));
  const suite = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--index-only']);
  assert(suite.json.valid === false && suite.json.errors.some(e => /no per-file target/.test(e.message)), 'comando de suite inteira deveria segurar o writer');
  fs.writeFileSync(briefing, A.taskWriterBriefing.replace('## Runner de testes', '## Comandos'));
  const sem = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--index-only']);
  assert(sem.json.valid === false && sem.json.errors.some(e => /has no `## Runner de testes` section/.test(e.message)), 'briefing sem a secao deveria segurar o writer');
  fs.unlinkSync(briefing);
  return 'runner por arquivo exigido antes do despacho';
});

check('validacao full e limpa remove o task-writer-briefing.md', () => {
  const briefing = path.join(ROOT, `${A.DIR}/plans/task-writer-briefing.md`);
  fs.writeFileSync(briefing, '# briefing transiente\n');
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx]);
  assert(r.json.valid === true, 'plano deveria estar valido');
  assert(!fs.existsSync(briefing), 'briefing deveria ter sido removido apos validacao limpa');
  assert(r.json.briefingCleanup && r.json.briefingCleanup.removed === true, 'briefingCleanup nao reportado');
  return 'cleanup no unico momento deterministico';
});

check('validacao COM ERRO preserva o briefing (writer precisa dele de volta)', () => {
  const briefing = path.join(ROOT, `${A.DIR}/plans/task-writer-briefing.md`);
  fs.writeFileSync(briefing, '# briefing transiente\n');
  const quebrado = path.join(ROOT, `${A.DIR}/plans/tasks-erro.md`);
  fs.writeFileSync(quebrado, A.tasksIndex.replace('→ `task-05.md`', '→ `task-99.md`'));
  const r = run(`${WP}/validate-tasks.cjs`, ['--tasks-index', quebrado]);
  assert(r.json.valid === false, 'deveria ser invalido');
  assert(fs.existsSync(briefing), 'briefing NAO deveria ser removido numa run falha');
  fs.unlinkSync(quebrado); fs.unlinkSync(briefing);
  return 'run falha mantem o handoff';
});

check('--index-only nunca remove o briefing', () => {
  const briefing = path.join(ROOT, `${A.DIR}/plans/task-writer-briefing.md`);
  fs.writeFileSync(briefing, '# briefing\n');
  run(`${WP}/validate-tasks.cjs`, ['--tasks-index', idx, '--index-only']);
  assert(fs.existsSync(briefing), 'index-only nao estabelece validade por-arquivo');
  fs.unlinkSync(briefing);
  return 'preservado';
});

setPhase('P2 planejamento: PRD -> QA (generate-slugs)');

check('generate-slugs extrai as 3 user stories do PRD gerado', () => {
  const r = run(`${US}/generate-slugs.cjs`, ['--prd', prdPath]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.found, true, 'found');
  eq(r.json.count, 3, 'quantidade de user stories');
  const ids = r.json.userStories.map(u => u.id);
  eq(ids, ['US-01', 'US-02', 'US-03'], 'ids');
  for (const u of r.json.userStories) {
    assert(u.slug && u.slug.length > 0, `slug vazio em ${u.id}`);
    assert(u.role && u.want && u.benefit, `story ${u.id} nao decomposta: ${JSON.stringify(u)}`);
  }
  return `3 stories, slugs: ${r.json.userStories.map(u => u.slug).join(', ')}`;
});

// A juncao acima usa o PRD que ESTE harness escreveu. A que segue usa o TEMPLATE REAL da
// skill que ensina a escrever PRD — o elo que ninguem verificava. `prd-template.md` diz
// literalmente "use this exact line shape so generate-slugs.cjs can extract and trace each
// story", e generate-slugs vive noutra skill: editar o template quebra o QA gate a duas
// skills de distancia, em silencio (o gate nao falha, so deixa de achar story nenhuma).
check('o TEMPLATE de PRD do generating-prd e parseavel pelo generate-slugs da QA', () => {
  const tpl = fs.readFileSync(path.join(require('./harness.cjs').SKILLS,
    'super.generating-prd/references/prd-template.md'), 'utf8');
  const bloco = tpl.match(/```markdown\n([\s\S]*?)\n```/);
  assert(bloco, 'o template perdeu o bloco markdown de exemplo');
  const alvo = path.join(ROOT, `${A.DIR}/prd/prd-do-template.md`);
  fs.writeFileSync(alvo, bloco[1]);

  const r = run(`${US}/generate-slugs.cjs`, ['--prd', alvo]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.found, true, 'found');
  eq(r.json.userStories.map(u => u.id), ['US-01', 'US-02'], 'ids extraidos do template');
  for (const u of r.json.userStories) {
    assert(u.role && u.want, `o template gera story sem papel/acao: ${JSON.stringify(u)}`);
    assert(u.slug && u.slug.length > 0, `slug vazio em ${u.id}`);
  }
  // O outro token que o template define e que um script de OUTRA skill exige.
  assert(/FR-001/.test(bloco[1]), 'o template perdeu a numeracao FR-NNN que validate-tasks --prd exige');
  fs.unlinkSync(alvo);
  return `${r.json.count} stories extraidas direto do template`;
});

check('PRD sem user stories degrada graciosamente (QA pula, nao quebra)', () => {
  const semUS = path.join(ROOT, `${A.DIR}/prd/prd-sem-us.md`);
  fs.writeFileSync(semUS, '# PRD: X\n\n## Funcionalidades Principais\n\n- **FR-001**: algo.\n');
  const r = run(`${US}/generate-slugs.cjs`, ['--prd', semUS]);
  eq(r.status, 0, 'exit code');
  eq(r.json.count, 0, 'count');
  fs.unlinkSync(semUS);
  return 'degradacao graciosa';
});

report();
