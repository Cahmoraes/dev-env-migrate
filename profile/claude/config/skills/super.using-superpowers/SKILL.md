---
name: super.using-superpowers
description: Use at the start of every conversation to load preferences, complete onboarding when needed, ask the opening triage question when the request is ambiguous, and route into the correct superpowers skill before any other response. Must keep feature, design, migration, and refactor work inside the internal superpowers flow instead of platform-native plan mode.
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If there is even a 1% chance a skill applies to what you are doing, you MUST invoke it. If a skill applies, using it is not optional — you cannot rationalize your way out.
</EXTREMELY-IMPORTANT>

## Workflow Preferences

On every session start, load `.superpowers/preferences.yml` from the repo root.

**Deterministic read (preferred):** run the shared script (your context header shows the base directory):
```bash
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```
It emits JSON `{found, preferences, malformed}`. **Check `found` FIRST.** The script *always* returns a fully populated `preferences` object — built-in DEFAULTS when the file is absent — so a populated `preferences` does **not** mean the file exists; only `found: true` does. Read fields (`workflow.auto_commit`, `workflow.qa_gate`, `communication.language`, `copilot.*`, `claude_code.*`, `context.has_corporate_artifacts`, `optimization.caveman*`, `memory.persistent_memory`, `model_tiers`) from `preferences` **only when `found` is `true`**. Create or update the file with `scripts/write-preferences.cjs` (round-trip validated) — see `references/onboarding-preferences.md`.

**Fallback (script unavailable):** read the file with `view`, never `glob` (glob silently misses hidden dirs like `.superpowers/`). See `references/copilot-tools.md`.

- **`found: true` (file exists):** keep the preferences in context; inject relevant ones into subagent prompts.
- **`found: false` (file missing):** the file does not exist — do **not** proceed with the default values. Run the onboarding wizard in `references/onboarding-preferences.md` now (it writes the file via `write-preferences.cjs`), then re-read. This is the one case the entry point must **never** silently skip — a populated defaults object is not consent. (`derive-session-state.cjs` reports the same condition as `preferencesFound: false` — treat it identically.)
- After preferences are available, continue to the opening triage — do not stop at the onboarding confirmation.

Preferences govern behavior throughout (auto-commit, language, destructive-action confirmation). Execution skills also read the file directly, but this entry point guarantees onboarding happens.

### Corporate Artifacts

If `context.has_corporate_artifacts` is `true` (or the flag is off but `.superpowers/corporate-artifacts.yml` exists), read the file with `view` (never `glob`), keep the paths/URLs in context, and pass them in the handoff to `super.brainstorming` / `super.generating-prd` / `super.writing-plans`. Full rules (missing-file warning, flag/file mismatch — warn once and ask before proceeding) — `references/onboarding-preferences.md`, "Corporate Artifacts" section.

## Session Summary

**After the Memory Re-Sync Gate has been processed (or skipped) and right before the opening triage, print — exactly once — a brief bulleted summary of the session variables** (the "Session State" section). Print it nowhere else: this section is the **sole owner** of the print, and it must reflect post-re-sync state, so it belongs after the gate. List the cross-platform vars plus the **current** platform's native-skill vars; omit the other platform's (inert — always `false`). Also **omit the internal latches `session_caveman_prompted` and `session_caveman_in_effect`** — they are controller bookkeeping (whether the dynamic question was asked; whether caveman is loaded now), not configured behavior, so showing them only adds noise (they stay tracked in context; this hides them from the display only). Reuse the platform from the "Platform Adaptation" section; add no detection logic. Read-only — never blocks the triage. **One variable per line** (use a bulleted list); keep a variable and its coupled qualifier inline on the same line (caveman + its level, code-review + its effort). Example (Claude Code):

> **Session variables (mantidos em contexto):**
> - `session_auto_commit`: true
> - `session_qa_gate_enabled`: true
> - `session_caveman_active`: true (`caveman_level`: ultra)
> - `session_memory_enabled`: true
> - `session_resync_completed`: true
> - `session_simplify_enabled`: true
> - `session_code_review_final_enabled`: true (`effort`: medium)
> - `session_model_tier_*`: harness escolhe (ou liste os modelos quando definidos)

## Opening Triage

