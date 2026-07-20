---
feature: api-rate-limiting
status: approved
updated_at: 2026-07-02T14:00:00Z
---

# Design — Rate limiting na API pública NestJS

## 1. Visão Geral

Adiciona rate limiting à API pública existente (NestJS) para proteger endpoints de abuso. Um `RateLimitGuard` intercepta cada request, incrementa um contador por chave num Redis compartilhado (janela deslizante) e rejeita com `429` quando o limite é excedido. Nenhum endpoint muda de contrato; o guard é aditivo.

## Características Arquiteturais

Priorizadas: **Disponibilidade** (o rate limiter nunca pode derrubar a API), **Baixa latência** (custo por request desprezível), **Corretude sob concorrência** (contagem exata com N instâncias). Consideradas, não priorizadas: precisão sub-milissegundo da janela (aproximação de janela deslizante é suficiente).

## 2. Arquitetura

### 2.1 Fluxo

1. `RateLimitGuard.canActivate()` roda antes do handler.
2. Deriva a chave (D1), executa o script Lua atômico de incremento-e-expiração no Redis (D2).
3. Contador ≤ limite → segue; senão lança `ThrottlerException` (`429`) com header `Retry-After`.

### 2.2 Componentes

| Componente | Mudança |
|---|---|
| `RateLimitGuard` | **novo** — implementa `CanActivate`, registrado como `APP_GUARD` global. |
| `RedisRateStore` | **novo** — encapsula o script Lua `INCR`+`PEXPIRE`; método `hit(key): Promise<{count, ttl}>`. |

## Decisões Arquiteturais

### D1. Chave: por-usuário quando autenticado, por-IP quando anônimo

Rotas autenticadas usam `user.id` (justo entre IPs compartilhados atrás de NAT corporativo); rotas anônimas (login, signup) usam o IP do cliente extraído de `X-Forwarded-For` confiável (o LB já sanitiza o header). Rejeitado: só-IP (pune NAT corporativo); só-usuário (não protege rotas pré-auth).

### D2. Incremento atômico via script Lua — evita a corrida read-modify-write

`INCR` seguido de `PEXPIRE` em dois comandos tem corrida entre instâncias (duas leem o mesmo valor). Um único script Lua (`INCR`; se resultado == 1, `PEXPIRE`) é atômico no Redis, então a contagem é exata com N instâncias concorrentes. Rejeitado: `MULTI/EXEC` (mais round-trips; não cobre o caso do primeiro-hit-define-TTL tão limpo).

### D3. Fail-open quando o Redis está indisponível — disponibilidade vence

Se o `RedisRateStore.hit()` lança (Redis fora do ar, timeout de 50ms), o guard **permite** o request e loga um alerta. Rate limiting é uma proteção, não uma dependência crítica: derrubar 100% do tráfego porque o limiter caiu seria pior que não limitar temporariamente. O trade-off (uma janela sem proteção durante um outage do Redis) é aceito explicitamente e coberto por alerta para intervenção do operador. Rejeitado: fail-closed (viola a característica de Disponibilidade priorizada).

## Riscos

| Risco | Impacto | Prob | Score | Mitigação |
|---|---|---|---|---|
| Redis fora do ar bloquearia todo o tráfego | Alto | Baixa | 6 🟡 | fail-open (D3) + timeout de 50ms no `hit()` + alerta. A mitigação cobre exatamente este cenário. |
| `X-Forwarded-For` forjado para burlar o limite por-IP | Médio | Média | 6 🟡 | confiar apenas no IP que o LB anexa (a borda descarta o header do cliente); documentado como pré-condição do deploy. |
| Latência extra por request | Baixo | Alta | 3 🟢 | 1 round-trip Redis (~0.3ms) na mesma VPC; dentro do orçamento de latência. |

## 3. Testes

### Novos

| Arquivo | Cobre |
|---|---|
| `rate-limit.guard.spec.ts` | permite ≤ limite, `429` acima, header `Retry-After` presente. |
| `redis-rate-store.spec.ts` | script Lua é atômico (primeiro hit define TTL); incrementos concorrentes contam exato. |
| `rate-limit.fail-open.spec.ts` | Redis indisponível → request permitido + alerta logado (D3). |

### Inalterados (devem continuar passando)

Suíte de integração dos endpoints existentes — o guard é aditivo e não muda contratos.

## 4. Dependências

`ioredis` já está no projeto (usado pela BullMQ). Nenhuma dependência nova.
