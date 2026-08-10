# Codex Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your platform equivalent:

| Skill references | Codex equivalent |
|-----------------|------------------|
| `Read` (file reading) | `read_file` |
| `Write` / `Edit` (file creation and editing) | `apply_patch` (freeform patch edits) |
| `Bash` (run commands) | The shell tool your session exposes — **the name varies by model**, see "The shell tool has no single name" |
| file-content search | `grep_files` |
| file-name search | `list_dir` / the shell tool ⚠️ see "Checking files in hidden directories" |
| `LSP` / Serena `find_symbol` (structural symbol lookup) | `grep_files` is the default for named code symbols too (anchor the query to a class/file name) — measured cheaper and more reliable than chasing symbol lookup in this pipeline. If a language-server/symbol tool (e.g. Serena MCP `find_symbol`) is already loaded, one opportunistic attempt is fine; abandon it after that and use `grep_files` if it doesn't resolve immediately. |
| session task list (task tracking, optional) | `update_plan` |
| `AskUserQuestion` (structured user question) | `request_user_input` — **interactive sessions only**, see "Asking the user structured questions" |
| `Skill` tool (invoke a skill) | Skills load natively — see "Skills" below |
| `WebSearch` | `web_search` |
| `WebFetch` | `web_search` (no separate fetch tool) |
| Image input | `view_image` |
| `Task` tool (dispatch subagent) | `spawn_agent` — see "Subagent dispatch" |
| Multiple `Task` calls (parallel) | Multiple `spawn_agent` calls |
| Task returns result | `wait_agent` |
| Task completes automatically | `close_agent` (v1) / `interrupt_agent` (v2) to free the slot |
| `EnterPlanMode` / `ExitPlanMode` | Codex plan mode — **do not use it** for feature/design/migration/refactor work; stay in the internal pipeline (`super.brainstorming` → `super.generating-prd` → `super.writing-plans`). |

## The shell tool has no single name

Codex does not expose one canonical shell tool. Which one your session holds depends on the model and configuration: `shell` (argv form), `shell_command` (string form), `local_shell` (a hosted tool type for some model configurations), or the unified-exec PTY pair `exec_command` + `write_stdin` for persistent sessions.

**Use whichever your session actually offers.** Where a skill says `Bash`, that means "run this command with your shell tool" — the superpowers scripts are plain `node ...` invocations and work under any of them. Do not report a step as blocked because a specific shell tool name is absent.

## Subagent dispatch

Multi-agent collaboration is **stable and enabled by default** — `[features] multi_agent` in `~/.codex/config.toml` defaults to `true`, and a second gate `agents.enabled` also defaults to `true`. You normally need no configuration to dispatch subagents for `super.dispatching-parallel-agents`, `super.subagent-driven-development`, and the parallel execution modes. Only set it explicitly if the feature was turned off in the user's config:

```toml
[features]
multi_agent = true
```

### Two tool surfaces: v1 and v2

The multi-agent tools exist in **two incompatible schema versions**, selected by the `features.multi_agent_v2` gate — and newer models may be served the v2 surface regardless of that setting. **Check which tool names and arguments your session actually exposes before dispatching**; do not assume from this table.

| Operation | v1 | v2 |
|---|---|---|
| Dispatch | `spawn_agent` (`agent_type`, `model`, `fork_context`) | `spawn_agent` (`task_name`, `message`, `fork_turns`) |
| Send follow-up input | `send_input` | `send_message` |
| Await result | `wait_agent` | `wait_agent` |
| Free the slot | `close_agent` | `interrupt_agent` |
| Resume / list | `resume_agent`, `list_agents` | — |

### Model tiers

The execution skills require that every dispatch names its model explicitly, so a task whose plan header says `**Tier:** cheap` runs on `model_tiers.cheap` rather than inheriting the orchestrator's model.

