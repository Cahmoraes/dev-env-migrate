'use strict';
// FASE 7 — Integração de waves paralelas em git REAL + plataforma opencode + utilitarios.
// Juncao alvo: branches de worktree produzidas pela execucao paralela sao lidas pelo
// gate pre-merge sem o orquestrador INFERIR nada do estado do git.
const { run, sh, write, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const PSD = 'super.parallel-subagent-development/scripts';
const USP = 'super.using-superpowers/scripts';
const BS = 'super.brainstorming/scripts';

setPhase('P7 integracao: gate pre-merge sobre git real');

// Monta o estado que a execucao paralela produziria: uma branch por task da Wave 1.
check('cenario: duas branches de task disjuntas sobre a base', () => {
  sh('git checkout -q -b main-e2e 2>/dev/null || git checkout -q main-e2e');
  sh('git add -A && git commit -qm "base da feature" --allow-empty');
  sh(`git checkout -q -b wt/${A.FEATURE}-task-01`);
  write('src/cache/node-list.ts', 'export class NodeList {}\n');
  sh('git add -A && git commit -qm "task-01: estrutura"');
  sh('git checkout -q main-e2e');
  sh(`git checkout -q -b wt/${A.FEATURE}-task-02`);
  write('src/cache/clock.ts', 'export const clock = () => Date.now();\n');
  sh('git add -A && git commit -qm "task-02: relogio"');
  sh('git checkout -q main-e2e');
  const branches = sh('git branch --format="%(refname:short)"').trim().split('\n');
  assert(branches.includes(`wt/${A.FEATURE}-task-01`), 'branch da task-01 ausente');
  assert(branches.includes(`wt/${A.FEATURE}-task-02`), 'branch da task-02 ausente');
  return `${branches.length} branches`;
});

check('check-integration ve as duas tasks prontas e SEM colisao', () => {
  const r = run(`${PSD}/check-integration.cjs`, ['--base', 'main-e2e', '--feature', A.FEATURE,
    '--tasks', '1,2', '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  const blob = JSON.stringify(r.json);
  assert(/task-01|"1"|:1\b/.test(blob), `task 1 nao reportada: ${blob.slice(0, 200)}`);
  const colisoes = r.json.collisions || r.json.overlaps || [];
  eq(colisoes.length, 0, `write-sets disjuntos nao deveriam colidir: ${JSON.stringify(colisoes)}`);
  return 'duas tasks prontas, 0 colisoes';
});

check('check-integration DENUNCIA dependencia perdida (arquivo compartilhado)', () => {
  sh(`git checkout -q -b wt/${A.FEATURE}-task-03`);
  write('src/cache/clock.ts', 'export const clock = () => 0; // conflito com task-02\n');
  sh('git add -A && git commit -qm "task-03 mexe no mesmo arquivo da task-02"');
  sh('git checkout -q main-e2e');
  const r = run(`${PSD}/check-integration.cjs`, ['--base', 'main-e2e', '--feature', A.FEATURE,
    '--tasks', '2,3', '--repo-root', ROOT]);
  const sinais = r.json.missedDependencySignals;
  eq(sinais.length, 1, 'deveria haver 1 sinal de dependencia perdida');
  eq(sinais[0].tasks, [2, 3], 'o par de tasks deve ser nomeado');
  eq(sinais[0].overlappingFiles, ['src/cache/clock.ts'], 'o arquivo compartilhado deve ser nomeado');
  assert(/Signal: tasks 2 & 3/.test(r.stderr), `o operador precisa ver o aviso: ${r.stderr.slice(0, 120)}`);
  // Deliberado: e SINAL, nao blocker — o planner declarou independencia, cabe a ele confirmar.
  eq(r.json.blockers, [], 'sobreposicao de arquivos nao bloqueia por si so');
  eq(r.json.readyToIntegrate, true, 'sinal nao impede a integracao');
  return 'missed-dependency sinalizada e nomeada antes do merge';
});

check('task sem branch e reportada como nao-pronta, nao como erro', () => {
  const r = run(`${PSD}/check-integration.cjs`, ['--base', 'main-e2e', '--feature', A.FEATURE,
    '--tasks', '1,9', '--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  const blob = JSON.stringify(r.json);
  assert(/false/.test(blob), 'a task 9 inexistente deveria aparecer como ausente');
  return 'ausencia reportada no JSON, nao por crash';
});

check('o gate e READ-ONLY: nao mexe em branch, HEAD nem working tree', () => {
  const headAntes = sh('git rev-parse HEAD').trim();
  const branchAntes = sh('git rev-parse --abbrev-ref HEAD').trim();
  const statusAntes = sh('git status --porcelain').trim();
  run(`${PSD}/check-integration.cjs`, ['--base', 'main-e2e', '--feature', A.FEATURE,
    '--tasks', '1,2,3', '--repo-root', ROOT]);
  eq(sh('git rev-parse HEAD').trim(), headAntes, 'HEAD mudou');
  eq(sh('git rev-parse --abbrev-ref HEAD').trim(), branchAntes, 'branch mudou');
  eq(sh('git status --porcelain').trim(), statusAntes, 'working tree mudou');
  return 'nenhuma mutacao de git';
});

setPhase('P7 plataforma opencode: tier vira AGENTE (nao arg de dispatch)');

check('generate-opencode-agents e dry-run por padrao (nao escreve sem --write)', () => {
  const r = run(`${USP}/generate-opencode-agents.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(!fs.existsSync(path.join(ROOT, '.opencode/agent')), 'dry-run NAO deveria materializar arquivos');
  assert(Array.isArray(r.json.agents) && r.json.agents.length > 0, 'nenhum agente planejado');
  return `${r.json.agents.length} agentes planejados, wrote=${r.json.wrote}`;
});

check('um agente por tier, cada um com o modelo do preferences', () => {
  const r = run(`${USP}/generate-opencode-agents.cjs`, ['--repo-root', ROOT]);
  const porTier = {};
  for (const a of r.json.agents) porTier[a.tier] = (porTier[a.tier] || []).concat(a.model);
  for (const tier of ['cheap', 'standard', 'capable']) {
    assert(porTier[tier], `tier ${tier} sem agente — opencode nao aceita model: no dispatch`);
  }
  // model_tiers gravado na fase 1: cheap=haiku, standard=sonnet, capable=opus
  assert(porTier.cheap.every(m => /haiku/.test(m)), `cheap deveria mapear haiku: ${porTier.cheap}`);
  assert(porTier.capable.every(m => /opus/.test(m)), `capable deveria mapear opus: ${porTier.capable}`);
  return Object.entries(porTier).map(([t, m]) => `${t}=${m[0]}`).join(' ');
});

check('--write materializa os agentes em disco', () => {
  const r = run(`${USP}/generate-opencode-agents.cjs`, ['--repo-root', ROOT, '--write']);
  eq(r.json.wrote, true, 'wrote');
  const dir = r.json.outDir;
  assert(fs.existsSync(dir), `outDir nao criado: ${dir}`);
  const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  assert(arquivos.length >= 3, `esperava >=3 agentes em disco, veio ${arquivos.length}`);
  const conteudo = fs.readFileSync(path.join(dir, arquivos[0]), 'utf8');
  assert(/^---/.test(conteudo), 'agente sem frontmatter');
  assert(/model:/.test(conteudo), 'agente sem model: no frontmatter (o mecanismo de tier do opencode)');
  return `${arquivos.length} agentes escritos`;
});

check('reviewers do opencode saem read-only (economia de tokens)', () => {
  const r = run(`${USP}/generate-opencode-agents.cjs`, ['--repo-root', ROOT]);
  const readOnly = r.json.agents.filter(a => a.readOnly);
  assert(readOnly.length > 0, 'nenhum agente read-only — reviewers deveriam ser');
  return `${readOnly.length}/${r.json.agents.length} read-only`;
});

setPhase('P7 utilitarios');

check('get-current-datetime emite ISO 8601 com offset (nao a data do contexto)', () => {
  const r = run(`${BS}/get-current-datetime.cjs`);
  const saida = r.stdout.trim();
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/.test(saida), `formato inesperado: ${saida}`);
  const delta = Math.abs(Date.now() - new Date(saida).getTime());
  assert(delta < 120000, `timestamp distante do agora: ${delta}ms`);
  return saida;
});

check('frontmatter-utils faz round-trip get/set sem corromper o corpo', () => {
  const md = path.join(ROOT, `${A.DIR}/specs/${A.FEATURE}-design.md`);
  const corpoAntes = fs.readFileSync(md, 'utf8');
  const set = run(`${BS}/frontmatter-utils.cjs`, ['--file', md, '--set-key', 'status', '--set-value', 'reviewed']);
  assert(set.json, `sem JSON no set: ${set.stderr}`);
  eq(set.json.success, true, 'success');
  const get = run(`${BS}/frontmatter-utils.cjs`, ['--file', md, '--get-key', 'status']);
  eq(get.json.found, true, 'found');
  eq(get.json.value, 'reviewed', 'valor lido difere do escrito');
  const depois = fs.readFileSync(md, 'utf8');
  assert(depois.includes('## Decisões Arquiteturais'), 'corpo do documento foi corrompido pelo set');
  assert(depois.includes('lazy-evict'), 'conteudo perdido no round-trip');
  fs.writeFileSync(md, corpoAntes);
  return 'frontmatter escrito e lido, corpo intacto';
});

check('frontmatter-utils em arquivo SEM frontmatter nao inventa valor', () => {
  const semFm = path.join(ROOT, 'sem-frontmatter.md');
  fs.writeFileSync(semFm, '# Titulo\n\nCorpo puro.\n');
  const r = run(`${BS}/frontmatter-utils.cjs`, ['--file', semFm, '--get-key', 'status']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.hasFrontmatter, false, 'hasFrontmatter');
  eq(r.json.found, false, 'found deveria ser false');
  return 'ausencia distinguida de valor vazio';
});

report();
