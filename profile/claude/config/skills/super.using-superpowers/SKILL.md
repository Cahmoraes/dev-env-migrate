---
name: super.using-superpowers
description: Entry point for every session — loads the workflow preferences and routes the request (feature, bug, research, plan, execution, review) to the right superpowers skill.
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<ACTIVATION>
Execute this skill now, this same turn, even when the request is empty. Your **first act is the bootstrap call, never printed text** (it returns the repo state — no `git status`/`ls` before it). Then Session Summary → Opening Triage. **Nothing in this file is a value you may report:** the session variables exist only in the `derive-session-state.cjs` output and the two printed blocks only in the `cat` of `references/session-start.md`; a block written from memory is wrong every time. No greeting: with no request on the table, the numbered triage question **is** your response.
</ACTIVATION>

Invoke the skill that covers a request before acting on it; when unsure whether one applies, invoke it and let its entry guards decide.

## Superpowers Finite State Machine

Flows and states: `assets/state-diagram.mmd`.

## Workflow Preferences

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

**Silent bootstrap — at most one short line: the opening sentence of the triage block.** Never narrate the commands. With nothing to do, that line, in the session language, is e.g. `Preferências carregadas de .superpowers/preferences.yml (0 para ver ou alterar).`; keep internal jargon (`preferencesFound`, `sessionState`, `session_*`) out of it. Say more only where a branch must ask the user something (missing preferences → onboarding) or when onboarding ran.

**Deterministic read:** resolve the platform first ("Platform Adaptation"), then run the whole bootstrap in **one call**:
```bash
B=<super.using-superpowers-base-dir>; R="$(git rev-parse --show-toplevel)"
node $B/scripts/derive-session-state.cjs --platform <resolved-platform> --repo-root "$R"
cat $B/references/session-start.md
```
**One call, two outputs:** the session state and the reference from which the opening paragraph and the triage are rendered verbatim. **One call, not two** — `read-preferences.cjs` is the loader underneath, used only where the raw `preferences` object is the point (the option-0 wizard). If the script cannot run, read `.superpowers/preferences.yml` with the file-reading tool, never `glob` (it misses hidden dirs).

It emits JSON `{platform, preferencesFound, malformed, preferencesPath, sessionState, corporateArtifacts, projectProfile}`. **Check `preferencesFound` first:** `sessionState` is always populated (DEFAULTS when the file is absent), so populated values do **not** mean the file exists, and a defaults object is not consent.

- **`preferencesFound: true`** → keep the session variables in context; inject the relevant ones into subagent prompts.
- **`preferencesFound: false`** → run the onboarding wizard in `references/onboarding-preferences.md` now (it writes the file via `write-preferences.cjs`), then re-run the call — the one branch this entry point never skips (`read-preferences.cjs` reports the same case as `found: false`).
- **`preferencesFound: true` but `projectProfile.declared: false`** → run only the wizard's "Project profile only" step, this turn, before any triage, then re-run the call. An empty `stack` with `declared: true` is the user's answer ("not decided yet"); with `declared: false` it is a question nobody asked yet.
- Then continue to the opening triage without stopping at the onboarding confirmation.

`projectProfile` (`stack`, `manifest`) says **what** the repo is, never how it runs: test, setup and format commands are not preferences — the repo's instructions file (`AGENTS.md`/`CLAUDE.md`) and the manifest carry them. Pass `stack` and `manifest` into every implementer/QA dispatch.

### Corporate Artifacts

`corporateArtifacts` (`declared`, `enabled`, `declaredButDisabled`, `configPath`, `count`) is a disk probe, valid regardless of `preferencesFound`. `session_has_corporate_artifacts: true` → read `.superpowers/corporate-artifacts.yml` with the file-reading tool and pass its paths/URLs to `super.brainstorming` / `super.generating-prd` / `super.writing-plans`. `declaredButDisabled: true` → **do not load it**; the Session Summary's corporate row is where you warn once, so do not also ask before the triage — enable it only when the user asks or through triage option 0. Full rules: `references/onboarding-preferences.md`, "Corporate Artifacts".

## Instruction Priority

The repo's instructions file (CLAUDE.md, AGENTS.md, GEMINI.md) and direct requests take precedence over skills, which override default behavior. A request says what, not how: "add X" does not mean skip the workflow; skip a skill's workflow only when the user says so.

## Platform Adaptation

