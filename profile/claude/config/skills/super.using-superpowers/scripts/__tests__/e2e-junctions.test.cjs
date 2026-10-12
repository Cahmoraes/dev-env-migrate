#!/usr/bin/env node
'use strict';
/*
 * e2e-junctions.test.cjs — testa as JUNCOES entre skills, nao os scripts isolados.
 *
 * O resto da suite exercita um script por vez contra fixtures sinteticas. Isso prova
 * que cada peca funciona e nao prova que elas se encaixam: o artefato que uma etapa
 * PRODUZ nunca e submetido ao validador da etapa seguinte. As regressoes que passaram
 * batido por esse buraco sao de costura — um template evolui e o validador do mesmo
 * repo passa a recusa-lo, com 1000+ testes verdes.
 *
 * Aqui um repo consumidor sandbox atravessa o pipeline inteiro, na ordem, reusando o
 * que a fase anterior escreveu em disco. As costuras cobertas:
 *
 *   template real            -> validador          (tasks-template.md -> validate-tasks)
 *   write-preferences        -> derive-session-state
 *   parse-plan (PRODUZ tier) -> mark-task-status (APLICA) -> parse-tasks (VERIFICA)
 *   render-screen (ESCREVE)  -> check-visual-state (CLASSIFICA)
 *   run-mutation (MUTA)      -> teste real (MATA ou SOBREVIVE) -> arvore restaurada
 *   prd-template.md (SECOES) -> feature-index (RECALL)
 *   resolve-review-targets   -> build-review-dispatch -> validate-dispatch
 *
 * Por que um unico arquivo de teste: as fases sao dependentes por construcao (a fase 3
 * executa o plano que a fase 2 escreveu). `node:test` roda os testes de um arquivo em
 * ordem de registro, o que preserva o pipeline; arquivos separados rodariam em paralelo
 * e cada um teria de reconstruir o estado, trocando fidelidade por concorrencia.
 *
 * Custo: ~12s, dominado por ~105 spawns de `node` e algumas operacoes de git. Como o
 * runner paraleliza POR ARQUIVO e a suite inteira leva ~21s, isso nao move o wall-clock.
 * `SUPERPOWERS_SKIP_E2E=1` desliga para loops apertados de edicao.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/e2e-junctions.test.cjs
 */
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const git = spawnSync('git', ['--version'], { stdio: 'ignore' });
const gitDisponivel = git.status === 0;

if (process.env.SUPERPOWERS_SKIP_E2E === '1') {
  test('e2e das juncoes', { skip: 'SUPERPOWERS_SKIP_E2E=1' }, () => {});
} else if (!gitDisponivel) {
  // A fase 1 faz `git init`, cria branches e le o estado do repo. Sem git
  // o harness nao tem o que exercitar — skipar e honesto, falhar seria ruido.
  test('e2e das juncoes', { skip: 'git indisponivel no PATH' }, () => {});
} else {
  const { cleanup } = require('./e2e/harness.cjs');

  // Ordem e o contrato: cada fase consome o que a anterior deixou no sandbox.
  require('./e2e/phase-1-bootstrap.cjs');
  require('./e2e/phase-2-planning.cjs');
  require('./e2e/phase-3-execution.cjs');
  require('./e2e/phase-4-verification.cjs');
  require('./e2e/phase-5-recall.cjs');
  require('./e2e/phase-6-visual.cjs');

  test.after(cleanup);
}
