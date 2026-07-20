---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Encurtador de URL (link-shortener)

## Visão Geral

Produto novo (greenfield): o usuário cola uma URL longa, recebe um link curto e, quando alguém clica, é redirecionado para o destino original. O fundador projeta escala ("milhões de links") e quer estatísticas de clique. Três operações centrais: **criar link** (write, raro), **redirecionar** (read, dominante) e **consultar estatísticas** (read, secundário).

A entrevista partiu do fraseado de superfície ("pode ficar grande / tem que ser rápido") e extraiu as decisões-raiz que ele assume away: como o código curto é gerado, o que acontece em colisão, a assimetria leitura/escrita do redirect, como aliases customizados coexistem com códigos gerados, e como o clique é contabilizado sem penalizar o redirect.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Performance | Redirect é a operação quente; latência é a experiência do produto | Redirect p99 < 50ms para código em cache |
| Scalability | Fundador afirmou "milhões de links"; leituras crescem muito acima de escritas | Suporta 10k redirects/s com escrita horizontal do read-path |
| Availability | Um link morto é uma promessa quebrada; redirect não pode depender do caminho de escrita | Redirect serve mesmo com o pipeline de analytics indisponível |

**Confirmação com o usuário:** o fundador confirmou que a escala é um objetivo real do produto (não retórica), então scalability entra no top 3. Se fosse retórica, cairia para "considerada, não priorizada" e o design evitaria a infra de cache/fila desde já (YAGNI).

**Consideradas, não priorizadas:** security/unguessability (códigos sequenciais são enumeráveis; aceito para links públicos — ver Riscos), i18n (sem expansão prevista).

## Arquitetura e Fluxo

- **Write path (criar link):** `GeradorDeCodigo` obtém o próximo valor de um contador monotônico, codifica em base62 e persiste o par `codigo → urlLonga` no store primário. Alias customizado passa pelo mesmo store com verificação de reservados/colisão.
- **Read path (redirect):** `ResolvedorDeRedirect` consulta primeiro o cache de códigos quentes; miss cai no store primário e re-popula o cache. O redirect **nunca** escreve no store no caminho crítico.
- **Analytics:** cada redirect enfileira um evento de clique; um `ConsumidorDeCliques` agrega assíncrono no store de estatísticas, fora do caminho de latência do redirect.

## Estrutura de Componentes

- **GeradorDeCodigo** — produz o código curto a partir do contador + base62. Responsabilidade: transformar um número de sequência em um código único e curto.
- **ResolvedorDeRedirect** — resolve `codigo → urlLonga` com cache-first. Responsabilidade: entregar o destino de um código no menor tempo possível.
- **RegistroDeAlias** — valida e persiste aliases customizados no mesmo keyspace. Responsabilidade: garantir que um alias escolhido pelo usuário é livre e não-reservado.
- **ColetorDeCliques** — enfileira e agrega eventos de clique. Responsabilidade: contabilizar cliques sem tocar o caminho crítico do redirect.

## Decisões Arquiteturais

### D1. Geração de código via contador monotônico + base62

- **Contexto:** Alternativas para produzir o código curto: aleatório, hash da URL, ou contador sequencial codificado em base62.
- **Decisão:** Contador monotônico codificado em base62.
- **Justificativa técnica:** Códigos curtos e crescentes; unicidade garantida pela sequência — sem verificação de unicidade por escrita.
- **Justificativa de negócio:** Menor custo por escrita e código mais curto = link mais vendável; sem requisito de imprevisibilidade para links públicos.
- **Trade-offs aceitos:** Códigos são enumeráveis (adivinháveis em sequência) — aceitável para links públicos; se surgir requisito de unguessability, trocar para aleatório+checagem (reabre D2). Contador é ponto de coordenação — mitigado alocando blocos de IDs por nó.

### D2. Colisão: livre por construção (filho de D1)

- **Contexto:** O que acontece quando dois códigos colidem. Depende diretamente de D1.
- **Decisão:** Colisão-livre por construção — o contador nunca repete, então não há caminho de retry-on-collision para códigos gerados.
- **Justificativa técnica:** Resolver D1 como contador **elimina** o ramo de retry/checagem-de-unicidade que a geração aleatória exigiria em toda escrita.
- **Justificativa de negócio:** Zero custo de colisão no write path; simplicidade operacional.
- **Trade-offs aceitos:** A garantia depende da integridade do contador; se D1 mudar para aleatório, a checagem de unicidade por escrita volta à mesa. (Dependência registrada: "escolhido contador, logo retry nunca esteve em cena".)

