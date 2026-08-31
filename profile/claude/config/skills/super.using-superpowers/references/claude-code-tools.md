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

The harness injects the base directory of the skill it just invoked, and only that one. A sibling skill is reached from it:

```bash
# Your skill context header shows the base directory — use it to build the absolute path:
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

**For a sibling:** parent of your header's base directory + `/super.X`. The skills sit side by side in one directory, so no search is needed and none is warranted.

**Never search for one.** Skill directories usually live under a dotdir (`.claude/skills/`), and glob-style tools commonly skip hidden directories — a search there answers "not found" about a file that is present, which reads as "this environment lacks the script" and ends with a gate silently skipped. A gate script that will not run is a **STOP**: say so and stop, never proceed quietly.

Claude Code substitutes `${CLAUDE_SKILL_DIR}` inside a `SKILL.md` body, which is the same directory. It is **not** substituted in `references/` or `agents/` files — those are read as plain files — so the header rule above is the one that holds everywhere, and it is what the skills are written against.

## Native skills

Claude Code ships native skills that the superpowers flow can fold into its execution and review steps when the user opts in during onboarding. They are **Claude Code only** — Copilot CLI, Codex, and Gemini CLI do not have them and silently ignore the `claude_code:` section of `.superpowers/preferences.yml`.

Both are **off by default**. The user enables them per repository during onboarding (or by editing the YAML / asking the agent to update it).

**The per-task spec compliance review and code quality review gates always run, on every platform, regardless of these flags.** What these skills add never duplicates those gates:

| Flag | Slash command | Where it runs | What it does |
|------|--------------|---------------|--------------|
| `claude_code.simplify` | `/simplify` | Execution — per task, before review | Applies reuse/simplification/efficiency/altitude cleanups to the changed code. It **applies fixes** (it is not a review), so it never overlaps the spec/quality gates. |
| `claude_code.code_review_final` | `/code-review <effort>` | Final review — once, whole implementation | Correctness sweep over the entire integrated change at `code_review_effort` (default `medium`). When enabled it runs as an **extra bug-focused pass on top of** the default final reviewer (which always runs) — complementary layers (broad review + bug net), not duplicate. |

There is no per-task `/code-review`: a per-task correctness pass would overlap the code quality gate and the final sweep, so the flow keeps only the final one. The final review's effort is set by `claude_code.code_review_effort` (default `medium`; `low`/`medium`/`high`/`max` — `ultra` is unsupported and clamped to `medium`).

## When to invoke

Read the preferences once after loading `.superpowers/preferences.yml`, then apply at the matching checkpoints. The user may also request either pass at any time.

### `/simplify` — per-task execution checkpoint

When `claude_code.simplify: true`, run `/simplify` after a task's implementation is functionally complete and its tests pass, **before** the task's spec/quality reviews — so reviewers see already-tidied code while the diff is small. Skip tasks with no code changes (docs-only, config-only). Because `/simplify` *applies* cleanups rather than reporting them, it does not duplicate any review gate.

Placement by execution mode:

| Mode (skill) | `/simplify` runs |
|---|---|
| **Sequential** (`super.subagent-driven-development`) | After the implementer returns with tests green, before the spec/quality reviews. |
| **Parallel in-tree** (`super.parallel-subagent-in-tree`) | Orchestrator-only, after the scope-verification gate and **before** the integration barrier — never the concurrent write-only implementers, so the barrier validates and commits the simplified code. |
| **Parallel worktrees** (`super.parallel-subagent-development`) | Inside each task's worktree, after the implementer commits + self-reviews, before that task's review. |

### `/code-review <effort>` — final review checkpoint (extra bug pass)

When `claude_code.code_review_final: true`, run `/code-review` at `code_review_effort` (default `medium`) once over the whole integrated implementation at the **final review** step ("After all tasks done" / "Finish"), as an **extra bug-focused pass in addition to** the default final code-reviewer subagent. The default reviewer is broad (architecture/security/testing/project principles); `/code-review` adds a focused correctness net — complementary layers, not duplicate work. **The default final reviewer always runs**; this flag only adds the extra pass. The per-task spec + quality gates already ran and are untouched.

## Check the preferences before invoking

```
1. Read .superpowers/preferences.yml (read-preferences.cjs)
2. simplify == true          → run /simplify at each per-task execution checkpoint
3. code_review_final == true → ALSO run /code-review <code_review_effort> (default medium) once at the
                               final review, on top of the default final code-reviewer subagent
4. code_review_final == false → only the default final code-reviewer subagent runs (as usual)
5. on platforms other than Claude Code → skip both; the spec + quality gates and the default final
   reviewer carry the review on their own
```

## During onboarding

When running the `references/onboarding-preferences.md` wizard **in Claude Code**, include the Claude Code native-skill steps documented in the "Claude Code: Native Skills Additional Steps" section of that file (Step 4a `/simplify`, Step 4b final `/code-review`). Agents on other platforms **must skip those steps**.

## Symbol lookup (LSP / Serena) — grep is the default

Discovery/review skills (`super.brainstorming` research, `super.writing-plans` research, `super.reviewing-specs` lenses) use `grep` as the default way to locate or verify a **named code symbol** (class, method, function, endpoint, type, hook, store selector, route) — anchored to a class/file name, not just the bare symbol, to avoid false positives (a same-named symbol in another module, a match inside a comment, string, or test decoy).

A structural symbol-lookup tool (the built-in `LSP` tool, or Serena MCP's `find_symbol` / `get_symbols_overview` / `find_referencing_symbols` when available) resolves a symbol by name in one call with no false positives — but it only pays off when it is already loaded and correctly scoped to the exact project being searched. A live A/B measurement across 3 real research tasks found `grep` cheaper and faster in every one: on the two grep-native tasks (whole-file read, broad textual scan) the two paths tied; on the one named-symbol task, `find_symbol` failed on every attempt (the active project scope didn't match the target repo, and there is no `activate_project` tool to redirect it), and the retries before falling back to `grep` cost +67% tool calls and +68% wall time versus `grep` alone.

**So: use `grep` first.** If a symbol-lookup tool is already loaded, one opportunistic attempt for a named symbol is fine — but abandon it immediately after that single try (no `ToolSearch` round-trip to load it, no retries, no re-scoping) and fall back to `grep`. Never let chasing a possibly-unavailable symbol tool cost more than just grepping would have. This lives in the discovery/review prose; the execution-side implementer/reviewer agents are intentionally unchanged.
