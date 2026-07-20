---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Serviço de Links Curtos

## Visão Geral

Greenfield: um serviço que recebe uma URL longa e devolve um código curto; ao acessar o código, o cliente é redirecionado ao destino. O fundador quer suportar "milhões de links" e ver estatísticas de clique. O sistema é fortemente assimétrico — poucas escritas (criação), muitíssimas leituras (redirect).

Durante a entrevista, o fraseado inicial ("rápido", "pode crescer", "queria ver cliques") foi tratado como superfície. Como especialista, sondei os forks escondidos abaixo dele: a mecânica de geração do código, o comportamento em colisão, a razão leitura/escrita no redirect, a convivência entre aliases customizados e códigos gerados, e o caminho de gravação das estatísticas.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Performance | O redirect é a jornada crítica; qualquer latência é sentida pelo usuário final | Redirect com hit de cache < 40ms p99 |
| Scalability | Escala afirmada pelo fundador; volume de leitura desacoplado do de escrita | Read-path escala horizontalmente até 10k req/s sem tocar o write DB |
| Availability | Redirect é o coração do negócio; não pode cair junto com subsistemas secundários | Redirect independe da disponibilidade do pipeline de analytics |

**Confirmação com o usuário:** perguntei explicitamente se "milhões de links" é meta de produto ou entusiasmo; o fundador confirmou que é meta. Por isso scalability é priorizada — caso contrário seria adiada (evitar cache/fila prematuros).

**Consideradas, não priorizadas:** unguessability dos códigos (aceita-se enumerabilidade em links públicos), i18n, multi-tenant.

## Arquitetura e Fluxo

1. **Criar link:** o `EmissorDeCodigo` toma o próximo valor de uma sequência e o converte para base62; grava `codigo → destino`. Aliases passam pelo `ValidadorDeAlias` antes de gravar no mesmo store.
2. **Redirecionar:** o `ResolvedorDeLink` busca no cache de quentes; em miss lê o store e reidrata o cache. Nenhuma escrita no caminho do redirect.
3. **Contabilizar clique:** o redirect publica um evento em fila; o `AgregadorDeCliques` consome e atualiza contadores de forma assíncrona.

## Estrutura de Componentes

- **EmissorDeCodigo** — converte o próximo número de sequência em código base62. Responsabilidade: emitir um código único e curto por criação.
- **ResolvedorDeLink** — resolve código para destino com estratégia cache-first. Responsabilidade: devolver o destino no menor tempo possível.
- **ValidadorDeAlias** — verifica reservados e colisão de alias no keyspace compartilhado. Responsabilidade: aceitar apenas aliases livres e permitidos.
- **AgregadorDeCliques** — consome eventos de clique e agrega estatísticas. Responsabilidade: contar cliques fora do caminho crítico do redirect.

## Decisões Arquiteturais

### D1. Código gerado por sequência + base62

- **Contexto:** Formas de gerar o código: aleatório, hash da URL, ou contador/sequência em base62.
- **Decisão:** Sequência monotônica codificada em base62.
- **Justificativa técnica:** Códigos curtos, sempre novos; unicidade decorre da sequência.
- **Justificativa de negócio:** Barato por escrita e visualmente compacto; sem necessidade de imprevisibilidade para links públicos.
- **Trade-offs aceitos:** Códigos previsíveis/enumeráveis; a sequência é ponto de coordenação. Se imprevisibilidade virar requisito, muda-se para aleatório e D2 reabre.

### D2. Estratégia de colisão — inexistente por construção (filho de D1)

- **Contexto:** O que fazer quando dois códigos colidem — depende de D1.
- **Decisão:** Colisão-livre por construção; não há retry-on-collision para códigos gerados.
- **Justificativa técnica:** Como D1 usa sequência, cada código é único; o ramo "retry / checagem de unicidade por escrita" (necessário só no modo aleatório) é eliminado.
- **Justificativa de negócio:** Escrita sem custo de colisão, operação previsível.
- **Trade-offs aceitos:** Depende da integridade da sequência; a escolha de D1 torna esta decisão vinculante — trocar D1 traz de volta a checagem de unicidade.

### D3. Assimetria leitura/escrita — otimizado para leitura

- **Contexto:** Redirects >> criações; como sustentar o read-path na escala afirmada.
- **Decisão:** Read-optimized com cache de códigos quentes; o redirect não deve atingir o DB de escrita sem passar pelo cache.
- **Justificativa técnica:** A leitura domina; cachear remove o DB do caminho de latência.
- **Justificativa de negócio:** Latência de redirect é a experiência central e a base da escala prometida.
- **Trade-offs aceitos:** Invalidez de cache a gerenciar; pequena janela de inconsistência ao alterar destino (raro, tolerável).

### D4. Aliases customizados — mesmo keyspace dos gerados

- **Contexto:** Como aliases do usuário convivem com códigos gerados.
- **Decisão:** Keyspace compartilhado, com checagem de reservados/colisão só na criação do alias.
- **Justificativa técnica:** Read-path uniforme (um só espaço de resolução); custo de checagem fica na escrita rara.
- **Justificativa de negócio:** Aliases são diferencial pedido; não vale duplicar o path de redirect.
- **Trade-offs aceitos:** Risco de alias colidir com código gerado futuro — mitigado marcando o slug como ocupado / reservando faixas.

### D5. Escrita de analytics — assíncrona por fila

- **Contexto:** Contabilizar clique de forma síncrona no redirect vs assíncrona.
- **Decisão:** Assíncrona — publicar evento em fila e retornar; agregação fora do caminho crítico.
- **Justificativa técnica:** Contagem de clique é fire-and-forget; síncrona adicionaria escrita à latência do redirect, ferindo D3.
- **Justificativa de negócio:** Mantém o redirect rápido (a promessa de escala) sem abrir mão das métricas.
- **Trade-offs aceitos:** Estatística eventualmente consistente; possível perda de evento sob falha — mitigado com fila durável.

### D6. Escala como característica — confirmada, não presumida

- **Contexto:** "Milhões de links" é prioridade real ou prematura?
- **Decisão:** Scalability + performance são top-3 por confirmação explícita do fundador.
- **Justificativa técnica:** As características priorizadas desempatam D1/D3/D5.
- **Justificativa de negócio:** Investir em cache/fila casa com a meta declarada; sem confirmação, o design seria mais enxuto.
- **Trade-offs aceitos:** Complexidade adicional antecipada — justificada pela confirmação do usuário.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Sequência como gargalo/ponto único de coordenação | 3 | 2 | 6 🔴 | Reserva de blocos de IDs por instância; spike antes da task de emissão |
| Enumerabilidade de códigos (scraping) | 2 | 2 | 4 🟡 | Aceito para público; modo aleatório opt-in se privacidade virar requisito |
| Perda de eventos de clique na fila | 2 | 2 | 4 🟡 | Fila durável + monitor de backlog + reprocessamento |
| Cache serve destino desatualizado após edição | 2 | 1 | 2 🟢 | TTL curto e invalidação no update de destino |

## Testes

- Emissão concorrente: N criações → N códigos únicos.
- Redirect: p99 < 40ms com cache; miss reidrata cache e mantém correção.
- Alias: reservado/colidente rejeitado; válido resolve pelo mesmo path.
- Analytics: redirect não bloqueia na escrita de clique; contadores convergem após drenar a fila.
- Availability: parar o agregador não afeta o redirect.
