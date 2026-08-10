'use strict';
// FASE 6 — Visual companion do brainstorming (foco de 3 dos 5 commits recentes).
// Juncao alvo: render-screen.cjs ESCREVE a tela -> check-visual-state.cjs a CLASSIFICA.
// Reproduz os estados da sessao real que originou o fix da divida de render.
const { run, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');

const BS = 'super.brainstorming/scripts';
const SESS = path.join(ROOT, '.superpowers/brainstorm/e2e-session');
const STATE = path.join(SESS, 'state');
const CONTENT = path.join(SESS, 'content');

function resetSessao({ live = true, stopped = false, pid = process.pid } = {}) {
  fs.rmSync(SESS, { recursive: true, force: true });
  fs.mkdirSync(STATE, { recursive: true });
  fs.mkdirSync(CONTENT, { recursive: true });
  if (live) {
    fs.writeFileSync(path.join(STATE, 'server-info'), JSON.stringify({ url: 'http://localhost:52353', pid }));
    fs.writeFileSync(path.join(STATE, 'server.pid'), String(pid));
  }
  if (stopped) fs.writeFileSync(path.join(STATE, 'server-stopped'), '');
}

function estado(extra = []) {
  const r = run(`${BS}/check-visual-state.cjs`, ['--project-dir', ROOT, ...extra]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.status, 0, 'exit code DEVE ser 0 sempre (veredito mora no JSON)');
  return r.json;
}

// pid garantidamente livre: sonda ate achar um que nao responde
function pidMorto() {
  for (let p = 30000; p < 40000; p++) {
    try { process.kill(p, 0); } catch (e) { if (e.code !== 'EPERM') return p; }
  }
  throw new Error('nenhum pid livre encontrado');
}

setPhase('P6 companion: liveness (tripla server-info + !stopped + pid vivo)');

check('sem sessao nenhuma: no-server, nada e devido', () => {
  fs.rmSync(path.join(ROOT, '.superpowers/brainstorm'), { recursive: true, force: true });
  const s = estado();
  eq(s.companionActive, false, 'companionActive');
  eq(s.renderDebt, false, 'renderDebt: sem companion nao ha divida');
  eq(s.reason, 'no-server', 'reason');
  return 'sem falso positivo';
});

check('server-stopped presente derruba a liveness', () => {
  resetSessao({ stopped: true });
  const s = estado();
  eq(s.companionActive, false, 'companionActive');
  eq(s.reason, 'no-server', 'reason');
  return 'stopped respeitado';
});

check('pid morto derruba a liveness (server-info sozinho nao basta)', () => {
  resetSessao({ pid: pidMorto() });
  const s = estado();
  eq(s.companionActive, false, 'companionActive');
  eq(s.reason, 'no-server', 'reason');
  return 'pid sondado de verdade';
});

setPhase('P6 companion: divida de render (o bug da sessao real)');

check('server no ar + browser VAZIO = divida dura', () => {
  resetSessao();
  const s = estado();
  eq(s.companionActive, true, 'companionActive');
  eq(s.renderDebt, true, 'renderDebt');
  eq(s.reason, 'no-screen-rendered', 'reason');
  eq(s.screens, 0, 'screens');
  assert(s.url, 'url do server nao lida');
  return 'subir server NAO settla a divida';
});

check('placeholder por NOME nao settla a divida (modo de falha dominante)', () => {
  resetSessao();
  fs.writeFileSync(path.join(CONTENT, 'waiting.html'), '<div>Continuando no terminal…</div>');
  const s = estado();
  eq(s.renderDebt, true, 'renderDebt');
  eq(s.reason, 'no-screen-rendered', 'placeholder nao conta como tela real');
  eq(s.placeholders, 1, 'placeholders');
  eq(s.screens, 0, 'telas reais');
  return 'racionalizacao do browser vazio bloqueada';
});

check('placeholder pt-BR por nome tambem e pego (corpus real)', () => {
  resetSessao();
  fs.writeFileSync(path.join(CONTENT, 'aguardando-resposta.html'), '<div>…</div>');
  const s = estado();
  eq(s.placeholders, 1, 'placeholders');
  eq(s.renderDebt, true, 'renderDebt');
  return 'nome pt-BR reconhecido';
});

check('placeholder por MARCADOR com nome neutro tambem e pego', () => {
  resetSessao();
  fs.writeFileSync(path.join(CONTENT, 'tela-01.html'), '<div data-companion-placeholder>parado</div>');
  const s = estado();
  eq(s.placeholders, 1, 'placeholders');
  eq(s.renderDebt, true, 'renderDebt');
  return 'marcador independe do nome';
});

setPhase('P6 companion: render-screen ESCREVE -> check-visual-state CLASSIFICA');

check('render-screen grava a tela e carimba o marcador de gerado', () => {
  resetSessao();
  const spec = {
    title: 'Como apresentar os detalhes de consumo?',
    subtitle: 'Escolha uma abordagem',
    kind: 'options',
    items: [
      { choice: 'a', heading: 'Bottom sheet', body: 'Desliza de baixo, cobre 60% da tela' },
      { choice: 'b', heading: 'Dialog centralizado', body: 'Modal classico com overlay' },
    ],
  };
  const r = run(`${BS}/render-screen.cjs`, ['--screen-dir', CONTENT, '--name', 'opcoes.html', '--spec', JSON.stringify(spec)]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.written, true, 'written');
  eq(r.json.kind, 'options', 'kind');
  const html = fs.readFileSync(path.join(CONTENT, 'opcoes.html'), 'utf8');
  assert(html.includes('<!--companion:generated-->'), 'marcador de gerado ausente');
  assert(html.includes('<div class="options">'), 'markup do gerador mudou (asserts existentes dependem disso)');
  assert(html.includes('Bottom sheet'), 'conteudo nao renderizado');
  return `${r.json.bytes}B`;
});

check('tela real settla a divida e e classificada como GENERATED', () => {
  const s = estado();
  eq(s.renderDebt, false, 'renderDebt');
  eq(s.reason, 'current', 'reason');
  eq(s.screens, 1, 'screens');
  eq(s.newestScreenKind, 'generated', 'newestScreenKind');
  assert(typeof s.ageSeconds === 'number', 'ageSeconds sempre reportado para o modelo julgar');
  return 'presenca + tipo';
});

check('mockup bespoke e classificado como BESPOKE', () => {
  fs.writeFileSync(path.join(CONTENT, 'mockup-modal.html'),
    '<style>.sheet{position:fixed;bottom:0;height:60vh;border-radius:16px 16px 0 0}</style>' +
    '<div class="sheet" data-choice="a"><h3>Consumo do mes</h3><p>12,4 GB de 20 GB</p></div>');
  const s = estado();
  eq(s.newestScreenKind, 'bespoke', 'newestScreenKind');
  eq(s.renderDebt, false, 'renderDebt');
  eq(s.screens, 2, 'screens');
  return 'heuristica de forma distingue os dois';
});

check('LAYOUT GATE: tela generated numa pergunta de layout e violacao NOMEAVEL', () => {
  // O script decide PRESENCA; expor newestScreenKind e o que deixa a prosa
  // detectar "respondi bottom-sheet vs dialog com 927B de text cards".
  resetSessao();
  run(`${BS}/render-screen.cjs`, ['--screen-dir', CONTENT, '--name', 'cards.html', '--spec', JSON.stringify({
    title: 'Bottom sheet ou dialog centralizado?', kind: 'options',
    items: [{ choice: 'a', heading: 'Bottom sheet', body: 'x' }, { choice: 'b', heading: 'Dialog', body: 'y' }],
  })]);
  const s = estado();
  // presenca sozinha diria "current" — e dizia, antes do fix
  eq(s.reason, 'current', 'presenca satisfeita');
  eq(s.newestScreenKind, 'generated', 'o sinal que denuncia a violacao');
  assert(s.renderDebt === false, 'divida de PRESENCA esta paga; a violacao e de correspondencia');
  return 'sinal disponivel para o gate de prosa';
});

setPhase('P6 companion: estacionamento e defasagem');

check('placeholder DEPOIS de tela real = terminal-parked (estado legitimo)', () => {
  resetSessao();
  run(`${BS}/render-screen.cjs`, ['--screen-dir', CONTENT, '--name', 'real.html', '--spec', JSON.stringify({
    title: 'T', kind: 'options', items: [{ choice: 'a', heading: 'A', body: 'b' }],
  })]);
  // garante ordem temporal
  const wait = Date.now() + 1100; while (Date.now() < wait);
  fs.writeFileSync(path.join(CONTENT, 'waiting.html'), '<div>Continuando no terminal…</div>');
  const s = estado();
  eq(s.reason, 'terminal-parked', 'reason');
  eq(s.newestIsPlaceholder, true, 'newestIsPlaceholder');
  assert(s.newestRealScreen, 'a tela real anterior deve continuar rastreada');
  return 'pergunta textual estaciona, nao apaga o historico';
});

check('--max-age-seconds acusa tela defasada; sem a flag nao ha falso positivo', () => {
  resetSessao();
  run(`${BS}/render-screen.cjs`, ['--screen-dir', CONTENT, '--name', 'antiga.html', '--spec', JSON.stringify({
    title: 'T', kind: 'options', items: [{ choice: 'a', heading: 'A', body: 'b' }],
  })]);
  const velho = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(path.join(CONTENT, 'antiga.html'), velho, velho);
  const semFlag = estado();
  eq(semFlag.reason, 'current', 'sem --max-age-seconds nao ha defasagem');
  const comFlag = estado(['--max-age-seconds', '600']);
  eq(comFlag.reason, 'stale-screen', 'reason');
  eq(comFlag.renderDebt, true, 'divida reabre com tela velha');
  assert(comFlag.ageSeconds > 600, `ageSeconds=${comFlag.ageSeconds}`);
  return 'opt-in, sem falso positivo';
});

setPhase('P6 companion: eventos e selecao');

check('--with-events le a selecao final do usuario', () => {
  resetSessao();
  run(`${BS}/render-screen.cjs`, ['--screen-dir', CONTENT, '--name', 'sel.html', '--spec', JSON.stringify({
    title: 'T', kind: 'options', items: [{ choice: 'a', heading: 'A', body: 'x' }, { choice: 'b', heading: 'B', body: 'y' }],
  })]);
  fs.writeFileSync(path.join(STATE, 'events'),
    JSON.stringify({ type: 'choice', choice: 'a', selected: true, selectedChoices: ['a'] }) + '\n' +
    JSON.stringify({ type: 'choice', choice: 'b', selected: true, selectedChoices: ['b'] }) + '\n');
  const s = estado(['--with-events']);
  assert(s.events, 'events ausente');
  eq(s.events.present, true, 'present');
  eq(s.events.count, 2, 'count');
  eq(s.events.finalSelection, ['b'], 'finalSelection vem do ULTIMO evento');
  return 'selecao final derivada dos eventos';
});

check('evento com selectedChoices VAZIO nao e lido como selecao (bug do bespoke)', () => {
  // Antes do fix, painel bespoke emitia selected:true com selectedChoices:[] —
  // o modelo era informado "nada selecionado" com um painel selecionado.
  fs.writeFileSync(path.join(STATE, 'events'),
    JSON.stringify({ type: 'choice', choice: 'a', selected: true, selectedChoices: [] }) + '\n');
  const s = estado(['--with-events']);
  eq(s.events.count, 1, 'count');
  eq(s.events.finalSelection, [], 'finalSelection reflete o evento literalmente');
  return 'contradicao visivel, nao mascarada';
});

check('events malformado e contado, nao derruba o script', () => {
  fs.writeFileSync(path.join(STATE, 'events'), '{nao é json}\n' +
    JSON.stringify({ type: 'choice', choice: 'a', selected: true, selectedChoices: ['a'] }) + '\n');
  const s = estado(['--with-events']);
  eq(s.events.malformed, 1, 'malformed');
  eq(s.events.finalSelection, ['a'], 'linha boa ainda e aproveitada');
  return 'degradacao graciosa';
});

report();
