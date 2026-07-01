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
It emits JSON `{found, preferences, malformed}`. **Check `found` FIRST.** The script *always* returns a fully populated `preferences` object — built-in DEFAULTS when the file is absent — so a populated `preferences` does **not** mean the file exists; only `found: true` does. Read fields (`workflow.auto_commit`, `communication.language`, `copilot.*`, `claude_code.*`, `context.has_corporate_artifacts`, `optimization.caveman*`, `memory.persistent_memory`, `model_tiers`) from `preferences` **only when `found` is `true`**. Create or update the file with `scripts/write-preferences.cjs` (round-trip validated) — see `references/onboarding-preferences.md`.

**Fallback (script unavailable):** read the file with `view`, never `glob` (glob silently misses hidden dirs like `.superpowers/`). See `references/copilot-tools.md`.

- **`found: true` (file exists):** keep the preferences in context; inject relevant ones into subagent prompts.
- **`found: false` (file missing):** the file does not exist — do **not** proceed with the default values. Run the onboarding wizard in `references/onboarding-preferences.md` now (it writes the file via `write-preferences.cjs`), then re-read. This is the one case the entry point must **never** silently skip — a populated defaults object is not consent. (`derive-session-state.cjs` reports the same condition as `preferencesFound: false` — treat it identically.)
- After preferences are available, continue to the opening triage — do not stop at the onboarding confirmation.

Preferences govern behavior throughout (auto-commit, language, destructive-action confirmation). Execution skills also read the file directly, but this entry point guarantees onboarding happens — so it must gate on `found`, never on the mere presence of a populated `preferences` object.

### Corporate Artifacts

If `context.has_corporate_artifacts` is `true`, read `.superpowers/corporate-artifacts.yml` with `view` (not `glob`) and keep the paths/URLs in context. When routing to `super.brainstorming`, `super.generating-prd`, or `super.writing-plans`, pass them in the handoff: _"Corporate artifacts are available: [list of paths/URLs]."_ If the file is missing despite the flag, warn the user once and continue without artifacts. Conversely, if the flag is `false` but `.superpowers/corporate-artifacts.yml` exists and lists artifacts, do not silently skip the company's source of truth: warn the user once that the file is present while the flag is off (so the artifacts are being ignored) and ask whether to enable `has_corporate_artifacts`, then proceed per their answer.

## Session Summary

**After the Memory Re-Sync Gate has been processed (or skipped) and right before the opening triage, print — exactly once — a brief bulleted summary of the session variables** (§ Session State). Print it nowhere else: this section is the **sole owner** of the print, and it must reflect post-re-sync state, so it belongs after the gate. List the cross-platform vars plus the **current** platform's native-skill vars; omit the other platform's (inert — always `false`). Also **omit the internal latches `session_caveman_prompted` and `session_caveman_in_effect`** — they are controller bookkeeping (whether the dynamic question was asked; whether caveman is loaded now), not configured behavior, so showing them only adds noise (they stay tracked in context; this hides them from the display only). Reuse the platform from § Platform Adaptation; add no detection logic. Read-only — never blocks the triage. Example (Copilot CLI):

> **Session variables (mantidos em contexto):**
> - `session_caveman_active`: true (`caveman_level`: ultra)
> - `session_memory_enabled`: true
> - `session_resync_completed`: true
> - `session_model_tier_*`: harness picks (cheap/standard/capable unset) — or list the concrete models when set
> - `session_copilot_review_final_enabled`: true

## Opening Triage

Once preferences are loaded and the Memory Re-Sync Gate has run (§ Session State & Gates — it is processed before this), decide whether to ask the opening question or route immediately. If the user's request already maps to a single superpowers flow, skip the question and route directly — don't spend a turn asking "how can I help?" when the flow is obvious. If they greeted you, asked for generic help, or the request is ambiguous, ask the opening question in the preferred language. Render the numbered list exactly like this (the user may reply with a number **or** describe their need in their own words):

  > How can I help? Pick a number or just tell me what you need:
  >
  > 0. ⚙️ Preferences — update your preferences
  > 1. 🔍 Research — technical research/investigation
  > 2. 🧠 Brainstorming — new feature, refactor, migration, architecture change
  > 3. 🐛 Debugging — bug, regression, failing test
  > 4. 📋 Planning — approved spec/PRD → execution plan
  > 5. ⚡ Execution — existing tasks → implementation
  > 6. ✅ Review/QA — review or verification

