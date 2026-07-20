---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: rate-limiting-auth-reports
---

# Design Spec — Rate Limiting para `/auth/login` e `/reports`

## Visão Geral

A API NestJS (TypeORM + Postgres) roda em produção com **duas instâncias**
atrás de um load balancer. Precisamos limitar a taxa de requisições em dois
endpoints sob abuso: `/auth/login` (tentativas de força-bruta) e `/reports`
(endpoint pesado que sofre com flood). A solução deve ser enxuta, mas o limite
tem de valer **de forma consistente para as duas instâncias** e ter um
comportamento definido quando o próprio store do limiter falhar.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Consistency (multi-instância) | 2 instâncias; sem estado compartilhado o cliente ganha ~2× o teto trocando de instância | Teto global respeitado independentemente da instância que atende |
| Security | `/auth/login` é pré-auth e vetor de brute-force | ≤ 5 tentativas/min por IP no login; falha do limiter não abre login ilimitado |
| Resiliência / Availability | `/reports` sustenta operação de negócio; store fora não pode virar 5xx generalizado | Redis indisponível ⇒ `/reports` continua respondendo (fail-open) |

**Consideradas, não priorizadas:** throughput bruto (volume atual modesto), i18n.

## Arquitetura e Fluxo

Guard de rate limiting no NestJS por rota, usando `@nestjs/throttler` com
storage adapter apontando para o **Redis já existente** (usado para sessões).
Para cada request: resolve a chave (por rota), executa um `hit` atômico de
janela deslizante em Redis e decide allow/deny. No estouro, curto-circuito com
429 + `Retry-After`. Se o Redis não responder, aplica a política de fallback
específica da rota.

## Estrutura de Componentes

- **RateLimitGuard** — porta de entrada por rota; orquestra identidade → contagem → decisão.
- **RequestIdentityResolver** — extrai a chave de limite: `userId` em rotas autenticadas, IP em `/auth/login`.
- **SlidingWindowCounter** — contador de janela deslizante atômico sobre Redis; único estado compartilhado entre instâncias.
- **RouteLimitTable** — configuração declarativa (janela, teto, fallback) por rota.

## Decisões Arquiteturais

### D1. Como identificar o "cliente"

- **Contexto:** IP, usuário autenticado ou API key. `/auth/login` é pré-auth; `/reports` é autenticado.
- **Decisão:** `/auth/login` → por IP (extraído de `X-Forwarded-For` com proxy confiável). `/reports` → por `userId`.
- **Justificativa técnica:** Sem usuário no login, IP é o único identificador; per-user em reports é mais preciso e justo que per-IP.
- **Justificativa de negócio:** Não penaliza usuários legítimos que compartilham IP corporativo em `/reports`, mantendo contenção no login.
- **Trade-offs aceitos:** Per-IP é evadível por rotação de IP; compensado por teto baixo + fail-closed no login. Exige extração correta de IP atrás do LB.

### D2. Contador compartilhado em Redis (não em memória)

- **Contexto:** Duas instâncias. Contador em memória por processo dá ao cliente uma cota por instância (~2× o limite) e é não-determinístico segundo o LB.
- **Decisão:** Estado do rate limit em **Redis compartilhado**, reutilizando o cluster já em produção.
- **Justificativa técnica:** Consistência do limite entre instâncias só é possível com store central; in-memory só serve instância única.
- **Justificativa de negócio:** Nenhuma infra nova; custo por request é um comando atômico no Redis.
- **Trade-offs aceitos:** Latência e acoplamento ao Redis no caminho quente ⇒ exige a política de fallback (D5). Mitigável com script Lua/pipeline.

### D3. O que acontece ao estourar o limite

- **Contexto:** Rejeitar (429), enfileirar/throttlear ou apenas logar.
- **Decisão:** **429 Too Many Requests** com `Retry-After`; sem fila.
- **Justificativa técnica:** Contrato HTTP padrão; `Retry-After` permite backoff educado. Fila só adia e consome memória.
- **Justificativa de negócio:** Rejeição barata e imediata; nada é gasto atendendo abuso.
- **Trade-offs aceitos:** Cliente malicioso ignora `Retry-After` — irrelevante, pois o 429 já protege o backend.

### D4. Algoritmo de janela e limites por rota

- **Contexto:** Fixed window (permite rajada de fronteira ~2×) vs sliding window; limites iguais vs por rota.
- **Decisão:** **Janela deslizante**, com limites diferentes: `/auth/login` estrito (~5/min por IP), `/reports` mais folgado (~60/min por usuário).
- **Justificativa técnica:** Sliding window elimina o burst de fronteira que dobraria o limite efetivo do login. Limites por rota espelham risco/custo distintos.
- **Justificativa de negócio:** Login apertado corta brute-force; reports tolera uso legítimo intenso.
- **Trade-offs aceitos:** Ligeiro custo extra de memória/compute em Redis vs fixed window; desprezível nesse volume.

### D5. Falha do store: fail-open em `/reports`, fail-closed em `/auth/login`

- **Contexto:** Redis indisponível — o guard precisa escolher entre liberar (fail-open) ou bloquear (fail-closed).
- **Decisão:** `/reports` → **fail-open**; `/auth/login` → **fail-closed**.
- **Justificativa técnica:** Cada rota herda a política da sua característica dominante — availability em reports, security no login. Um modo global único sacrificaria uma delas.
- **Justificativa de negócio:** Um blip de Redis não pode derrubar relatórios do negócio, mas também não pode escancarar brute-force no login.
- **Trade-offs aceitos:** Fail-closed pode barrar logins legítimos durante um outage (janela curta + alerta o tornam aceitável). Fail-open em reports abre janela sem limite no outage (aceito: reports é caro, não é vetor de segurança).

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Extração de IP atrás do LB errada ⇒ per-IP do login vira "um IP global" | 3 | 2 | 6 🔴 | Configurar `trust proxy` + teste de integração de IP real antes do rollout |
| Dependência do Redis no caminho quente (latência / ponto de falha) | 2 | 2 | 4 🟡 | Contador atômico via Lua; fallback D5; alerta de saúde do Redis |
| Fail-closed do login barra usuários legítimos durante outage | 2 | 2 | 4 🟡 | Janela curta + alerta; aceitação de segurança documentada |
| Erro na implementação da janela deslizante (fronteira) | 2 | 2 | 4 🟡 | Teste de rajada no reset validando teto global sob 2 instâncias |

## Tratamento de Erros

- Estouro → 429 + `Retry-After` + headers `X-RateLimit-*`.
- Redis fora → aplicar D5 por rota; log `warn` + métrica; jamais propagar exceção do store como 5xx em `/reports`.

## Testes

- Unit: `RequestIdentityResolver` (IP vs userId por rota), `RouteLimitTable`.
- Integração (chave): teto **global** entre 2 instâncias — bater nas duas não ultrapassa o limite (fecha D2).
- Integração: `/auth/login` retorna 429 após 5/min/IP; `/reports` após 60/min/usuário; `Retry-After` presente (D3/D4).
- Integração de falha: Redis derrubado ⇒ `/reports` serve (fail-open), `/auth/login` bloqueia (fail-closed) (fecha D5).
- Fronteira: rajada no reset não excede o teto (valida sliding window).