Once preferences are loaded and the Memory Re-Sync Gate has run (the "Session State & Gates" section — it is processed before this), decide whether to ask the opening question or route immediately. If the user's request already maps to a single superpowers flow, skip the question and route directly — don't spend a turn asking "how can I help?" when the flow is obvious. If they greeted you, asked for generic help, or the request is ambiguous, ask the opening question in the preferred language. Render the numbered list exactly like this (the user may reply with a number **or** describe their need in their own words):

  > How can I help? Pick a number or just tell me what you need:
  >
  > 0. ⚙️ Preferences — update your preferences
  > 1. 🔍 Research — technical research/investigation
  > 2. 🧠 Brainstorming — new feature, refactor, migration, architecture change
  > 3. 🐛 Debugging — bug, regression, failing test
  > 4. 📋 Planning — approved spec/PRD → execution plan
  > 5. ⚡ Execution — existing tasks → implementation
  > 6. 🔎 Spec review — validate an existing spec/design (open points, inconsistencies, spec↔code/tasks)
  > 7. ✅ Review/QA — review implemented work or verification

**Present the opening triage as the numbered prose list above — not via the structured-question tool:** token economy — an eight-option tool call costs roughly 2× the plain prose list (and the triage runs every session), and Claude Code's `AskUserQuestion` caps at 4 options — eight would fail with `too_big`. Ask it on its **own turn** — never bundle it with the memory re-sync question or an onboarding step. Smaller fixed-answer questions (onboarding steps, clarifications with ≤4 options) *do* use the structured-question tool — they are cheap and the selectable UX is worth it — see `references/onboarding-preferences.md`, "Presenting the questions" section.

Map a bare numeric reply (`0`–`7`) via the **Option** column; free-form requests that skip the question via **Request shape**.

| Option | Request shape | Required action |
|---|---|---|
| — | Greeting, generic help request, or ambiguous task | Ask the opening question above and wait for the user's answer. |
| **0** | Change/update saved preferences or redo onboarding ("mudar preferências", "atualizar configuração", "refazer onboarding") | Re-run the preferences wizard — follow `### Update Preferences (option 0)` below. |
| **1** | Research / deep investigation / technology comparison ("pesquise sobre X", "compare X e Y") | Invoke `super.deep-research`. |
| **2** | New feature, behavior/architecture change, migration, or refactor | Invoke `super.brainstorming` immediately. |
| **3** | Bug, regression, failing test, or unexpected behavior | Invoke `super.systematic-debugging` immediately. |
| **4** | Approved design spec/PRD and the user wants the implementation plan | Invoke `super.writing-plans` immediately. |
| **5** | Existing tasks index, task file, or "execute task X" request | **Never invoke an execution skill directly** — follow `### Execution Mode Election (option 5)` below. Sole exception: the user already named a mode ("execute com worktrees", "parallel in-tree") → invoke that skill directly. |
| **6** | Review/validate an **existing spec/design** doc — "review this spec", "pontos abertos/inconsistências no design", a spec path like `/super.reviewing-specs path/to/spec.md` | Invoke `super.reviewing-specs`. It runs the review lenses in parallel at the `capable` tier, reports findings by severity (honest when the spec is already sound), and only after consent applies surgical fixes and optionally re-plans tasks via `super.writing-plans`. |
| **7** | Review of **implemented** work, QA, or user-story verification | Invoke `super.user-story-verification` (or the code-review skill). This is for work that already exists in code — not for validating a spec/design doc (that is option 6). |

**Scope auto-sizing (option 2).** Before invoking `super.brainstorming`, size the request and provision the pipeline to match - depth is set by complexity, not run at full ceremony every time (full-ceremony provisioning is the dominant context cost on small changes). Assess against these tiers and take the lightest that fits; the moment a heavier tier's criterion appears (a new abstraction, a cross-cutting change, ambiguous or novel-domain requirements), move up a tier; when in doubt, go one tier heavier.

**This triage read is checkpoint 0 — advisory, not binding.** Derive the signals semantically from the request's *intent* (not surface keywords — "criar uma API" is a new component; "consumir uma API" is an integration), then score them:

```bash
<super.using-superpowers-base-dir>/scripts/assess-complexity.cjs --checkpoint 0 --signals '{
  "fileScope":"single-existing|few-existing|new-component|multi-component|cross-cutting",
  "abstraction":"none|small|yes|ambiguous",
  "prd":"none|optional|required",
  "decision":"none|may-exist|open-fork",
  "steps":<number>,
  "text":"<raw request>"
}'
```

