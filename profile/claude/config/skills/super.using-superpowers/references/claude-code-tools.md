# Claude Code Tool Mapping and Native Skills

## Tool mapping

Skills are written in Claude Code tool names, so most need no translation. Subagent dispatch does:

| Skill references | Claude Code equivalent |
|-----------------|------------------------|
| a `Subagent (...):` dispatch block / "dispatch a subagent" | the **`Agent`** tool: `subagent_type` (the agent type), `prompt`, `description`, `model`, `run_in_background` |
| `Subagent (explore):` | `subagent_type: "Explore"` — a **parameter value**, never a tool |
| `Subagent (general-purpose):` | `subagent_type: "general-purpose"` |
| `Subagent (read-only):` | `subagent_type: "general-purpose"` with the template's allowed-tools list — the template's prose above the block names what to withhold |

A dispatch that fails with *"No such tool available"* naming an agent type means the type was called as a tool: re-issue it as the `subagent_type` argument above.

**If the tool name differs in your build,** it is the one taking a prompt plus an agent-type parameter. Do not go hunting — if no dispatch tool is in your toolset, say so and continue without subagents rather than spending calls searching (see "Tool discovery is charged against the context window" in `super.using-superpowers/SKILL.md`).

## Resolving `<super.X-base-dir>`

**Claude Code hands you the skill's directory by substituting `${CLAUDE_SKILL_DIR}` in the `SKILL.md` body — and by no other route.** Measured on 2.1.258: the tool result of a `Skill` call carries **no** base-directory header, so a rule phrased around "your context header" resolves to nothing here. Every `SKILL.md` states its own directory through that literal; read it from there.

```bash
# ${CLAUDE_SKILL_DIR} in the invoked SKILL.md is that skill's absolute directory:
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

**For a sibling:** parent of that directory + `/super.X`. The skills sit side by side in one directory, so no search is needed and none is warranted.

**Never search for one.** Skill directories usually live under a dotdir (`.claude/skills/`), and glob-style tools commonly skip hidden directories — a search there answers "not found" about a file that is present, which reads as "this environment lacks the script" and ends with a gate silently skipped. A gate script that will not run is a **STOP**: say so and stop, never proceed quietly.

The substitution happens **only in a `SKILL.md` body**: in `references/` and `agents/` files the literal is read as plain text. So resolve the directory once, from the `SKILL.md` you were invoked with, and carry it — a reference that shows `${CLAUDE_SKILL_DIR}` is not telling you a path.

## Cheaper orchestration: nested controller (opt-in)

The controller session is the most expensive seat in a plan run: it reads every dispatch result and every report, and it usually sits on the session's most capable model. Claude Code lets a subagent dispatch subagents of its own — three layers below the main conversation by default, adjustable through `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` — so the whole execution loop can run one layer down, on a cheaper seat. Measured upstream on a six-task plan: about half the cost and wall clock of the session running the loop itself.

**Opt-in only, and only for a whole plan.** Do this when the user asks for it, or says the session model is too expensive to spend on coordination. Never for a single task: nesting one dispatch buys nothing and adds a seat. Absent that request, the session runs the elected execution skill itself, exactly as its `SKILL.md` says.

When it applies, dispatch ONE orchestrator on the `standard` tier with the plan index path and the instruction to run the elected execution skill (`super.subagent-driven-development`, with `--single` when that was the answer) end to end, one layer down:

```
Subagent (general-purpose):
  description: "Nested controller: run the plan end to end"
  model: <session_model_tier_standard>
  prompt: |
    Run `super.<elected-execution-skill>` end to end for the plan at <tasks-index-path>, as its controller.
    Read that skill's `SKILL.md` and `references/model-selection.md` before the first dispatch. The
    `**Tier:**` written in each task file is binding one layer down exactly as it is at the top:
    resolve it through `session_model_tier_<tier>` and set `model:` on every dispatch; run
    `<super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs` before each fan-out and
    record the resolved models in the manifest. Never implement a task yourself.
    Your final message carries every finding, ruling and deferred item verbatim, with its `file:line`.
```

The plan, the task files and their `Status:` lines live on disk, so nothing is lost to the extra layer, and a controller that resumes later reads the same state. The top-level session's job is then to **relay the nested controller's final message, not summarize it** — that message is the only route by which the decisions made on the user's behalf reach them — and to continue with the final stage the elected skill defines when it is not already part of the nested run.

## Native skills

Claude Code ships a native review skill that the superpowers flow can fold into its final review step when the user opts in during onboarding. It is **Claude Code only** — Copilot CLI, Codex, and Gemini CLI do not have it and silently ignore the `claude_code:` section of `.superpowers/preferences.yml`.

**Off by default**. The user enables it per repository during onboarding (or by editing the YAML / asking the agent to update it).

**The per-task spec compliance review and code quality review gates always run, on every platform, regardless of this flag.** What this skill adds never duplicates those gates:

| Flag | Slash command | Where it runs | What it does |
|------|--------------|---------------|--------------|
| `claude_code.review_final` | `/code-review <effort>` | Final review — once, whole implementation | Correctness sweep over the entire integrated change at `review_effort` (default `medium`). When enabled it runs as an **extra bug-focused pass on top of** the default final reviewer (which always runs) — complementary layers (broad review + bug net), not duplicate. |

There is no per-task `/code-review`: a per-task correctness pass would overlap the code quality gate and the final sweep, so the flow keeps only the final one. The final review's effort is set by `claude_code.review_effort` (default `medium`; `low`/`medium`/`high`/`max` — `ultra` is unsupported and clamped to `medium`).

## When to invoke

Read the preferences once after loading `.superpowers/preferences.yml`, then apply at the matching checkpoint. The user may also request the pass at any time.

### `/code-review <effort>` — final review checkpoint (extra bug pass)

When `claude_code.review_final: true`, run `/code-review` at `review_effort` (default `medium`) once over the whole integrated implementation at the **final review** step ("After all tasks done" / "Finish"), as an **extra bug-focused pass in addition to** the default final code-reviewer subagent. The default reviewer is broad (architecture/security/testing/project principles); `/code-review` adds a focused correctness net — complementary layers, not duplicate work. **The default final reviewer always runs**; this flag only adds the extra pass. The per-task spec + quality gates already ran and are untouched.

## Check the preferences before invoking

```
1. Read .superpowers/preferences.yml (read-preferences.cjs)
2. review_final == true  → ALSO run /code-review <review_effort> (default medium) once at the
                            final review, on top of the default final code-reviewer subagent
3. review_final == false → only the default final code-reviewer subagent runs (as usual)
4. on platforms other than Claude Code → skip it; the spec + quality gates and the default final
   reviewer carry the review on their own
```

## During onboarding

When running the `references/onboarding-preferences.md` wizard **in Claude Code**, include the Claude Code native-skill step documented in the "Claude Code: Native Skill Additional Step" section of that file (Step 2d, final `/code-review`). Agents on other platforms **must skip that step**.

