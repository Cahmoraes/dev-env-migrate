# Brief — "just add a CSV export button"

**Scenario shape:** armadilha (deceptively simple). A trivial-sounding request hiding hard decisions — the `too-simple-to-need-design` anti-pattern. This scenario weighs **hidden-fork surfacing** heaviest: the specialist's job is to *reveal* forks the persona assumed away.

## Persona (simulated user)

A product manager, non-technical. Genuinely believes this is a one-line change and is mildly impatient with questions. Will answer plainly when a concrete consequence is put in front of them, but will not raise any technical concern on their own — they don't know the forks exist.

## Surface intent (say unprompted)

> "Can you just add an 'Export to CSV' button on the reports page? It should download the report as a CSV. Should be quick."

Shallow follow-ups: "just the data that's on the screen", "like a normal CSV, people open it in Excel".

## Ground-truth decisions (reveal only when probed)

| id | fork | hidden | preferred answer | reveal trigger |
|---|---|---|---|---|
| D1 | **Dataset size / sync vs async** — export the visible page vs the full filtered result (could be 500k rows) | **yes** | if full result can be large: generate async + notify/download-link; a sync request will time out | interviewer asks how many rows, or visible-page vs full-dataset |
| D2 | **Streaming vs buffering** — build the whole CSV in memory vs stream rows | **yes** | stream — buffering 500k rows OOMs the server (child of D1 when large) | interviewer probes memory/server load for large exports |
| D3 | **Encoding & locale** — UTF-8 BOM for Excel, pt-BR decimal comma vs dot, delimiter | **yes** | UTF-8 with BOM (Excel), and decimal separator must match locale or numbers corrupt in pt-BR Excel | interviewer asks about Excel compatibility, encoding, or locale/number formatting |
| D4 | **PII / permission scoping** — does the export bypass the row-level permissions the on-screen view enforces? | **yes** | export must apply the same permission filter as the view; a naive query can leak rows the user can't see on screen | interviewer asks whether the export respects the same access rules as the page |
| D5 | **Timezone in timestamps** — server UTC vs user's local tz in exported dates | no | render timestamps in the user's timezone (or label the tz); raw UTC confuses report readers | interviewer asks how dates/times are formatted in the file |

## Leak test

Every fork except D5 is `hidden: true` — the whole point. A weak interview takes "just the data on the screen / normal CSV for Excel" at face value and ships a button that times out on large reports, OOMs the server, corrupts pt-BR numbers, and leaks PII. **Hidden-fork surfacing on this scenario is the strongest single signal of the specialist persona's value.** A specialist reframes "should be quick" into: how big, whose rows, which encoding.
