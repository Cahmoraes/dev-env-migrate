# Research fan-out — what to dispatch, in what order, and how to weigh what comes back

Read this at the start of the Opening Phase, before the dispatch turn. The per-track prompt templates live in `./research-subagent-templates.md`, the feature-history recall agent in `../agents/feature-history-recall.md`.

**Between finishing this file and the dispatch turn, nothing goes in between.** At most one shell call belongs to this phase, named below: the path test for a pre-existing research artifact, which runs only when a slug was handed to you — so by default this phase has **no** shell call. Never another one (a listing of `docs/superpowers/`, a note of the steps you are about to take): each is a turn the user spends waiting for a question you could already have asked.

## Dispatch the feature-history recall

**Feature history — the Feature history recall subagent, dispatched with the rest of the fan-out** (contract in `../agents/feature-history-recall.md`). `scripts/feature-index.cjs` derives the index from `docs/superpowers/` at the moment of the call; on a repo with dozens of features the index runs to thousands of tokens and the artifacts behind it to many KB each, so it returns a short report and neither the index nor the artifacts enter this conversation. No extra wall-clock: it rides a turn you were already taking. Investigating a past feature IS research — listing `docs/superpowers/` or opening a design doc is the retrieval the gate below forbids in the main thread. Do not prescribe the subagent a search procedure beyond its contract (spelling out list → search → open pulls the design toward `docs/` and away from the code).

## Detect a pre-existing research artifact (do this first)

