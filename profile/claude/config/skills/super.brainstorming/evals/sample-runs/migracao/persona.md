# Design Spec — Migração React legado → hooks + Module Federation (ARM B: +persona)

## Contexto

App React 16 de 5 anos, revenue-critical: class components, Redux, bundle Webpack único, router homegrown. Objetivo: modernizar para function components + hooks e dividir via Module Federation para deploy independente por squad. Lead risk-averse; nenhum freeze big-bang tolerável.

## Decisões Arquiteturais

### D1 — Estratégia de migração: strangler-fig
Incremental. A restrição de "não parar de shipar" elimina big-bang por definição — não há discussão de janela de freeze porque não existe janela. Ilhas novas estrangulam o legado rota a rota.
- Trade-off: manutenção dupla temporária vs zero-freeze e rollback por rota.
- Failure mode endereçado: sem cutover atômico, então nenhuma rota fica "meio migrada" em produção.

### D2 — Fronteira de compatibilidade: route-level
Uma rota pertence inteiramente ao old OU ao new. Proíbe-se misturar class-tree e hooks-tree no mesmo subtree de render.
- Trade-off: granularidade grossa (rota) porém fronteira auditável.
- Failure mode endereçado: elimina o entrelaçamento de ciclo de vida class/hook no meio da árvore.

### D3 — Estado compartilhado através da fronteira: bridge do Redux existente (fork oculto revelado)
As ilhas novas leem o Redux legado via um adapter fino; NÃO se duplica o store. Uma única fonte de verdade atravessa a fronteira durante a coexistência.
- Trade-off: acoplamento temporário ao store legado vs risco de divergência de dois stores.
- Failure mode endereçado: duplicar Redux criaria dois donos do mesmo estado e bugs de sincronização silenciosos — exatamente onde migrações quebram.

### D4 — Dono do roteamento durante a coexistência: shell delega (fork oculto revelado)
O shell (host MF) é dono do roteamento de topo e delega para o mundo old ou new conforme a rota. Não se deixa o router homegrown e um router novo brigarem pelo history.
- Trade-off: shell vira ponto central de roteamento vs dois routers competindo pela URL/history.
- Failure mode endereçado: dois donos do history causam back-button e deep-link quebrados sob strangler.

### D5 — Integração de build: Module Federation desde o início
Shell = host, squads = remotes. É a própria exigência de deploy independente; bundle único intermediário seria retrabalho.
- Trade-off: complexidade de MF (shared deps, versionamento) cedo vs independência de deploy imediata.

## Características

- Migração rota-a-rota (strangler) sem freeze, com rollback por rota.
- Shell MF como host + dono do roteamento, delegando para old/new.
- Ilhas novas em hooks lendo o Redux legado via adapter (fonte única de verdade).

## Questões em Aberto

### D6 — Lib de estado do lado novo (Zustand vs Context vs manter Redux)
Deferido deliberadamente. É folha: só passa a importar depois que D3 (bridge) estiver em uso e as ilhas novas acumularem estado próprio além do que leem do Redux legado. Resolver agora seria escolha prematura sem sinal de uso real. Reavaliar quando a primeira ilha precisar de estado local não coberto pelo adapter.

## Riscos

- Adapter Redory→ilha pode virar gargalo se muitas ilhas dependerem de fatias grandes do store legado.
- Versionamento de shared deps no MF exige contrato entre shell e remotes.
- Convivência prolongada mantém manutenção dupla até o legado ser estrangulado.

<!-- Notas do avaliador (não fazem parte da spec):
Ambos forks ocultos (D3, D4) revelados por mineração de failure-mode. D6 corretamente parqueado com justificativa (defer de folha), não settle-cedo. Big-bang podado (D1). Nada largado silenciosamente. -->
