---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: rate-limiting-auth-reports
---

# Design Spec — Rate Limiting em `/auth/login` e `/reports` (NestJS)

## Visão Geral

Adicionar rate limiting a uma API NestJS + TypeORM + Postgres já em produção,
rodando atrás de um load balancer com **duas instâncias**. Alvo imediato: os
endpoints `/auth/login` (sob brute-force) e `/reports` (endpoint caro que
degrada a plataforma quando é martelado). O objetivo é a menor mudança que
segure abuso de forma **consistente entre as duas instâncias**, sem introduzir
uma dependência que a operação ainda não tenha.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Correctness (distribuída) | Duas instâncias atrás do LB; contador local deixaria o cliente ganhar ~2× o limite alternando instâncias | O limite observado é global: N req/janela independem de qual instância atende (erro < 1 req na fronteira) |
| Security | `/auth/login` é pré-auth e alvo de brute-force/credential-stuffing | `/auth/login` bloqueia após 5 tentativas/min por IP; degradação do limiter não abre brute-force ilimitado |
| Availability | `/reports` é operação de negócio; um blip no store não deve derrubar a API inteira | Indisponibilidade do Redis não retorna 5xx em `/reports` (fail-open) |

**Consideradas, não priorizadas:** scalability (volume atual cabe em 2 instâncias + Redis existente), i18n (sem impacto).

## Arquitetura e Fluxo

Middleware/guard de rate limiting no NestJS aplicado por rota, apoiado no
`@nestjs/throttler` com **storage compartilhado em Redis** (o mesmo Redis já
usado para sessões). Cada request resolve uma **chave de identidade** conforme
a rota, incrementa um contador de janela deslizante em Redis, e:

1. Dentro do limite → segue para o handler; resposta inclui headers `X-RateLimit-*`.
2. Acima do limite → curto-circuito com **429** e header `Retry-After`.
3. Redis indisponível → política de fallback por rota (ver D5).

Fluxo: `Request → RateLimitGuard → (resolve chave) → RedisSlidingWindowStore.hit() → allow|deny`.

## Estrutura de Componentes

- **RateLimitGuard** — decide se a request passa; delega identidade e contagem. (Responsabilidade: aplicar a política de limite a uma request.)
- **ClientKeyResolver** — deriva a chave de rate limit da request conforme a rota (per-user em rotas autenticadas; per-IP em `/auth/login`).
- **RedisSlidingWindowStore** — mantém a contagem de janela deslizante em Redis de forma atômica; ponto único de estado compartilhado entre as instâncias.
- **RateLimitPolicy** — tabela declarativa de limites por rota (janela, teto, política de fallback).

## Decisões Arquiteturais

### D1. Identidade do cliente: per-user em rotas autenticadas, per-IP em `/auth/login`

- **Contexto:** Um "cliente" pode ser identificado por IP, por usuário autenticado ou por API key. `/reports` está atrás de auth; `/auth/login` é pré-auth (ainda não há usuário).
- **Decisão:** `/reports` → chave por `userId`. `/auth/login` → chave por IP (com atenção a `X-Forwarded-For` correto atrás do LB).
- **Justificativa técnica:** Não há identidade de usuário disponível antes do login; IP é o único sinal em `/auth/login`. Em rotas autenticadas, per-user é mais justo que per-IP (NAT/escritórios compartilham IP).
- **Justificativa de negócio:** Evita punir usuários legítimos atrás de um mesmo IP corporativo enquanto ainda contém brute-force no login.
- **Trade-offs aceitos:** Per-IP no login é contornável por rotação de IP (botnet); mitigado por limite baixo + fail-closed (D5). Confiar em `X-Forwarded-For` exige `trust proxy` configurado corretamente.

### D2. Estado compartilhado em Redis, não contador em memória

- **Contexto:** Duas instâncias atrás do LB. Um contador em memória por instância deixaria um cliente obter ~2× o limite (uma cota por instância) e é não-determinístico conforme o roteamento do LB.
- **Decisão:** Contadores de rate limit vivem em **Redis compartilhado** (o mesmo cluster já usado para sessões), não em memória de processo.
- **Justificativa técnica:** Só um store compartilhado garante um limite global consistente entre instâncias; in-memory é correto apenas com instância única.
- **Justificativa de negócio:** Zero infra nova — Redis já está em produção. O custo de correctness é um `INCR`/`EXPIRE` por request.
- **Trade-offs aceitos:** Latência de rede por request (mitigável com pipeline/Lua); Redis vira dependência no caminho quente → exige a política de fallback (D5).

