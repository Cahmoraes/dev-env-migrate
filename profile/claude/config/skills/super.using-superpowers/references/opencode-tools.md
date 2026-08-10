# opencode Tool Mapping

Skills use Claude Code tool names. Use your platform equivalent:

| Skill references | opencode equivalent |
|-----------------|---------------------|
| `Read` (file reading) | `read` (`filePath`\*, `offset`, `limit`) |
| `Write` (file creation) | `write` (`filePath`, `content`) — see "Editing depends on the model" |
| `Edit` (file editing) | `edit` (`filePath`, `oldString`, `newString`, `replaceAll`) — see "Editing depends on the model" |
| `Bash` (run commands) | `bash` (`command`\*, `description`\*, `timeout`, `workdir`) |
| file-content search | `grep` (`pattern`, `path`, `include`) |
| file-name search | `glob` (`pattern`, `path`) ⚠️ see limitation below |
| `LSP` / Serena `find_symbol` (structural symbol lookup) | `grep` is the default for named code symbols too (anchor the query to a class/file name) — measured cheaper and more reliable than chasing symbol lookup in this pipeline. If a language-server/symbol tool (e.g. Serena MCP `find_symbol`) is already loaded, one opportunistic attempt is fine; abandon it after that and use `grep` if it doesn't resolve immediately. |
| `Skill` tool (invoke a skill) | `skill` (`name`) |
| `AskUserQuestion` (structured user question) | `question` (`questions[]`) — see "Asking the user structured questions" |
| session task list (task tracking, optional) | `todowrite` (`todos[]`) |
| `WebFetch` | `webfetch` (`url`, `format`, `timeout`) |
| `WebSearch` | `websearch` — **not always present**, see "Tool availability depends on the model" |
| `Task` tool (dispatch subagent) | `task` (`description`, `prompt`, `subagent_type`) — **`subagent_type` carries the model tier**, see "Model tiers become agents" |
| Multiple `Task` calls (parallel) | Multiple `task` calls issued in the same turn |
| Task returns result | The `task` call returns the subagent's output directly — it blocks, see "Dispatching subagents" |
| Research (`super.deep-research`) | Fan-out via `task` with `subagent_type: "general"`, using `webfetch` (+ `websearch` when the model exposes it) |
| `EnterPlanMode` / `ExitPlanMode` | The built-in `plan` agent — **do not switch to it**, see "Do not use the native plan agent" |

There is **no `list` tool**. List a directory with `glob` (`pattern: "*"`) or `bash` (`ls`).

`*` marks a **required** parameter. Two of them are easy to drop by accident and each costs a wasted turn: `bash` requires `description` (not just `command`), and `read` requires `filePath`. opencode rejects the call with `SchemaError(Missing key at [...])` and lets you retry, so a miss is recoverable — but on a long pipeline those retries add up.

## Model capability floor

The superpowers pipeline is a long multi-step flow: it loads a routing skill, runs deterministic scripts, dispatches subagents, and holds state across many turns. Measured on 1.15.3, small free-tier models handle a **micro** task (single-file change, one dispatch) but stall partway through a **full feature pipeline** — emitting malformed tool calls that omit required parameters, then ending the turn with no text and no tool call. The machinery is not what fails there; the model's ability to sustain the flow is.

Pick a model for the orchestrator accordingly, and treat the `model_tiers` floor as a real constraint rather than a formality: a tier pointed at a model that cannot reliably emit well-formed tool calls will not implement a task, it will burn retries.

## Model tiers become agents (`task` has no `model` argument)

This is the one place where opencode genuinely differs from every other supported platform, and it changes how a core superpowers invariant is satisfied.

The execution skills require that **every dispatch names its model explicitly** and that a subagent **never inherits the controller's model** — a task whose plan header says `**Tier:** cheap` must run on `model_tiers.cheap`, not on whatever the orchestrator happens to be running. On Claude Code and Copilot CLI the dispatch call itself carries a `model:` field, so the tier is resolved at dispatch time.

