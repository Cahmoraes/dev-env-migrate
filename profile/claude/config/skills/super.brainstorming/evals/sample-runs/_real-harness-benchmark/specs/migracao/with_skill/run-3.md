---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Migração do React legado para hooks + Module Federation (strangler)

## Visão Geral

Base React 16 de 5 anos: class components, Redux, bundle Webpack único, router caseiro. Sistema crítico de receita que **não pode congelar** — o time precisa continuar entregando features durante a migração. Objetivo: modernizar para function components + hooks e dividir o app em Module Federation, permitindo deploy independente por squad.

O trabalho de converter classes em hooks é mecânico e por-componente. O que define o sucesso da migração é como a **coexistência old/new** é desenhada: a fronteira onde eles se tocam, o compartilhamento de estado através dessa fronteira, e a propriedade da navegação enquanto os dois runtimes vivem lado a lado.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Continuity (no-freeze) | App revenue-critical; o negócio não tolera janela de congelamento de features | Nenhum freeze em nenhum momento; entrega de features contínua durante a migração |
| Deployability por squad | O objetivo declarado é times shippando de forma independente | Um remote deploya sem rebuild/redeploy do host ou de outros remotes |
| Integridade de estado na coexistência | Redux legado e ilhas novas coexistem por meses; estado duplicado diverge em silêncio | Uma única fonte de verdade do estado compartilhado durante toda a coexistência |

**Consideradas, não priorizadas:** Performance (bundle atual aceitável; overhead de MF não é gargalo hoje), i18n/escala geográfica (fora de escopo).

## Arquitetura e Fluxo

```
        Browser URL
            │
            ▼
   ┌─────────────────┐   O shell é o host MF e o único dono do topo do roteamento.
   │  Shell (host)   │   Para cada rota, decide: legado ou remote?
   └───────┬─────────┘
     ┌─────┴──────┐
  legado        remote(s)
     │              │
 class+Redux    hooks+Context
     │              │
     └──── bridge ──┘   Ilhas novas leem o Redux via adapter fino (fonte única).
```

- **Shell (host)** resolve a URL, escolhe o dono da rota e cede o subtree. Uma rota é 100% legado ou 100% remote.
- Estado atravessa a fronteira via **store bridge**; nenhuma segunda fonte de verdade é criada.
- A ilha legada encolhe conforme rotas migram; a migração termina quando o legado não serve mais nenhuma rota.

## Estrutura de Componentes

- **Shell de topo (host MF)** — mapeia URL → dono da rota e delega. Responsabilidade: *entregar a cada path o seu dono (legado ou remote) e ceder-lhe a subárvore*. Não contém feature.
- **Store bridge (adapter de estado)** — ponte tipada e fina entre o Redux legado e as ilhas. Responsabilidade: *dar às ilhas leitura/escrita do estado canônico sem duplicá-lo e sem expor a forma interna do Redux*.
- **Remote de squad** — feature migrada para hooks, empacotada como remote independente. Responsabilidade: *entregar uma feature nova consumível pelo host sem redeploy do host*.
- **Ilha legada** — o app de classe original, drenado rota a rota.

## Decisões Arquiteturais

### D1. Estratégia de migração: strangler-fig (não big-bang)

- **Contexto:** Reescrita e corte único (big-bang) vs migração incremental com coexistência (strangler-fig). A restrição declarada foi "não podemos parar de shippar".
- **Decisão:** Strangler-fig — migrar rota a rota, estrangulando o legado.
- **Justificativa técnica:** Portar e reverter por rota; risco fatiado, blast radius controlado.
- **Justificativa de negócio:** A restrição de não-freeze descarta big-bang de imediato — big-bang exige um congelamento que o negócio recusa.
- **Trade-offs aceitos:** Coexistência prolongada com custo de manter a fronteira (D2–D4). Nenhuma questão de janela/tamanho de freeze existe (subárvore de big-bang eliminada).

### D2. Fronteira de compatibilidade: por rota

- **Contexto:** old e new se encontram por rota (rota inteira de um lado) ou por componente (misturados na árvore)?
- **Decisão:** Route-level — uma rota pertence inteiramente ao legado ou a um remote.
- **Justificativa técnica:** Sem interleaving de dois reconcilers React na mesma árvore; fronteira de composição limpa e testável.
- **Justificativa de negócio:** A rota é a unidade que um squad migra, entrega e reverte.
- **Trade-offs aceitos:** Migração atômica por rota; uma rota grande migra inteira, sem meio-termo dentro dela.

### D3. Estado compartilhado através da fronteira: bridge do Redux (sem duplicação)