- **On the v1 surface** this maps directly: pass the tier's model as `spawn_agent`'s `model` argument.
- **On the v2 surface there is no `model` argument.** When that is what your session exposes, the tier cannot be set at dispatch time. Say so explicitly in the thread rather than dispatching silently and letting the manifest claim a tier it did not enforce, and record the actual model in the `validate-dispatch.cjs` manifest. The tier rules themselves are unchanged — the written `**Tier:**` is still binding and escalation still requires a recorded reason.

Legacy note: the v1 waiting tool was once called `wait`; it is now `wait_agent`. A bare `wait` today belongs to code-mode `exec/wait`, which resumes a yielded exec cell by `cell_id` — it is **not** the spawned-agent result tool.

## Asking the user structured questions

Interactive Codex sessions expose **`request_user_input`**. Use it for onboarding and brainstorming multiple-choice questions so the user can pick instead of typing.

> There is **no `ask_user_question` tool** — that name does not exist in Codex. If a skill's prose says `AskUserQuestion`, the Codex equivalent is `request_user_input`.

**`codex exec` / non-interactive runs do not support it** — a scripted run must never hang waiting for input, and the tool is stripped in exec mode. When it is absent, fall back to a numbered prose list; if no human can reply, proceed with the documented default for each question.

**`request_user_input` is a consent tool, never a synchronization primitive.** Do not call it to "wait for" a dispatched subagent or to ask "continue?" between phases — use `wait_agent` to await a subagent. The only legitimate calls are the flow's explicit, named gates: the Branch Guard, the QA gate, the auto-commit suggestion, and the execution-mode election.

## Skills

Codex supports Agent Skills natively. `SKILL.md` files (requiring `name` and `description`) are discovered from `.agents/skills` scanned from the working directory up to the repo root, from `$HOME/.agents/skills` for user-level skills, and from `/etc/codex/skills` for admin-level ones.

Discovery uses progressive disclosure: names, descriptions and paths load first, and the full `SKILL.md` is read only when a skill is selected. Invoke one explicitly with the `/skills` command or by mentioning `$skill-name` in the prompt; Codex may also select one implicitly by description match. Individual skills can be disabled via `[[skills.config]]` entries in `~/.codex/config.toml` without deleting them.

For the superpowers pipeline this means `super.using-superpowers` loads and routes exactly as it does elsewhere — provided the skill directory is on one of those discovery paths.

## Checking files in hidden directories

File-search tools may not return files inside hidden directories (names starting with `.`). Do not use search or glob-style tools to detect `.superpowers/preferences.yml`.

**Preferred — the deterministic script:**

```bash
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

**Fallback — read the file directly with your native read tool:**

```
read_file(".superpowers/preferences.yml")
```

A successful read means the file exists. A "file not found" or "path does not exist" error means it is absent.

## Environment detection

Skills that create worktrees or finish branches should detect their environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR from a sandbox)

See `super.using-git-worktrees` Step 0 and `super.finishing-a-development-branch` Step 1 for how each skill uses these signals.

## No native review skills

Codex has no equivalent of Claude Code's `/simplify` and `/code-review`, or Copilot CLI's `review` and Rubber Duck Agent. The `claude_code:` and `copilot:` sections of `.superpowers/preferences.yml` are silently ignored, and `derive-session-state.cjs --platform codex` resolves every native-review variable to its safe default. **During onboarding, skip those platform-specific steps entirely** — do not ask about them, do not mention them.

The per-task spec compliance review and code quality review gates always run, on every platform, as do the default final code reviewer and the always-on `super.independent-verification` gate.

## Codex App finishing

When the sandbox blocks branch/push operations (detached HEAD in an externally managed worktree), the agent commits all work and informs the user to use the App's native controls:

- **"Create branch"** — names the branch, then commit/push/PR via App UI
- **"Hand off to local"** — transfers work to the user's local checkout

The agent can still run tests, stage files, and output suggested branch names, commit messages, and PR descriptions for the user to copy.
