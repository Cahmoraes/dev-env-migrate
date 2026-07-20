# Brief — consolidate notification broadcast onto a message broker

**Scenario shape:** feature-in-existing (backend/infra, non-UI). One set of characteristics; a short tree (3–5 roots). This brief specifically probes the **named-but-dropped fork**: a hard technical property (at-least-once delivery → duplicates) that a specialist must surface *from the domain itself*, close in the spec — and close **without over-building**.

## Persona (simulated user)

A backend engineer on a NestJS + RabbitMQ + Postgres service that pushes live notifications to connected clients over SSE, across several load-balanced instances. Postgres is already the source of truth for notifications; clients reconnect with a `Last-Event-ID` header and catch up from Postgres. Pragmatic, frames the request as a plumbing swap. Answers concretely when asked, but **does not volunteer messaging concerns** (duplicates, dead-lettering, ordering) — believes it is a straightforward broker change.

## Surface intent (say unprompted)

> "We currently fan out notifications to instances through Redis pub/sub, and it's a second thing to operate. We already use RabbitMQ. I want to drop Redis and do the broadcast fan-out over RabbitMQ instead. Should be a plumbing swap."

Shallow follow-ups if asked vaguely: "yeah just move the fan-out to Rabbit", "same behavior, one less moving part".

## Ground-truth decisions (reveal only when probed)

| id | fork | hidden | preferred answer | reveal trigger |
|---|---|---|---|---|
| D1 | **Exchange + queue topology** — how the broadcast reaches every instance | no | fanout exchange; one **exclusive, auto-delete** queue per instance | interviewer asks how each instance receives every message |
| D2 | **Queue re-establishment on reconnect** — exclusive/auto-delete queues vanish on disconnect | **yes** | on every AMQP reconnect, redeclare the exchange + re-declare and re-bind the instance's queue (use `amqp-connection-manager` setup hooks) | interviewer probes what happens after a broker/connection drop |
| D3 | **Duplicate delivery / idempotency** — RabbitMQ delivery is at-least-once, so an instance can receive the same message twice | **yes** | *(fact the persona reveals when asked, NOT the closure)* "each notification already carries a monotonic **event ID**, and the client tracks the last one it rendered / reconciles against Postgres." The persona states this fact but does **not** propose what to do about duplicates. | interviewer follows the at-least-once implication ("what if an instance gets the same message twice?") |
| D4 | **Dead-lettering / undeliverable messages** — what happens to messages an instance misses while disconnected | **yes** | *(fact the persona reveals when asked, NOT the closure)* "a reconnecting instance's clients re-request from `Last-Event-ID` and catch up from Postgres, the source of truth." The persona states this recovery fact but does **not** propose a dead-letter/redelivery design. | interviewer asks about missed/undeliverable messages or a dead-letter path |
| D5 | **Shared-adapter regression** — the `RabbitMQAdapter` also backs ~7 existing `direct` exchanges | **yes** | generalize the adapter without changing existing `direct` behavior; default exchange type stays `direct` (backward-compatible); verify existing bindings before integrating | interviewer asks whether the fan-out change touches existing broker usage |

## What the spec must DERIVE (grader rubric — NOT persona-revealed)

This is the measured output, and the whole point of the scenario: the persona hands over **facts** (D3/D4 above), never these **decisions**. A specialist interviewer must derive them from the facts + the broker's properties. Under a self-play executor the answer key leaks, so treat this section as the grader's rubric, not as lines the simulated user says — and under a blind harness (separate user-simulator), keep it out of the interviewer's inputs entirely (see `../README.md`, "Self-play ceiling" section).

- **D3 closure to derive:** at-least-once + client already dedupes by event ID ⟹ **tolerate duplicates; add no consumer-side dedup store** (the event ID is the dedupe key).
- **D4 closure to derive:** best-effort broadcast + `Last-Event-ID` catch-up against Postgres ⟹ **no DLQ / no redelivery machinery** (catch-up is the recovery path).

## Leak test

Two symmetric failures, both scored:

1. **Named-but-dropped (silence).** A weak interview closes D1/D2/D5 but leaves the spec **silent** on D3 (duplicates) and D4 (dead-lettering) — the messaging forks a broker feature must answer. Silence forces the implementer to re-open them mid-task. Closure of D3+D4 is the named-but-dropped metric for this scenario.
2. **Over-closing (YAGNI).** The twin failure: "closing" D3 by bolting on a **consumer-side dedup store**, or D4 by adding a **dead-letter queue**, when the design's own shape (event-ID dedupe at the client + `Last-Event-ID` catch-up against Postgres) already handles both. A DLQ or dedup subsystem on this best-effort broadcast is over-build, not closure.

The specialist signal is **explicit closure by rule-out/toleration**: D3 resolved as "duplicates tolerated — client dedupes by event ID", D4 resolved as "no DLQ — recovery is Last-Event-ID catch-up". Every hard decision resolved (with its trade-off or its rule-out reason), none left vague, dropped, **or over-built** — the spec closes every end, and closing can be a single line ruling a concern out.
