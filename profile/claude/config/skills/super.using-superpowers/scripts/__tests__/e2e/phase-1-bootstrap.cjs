'use strict';
// FASE 1 — Bootstrap / roteamento de entrada (super.using-superpowers).
// Foco de regressao: os commits recentes consolidaram o bootstrap em UMA chamada
// (derive + check-resync + pmem embedding-status) e moveram a tabela de tiers
// para references/triage-sizing.md.
const { run, sh, write, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');

check('setup: sandbox git virgem', () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  // -b main: sem config global (GIT_CONFIG_GLOBAL=/dev/null) a branch inicial
  // dependeria da versao do git; o P7 assume um ponto de partida nomeado.
  sh('git init -q -b main . && git config user.email e2e@test && git config user.name e2e');
  write('README.md', '# sandbox\n');
  sh('git add -A && git commit -qm init');
  return ROOT;
});

const US = 'super.using-superpowers/scripts';

setPhase('P1 bootstrap: repo virgem (onboarding)');

check('derive-session-state em repo SEM .superpowers: preferencesFound=false', () => {
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.preferencesFound, false, 'preferencesFound');
  // O gotcha documentado: sessionState vem POPULADO mesmo sem arquivo.
  assert(r.json.sessionState && typeof r.json.sessionState === 'object', 'sessionState ausente');
  eq(r.json.sessionState.session_auto_commit, true, 'default auto_commit');
  return 'defaults mascaram ausencia, flag distingue';
});