Skills use Claude Code tool names. Resolve the platform once per session from the harness you are running in — never from where the skill files are installed: exactly one of `claude-code`, `copilot`, `codex`, `gemini`, `opencode`, anything else `other`. That value is the `--platform` of the bootstrap and gates the platform-specific onboarding steps (skipped silently on `other`). Equivalents per harness: `references/copilot-tools.md`, `references/codex-tools.md`, `references/gemini-tools.md`, `references/opencode-tools.md`.

## Session State & Gates

### Session State

The session variables are the `derive-session-state.cjs` output — the single source of truth for the preference→`session_*` mapping and for platform gating (the Claude Code variables resolve `false` off Claude Code, `session_copilot_review_final_enabled` resolves `false` off Copilot CLI). Resumed without the values? Re-run that same command. Tracked in context only, never written back to `preferences.yml`: the native-review vars (`session_code_review_final_enabled`, `session_code_review_effort`, `session_copilot_review_final_enabled`) and `session_model_tier_{cheap,standard,capable}`. Variable table: `references/session-state-and-gates.md`, "Session State variables".

### Native Review Skills

Opt-in at onboarding, off by default, additive: the spec-compliance and code-quality gates always run regardless, and the default final reviewer always runs. Vars: `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) on Claude Code; `session_copilot_review_final_enabled` on Copilot CLI. Flag `false` or platform mismatch → skip that pass. No per-task native review — it would overlap the gates. Matrix: `references/session-state-and-gates.md`, "Native Review Skills".

# Using Skills

## The Rule

Flow: user message → bootstrap → onboarding if needed → the opening question only for a greeting or an ambiguous request, else route directly → invoke the skill → follow it (if it has a checklist, track one item per step **with a task tool already in the toolset**) → respond.

**Process skill first, domain skill inside it.** When a process skill (brainstorming, debugging, planning, execution) and a domain skill (stack, component, design system) both match one request, invoke the process skill first and let it carry the domain one — a task file names its domain skills under `### Skills a invocar`. Announce each invocation in one line, in the user's language: "Using <skill> to <purpose>".

### Tool discovery is charged against the context window

Where tools are deferred, every discovery call re-runs the whole prompt as another internal pass that counts toward auto-compaction. **At most ONE discovery call per turn — never batch them.** A tool you already called this session is still loaded — never search for it again; the one exception is **after a compaction**, when the toolset really is empty again. There is no way to list the toolset: resolve rather than survey — one anchored alternation naming what you need next, the shell included (`^(Shell|Reader)$`), then work through the shell. Step tracking costs zero discovery calls. A CLI is not a tool — `node`, `python3`, `git` and the skills' own `scripts/*.cjs` run through the shell.

## Red Flags

Exploring, "just checking a file" or acting from a remembered version of a skill before routing skips the pipeline: the triage runs first and reads the current skill. The harness's native plan mode is not used for feature, design, migration or refactor requests while superpowers is routing: the pipeline is `super.brainstorming` → `super.generating-prd` → `super.writing-plans` (brainstorming goes straight to writing-plans when the PRD is skipped).

# Session Start

Both blocks below are rendered from `./references/session-start.md`, `cat`ed by the bootstrap call on the first turn.

## Session Summary

Once preferences are loaded and right before the opening triage, print — exactly once — the opening sentence (the preferences file and the shortcut `0` that shows and edits it) plus one `Atenção:` line per exception; this section is the sole owner of the print. The full listing lives in the preferences view of option 0. **This line opens the turn — nothing precedes it.** Wording and the exception table: `./references/session-start.md`.

## Opening Triage

A request that already maps to a single superpowers flow is routed directly; a greeting, a generic help request or an ambiguous task gets the triage, in the user's language, on its own turn — copy the wording, grouping and order out of the bootstrap `cat` output, which also holds the routing table, "Update Preferences (option 0)" and "Execution Mode Election (option 5)".

**Present the triage as the numbered prose list — not via the structured-question tool** (token economy: it allows at most 4 options and costs roughly twice the list). Smaller fixed-answer questions (onboarding steps, clarifications with ≤4 options) *do* use the structured-question tool — `references/onboarding-preferences.md`, "Presenting the questions".

**Scope sizing (option 2) — three paths.** Spike, bounded or architectural, announced before the first question or step; the bounded announcement and the user pauses per path: `./references/session-start.md`.
