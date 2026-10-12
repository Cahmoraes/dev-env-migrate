'use strict';
// FASE 5 — Recall (super.brainstorming/scripts/feature-index.cjs).
//
// A costura: as fases 2 e 4 escreveram spec, PRD, plano e relatorios no formato dos
// TEMPLATES REAIS. O indice de features e o consumidor desses templates — le
// `## Visão Geral` e `## Fora de Escopo` do PRD e acha o relatorio de QA em `qa/`. Renomear
// uma secao no `prd-template.md` cega o recall inteiro sem quebrar
// nada mais na suite, e e exatamente isso que esta fase pega.
//
// Substitui a antiga costura de re-sync (inventory -> manifesto -> memory.db). Aquele
// mecanismo saiu: nao ha store, entao nao ha artefato intermediario a validar — so a
// leitura direta do que o pipeline ja escreveu.
const { run, check, assert, eq, setPhase, ROOT, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const FEATURE_INDEX = 'super.brainstorming/scripts/feature-index.cjs';

setPhase('P5 recall: templates reais -> feature-index');

check('o indice enxerga a feature que as fases anteriores escreveram', () => {
  const r = run(FEATURE_INDEX, ['--repo-root', ROOT, '--format', 'json']);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.docsExists, true, 'docsExists');
  const f = r.json.features.find((x) => x.slug === A.FEATURE);
  assert(f, `feature ${A.FEATURE} ausente do indice: ${r.json.features.map((x) => x.slug).join(',')}`);
  return `${r.json.featureCount} feature(s), ${A.FEATURE} presente`;
});

check('o objetivo sai do `## Visão Geral` do PRD real, nao do fallback da spec', () => {
  const r = run(FEATURE_INDEX, ['--repo-root', ROOT, '--format', 'json']);
  const f = r.json.features.find((x) => x.slug === A.FEATURE);
  eq(f.sources.objective, 'prd:overview', 'fonte do objetivo');
  assert(f.objective.length > 0, 'objetivo vazio com PRD presente');
  return f.objective.slice(0, 60);
});

check('o `## Fora de Escopo` do PRD real chega ao indice', () => {
  const r = run(FEATURE_INDEX, ['--repo-root', ROOT, '--format', 'json']);
  const f = r.json.features.find((x) => x.slug === A.FEATURE);
  eq(f.sources.outOfScope, 'prd', 'fonte do fora-de-escopo');
  assert(f.outOfScope.length > 0, 'lista de fora-de-escopo vazia com a secao presente no PRD');
  return `${f.outOfScope.length} item(ns)`;
});

check('as flags de artefato refletem o que esta em disco', () => {
  const r = run(FEATURE_INDEX, ['--repo-root', ROOT, '--format', 'json']);
  const f = r.json.features.find((x) => x.slug === A.FEATURE);
  eq(f.artifacts.spec, true, 'spec');
  eq(f.artifacts.prd, true, 'prd');
  eq(f.artifacts.plan, true, 'plan (indice tasks-<slug>.md)');
  return JSON.stringify(f.artifacts);
});

check('--feature estreita o relatorio sem mudar o que ele diz da feature', () => {
  const todos = run(FEATURE_INDEX, ['--repo-root', ROOT, '--format', 'json']).json;
  const um = run(FEATURE_INDEX, ['--repo-root', ROOT, '--feature', A.FEATURE, '--format', 'json']).json;
  eq(um.featureCount, 1, 'featureCount escopado');
  const a = todos.features.find((x) => x.slug === A.FEATURE);
  assert(JSON.stringify(a) === JSON.stringify(um.features[0]),
    'a entrada da feature mudou entre a leitura completa e a escopada');
  return 'entrada identica nas duas leituras';
});

check('o bloco markdown carrega o ponteiro para os artefatos e nenhum procedimento', () => {
  const r = run(FEATURE_INDEX, ['--repo-root', ROOT]);
  assert(/docs\/superpowers\/<slug>\//.test(r.stdout), 'header sem o ponteiro para os artefatos');
  assert(!/\bgrep\b|\bls\b/.test(r.stdout), 'o bloco prescreveu um procedimento de busca');
  return `${r.stdout.length} chars`;
});

check('rodar duas vezes devolve exatamente o mesmo bloco (derivado, sem estado)', () => {
  const primeiro = run(FEATURE_INDEX, ['--repo-root', ROOT]).stdout;
  const segundo = run(FEATURE_INDEX, ['--repo-root', ROOT]).stdout;
  assert(primeiro === segundo, 'duas leituras seguidas divergiram — ha estado escondido');
  return 'idempotente';
});
