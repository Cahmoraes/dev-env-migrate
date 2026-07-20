---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Modernização React (class→hooks) com split via Module Federation

## Visão Geral

Aplicação React 16 legada (5 anos): componentes de classe, Redux, um único bundle Webpack, roteador próprio. Produto crítico de receita; **shipping de features não pode parar** durante a migração. Meta: converter para function components + hooks e fatiar em Module Federation para deploy independente por squad.

A parte difícil é a **janela de coexistência**: enquanto old e new convivem, precisamos decidir onde eles se tocam, como o estado é compartilhado, e quem manda na URL. "Trocar class por hooks" é o trabalho mecânico; a fronteira de coexistência é onde a migração falha se não for desenhada.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Deployability independente | Requisito primário: squads shippam sem esperar uns aos outros | Deploy de um remote sem rebuild/redeploy do host nem de outros remotes |
| Continuity (sem freeze) | Produto revenue-critical; negócio não aceita janela de congelamento | Zero freeze; features continuam saindo durante toda a migração |
| Consistência de estado na fronteira | Redux legado + ilhas novas por meses; duplicar estado = divergência silenciosa | Fonte de verdade única para estado compartilhado; nenhuma cópia paralela do Redux |

**Consideradas, não priorizadas:** Performance (bundle atual aceitável; overhead de MF é marginal hoje), Segurança (sem mudança de superfície de auth nesta migração).

## Arquitetura e Fluxo

```
   URL ──► Shell (host MF)  ──► resolve dono da rota
                │
       ┌────────┴─────────┐
   rota legada         rota migrada
       │                    │
       ▼                    ▼
  App legado           Remote de squad
  (class + Redux)      (hooks + Context)
       │                    │
       └──── store bridge ──┘
        (adapter: 1 fonte de verdade = Redux)
```

- O **Shell** é o host de Module Federation e o único dono do roteamento de topo; ele resolve cada URL para o dono da rota (legado ou remote) e cede o subtree.
- Cada rota é atendida inteiramente pelo legado OU por um remote; nunca há mistura old/new dentro da mesma árvore.
- O **store bridge** dá às ilhas novas acesso ao Redux existente; não se cria um segundo store.

## Estrutura de Componentes

- **Shell host (roteador de topo)** — resolve URL → dono da rota, monta o remote, delega. Responsabilidade: *decidir quem serve cada rota e ceder o controle da subárvore*. Sem lógica de feature.
- **Store bridge (adapter)** — interface fina entre o Redux legado e as ilhas novas (selectors + actions tipadas). Responsabilidade: *expor o estado canônico às ilhas sem duplicá-lo e sem vazar a forma interna do Redux*.
- **Remote de squad** — feature migrada (function components + hooks) empacotada como remote, deployável isoladamente. Responsabilidade: *entregar uma feature nova consumível pelo host sem redeploy do host*.
- **App legado** — o sistema de classe original, esvaziado rota a rota até desaparecer.

## Decisões Arquiteturais

### D1. Estratégia: strangler-fig

- **Contexto:** Migrar tudo de uma vez (big-bang) vs incrementalmente com coexistência (strangler-fig). O usuário afirmou não poder parar de shippar.
- **Decisão:** Strangler-fig, rota a rota.
- **Justificativa técnica:** Cada rota migra e reverte isoladamente; risco fatiado.
- **Justificativa de negócio:** A restrição de não-freeze **elimina big-bang** — não há janela de congelamento a negociar.
- **Trade-offs aceitos:** Coexistência longa exige manter a fronteira (D2–D4) por meses. Toda a subárvore de decisões de big-bang (tamanho de freeze, corte único) sai de cena.

### D2. Fronteira de compatibilidade: route-level

- **Contexto:** Onde old e new se encontram — por rota ou por componente (misturados na mesma árvore).
- **Decisão:** Route-level. Uma rota inteira pertence ao legado ou a um remote.
- **Justificativa técnica:** Evita interleaving de dois runtimes React na mesma árvore; fronteira de composição única e clara.
- **Justificativa de negócio:** A rota é a unidade de valor que um squad entrega e pode reverter.
- **Trade-offs aceitos:** Migração é atômica por rota — uma rota grande vai inteira; não há migração parcial dentro de uma rota.

### D3. Estado compartilhado: bridge para o Redux existente

