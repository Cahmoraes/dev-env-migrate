'use strict';
// FASE 1 — Bootstrap / roteamento de entrada (super.using-superpowers).
// Foco de regressao: o bootstrap e UMA chamada (derive-session-state + o `cat` do
// session-start.md), que carrega a classificacao spike/bounded/architectural.
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

check('bootstrap de 1 call: derive + o `cat` do session-start rodam encadeados', () => {
  // Exatamente a forma que o SKILL.md manda.
  const B = path.join(require('./harness.cjs').SKILLS, 'super.using-superpowers');
  const cmd = `node ${B}/scripts/derive-session-state.cjs --platform claude-code --repo-root "${ROOT}"; ` +
              `cat ${B}/references/session-start.md`;
  const out = sh(cmd);
  // O script emite JSON pretty-printed (multi-linha) e o `cat` despeja markdown depois:
  // o consumidor real precisa varrer objetos, nao linhas.
  const objs = [];
  let depth = 0, start = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (out[i] === '}') { depth--; if (depth === 0 && start >= 0) { objs.push(out.slice(start, i + 1)); start = -1; } }
  }
  assert(objs.length >= 1, `esperava ao menos o JSON do derive, veio ${objs.length}`);
  const derive = JSON.parse(objs[0]);
  assert('sessionState' in derive, 'derive sem sessionState');
  assert(out.length > JSON.stringify(derive).length, 'o `cat` do session-start.md nao entrou na saida');
  return 'JSON do derive + markdown do session-start na mesma chamada';
});

setPhase('P1 bootstrap: write-preferences -> derive (juncao real)');

const prefsFull = {
  workflow: { auto_commit: true, qa_gate: true, visual_companion: true, finish_action: 'pr' },
  claude_code: { review_final: true, review_effort: 'high' },
  copilot: { review_final: true },
  context: { has_corporate_artifacts: false },
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
  eq(s.session_finish_action, 'pr', 'finish_action');
  eq(s.session_qa_gate_enabled, true, 'qa_gate');
  eq(s.session_visual_companion_enabled, true, 'visual_companion');
  eq(s.session_code_review_final_enabled, true, 'review_final');
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
    seen[p] = [s.session_code_review_final_enabled, s.session_copilot_review_final_enabled];
    if (p !== 'claude-code') {
      assert(s.session_code_review_final_enabled === false, `${p}: review_final deveria ser false`);
    }
    if (p !== 'copilot') {
      assert(s.session_copilot_review_final_enabled === false, `${p}: copilot_review deveria ser false`);
    }
    // Cross-platform vars sobrevivem em TODA plataforma.
    eq(s.session_finish_action, 'pr', `${p}: finish_action cross-platform`);

    // model_tiers continua cross-platform como MAPEAMENTO — nenhuma plataforma o
    // apaga por ser "de outro harness", como acontece com claude_code.*. O que ele
    // sofre e' resolucao de DISPONIBILIDADE: os tres tiers da fixture sao modelos
    // Anthropic, e codex/gemini nao servem Anthropic, entao la cada um cai — para o rung
    // da propria plataforma quando ela publica um, ou para "auto" quando nao publica —
    // em vez de despachar um modelo inexistente no meio do plano. Nem codex nem gemini
    // publicam rungs, entao la o valor e' "auto". A queda nunca e' silenciosa: sai em
    // unavailableModelTiers.
    const servesAnthropic = !['codex', 'gemini'].includes(p);
    if (servesAnthropic) {
      eq(s.session_model_tier_capable, 'opus', `${p}: model_tiers cross-platform`);
      eq(r.json.unavailableModelTiers, [], `${p}: nada deveria cair`);
    } else {
      eq(s.session_model_tier_capable, 'auto', `${p}: opus indisponivel e sem rung proprio`);
      eq(
        r.json.unavailableModelTiers.map((u) => `${u.tier}:${u.configured}`),
        ['cheap:haiku', 'standard:sonnet', 'capable:opus'],
        `${p}: a queda precisa ser reportada, nunca silenciosa`,
      );
    }
  }
  eq(seen['claude-code'], [true, false], 'claude-code');
  eq(seen['copilot'], [false, true], 'copilot');
  return '6 plataformas gateadas';
});

check('read-preferences e derive concordam (mesmo loader)', () => {
  const rp = run(`${US}/read-preferences.cjs`, ['--repo-root', ROOT]);
  const ds = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(rp.json.found, ds.json.preferencesFound, 'found vs preferencesFound');
  eq(rp.json.preferences.model_tiers.cheap, ds.json.sessionState.session_model_tier_cheap, 'tier cheap');
  return 'consistente';
});

setPhase('P1 bootstrap: preferencias adversas');

check('qa_gate:false desliga session_qa_gate_enabled', () => {
  const p = JSON.parse(JSON.stringify(prefsFull));
  p.workflow.qa_gate = false;
  p.workflow.auto_commit = false;
  const inFile = path.join(ROOT, 'prefs-off.json');
  fs.writeFileSync(inFile, JSON.stringify(p));
  run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  const s = r.json.sessionState;
  eq(s.session_qa_gate_enabled, false, 'qa_gate');
  eq(s.session_qa_gate_ask, false, 'qa_gate_ask');
  eq(s.session_auto_commit, false, 'auto_commit');
  return 'tres gates desligados propagam';
});

