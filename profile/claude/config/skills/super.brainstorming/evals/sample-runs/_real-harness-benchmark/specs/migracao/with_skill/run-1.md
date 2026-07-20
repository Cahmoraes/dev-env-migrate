---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Migração incremental React legado → hooks + Module Federation

## Visão Geral

App React 16 com 5 anos de idade: class components, Redux, bundle único Webpack, router caseiro. É revenue-critical e **não pode ter freeze de big-bang** — features precisam continuar sendo enviadas durante toda a migração. Objetivo: modernizar para function components + hooks e dividir o app via Module Federation para que squads façam deploy independente.

O núcleo da migração não é "trocar class por hooks" (mecânico, por-componente) — é **sobreviver à janela de coexistência**: por quanto tempo old e new convivem, como compartilham estado, e quem é dono da URL enquanto os dois existem. É onde a migração de fato quebra.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Continuity / no-freeze (Deployability) | App é revenue-critical; time não pode parar de shippar features durante a migração | Nenhuma janela de freeze; cada squad faz deploy do seu remote independentemente, sem redeploy do host |
| Reliability / consistência de estado | Old (Redux) e new coexistem por meses; estado duplicado = bug de fonte-de-verdade divergente | Uma única fonte de verdade para o estado compartilhado; zero duplicação Redux↔new durante a coexistência |
| Evolvability / incrementalidade | Migração roda por trilhas; cada rota deve poder ser portada e revertida isoladamente | Uma rota migrada é revertível sem tocar as demais; blast radius = 1 rota |

**Consideradas, não priorizadas:** Performance (o bundle atual já é aceitável; MF adiciona overhead de runtime marginal, não gargalo agora), i18n (fora de escopo desta migração).

## Arquitetura e Fluxo

```
                 ┌──────────────────────────────┐
                 │   Shell (MF host)            │
                 │   - dono do roteamento top   │
                 │   - delega por rota          │
                 └──────────┬───────────────────┘
             rota legada    │    rota migrada
          ┌─────────────────┴─────────────────┐
          ▼                                     ▼
  ┌───────────────┐                    ┌────────────────┐
  │ Ilha legada   │                    │ Remote (squad) │
  │ class + Redux │◄──── bridge ──────►│ hooks + Context│
  │ (single bundle│   (adapter fino)   │ lê Redux via   │
  │  progressiva- │                    │ store bridge   │
  │  mente vaziada│                    └────────────────┘
  └───────────────┘
```

- O **Shell** possui o roteamento de topo e delega cada rota para a ilha legada OU para um remote migrado. Uma rota é servida por exatamente um dos dois — nunca misturada mid-tree.
- Estado compartilhado atravessa a fronteira por um **adapter de store**: as ilhas novas leem o Redux existente; não há segunda fonte de verdade.
- À medida que rotas são portadas, a subárvore legada esvazia; a migração termina quando nenhuma rota é servida pela ilha legada.

## Estrutura de Componentes

- **Shell de roteamento (MF host)** — resolve a URL, decide old-vs-new por rota, monta o remote correspondente. Responsabilidade: *dado um path, entregar o dono daquela rota (legado ou remote) e ceder a ele o subtree*. Não renderiza feature; só delega.
- **Store bridge (adapter de estado)** — expõe o Redux legado às ilhas novas via uma interface fina (selector + dispatch tipados), sem que o new code conheça a forma interna do Redux. Responsabilidade: *dar às ilhas novas leitura/escrita do estado canônico sem duplicá-lo*.
- **Remote de squad (ilha migrada)** — feature portada para function components + hooks, empacotada como remote MF, deployável de forma independente. Responsabilidade: *entregar uma feature migrada consumível pelo host sem redeploy do host*.
- **Ilha legada** — o app antigo (class + Redux), progressivamente esvaziado conforme rotas migram.

## Decisões Arquiteturais

### D1. Estratégia de migração: strangler-fig (não big-bang)

- **Contexto:** App revenue-critical que não pode parar de shippar. Alternativas: big-bang (reescrever e trocar de uma vez) vs strangler-fig (migrar rota a rota, old e new coexistindo).
- **Decisão:** Strangler-fig. Rotas migram incrementalmente; a subárvore legada é estrangulada até esvaziar.
- **Justificativa técnica:** Permite portar e reverter uma rota isoladamente; blast radius por rota.
- **Justificativa de negócio:** A restrição "não pode ter freeze" elimina big-bang de saída — big-bang exige uma janela de congelamento de features que o negócio não aceita.
- **Trade-offs aceitos:** Convivência old/new prolongada (meses), com o custo de manter a fronteira de compatibilidade (D2–D4) durante toda a transição. Elimina qualquer questão de "tamanho da janela de freeze" — ela não existe.

### D2. Fronteira de compatibilidade: por rota (route-level), não por componente

- **Contexto:** Com strangler, old e new coexistem. Onde se encontram? Por rota (uma rota é inteiramente old ou inteiramente new) vs por componente (old e new misturados na mesma árvore).
- **Decisão:** Route-level. Uma rota é de propriedade do legado OU de um remote, nunca misturada mid-tree.
- **Justificativa técnica:** Fronteira de composição limpa; evita interleaving de dois runtimes React na mesma árvore de componentes (dois reconcilers, contextos conflitantes).
- **Justificativa de negócio:** Unidade de migração = rota = unidade de valor entregável e revertível por um squad.
- **Trade-offs aceitos:** Uma rota grande é migrada como um todo (não pode migrar meio-a-meio); granularidade de migração é a rota, não o componente.

### D3. Estado compartilhado através da fronteira: bridge do Redux existente (não duplicar)