check('check-resync em repo sem docs/: nao quebra, dirty=false', () => {
  const r = run(`${US}/check-resync.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.docsExists, false, 'docsExists');
  assert(r.json.dirty === false, `dirty deveria ser false, veio ${r.json.dirty}`);
  return `dirty=${r.json.dirty}`;
});

check('bootstrap de 1 call: os 3 comandos encadeados rodam sem erro', () => {
  // Exatamente a forma que o SKILL.md manda depois do commit de otimizacao.
  const B = path.join(require('./harness.cjs').SKILLS, 'super.using-superpowers');
  const cmd = `node ${B}/scripts/derive-session-state.cjs --platform claude-code --repo-root "${ROOT}"; ` +
              `node ${B}/scripts/check-resync.cjs --repo-root "${ROOT}"; ` +
              `${B}/../super.persistent-memory/scripts/pmem embedding-status 2>&1 | head -3`;
  const out = sh(cmd);
  // Os scripts emitem JSON pretty-printed (multi-linha) e o pmem prefixa uma linha
  // em branco: o consumidor real precisa varrer objetos, nao linhas.
  const objs = [];
  let depth = 0, start = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (out[i] === '}') { depth--; if (depth === 0 && start >= 0) { objs.push(out.slice(start, i + 1)); start = -1; } }
  }
  assert(objs.length >= 3, `esperava 3 objetos JSON (derive/resync/pmem), veio ${objs.length}`);
  const [derive, resync, pmem] = objs.map(o => JSON.parse(o));
  assert('sessionState' in derive, 'derive sem sessionState');
  assert('dirty' in resync, 'check-resync sem dirty');
  assert('reembed_needed' in pmem, 'pmem sem reembed_needed');
  return `3 JSONs do bootstrap consolidado parseiam`;
});

setPhase('P1 bootstrap: write-preferences -> derive (juncao real)');

const prefsFull = {
  workflow: { auto_commit: true, confirm_destructive_actions: true, qa_gate: true },
  communication: { language: 'pt-BR' },
  claude_code: { simplify: true, code_review_final: true, code_review_effort: 'high' },
  copilot: { rubber_duck: false, review_final: true },
  context: { has_corporate_artifacts: false },
  optimization: { caveman: true, caveman_level: 'ultra' },
  memory: { persistent_memory: true },
  model_tiers: { cheap: 'haiku', standard: 'sonnet', capable: 'opus' },
};

check('write-preferences grava e valida round-trip', () => {
  const inFile = path.join(ROOT, 'prefs-in.json');
  fs.writeFileSync(inFile, JSON.stringify(prefsFull));
  const r = run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.written, true, 'written');
  eq(r.json.roundTripValid, true, 'roundTripValid');
  assert(fs.existsSync(path.join(ROOT, '.superpowers/preferences.yml')), 'preferences.yml nao existe');
  return r.json.path.replace(ROOT, '.');
});

check('derive le o que write gravou (nao ha drift de schema entre os dois)', () => {
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  const s = r.json.sessionState;
  eq(r.json.preferencesFound, true, 'preferencesFound');
  eq(s.session_language, 'pt-BR', 'language');
  eq(s.session_caveman_active, true, 'caveman_active');
  eq(s.session_caveman_level, 'ultra', 'caveman_level');
  eq(s.session_memory_enabled, true, 'memory');
  eq(s.session_qa_gate_enabled, true, 'qa_gate');
  eq(s.session_simplify_enabled, true, 'simplify');
  eq(s.session_code_review_final_enabled, true, 'code_review_final');
  eq(s.session_model_tier_cheap, 'haiku', 'tier cheap');
  eq(s.session_model_tier_capable, 'opus', 'tier capable');
  return 'mapeamento integro';
});

check('gating de plataforma: claude_code.* inerte fora do claude-code', () => {
  const seen = {};
  for (const p of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    const r = run(`${US}/derive-session-state.cjs`, ['--platform', p, '--repo-root', ROOT]);
    assert(r.json, `plataforma ${p} sem JSON: ${r.stderr}`);
    const s = r.json.sessionState;
    seen[p] = [s.session_simplify_enabled, s.session_code_review_final_enabled, s.session_copilot_review_final_enabled];
    if (p !== 'claude-code') {
      assert(s.session_simplify_enabled === false, `${p}: simplify deveria ser false`);
      assert(s.session_code_review_final_enabled === false, `${p}: code_review_final deveria ser false`);
    }
    if (p !== 'copilot') {
      assert(s.session_copilot_review_final_enabled === false, `${p}: copilot_review deveria ser false`);
    }
    // Cross-platform vars sobrevivem em TODA plataforma.
    eq(s.session_language, 'pt-BR', `${p}: language cross-platform`);
    eq(s.session_model_tier_capable, 'opus', `${p}: model_tiers cross-platform`);
  }
  eq(seen['claude-code'], [true, true, false], 'claude-code');
  eq(seen['copilot'], [false, false, true], 'copilot');
  return '6 plataformas gateadas';
});

check('read-preferences e derive concordam (mesmo loader)', () => {
  const rp = run(`${US}/read-preferences.cjs`, ['--repo-root', ROOT]);
  const ds = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(rp.json.found, ds.json.preferencesFound, 'found vs preferencesFound');
  eq(rp.json.preferences.communication.language, ds.json.sessionState.session_language, 'language');
  eq(rp.json.preferences.model_tiers.cheap, ds.json.sessionState.session_model_tier_cheap, 'tier cheap');
  return 'consistente';
});

setPhase('P1 bootstrap: preferencias adversas');

check('qa_gate:false desliga session_qa_gate_enabled', () => {
  const p = JSON.parse(JSON.stringify(prefsFull));
  p.workflow.qa_gate = false;
  p.workflow.auto_commit = false;
  p.memory.persistent_memory = false;
  const inFile = path.join(ROOT, 'prefs-off.json');
  fs.writeFileSync(inFile, JSON.stringify(p));
  run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  const s = r.json.sessionState;
  eq(s.session_qa_gate_enabled, false, 'qa_gate');
  eq(s.session_auto_commit, false, 'auto_commit');
  eq(s.session_memory_enabled, false, 'memory');
  return 'tres gates desligados propagam';
});

check('preferences.yml malformado: malformed=true, sem crash', () => {
  const bkp = fs.readFileSync(path.join(ROOT, '.superpowers/preferences.yml'), 'utf8');
  fs.writeFileSync(path.join(ROOT, '.superpowers/preferences.yml'), 'workflow:\n  auto_commit: [oops\n   :: bad\n');
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  assert(r.json, `sem JSON em arquivo malformado: ${r.stderr}`);
  assert(r.json.malformed === true || r.json.preferencesFound === false,
    `esperava malformed=true ou found=false, veio malformed=${r.json.malformed} found=${r.json.preferencesFound}`);
  assert(r.json.sessionState, 'sessionState deveria existir mesmo malformado');
  fs.writeFileSync(path.join(ROOT, '.superpowers/preferences.yml'), bkp);
  return `malformed=${r.json.malformed}`;
});

// Restaura prefs completas para as fases seguintes. Tem de ser um check(): as fases
// 3, 5 e 7 leem model_tiers e persistent_memory daqui, e um IIFE de top-level rodaria
// no require — antes dos checks de preferencias adversas acima, que deixariam o
// arquivo com memoria DESLIGADA para todo o resto do pipeline.
check('setup: prefs completas restauradas para as fases seguintes', () => {
  const inFile = path.join(ROOT, 'prefs-in.json');
  fs.writeFileSync(inFile, JSON.stringify(prefsFull));
  const r = run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  assert(r.json && r.json.written === true, `write-preferences nao confirmou escrita: ${r.stdout.slice(0, 200)}`);
  const back = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(back.json.sessionState.session_memory_enabled, true, 'memoria religada');
  return 'prefs de referencia no disco';
});

setPhase('P1 triagem: assess-complexity');

check('project-g (LRU+TTL) classifica em tier de planejamento', () => {
  const signals = {
    fileScope: 'new-component', abstraction: 'yes', prd: 'optional',
    decision: 'may-exist', steps: 6,
    text: 'Cache em memoria com politica LRU e expiracao por TTL',
  };
  const r = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify(signals), '--checkpoint', '0']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(['medium', 'large'].includes(r.json.tier), `tier inesperado: ${r.json.tier}`);
  eq(r.json.consentGates, [], 'tier nao-complex nao oferece consent gates');
  return `tier=${r.json.tier} conf=${r.json.confidence}`;
});

check('criticalSurface tri-state: interpretador primario, regex backstop, false=veto', () => {
  // O piso e small (nunca micro) — so uma base que cairia em micro expoe o efeito.
  const base = { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 };
  const neutro = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ ...base, text: 'renomeia variavel' })]).json;
  const backstop = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ ...base, text: 'ajusta o middleware de auth' })]).json;
  const veto = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ ...base, text: 'ajusta o middleware de auth', criticalSurface: false })]).json;
  const forcado = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ ...base, text: 'renomeia variavel', criticalSurface: true })]).json;
  eq(neutro.tier, 'micro', 'sem sinal critico');
  eq(backstop.tier, 'small', 'regex backstop deve pisar em small');
  eq(veto.tier, 'micro', 'criticalSurface:false deve VETAR o regex');
  eq(forcado.tier, 'small', 'criticalSurface:true deve pisar sem keyword');
  return 'micro | kw:small | veto:micro | semantico:small';
});

check('tier complex oferece consent gate por checkpoint', () => {
  const signals = { fileScope: 'cross-cutting', abstraction: 'ambiguous', prd: 'required', decision: 'open-fork', steps: 20 };
  const cp0 = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify(signals), '--checkpoint', '0']).json;
  const cp2 = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify(signals), '--checkpoint', '2']).json;
  eq(cp0.tier, 'complex', 'tier cp0');
  eq(cp0.consentGates, ['deep-research'], 'consentGates cp0');
  eq(cp2.consentGates, ['reviewing-specs'], 'consentGates cp2');
  return 'gates por checkpoint corretos';
});

check('sinal mal-formado FALHA em vez de virar Medium silencioso', () => {
  // alias de CHAVE com valor valido: aceito
  const alias = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ files: 'few-existing', new_abstractions: true, decisions: false })]);
  assert(alias.json, `alias de chave deveria funcionar: ${alias.stderr}`);
  // chave desconhecida: rejeitada com sugestao
  const badKey = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ fileScopeee: 'single-existing' })]);
  eq(badKey.status, 1, 'chave desconhecida deve sair 1');
  assert(/did you mean|Valid keys/i.test(badKey.stderr + badKey.stdout), 'erro deveria ser auto-documentado');
  // valor errado numa chave conhecida: rejeitado (nao vira Medium mudo)
  const badVal = run(`${US}/assess-complexity.cjs`, ['--signals', JSON.stringify({ files: 3 })]);
  eq(badVal.status, 1, 'valor fora do enum deve sair 1');
  assert(/Valid fileScope/i.test(badVal.stderr + badVal.stdout), 'erro deveria listar o enum valido');
  return `alias ok (tier=${alias.json.tier}); chave e valor ruins rejeitados`;
});

setPhase('P1 caveman + status');

check('render-caveman-block reflete as preferences do disco', () => {
  const r = run(`${US}/render-caveman-block.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.active, true, 'active');
  eq(r.json.level, 'ultra', 'level');
  assert(r.json.block && r.json.block.length > 0, 'bloco vazio com caveman ativo');
  const off = run(`${US}/render-caveman-block.cjs`, ['--active', 'false', '--repo-root', ROOT]);
  eq(off.json.block, '', 'caveman off deve render bloco vazio');
  return `bloco ${r.json.block.length}B ligado, vazio desligado`;
});

check('superpowers-status nunca sai != 0 (sempre reporta em JSON)', () => {
  const r = run(`${US}/superpowers-status.cjs`, ['--repo-root', ROOT]);
  eq(r.status, 0, 'exit code');
  assert(r.json, 'sem JSON');
  const semRepo = run(`${US}/superpowers-status.cjs`, ['--repo-root', '/caminho/que/nao/existe']);
  eq(semRepo.status, 0, 'exit code com repo inexistente');
  return 'contrato de exit-0 mantido';
});

report();