- **Contexto:** Ilhas novas precisam de estado hoje no Redux legado. Duplicar o Redux no lado novo vs pontear o store existente.
- **Decisão:** Bridge — ilhas leem o Redux existente via adapter fino; fonte de verdade única.
- **Justificativa técnica:** Uma fonte só elimina divergência de estado — o ponto onde migrações costumam quebrar. O adapter isola as ilhas da forma interna do Redux, então o Redux pode ser o último a sair sem reescrever as ilhas.
- **Justificativa de negócio:** Estado inconsistente em fluxo de receita gera bugs caros e obscuros; o adapter custa uma fração disso.
- **Trade-offs aceitos:** Ilhas dependem do Redux (via adapter) durante a coexistência; desacoplamento só se completa quando a última rota migra.

### D4. Propriedade do roteamento durante a coexistência: shell delega

- **Contexto:** Router legado caseiro + roteamento novo — quem controla URL/history? Manter o legado, adotar o novo, ou um shell que delega.
- **Decisão:** O shell possui o roteamento de topo e delega para old/new por rota.
- **Justificativa técnica:** Dois routers disputando `history`/`popstate` corrompem back/forward e criam entradas duplicadas; um único dono no topo resolve na raiz. Abaixo, cada dono roteia internamente à vontade.
- **Justificativa de negócio:** Navegação quebrada em produto de receita é incidente de produção; centralizar o topo é a mitigação definitiva e barata.
- **Trade-offs aceitos:** O shell é dependência comum a todos os squads; o contrato de delegação exige coordenação de versão. Aceito por ser fino (mapa rota→dono, não lógica de negócio).

### D5. Integração de build: Module Federation (host/remotes) desde o início

- **Contexto:** Bundle único (mesmo dividindo o código) vs Module Federation com host e remotes durante a transição.
- **Decisão:** Module Federation desde o começo — shell = host, squads = remotes.
- **Justificativa técnica:** MF *é* o mecanismo de deploy independente; um bundle único exigiria rebuild/redeploy do todo a cada mudança.
- **Justificativa de negócio:** Deploy independente por squad é o requisito primário — MF é condição necessária, não uma otimização posterior.
- **Trade-offs aceitos:** Overhead de runtime (shared deps, React compartilhado entre host e remotes) e versionamento de remotes. Custo intrínseco do requisito de deploy independente.

### D6. Biblioteca de estado no lado novo (leaf reversível)

- **Contexto:** Estado *local* dentro de uma ilha (o compartilhado vem do bridge, D3): Zustand, Context ou Redux?
- **Decisão:** **Context agora** (default reversível). Como o estado compartilhado já chega via bridge, o estado local de uma ilha é pequeno o bastante para Context.
- **Trade-offs aceitos / gatilho de revisão:** Reversível — trocar Context por Zustand numa ilha é local e barato. **Revisitar para Zustand se surgir estado cross-tree** (compartilhamento entre subárvores distantes dentro de uma ilha, onde Context provoca re-render em cascata). Não se compromete com uma migração Zustand agora: comprometer cedo seria o erro clássico de leaf-first.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| React em versões divergentes entre host e remotes → hooks/contexto quebram | 3 | 2 | 6 🔴 | Singleton de React/ReactDOM no shared do MF; smoke test carregando um remote no host antes da 1ª rota real |
| Bridge vaza a forma interna do Redux → Redux não pode ser desmontado no fim | 3 | 2 | 6 🔴 | Adapter com interface fina e tipada, revisada como fronteira; teste garantindo que a ilha só toca a interface pública |
| Router legado e shell disputam `history` na coexistência | 3 | 2 | 6 🔴 | Shell único dono de `history` (D4); legado roda delegado (basename/memória) sem escrever no history global; teste de back/forward atravessando a fronteira |
| Time sem domínio de Module Federation | 3 | 2 | 6 🔴 | Spike de 1-2 dias (shell + 1 remote trivial) antes da 1ª rota; par com alguém com experiência em MF |
| Rota grande difícil de migrar como unidade atômica (route-level) | 2 | 2 | 4 🟡 | Priorizar rotas pequenas para amadurecer o pipeline; sub-dividir rotas grandes quando preciso |

## Testes

- **Fronteira MF:** host monta/desmonta um remote sem vazar estado; React singleton compartilhado.
- **Bridge de estado:** ação no legado observável na ilha nova (e vice-versa) via adapter; sem cópia divergente.
- **Roteamento:** navegação cruza old↔new pelo shell; back/forward consistente; sem entradas duplicadas de history.
- **Incrementalidade e deploy:** migrar/reverter uma rota não afeta as demais; um remote deploya sem redeploy do host.
- **Por característica:** cada critério mensurável da tabela vira teste (deploy independente, fonte única de estado, zero freeze).

## Notas de Fechamento

Todas as decisões duras da entrevista estão resolvidas — a spec não tem seção de questões em aberto. D1–D5 são estruturais, resolvidas com trade-off explícito; D6 é leaf reversível, fechado com o default seguro (Context) e o gatilho de revisão nomeado (Zustand se surgir estado cross-tree). D1=strangler eliminou de saída toda a subárvore de big-bang — não há questão de janela de freeze.