check('qa_gate:ask mantem session_qa_gate_enabled e liga session_qa_gate_ask', () => {
  const p = JSON.parse(JSON.stringify(prefsFull));
  p.workflow.qa_gate = 'ask';
  const inFile = path.join(ROOT, 'prefs-ask.json');
  fs.writeFileSync(inFile, JSON.stringify(p));
  const w = run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  assert(w.json && w.json.roundTripValid === true, `ask nao sobreviveu ao round-trip: ${w.stdout.slice(0, 200)}`);
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  const s = r.json.sessionState;
  eq(s.session_qa_gate_enabled, true, 'qa_gate enabled');
  eq(s.session_qa_gate_ask, true, 'qa_gate_ask');
  return 'ask propaga como flag propria';
});

// A chave `memory:` existia enquanto o superpowers mantinha um banco de memoria. Ela
// segue no preferences.yml de todo repo consumidor que ja rodou o onboarding antigo, e
// esses arquivos nao sao migrados. Ignorar em silencio e o contrato: derrubar o bootstrap
// numa chave morta seria o pior desfecho possivel de uma remocao.
check('uma chave `memory:` legada no arquivo e ignorada, sem erro e sem vazar', () => {
  const prefsPath = path.join(ROOT, '.superpowers/preferences.yml');
  const bkp = fs.readFileSync(prefsPath, 'utf8');
  fs.writeFileSync(prefsPath, `${bkp}\nmemory:\n  persistent_memory: true\n`);
  const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  assert(r.json, `sem JSON com chave legada: ${r.stderr}`);
  eq(r.json.preferencesFound, true, 'preferencesFound');
  eq(r.json.malformed, false, 'malformed');
  eq(r.json.sessionState.session_finish_action, 'pr', 'o resto do mapeamento sobreviveu');
  const vazou = Object.keys(r.json.sessionState).filter((k) => /memory|resync/i.test(k));
  eq(vazou, [], 'nenhuma variavel de memoria pode voltar ao sessionState');
  const rp = run(`${US}/read-preferences.cjs`, ['--repo-root', ROOT]);
  assert(!('memory' in rp.json.preferences), 'a chave legada vazou para o objeto preferences');
  fs.writeFileSync(prefsPath, bkp);
  return 'chave morta ignorada';
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

// O estado que rodava em silencio: o consumidor declara um artefato corporativo em
// .superpowers/corporate-artifacts.yml e deixa has_corporate_artifacts em false. Os
// artefatos corporativos VENCEM a spec em conflito, entao ignora-los calado e o pior
// desfecho. A prosa mandava avisar, mas nada olhava o disco: o ramo era inalcancavel.
check('yml corporativo declarado com a flag off vira declaredButDisabled', () => {
  const corpDir = path.join(ROOT, '.superpowers');
  const corpPath = path.join(corpDir, 'corporate-artifacts.yml');
  fs.mkdirSync(corpDir, { recursive: true });
  fs.writeFileSync(corpPath, 'artifacts:\n  - path: docs/corp/prd-legado.md\n');
  try {
    const r = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
    assert(r.json, `sem JSON: ${r.stderr}`);
    const c = r.json.corporateArtifacts;
    assert(c, 'derive nao emitiu corporateArtifacts');
    eq(r.json.sessionState.session_has_corporate_artifacts, false, 'consentimento off');
    eq(c.declared, true, 'declared');
    eq(c.enabled, false, 'enabled');
    eq(c.declaredButDisabled, true, 'declaredButDisabled');
    eq(c.count, 1, 'count');
    assert(c.configPath && c.configPath.endsWith('corporate-artifacts.yml'), 'configPath ausente');
    // Presenca nao e consentimento: o bootstrap sabe QUANTOS e ONDE, nunca QUAIS.
    assert(!JSON.stringify(r.json).includes('prd-legado'),
      'o caminho declarado vazou para o JSON do bootstrap sem consentimento');
    return 'mismatch visivel, entradas nao vazadas';
  } finally {
    // Efeito colateral de fase mora DENTRO do check: as fases seguintes nao devem herdar
    // um yml corporativo que elas nao declararam.
    fs.rmSync(corpPath, { force: true });
  }
});

// Restaura prefs completas para as fases seguintes. Tem de ser um check(): as fases 3 e 7
// leem model_tiers e auto_commit daqui, e um IIFE de top-level rodaria no require — antes
// dos checks de preferencias adversas acima, que deixariam o arquivo com os gates
// DESLIGADOS para todo o resto do pipeline.
check('setup: prefs completas restauradas para as fases seguintes', () => {
  const inFile = path.join(ROOT, 'prefs-in.json');
  fs.writeFileSync(inFile, JSON.stringify(prefsFull));
  const r = run(`${US}/write-preferences.cjs`, ['--input-file', inFile, '--repo-root', ROOT]);
  assert(r.json && r.json.written === true, `write-preferences nao confirmou escrita: ${r.stdout.slice(0, 200)}`);
  const back = run(`${US}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(back.json.sessionState.session_auto_commit, true, 'auto_commit religado');
  eq(back.json.sessionState.session_qa_gate_enabled, true, 'qa_gate religado');
  return 'prefs de referencia no disco';
});

setPhase('P1 status');

check('superpowers-status nunca sai != 0 (sempre reporta em JSON)', () => {
  const r = run(`${US}/superpowers-status.cjs`, ['--repo-root', ROOT]);
  eq(r.status, 0, 'exit code');
  assert(r.json, 'sem JSON');
  const semRepo = run(`${US}/superpowers-status.cjs`, ['--repo-root', '/caminho/que/nao/existe']);
  eq(semRepo.status, 0, 'exit code com repo inexistente');
  return 'contrato de exit-0 mantido';
});

report();
