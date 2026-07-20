# Brief — URL shortener from zero

**Scenario shape:** greenfield (full). Nothing is fixed; almost every decision is a root that constrains the rest.

## Persona (simulated user)

A solo founder building a URL shortener as a new product. Non-specialist in distributed systems; excited, optimistic about scale, vague on mechanics. Answers business-goal questions confidently and technical-fork questions only when the interviewer frames the trade-off for them.

## Surface intent (say unprompted)

> "I want to build a link shortener — you paste a long URL, it gives you a short link, and when people click it they get redirected. I think it could get big, like millions of links."

Shallow follow-ups: "it should be fast", "yeah custom links would be cool", "I guess I want to see click stats".

## Ground-truth decisions (reveal only when probed)

| id | fork | hidden | preferred answer | reveal trigger |
|---|---|---|---|---|
| D1 | **Short-code generation** — random vs hash vs counter/base62 | no | counter → base62 (short, no collisions); random only if unguessability matters | interviewer asks how the short code is produced |
| D2 | **Collision strategy** — depends on D1: retry-on-collision vs collision-free by construction | **yes** | collision-free via counter makes D1's answer binding; random forces a uniqueness check on every write | interviewer probes what happens when two codes collide (child of D1) |
| D3 | **Read/write asymmetry** — reads (redirects) vastly outnumber writes | **yes** | read-optimized: cache hot codes, redirect path must not hit the write DB uncached | interviewer asks about the read-vs-write ratio or redirect latency at scale |
| D4 | **Custom aliases coexisting with generated codes** — shared keyspace vs separate | no | shared keyspace with a reserved-word/collision check on custom aliases | interviewer asks how custom links interact with generated ones |
| D5 | **Analytics write path** — synchronous on redirect vs async/queue | **yes** | async — counting a click must not add latency to the redirect (ties to the scale claim) | interviewer asks how click stats are recorded without slowing redirects |
| D6 | **"Millions of links" as a characteristic** — is scalability actually a priority-3, or premature? | no | scalability + performance are top characteristics *because the persona claimed scale*; force the persona to confirm or retract | interviewer uses architecture-characteristics to make the persona prioritize |

## Leak test

D2, D3, D5 are the hidden roots a specialist extracts from the throwaway phrase "could get big / it should be fast". D2 is a *child* of D1 — resolving D1 as counter/base62 should delete D2's retry branch (decision-tree ordering). A weak interview settles D1/D4/D6 and never surfaces the read/write asymmetry or the async analytics path.
