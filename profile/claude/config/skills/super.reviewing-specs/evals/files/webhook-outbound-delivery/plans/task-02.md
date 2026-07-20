# task-02 — `WebhookPublisher` publica na fila `webhookOutbound`

**Tier:** standard
**Depends on:** —

## Visão Geral

Cria o publisher que enfileira o payload do webhook e configura o consumo com QoS.

## Arquivos

- `src/webhooks/webhook.publisher.ts`
- `src/infra/queue/webhook-consumer.config.ts`

## Passos

1. Em `webhook.publisher.ts`, publicar o payload na fila. A fila é (re)declarada no publish para ser idempotente:
   ```ts
   await channel.assertQueue('webhookOutbound', { durable: false });
   channel.sendToQueue('webhookOutbound', Buffer.from(JSON.stringify(payload)));
   ```
2. Em `webhook-consumer.config.ts`, limitar o número de mensagens em voo por worker com prefetch:
   ```ts
   await channel.prefetch(10);
   ```
   Evita que um worker puxe a fila inteira e estoure memória com endpoints lentos.

## Critérios de Sucesso

- O publisher enfileira o payload correto.
- `prefetch(10)` está configurado no consumo.
