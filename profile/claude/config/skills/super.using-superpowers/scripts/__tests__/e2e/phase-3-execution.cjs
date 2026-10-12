'use strict';
// FASE 3 — Execução: parse-plan (PRODUZ tier) -> manifesto (APLICA) ->
// validate-dispatch (VERIFICA) -> mark-task-status -> parse-tasks --assert-all-done.
// A cadeia de tres camadas e o invariante central: nenhuma sozinha pega o drift cheap->sonnet.
const { run, sh, write, read, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const WP = 'super.writing-plans/scripts';
const SDD = 'super.subagent-driven-development/scripts';
const DPA = 'super.dispatching-parallel-agents/scripts';
const USP = 'super.using-superpowers/scripts';

const idx = path.join(ROOT, `${A.DIR}/plans/tasks-${A.FEATURE}.md`);
const plansDir = path.join(ROOT, `${A.DIR}/plans`);

setPhase('P3 execucao: parse-plan PRODUZ');

let plan = null;
check('parse-plan le as 5 tasks do plano do template com grafo valido', () => {
  const r = run(`${WP}/parse-plan.cjs`, ['--tasks-index', idx]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  plan = r.json;
  eq(r.json.found, true, 'found');
  eq(r.json.tasks.map(t => t.number), [1, 2, 3, 4, 5], 'ordem do indice');
  eq(r.json.errors, [], 'grafo valido');
  const t3 = r.json.tasks.find(t => t.number === 3);
  eq(t3.consumes, [1, 2], 'task-03 consome 1 e 2');
  return `${r.json.tasks.length} tasks, fanIn(1)=${r.json.tasks[0].fanIn}`;
});

check('parse-plan emite suggestedTier por task', () => {
  for (const t of plan.tasks) {
    assert(t.suggestedTier, `task ${t.number} sem suggestedTier`);
    assert(Array.isArray(t.tierSignals) && t.tierSignals.length, `task ${t.number} sem justificativa de tier`);
  }
  return plan.tasks.map(t => `${t.number}:${t.suggestedTier}`).join(' ');
});

check('Tier ESCRITO no task file sobrepoe a sugestao computada', () => {
  // task-02 tem **Tier:** cheap escrito a mao; o script deve honrar, nao recomputar.
  const t2 = plan.tasks.find(t => t.number === 2);
  eq(t2.explicitTier, 'cheap', 'explicitTier da task-02');
  eq(t2.suggestedTier, 'cheap', 'sugestao deve HONRAR o escrito');
  assert(t2.tierSignals.some(s => /explicit/i.test(s)), `sinal nao registra a origem: ${t2.tierSignals}`);
  return 'tier escrito e vinculante e rastreado';
});

check('elegibilidade do --single vem do parser, com razao nomeada', () => {
  const single = plan.singleImplementer;
  assert(single && typeof single.eligible === 'boolean', 'sem singleImplementer');
  assert(!('executionRecommendation' in plan) && !('waves' in plan), 'nenhuma maquinaria de ondas na saida');
  if (!single.eligible) {
    assert(single.reasons.length, 'inelegivel sem razao');
  } else {
    eq(single.reasons, [], 'elegivel sem razoes residuais');
  }
  // sete tasks: inelegivel pela contagem, com a razao nomeada
  const sete = path.join(plansDir, 'tasks-sete.md');
  fs.writeFileSync(sete, A.tasksIndex.replace(
    '- [ ] 5. delete e stats → `task-05.md`',
    '- [ ] 5. delete e stats → `task-05.md`\n- [ ] 6. seis → `task-06.md`\n- [ ] 7. sete → `task-07.md`',
  ));
  const r2 = run(`${WP}/parse-plan.cjs`, ['--tasks-index', sete]);
  eq(r2.json.singleImplementer.eligible, false, 'sete tasks e demais para um contexto');
  assert(r2.json.singleImplementer.reasons.some(r => /7 tasks/.test(r)), 'razao nomeia a contagem');
  fs.unlinkSync(sete);
  return `eligible=${single.eligible}`;
});

setPhase('P3 execucao: manifesto APLICA, validate-dispatch VERIFICA');

// model_tiers do preferences.yml gravado na fase 1
const TIERS = { cheap: 'haiku', standard: 'sonnet', capable: 'opus' };

function manifesto(agents, extra = {}) {
  const p = path.join(ROOT, 'dispatch.json');
  fs.writeFileSync(p, JSON.stringify({ modelTiers: TIERS, ...extra, agents }));
  return p;
}

check('manifesto das tasks 1 e 2 montado a partir do tier escrito e valido', () => {
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
  // as FRs saem do titulo do task file (o indice nao as carrega): e por elas que o fix round
  // do QA acha a task de uma story reprovada (super.user-story-verification, Step 6)
  assert(!/\[FR-/.test(A.tasksIndex), 'o indice do fixture nao deveria carregar tags FR');
  eq(r.json.pending.map(t => t.requirements.join(',')).join(' | '), 'FR-003 | FR-006 | FR-001 | FR-002 | FR-004,FR-005', 'requirements por task');
  return '5 tasks pendentes, indice e arquivos concordam, FRs lidas dos task files';
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

check('DONE sem os arquivos declarados em disco reprova o --assert-all-done', () => {
  for (const n of [2, 3, 4, 5]) {
    run(`${SDD}/mark-task-status.cjs`, ['--tasks-index', idx, '--task-number', String(n),
      '--status', 'DONE', '--task-file', path.join(plansDir, `task-0${n}.md`)]);
  }
  const r = run(`${SDD}/parse-tasks.cjs`, ['--tasks-index', idx, '--assert-all-done']);
  eq(r.json.allDone, true, 'allDone (tracker fechado)');
  eq(r.status, 2, 'exit code com deliverables ausentes');
  const declared = new Set(A.TASKS.flatMap(t => [...(t.creates || []), ...(t.modifies || []), ...(t.tests || [])]));
  const missing = new Set(r.json.missingDeliverables.map(m => m.path));
  eq([...declared].every(f => missing.has(f)), true, 'todo arquivo declarado listado como ausente');
  return `${missing.size} deliverables ausentes bloqueiam o fechamento`;
});

check('marcar as 5 tasks fecha o --assert-all-done', () => {
  for (const t of A.TASKS) {
    for (const f of [...(t.creates || []), ...(t.modifies || []), ...(t.tests || [])]) {
      write(f, `// task-0${t.n}: ${t.title}\n`);
    }
  }
  const r = run(`${SDD}/parse-tasks.cjs`, ['--tasks-index', idx, '--assert-all-done']);
  eq(r.json.missingDeliverables.length, 0, 'deliverables ausentes');
  eq(r.json.allDone, true, 'allDone');
  eq(r.json.pending.length, 0, 'pendentes');
  eq(r.json.completed.length, 5, 'concluidas');
  eq(r.status, 0, 'exit code com tudo pronto');
  return 'plano fechado';
});

report();
