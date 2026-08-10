# Research fan-out — what to dispatch, in what order, and how to weigh what comes back

Read this at the start of the Opening Phase, before the first clarifying question. SKILL.md keeps
the two rules a resumed session still needs (dispatch through `task`; await, never poll) and points
here for the rest. The per-track prompt templates live in `./research-subagent-templates.md`.

## Contents

- Load confirmed lessons (main thread, before dispatching)
- Detect a pre-existing `super.deep-research` artifact
- Corporate Artifacts, and the conflict protocol
- What to dispatch in parallel (the track table + the project constitution rule)
- After all subagents complete — synthesis and the full source-precedence order

---

## Load confirmed lessons (do this first, main thread — not a subagent)

Before dispatching research, load guidance the lessons layer has already earned trust for:

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py list --status confirmed
```

This is a fast local read of already-digested, one-sentence guidance (never raw codebase bytes), so it runs inline — no subagent needed. Only `confirmed` lessons load (never `candidate` or `quarantined` — see `super.independent-verification/references/lessons.md`, "Lifecycle"). Apply matching lessons while proposing approaches and writing the spec, the same way a recalled memory or a corporate artifact informs the design (see Source precedence below). If the store is empty or `.superpowers/` doesn't exist yet, proceed normally — there is nothing to apply yet.

## Detect a pre-existing research artifact (do this first)

Before dispatching research subagents, check whether `super.deep-research` already ran an upfront pass for this topic — look for a persisted artifact at `docs/superpowers/<feature>/research/research-<feature>.md` (the `<feature>` slug may already be set by `super.deep-research` — see [Reconcile the feature slug](#reconcile-the-feature-slug)). That pass is **broad, adversarially verified, and persisted**; brainstorming's own research is **ephemeral, synthesized in context, not persisted** — focused on filling remaining gaps.

- **If it exists:** read it and treat it as a **high-priority distilled input**. Do NOT re-run the wide fan-out. Skip the subagents whose ground it already covers (web research, library/API docs); dispatch only for **gaps it doesn't cover**, plus codebase exploration and memory recall (which target this workspace regardless of prior research).
- **If no artifact exists:** proceed with the full fan-out below.

Dispatch all research as background subagents in a **single turn** before your first clarifying question — keeping it out of the main agent preserves context budget for clarifying questions, trade-offs, spec content, and review.

**Exception:** If the request is underspecified and you can't determine the tech stack or problem domain, ask one scoping question first, then launch research.

<RESEARCH-GATE>
Do NOT call `view`, `glob`, `grep`, `bash`, `context7`, or any web-search tool directly in the main agent during this phase. All high-volume retrieval — codebase exploration, library docs, web research, user-provided URLs, and local documents — must be dispatched via the `task` tool as background subagents. The `task` tool is the only permitted mechanism for research during brainstorming.
</RESEARCH-GATE>

## Corporate Artifacts

Check whether corporate artifacts are available in context — `super.using-superpowers` passes them when present (a message like _"Corporate artifacts are available: [list]"_). They have **no fixed format** — a ready PRD, a wiki HTML export, an API schema, an ADR, loose notes, anything — so **never couple to their structure**. Treat them as source material to RECOVER and CONVERT into our own templates (the design spec here, the PRD in `super.generating-prd`); it is our converted artifact — never the raw corporate file — that we later validate and extract identifiers/keywords from. Their purpose is to let us **reuse** existing specs/PRDs/decisions instead of recreating them, always brought into the superpowers format. If they exist, include each as part of the User-referenced resources subagent dispatch, treated exactly like user-provided paths and URLs:
- Local path → inspect via `view`
- Public URL → fetch
- Inaccessible URL → ask the user for an excerpt

**Precedence — corporate artifacts win on conflict, but never silently.** When a corporate artifact conflicts with another source (a current-session decision, the spec, recalled memory, or research), do **not** resolve it on your own and do **not** just follow the session: corporate artifacts are the company's source of truth, so **stop, tell the user a conflict exists, present the corporate value as the recommended truth, and ask which one to follow.** The user's answer is your instruction now (precedence #1) and stands for the rest of the session. (Full priority ordering in [After all subagents complete](#after-all-subagents-complete).)

## What to dispatch in parallel

All applicable tracks must be launched in the **same tool-calling turn**:

| Subagent | When | Agent type |
|----------|------|-----------|
| **Memory recall** | If `session_memory_enabled = true` — retrieves prior decisions, ADRs, specs, and constraints from `super.persistent-memory`. Skip entirely when memory is disabled. | `task` (see template below) |
| Codebase exploration | Always for existing projects; skip for clearly greenfield work | `explore` |
| Library / API docs | Topic involves external libraries or frameworks | `explore` instructed to use `context7` (when available) |
| Web research | Needs current best practices, comparisons, or technology state | `explore` instructed to use `exa-web-search-free` (when available) |
| User-referenced resources & corporate artifacts | User mentions URLs or docs, OR corporate artifacts are available in context: public URL → fetch; local path → inspect; inaccessible → ask for an excerpt | `explore` |

**Project constitution (binding):** the codebase-exploration subagent must also surface the consuming repo's **`CLAUDE.md` / `AGENTS.md`** (root and any nested ones). Their declared principles and conventions (DDD, Design-by-Contract guards, CQS, SOLID, naming, layering, explicit "always/never" rules) are the **constitution your design must honor** on the *engineering* plane (*how* you build), the peer of corporate artifacts, which bind the *product* plane (*what* you build) — ranked in the precedence list below. If the design must deviate from a stated rule, surface the conflict to the user instead of silently breaking it.

If `context7` or `exa-web-search-free` are unavailable or hit quota, continue with best available knowledge — don't block the session.

## Subagent prompt templates

Dispatch each subagent with the minimum context it needs (no conversation history, no file dumps) and cap responses at ~300 words / 8 bullets (summaries, not raw output). The exact prompt templates for memory recall, codebase exploration, library/API docs, and web research are in **[`./references/research-subagent-templates.md`](./references/research-subagent-templates.md)** — including the memory-recall **Availability Gate (Ask-to-Install)** that must run in the main thread (subagents cannot ask the user) before the memory subagent is dispatched.

**Await the subagents — never poll for them.** They run in the background and the harness re-invokes you as each returns; simply wait. Do **not** `sleep` or schedule a wakeup/timer to "check on" research subagents you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow.

<a id="after-all-subagents-complete"></a>
## After all subagents complete

Synthesize findings internally before proceeding — do not relay raw subagent output to the user; let the research inform your questions and approach proposals.

**Source precedence.** When recalled memories contain decisions, constraints, or scope boundaries that affect the topic, respect them as established context and, when one materially shapes a recommendation, briefly mention its existence (e.g., "Based on a prior decision to use Clean Architecture with Inversify..."). Full priority order (highest first):

1. Latest user instruction (highest) — including the user's answer when you surface a conflict
2. Corporate artifacts (*what* to build) and the project constitution `CLAUDE.md`/`AGENTS.md` (*how* to build) — each the source of truth on its own plane; on conflict with anything below, never silently override — apply the conflict protocol above (surface, recommend the authoritative value, ask the user; their answer is then your instruction at #1 and stands for the rest of the session)
3. Approved spec / current-session decisions
4. Recalled memory (prior decisions, ADRs, constraints)
5. Confirmed lessons (grounded, recurring execution guidance from `lessons.py` — advisory, not a decision or constraint)
6. Persisted research artifact (distilled `super.deep-research` findings — a strong, verified input, but not the final word on what the user wants)
7. External research (lowest)

**Pre-send check:** Before the first clarifying question, verify you used the `task` tool for all research. Any direct `view`/`grep`/`context7` calls in the main agent are still usable, but they violated the gate and inflate context for the rest of the session.

---