**opencode's `task` tool accepts only `description`, `prompt`, `subagent_type` (required), plus optional `task_id` and `command`. There is no `model` parameter.** In opencode a subagent's model is a property of the **agent definition**, resolved from its `model:` frontmatter (`Agent.model = { providerID, modelID }`).

**So the tier is carried by `subagent_type`.** One agent per tier must exist *before* the first dispatch, and the agent whose tier matches the task's written `**Tier:**` is the one you dispatch to.

**Generate them — do not hand-write them.** A deterministic script reads `model_tiers` from `.superpowers/preferences.yml` and emits the whole roster:

```bash
# Dry run first: reports the plan, writes nothing.
node <super.using-superpowers-base-dir>/scripts/generate-opencode-agents.cjs \
  --repo-root "$(git rev-parse --show-toplevel)"

# Then materialize into <repo-root>/.opencode/agent/
node <super.using-superpowers-base-dir>/scripts/generate-opencode-agents.cjs \
  --repo-root "$(git rev-parse --show-toplevel)" --write
```

It emits JSON on stdout and creates six agents: `sp-implementer-cheap` / `-standard` / `-capable` (write access), `sp-reviewer-standard` / `-capable` (read-only — the review floor is `standard`, so there is deliberately no cheap reviewer), and `sp-explorer` (read-only, floors at `cheap`, for discovery/research/sync-workers). Existing files are reported as `exists` and never clobbered without `--force`, so a hand-tuned agent survives a re-run. Run it once per repo, and again after `model_tiers` changes.

If the script is unavailable, the definitions are markdown files with YAML frontmatter in `.opencode/agent/<name>.md` (project) or `~/.config/opencode/agent/<name>.md` (global):

```markdown
---
description: Superpowers implementer, cheap tier. Dispatch target for tasks whose plan header says Tier cheap.
mode: subagent
model: github-copilot/gemini-3.5-flash
temperature: 0.1
---
You are the implementer for a superpowers task. Follow the task file exactly.
```

`model:` is `providerID/modelID` — the same identifiers `opencode models` prints.

**The tier rules are unchanged, only their mechanism is.** The written `**Tier:**` is still binding, escalation is still the only path to a higher tier and still needs a reason recorded in the thread, and the `validate-dispatch.cjs` pre-flight still runs before every wave. When building the manifest for that gate, record each agent's `tier` and set its `model` to the model configured on the agent you dispatched to — that keeps the deterministic backstop meaningful instead of blank.

**When `model_tiers` is empty/`auto`**, the generated agents carry no `model:` line at all and opencode picks the model itself — exactly what the `auto` contract says. Dispatching to the built-in `general` agent is equally valid there.

### Built-in agents

| Agent | Mode | Use for |
|-------|------|---------|
| `general` | subagent | General-purpose dispatch: implementers, research investigators, QA subagents, sync-workers. The default `subagent_type` when no tier agent applies. |
| `explore` | subagent | Fast read-only codebase exploration (locating files/symbols). Good fit for the discovery fan-out in `super.brainstorming` / `super.writing-plans` research. |
| `build` | primary | The default interactive agent — the orchestrator itself. Never a `subagent_type`. |
| `plan` | primary | Native plan mode. **Never** dispatch to it or switch to it — see below. |

## Read-only subagents via `permission`

The superpowers toolset rule — reviewers, exploration, research and sync-workers get **read-only** access (no `edit`/`write`/`task`), implementers keep write access — is enforced in opencode through the agent's `permission` block. Each key is `allow`, `ask`, or `deny`. **The generated roster above already applies this split**; this section is what to reproduce if you define an agent by hand:

```markdown
---
description: Read-only reviewer. Reports findings; never edits.
mode: subagent
model: github-copilot/claude-sonnet-4.6
permission:
  read: allow
  grep: allow
  glob: allow
  bash: allow
  edit: deny
  write: deny
  task: deny
  question: deny
---
```

