# Copilot CLI Tool Mapping

Skills use Claude Code tool names. Use your platform equivalent:

| Skill references | Copilot CLI equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `view` |
| `Write` (file creation) | `create` |
| `Edit` (file editing) | `edit` |
| `Bash` (run commands) | `bash` |
| `Grep` (search file content) | `grep` |
| `Glob` (search files by name) | `glob` ⚠️ see limitation below |
| `Skill` tool (invoke a skill) | `skill` |
| `AskUserQuestion` (structured user question) | `ask_user` |
| `WebFetch` | `web_fetch` |
| `Task` tool (dispatch subagent) | `task` with `agent_type: "general-purpose"` or `"explore"` |
| Multiple `Task` calls (parallel) | Multiple `task` calls |
| Task status/output | `read_agent`, `list_agents` |
| `TodoWrite` (task tracking) | `sql` with built-in `todos` table |
| `WebSearch` | No equivalent — use `web_fetch` with a search engine URL |
| Research (`super.deep-research`) | Fan-out via `task` (`agent_type: "general-purpose"`) with `web_fetch`, `exa-web-search-free` using search-engine URLs. The `/research` slash command is user-only — it cannot be invoked by a skill. |
| `EnterPlanMode` / `ExitPlanMode` | No equivalent — stay in the main session. Do not fall back to the platform's native plan mode; use `super.brainstorming` -> `super.generating-prd` -> `super.writing-plans`. |

## ⚠️ Known Limitation: `glob` and Hidden Directories

`glob` **does not return files inside hidden directories** (names starting with `.`): `.superpowers/`, `.github/`, `.config/`, any dotdir. Never use `glob` to detect files there.

**Preferred — the deterministic script:**

```bash
# Your skill context header shows the base directory — use it to build the absolute path:
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

It detects root via `git rev-parse --show-toplevel`, handles nested YAML, returns defaults for missing keys, and marks malformed files. See `read-preferences.cjs --help` for the JSON schema.

**Fallback — use `view` directly (NOT `glob`):**

```
view("/path/to/repo/.superpowers/preferences.yml")
```

A successful read means the file exists; an error or "path does not exist" means absent. Or:

```bash
test -f .superpowers/preferences.yml && echo exists || echo not-found
```

## Async shell sessions

Persistent async shell sessions (no direct Claude Code equivalent):

| Tool | Purpose |
|------|---------|
| `bash` with `async: true` | Start a long-running command in the background |
| `write_bash` | Send input to a running async session |
| `read_bash` | Read output from an async session |
| `stop_bash` | Terminate an async session |
| `list_bash` | List all active shell sessions |

## Additional Copilot CLI tools

| Tool | Purpose |
|------|---------|
| `store_memory` | Persist facts about the codebase for future sessions |
| `report_intent` | Update the UI status line with current intent |
| `sql` | Query the session's SQLite database (todos, metadata) |
| `fetch_copilot_cli_documentation` | Look up Copilot CLI documentation |
| GitHub MCP tools (`github-mcp-server-*`) | Native GitHub API access (issues, PRs, code search) |

---

## Rubber Duck Agent (Experimental)

**Rubber Duck** is a review agent exclusive to Copilot CLI (experimental mode). It uses a model from a different family than the orchestrator — when the orchestrator is Claude, Rubber Duck is GPT-5.4 — giving independent perspectives with distinct blind spots that catch errors self-review misses.

Enable experimental mode: run `/experimental` in Copilot CLI.

### When to invoke (forced checkpoints)

When `copilot.rubber_duck: true` in `.superpowers/preferences.yml`, **always** invoke Rubber Duck at these moments (do not skip):

| Checkpoint | Moment in superpowers flow | Why |
|-----------|---------------------------|-----|
| **After drafting the plan** | `super.writing-plans` / `super.brainstorming` complete | Design decisions are cheap to fix on paper; mistakes here multiply through implementation |
| **After a complex implementation** | `super.subagent-driven-development` finishes a task with 3+ files modified | A second perspective catches edge cases and cross-file conflicts the primary agent misses while immersed in context |
| **After writing tests** | `super.test-driven-development` writes tests, before running them | Identifies coverage gaps and flawed assertions before the agent self-confirms with "everything passed" |

Rubber Duck can also be invoked **reactively** when `super.systematic-debugging` loops without progress — an external perspective can break the deadlock.

The user may request a review at any time — comply and incorporate the feedback.

### How to invoke

Use the `task` tool with `agent_type: "rubber-duck"`:

```
task(
  name: "rubber-duck-review",
  agent_type: "rubber-duck",
  description: "Second opinion on [plan / implementation / tests]",
  prompt: "<full context: what was done, what decisions were made, what needs review>",
  mode: "sync"
)
```

After receiving feedback: reason over each point, adopt findings that prevent real bugs, and show the user what changed and why.

### Check preference before invoking

```
1. Read .superpowers/preferences.yml
2. If copilot.rubber_duck == true → force invoke at all checkpoints below
3. If copilot.rubber_duck == false or key absent → Copilot CLI default behavior (it decides when to invoke)
```

### During Onboarding

When running the `references/onboarding-preferences.md` wizard, include the additional Copilot CLI steps in that file's "Copilot CLI: Additional Steps" section (Rubber Duck, `review` at the final review).

---

## Native `review` Skill

Copilot CLI ships a native skill **`review`** that the superpowers flow can fold into its final review step when the user opts in during onboarding. **Copilot CLI only** — Claude Code, Codex, and Gemini CLI ignore the `copilot:` section. **Off by default**, **no effort levels**.

**The per-task spec compliance review and code quality review gates always run, on every platform, regardless of this flag.**

| Flag | Skill | Where it runs | What it does |
|------|-------|---------------|--------------|
| `copilot.review_final` | `review` | Final review — once, whole implementation | Reviews the entire integrated change. When enabled, runs as an **extra pass on top of** the default final reviewer (which always runs) — complementary, not duplicate. |

No per-task `review`: a per-task pass would overlap the code quality gate and the final review, so the flow keeps only the final one.

### When to invoke

Read the preference once after loading `.superpowers/preferences.yml`, then apply it at the final review. The user may also request a review at any time.

- `copilot.review_final: true` → **also** run `review` once over the whole integrated implementation at the **final review** step ("After all tasks done" / "Finish"), on top of the default final code-reviewer subagent (broad); `review` adds a focused pass.
- `copilot.review_final: false` or absent → only the default final code-reviewer subagent runs (as usual).

### How to invoke

Use the `skill` tool with the `review` skill, passing the full integrated diff. On platforms other than Copilot CLI, skip unconditionally — the skill does not exist there.
