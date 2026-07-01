# Session State & Gates — full detail

This reference holds the detailed tables and procedures for the session machinery the
router (`SKILL.md § Session State & Gates`) summarizes. The SKILL.md body keeps the
gate **order**, the critical invariants, and the script invocations; the exhaustive
variable table, the Caveman activation rules, the native-review matrix, and the
execution-mode election steps live here so they load only when a session actually
reaches them.

## Table of contents
- [Session State variables](#session-state-variables)
- [Caveman Mode](#caveman-mode)
- [Native Review Skills](#native-review-skills)
- [Execution Mode Election (option 5)](#execution-mode-election-option-5)

## Session State variables

After reading preferences, derive the session variables deterministically — do **not**
hand-map `preferences.X.Y` to `session_*`:

```bash
node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
  --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"
```

`derive-session-state.cjs` is the **single source of truth** for the
`preferences.X.Y → session_*` mapping and for platform gating: the Claude Code
variables resolve `false` off Claude Code, and `session_copilot_review_final_enabled`
resolves `false` off Copilot CLI, so no skill carries per-platform rules. Pass
`--platform` matching where you run (`claude-code`; `copilot`/`codex`/`gemini`
elsewhere). Track these session-only variables in context (never written back to
`preferences.yml`); the prefs-derived ones come from the script's `sessionState`, the
latches start `false`:

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

## Caveman Mode

Caveman Mode cuts agent token use ~75% during execution phases by switching to
ultra-compressed communication. Opt-in; never activated automatically.

**Activation window:** ON from the `Planejando → Executando` gate, through all of
`Executando`, and into `GateQA → Verificando`; OFF everywhere else (Explorando,
Formalizando, Planejando, Finalizando, and the root `Depurando` state, which is
investigative and needs clear prose). The `Planejando → Executando` gate has two
mandatory exit actions:
1. **Memory persistence** — if `session_memory_enabled = true`, `super.writing-plans`
   calls `pmem add` (3 entries) before handing off (see its § Memory Persistence). If
   memory is disabled, skip entirely.
2. **Caveman activation** — if `session_caveman_active = true`, invoke `/caveman <level>`.

Execution skills must **verify memory was persisted** before starting tasks (only if
`session_memory_enabled = true`; otherwise skip and proceed).

**Invocation:** invoke the `caveman` skill passing the level (e.g. `/caveman full`);
deactivate with "normal mode" / "stop caveman". The execution skills own the actual
invocation — this is the policy they follow.

> **Activation is idempotent — invoke `/caveman` at most once per active window.**
> Before invoking, check `session_caveman_in_effect`: if it is already `true` at
> `session_caveman_level`, caveman is already loaded — **skip the invocation; do not
> re-invoke** `/caveman` (re-invoking only re-loads the skill and wastes tokens;
> behavior is unchanged). After a successful invocation set
> `session_caveman_in_effect = true`; on deactivation set it back to `false`. This
> single guard prevents the two known double-fires: (a) the gate policy and an
> execution skill's Step 2 both activating, and (b) a post-compaction re-activation
> followed by that skill's own Step 2 check. Like `session_caveman_prompted`, it is a
> one-shot latch, not a preference — never written to `preferences.yml`.

**Dynamic question:** if `session_caveman_active = false` AND
`session_caveman_prompted = false`, the execution skill **may** ask once before the
`Executando` phase:
> "Antes de iniciar a implementação, deseja ativar o **Caveman Mode**? Este modo reduz o consumo de tokens em ~75% durante a execução (implementação, revisão de código e verificações técnicas), usando comunicação ultra-compacta enquanto mantém precisão técnica."
> - **Sim** — ativa para esta sessão (não altera preferências salvas)
> - **Não** — continua com comunicação normal

Yes → set `session_caveman_active = true`, `session_caveman_level = full` (or
`preferences.optimization.caveman_level` if set), `session_caveman_prompted = true`.
No → set `session_caveman_prompted = true`; do not ask again. The dynamic question is
session-only and never alters `.superpowers/preferences.yml`.

## Native Review Skills

Each platform ships native review skills the flow folds in **only when the user opts in
during onboarding** (the other platform's section is ignored). All are off by default
and **additive: the spec-compliance and code-quality review gates always run
regardless** — turning these off just leaves the pre-existing review flow untouched.
The execution skills own the invocation; when a flag is `false` or the platform doesn't
match, skip that pass.

| Skill (platform) | Session variable | Checkpoint | Behavior |
|---|---|---|---|
| `/simplify` (Claude Code) | `session_simplify_enabled` | Per task, after implementation, before its review | Reuse/simplification/efficiency cleanups while the diff is small. Not a review — never overlaps the gates. |
| `/code-review <effort>` (Claude Code, final) | `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) | Once, over the whole implementation | Correctness sweep on top of the default final reviewer (which always runs) — complementary, not duplicate. `ultra` clamped to `medium`. |
| `review` (Copilot CLI, final) | `session_copilot_review_final_enabled` | Once, over the whole implementation | On top of the default final reviewer (which always runs) — complementary, not duplicate. No effort levels. |

There is no per-task `/code-review` or `review` — it would overlap the code-quality
gate and the final sweep, so only the final pass remains. Full checkpoint rules and
per-mode placement: `references/claude-code-tools.md` (Claude Code),
`references/copilot-tools.md` (Copilot CLI, including the Rubber Duck Agent).

## Execution Mode Election (option 5)

When triage routes to execution, **the user — not you — chooses the execution mode.**
Jumping straight into `super.subagent-driven-development` (or any other execution skill)
because it "is the default" is the exact bug this section prevents. (Exception: the user
already named a mode → invoke that skill directly with the tasks index path.) This
mirrors the Execution Handoff `super.writing-plans` offers right after creating the
tasks index — same three options, same dynamically elected `(recommended)` tag.

Steps:
1. **Locate pending work:** `node <super.using-superpowers-base-dir>/scripts/superpowers-status.cjs --pending` returns the resumable features (`phase` `planned`/`executing`) with task progress (`tasks.done`/`tasks.total`) and a deterministic `nextAction`. More than one → list them and ask which; empty → tell the user and offer planning (option 4). (Drop `--pending` for the full pipeline view.)
2. **Derive the recommendation:** `node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md` → read `executionRecommendation` and the wave summary (`waveCount`, `waveKinds`, `maxParallelWave`). (`parse-waves.cjs` lives in the sibling skill: swap the final `super.using-superpowers` segment of this skill's base dir for `super.parallel-subagent-development` — superpowers skills are siblings in one `skills/` directory.)
3. **Present the three options:** render via `<super.writing-plans-base-dir>/references/execution-handoff-message.md` (Steps 1–3) — Subagent-Driven, Parallel in-tree, Parallel worktrees, with `(recommended)` elected by the rubric. Never hardcode the recommendation on option 1. Open with the triage variant: _"Found existing tasks index `tasks-<feature-name>.md` with N tasks (M pending)."_
4. **Wait for the user's choice,** then invoke the chosen skill (`super.subagent-driven-development` / `super.parallel-subagent-in-tree` / `super.parallel-subagent-development`) with the tasks index path.
