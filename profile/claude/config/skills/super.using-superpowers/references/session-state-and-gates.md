# Session State & Gates — full detail

This reference holds the detailed tables and procedures for the session machinery the
router (`SKILL.md`, "Session State & Gates" section) summarizes. The SKILL.md body keeps the
gate **order**, the critical invariants, and the script invocations; the exhaustive
variable table, the native-review matrix, and the
execution-mode election steps live here so they load only when a session actually
reaches them.

## Table of contents
- [Session State variables](#session-state-variables)
- [Native Review Skills](#native-review-skills)
- [Execution Mode Election (option 5)](#execution-mode-election-option-5)

## Session State variables

After reading preferences, derive the session variables deterministically — do **not**
hand-map `preferences.X.Y` to `session_*`:

```bash
node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
  --platform <resolved-platform> --repo-root "$(git rev-parse --show-toplevel)"
```

`derive-session-state.cjs` is the **single source of truth** for the
`preferences.X.Y → session_*` mapping and for platform gating: the Claude Code
variables resolve `false` off Claude Code, and `session_copilot_review_final_enabled`
resolves `false` off Copilot CLI, so no skill carries per-platform rules. Pass
`--platform` matching where you run (`claude-code`; `copilot`/`codex`/`gemini`/`opencode`
elsewhere). Track these session-only variables in context (never written back to
`preferences.yml`); they come from the script's `sessionState`:

| Variable | Source | Meaning |
|---|---|---|
| `session_auto_commit` | sessionState | Platform-agnostic — whether subagents commit automatically after each task (from `workflow.auto_commit`). Surfaced for the session-state display; the execution skill still reads `workflow.auto_commit` directly at their commit gate. |
| `session_visual_companion_enabled` | sessionState | Platform-agnostic — whether `super.brainstorming` may offer the browser companion at all (from `workflow.visual_companion`). `false` skips the offer silently: no visual signal fires, nothing about the browser is mentioned. `true` is the default and keeps the consent question. |
| `session_qa_gate_enabled` | sessionState | Platform-agnostic — whether the end-of-implementation QA gate (`super.user-story-verification`) exists in this session (from `workflow.qa_gate`; `true` for both `true` and `ask`). `true` runs it whenever a PRD exists; `false` skips it silently and suppresses every QA mention, including at the PRD step. |
| `session_qa_gate_ask` | sessionState | Platform-agnostic — where the QA gate's consent comes from (`true` only for `workflow.qa_gate: ask`). `false`: the preference is the consent, nothing is asked at the final stage. `true`: the final stage asks once, with a PRD present, whether to run it; the answer covers that feature; no possible answer → skip. |
| `session_finish_action` | sessionState | Platform-agnostic — what `super.finishing-a-development-branch` does once the branch is verified (from `workflow.finish_action`): `ask` (default) shows the finishing menu; `merge`, `pr`, `keep` apply that option without a question. Never `discard` — the loader clamps anything else to `ask`. |
| `session_code_review_final_enabled` | sessionState | Claude Code only — whether `/code-review` runs once at the **final** review as an extra bug pass (the default final reviewer always runs). |
| `session_code_review_effort` | sessionState | Effort for the final `/code-review` (`low`/`medium`/`high`/`max`; `ultra` clamped to `medium`). |
| `session_copilot_review_final_enabled` | sessionState | Copilot CLI only — whether the native `review` runs once at the **final** review as an extra pass (the default final reviewer always runs). |
| `session_model_tier_cheap`, `session_model_tier_standard`, `session_model_tier_capable` | sessionState | Model ids for the cheap/standard/capable execution tiers, **resolved for the running platform** (from `preferences.model_tiers`; `null` → `auto`, let the platform pick). A tier configured with a model this platform cannot serve resolves to `null` too and is listed in the bootstrap's `unavailableModelTiers` — so these are the values to dispatch and to display, never `preferences.model_tiers` re-read raw. |

## Native Review Skills

Each platform ships native review skills the flow folds in **only when the user opts in
during onboarding** (the other platform's section is ignored). All are off by default
and **additive: the spec-compliance and code-quality review gates always run
regardless** — turning these off just leaves the pre-existing review flow untouched.
The execution skill owns the invocation; when a flag is `false` or the platform doesn't
match, skip that pass.

| Skill (platform) | Session variable | Checkpoint | Behavior |
|---|---|---|---|
| `/code-review <effort>` (Claude Code, final) | `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) | Once, over the whole implementation | Correctness sweep on top of the default final reviewer (which always runs) — complementary, not duplicate. `ultra` clamped to `medium`. |
| `review` (Copilot CLI, final) | `session_copilot_review_final_enabled` | Once, over the whole implementation | On top of the default final reviewer (which always runs) — complementary, not duplicate. No effort levels. |

There is no per-task `/code-review` or `review` — it would overlap the code-quality
gate and the final sweep, so only the final pass remains. Full checkpoint rules and
per-mode placement: `references/claude-code-tools.md` (Claude Code),
`references/copilot-tools.md` (Copilot CLI).

## Execution Mode Election (option 5)

Option 1 (`super.subagent-driven-development`) is always the one tagged `(recommended)`; **the user is always asked
before execution starts** — it is the stage that spends the most credits, and the gate is the
same one `super.writing-plans` opens after writing a plan (deep review / subagent-driven / single
implementer when eligible).

> **A mode the user named is settled, and reading the exception wide is the other bug.** It
> fires only when the user named a **mode** — the execution skill's name, with or without
> `--single`. **Invoking an execution skill by name is naming a mode**, so a session that opened
> with `/super.subagent-driven-development` has already elected. That skill runs the plan
> **silently**: it never re-raises this election. Words that describe the plan
> (*"the tasks are independent"*, *"speed this up"*, *"just run it"*) describe its **shape or
> the user's mood**, not a mode the user typed, so that plan is still owed the gate. The execution skill carries an
> election guard at its Step 1 as a backstop; the election itself belongs here.

This mirrors the Execution Handoff `super.writing-plans` runs right after creating the tasks
index — same rule, same options.

Steps:
1. **Locate pending work:** `node <super.using-superpowers-base-dir>/scripts/superpowers-status.cjs --pending` returns the resumable features (`phase` `planned`/`executing`) with task progress (`tasks.done`/`tasks.total`) and a deterministic `nextAction`. **Exactly one → take it and go straight to step 2**, no question asked; more than one → list them and ask which; empty → tell the user and offer planning (option 4). (Drop `--pending` for the full pipeline view.)
2. **Read the parser:** `node <super.writing-plans-base-dir>/scripts/parse-plan.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md` → read `singleImplementer.eligible` (whether option 3 is offered) and `errors` (a dependency error is fixed in the plan before the gate opens). (`parse-plan.cjs` lives in the sibling skill: swap the final `super.using-superpowers` segment of this skill's base dir for `super.writing-plans` — superpowers skills are siblings in one `skills/` directory.)
3. **Open the gate:** follow `<super.writing-plans-base-dir>/references/execution-handoff-message.md` (Steps 1–3). Render the options — 0 deep review (`super.reviewing-specs`), 1 Subagent-Driven `(recommended)` — plus 3 Single implementer only when `singleImplementer.eligible` is true (never tagged), opening with the triage variant: _"Found existing tasks index `tasks-<feature-name>.md` with N tasks (M pending)."_ If the user picks option 0, follow that reference's Step 4, which covers resolving the spec path from the `featureName` you already located here.
4. **Ask through the platform's structured-question tool** (`AskUserQuestion` / `ask_user` / `question`; options 0/1, plus 3 when offered, fit its cap), as the last call of the turn — the answer arrives in the next turn, and nothing of the execution runs in the turn that asked. **The answer cannot arrive only when that tool is absent from the toolset** (`codex exec`, `opencode run`, a headless run): then apply the autonomous fallback from the handoff — option 1. A resume request ("retomar", "continue") names no mode and answers nothing; it does not unlock the fallback. With the answer in hand (or the fallback), invoke the selected skill — `super.subagent-driven-development` with the tasks index path; option 3 is the same skill with `--single` after the path; the fallback never picks 3.
