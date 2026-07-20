---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Encurtador de Links (greenfield)

## Visão Geral

Do zero: um encurtador onde o usuário cola uma URL longa, recebe um link curto e, ao ser acessado, é redirecionado. O fundador acredita que o produto pode chegar a milhões de links e quer estatísticas de clique. O sistema tem três operações — criar (escrita rara), redirecionar (leitura dominante) e ver estatísticas (leitura secundária) — com forte assimetria leitura/escrita.

A entrevista tratou as frases de superfície ("tem que ser rápido", "pode ficar grande", "queria ver as estatísticas") como pistas, não como requisitos fechados, e sondou os forks estruturais escondidos: mecânica de geração do código, colisão, razão leitura/escrita no redirect, aliases customizados vs códigos gerados, e caminho de gravação do clique. Nenhuma dessas pontas ficou em aberto.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Performance | Redirect é a operação quente e a cara do produto | Redirect com cache-hit < 50ms p99 |
| Scalability | Escala afirmada; leituras crescem muito acima das escritas | Read-path escala para 10k redirects/s sem depender do write DB |
| Availability | Link quebrado quebra a promessa; redirect não pode cair com subsistemas secundários | Redirect serve mesmo com analytics fora do ar |

**Confirmação com o usuário:** usei a elicitação de características para forçar a priorização — perguntei se a escala de "milhões" é meta de produto ou otimismo. O fundador confirmou ser meta; logo scalability entra no top 3. Se retratada, o design cairia para uma versão sem cache/fila (YAGNI).

**Consideradas, não priorizadas:** unguessability (enumerabilidade aceita para links públicos), i18n, custom domains.

## Arquitetura e Fluxo

- **Criação:** `SequenciadorDeCodigo` pega o próximo valor de um contador e o converte em base62; grava `codigo → urlDestino`. Alias customizado é validado por `GuardaDeAlias` e gravado no mesmo store.
- **Redirect:** `LeitorDeRedirect` tenta o cache de quentes primeiro; miss lê o store primário e repovoa o cache. O caminho de redirect nunca executa escrita.
- **Estatística:** cada redirect publica um evento de clique numa fila; `ContadorDeCliques` consome e agrega assíncrono.

## Estrutura de Componentes

- **SequenciadorDeCodigo** — converte o próximo número do contador em código base62. Responsabilidade: gerar um código curto e único por criação.
- **LeitorDeRedirect** — resolve código→destino com cache-first. Responsabilidade: entregar o destino no menor tempo possível.
- **GuardaDeAlias** — valida reservados/colisão de alias no keyspace compartilhado. Responsabilidade: admitir apenas aliases livres e permitidos.
- **ContadorDeCliques** — consome eventos e agrega cliques. Responsabilidade: contabilizar cliques sem entrar no caminho crítico do redirect.

## Decisões Arquiteturais

### D1. Geração via contador + base62

- **Contexto:** Alternativas de geração do código: aleatório, hash, contador em base62.
- **Decisão:** Contador monotônico codificado em base62.
- **Justificativa técnica:** Códigos curtos e sempre novos; unicidade vem da sequência, sem checagem por escrita.
- **Justificativa de negócio:** Custo mínimo por criação e código compacto; imprevisibilidade não é requisito para links públicos.
- **Trade-offs aceitos:** Código enumerável; contador é ponto de coordenação. Se imprevisibilidade virar requisito, migrar para aleatório — o que reabre D2.

### D2. Colisão — eliminada por construção (filho de D1)

- **Contexto:** O que ocorre quando dois códigos colidem; decisão dependente de D1.
- **Decisão:** Colisão-livre por construção — sem retry-on-collision para códigos gerados.
- **Justificativa técnica:** Resolver D1 como contador **apaga** o ramo de retry/checagem-de-unicidade que só a geração aleatória exigiria em cada escrita.
- **Justificativa de negócio:** Escrita sem custo de colisão; menos código para manter.
- **Trade-offs aceitos:** A garantia é vinculada a D1 — trocar para aleatório traz de volta a verificação de unicidade por escrita. (Rationale de dependência: "escolhido contador, dual-check nunca esteve em cena".)

### D3. Assimetria leitura/escrita — read-optimized

- **Contexto:** Redirects superam criações em ordens de grandeza; como sustentar o read-path.
- **Decisão:** Read-optimized com cache de códigos quentes; o redirect não atinge o write DB sem passar pelo cache.
- **Justificativa técnica:** A leitura domina; cachear tira o DB do caminho de latência do redirect.
- **Justificativa de negócio:** A latência do redirect é o produto e a base da escala prometida.
- **Trade-offs aceitos:** Gestão de invalidação de cache; janela curta de inconsistência ao trocar destino (raro, aceitável).

### D4. Aliases customizados — keyspace compartilhado

- **Contexto:** Como aliases do usuário coexistem com códigos gerados.
- **Decisão:** Keyspace compartilhado, com checagem de reservados/colisão apenas na criação do alias.
- **Justificativa técnica:** Um único espaço mantém o redirect uniforme; a checagem recai na escrita rara do alias.
- **Justificativa de negócio:** Aliases são diferencial pedido; não vale bifurcar o path de redirect.
- **Trade-offs aceitos:** Alias pode colidir com código gerado futuro — mitigado marcando o slug como ocupado / reservando faixas.

### D5. Analytics — escrita assíncrona por fila

- **Contexto:** Registrar clique de forma síncrona no redirect vs assíncrona/fila.
- **Decisão:** Assíncrona — enfileirar o evento e retornar; agregar fora do caminho crítico.
- **Justificativa técnica:** Contar clique é fire-and-forget; síncrono adicionaria uma escrita ao redirect, contradizendo D3.
- **Justificativa de negócio:** Preserva a latência (a promessa de escala) e ainda entrega as estatísticas pedidas.
- **Trade-offs aceitos:** Métricas eventualmente consistentes; risco de perda de evento sob falha — mitigado com fila durável.

### D6. "Milhões de links" — característica confirmada

- **Contexto:** A escala afirmada é prioridade real ou prematura?
- **Decisão:** Scalability + performance no top-3 por confirmação explícita do fundador.
- **Justificativa técnica:** As características priorizadas são o desempate de D1/D3/D5.
- **Justificativa de negócio:** Investir em cache/fila casa com a meta; sem confirmação, o design seria mais simples.
- **Trade-offs aceitos:** Complexidade antecipada de cache/fila — justificada pela confirmação do usuário.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Contador como ponto único de coordenação sob escrita alta | 3 | 2 | 6 🔴 | Blocos de IDs pré-alocados por nó; spike antes da task de sequência |
| Enumerabilidade de códigos (scraping de links) | 2 | 2 | 4 🟡 | Aceito para links públicos; modo aleatório opt-in se privacidade for requisito |
| Perda de eventos de clique na fila | 2 | 2 | 4 🟡 | Fila durável, monitor de backlog, reprocessamento |
| Cache serve destino velho após edição | 2 | 1 | 2 🟢 | TTL curto + invalidação no update |

## Testes

- Sequência concorrente: N criações produzem N códigos distintos (unicidade por construção).
- Redirect: p99 < 50ms com cache; miss repovoa cache mantendo correção.
- Alias: reservado/colidente rejeitado na criação; válido resolve pelo mesmo path dos gerados.
- Analytics: redirect retorna sem esperar a escrita do clique; contadores convergem após drenar a fila.
- Availability: com o contador de cliques parado, o redirect continua servindo.