### D3. Assimetria leitura/escrita — read-optimized

- **Contexto:** Redirects superam criações em ordens de grandeza. Como servir o read path sob a escala afirmada.
- **Decisão:** Read-optimized — cache de códigos quentes; o redirect não pode atingir o DB de escrita sem cache no caminho crítico.
- **Justificativa técnica:** A operação dominante é a leitura; cachear os códigos quentes remove o DB do caminho de latência do redirect.
- **Justificativa de negócio:** Latência de redirect é o produto; sustenta a promessa de escala sem sobredimensionar o write DB.
- **Trade-offs aceitos:** Complexidade de invalidação de cache; janela de inconsistência curta em atualização de destino (aceitável — destinos raramente mudam).

### D4. Aliases customizados — keyspace compartilhado

- **Contexto:** Como aliases escolhidos pelo usuário coexistem com códigos gerados.
- **Decisão:** Keyspace compartilhado com checagem de reservados/colisão na criação do alias.
- **Justificativa técnica:** Um único espaço de resolução mantém o read path uniforme; a checagem só ocorre na escrita (rara) do alias.
- **Justificativa de negócio:** Aliases customizados são um diferencial pedido; keyspace único evita bifurcar a lógica de redirect.
- **Trade-offs aceitos:** Alias pode colidir com um código gerado futuro — mitigado reservando faixas ou marcando o código como ocupado no store.

### D5. Caminho de escrita de analytics — assíncrono via fila

- **Contexto:** Como o clique é contabilizado. Síncrono no redirect vs assíncrono/fila.
- **Decisão:** Assíncrono — o redirect enfileira o evento e retorna; a agregação ocorre fora do caminho crítico.
- **Justificativa técnica:** Contar clique é fire-and-forget; sincronizá-lo adicionaria uma escrita ao caminho de latência do redirect, contradizendo D3.
- **Justificativa de negócio:** Preserva a latência do redirect (a promessa de escala) enquanto ainda entrega estatísticas.
- **Trade-offs aceitos:** Estatísticas são eventualmente consistentes (atraso de segundos); perda de eventos possível se a fila cair — aceitável para métrica de clique, mitigado com fila durável.

### D6. "Milhões de links" como característica priorizada

- **Contexto:** A escala afirmada é prioridade real ou prematura (YAGNI)?
- **Decisão:** Scalability + performance são top-3 **porque o fundador confirmou** a escala como objetivo de produto.
- **Justificativa técnica:** As características priorizadas são o critério de desempate das decisões D1/D3/D5.
- **Justificativa de negócio:** Alinha o investimento em cache/fila ao objetivo declarado; se a escala fosse retórica, o design seria mais simples.
- **Trade-offs aceitos:** Investir em cache/fila desde já custa complexidade — justificado pela confirmação explícita do usuário.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Contador como ponto único de coordenação sob alta escrita | 3 | 2 | 6 🔴 | Alocação de blocos de IDs por nó; validar em spike antes da task de geração |
| Códigos sequenciais enumeráveis (scraping de links) | 2 | 2 | 4 🟡 | Aceito para links públicos; oferecer modo aleatório opt-in se surgir requisito de privacidade |
| Perda de eventos de clique se a fila cair | 2 | 2 | 4 🟡 | Fila durável com persistência; monitorar backlog |
| Invalidação de cache incorreta serve destino velho | 2 | 1 | 2 🟢 | TTL curto + invalidação na atualização de destino |

## Testes

- Geração: N escritas concorrentes produzem N códigos distintos (unicidade por construção).
- Redirect: p99 < 50ms para código em cache; miss re-popula o cache.
- Alias: alias reservado/colidente é rejeitado na criação; alias válido resolve pelo mesmo path dos gerados.
- Analytics: redirect retorna sem esperar a escrita de clique; contagem converge após drenar a fila.
- Availability: com o pipeline de analytics parado, o redirect continua servindo.
