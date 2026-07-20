---
feature: session-timeout-policy
status: approved
updated_at: 2026-07-03T10:00:00Z
---

# Design — Política de timeout de sessão no portal do cliente

## 1. Visão Geral

Implementa expiração de sessão no portal do cliente (NestJS + Redis de sessão) a partir
da política corporativa de Segurança. Um `SessionGuard` valida cada request contra dois
relógios (inatividade e vida absoluta) e encerra a sessão quando qualquer um estoura.

Este design é a conversão da **Política Corporativa de Sessão e Autenticação** (time de
Segurança) para o portal.

## Características Arquiteturais

Priorizadas: **Segurança** (aderência à política corporativa), **Baixa latência** (checagem
por request desprezível). Consideradas, não priorizadas: single-sign-out cross-device.

## 2. Arquitetura

### 2.1 Fluxo

1. `SessionGuard.canActivate()` roda antes do handler.
2. Lê `session.lastSeenAt` e `session.createdAt` do Redis.
3. Se `now - lastSeenAt > IDLE_TIMEOUT` → encerra sessão (401, força re-login).
4. Se `now - createdAt > ABSOLUTE_TIMEOUT` → encerra sessão (401, força re-login).
5. Caso contrário, atualiza `lastSeenAt = now` e segue.

### 2.2 Componentes

| Componente | Mudança |
|---|---|
| `SessionGuard` | **novo** — implementa `CanActivate`, registrado como `APP_GUARD` global. |
| `SessionStore` | **novo** — encapsula leitura/escrita de `lastSeenAt`/`createdAt` no Redis. |
| `SessionAuditLogger` | **novo** — emite evento imutável em início/expiração/encerramento de sessão. |

## Decisões Arquiteturais

### D1. Idle timeout de 30 minutos

`IDLE_TIMEOUT = 30 min`. Escolhido para equilibrar segurança e conveniência do usuário do
portal — 30 minutos evita re-login excessivo em fluxos longos de preenchimento de formulário.
Rejeitado: 60 min (janela de exposição grande demais).

### D2. Vida absoluta de 8 horas

`ABSOLUTE_TIMEOUT = 8 h` desde `createdAt`, sem exceção de "lembrar-me". Encerra a sessão
mesmo com atividade contínua, forçando reautenticação diária. Alinhado à política corporativa.

### D3. Auditoria imutável de eventos de sessão

`SessionAuditLogger` grava início, expiração e encerramento forçado num store append-only
retido por 1 ano. Alinhado à exigência corporativa de auditoria.

## Riscos

| Risco | Impacto | Prob | Score | Mitigação |
|---|---|---|---|---|
| Relógio de instâncias divergente afeta o corte | Médio | Baixa | 4 🟡 | usar o clock do Redis como fonte única de `now`; documentado. |
| Sessão longa de formulário perde dados no corte | Médio | Média | 6 🟡 | autosave de rascunho no cliente a cada 60s; independente da sessão. |

## 3. Testes

### Novos

| Arquivo | Cobre |
|---|---|
| `session.guard.spec.ts` | idle > 30min → 401; absolute > 8h → 401; dentro dos limites → segue e atualiza `lastSeenAt`. |
| `session-store.spec.ts` | leitura/escrita de `lastSeenAt`/`createdAt`. |
| `session-audit.spec.ts` | evento emitido em início/expiração/encerramento. |

## 4. Dependências

`ioredis` já presente. Nenhuma dependência nova.
