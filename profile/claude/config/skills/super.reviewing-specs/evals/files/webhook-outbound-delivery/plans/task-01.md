# task-01 — Declarar a fila `webhookOutbound` + graceful shutdown

**Tier:** standard
**Depends on:** —

## Visão Geral

Declara a infraestrutura de fila para a entrega de webhooks e conecta o teardown do worker ao shutdown do Nest.

## Arquivos

- `src/infra/queue/webhook-outbound.queue.ts`
- `src/infra/queue/webhook-worker.lifecycle.ts`

## Passos

1. Em `webhook-outbound.queue.ts`, declarar a fila:
   ```ts
   await channel.assertQueue('webhookOutbound', { durable: true });
   ```
   A fila é durável — eventos cadastrados sobrevivem a restart do broker (D1).
2. Implementar `onModuleDestroy()` no worker: fechar o canal e a conexão AMQP no shutdown do Nest, para não vazar conexões.

## Critérios de Sucesso

- `assertQueue` usa `durable: true`.
- O teardown é chamado no `onModuleDestroy`.
