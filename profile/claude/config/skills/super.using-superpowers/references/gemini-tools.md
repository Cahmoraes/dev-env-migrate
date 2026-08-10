# Gemini CLI Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your platform equivalent:

| Skill references | Gemini CLI equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `read_file` |
| `Read` on many files at once | `read_many_files` |
| `Write` (file creation) | `write_file` |
| `Edit` (file editing) | `replace` |
| `Bash` (run commands) | `run_shell_command` |
| file-content search | `grep_search` (legacy alias: `search_file_content`) |
| file-name search | `glob` ⚠️ see limitation below |
| List a directory | `list_directory` |
| `LSP` / Serena `find_symbol` (structural symbol lookup) | `grep_search` is the default for named code symbols too (anchor the query to a class/file name) — measured cheaper and more reliable than chasing symbol lookup in this pipeline. If a language-server/symbol tool (e.g. Serena MCP `find_symbol`) is already loaded, one opportunistic attempt is fine; abandon it after that and use `grep_search` if it doesn't resolve immediately. |
| session task list (task tracking, optional) | `write_todos` |
| `Skill` tool (invoke a skill) | `activate_skill` |
| `AskUserQuestion` (structured user question) | `ask_user` |
| `WebSearch` | `google_web_search` |
| `WebFetch` | `web_fetch` |
| `Task` tool (dispatch subagent) | The subagent's own name as a tool, or `@agent-name` in the prompt — see "Subagent support" |
| Research (`super.deep-research`) | Fan-out via `generalist` with `google_web_search` + `web_fetch` |
| `EnterPlanMode` / `ExitPlanMode` | `enter_plan_mode` / `exit_plan_mode` — **do not use them** for feature/design/migration/refactor work; stay in the internal pipeline (`super.brainstorming` → `super.generating-prd` → `super.writing-plans`). |

## ⚠️ Checking files in hidden directories

The `glob` tool may not return files inside hidden directories (directories whose names start with `.`). Do not rely on it to detect `.superpowers/preferences.yml`.

**Preferred — the deterministic script:**

```bash
node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

**Fallback — use `read_file` directly on the path (NOT `glob`):**

```
read_file(".superpowers/preferences.yml")
```

A successful read means the file exists. A "file not found" error means it is absent.

## Subagent support

Gemini CLI supports subagents natively. **Each subagent is exposed to the main agent as a tool with the same name as the agent** — dispatching is calling that tool with your prompt. You can also force a specific subagent by starting the prompt with `@agent-name`, which bypasses the main agent's own routing.

### Built-in agents

| Agent | Use for |
|-------|---------|
| `generalist` | General-purpose dispatch: implementers, reviewers, QA subagents, sync-workers. Inherits the main agent's tool access. The default target when a skill says "dispatch a subagent". |
| `codebase_investigator` | Read-only codebase research — a good fit for the discovery fan-out in `super.brainstorming` / `super.writing-plans`. |
| `cli_help` | Questions about Gemini CLI itself. Not used by the superpowers flow. |
| `browser_agent` | Browser automation (requires Chrome 144+). Not used by the superpowers flow. |

> There is **no built-in `code-reviewer` agent.** Where a skill names a reviewer agent type, use `generalist` with the filled review prompt, or a custom agent you define (below).

| Skill instruction | Gemini CLI equivalent |
|-------------------|----------------------|
| `Task tool (implementer)` | `generalist` with the filled `agents/implementer.md` template |
| `Task tool (spec-reviewer)` | `generalist` with the filled `agents/spec-reviewer.md` template |
| `Task tool (code-reviewer)` | `generalist` with the filled review prompt |
| `Task tool (code-quality-reviewer)` | `generalist` with the filled `agents/code-quality-reviewer.md` template |
| `Task tool (general-purpose)` with inline prompt | `generalist` with your inline prompt |

### Prompt filling

Skills provide prompt templates with placeholders like `{WHAT_WAS_IMPLEMENTED}` or `[FULL TEXT of task]`. Fill all placeholders and pass the complete prompt as the message. The prompt template itself contains the agent's role, review criteria, and expected output format — the subagent will follow it.

### Custom agents, model tiers, and read-only toolsets

Custom agents are markdown files with YAML frontmatter in `.gemini/agents/<name>.md`:

```markdown
---
name: sp-implementer-cheap
description: Superpowers implementer, cheap tier. Dispatch target for tasks whose plan header says Tier cheap.
kind: local
model: gemini-3-flash-preview
temperature: 0.2
tools:
  - read_file
  - write_file
  - replace
  - run_shell_command
  - grep_search
  - glob
