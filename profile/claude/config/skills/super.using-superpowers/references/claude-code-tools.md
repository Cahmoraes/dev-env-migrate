# Claude Code Native Skills

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
