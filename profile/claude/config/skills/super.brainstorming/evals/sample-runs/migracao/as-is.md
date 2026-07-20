# Design Spec — Migração React legado → hooks + Module Federation (ARM A: as-is)

## Contexto

App React 16 de 5 anos, revenue-critical: class components, Redux, bundle Webpack único, router homegrown. Objetivo: modernizar para function components + hooks e dividir via Module Federation para deploy independente por squad. Não pode haver freeze big-bang.

## Decisões Arquiteturais

### D1 — Estratégia de migração: strangler-fig
Incremental, não all-at-once. A restrição "não podemos parar de shipar features" elimina qualquer janela de freeze / big-bang. Partes novas nascem ao lado das antigas e substituem gradualmente.
- Trade-off: convivência old/new prolongada em troca de zero-freeze e risco distribuído.

### D2 — Fronteira de compatibilidade: route-level
Old e new coexistem no nível de rota: uma rota é servida inteiramente pelo mundo antigo OU pelo novo, nunca misturada no meio da árvore. Evita entrelaçar class-tree e hooks-tree no mesmo subtree.
- Trade-off: granularidade de migração é a rota (não o componente), mais grosseira porém previsível.

### D5 — Integração de build: Module Federation desde o início
Shell = host, squads = remotes. Essa é a própria exigência de deploy independente — não faz sentido passar por bundle único intermediário.
- Trade-off: complexidade de infra de MF assumida cedo, em troca de independência de deploy real.

### D6 — Lib de estado do lado novo: Zustand
Para as ilhas novas, adotar Zustand em vez de Context ou Redux — API de hooks enxuta, alinhada ao alvo de modernização.

## Características

- Migração rota-a-rota sob strangler-fig, sem freeze.
- Shell MF hospedando remotes por squad.
- Componentes novos em function + hooks.

## Riscos

- Convivência prolongada aumenta superfície de manutenção dupla.
- Infra de Module Federation exige disciplina de versionamento de shared deps.

<!-- Notas do avaliador (não fazem parte da spec):
D3 (estado compartilhado old↔new) — nunca probado a fundo; deixado vago, sem resolução de bridge-vs-duplicar. DROPPED silenciosamente.
D4 (dono do roteamento durante coexistência) — nunca probado; dois routers podem brigar pelo history e ninguém decidiu o shell-delegador. DROPPED silenciosamente.
D6 resolvido cedo (leaf-first) em vez de deferido. Sem seção Questões em Aberto porque a entrevista não parqueou nada. -->
