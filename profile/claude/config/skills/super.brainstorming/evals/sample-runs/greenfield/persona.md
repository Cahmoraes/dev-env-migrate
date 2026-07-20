# Design Spec — URL Shortener (Arm B: +persona specialist interview)

## Contexto
Founder solo quer um encurtador de URL: cola URL longa, recebe link curto, clique redireciona. Alega escala ("milhões de links"), quer velocidade, links customizados e estatísticas de clique.

## Interview trace (resumo)
1. Q: Como o código curto é produzido? A: (probe D1) — contador → base62.
2. Q: E quando dois códigos colidem — como o sistema reage? A: (probe D2, filho de D1) — com contador é collision-free por construção; se fosse random, cada escrita exigiria checagem de unicidade. Ramo retry deletado.
3. Q (mineração de "poderia crescer / deve ser rápido"): num encurtador os redirects (leituras) superam de longe as escritas — qual a razão leitura/escrita e a latência-alvo do redirect? A: (probe D3) — read-optimized; cache dos códigos quentes; caminho de redirect não pode bater no DB de escrita sem cache.
4. Q: Como os links customizados interagem com os gerados? A: (probe D4) — keyspace compartilhado + checagem de reserved-word/colisão.
5. Q (mineração de "ver stats" + "rápido"): como o clique é contabilizado sem adicionar latência ao redirect? A: (probe D5) — assíncrono/fila; contar clique nunca no caminho crítico do redirect.
6. Q: "Milhões de links" — priorizar escala/performance ou é prematuro? A: (probe D6) — persona confirma escala como característica de topo.

## Decisões Arquiteturais
- **Geração (D1):** contador → base62. Trade-off: curto e sem colisões vs perda de inguessabilidade; random reservado a caso onde imprevisibilidade seja requisito.
- **Colisão (D2):** collision-free por construção. Trade-off explicitado: random obrigaria uniqueness check por escrita.
- **Assimetria leitura/escrita (D3):** read-optimized. Cache de códigos quentes; redirect desacoplado do DB de escrita.
- **Aliases customizados (D4):** keyspace compartilhado + reserved-word/collision check.
- **Analytics (D5):** escrita assíncrona via fila; redirect responde antes da contabilização.

## Características de Arquitetura
- **Escalabilidade / Performance (D6):** top características, confirmadas — justificam D3 e D5.

## Riscos
- Fila de analytics: perda de eventos sob falha (trade-off latência vs durabilidade — aceito para v1).
- Cache stale em atualização de destino de URL (invalidção a definir na implementação).

_(Invariante de close-out satisfeito: toda decisão dura foi resolvida com trade-off. Nenhuma decisão largada; seção "Questões em Aberto" omitida por vazia.)_
