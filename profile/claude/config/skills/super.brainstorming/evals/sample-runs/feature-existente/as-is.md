# Design Spec — Rate limiting em API NestJS existente (ARM A: as-is)

## Contexto

API NestJS + TypeORM + Postgres em produção. Endpoints `/auth/login` e `/reports`
recebem tráfego abusivo. Objetivo: adicionar rate limiting simples para impedir
que um cliente faça spam.

## Transcrição resumida da entrevista (as-is)

- Q: "O que exatamente você quer proteger e por quê?"
  A: "`/auth/login` e `/reports` estão sendo martelados, quero capar requisições por cliente."
- Q: "Como você identifica um 'cliente' — por IP, por usuário autenticado, por API key?"
  A: "Nas rotas autenticadas dá pra usar o usuário logado; no `/auth/login` não tem usuário ainda, então por IP." (D1 revelado)
- Q: "O que deve acontecer quando o cliente estoura o limite?"
  A: "Responder erro pedindo pra tentar de novo depois — 429 com `Retry-After`. Sem fila." (D3 revelado)
- Q: "Que algoritmo de janela? Os limites diferem por rota?"
  A: "Janela deslizante. `/auth/login` mais restrito que `/reports`." (D4 revelado)
- Q: "Alguma preferência de biblioteca?"
  A: "Nada sofisticado, o mais simples que segure."

(A entrevista encerrou ao esgotar as perguntas óbvias; não sondou a topologia de 2 instâncias
nem o comportamento do store sob falha.)

## Características

- Rate limiting nos endpoints `/auth/login` e `/reports`.
- Identidade do cliente (D1): por usuário autenticado nas rotas autenticadas; por IP no `/auth/login` (pré-auth).
- Comportamento no estouro (D3): HTTP 429 com header `Retry-After`; sem enfileiramento.
- Granularidade/janela (D4): janela deslizante; limite mais restrito em `/auth/login` que em `/reports`.

## Decisões Arquiteturais

- **D1 — Identidade do cliente:** chave composta por (rota autenticada → userId; `/auth/login` → IP).
  Trade-off: IP em pré-auth pode agrupar clientes atrás de NAT, aceitável para login.
- **D3 — 429 + Retry-After:** rejeição direta em vez de fila; trade-off: rejeição é mais simples
  e previsível que back-pressure, custo é UX de retry no cliente.
- **D4 — Janela deslizante + limites por rota:** trade-off: sliding window evita burst na virada
  da janela fixa, ao custo de mais bookkeeping por chave.

## Riscos

- Escolha de algoritmo pode ter overhead; validar sob carga.
