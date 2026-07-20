---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Rate Limiting em endpoints da API

## Contexto

API NestJS + TypeORM + Postgres em produção. Os endpoints `/auth/login` e
`/reports` estão sendo abusados por clientes que disparam muitas requisições. O
pedido é adicionar rate limiting simples para capar as requisições por cliente.

## Decisões da entrevista

### D1 — O que é um "cliente"
- Rotas autenticadas (`/reports`): limite **por usuário autenticado**.
- `/auth/login` (pré-auth, sem usuário ainda): limite **por IP**.

Racional: onde há identidade de usuário, ela é a chave mais justa; IP é o fallback
só quando não há autenticação.

### D3 — O que acontece ao estourar
**HTTP 429** com header **`Retry-After`** informando quando tentar de novo. Sem
fila, sem throttle gradual — a requisição excedente é rejeitada.

### D4 — Janela e granularidade
**Sliding window**, com limite por rota. `/auth/login` recebe um teto mais baixo
(proteção contra brute force de credenciais) do que `/reports`.

Racional: sliding window evita a rajada de fronteira do fixed window; limites por
rota porque login e reports têm perfis de abuso diferentes.

## Abordagem escolhida

**`@nestjs/throttler`** com guard global e overrides por rota via `@Throttle`.

Abordagens consideradas:
1. **`@nestjs/throttler` com storage em memória** — a mais simples, zero
   infraestrutura adicional. **Escolhida** pela premissa de "algo simples".
2. `@nestjs/throttler` com storage em Redis — mais robusto, porém adiciona um
   componente de infraestrutura. Mantido como evolução futura se necessário.
3. Middleware custom — descartado, reimplementa o que a lib já entrega.

## Componentes

- **Guard de throttling** — resolve a chave (usuário autenticado ou IP) e aplica
  o contador da janela.
- **Storage de contadores** — armazenamento em memória do processo (default da
  lib).

## Fluxo

1. Request nas rotas alvo.
2. Guard deriva a chave: `user.id` quando autenticado, senão IP.
3. Consulta/incrementa o contador da janela deslizante.
4. Sob o limite → prossegue; acima → 429 + `Retry-After`.

## Testes

- Chave resolvida corretamente para rota autenticada vs `/auth/login`.
- 429 com `Retry-After` ao exceder.
- Limite mais estrito em `/auth/login`.

## Riscos

- Os valores exatos de limite/janela precisam ser calibrados com dados de tráfego
  reais.