`super.deep-research` may already have persisted a broad, verified pass at `docs/superpowers/<slug>/research/research-<slug>.md`; reusing it saves the whole fan-out. **This test runs only when you were handed the slug** — a `super.deep-research` handoff, an explicit path from the user, a slug already reconciled (see [Reconcile the feature slug](./after-the-design.md#reconcile-the-feature-slug)). It is **not the read the recall track owns**: one path, tested for existence. Skipping this check because the gate looks like it covers it costs the whole fan-out over ground a verified artifact already holds. Substitute the slug and run exactly this, once:

```bash
test -f docs/superpowers/<slug>/research/research-<slug>.md && echo FOUND || echo NONE
```

**Without a slug in hand there is no path to test, and this section is skipped entirely.** Do not go looking for the slug — guessing it from the topic, globbing for a directory that resembles it, listing `docs/superpowers/` to see which names are close: each is the walk of the feature trees the recall track owns. **This test, when it runs, is the only thing outside the `<RESEARCH-GATE>`.** The exemption does not extend to anything you decide to open afterwards, least of all to the feature history.

- **If it exists:** read it and treat it as a high-priority distilled input. Skip the tracks whose ground it already covers (web research, library/API docs); dispatch only for gaps, plus codebase exploration (which targets this workspace regardless).
- **If no artifact exists:** proceed with the full fan-out below.

**Dispatch all research in a single turn, and put your first message to the user in that same turn** — the companion offer when a visual signal matches, in the same turn as the first clarifying question. The fan-out then runs while the user is reading the question.

**The opening question is the one no research can answer**: what the feature is for, what problem it solves, which outcome the user is buying — answerable from the topic sentence alone, so it does not wait. If you could only ask it after reading a report ("which provider?", "which of these two patterns?"), it is a branch question, not the opening one: hold it until the reports land. **Exception:** if the request is so vague that you cannot aim a single track, the question goes out alone and the dispatch waits for the answer.

<RESEARCH-GATE>
Do NOT read files, search the code, query library docs, or call any web-search tool directly in the main agent during this phase, and run a shell command only for the one named above. All high-volume retrieval — codebase exploration, library docs, web research, user-provided URLs, and local documents — is dispatched as background subagents.

**The gate does not lapse when the interview starts.** It covers the clarifying questions and the approach proposals too — where the pull to "just take a quick look" is strongest, because by then you know exactly which file you want.
</RESEARCH-GATE>

**When the interview reveals a feature the report only skimmed, dispatch a scoped second recall**: re-dispatch the **Feature history recall** track with the slugs named and the specific question stated (`--feature <slug>` scopes the index; its steps 1 and 2 are skipped). One dispatch, however many slugs. Never open the artifacts inline, and never re-run the unscoped index.

## Corporate Artifacts

Check whether corporate artifacts are available in context — `super.using-superpowers` passes them when present (a message like _"Corporate artifacts are available: [list]"_). They have **no fixed format** (a ready PRD, a wiki export, an API schema, an ADR, loose notes), so **never couple to their structure**: RECOVER and CONVERT them into our own templates (the design spec here, the PRD in `super.generating-prd`); it is our converted artifact that is later validated and mined for identifiers. Include each in the User-referenced resources dispatch, exactly like user-provided paths and URLs: local path → inspect via `view`; public URL → fetch; inaccessible URL → ask the user for an excerpt.

**Precedence — corporate artifacts win on conflict, but never silently.** When one conflicts with another source (a current-session decision, the spec, the feature history, research), **stop, tell the user a conflict exists, present the corporate value as the recommended truth, and ask which one to follow.** The answer is your instruction now (precedence #1) and stands for the rest of the session.

## What to dispatch in parallel

All applicable tracks launch in the **same tool-calling turn** — one message carrying every dispatch call. The **Agent type** column is a *value* you pass to your platform's dispatch tool — never a tool to call.

| Subagent | When | Agent type |
|----------|------|-----------|
| **Feature history recall** | **Always** — one subagent for the whole history, never one per slug, never inline. An empty `docs/superpowers/` costs one cheap dispatch that reports "no feature history" and stops, so do **not** check the directory first: that look *is* the inline read this track exists to avoid | `explore` (`../agents/feature-history-recall.md`) |
| Codebase exploration | Always for existing projects; skip for clearly greenfield work | `explore` |
| Library / API docs | Topic involves external libraries or frameworks | `explore` instructed to use the session's library-docs tool (when available) |
| Web research | Needs current best practices, comparisons, or technology state | `explore` instructed to use the session's web-search tool (when available) |
| User-referenced resources & corporate artifacts | User mentions URLs or docs, OR corporate artifacts are available in context: public URL → fetch; local path → inspect; inaccessible → ask for an excerpt | `explore` |

**Project constitution (binding):** the codebase-exploration subagent also surfaces the consuming repo's **`CLAUDE.md` / `AGENTS.md`** (root and nested). Their declared principles and conventions (DDD, Design-by-Contract guards, CQS, SOLID, naming, layering, explicit "always/never" rules) are the constitution the design honors on the *engineering* plane (*how* you build), the peer of corporate artifacts on the *product* plane (*what* you build). If the design must deviate from a stated rule, surface the conflict to the user instead of silently breaking it.

If the library-docs or web-search tool is unavailable or hits quota, continue with best available knowledge.

## Subagent prompt templates

Dispatch each subagent with the minimum context it needs (no conversation history, no file dumps) and cap responses at ~300 words / 8 bullets (the recall track carries its own, larger cap). Templates for the other three tracks: **[`./research-subagent-templates.md`](./research-subagent-templates.md)**.

**Await the subagents — never poll for them.** The harness re-invokes you as each returns. Do **not** `sleep`, list running agents, or schedule a wakeup/timer to "check on" them — busy-polling harness-tracked background work is wasted and a malformed wakeup call errors out mid-flow.

**When a report lands and your question is still open, the whole turn is one line naming the track that finished.** Silence is not available — the harness rejects a turn with no visible text — so name the track, in the session's language, and stop: *"Codebase exploration done."* / *"Web research done."* / *"Feature history done."* Never report that you are still waiting, and never put the findings in that line: they land folded into your next question.

<a id="after-all-subagents-complete"></a>
## After all subagents complete

Synthesize findings internally; do not relay raw subagent output. **There is no digest to post when the reports land**: the one-line track acknowledgment above is the whole message, and the user is already answering the opening question, so fold what you learned into the next question and into the approach proposals.

**Source precedence.** When the feature history carries decisions, constraints, or scope boundaries that affect the topic, respect them as established context and, when one materially shapes a recommendation, mention its existence briefly. An item another feature explicitly put **out of scope** is the highest-value signal there — say so rather than silently re-proposing it. Priority order (highest first):

1. Latest user instruction — including the user's answer when you surface a conflict
2. Corporate artifacts (*what* to build) and the project constitution `CLAUDE.md`/`AGENTS.md` (*how* to build) — each the source of truth on its own plane; on conflict with anything below, apply the conflict protocol above
3. Approved spec / current-session decisions
4. The feature history (prior features' objectives and out-of-scope boundaries, from the recall report)
5. Persisted research artifact (distilled `super.deep-research` findings — strong, verified, not the final word on what the user wants)
6. External research (lowest)
