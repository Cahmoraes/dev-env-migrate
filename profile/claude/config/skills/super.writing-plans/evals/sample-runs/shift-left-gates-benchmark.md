# Benchmark — shift-left dos gates de self-review (branch gilling)

Objetivo: mover os defeitos que a `super.reviewing-specs` pega para **um estágio antes**, nos
self-reviews de brainstorming / writing-plans / generating-prd, para que a review volte limpa na
maioria dos casos. Duas frentes:

1. **Gate determinístico** (`validate-tasks.cjs` → `validateSharedResourceConsistency`): mata a classe
   author-blind do durable-clash (`durable:true`↔`durable:false` no mesmo recurso entre tasks →
   `PRECONDITION_FAILED`). Heurística booleana, warning-level. 6 testes; suíte 707/707.
2. **Espelhos de prosa** dos itens da review, um estágio antes:
   - brainstorming self-review #7 (mecanismo-fantasma) e #8 (símbolo usado-vs-declarado-ausente)
   - writing-plans #4 estendido (args de recurso compartilhado) + #4c (traceabilidade task→spec)
   - generating-prd #7 (varredura named-but-open)

## A/B da prosa (skill-creator, prose-isolated)

Única variável entre configs = a prosa do checklist (baseline HEAD vs enhanced). Fixtures e artefato
limpo idênticos. Executor `capable` cego quanto a qual config recebeu; produz relatório de self-review;
graduação mecânica por assinatura do defeito nos bytes crus.

| Artefato | Config | Defeitos plantados fechados | Manufacturing em spec sã |
|---|---|---|---|
| phantom-symbol (cursor Postgres inexistente + `dispatch()` 2.1 vs 2.2) | baseline | **2/2** | — |
| phantom-symbol | enhanced | **2/2** | — |
| plan-defects (`durable` clash + `prefetch(10)` sem spec) | baseline | **2/2** | — |
| plan-defects | enhanced | **2/2** | — |
| clean (api-rate-limiting, spec sã) | baseline | — | **0** ("Sem mudanças necessárias") |
| clean | enhanced | — | **0** ("Sem mudanças necessárias") |

## Leitura honesta

- **Teto de self-play confirmado (de novo).** Num executor `capable`, a prosa fortalecida **não eleva a
  taxa de captura** — o modelo já pega os 4 defeitos lendo criticamente, atribuindo-os aos itens
  genéricos que já existiam no baseline (dispatch→coerência interna, cursor→mitigação, durable→type
  consistency, prefetch→"não aparece na spec"). Mesmo achado do trabalho de persona do brainstorming:
  um só modelo escreve autor E revisor, ambos no teto.
- **O que a prosa muda é atribuição e severidade, não contagem.** O baseline esticou "type consistency"
  para o durable-clash e **rebaixou `prefetch` a observação não-bloqueante**; o enhanced o conta como
  defeito real via a lente dedicada #4c (decisão arquitetural sem origem na spec). É uma diferença
  qualitativa (priorização correta), não de captura bruta.
- **Honestidade preservada.** Enhanced **não manufatura** na spec sã (0 issues, idêntico ao baseline) e
  não infla os relatórios de defeito com achados falsos (os extras do enhanced — skills-compliance #4b,
  worker/backoff/teste sem task, hazard de wave — são reais).
- **A garantia real é o gate determinístico.** Só o script fecha a classe durable-clash de forma
  author-blind e tier-independente — a prosa depende do modelo lembrar/raciocinar, o script enforça
  sempre. O lift da prosa apareceria em tiers mais baratos (não medido aqui; executor foi `capable`).

## Conclusão

Prosa: **segura, aditiva, sem regressão, melhora priorização** — vale shippar como codificação explícita
da intenção e para o ganho esperado em tiers baratos, sem overclaim de lift em `capable`. Gate
determinístico: **a mudança que carrega a garantia**. Juntos realizam o shift-left pedido: a review passa
a confirmar em vez de corrigir na classe mecânica, restando a ela o resíduo author-blind semântico.

## Pendências de medição

- Lift da prosa em **tiers baratos** (cheap/standard) — onde o teto de self-play não mascara o efeito.
- Harness cego de 2 agentes (autor ≠ revisor) para separar o efeito da prosa do julgamento geral do
  modelo. Mesma escalada já anotada no `super.brainstorming/evals/README.md`.