Use the exact enum strings above (a mis-keyed or loose value now throws — the script no longer silently defaults a mis-keyed call to Medium). Checkpoint 0 is light and inline — no subagent; the rigorous semantic derivation via the `complexity-interpreter` subagent runs at the binding checkpoints 1/2 inside `super.brainstorming`. Its output only decides how `super.brainstorming` *starts* (flat one-question pass vs full fan-out) — never pass its tier forward as `--prior-tier`; the real commitment happens inside `super.brainstorming` itself at checkpoint 1, once genuine interview signal exists. Full checkpoint model, the semantic-derivation rubric, the confidence gate, and the reason unknown signals default to Medium (not Micro): `references/complexity-checkpoints.md`. This also covers requests that skip this numbered triage entirely and enter `super.brainstorming` directly ("opção 2" free-form) — checkpoint 1 runs there regardless of whether checkpoint 0 ran here.

**Micro requires a confirming question, not a silent skip.** If checkpoint 0 (or `super.brainstorming`'s checkpoint 1) returns `requiresConfirmation: true` (always true for a `micro` result computed at checkpoint 0), offer the lightweight-path-style confirming question before skipping `super.brainstorming`/`super.writing-plans` — see `references/complexity-checkpoints.md`, "Why Micro gets a confirming question."

**Complex offers deep-research, under consent.** If checkpoint 0 (or `super.brainstorming`'s checkpoint 1) returns a `complex` tier, its `consentGates` field carries `["deep-research"]`. Offer `super.deep-research` before entering `super.brainstorming` — a single yes/no, defaulting to skip because it costs tokens — and route into it only on consent. The matching `["reviewing-specs"]` offer fires later, at checkpoint 2 inside brainstorming. Full pattern and both confirming questions: `references/complex-path.md`.

| Tier | Criteria | Spec/PRD | Design | Tasks | Execution + Gates |
|---|---|---|---|---|---|
| **Micro** | 1 existing file, trivial/reversible tweak, no new abstraction, no user story | **skip** `super.brainstorming` and `super.writing-plans` | inline mental model | none — atomic step list inline | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Small** | ~1-3 existing files, no new component, reversible, no PRD-worthy behavior | `super.brainstorming` (single targeted exploration), **skip PRD** | inline | `super.writing-plans` in reduced modes | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Medium** | clear feature, few components, known domain, no real ambiguity | `super.brainstorming` (single targeted exploration, no research fan-out), **PRD optional** (skip if unambiguous) | few-section design, inline | `super.writing-plans` (single exploration; tasks listed inline, no separate task-writer subagent) | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Large** | multi-component feature, real architecture decisions | brainstorming + PRD (*fast path*: auto-dispatch PRD, skipping only the confirmation question, when the domain is known and no decision is open) | enriched design doc | `super.writing-plans` with wave planning | **full gates** |
| **Complex** | novel domain, ambiguity, or cross-cutting risk | brainstorming + PRD, with `super.deep-research` (before) and `super.reviewing-specs` (after design) offered as **consent-gated** stages — `references/complex-path.md` | enriched design doc | `super.writing-plans` with waves | **full gates** |

The **Execution + Gates** column now varies the *delivery mechanism* by tier (see the rigor invariant below). Full criteria and confirming questions: `references/lightweight-path.md` (Small), `references/medium-inline-path.md` (Micro/Small/Medium inline execution + combined gate), `references/large-known-domain-fast-path.md` (Large fast path), `references/complex-path.md` (Complex consent-gated research + spec-review front end), `references/token-budget.md` (context discipline for all subagents), `references/complexity-checkpoints.md` (how the tier itself is assessed and re-assessed across triage and brainstorming — read this one first). The Micro path has no separate reference — it is Medium Inline with zero planning artifacts.

**Verification rigor does not scale down with the tier — only the mechanism that delivers it does.** The same four lenses run at every tier: (1) author ≠ verifier on the final gate, (2) the discrimination sensor / mutation-testing check, (3) spec-anchored FR/AC coverage re-derived evidence-or-zero, (4) test density (one test per behavior, preserved as a coverage requirement). **Small/Medium** deliver all four inline: the controller writes code directly in the main thread with a per-cluster self-review checklist, then a single fresh, blind Verifier subagent fuses the final code review and `super.independent-verification` into one combined gate — see `references/medium-inline-path.md`. QA (user-observable acceptance) is **not** in this gate; it stays a separate **opt-in** gate at every tier — offered, and run only on user consent. **Large/Complex** deliver the same four lenses through today's fan-out mechanism, unchanged: a subagent per task, plus the final code review and the `super.independent-verification` gate as separate dispatches after all tasks. Auto-sizing now adjusts planning depth **and** execution mechanism — never the lenses themselves.

### Classification checklist

Score before invoking `super.brainstorming` — this is checkpoint 0 (see `references/complexity-checkpoints.md`), advisory only. First tier whose **all** criteria match wins; if uncertain, move up. **When in doubt, go heavier.**

This is a **semantic derivation rubric**, not a keyword lookup: read the request's intent and map it to the JSON signal *values* below (the column headers are the exact `--signals` keys). The same noun resolves differently by intent — *creating/exposing* an API is `fileScope: new-component|multi-component, abstraction: yes`; *consuming/integrating* an existing API is `fileScope: few-existing, abstraction: none|small`.

| Tier | `fileScope` | `abstraction` | `prd` | `decision` | `steps` |
|---|---|---|---|---|---|
| **Micro** | single-existing | none | none | none | 1 |
| **Small** | few-existing | none | none (not PRD-worthy) | none | 1-3 |
| **Medium** | new-component / few-existing | small | optional | none | 3-8 |
| **Large** | multi-component | yes | required | may-exist | 8+ |
| **Complex** | cross-cutting | ambiguous | required | open-fork | 8+ ambiguous |

**Micro:** skip `super.brainstorming` and `super.writing-plans`; execute inline with combined gate. Use only for truly trivial changes (constant, one-line guard, local rename).

**Complex:** routes like Large through execution (full gates, unchanged), but `assess-complexity.cjs` emits a `consentGates` field so the controller proactively **offers** two token-costly stages, one at a time, each skipped unless the user consents: `super.deep-research` before brainstorming (checkpoint 0/1) and `super.reviewing-specs` after the design (checkpoint 2). See `references/complex-path.md`.

### Update Preferences (option 0)

Lets the user revise `.superpowers/preferences.yml` mid-session without hand-editing YAML (the multi-question counterpart to a single named key like "set auto_commit false"). **Do not hardcode a platform tool;** the wizard abstracts the structured-question tool per platform. Load current values with `read-preferences.cjs` (each as the pre-selected default), re-walk the wizard, save with `write-preferences.cjs`, re-derive the "Session State" section, return to triage. Full steps — `references/onboarding-preferences.md`, "Update Preferences (option 0)" section.

### Execution Mode Election (option 5)

When triage routes to execution, **the user — not you — chooses the execution mode** (never default to `super.subagent-driven-development` because it "is the default" — that is the exact bug this section prevents). Exception: the user already named a mode → invoke that skill directly with the tasks index path. Otherwise: locate pending work (`superpowers-status.cjs --pending`), derive the recommendation from wave shape (`parse-waves.cjs`), present the three options (Subagent-Driven / Parallel in-tree / Parallel worktrees) with `(recommended)` elected by the rubric — **never hardcoded on option 1** — and wait for the choice. Full steps (script invocations, sibling-skill path resolution, handoff message) — `references/session-state-and-gates.md`, "Execution Mode Election (option 5)" section.

### Native plan mode is forbidden while superpowers is routing

Do not use the platform's native plan mode (EnterPlanMode, `/plan`, `[[PLAN]]`, or equivalent) for feature, design, migration, or refactor requests while superpowers is active. Stay in the main session and use the internal pipeline: `super.brainstorming` → `super.generating-prd` → `super.writing-plans` (to skip the PRD, go from `super.brainstorming` directly to `super.writing-plans`).

## Instruction Priority

Superpowers skills override default system-prompt behavior, but **user instructions always take precedence**: (1) the user's explicit instructions (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) > (2) superpowers skills > (3) the default system prompt. If a user file says "don't use TDD" and a skill says "always use TDD," follow the user. The user is in control.

## How to Access Skills

Invoke skills via the platform's skill tool (`Skill` in Claude Code, `skill` in Copilot CLI, `activate_skill` in Gemini CLI). When you invoke a skill, its content is loaded for you — follow it directly; never use the Read tool on a skill file. Other environments: check the platform's documentation.

## Platform Adaptation

Skills use Claude Code tool names. For other platforms see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), and `references/gemini-tools.md` (Gemini loads its mapping via GEMINI.md). The unified notion of "research" resolves per platform — Claude Code uses the native `deep-research` skill (a `Task` fan-out of `WebSearch` + `WebFetch` as fallback); other platforms use a subagent fan-out (see the `Research` entry in those references and the `super.deep-research` skill).

**Resolve the platform once per session, from the harness you are actually running in — never from where the skill files are installed.** Skill files are commonly deployed to a shared symlink target read by several different harnesses; the directory a skill happens to load from tells you nothing about which harness is running it. Match your runtime identity to exactly one of: `claude-code`, `copilot`, `codex`, `gemini`. **If none match — including any harness not listed here — resolve the platform as `other`.** Reuse this one resolved value for the whole session: it is the `--platform` argument in "Session State" below, and it is the gate for every platform-specific onboarding step (`references/onboarding-preferences.md`) — on `other`, all of them are skipped silently, the same as an unmatched named platform.

## Session State & Gates

### Session State

After reading preferences, derive the session variables deterministically — do **not** hand-map `preferences.X.Y` to `session_*`:
```bash
node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
  --platform <resolved-platform> --repo-root "$(git rev-parse --show-toplevel)"
```
`derive-session-state.cjs` is the **single source of truth** for the `preferences.X.Y → session_*` mapping and for platform gating: the Claude Code variables resolve `false` off Claude Code, and `session_copilot_review_final_enabled` resolves `false` off Copilot CLI, so no skill carries per-platform rules. Pass `--platform` the value resolved in "Platform Adaptation" above (`claude-code`/`copilot`/`codex`/`gemini`, or `other` on any unrecognized harness) — never omit the flag, and never hardcode `claude-code` as a shortcut; the script's own `claude-code` default exists only to cover an accidentally-omitted flag, not as a signal that resolving the platform is optional. Track the resulting session-only variables in context (never written back to `preferences.yml`): the caveman vars (`session_caveman_active`, `session_caveman_level`, `session_caveman_in_effect`, `session_caveman_prompted`), `session_memory_enabled`, `session_resync_completed`, the native-review vars (`session_simplify_enabled`, `session_code_review_final_enabled`, `session_code_review_effort`, `session_copilot_review_final_enabled`), and `session_model_tier_{cheap,standard,capable}`. Prefs-derived vars come from the script's `sessionState`; the latches start `false`. Full table (sources, meanings, latch semantics) — `references/session-state-and-gates.md`, "Session State variables" section.

### Caveman Mode

Caveman Mode cuts agent token use ~75% during execution phases by switching to ultra-compressed communication. Opt-in; never activated automatically. ON from the `Planejando → Executando` gate, through all of `Executando`, into `GateQA → Verificando`; OFF everywhere else. The execution skills own invocation (`/caveman <level>`); the `Planejando → Executando` gate's two exit actions (memory persistence if `session_memory_enabled = true`, then caveman activation if `session_caveman_active = true`) and the dynamic opt-in question live in the reference.

> **Activation is idempotent — invoke `/caveman` at most once per active window.** Before invoking, check `session_caveman_in_effect`: if it is already `true` at `session_caveman_level`, caveman is already loaded — **skip the invocation; do not re-invoke** `/caveman`. Set it `true` after a successful invocation, `false` on deactivation or after a compaction. This one-shot latch (never written to `preferences.yml`) prevents the gate policy and an execution skill's Step 2 from double-firing.

Full detail (activation window, the two gate exit actions, memory-persistence coupling, the dynamic question wording) — `references/session-state-and-gates.md`, "Caveman Mode" section.

### Native Review Skills

Platform-native review passes are folded in **only when the user opts in during onboarding** (the other platform's section is ignored), all off by default and **additive: the spec-compliance and code-quality review gates always run regardless** — the default final reviewer always runs, so turning these off just leaves the pre-existing flow untouched. The session vars are `session_simplify_enabled` and `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) on Claude Code, and `session_copilot_review_final_enabled` on Copilot CLI; when a flag is `false` or the platform doesn't match, skip that pass. There is no per-task `/code-review` or `review` (it would overlap the gates). Full matrix (checkpoints, behaviors, Rubber Duck Agent) — `references/session-state-and-gates.md`, "Native Review Skills" section.

### Memory Re-Sync Gate

Keeps a shared repo's local `.memory/` current with committed `docs/superpowers/` artifacts. Runs **after preferences are loaded** (or after onboarding) and **before Triagem**, only when `session_memory_enabled = true` and `session_resync_completed = false`.

1. **Dirty detection (silent):** run `<super.using-superpowers-base-dir>/scripts/check-resync.cjs` — it ships in **this skill's** `scripts/` directory (resolve by base-dir path, like `read-preferences.cjs`; it is **not** in `super.persistent-memory`). Trust its `dirty` field — do **not** reconstruct a hash with `git rev-parse`/`git log`. `dirty` also flips on **presence drift** — a manifest slug with no note in `memory.db`, listed in `driftedSlugs` — so a phantom sync self-heals; still trust the field. If `dirty` is false, **skip steps 2–3 and continue to step 4** (step 4 runs regardless of `dirty`).
2. **If dirty, ask the user** in the configured language (exact wording in `references/memory-resync.md`).
3. **On accept:** run the sync algorithm and report a summary; it ends by verifying the manifest↔DB agree (Step 5 / `verify-sync.cjs`, **required**). **On decline:** skip.
4. **Embedding-model drift (silent, independent of `dirty`):** run `pmem embedding-status` — orthogonal to artifact content, so `dirty` stays false while stored vectors go stale. If `stale_count > 0`, ask whether to re-embed; **on accept** run `pmem reembed` until `reembed_needed` is `false`, **on decline** skip (semantic recall stays degraded until re-embedded).
5. **Set `session_resync_completed = true`** regardless of outcome, then proceed to Triagem.

> **The script is the source of truth; the flag is only a within-session cache.** `check-resync.cjs` is cheap and idempotent — after a compaction, when in doubt, re-run it rather than trusting the flag.

Full algorithm (content-fingerprint dirty detection — NOT a git tree/commit hash — per-feature hashing, prune-before-add with `source="artifact-sync"`, deduplication, graceful degradation, drift re-embedding) and memory-flow integration (`pmem search` recall, `pmem add` namespaces) — `references/memory-resync.md`.

### Session Snapshot (STATE.md)

A per-feature, **plain-markdown** pause/resume snapshot at `docs/superpowers/<feature>/STATE.md`. It is ordinary markdown and **independent of persistent memory** — it works even when `pmem` is unavailable or degraded. Two section-scoped parts with distinct lifecycles: `## Handoff` (~500 tokens, **overwritten** each pause — never grows) and an optional `## Decisions` (append-only `AD-NNN` log). Roles differ, they are **not substitutes**: STATE.md = intra-feature *position* recovery (cheap, deterministic, "where was I"); `pmem` = *semantic recall across features* (heavy, embeddings, "what did we learn elsewhere").

- **Write** at the `Planejando → Executando` gate (initial snapshot) and at every pause / end of wave — replace the `## Handoff` body only, never touching `## Decisions`.
- **Read** on resume, before any code — the Handoff snapshot replaces re-reading task history or loading `pmem` just to relocate position.

Full contract (exact path, field list, `AD-NNN` rules, section-scoped write invariant, write/read table) — `references/session-state-and-gates.md`, "Session Snapshot (STATE.md)" section.

# Using Skills

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.** Even a 1% chance a skill might apply means you invoke it to check; if it turns out wrong for the situation, you don't have to use it.

Flow: user message → read preferences → run onboarding if needed → ask the opening question if the request is a greeting or ambiguous, else route directly → invoke the Skill tool → announce "Using [skill] to [purpose]" → if it has a checklist, create a TodoWrite item per step → follow the skill exactly → respond (including clarifications).

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context / let me explore first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "This doesn't need a formal skill" / "is overkill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read the current version. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |

## Skill Priority

When several skills apply: **process skills first** (brainstorming, debugging — they determine HOW to approach the task), **implementation skills second** (they guide execution). "Let's build X" → brainstorming, then implementation skills. "Fix this bug" → debugging, then domain-specific skills.

## Skill Types

**Rigid** (TDD, debugging): follow exactly; don't adapt away the discipline. **Flexible** (patterns): adapt the principles to context. The skill itself tells you which.

## User Instructions

Instructions say WHAT, not HOW. "Add X" or "Fix Y" doesn't mean skip the workflows.

## Superpowers Finite State Machine

To understand the flows and states your execution plan moves through, see the state diagram: `assets/state-diagram.mmd`.