Permission keys: `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `external_directory`, `todowrite`, `question`, `webfetch`, `websearch`, `lsp`, `skill`, `doom_loop`.

Two notes that matter for the flow:

- **`question: deny` on every subagent.** A dispatched subagent must never prompt the user; the named consent gates belong to the orchestrator alone. The built-in `general` agent already ships with `question` disabled.
- **`external_directory`** governs reads outside the project root. The superpowers skills live in an external directory (a `~/.claude/skills/...` symlink target or equivalent), so an agent that must read skill references needs that path allowed, or the read will stop for approval mid-flow.

An older `tools: { <name>: bool }` map also exists on agent definitions but is **deprecated** in favor of `permission`. Prefer `permission` in anything you write today.

## Dispatching subagents

**opencode's `task` blocks and returns the subagent's output directly.** There is no background/async dispatch mode and no separate "read result" tool, so the skills' instruction — *"After dispatching, await its result — never poll"* — is satisfied natively: issue the `task` call and read its return value. Never insert a `bash sleep`, a wakeup loop, or a `question` call to "wait for" a subagent.

**Parallel fan-out is issuing several `task` calls in the same turn.** For a wave in `super.parallel-subagent-development` / `super.parallel-subagent-in-tree`, the research fan-out, or the memory re-sync sync-workers, emit all of the independent `task` calls together in one turn; they run concurrently and you receive every result. Keep dependent tasks sequential, but never serialize independent dispatches just to get a simpler history.

**`task_id` resumes a subagent session.** Passing a prior `task_id` continues that same subagent instead of starting a fresh one. Use it for the **fix → re-review loop**, where the reviewer benefits from remembering its own earlier findings. Do **not** use it where the flow requires a *fresh* agent: the `super.independent-verification` Verifier must be blind (author ≠ verifier), so it always gets a new dispatch, never a resumed one.

## Asking the user structured questions

`question` takes `questions[]`, each with `question`, `header` (max 30 chars), `options[]` of `{ label, description }`, and optional `multiple: true` for multi-select. It maps cleanly onto `AskUserQuestion`, so the onboarding wizard, the brainstorming multiple-choice questions, and the execution-mode election all render natively.

Two behaviors to respect:

- **Never add an "Other" / catch-all option.** opencode appends a "Type your own answer" choice automatically.
- **Answers come back as arrays of labels**, even for single-select.

**`opencode run` (non-interactive) removes `question` entirely** — a scripted run must never hang waiting for input, so the tool is simply absent from the session's toolset there. Verified on 1.15.3: in a `run` session the model holds `bash, edit, glob, grep, read, skill, task, todowrite, webfetch, websearch, write` and no `question`. When it is absent, fall back to a numbered prose list; if no human can reply, proceed with the documented default for each question. Do not report a gate as blocked because `question` is missing — this is the same rule as `codex exec`.

**`question` is a consent tool, never a synchronization primitive.** Do not call it to pause between a dispatch and reading its result, or to ask "continue?" while work is in flight — `task` already blocks. The only legitimate `question` calls are the flow's explicit, named gates: the **Branch Guard** (current branch is the repo default), the **QA gate** (a PRD exists *and* `workflow.qa_gate` is enabled), the **auto-commit suggestion** (`workflow.auto_commit: false`), and the **execution-mode election**. Everything between them — dispatch, review, fix loop, verification — runs without a single `question`.

**The same rule governs phase handoffs.** A `{ continue: boolean }` re-confirmation at a phase boundary ("continuar com o plano?", "proceed to planning?") is the identical anti-pattern. At the **brainstorming → `super.writing-plans`** handoff the PRD suggestion *is* the single go/no-go; once it is answered, invoke the next skill directly rather than re-asking a decision the user just made.

## ⚠️ Known limitation: `glob` and hidden directories

**`glob` does not return files inside hidden directories** (names starting with `.`): `.superpowers/`, `.github/`, any dotdir. opencode's glob runs ripgrep *without* `--hidden`, so those paths are invisible to it. Never use `glob` to detect files there.

`grep` is **not** affected — it runs ripgrep with `--hidden` unconditionally and does search hidden paths. Do not generalize the glob limitation to grep, and do not rely on grep as the detection route either; use the script below.

**Preferred — the deterministic script:**

```bash
# Your skill context header shows the base directory — use it to build the absolute path:
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

