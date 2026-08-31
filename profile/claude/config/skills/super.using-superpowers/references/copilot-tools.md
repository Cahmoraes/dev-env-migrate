# Copilot CLI Tool Mapping

Skills use Claude Code tool names. Use your platform equivalent:

| Skill references | Copilot CLI equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `view` |
| `Write` (file creation) | `create` |
| `Edit` (file editing) | `edit` |
| `Bash` (run commands) | `bash` |
| file-content search | `grep` |
| `LSP` / Serena `find_symbol` (structural symbol lookup) | `grep` is the default for named code symbols too (anchor the query to a class/file name) — measured cheaper and more reliable than chasing symbol lookup in this pipeline. If a language-server/symbol tool (e.g. Serena MCP `find_symbol`) is already loaded, one opportunistic attempt is fine; abandon it after that and use `grep` if it doesn't resolve immediately. |
| file-name search | `glob` ⚠️ see limitation below |
| `Skill` tool (invoke a skill) | `skill` |
| `AskUserQuestion` (structured user question) | `ask_user` |
| `WebFetch` | `web_fetch` |
| a `Subagent (...):` dispatch block | `task` with `agent_type: "general-purpose"` or `"explore"`, and **`mode: "sync"` for a sequential/blocking dispatch** — see "Dispatching subagents" below |
| Multiple `Subagent (...):` blocks (parallel) | Multiple `task` calls with `mode: "background"`, then collect with `read_agent` — see "Dispatching subagents" below |
| Task status/output | `read_agent`, `list_agents` |
| session task list (task tracking, optional) | `sql` with built-in `todos` table |
| `WebSearch` | No equivalent — use `web_fetch` with a search engine URL |
| Research (`super.deep-research`) | Fan-out via `task` (`agent_type: "general-purpose"`) with `web_fetch`, `exa-web-search-free` using search-engine URLs. The `/research` slash command is user-only — it cannot be invoked by a skill. |
| `EnterPlanMode` / `ExitPlanMode` | No equivalent — stay in the main session. Do not fall back to the platform's native plan mode; use `super.brainstorming` -> `super.generating-prd` -> `super.writing-plans`. |

## Dispatching subagents with `task` (blocking mode; `ask_user` is never a wait primitive)

The skills say, in many places, *"After dispatching, await its result — never poll. The subagent runs in the background and the harness re-invokes you when it returns; simply wait."* **That is Claude Code semantics.** Copilot CLI's `task` tool does **not** suspend the orchestrator and re-invoke it when a background subagent finishes: a `mode: "background"` dispatch returns immediately with an `agent_id`, and *nothing wakes you on completion*. Read those "the harness re-invokes you" sentences as an instruction to **not busy-poll**, then satisfy them with the Copilot-native mechanism below.

**Translate "await its result — never poll" to `mode: "sync"`.** A `sync` dispatch blocks the `task` call until the subagent finishes and returns its full output directly — that *is* "simply wait," done natively, with no polling and no self-inserted pause. Use `mode: "sync"` for every **sequential, one-at-a-time** dispatch: the implementer, the spec reviewer, the code-quality reviewer, the combined reviewer, the final reviewer, and the independent-verification Verifier in `super.subagent-driven-development` — and any single blocking dispatch elsewhere. `mode: "background"` is only for a genuine **parallel fan-out** (a wave in `super.parallel-subagent-development` / `super.parallel-subagent-in-tree`, research investigators, QA subagents) where you launch several in one turn and then collect each with `read_agent` / `list_agents`.

**`ask_user` is a consent tool, never a synchronization/wait primitive.** Do **not** call `ask_user` to "wait for" a dispatched subagent, to pause between a dispatch and reading its result, or to ask "continue?" while background work runs. A `{ continue: boolean }` prompt after a dispatch is the exact anti-pattern this note prevents — it halts the autonomous flow and forces the user to click through phases meant to run unattended. **The per-task spec review and code-quality review are fully autonomous — they never prompt the user; neither does the fix→re-review loop between them.** The only places the execution skills legitimately call `ask_user` are their explicit, named consent gates, defined in the skills themselves:

- **Branch Guard** — the current branch is the repository's default (`main`/`master`): STOP and ask before the first implementer dispatch (offer a feature branch, or explicit consent to proceed on the default branch).
- **QA gate** — a PRD exists *and* `workflow.qa_gate` is enabled: ask whether to run `super.user-story-verification`.
- **Auto-commit suggestion** — `workflow.auto_commit: false`: present the ready-to-copy `git add`/`commit` block for the developer to run (a message + optional confirm, not a wait pause).

Everything between those gates — dispatch, review, fix loop, verification — runs without a single `ask_user`. If you find yourself reaching for `ask_user` and none of the three gates above applies, you are misusing it as a wait primitive: dispatch with `mode: "sync"` instead.

**The same rule governs phase handoffs, not just execution.** A `{ continue: boolean }` re-confirmation at a phase boundary — "Chegamos ao final do brainstorming… continuar com o plano?", "continue with the implementation plan?", "proceed to planning?" — is the identical anti-pattern. When the previous step already captured the user's go-ahead, do **not** re-ask it as an `ask_user` gate; invoke the next skill directly. In particular, at the **brainstorming → `super.writing-plans`** handoff, the PRD suggestion (`super.brainstorming` step 9) *is* the single go/no-go: skipping the PRD literally means "go straight to planning," and generating it ends by proceeding to planning. Once that yes/no is answered, invoke `super.writing-plans` and let it run — never insert a `{ continue_planning: boolean }` prompt before or inside it. The only legitimate user-facing gate after this handoff is the execution-mode election the execution pipeline raises later. Re-confirming a decision the user just made stalls a flow meant to proceed and forces the user to click through near-identical gates.

## ⚠️ Known Limitation: `glob` and Hidden Directories

`glob` **does not return files inside hidden directories** (names starting with `.`): `.superpowers/`, `.github/`, `.config/`, any dotdir. Never use `glob` to detect files there.

**Preferred — the deterministic script:**

```bash
# Your skill context header shows the base directory — use it to build the absolute path:
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

`<super.X-base-dir>` is never filled in for you: the harness injects the base directory of the skill it just invoked, and only that one. **For a sibling skill:** parent of your header's base directory + `/super.X`. Do not search for it — skill directories live under a dotdir, search skips those, and a false "not found" ends with a gate quietly skipped. A gate script that will not run is a **STOP**.

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
