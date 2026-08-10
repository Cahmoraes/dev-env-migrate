'use strict';
// FASE 3 — Execução: parse-waves (PRODUZ tier) -> manifesto (APLICA) ->
// validate-dispatch (VERIFICA) -> mark-task-status -> parse-tasks --assert-all-done.
// A cadeia de tres camadas e o invariante central: nenhuma sozinha pega o drift cheap->sonnet.
const { run, sh, write, read, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const PSD = 'super.parallel-subagent-development/scripts';
const PSIT = 'super.parallel-subagent-in-tree/scripts';
const SDD = 'super.subagent-driven-development/scripts';
const DPA = 'super.dispatching-parallel-agents/scripts';
const USP = 'super.using-superpowers/scripts';

const idx = path.join(ROOT, `${A.DIR}/plans/tasks-${A.FEATURE}.md`);
const plansDir = path.join(ROOT, `${A.DIR}/plans`);

setPhase('P3 execucao: parse-waves PRODUZ');

let waves = null;
check('parse-waves deriva as 4 waves do plano do template', () => {
  const r = run(`${PSD}/parse-waves.cjs`, ['--tasks-index', idx]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  waves = r.json;
  eq(r.json.found, true, 'found');
  eq(r.json.waves, [[1, 2], [3], [4], [5]], 'agrupamento das waves');
  eq(r.json.waveKinds, ['parallel', 'sequential', 'sequential', 'sequential'], 'kinds');
  eq(r.json.maxParallelWave, 2, 'maior wave paralela');
  return `${r.json.waveCount} waves, W1=${r.json.waveKinds[0]}`;
});

check('parse-waves emite suggestedTier por task', () => {
  for (const t of waves.tasks) {
    assert(t.suggestedTier, `task ${t.number} sem suggestedTier`);
    assert(Array.isArray(t.tierSignals) && t.tierSignals.length, `task ${t.number} sem justificativa de tier`);
  }
  return waves.tasks.map(t => `${t.number}:${t.suggestedTier}`).join(' ');
});

check('Tier ESCRITO no task file sobrepoe a sugestao computada', () => {
  // task-02 tem **Tier:** cheap escrito a mao; o script deve honrar, nao recomputar.
  const t2 = waves.tasks.find(t => t.number === 2);
  eq(t2.explicitTier, 'cheap', 'explicitTier da task-02');
  eq(t2.suggestedTier, 'cheap', 'sugestao deve HONRAR o escrito');
  assert(t2.tierSignals.some(s => /explicit/i.test(s)), `sinal nao registra a origem: ${t2.tierSignals}`);
  return 'tier escrito e vinculante e rastreado';
});

check('recomendacao de modo vem da FORMA das waves, nunca hardcoded', () => {
  const rec1 = waves.executionRecommendation;
  assert(rec1 && rec1.mode, 'sem executionRecommendation');
  assert(rec1.signals && rec1.signals.length, 'recomendacao sem justificativa');
  // `decisionRequired` = "ha refinamento entre os 2 modos paralelos", NAO "peca consentimento":
  // a obrigacao de perguntar vive na prosa da skill e vale sempre (ver P6).
  eq(rec1.decisionRequired, true, 'plano com wave paralela deixa in-tree vs worktree em aberto');
  assert(rec1.optionNumber !== 1, 'nunca pode recomendar a opcao 1 por reflexo');
  // plano puramente sequencial deve recomendar outro modo
  const soSeq = path.join(plansDir, 'tasks-so-sequencial.md');
  fs.writeFileSync(soSeq, A.tasksIndex
    .replace('- **Wave 1** (parallel): 1, 2', '- **Wave 1** (sequential): 1')
    .replace('- **Wave 2** (sequential): 3', '- **Wave 2** (sequential): 2\n- **Wave 3** (sequential): 3')
    .replace('- **Wave 3** (sequential): 4', '- **Wave 4** (sequential): 4')
    .replace('- **Wave 4** (sequential): 5', '- **Wave 5** (sequential): 5'));
  const r2 = run(`${PSD}/parse-waves.cjs`, ['--tasks-index', soSeq]);
  const rec2 = r2.json.executionRecommendation;
  eq(r2.json.parallelizable, false, 'plano sem wave paralela');
  assert(rec1.mode !== rec2.mode, `recomendacao deveria mudar com a forma: ${rec1.mode} vs ${rec2.mode}`);
  // sem paralelismo nao ha refinamento a fazer: sequencial e estritamente melhor
  eq(rec2.decisionRequired, false, 'cadeia sequencial nao deixa refinamento em aberto');
  eq(rec2.confidence, 'high', 'confianca alta quando so ha um modo sensato');
  fs.unlinkSync(soSeq);
  return `${rec1.mode} (com paralelo) vs ${rec2.mode} (so sequencial)`;
});

setPhase('P3 execucao: manifesto APLICA, validate-dispatch VERIFICA');

// model_tiers do preferences.yml gravado na fase 1
const TIERS = { cheap: 'haiku', standard: 'sonnet', capable: 'opus' };

function manifesto(agents, extra = {}) {
  const p = path.join(ROOT, 'dispatch.json');
  fs.writeFileSync(p, JSON.stringify({ modelTiers: TIERS, ...extra, agents }));
  return p;
}

check('manifesto da Wave 1 montado a partir do tier escrito e valido', () => {
  const p = manifesto([
    { label: 'task-01', tier: 'standard', model: TIERS.standard, goal: 'Estrutura LRU', writeFiles: ['src/cache/node-list.ts'] },
    { label: 'task-02', tier: 'cheap', model: TIERS.cheap, goal: 'Relogio injetavel', writeFiles: ['src/cache/clock.ts'] },
  ]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.json.valid === true, `invalido: ${JSON.stringify(r.json.errors)}`);
  return `${r.json.agentCount} agentes aprovados`;
});

check('drift cheap->sonnet e ERRO (o bug que passou numa run real)', () => {
  const p = manifesto([
    { label: 'task-02', tier: 'cheap', model: 'sonnet', goal: 'Relogio', writeFiles: ['src/cache/clock.ts'] },
  ]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === false, 'tier cheap com modelo standard deveria invalidar');
  assert(JSON.stringify(r.json.errors).includes('tier_model_mismatch'), `codigo errado: ${JSON.stringify(r.json.errors)}`);
  return 'tier_model_mismatch';
});

check('escalada COM motivo rebaixa o mismatch para warning auditavel', () => {
  const p = manifesto([
    { label: 'task-02', tier: 'cheap', model: 'sonnet', goal: 'Relogio',
      escalationReason: 'implementer reportou BLOCKED por falta de raciocinio na 2a rodada',
      writeFiles: ['src/cache/clock.ts'] },
  ]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === true, `escalada com motivo deveria passar: ${JSON.stringify(r.json.errors)}`);
  assert(JSON.stringify(r.json.warnings).includes('tier_escalation'), `sem trilha de auditoria: ${JSON.stringify(r.json.warnings)}`);
  return 'escalada auditada, nao bloqueada';
});

check('model omitido = heranca do controller = ERRO', () => {
  const p = manifesto([
    { label: 'task-01', tier: 'standard', model: '', goal: 'x', writeFiles: ['a.ts'] },
    { label: 'task-02', tier: 'cheap', goal: 'y', writeFiles: ['b.ts'] },
  ]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === false, 'model vazio/ausente deveria invalidar');
  const codes = JSON.stringify(r.json.errors);
  assert(/empty_model|missing_field/.test(codes), `codigos: ${codes}`);
  return 'heranca implicita bloqueada';
});

check('write-conflict entre agentes concorrentes e ERRO', () => {
  const p = manifesto([
    { label: 'task-04', tier: 'standard', model: TIERS.standard, goal: 'get', writeFiles: ['src/cache/lru-cache.ts'] },
    { label: 'task-05', tier: 'standard', model: TIERS.standard, goal: 'stats', writeFiles: ['src/cache/lru-cache.ts'] },
  ]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === false, 'write∩write deveria invalidar');
  assert(JSON.stringify(r.json.errors).includes('write_conflict'), JSON.stringify(r.json.errors));
  return 'write_conflict';
});

check('read/write hazard so dispara quando readFiles e declarado', () => {
  const semRead = manifesto([
    { label: 'a', tier: 'standard', model: TIERS.standard, goal: 'x', writeFiles: ['src/cache/lru-cache.ts'] },
    { label: 'b', tier: 'standard', model: TIERS.standard, goal: 'y', writeFiles: ['src/cache/stats.ts'] },
  ]);
  const semReadR = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', semRead]);
  assert(semReadR.json.valid === true, 'sem readFiles nao deve haver hazard');
  const comRead = manifesto([
    { label: 'a', tier: 'standard', model: TIERS.standard, goal: 'x', writeFiles: ['src/cache/lru-cache.ts'] },
    { label: 'b', tier: 'standard', model: TIERS.standard, goal: 'y', writeFiles: ['src/cache/stats.ts'], readFiles: ['src/cache/lru-cache.ts'] },
  ]);
  const comReadR = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', comRead]);
  const blob = JSON.stringify(comReadR.json);
  assert(/read_write_hazard/.test(blob), `stale-read nao detectado: ${blob.slice(0, 200)}`);
  return 'opt-in por declaracao, sem falso positivo';
});

check('tier=auto/vazio desliga a igualdade (harness escolhe)', () => {
  const p = path.join(ROOT, 'dispatch-auto.json');
  fs.writeFileSync(p, JSON.stringify({
    modelTiers: { cheap: '', standard: 'auto', capable: 'opus' },
    agents: [{ label: 'a', tier: 'standard', model: 'qualquer-modelo', goal: 'x', writeFiles: ['a.ts'] }],
  }));
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === true, `auto nao deveria enforcar igualdade: ${JSON.stringify(r.json.errors)}`);
  return 'auto = sem enforcement';
});

check('single-agent dispara o gate de tier, mas so avisa sobre ser unico', () => {
  const p = manifesto([{ label: 'task-03', tier: 'standard', model: TIERS.standard, goal: 'set', writeFiles: ['src/cache/lru-cache.ts'] }]);
  const r = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', p]);
  assert(r.json.valid === true, `single-agent valido: ${JSON.stringify(r.json.errors)}`);
  const mismatch = manifesto([{ label: 'task-03', tier: 'standard', model: 'haiku', goal: 'set', writeFiles: ['x.ts'] }]);
  const rm = run(`${DPA}/validate-dispatch.cjs`, ['--dispatch', mismatch]);
  assert(rm.json.valid === false, 'single-agent NAO pode escapar do gate de tier');
  return 'gate de tier ativo mesmo com 1 agente';
});

setPhase('P3 execucao: disjuncao in-tree (le o PLANO, nao o manifesto)');

check('check-wave-disjoint aprova a Wave 1 do plano real', () => {
  const r = run(`${PSIT}/check-wave-disjoint.cjs`, ['--tasks-index', idx, '--wave', '1']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.safeForInTreeParallel, true, 'Wave 1 deveria ser segura');
  return 'plano e manifesto concordam (defense-in-depth)';
});

check('check-wave-disjoint pega o conflito que o manifesto nao veria', () => {
  const conf = path.join(ROOT, `${A.DIR}/plans-conflito/tasks-conflito.md`);
  const r = run(`${PSIT}/check-wave-disjoint.cjs`, ['--tasks-index', conf, '--wave', '1']);
  eq(r.json.safeForInTreeParallel, false, 'overlap no plano deveria reprovar');
  const blob = JSON.stringify(r.json) + r.stdout;
  assert(blob.includes('lru-cache.ts'), 'o blocker deve NOMEAR o arquivo');
  return 'gate a montante do dispatch, arquivo nomeado';
});

setPhase('P3 execucao: mark-task-status e fechamento');

check('parse-tasks le as 5 tasks como PENDING', () => {
  const r = run(`${SDD}/parse-tasks.cjs`, ['--tasks-index', idx]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.found, true, 'found');
  eq(r.json.allDone, false, 'allDone');
  eq(r.json.pending.length, 5, 'pendentes');
  eq(r.json.completed.length, 0, 'concluidas');
  // o script cruza checkbox do indice com **Status:** do task file
  for (const t of r.json.pending) {
    eq(t.indexDone, false, `indexDone da task ${t.number}`);
    eq(t.fileStatus, 'PENDING', `fileStatus da task ${t.number}`);
  }
  return '5 tasks pendentes, indice e arquivos concordam';
});

check('--assert-all-done reprova enquanto houver task aberta', () => {
  const r = run(`${SDD}/parse-tasks.cjs`, ['--tasks-index', idx, '--assert-all-done']);
  assert(r.status !== 0, `--assert-all-done deveria falhar com tasks abertas, saiu ${r.status}`);
  return `gate de fechamento ativo (exit ${r.status})`;
});

check('mark-task-status marca o checkbox no indice E o Status no task file', () => {
  const r = run(`${SDD}/mark-task-status.cjs`, [
    '--tasks-index', idx, '--task-number', '1', '--status', 'DONE',
    '--task-file', path.join(plansDir, 'task-01.md'),
  ]);
  const indice = read(`${A.DIR}/plans/tasks-${A.FEATURE}.md`);
  const tf = read(`${A.DIR}/plans/task-01.md`);
  assert(/- \[x\] 1\./i.test(indice), `checkbox nao marcado no indice:\n${indice.split('\n').filter(l => l.startsWith('- [')).join('\n')}`);
  assert(/\*\*Status:\*\*\s*DONE/.test(tf), 'Status do task file nao atualizado');
  return 'dois lados sincronizados';
});

check('marcar as 5 tasks fecha o --assert-all-done', () => {
  for (const n of [2, 3, 4, 5]) {
    run(`${SDD}/mark-task-status.cjs`, ['--tasks-index', idx, '--task-number', String(n),
      '--status', 'DONE', '--task-file', path.join(plansDir, `task-0${n}.md`)]);
  }
  const r = run(`${SDD}/parse-tasks.cjs`, ['--tasks-index', idx, '--assert-all-done']);
  eq(r.json.allDone, true, 'allDone');
  eq(r.json.pending.length, 0, 'pendentes');
  eq(r.json.completed.length, 5, 'concluidas');
  eq(r.status, 0, 'exit code com tudo pronto');
  return 'plano fechado';
});

report();
