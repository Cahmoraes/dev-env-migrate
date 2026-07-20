# Benchmark adversarial — simulação do fluxo de spec-review (branch gilling)

Simulação paralela (subagents) do fluxo novo de `super.reviewing-specs` + regressão do
`super.brainstorming`, com julgamento adversarial **com-skill vs baseline (sem skill)**.
Objetivo: falsificar a honestidade do revisor (não inventar numa spec sã, não silenciar
numa spec com defeito, não over-buildar), exercitar a lente corporativa e medir o efeito
downstream da review sobre a acertividade da task.

Executores e graders foram subagents independentes; o grader leu os relatórios crus do
disco (Read do orquestrador comprime).

## Experimento 1 — Honestidade adversarial do revisor (3 specs × 2 configs)

| Cenário | Config | Achados (C/I/M) | Manufacturing | Missed real | Over-build | Glifo § | Veredito honestidade |
|---|---|---|---|---|---|---|---|
| Spec limpa (api-rate-limiting) | **com skill** | 0/0/0 | Não | Não | Não | 0 | **PASS** — "sem mudanças necessárias" |
| Spec limpa | baseline | 3/7/5 | **Sim (severo)** | Não | parcial | **12** | **FAIL** — reprovou spec sã, sinalizou fail-open (D3) como risco aberto |
| Spec com defeitos (webhook) | **com skill** | 1/4/2 | Não | Não | **Não** | 0 | **PASS** — rule-out/tolerate corretos |
| Spec com defeitos | baseline | 3/5/4 | leve | Não | **Sim (DLQ)** | 0 | **FAIL** — recomendou DLQ argumentando "não é YAGNI" |
| Spec corporativa (session-timeout) | **com skill** | 1/2/2 | Não | Não | Não | 0 | **PASS** — Lens 5 surfou SEC-1 + SEC-3 |
| Spec corporativa | baseline | 3/5/5 | leve | **Sim (ambas)** | Não | 0 | **FAIL** — nunca cita a política corporativa |

### Leituras principais

- **Spec limpa (o teste-chave de honestidade).** O baseline fabricou **15 achados**
  (3 "Critical") numa spec comprovadamente sã e cometeu o erro cardinal — sinalizar o
  `fail-open` (D3), que está fechado com trade-off explícito, como risco aberto. O
  revisor com skill retornou **0/0/0** e registrou os 4 itens borderline
  (janela deslizante vs `INCR`+`PEXPIRE`, `ThrottlerException`, valores de limite,
  ciclo de vida do Redis) transparentemente como **não-defeitos**, sem manufaturá-los.
- **Spec com defeitos.** Ambos acham os defeitos reais (clash `durable`, `dispatch()`
  fantasma, cursor-Postgres inexistente). Mas o baseline **over-builda** (DLQ + maxAttempts),
  enquanto o com-skill fecha por **rule-out** (fila durável D1 já cobre) e **tolerate**
  (dedup por `event_id` no cliente, sem dedup-store) — a precisão é o diferencial, não a
  taxa de captura. D4 (ordenação) corretamente listado como bem-fechado, não sinalizado.
- **Spec corporativa (precedência).** O com-skill nomeou as duas divergências reais
  (idle 30min viola o teto SEC-1 de 15min → Critical "divergência silenciosa"; SEC-3
  MFA-re-challenge descartado → Important) e reconheceu SEC-2/SEC-4 como conversões fiéis.
  O baseline **nunca menciona a política corporativa** — cego à fonte-de-verdade, perdeu
  as duas. É o valor exclusivo da Lens 5.

## Experimento 2 — Efeito downstream (review → acertividade da task)

Dois implementadores fiéis: um a partir dos artefatos **não-revisados** (originais), outro
dos **revisados/corrigidos**. Cinco pontos contestados, verificados mecanicamente no código
gerado:

| Ponto contestado | Impl NÃO-revisada | Impl REVISADA |
|---|---|---|
| Durabilidade da fila (2 arquivos) | `durable:true` vs `durable:false` → **PRECONDITION_FAILED** em runtime | `true`/`true` idêntico |
| Método de consumo do worker | `dispatch()` (fantasma, contradiz 2.2) | `run()` (real) |
| Entrega duplicada | sem tratamento/indefinido | tolerada via `event_id`, sem dedup-store |
| `prefetch` QoS | 10, não autorizado pela spec | 10, rastreado a D5 |
| Catch-up de reconexão AMQP | cursor Postgres fantasma | fila durável + `noAck:false` |
| **Pontos limpos** | **0/5** (código quebra em runtime) | **5/5** |

A review converteu uma implementação que **quebraria em runtime** (redeclare de fila com
argumentos divergentes) e codificava um método fantasma numa implementação internamente
consistente. Ganho de acertividade concreto e mecânico, não opinativo.

## Experimento 3 — Regressão do `super.brainstorming` (pós-sweep do glifo §)

Spot-check com cenário derivado do repo de estudos (`login-security-lockout`), gabarito =
design humano aprovado. Skill §-swept.

- **Closure: 16/16 (100%)** — todo fork duro do gabarito fechado (resolve / tolerate / rule-out).
- **Forks ocultos surfados: 16/16** — a intenção-de-superfície não deu nenhum valor; todos
  vieram do entrevistador (anti-enumeration, anti-timing via invariante named-but-dropped;
  per-account vs per-IP; exclusão de usuário desconhecido; locked vs suspended).
- **Glifo §: 0** em toda a árvore da skill; âncoras persona-especialista intactas.
- **Sem regressão** do enriquecimento. Ceiling de self-play anotado (harness cego de 2
  agentes segue pendente, já documentado em `evals/README.md`).

## Formato / idioma (todos os relatórios com-skill)

- Glifo `§`: **0** em todos os relatórios com-skill (baseline vazou 12 na spec limpa).
- Labels em pt-BR (Severidade / Seção / Achados / Veredito) — idioma da sessão honrado.
- Separador `---` presente entre findings onde há múltiplos.

## Suíte determinística

715/715 testes verdes (inclui contratos de frase/heading do brainstorming e reviewing-specs;
sobrevivem ao sweep).

## Conclusão do benchmark

O skill **vence os 3 cenários** nos eixos que o eval mira: suprime manufacturing em spec sã,
evita over-build em spec defeituosa, e aplica a precedência corporativa à qual o baseline é
cego — e a review melhora mensuravelmente o resultado downstream da task (0/5 → 5/5). A
regressão do brainstorming não aparece.
