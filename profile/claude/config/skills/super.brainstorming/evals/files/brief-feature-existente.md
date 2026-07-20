# Brief — rate limiting on an existing NestJS API

**Scenario shape:** feature-in-existing (light). One set of characteristics; a short tree (2–4 roots).

## Persona (simulated user)

A backend tech lead on a NestJS + TypeORM + Postgres API already in production behind two load-balanced instances. Pragmatic, wants the smallest change that holds. Answers concretely when asked, but frames the request narrowly and does not volunteer architecture concerns.

## Surface intent (say unprompted)

> "Our `/auth/login` and `/reports` endpoints are getting hammered. I want to add rate limiting so a client can't spam us. Something simple."

Shallow follow-ups if asked vaguely: "yeah just cap the requests per client", "nothing fancy".

## Ground-truth decisions (reveal only when probed)

| id | fork | hidden | preferred answer | reveal trigger |
|---|---|---|---|---|
| D1 | **Identity of a "client"** — per-IP vs per-authenticated-user vs per-API-key | no | per-user for authed routes, per-IP for `/auth/login` (pre-auth) | interviewer asks how a client is identified, or distinguishes authed vs pre-auth routes |
| D2 | **Shared state across the 2 instances** — in-memory counter vs Redis/shared store | **yes** | Redis — in-memory per-instance lets a client get 2× the limit and is non-deterministic | interviewer probes correctness across multiple instances / the load balancer |
| D3 | **Behavior on breach** — 429 reject vs throttle/queue vs shadow-log only | no | 429 with `Retry-After`; no queueing | interviewer asks what happens when the limit is hit |
| D4 | **Limit granularity / window** — fixed window vs sliding window; per-route limits | no | sliding window; stricter limit on `/auth/login` than `/reports` | interviewer asks about the window algorithm or whether limits differ per route |
| D5 | **Failure mode of the limiter store** — fail-open vs fail-closed when Redis is down | **yes** | fail-open for `/reports`, fail-closed for `/auth/login` | interviewer asks what happens if the rate-limit store itself is unavailable |

## Leak test

A weak interview closes D1/D3/D4 (the obvious ones) and silently drops D2 and D5 — the distributed-correctness and failure-mode forks. Those two are the specialist signal: closure of D2+D5 is the hidden-fork metric for this scenario. Every hard decision must be resolved (with its trade-off), not left vague or dropped — the spec closes every end.