### D3. Comportamento no estouro: 429 com `Retry-After`, sem fila

- **Contexto:** Ao exceder, pode-se rejeitar (429), enfileirar/throttlear, ou só logar (shadow).
- **Decisão:** Rejeitar com **HTTP 429 Too Many Requests** + header `Retry-After` (segundos até a janela liberar). Sem enfileiramento.
- **Justificativa técnica:** 429 é o contrato HTTP padrão; `Retry-After` deixa clientes bem-comportados recuarem. Fila acumularia memória e mascararia abuso.
- **Justificativa de negócio:** Resposta imediata e barata; nenhum recurso gasto servindo abuso.
- **Trade-offs aceitos:** Clientes agressivos ignoram `Retry-After`; aceitável — o 429 já protege o backend.

### D4. Janela deslizante, com limites por rota

- **Contexto:** Fixed window é simples mas permite rajada na fronteira (2× o teto em torno do reset). Sliding window suaviza. Limites podem ser iguais ou diferir por rota.
- **Decisão:** **Janela deslizante**. Limites distintos por rota: `/auth/login` ~5 req/min/IP (estrito); `/reports` ~60 req/min/usuário.
- **Justificativa técnica:** Sliding window elimina o burst de fronteira que tornaria o limite de login efetivamente 10/min. Limites por rota refletem risco e custo distintos.
- **Justificativa de negócio:** Login estrito reduz brute-force; reports mais folgado preserva uso legítimo intenso.
- **Trade-offs aceitos:** Sliding window custa um pouco mais de memória/compute em Redis que fixed window; irrelevante nesse volume.

### D5. Modo de falha do store: fail-open em `/reports`, fail-closed em `/auth/login`

- **Contexto:** Se o Redis (store do limiter) ficar indisponível, o guard precisa decidir entre deixar passar (fail-open) ou bloquear (fail-closed).
- **Decisão:** **Fail-open** em `/reports` (na dúvida, servir); **fail-closed** em `/auth/login` (na dúvida, bloquear).
- **Justificativa técnica:** A política acompanha a característica dominante de cada rota — availability em reports, security em login. Um único modo global sacrificaria uma delas.
- **Justificativa de negócio:** Um blip de Redis não deve derrubar relatórios do negócio; mas também não deve abrir uma janela de brute-force ilimitado no login.
- **Trade-offs aceitos:** Fail-closed no login pode bloquear logins legítimos durante um outage de Redis (aceito — janela curta, alerta dispara). Fail-open em reports abre uma janela sem limite durante o outage (aceito — reports é caro mas não é vetor de segurança).

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| `X-Forwarded-For` mal configurado → todos os IPs colapsam no IP do LB, quebrando o limite per-IP do login | 3 | 2 | 6 🔴 | Configurar `trust proxy`/extração de IP real e cobrir com teste de integração atrás do LB antes do rollout |
| Redis no caminho quente adiciona latência/ponto de falha | 2 | 2 | 4 🟡 | Store atômico via Lua/pipeline; política de fallback D5; alerta de disponibilidade do Redis |
| Fail-closed no login durante outage de Redis bloqueia usuários legítimos | 2 | 2 | 4 🟡 | Janela de outage curta + alerta; documentar como aceitação explícita de segurança |
| Sliding window implementado errado (off-by-one na fronteira) | 2 | 2 | 4 🟡 | Testes de fronteira (rajada no reset) validando teto global entre 2 instâncias |

## Tratamento de Erros

- Estouro de limite → 429 + `Retry-After` + headers `X-RateLimit-Limit/Remaining/Reset`.
- Redis indisponível → aplicar D5 por rota; logar em nível `warn` e emitir métrica; nunca propagar exceção do store como 5xx em `/reports`.

## Testes

- Unit: `ClientKeyResolver` (per-user vs per-IP por rota), `RateLimitPolicy` (limites/janela por rota).
- Integração (chave): limite **global** entre duas instâncias — cliente batendo em ambas não excede o teto (fecha D2).
- Integração: `/auth/login` 429 após 5/min por IP; `/reports` 429 após 60/min por usuário; header `Retry-After` presente (D3/D4).
- Integração de falha: Redis derrubado → `/reports` continua servindo (fail-open), `/auth/login` bloqueia (fail-closed) (fecha D5).
- Fronteira: rajada em torno do reset não ultrapassa o teto (valida sliding window, D4).
