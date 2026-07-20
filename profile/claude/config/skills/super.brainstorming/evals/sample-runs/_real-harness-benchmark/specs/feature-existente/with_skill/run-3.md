---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: rate-limiting-auth-reports
---

# Design Spec — Rate Limiting em endpoints `/auth/login` e `/reports`

## Visão Geral

Introduzir rate limiting numa API NestJS + TypeORM + Postgres em produção,
servida por **duas instâncias** atrás de um load balancer. Dois endpoints
concentram o abuso: `/auth/login` (força-bruta / credential-stuffing) e
`/reports` (endpoint caro sujeito a flood). Buscamos a menor intervenção que
segure o abuso, com dois requisitos não-negociáveis descobertos na entrevista:
o limite precisa ser **coerente entre as duas instâncias**, e o sistema precisa
de um **comportamento definido quando o store do limiter estiver fora do ar**.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Correctness distribuída | Duas instâncias; contador local deixaria cada cliente com ~2× o limite | Teto global honrado independentemente da instância (fronteira < 1 req) |
| Security | `/auth/login` é pré-auth, alvo primário de brute-force | Bloqueio ≤ 5 tentativas/min por IP; falha do store não abre login sem teto |
| Availability | `/reports` sustenta operação de negócio; blip de store não pode virar indisponibilidade total | Redis fora ⇒ `/reports` segue respondendo (fail-open) |

**Consideradas, não priorizadas:** escalabilidade horizontal além de 2 instâncias (sem previsão), i18n.

## Arquitetura e Fluxo

Guard de rate limiting por rota no NestJS, sobre `@nestjs/throttler` com
storage em **Redis compartilhado** (o mesmo já usado para sessões). Cada
requisição: resolve a chave conforme a rota → incrementa contador de janela
deslizante atômico em Redis → decide allow/deny. Ao estourar: 429 + `Retry-After`.
Redis indisponível: política de fallback por rota.

`Request → RateLimitGuard → IdentityResolver → RedisWindowCounter → allow | 429`

## Estrutura de Componentes

- **RateLimitGuard** — aplica a política de limite a cada request na rota protegida.
- **IdentityResolver** — resolve a chave de limite (userId autenticado; IP em `/auth/login`).
- **RedisWindowCounter** — janela deslizante atômica em Redis; estado único compartilhado entre as instâncias.
- **LimitConfig** — tabela declarativa de janela/teto/fallback por rota.

## Decisões Arquiteturais

### D1. Identidade do cliente por rota

- **Contexto:** IP vs usuário autenticado vs API key. `/reports` é autenticado; `/auth/login` não.
- **Decisão:** `/reports` → `userId`; `/auth/login` → IP (via `X-Forwarded-For` com proxy confiável).
- **Justificativa técnica:** Não há usuário antes do login ⇒ IP é o único sinal; per-user é mais justo e preciso nas rotas autenticadas.
- **Justificativa de negócio:** Evita bloquear usuários legítimos que dividem IP corporativo, mantendo contenção no login.
- **Trade-offs aceitos:** IP é evadível por rotação; compensado por teto baixo + fail-closed no login e boa extração de IP real.

### D2. Estado compartilhado em Redis, não contador em memória

- **Contexto:** Duas instâncias atrás do LB. Contador em memória por processo ⇒ uma cota por instância (~2× o limite), não-determinístico conforme roteamento.
- **Decisão:** Contadores no **Redis compartilhado** existente, não em memória de processo.
- **Justificativa técnica:** Só um store central garante um teto global consistente; in-memory só é correto com instância única.
- **Justificativa de negócio:** Zero infra nova — Redis já roda em produção; custo por request é um comando atômico.
- **Trade-offs aceitos:** Redis entra no caminho quente (latência + ponto de falha) ⇒ exige a política de fallback (D5); mitigável com Lua/pipeline.

### D3. Comportamento no estouro

- **Contexto:** Rejeitar (429), enfileirar ou apenas logar.
- **Decisão:** **429** com `Retry-After`; sem enfileiramento.
- **Justificativa técnica:** Contrato HTTP padrão; `Retry-After` habilita backoff do cliente. Fila apenas adia e acumula memória.
- **Justificativa de negócio:** Rejeição imediata e barata; nenhum recurso gasto servindo abuso.
- **Trade-offs aceitos:** Atacante ignora `Retry-After` — aceitável, o 429 já protege o backend.

### D4. Janela deslizante e limites diferenciados por rota

- **Contexto:** Fixed window admite rajada de fronteira (~2× o teto); sliding window suaviza. Limites iguais vs por rota.
- **Decisão:** **Janela deslizante**; `/auth/login` estrito (~5/min por IP), `/reports` folgado (~60/min por usuário).
- **Justificativa técnica:** Sliding window evita o burst de reset que dobraria o limite efetivo do login; limites por rota refletem risco/custo distintos.
- **Justificativa de negócio:** Login apertado corta brute-force; reports mais generoso preserva uso legítimo intenso.
- **Trade-offs aceitos:** Custo levemente maior em Redis que fixed window; irrelevante nesse volume.

### D5. Modo de falha do store: fail-open em `/reports`, fail-closed em `/auth/login`

- **Contexto:** Se o Redis (store do limiter) cair, o guard precisa escolher liberar (fail-open) ou bloquear (fail-closed).
- **Decisão:** `/reports` → **fail-open**; `/auth/login` → **fail-closed**.
- **Justificativa técnica:** Cada rota herda a política da característica dominante — availability em reports, security no login. Um modo global único sacrificaria uma delas.
- **Justificativa de negócio:** Blip de Redis não pode derrubar relatórios do negócio, nem escancarar brute-force ilimitado no login.
- **Trade-offs aceitos:** Fail-closed pode barrar logins legítimos durante um outage (janela curta + alerta o tornam aceitável); fail-open em reports abre janela sem limite no outage (aceito — reports é caro, não vetor de segurança). **Gatilho de revisão:** se `/reports` passar a expor dados sensíveis por custo/PII, reavaliar para fail-closed.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Extração de IP atrás do LB mal configurada ⇒ per-IP do login colapsa num IP único | 3 | 2 | 6 🔴 | `trust proxy` correto + teste de integração de IP real antes do rollout |
| Redis no caminho quente adiciona latência / ponto de falha | 2 | 2 | 4 🟡 | Contador atômico Lua/pipeline; fallback D5; alerta de saúde do Redis |
| Fail-closed no login barra usuários legítimos durante outage de Redis | 2 | 2 | 4 🟡 | Janela curta + alerta; aceitação de segurança documentada |
| Off-by-one na janela deslizante deixa passar acima do teto na fronteira | 2 | 2 | 4 🟡 | Testes de fronteira (rajada no reset) validando teto global entre 2 instâncias |

## Tratamento de Erros

- Estouro → 429 + `Retry-After` + headers `X-RateLimit-Limit/Remaining/Reset`.
- Redis indisponível → aplicar D5 por rota; log `warn` + métrica; nunca propagar exceção do store como 5xx em `/reports`.

## Testes

- Unit: `IdentityResolver` (userId vs IP por rota), `LimitConfig`.
- Integração (chave): teto **global** entre duas instâncias — bater nas duas não excede o limite (fecha D2).
- Integração: `/auth/login` → 429 após 5/min/IP; `/reports` → 429 após 60/min/usuário; `Retry-After` presente (D3/D4).
- Integração de falha: Redis derrubado ⇒ `/reports` serve (fail-open), `/auth/login` bloqueia (fail-closed) (fecha D5).
- Fronteira: rajada no reset não ultrapassa o teto (valida sliding window, D4).