- **Contexto:** As ilhas novas precisam de estado que hoje vive no Redux legado (sessão, usuário, carrinho...). Duplicar o Redux no lado novo vs criar uma ponte para o store existente.
- **Decisão:** Bridge. As ilhas novas leem o Redux existente através de um adapter fino; não há fonte de verdade duplicada.
- **Justificativa técnica:** Uma única fonte de verdade evita divergência de estado entre old e new — o modo de falha clássico de migração. O adapter isola o new code da forma interna do Redux, então o Redux pode ser desmontado por último sem reescrever as ilhas.
- **Justificativa de negócio:** Estado divergente = bugs invisíveis em fluxo revenue-critical; o custo de um adapter é muito menor que o de reconciliar dois stores.
- **Trade-offs aceitos:** As ilhas novas dependem do Redux durante a coexistência (acoplamento temporário mediado pelo adapter); o Redux só sai quando a última rota migrar.

### D4. Propriedade do roteamento durante a coexistência: shell delega

- **Contexto:** Com old (router caseiro) e new coexistindo, quem é dono da URL e do history? Manter o router legado, adotar o novo router, ou um shell que delega.
- **Decisão:** O **Shell** possui o roteamento de topo e delega para old/new por rota.
- **Justificativa técnica:** Dois routers disputando `history`/`popstate` corrompem a navegação (back-button quebrado, entradas duplicadas). Um único dono do topo elimina a disputa; abaixo dele, cada dono de rota roteia internamente à vontade.
- **Justificativa de negócio:** Navegação quebrada em app revenue-critical é incidente de produção; centralizar o topo é a mitigação barata.
- **Trade-offs aceitos:** O shell vira um ponto central que todo squad depende; mudanças no contrato de delegação do shell precisam de coordenação. Aceito porque é fino (mapa rota→dono), não lógica de feature.

### D5. Integração de build: Module Federation (host/remotes) desde o início

- **Contexto:** Como o split é construído/deployado durante a transição? Bundle único (mesmo com o código dividido) vs Module Federation com host e remotes.
- **Decisão:** Module Federation desde o começo — shell = host, squads = remotes.
- **Justificativa técnica:** MF *é* o mecanismo de deploy independente; um bundle único não entrega o requisito, pois qualquer mudança exige rebuild/redeploy do todo.
- **Justificativa de negócio:** "Squads fazem deploy independente" é o requisito primário — MF é a condição necessária, não uma otimização posterior.
- **Trade-offs aceitos:** Overhead de runtime de MF (shared deps, versão de React compartilhada entre host e remotes), complexidade de versionamento de remotes. Aceito como custo intrínseco do requisito de deploy independente.

### D6. Biblioteca de estado no lado novo (leaf reversível)

- **Contexto:** Dentro de uma ilha migrada, o estado *local* (não compartilhado via bridge) usa o quê? Zustand, Context, ou continuar no Redux.
- **Decisão:** **Context agora** (default reversível). O estado compartilhado já vem do Redux via bridge (D3); o estado local de uma ilha é pequeno o suficiente para Context.
- **Trade-offs aceitos / gatilho de revisão:** Reversível — trocar Context por Zustand numa ilha é local e barato. **Revisitar para Zustand se surgir estado cross-tree** (estado compartilhado entre subárvores distantes dentro de uma mesma ilha, onde Context causa re-render em cascata). Não se compromete com uma migração Zustand agora: seria commitment prematuro de leaf.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Dois React runtimes (host + remote) com versões divergentes → hooks quebram / estado de contexto perdido | 3 | 2 | 6 🔴 | Singleton de React/ReactDOM no shared config do MF; teste de fumaça carregando um remote no host antes da primeira rota real |
| Adapter de store (bridge) vaza a forma interna do Redux para as ilhas → Redux não pode ser desmontado no fim | 3 | 2 | 6 🔴 | Interface do adapter fina e tipada (selectors + actions nomeadas), revisada como fronteira; teste que garante que a ilha só toca a interface, nunca o store cru |
| Disputa de history entre router legado e roteamento do shell durante a transição | 3 | 2 | 6 🔴 | Shell é o único dono de `history` no topo (D4); router legado roda em modo delegado (memória/basename) dentro da ilha, sem escrever no history global; teste de back/forward atravessando a fronteira |
| Time não domina Module Federation (config de shared deps, versionamento de remotes) | 3 | 2 | 6 🔴 | Spike de 1-2 dias montando shell+1 remote trivial antes da primeira rota real; par com quem já usou MF |
| Rota grande difícil de migrar como unidade atômica (D2 route-level) | 2 | 2 | 4 🟡 | Priorizar rotas pequenas primeiro para amadurecer o pipeline; quebrar rota grande em sub-rotas se necessário |

## Testes

- **Fronteira MF:** host carrega um remote e o desmonta sem vazar estado; React é singleton (versão compartilhada).
- **Bridge de estado:** uma ação disparada no legado é observável na ilha nova via adapter, e vice-versa — uma única fonte de verdade (sem divergência).
- **Roteamento:** navegação atravessa old↔new pelo shell; back/forward do browser consistente; nenhuma entrada duplicada de history.
- **Incrementalidade:** migrar uma rota não quebra as demais; reverter uma rota migrada volta ao legado sem tocar outras.
- **Por característica:** cada critério mensurável da tabela de Características vira um teste (deploy independente de remote; zero duplicação de estado; blast radius = 1 rota).

## Notas de Fechamento

Todas as decisões duras da entrevista estão resolvidas nesta spec — não há seção de questões em aberto. D1–D5 são estruturais, resolvidas com trade-off. D6 é leaf reversível, resolvido com o default seguro (Context) e o gatilho de revisão nomeado (Zustand se surgir estado cross-tree). D1=strangler eliminou de saída toda a subárvore de big-bang (não há questão de janela de freeze).