**Present the opening triage as the numbered prose list above — not via the structured-question tool.** Two reasons: (1) **token economy** — a seven-option tool call (seven `label`+`description` objects plus the chosen answer echoed back) costs roughly 2× the plain prose list, and the triage runs every session; (2) **the cap** — Claude Code's `AskUserQuestion` allows at most 4 options, so seven would fail with `too_big`. Ask it on its **own turn** — never bundle it with the memory re-sync question or an onboarding step. Smaller fixed-answer questions (onboarding steps, clarifications with ≤4 options) *do* use the structured-question tool — they are cheap and the selectable UX is worth it — see `references/onboarding-preferences.md § Presenting the questions`.

Map a bare numeric reply (`0`–`6`) via the **Option** column; free-form requests that skip the question via **Request shape**.

| Option | Request shape | Required action |
|---|---|---|
| — | Greeting, generic help request, or ambiguous task | Ask the opening question above and wait for the user's answer. |
| **0** | Change/update saved preferences or redo onboarding ("mudar preferências", "atualizar configuração", "refazer onboarding") | Re-run the preferences wizard — follow `### Update Preferences (option 0)` below. |
| **1** | Research / deep investigation / technology comparison ("pesquise sobre X", "compare X e Y") | Invoke `super.deep-research`. |
| **2** | New feature, behavior/architecture change, migration, or refactor | Invoke `super.brainstorming` immediately. |
| **3** | Bug, regression, failing test, or unexpected behavior | Invoke `super.systematic-debugging` immediately. |
| **4** | Approved design spec/PRD and the user wants the implementation plan | Invoke `super.writing-plans` immediately. |
| **5** | Existing tasks index, task file, or "execute task X" request | **Never invoke an execution skill directly** — follow `### Execution Mode Election (option 5)` below. Sole exception: the user already named a mode ("execute com worktrees", "parallel in-tree") → invoke that skill directly. |
| **6** | Review, QA, or verification request | Invoke the matching review or verification skill. |

### Update Preferences (option 0)

Lets the user revise `.superpowers/preferences.yml` mid-session — as if redoing onboarding — without hand-editing YAML. It is the multi-question counterpart to a single explicitly-named key ("set auto_commit false", handled by `references/onboarding-preferences.md § Runtime Mutability`). **Do not hardcode a platform tool;** the wizard abstracts the structured-question tool per platform.

