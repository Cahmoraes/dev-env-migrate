# Design Spec — URL Shortener (Arm A: as-is decision-tree interview)

## Contexto
Founder solo quer um encurtador de URL: cola URL longa, recebe link curto, clique redireciona. Alega escala ("milhões de links"), quer velocidade, links customizados e estatísticas de clique.

## Interview trace (resumo)
1. Q: Como o código curto é gerado? A: (probe D1) — contador incremental convertido para base62.
2. Q: E os links customizados, como convivem com os gerados? A: (probe D4) — mesmo keyspace, com checagem de palavra reservada/colisão no alias.
3. Q: Você citou "milhões de links" — escalabilidade é prioridade real ou aspiracional? A: (probe D6) — confirma escala + performance como características de topo.
4. (Ao recomendar contador/base62, o nó carrega a justificativa "sem colisões por construção" — D2 dissolvido pela ordenação raiz→folha.)
5. Q: Quer estatísticas de clique? A: "Sim." (aceito superficialmente; latência do redirect não foi provada.)

## Decisões Arquiteturais
- **Geração de código curto (D1):** contador → base62. Curto, sem colisões. Random só se inguessabilidade importasse (não é requisito declarado).
- **Estratégia de colisão (D2):** collision-free por construção (consequência direta do contador). Ramo retry-on-collision deletado — não se aplica a contador monotônico.
- **Aliases customizados (D4):** keyspace compartilhado com gerados; checagem de reserved-word/colisão na criação do alias.

## Características de Arquitetura
- **Escalabilidade / Performance (D6):** top características, confirmadas pela persona.

## Riscos
- Analytics e caminho de leitura não aprofundados (ver lacunas).

## Lacunas (não fechadas nesta entrevista)
- Assimetria leitura/escrita no caminho de redirect (D3) — não surgiu.
- Caminho de escrita de analytics vs latência do redirect (D5) — não surgiu.

_(Nota: Arm A não possui invariante de close-out; D3 e D5 foram silenciosamente largados, não parqueados.)_
