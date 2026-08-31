# Research fan-out — what to dispatch, in what order, and how to weigh what comes back

Read this at the start of the Opening Phase, before the dispatch turn. SKILL.md keeps
the two rules a resumed session still needs (dispatch through `task`; await, never poll) and points
here for the rest. The per-track prompt templates live in `./research-subagent-templates.md`, and
the feature-history recall agent in `../agents/feature-history-recall.md`.

**Between finishing this file and the dispatch turn, nothing goes in between.** Exactly two shell calls belong to this phase, and both are named below: the confirmed-lessons load, which always runs, and the path test for a pre-existing research artifact, which runs only when a slug was handed to you — so by default this phase is **one** call. **Never** a third one — not an `ls` of `docs/superpowers/`, not a detour to write down the steps you are about to take. Each of those is a model turn the user spends waiting for a question you could already have asked.

## Contents

- Load the confirmed lessons (main thread), and dispatch the feature-history recall
- Detect a pre-existing `super.deep-research` artifact
- Corporate Artifacts, and the conflict protocol
- What to dispatch in parallel (the track table + the project constitution rule)
- After all subagents complete — synthesis and the full source-precedence order

---

## Load the confirmed lessons (main thread), and dispatch the feature-history recall

Two local inputs, in two different places, and the reason is **size**: the lessons are a handful of one-line sentences, the feature history grows with the repo.

**Confirmed lessons — one call, in the main thread:**

```bash
python3 "$(dirname "<super.brainstorming-base-dir>")/super.independent-verification/scripts/lessons.py" list --status confirmed
```

> `lessons.py` belongs to **`super.independent-verification`, not to this skill.** The harness injects only the base directory of the skill it just invoked, so a sibling skill is reached through the skills directory that contains both — that is what the `dirname` is for. The script takes **no `--repo-root`**; `list --status confirmed` is the whole invocation. Pointing `python3` at `<this skill>/scripts/lessons.py` finds nothing, and recovering from that costs several shell calls hunting for the file.

If it still cannot be found or run, say so in one line and continue **without** lessons: this is a graceful-degradation read, not a gate, so a missing store never blocks the session.

**This one call is the first of exactly two things outside the `<RESEARCH-GATE>` below**, the second being the path test in the next section. It returns a few sentences of already-digested guidance, so it needs no subagent. The exemption does not extend to anything you decide to open afterwards, and least of all to the feature history.

**The confirmed lessons** are one-sentence guidance the lessons layer has already earned trust for. Only `confirmed` loads (never `candidate` or `quarantined` — see `super.independent-verification/references/lessons.md`, "Lifecycle"). Apply matching lessons while proposing approaches and writing the spec, the same way the feature history or a corporate artifact informs the design (see Source precedence below). If the store is empty or `.superpowers/` doesn't exist yet, proceed normally — there is nothing to apply yet.

**Feature history — the Feature history recall subagent, dispatched with the rest of the fan-out** (contract in `../agents/feature-history-recall.md`). `scripts/feature-index.cjs` derives the index from `docs/superpowers/` at the moment of the call: on a repo with dozens of features that index runs to thousands of tokens, and the design docs and PRDs behind those names to many KB each. Retrieval at that size is exactly what the fan-out is for. It returns a short report, and neither the index nor the artifacts ever enter this conversation. No extra wall-clock, because it rides a turn you were already taking.

> **Investigating a past feature IS research — not a shortcut around it.** A `find` over `docs/superpowers/`, an `ls` of a feature tree, a `view` of a design doc: each is the high-volume retrieval the gate below forbids in the main thread, and each stays resident for the rest of the interview.

**Do not prescribe the subagent a search procedure beyond its contract.** A measured A/B found that spelling out the steps (`ls`, then `grep`, then open) scored *last*, below giving no instruction at all, because it pulled the design toward `docs/` and away from the code. The contract says *what to select and what to return*; how it finds it is its own business.

## Detect a pre-existing research artifact (do this first)

`super.deep-research` may already have run an upfront pass for this topic and persisted it at `docs/superpowers/<slug>/research/research-<slug>.md`. That pass is **broad, adversarially verified, and persisted**; brainstorming's own research is **ephemeral, synthesized in context, not persisted** — focused on filling remaining gaps. Reusing it saves the whole fan-out; missing it pays for ground a verified artifact already holds.