Procedure: load current values with `read-preferences.cjs` (use each as the pre-selected default), re-walk the wizard questions (`references/onboarding-preferences.md § Wizard Flow`, one per turn, skipping steps that don't apply to the current platform), save with `write-preferences.cjs`, re-derive § Session State from the new values, then return to triage. Full steps: `references/onboarding-preferences.md § Update Preferences (option 0)`.

### Execution Mode Election (option 5)

When triage routes to execution, **the user — not you — chooses the execution mode.** Jumping straight into `super.subagent-driven-development` (or any other execution skill) because it "is the default" is the exact bug this section prevents. (Exception: the user already named a mode → invoke that skill directly with the tasks index path.) This mirrors the Execution Handoff `super.writing-plans` offers right after creating the tasks index — same three options, same dynamically elected `(recommended)` tag.

Steps:
1. **Locate pending work:** `node <super.using-superpowers-base-dir>/scripts/superpowers-status.cjs --pending` returns the resumable features (`phase` `planned`/`executing`) with task progress (`tasks.done`/`tasks.total`) and a deterministic `nextAction`. More than one → list them and ask which; empty → tell the user and offer planning (option 4). (Drop `--pending` for the full pipeline view.)
2. **Derive the recommendation:** `node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md` → read `executionRecommendation` and the wave summary (`waveCount`, `waveKinds`, `maxParallelWave`). (`parse-waves.cjs` lives in the sibling skill: swap the final `super.using-superpowers` segment of this skill's base dir for `super.parallel-subagent-development` — superpowers skills are siblings in one `skills/` directory.)
3. **Present the three options:** render via `<super.writing-plans-base-dir>/references/execution-handoff-message.md` (Steps 1–3) — Subagent-Driven, Parallel in-tree, Parallel worktrees, with `(recommended)` elected by the rubric. Never hardcode the recommendation on option 1. Open with the triage variant: _"Found existing tasks index `tasks-<feature-name>.md` with N tasks (M pending)."_
4. **Wait for the user's choice,** then invoke the chosen skill (`super.subagent-driven-development` / `super.parallel-subagent-in-tree` / `super.parallel-subagent-development`) with the tasks index path.

### Native plan mode is forbidden while superpowers is routing

Do not use the platform's native plan mode (EnterPlanMode, `/plan`, `[[PLAN]]`, or equivalent) for feature, design, migration, or refactor requests while superpowers is active. Stay in the main session and use the internal pipeline: `super.brainstorming` → `super.generating-prd` → `super.writing-plans` (to skip the PRD, go from `super.brainstorming` directly to `super.writing-plans`).

## Instruction Priority

Superpowers skills override default system-prompt behavior, but **user instructions always take precedence**: (1) the user's explicit instructions (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) > (2) superpowers skills > (3) the default system prompt. If a user file says "don't use TDD" and a skill says "always use TDD," follow the user. The user is in control.

## How to Access Skills

Invoke skills via the platform's skill tool (`Skill` in Claude Code, `skill` in Copilot CLI, `activate_skill` in Gemini CLI). When you invoke a skill, its content is loaded for you — follow it directly; never use the Read tool on a skill file. Other environments: check the platform's documentation.

## Platform Adaptation

Skills use Claude Code tool names. For other platforms see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), and `references/gemini-tools.md` (Gemini loads its mapping via GEMINI.md). The unified notion of "research" resolves per platform — Claude Code uses the native `deep-research` skill (a `Task` fan-out of `WebSearch` + `WebFetch` as fallback); other platforms use a subagent fan-out (see the `Research` entry in those references and the `super.deep-research` skill).

## Session State & Gates

### Session State

After reading preferences, derive the session variables deterministically — do **not** hand-map `preferences.X.Y` to `session_*`:
```bash
node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
  --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"
```
`derive-session-state.cjs` is the **single source of truth** for the `preferences.X.Y → session_*` mapping and for platform gating: the Claude Code variables resolve `false` off Claude Code, and `session_copilot_review_final_enabled` resolves `false` off Copilot CLI, so no skill carries per-platform rules. Pass `--platform` matching where you run (`claude-code`; `copilot`/`codex`/`gemini` elsewhere). Track these session-only variables in context (never written back to `preferences.yml`); the prefs-derived ones come from the script's `sessionState`, the latches start `false`:

| Variable | Source | Meaning |
|---|---|---|
| `session_caveman_active` | sessionState | **Intent** — caveman should be on this session (from preferences or the dynamic question). Not "already invoked". |
| `session_caveman_level` | sessionState | Intensity level (default `full`). |
| `session_caveman_in_effect` | latch | **Liveness** — whether `/caveman` is currently loaded. Set `true` right after invoking, `false` on deactivation or after a compaction (which wipes live skill state). Idempotency guard — see § Caveman Mode. |
| `session_caveman_prompted` | latch | Whether the dynamic question was already asked this session. |
| `session_memory_enabled` | sessionState | Whether persistent memory recall/persist is active. |
| `session_resync_completed` | latch | Whether the re-sync gate was already processed this session. |
| `session_simplify_enabled` | sessionState | Claude Code only — whether `/simplify` runs at the per-task checkpoint. |
| `session_code_review_final_enabled` | sessionState | Claude Code only — whether `/code-review` runs once at the **final** review as an extra bug pass (the default final reviewer always runs). |
| `session_code_review_effort` | sessionState | Effort for the final `/code-review` (`low`/`medium`/`high`/`max`; `ultra` clamped to `medium`). |
| `session_copilot_review_final_enabled` | sessionState | Copilot CLI only — whether the native `review` runs once at the **final** review as an extra pass (the default final reviewer always runs). |
| `session_model_tier_cheap`, `session_model_tier_standard`, `session_model_tier_capable` | sessionState | Platform-agnostic model ids for the cheap/standard/capable execution tiers (from `preferences.model_tiers`; `null` → let the platform auto-select). |

### Caveman Mode

Caveman Mode cuts agent token use ~75% during execution phases by switching to ultra-compressed communication. Opt-in; never activated automatically.

**Activation window:** ON from the `Planejando → Executando` gate, through all of `Executando`, and into `GateQA → Verificando`; OFF everywhere else (Explorando, Formalizando, Planejando, Finalizando, and the root `Depurando` state, which is investigative and needs clear prose). The `Planejando → Executando` gate has two mandatory exit actions:
1. **Memory persistence** — if `session_memory_enabled = true`, `super.writing-plans` calls `pmem add` (3 entries) before handing off (see its § Memory Persistence). If memory is disabled, skip entirely.
2. **Caveman activation** — if `session_caveman_active = true`, invoke `/caveman <level>`.

Execution skills must **verify memory was persisted** before starting tasks (only if `session_memory_enabled = true`; otherwise skip and proceed).

**Invocation:** invoke the `caveman` skill passing the level (e.g. `/caveman full`); deactivate with "normal mode" / "stop caveman". The execution skills own the actual invocation — this section is the policy they follow.

> **Activation is idempotent — invoke `/caveman` at most once per active window.** Before invoking, check `session_caveman_in_effect`: if it is already `true` at `session_caveman_level`, caveman is already loaded — **skip the invocation; do not re-invoke** `/caveman` (re-invoking only re-loads the skill and wastes tokens; behavior is unchanged). After a successful invocation set `session_caveman_in_effect = true`; on deactivation set it back to `false`. This single guard prevents the two known double-fires: (a) the gate policy and an execution skill's Step 2 both activating, and (b) a post-compaction re-activation followed by that skill's own Step 2 check. Like `session_caveman_prompted`, it is a one-shot latch, not a preference — never written to `preferences.yml`.

**Dynamic question:** if `session_caveman_active = false` AND `session_caveman_prompted = false`, the execution skill **may** ask once before the `Executando` phase:
> "Antes de iniciar a implementação, deseja ativar o **Caveman Mode**? Este modo reduz o consumo de tokens em ~75% durante a execução (implementação, revisão de código e verificações técnicas), usando comunicação ultra-compacta enquanto mantém precisão técnica."
> - **Sim** — ativa para esta sessão (não altera preferências salvas)
> - **Não** — continua com comunicação normal

Yes → set `session_caveman_active = true`, `session_caveman_level = full` (or `preferences.optimization.caveman_level` if set), `session_caveman_prompted = true`. No → set `session_caveman_prompted = true`; do not ask again. The dynamic question is session-only and never alters `.superpowers/preferences.yml`.

### Native Review Skills

Each platform ships native review skills the flow folds in **only when the user opts in during onboarding** (the other platform's section is ignored). All are off by default and **additive: the spec-compliance and code-quality review gates always run regardless** — turning these off just leaves the pre-existing review flow untouched. The execution skills own the invocation; when a flag is `false` or the platform doesn't match, skip that pass.

| Skill (platform) | Session variable | Checkpoint | Behavior |
|---|---|---|---|
| `/simplify` (Claude Code) | `session_simplify_enabled` | Per task, after implementation, before its review | Reuse/simplification/efficiency cleanups while the diff is small. Not a review — never overlaps the gates. |
| `/code-review <effort>` (Claude Code, final) | `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) | Once, over the whole implementation | Correctness sweep on top of the default final reviewer (which always runs) — complementary, not duplicate. `ultra` clamped to `medium`. |
| `review` (Copilot CLI, final) | `session_copilot_review_final_enabled` | Once, over the whole implementation | On top of the default final reviewer (which always runs) — complementary, not duplicate. No effort levels. |

There is no per-task `/code-review` or `review` — it would overlap the code-quality gate and the final sweep, so only the final pass remains. Full checkpoint rules and per-mode placement: `references/claude-code-tools.md` (Claude Code), `references/copilot-tools.md` (Copilot CLI, including the Rubber Duck Agent).

### Memory Re-Sync Gate

When several developers share a repository, a local `.memory/` database goes stale as others commit artifacts to `docs/superpowers/`. This gate keeps it current with committed artifacts. It runs **after preferences are loaded** (or after onboarding) and **before Triagem**, only when `session_memory_enabled = true` and `session_resync_completed = false`.

1. **Dirty detection (silent):** run `<super.using-superpowers-base-dir>/scripts/check-resync.cjs` — it ships in **this skill's** `scripts/` directory (resolve it by base-dir path, like `read-preferences.cjs`; it is **not** in `super.persistent-memory`). It compares the **content** of the canonical artifacts (spec/prd/qa/adrs) on disk against the manifest. Trust its `dirty` field — do **not** reconstruct a hash with `git rev-parse`/`git log` (those measure unrelated things and produce false positives). If `dirty` is false, skip silently.
2. **If dirty, ask the user** in the configured language (exact wording in `references/memory-resync.md`).
3. **On accept:** run the sync algorithm (scan artifacts, diff against manifest, prune stale entries, add new/changed) and report a summary. **On decline:** skip.
4. **Set `session_resync_completed = true`** regardless of outcome, then proceed to Triagem.

> **The script is the source of truth; the flag is only a within-session cache.** `check-resync.cjs` is cheap and idempotent — re-running never harms. After a compaction, when in doubt whether the gate already ran, re-run it rather than trusting the flag.

The full algorithm (content-fingerprint dirty detection — content-based, NOT a git tree/commit hash — per-feature hashing, prune-before-add with `source="artifact-sync"`, deduplication, graceful degradation) and its integration with the existing memory flow (`pmem search` recall, `pmem add` namespaces) are in `references/memory-resync.md`.

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