max_turns: 30
timeout_mins: 10
---
You are the implementer for a superpowers task. Follow the task file exactly.
```

Three fields carry superpowers invariants:

- **`model` defaults to `inherit`, meaning the subagent runs on the main session's model.** That is precisely the over-provisioning the execution skills forbid — a subagent must never inherit the controller's model. To honor the written `**Tier:**`, define one agent per tier (`sp-implementer-cheap` / `-standard` / `-capable`) with `model:` set explicitly from `model_tiers.<tier>` in `.superpowers/preferences.yml`, and dispatch to the agent matching the task's tier. Only when `model_tiers` is empty/`auto` is inheriting acceptable. Record the resolved model in the `validate-dispatch.cjs` manifest so the deterministic gate stays meaningful.
- **`tools` implements the read-only rule.** Omitting it inherits *all* parent tools. Reviewers, research and sync-workers must list only read tools (`read_file`, `read_many_files`, `grep_search`, `glob`, `list_directory`, `run_shell_command`) — no `write_file`, no `replace`. Wildcards `*`, `mcp_*` and `mcp_<server>_*` are supported.
- **`max_turns` (default 30) and `timeout_mins` (default 10) bound the dispatch.** A long implementer task can hit either and return truncated. If a subagent comes back incomplete, treat it as a budget stop — raise the limits on the agent definition rather than accepting a partial result as done.

### Parallel dispatch

Because subagents are ordinary tools, a fan-out is several subagent tool calls requested together in the same turn — a wave in `super.parallel-subagent-development` / `super.parallel-subagent-in-tree`, the research investigators, or the memory re-sync sync-workers. Keep dependent tasks sequential, but do not serialize independent subagent tasks just to preserve a simpler history.

### `ask_user` is a consent tool, never a wait primitive

Do not call `ask_user` to "wait for" a dispatched subagent, or to ask "continue?" between phases. The only legitimate calls are the flow's explicit, named gates: the Branch Guard, the QA gate, the auto-commit suggestion, and the execution-mode election. A `{ continue: boolean }` prompt at a phase boundary — including the brainstorming → `super.writing-plans` handoff, where the PRD suggestion is already the single go/no-go — is the anti-pattern this note prevents.

## No native review skills

Gemini CLI has no equivalent of Claude Code's `/simplify` and `/code-review`, or Copilot CLI's `review` and Rubber Duck Agent. The `claude_code:` and `copilot:` sections of `.superpowers/preferences.yml` are silently ignored, and `derive-session-state.cjs --platform gemini` resolves every native-review variable to its safe default. **During onboarding, skip those platform-specific steps entirely** — do not ask about them, do not mention them.

The per-task spec compliance review and code quality review gates always run, on every platform, as do the default final code reviewer and the always-on `super.independent-verification` gate.

## Additional Gemini CLI tools

These tools are available in Gemini CLI but have no Claude Code equivalent:

| Tool | Purpose |
|------|---------|
| `save_memory` | Persist facts to GEMINI.md across sessions |
| `tracker_create_task`, `tracker_update_task`, `tracker_get_task`, `tracker_list_tasks`, `tracker_add_dependency`, `tracker_visualize` | Rich task management beyond `write_todos` |
| `list_mcp_resources`, `read_mcp_resource` | Access MCP server resources |
| `get_internal_docs` | Look up Gemini CLI documentation |
