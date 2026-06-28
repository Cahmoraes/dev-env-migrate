# Codex Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your platform equivalent:

| Skill references | Codex equivalent |
|-----------------|------------------|
| `Task` tool (dispatch subagent) | `spawn_agent` (see [Subagent dispatch requires multi-agent support](#subagent-dispatch-requires-multi-agent-support)) |
| Multiple `Task` calls (parallel) | Multiple `spawn_agent` calls |
| Task returns result | `wait_agent` |
| Task completes automatically | `close_agent` to free slot |
| `TodoWrite` (task tracking) | `update_plan` |
| `AskUserQuestion` (structured user question) | `ask_user_question` / `request_user_input` — interactive sessions only; **both are removed in `codex exec`/non-interactive runs**, so fall back to a numbered prose list there (see note below) |
| `Skill` tool (invoke a skill) | Skills load natively — just follow the instructions |
| Research (`super.deep-research`) | Fan-out via `spawn_agent` + `wait_agent` with native web access |
| `Read`, `Write`, `Edit` (files) | Use your native file tools |

## Asking the user structured questions

Interactive Codex sessions expose `ask_user_question` (a tabbed multiple-choice
prompt) and `request_user_input`. Use them for onboarding and brainstorming
multiple-choice questions so the user can pick instead of typing.

**`codex exec` / non-interactive runs remove both tools** — a scripted run must
never hang waiting for input. When they are absent, fall back to a numbered prose
list; if no human can reply, proceed with the documented default for each question.

## Checking Files in Hidden Directories

File-search tools may not return files inside hidden directories (directories whose names start with `.`). Do not use search or glob-style tools to detect `.superpowers/preferences.yml`.

**Always read the file directly using your native Read tool:**

```
Read(".superpowers/preferences.yml")
```

A successful read means the file exists. A "file not found" or "path does not exist" error means it is absent.
| `Bash` (run commands) | Use your native shell tools |

## Subagent dispatch requires multi-agent support

Add to your Codex config (`~/.codex/config.toml`):

```toml
[features]
multi_agent = true
```

This enables `spawn_agent`, `wait_agent`, and `close_agent` for skills like `super.dispatching-parallel-agents` and `super.subagent-driven-development`.

Legacy note: Codex builds before `rust-v0.115.0` exposed spawned-agent
waiting as `wait`. Current Codex uses `wait_agent` for spawned agents. The
`wait` name now belongs to code-mode `exec/wait`, which resumes a yielded exec
cell by `cell_id`; it is not the spawned-agent result tool.

## Environment Detection

Skills that create worktrees or finish branches should detect their
environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR from sandbox)

See `super.using-git-worktrees` Step 0 and `super.finishing-a-development-branch`
Step 1 for how each skill uses these signals.

## Codex App Finishing

When the sandbox blocks branch/push operations (detached HEAD in an
externally managed worktree), the agent commits all work and informs
the user to use the App's native controls:

- **"Create branch"** — names the branch, then commit/push/PR via App UI
- **"Hand off to local"** — transfers work to the user's local checkout

The agent can still run tests, stage files, and output suggested branch
names, commit messages, and PR descriptions for the user to copy.
