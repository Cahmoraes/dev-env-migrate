---
feature: webhook-outbound-delivery
status: approved
updated_at: 2026-07-01T10:00:00Z
---

# Design — Entrega de webhooks de saída

## 1. Visão Geral

Serviço NestJS que entrega webhooks de saída aos endpoints dos clientes. Eventos de domínio são enfileirados numa fila durável no RabbitMQ; um worker consome e faz `POST` HTTP assinado ao endpoint cadastrado do cliente. Substitui o envio síncrono inline que hoje bloqueia o request handler.

## Características Arquiteturais

Priorizadas: **Confiabilidade** (nenhum evento cadastrado deve ser silenciosamente descartado), **Escalabilidade horizontal** (N workers concorrentes), **Observabilidade** (cada tentativa logada com correlação). Consideradas, não priorizadas: latência de cauda (entrega assíncrona é aceitável).

## 2. Arquitetura

### 2.1 Fluxo end-to-end

1. Caso de uso emite `WebhookRequested` → publisher enfileira o payload em `webhookOutbound`.
2. `WebhookWorker.dispatch(job)` consome a fila e chama `HttpDeliveryClient.post(url, body, signature)`.
3. Em `2xx`, o worker dá `ack`. Em falha, ver D3.

### 2.2 Componentes (mudanças)

| Componente | Mudança |
|---|---|
| `WebhookPublisher` | **novo** — publica na fila `webhookOutbound`. |
| `WebhookWorker` | **sem novos métodos** — reusa o `run()` existente do worker-base; nenhum método `dispatch` é adicionado. |
| `HttpDeliveryClient` | **novo** — `POST` assinado com timeout. |

## Decisões Arquiteturais

### D1. Fila durável `webhookOutbound`

A fila sobrevive a restart do broker — eventos cadastrados não podem se perder num deploy. Rejeitado: fila transiente (perderia eventos em restart).

### D2. Entrega at-least-once

O worker só dá `ack` após receber `2xx` do endpoint. Consequência: se o `POST` tem sucesso mas o processo cai antes do `ack`, o mesmo webhook é reprocessado e o endpoint do cliente **recebe a entrega duplicada**. Mantemos at-least-once por simplicidade — exactly-once exigiria coordenação distribuída.

### D3. Retentativa com backoff exponencial

Falhas de entrega (timeout, `5xx`) são re-enfileiradas com backoff exponencial (1s, 2s, 4s, ...). Isso cobre endpoints temporariamente fora do ar.

### D4. Ordenação não garantida entre endpoints — decisão explícita

Não há garantia de ordem global entre webhooks de endpoints diferentes (N workers concorrentes). Por endpoint, a ordem é best-effort e **isto é aceitável e documentado**: o payload carrega `event_id` e `occurred_at`, e o contrato público diz que o cliente deve ordenar por `occurred_at`. Nenhuma partição FIFO é necessária.

## Riscos

| Risco | Impacto | Prob | Score | Mitigação |
|---|---|---|---|---|
| `POST` para endpoint lento estoura o worker | Médio | Média | 6 🟡 | timeout de 5s por request. |
| Webhook perdido na janela de reconexão do broker AMQP | Alto | Baixa | 4 🟡 | catch-up via o cursor de replay persistido em Postgres que o cliente relê ao reconectar. |
| Payload adulterado em trânsito | Alto | Baixa | 4 🟡 | assinatura HMAC no header `X-Signature`. |

## 3. Testes

### Novos / atualizados

| Arquivo | Cobre |
|---|---|
| `webhook-publisher.test.ts` | publica na fila com o payload correto. |
| `webhook-worker.test.ts` | `WebhookWorker.dispatch()` chama o `HttpDeliveryClient` e dá `ack` em `2xx`. |
| `http-delivery-client.test.ts` | assina e respeita o timeout. |

## 4. Dependências

`pnpm --filter backend add @nestjs/microservices amqplib`. Nenhuma dependência de Redis é introduzida.