**This test runs only when you were handed the slug** — a `super.deep-research` handoff, an explicit path from the user, a slug already reconciled (see [Reconcile the feature slug](./after-the-design.md#reconcile-the-feature-slug)). It is **not the read the recall track owns**: one path, tested for existence, versus a walk of the feature trees. Skipping this check because the gate looks like it covers it costs the whole fan-out over ground a verified artifact already holds. Substitute the slug and run exactly this, once:

```bash
test -f docs/superpowers/<slug>/research/research-<slug>.md && echo FOUND || echo NONE
```

**Without a slug in hand there is no path to test, and this section is skipped entirely** — the phase is then one shell call, the lessons load. Do not go looking for the slug: guessing it from the topic, globbing for a directory that resembles it, listing what is under `docs/superpowers/` to see which names are close — each of those is the walk of the feature trees the recall track owns, and it is the single most common way this phase turns into four extra turns. If the artifact were there and nobody handed you the slug, the fan-out simply runs; that is the cheap failure.

**This test, when it runs, is the second and last thing outside the `<RESEARCH-GATE>`.**

- **If it exists:** read it and treat it as a **high-priority distilled input**. Do NOT re-run the wide fan-out. Skip the subagents whose ground it already covers (web research, library/API docs); dispatch only for **gaps it doesn't cover**, plus codebase exploration (which targets this workspace regardless of prior research).
- **If no artifact exists:** proceed with the full fan-out below.

**Dispatch all research in a single turn, and put your first message to the user in that same turn** — the visual-companion offer when a visual signal matches, otherwise the first clarifying question. Keeping the retrieval out of the main agent preserves context budget for the interview, the trade-offs and the spec; sending the question *with* the dispatches means the fan-out runs while the user is reading it, instead of before they have been asked anything.

**The opening question is the one no research can answer**: what the feature is for, what problem it solves, which outcome the user is buying. That question is answerable from the topic sentence alone, which is why it does not wait. If you could only ask it after reading a report — "which provider?", "which of these two patterns?" — it is a branch question, not the opening one: hold it until the reports land.

**Exception:** if the request is so vague that you cannot aim a single track, the question goes out alone and the dispatch waits for the answer.

<RESEARCH-GATE>
Do NOT call `view`, `glob`, `grep`, `context7`, or any web-search tool directly in the main agent during this phase, and call `bash` only for the two commands named above. All high-volume retrieval — codebase exploration, library docs, web research, user-provided URLs, and local documents — must be dispatched via the `task` tool as background subagents. The `task` tool is the only permitted mechanism for research during brainstorming.

**The gate does not lapse when the interview starts.** It covers the clarifying questions and the approach proposals too — which is where the pull to "just take a quick look" is strongest, because by then you know exactly which file you want.
</RESEARCH-GATE>

**When the interview reveals a feature the report only skimmed, dispatch a scoped second recall.** The first pass judged relevance from the topic sentence alone; three questions in you know more than it did, and a feature it summarized in one line may carry the decision the design hinges on. That is a normal outcome, not a failure of the first pass: re-dispatch the **Feature history recall** track with the slugs named and the specific question stated (`--feature <slug>` scopes the index; its steps 1 and 2 are skipped, since you already know which features you mean). One dispatch, however many slugs. Never open the artifacts inline, and never re-run the unscoped index — you already have the breadth.

## Corporate Artifacts

Check whether corporate artifacts are available in context — `super.using-superpowers` passes them when present (a message like _"Corporate artifacts are available: [list]"_). They have **no fixed format** — a ready PRD, a wiki HTML export, an API schema, an ADR, loose notes, anything — so **never couple to their structure**. Treat them as source material to RECOVER and CONVERT into our own templates (the design spec here, the PRD in `super.generating-prd`); it is our converted artifact — never the raw corporate file — that we later validate and extract identifiers/keywords from. Their purpose is to let us **reuse** existing specs/PRDs/decisions instead of recreating them, always brought into the superpowers format. If they exist, include each as part of the User-referenced resources subagent dispatch, treated exactly like user-provided paths and URLs:
- Local path → inspect via `view`
- Public URL → fetch
- Inaccessible URL → ask the user for an excerpt

**Precedence — corporate artifacts win on conflict, but never silently.** When a corporate artifact conflicts with another source (a current-session decision, the spec, the feature history, or research), do **not** resolve it on your own and do **not** just follow the session: corporate artifacts are the company's source of truth, so **stop, tell the user a conflict exists, present the corporate value as the recommended truth, and ask which one to follow.** The user's answer is your instruction now (precedence #1) and stands for the rest of the session. (Full priority ordering in [After all subagents complete](#after-all-subagents-complete).)

## What to dispatch in parallel

All applicable tracks must be launched in the **same tool-calling turn** — one message carrying every `task` call, so the track you send last does not start last.

The **Agent type** column is a *value* you pass to your platform's dispatch tool — never a tool to call. Your platform's tool-mapping reference says which parameter carries it.

| Subagent | When | Agent type |
|----------|------|-----------|
| **Feature history recall** | **Always** — one subagent for the whole history, never one per slug, never inline. An empty `docs/superpowers/` costs one cheap dispatch that reports "no feature history" and stops, so do **not** check the directory first: that look *is* the inline read this track exists to avoid | `explore` (`../agents/feature-history-recall.md`) |
| Codebase exploration | Always for existing projects; skip for clearly greenfield work | `explore` |
| Library / API docs | Topic involves external libraries or frameworks | `explore` instructed to use `context7` (when available) |
| Web research | Needs current best practices, comparisons, or technology state | `explore` instructed to use `exa-web-search-free` (when available) |
| User-referenced resources & corporate artifacts | User mentions URLs or docs, OR corporate artifacts are available in context: public URL → fetch; local path → inspect; inaccessible → ask for an excerpt | `explore` |

**Project constitution (binding):** the codebase-exploration subagent must also surface the consuming repo's **`CLAUDE.md` / `AGENTS.md`** (root and any nested ones). Their declared principles and conventions (DDD, Design-by-Contract guards, CQS, SOLID, naming, layering, explicit "always/never" rules) are the **constitution your design must honor** on the *engineering* plane (*how* you build), the peer of corporate artifacts, which bind the *product* plane (*what* you build) — ranked in the precedence list below. If the design must deviate from a stated rule, surface the conflict to the user instead of silently breaking it.

If `context7` or `exa-web-search-free` are unavailable or hit quota, continue with best available knowledge — don't block the session.

## Subagent prompt templates

Dispatch each subagent with the minimum context it needs (no conversation history, no file dumps) and cap responses at ~300 words / 8 bullets (summaries, not raw output — the recall track carries its own, larger cap because it covers several features). Prompt templates for the other three tracks: **[`./research-subagent-templates.md`](./research-subagent-templates.md)**.

**Await the subagents — never poll for them.** They run in the background and the harness re-invokes you as each returns; simply wait. Do **not** `sleep`, list running agents, or schedule a wakeup/timer to "check on" research subagents you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow.

**When a report lands and your question is still open, the whole turn is one line naming the track that finished.** Silence is not available — the harness re-invokes you on every return and rejects a turn with no visible text — so "nothing to say" becomes whatever you improvise, and what gets improvised is the pending question restated once per returning subagent. Name the track, in the session's language, and stop: *"Codebase exploration done."* / *"Web research done."* / *"Feature history done."* Never report that you are still waiting: the user is looking at the question, three reports would mean three copies of it, and it is a process they cannot speed up. Never put the findings in that line either — they land folded into your next question.

<a id="after-all-subagents-complete"></a>
## After all subagents complete

Synthesize findings internally before proceeding — do not relay raw subagent output to the user; let the research inform your questions and approach proposals. **There is no digest to post when the reports land**: the one-line track acknowledgment above is the whole message, and the user is already answering the opening question, so fold what you learned into the next question and into the approach proposals. A research digest posted for its own sake is a message nobody asked for and a turn that delays the next one.

**Source precedence.** When the feature history carries decisions, constraints, or scope boundaries that affect the topic, respect them as established context and, when one materially shapes a recommendation, briefly mention its existence (e.g., "Based on a prior decision to use Clean Architecture with Inversify..."). An item another feature explicitly put **out of scope** is the highest-value signal there — say so rather than silently re-proposing it. Full priority order (highest first):

1. Latest user instruction (highest) — including the user's answer when you surface a conflict
2. Corporate artifacts (*what* to build) and the project constitution `CLAUDE.md`/`AGENTS.md` (*how* to build) — each the source of truth on its own plane; on conflict with anything below, never silently override — apply the conflict protocol above (surface, recommend the authoritative value, ask the user; their answer is then your instruction at #1 and stands for the rest of the session)
3. Approved spec / current-session decisions
4. The feature history (prior features' objectives and out-of-scope boundaries, from the recall report)
5. Confirmed lessons (grounded, recurring execution guidance from `lessons.py` — advisory, not a decision or constraint)
6. Persisted research artifact (distilled `super.deep-research` findings — a strong, verified input, but not the final word on what the user wants)
7. External research (lowest)

**Pre-send check:** as you compose the dispatch turn, verify that every retrieval went through the `task` tool and that your shell use was the two calls named above. A direct `view`/`grep`/`context7` call in the main agent is still usable, but it violated the gate and inflates context for the rest of the session.

---