It detects the root via `git rev-parse --show-toplevel`, handles nested YAML, returns defaults for missing keys, and marks malformed files. See `read-preferences.cjs --help` for the JSON schema.

**Fallback — use `read` directly on the path (NOT `glob`):**

```
read(filePath: "/path/to/repo/.superpowers/preferences.yml")
```

A successful read means the file exists; a "file not found" error means it is absent. Or:

```bash
test -f .superpowers/preferences.yml && echo exists || echo not-found
```

Also note `glob` **truncates at 100 results** and says so in its output. Treat a truncated listing as incomplete — narrow the pattern or the `path` rather than concluding the extra files do not exist.

## Tool availability depends on the model, not just the platform

opencode resolves its toolset per **provider/model**, so the mapping table above is the common case rather than a guarantee. Verified differences on opencode 1.15.3:

| Model family | Editing tools | Web search |
|---|---|---|
| Anthropic-family (e.g. `github-copilot/claude-sonnet-4.6`) | `edit` + `write` | no `websearch` |
| OpenAI-family (e.g. `openai/gpt-5.5-pro`) | **`apply_patch`** (no `edit`, no `write`) | no `websearch` |
| opencode-hosted models | `edit` + `write` | `websearch` present |

Practical consequences:

- **Editing depends on the model.** Where a skill says `Edit`/`Write`, use `edit`/`write` if present; on a model that exposes `apply_patch` instead, express the same change as a patch. Do not report a task as blocked because `edit` is missing.
- **`websearch` may be absent.** When it is, satisfy `WebSearch` steps with `webfetch` against a search-engine URL, or an MCP search tool if the user has one configured. `super.deep-research` still runs — its fan-out is `task` + `webfetch`.
- **Check, don't assume.** The tools you actually hold are the ones in your own system prompt for the current session.

## Do not use the native plan agent

opencode ships a `plan` primary agent that disallows edit tools. **The superpowers rule against native plan mode applies to it**: for feature, design, migration and refactor work, stay in the main session and use the internal pipeline — `super.brainstorming` → `super.generating-prd` → `super.writing-plans`. Do not switch the session to `plan`, and never dispatch to it as a `subagent_type`.

## Skills

opencode discovers `SKILL.md` skills natively and exposes them through the `skill` tool (`name` parameter). Invoke a skill with `skill(name: "super.using-superpowers")` — when you invoke it, its content is loaded for you; never `read` a skill file to "load" it.

Confirm what the session sees with `opencode debug skill` (lists all discovered skills). If the `super.*` skills are missing, the skill directories are not on opencode's discovery path — a deployment problem, not a flow problem.

## No native review skills

opencode has **no** equivalent of Claude Code's `/simplify` and `/code-review`, or Copilot CLI's `review` and Rubber Duck Agent. The `claude_code:` and `copilot:` sections of `.superpowers/preferences.yml` are **silently ignored** here, and `derive-session-state.cjs --platform opencode` resolves every native-review variable to its safe default.

**During onboarding, skip the "Copilot CLI: Additional Steps" and "Claude Code: Native Skills Additional Steps" sections entirely** — do not ask about them, do not mention them.

Nothing is lost from the review pipeline: **the per-task spec compliance review and code quality review gates always run, on every platform**, as do the default final code reviewer and the always-on `super.independent-verification` gate. Those native skills were only ever extra passes layered on top.

## Environment detection

Skills that create worktrees or finish branches should detect their environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR)

See `super.using-git-worktrees` Step 0 and `super.finishing-a-development-branch` Step 1 for how each skill uses these signals.

## Additional opencode tools

| Tool | Purpose |
|------|---------|
| `apply_patch` | Multi-hunk patch application (OpenAI-family models only; replaces `edit`/`write` there) |
| `invalid` | Internal error signal — never call it |