- **Contexto:** Ilhas novas precisam de estado do Redux legado. Duplicar o Redux no lado novo vs pontear para o store existente.
- **Decisão:** Bridge — as ilhas leem o Redux via adapter fino; sem duplicação.
- **Justificativa técnica:** Fonte de verdade única elimina divergência old↔new (o modo de falha típico). O adapter desacopla as ilhas da forma interna do Redux, permitindo desmontá-lo por último.
- **Justificativa de negócio:** Estado divergente em fluxo de receita = bug caro e difícil de rastrear; adapter é barato perto disso.
- **Trade-offs aceitos:** Acoplamento temporário das ilhas ao Redux (mediado pelo adapter) até a última rota migrar.

### D4. Propriedade do roteamento na coexistência: shell delega

- **Contexto:** Router legado caseiro + roteamento novo coexistindo — quem é dono da URL/history? Manter o legado, adotar o novo, ou um shell delegando.
- **Decisão:** Shell é dono do roteamento de topo e delega para old/new por rota.
- **Justificativa técnica:** Dois routers competindo por `history`/`popstate` quebram back/forward e duplicam entradas; um dono único no topo elimina a disputa.
- **Justificativa de negócio:** Navegação quebrada em produto de receita é incidente; centralizar o topo é a mitigação barata e definitiva.
- **Trade-offs aceitos:** Shell vira dependência comum a todos os squads; o contrato de delegação precisa de disciplina de versionamento. Aceito por ser fino (mapa rota→dono).

### D5. Build/deploy: Module Federation desde o início

- **Contexto:** Bundle único (mesmo com código separado) vs Module Federation (host + remotes) durante a transição.
- **Decisão:** Module Federation desde o começo — shell host, squads remotes.
- **Justificativa técnica:** MF é o próprio mecanismo de deploy independente; bundle único obrigaria rebuild do todo a cada mudança.
- **Justificativa de negócio:** Deploy independente por squad é o requisito primário; MF é condição necessária, não fase posterior.
- **Trade-offs aceitos:** Overhead de runtime (shared deps, React compartilhado host↔remotes) e gestão de versões de remotes. Custo intrínseco do requisito.

### D6. Estado local no lado novo (leaf reversível)

- **Contexto:** Estado *local* de uma ilha (o compartilhado vem do bridge, D3): Zustand, Context, ou Redux.
- **Decisão:** **Context agora** (default reversível). Estado compartilhado já vem do Redux via bridge; o local de uma ilha cabe em Context.
- **Trade-offs aceitos / gatilho de revisão:** Trocar Context por Zustand numa ilha é local e reversível. **Revisitar para Zustand se surgir estado cross-tree** dentro de uma ilha (compartilhamento entre subárvores distantes, onde Context re-renderiza em cascata). Não se compromete com migração Zustand agora — seria commitment prematuro de leaf.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Versões divergentes de React entre host e remotes → hooks/contexto quebram | 3 | 2 | 6 🔴 | React/ReactDOM como singleton no shared do MF; smoke test host+remote antes da 1ª rota real |
| Bridge vaza forma interna do Redux → impossível desmontar o Redux ao fim | 3 | 2 | 6 🔴 | Interface do adapter estreita e tipada; teste que garante que a ilha só toca a interface pública |
| Router legado e shell disputam `history` na coexistência | 3 | 2 | 6 🔴 | Shell é único dono de `history`; legado roda delegado (basename/memória) sem escrever no history global; teste de back/forward cruzando a fronteira |
| Time não domina Module Federation | 3 | 2 | 6 🔴 | Spike de 1-2 dias (shell + 1 remote trivial) antes da 1ª rota; par com quem já usou MF |
| Rota grande difícil de migrar atômica (route-level) | 2 | 2 | 4 🟡 | Começar por rotas pequenas; quebrar rota grande em sub-rotas se necessário |

## Testes

- **MF:** host monta e desmonta um remote sem vazar estado; React é singleton compartilhado.
- **Bridge:** ação no legado é visível na ilha nova via adapter e vice-versa; nenhuma cópia divergente do estado.
- **Roteamento:** navegação cruza old↔new pelo shell; back/forward consistente; sem entradas duplicadas de history.
- **Incrementalidade / deploy independente:** migrar/reverter uma rota não afeta outras; deploy de um remote não exige redeploy do host.
- Cada critério mensurável de Características vira um teste (deploy isolado, fonte única de estado, zero freeze).

## Notas de Fechamento

A spec fecha todas as pontas surgidas na entrevista; não há questões em aberto. D1–D5 estruturais com trade-off registrado; D6 leaf reversível fechado com default (Context) + gatilho (Zustand se surgir estado cross-tree). D1=strangler apagou toda a subárvore de big-bang (sem questão de janela de freeze).
