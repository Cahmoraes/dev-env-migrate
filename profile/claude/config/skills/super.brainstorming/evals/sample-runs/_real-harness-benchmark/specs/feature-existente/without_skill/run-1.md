---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Rate Limiting for `/auth/login` and `/reports`

## Contexto

A API NestJS + TypeORM + Postgres já em produção está recebendo tráfego abusivo
nos endpoints `/auth/login` e `/reports`. O objetivo é adicionar rate limiting
para impedir que um cliente faça spam de requisições. O tech lead pediu "algo
simples", a menor mudança que resolva.

## Decisões resolvidas na entrevista

### D1 — Identidade do cliente
Rate limit **por usuário autenticado** nas rotas atrás de auth (ex.: `/reports`).
Como `/auth/login` é pré-autenticação (não há usuário ainda), nessa rota o limite
é **por IP**.

Recomendação seguida: preferir identidade por usuário onde houver, cair para IP
apenas onde não há identidade (login).

### D4 — Janela e limites
**Sliding window**. Limite mais estrito em `/auth/login` do que em `/reports`
(ex.: `/auth/login` ~5 req/min por IP; `/reports` ~60 req/min por usuário — números
finais a calibrar com o time).

Recomendação seguida: sliding window evita o burst na virada de janela que o fixed
window permite.

### D3 — Comportamento ao estourar o limite
Retornar **HTTP 429 Too Many Requests** com header **`Retry-After`**. Sem
enfileiramento/throttling — rejeição direta.

## Abordagem escolhida

Usar **`@nestjs/throttler`** aplicado via guard, com configuração por rota
(decorator `@Throttle`) para diferenciar os limites de `/auth/login` e `/reports`.
Resolver a chave de rate limit por usuário autenticado quando presente, por IP
caso contrário.

Alternativas consideradas:
- Middleware custom com contador próprio — mais controle, mais código para manter.
- Rate limiting no load balancer / reverse proxy — fora do processo da app, mas
  não conhece o usuário autenticado (só IP), o que não atende D1.

`@nestjs/throttler` cobre a maioria dos casos com a menor mudança, então é a
recomendação.

## Componentes

- **Guard de rate limit** — intercepta as requisições nas rotas alvo, resolve a
  chave (usuário ou IP) e consulta/incrementa o contador.
- **Configuração por rota** — define limite e janela específicos por endpoint.

## Fluxo de dados

1. Requisição chega em `/auth/login` ou `/reports`.
2. Guard resolve a chave: `user.id` se autenticado, senão IP.
3. Contador da janela deslizante é consultado/incrementado.
4. Dentro do limite → segue para o handler. Acima → 429 com `Retry-After`.

## Testes

- Unit: resolução de chave (usuário vs IP).
- Integração: exceder o limite retorna 429 com `Retry-After`.
- Integração: limites distintos por rota são respeitados.

## Riscos

- Calibração dos números de limite precisa de observação do tráfego real para não
  bloquear usuários legítimos.
