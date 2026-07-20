# Design Spec — Rate limiting em API NestJS existente (ARM B: +persona)

## Contexto

API NestJS + TypeORM + Postgres em produção **atrás de duas instâncias com load balancer**.
Endpoints `/auth/login` e `/reports` recebem tráfego abusivo. Objetivo: rate limiting que
efetivamente segure o abuso — sem furos de correção distribuída nem modo de falha silencioso.

## Transcrição resumida da entrevista (+persona / especialista)

- Q: "Como você identifica um 'cliente' — e as rotas autenticadas e o `/auth/login` (pré-auth) têm a mesma identidade?"
  A: "Autenticadas por usuário; `/auth/login` por IP, porque ali ainda não há usuário." (D1 revelado)
- Q: "O que acontece no estouro — 429, throttle/fila, ou só logar?"
  A: "429 com `Retry-After`, sem fila." (D3 revelado)
- Q: "Janela fixa ou deslizante? Limites iguais por rota?"
  A: "Deslizante; `/auth/login` mais restrito que `/reports`." (D4 revelado)
- Q (MINERAÇÃO DE FORK OCULTO): "Você tem DUAS instâncias atrás do LB. Se o contador for em memória
  por instância, um cliente balanceado entre as duas ganha 2× o limite e o comportamento fica
  não-determinístico. Onde o contador vive?"
  A: "Verdade. Precisa de estado compartilhado — Redis." (D2 revelado — hidden)
- Q (MODO DE FALHA): "E se o Redis cair? O limiter falha aberto (deixa passar) ou fechado (bloqueia tudo)?
  A resposta pode diferir por rota."
  A: "`/reports` fail-open — não quero derrubar relatório por causa do limiter. `/auth/login` fail-closed —
  não posso deixar brute-force passar se o limiter apagar." (D5 revelado — hidden)

## Características

- Rate limiting em `/auth/login` e `/reports`.
- Identidade do cliente (D1): por usuário nas rotas autenticadas; por IP em `/auth/login`.
- Comportamento no estouro (D3): HTTP 429 + `Retry-After`; sem fila.
- Granularidade/janela (D4): janela deslizante; `/auth/login` mais restrito que `/reports`.
- Estado compartilhado (D2): contador em Redis (store compartilhado entre as 2 instâncias).
- Modo de falha do store (D5): fail-open em `/reports`, fail-closed em `/auth/login`.

## Decisões Arquiteturais

- **D1 — Identidade do cliente:** userId para autenticadas, IP para `/auth/login`.
  Trade-off: IP agrupa clientes atrás de NAT; aceitável apenas na rota pré-auth.
- **D2 — Store compartilhado (Redis) vs contador em memória:** contador em memória por instância
  deixa o cliente obter 2× o limite atrás do LB e torna a contagem não-determinística. Redis dá
  contagem única e consistente. Trade-off: adiciona dependência de infra e latência de rede por request.
- **D3 — 429 + Retry-After, sem fila:** rejeição previsível vs back-pressure; escolhida a rejeição.
- **D4 — Janela deslizante + limites por rota:** sliding window evita burst na virada; `/auth/login`
  com teto mais baixo que `/reports`. Trade-off: mais bookkeeping por chave.
- **D5 — Modo de falha do limiter store:** decisão por rota. `/reports` **fail-open** (disponibilidade
  do relatório > enforcement) ; `/auth/login` **fail-closed** (segurança > disponibilidade — não deixar
  brute-force passar quando o Redis está fora). Trade-off explícito: durante outage do Redis, `/reports`
  fica sem proteção e `/auth/login` pode rejeitar tráfego legítimo.

## Riscos

- Dependência do Redis vira ponto crítico; monitorar disponibilidade e latência.
- Política de falha por rota precisa ser testada explicitamente (injeção de outage do Redis).
