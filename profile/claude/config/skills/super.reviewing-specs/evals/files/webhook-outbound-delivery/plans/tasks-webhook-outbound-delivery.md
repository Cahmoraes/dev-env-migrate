# Tasks — webhook-outbound-delivery

Spec: `../specs/webhook-outbound-delivery-design.md`

## Ondas de execução

- W1: task-01 ∥ task-02
- W2: task-03

## Tarefas

- [ ] task-01 — Declarar a fila `webhookOutbound` + graceful shutdown do worker
- [ ] task-02 — `WebhookPublisher` publica na fila `webhookOutbound`
- [ ] task-03 — `WebhookWorker` consome e entrega via `HttpDeliveryClient`
