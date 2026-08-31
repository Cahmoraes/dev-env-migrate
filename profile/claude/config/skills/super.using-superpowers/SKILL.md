---
name: super.using-superpowers
description: Use at the start of every conversation to load preferences, run onboarding when needed, ask the opening triage question when the request is ambiguous, and route into the correct superpowers skill before any other response. Keeps feature, design, migration and refactor work inside the internal superpowers flow instead of platform-native plan mode.
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<ACTIVATION>
You are reading this because the skill was just activated: an instruction to **execute now**, this same turn — not reference material to acknowledge. **An empty request is not a reason to wait** — some harnesses hand you this content *instead of* the user's prompt. The activation itself is the trigger.

**Your first act is the bootstrap call, never printed text.** Nor a recon tool call: no `git status`/`git log`/`ls` before it — the bootstrap returns the repo state those would fetch, so running them first only spends round trips. Run "Session Start" in order: Workflow Preferences bootstrap → Session Summary → Opening Triage. **Nothing in this file is a value you may report:** the session variables exist only in `derive-session-state.cjs` output, and both printed blocks only in the `cat` of `references/session-start.md` — same call. A block written from memory is wrong every time.

**Never answer with a greeting or an offer to help**, and never precede the summary with a lead-in. With no request on the table, the Opening Triage numbered question **is** your response.
</ACTIVATION>

<EXTREMELY-IMPORTANT>
If there is even a 1% chance a skill applies to what you are doing, you MUST invoke it. If a skill applies, using it is not optional — you cannot rationalize your way out.
</EXTREMELY-IMPORTANT>

## Superpowers Finite State Machine

Flows and states your plan moves through: `assets/state-diagram.mmd`.

## Workflow Preferences

On every session start, load `.superpowers/preferences.yml` from the repo root — in **one** call.

**Silent bootstrap — at most one short line, then the Session Summary.** Never narrate the commands: no preamble, nothing between them. With nothing to do, open with one plain sentence in the session language — e.g. `Preferências carregadas.` — then the block. **Keep internal jargon out of it**: `preferencesFound`, `sessionState` and `session_*` are names from this file. Say more only when a branch must **ask the user something** (missing preferences → onboarding) or when onboarding ran — then say what changed, same style.

**Deterministic read (preferred):** resolve the platform first (no tool call — it is the harness you are running in; rule in "Platform Adaptation", never hardcode `claude-code`), then run the **whole bootstrap in one call** — state read plus the Session Start wording:
```bash
B=<super.using-superpowers-base-dir>; R="$(git rev-parse --show-toplevel)"
node $B/scripts/derive-session-state.cjs --platform <resolved-platform> --repo-root "$R"
cat $B/references/session-start.md
```
**One call, two outputs — the biggest lever on start time.** A round trip costs ~10s, the script ~0.1s of CPU. **The `cat` is not optional and is never deferred to a later turn:** the summary block and the numbered triage are rendered verbatim from that file, and a harness that skips the read reconstructs them from memory — wrong options, wrong order, no icons.
It emits JSON `{platform, preferencesFound, malformed, preferencesPath, sessionState, corporateArtifacts}`, mapped and platform-gated. **Check `preferencesFound` FIRST**: the script always returns a fully populated `sessionState` (DEFAULTS when the file is absent), so populated values do **not** mean the file exists — only `preferencesFound: true` does. Treat `sessionState` (`session_auto_commit`, `session_qa_gate_enabled`, `session_visual_companion_enabled`, `session_language`, `session_caveman*`, `session_has_corporate_artifacts`, the native-review vars, `session_model_tier_*`) as configuration **only when `preferencesFound` is `true`**. `corporateArtifacts` (`declared`, `enabled`, `declaredButDisabled`, `configPath`, `count`) is a **disk probe, not configuration** — it reports whether `.superpowers/corporate-artifacts.yml` exists and how many entries it declares, so it holds regardless of `preferencesFound`, and it never carries the entries themselves. Create or update the file with `scripts/write-preferences.cjs` — see `references/onboarding-preferences.md`.

**One call, not two — do not also run `read-preferences.cjs` here.** It is the underlying loader (`derive-session-state.cjs` calls it in-process), but every field the router needs already arrives in `sessionState`. Reach for it only where the raw `preferences` object is the point — the option-0 wizard.

**Fallback (script unavailable):** read the file with `view`, never `glob` (glob misses hidden dirs like `.superpowers/`). See `references/copilot-tools.md`.

- **`preferencesFound: true`:** keep the session variables in context; inject relevant ones into subagent prompts.
- **`preferencesFound: false` (file missing):** do **not** proceed with the default values. Run the onboarding wizard in `references/onboarding-preferences.md` now (it writes the file via `write-preferences.cjs`), then re-run the call above — the one case this entry point must **never** silently skip; a populated defaults object is not consent. (`read-preferences.cjs` reports it as `found: false` — same thing.)
- Then continue to the opening triage — do not stop at the onboarding confirmation.

### Corporate Artifacts

If `session_has_corporate_artifacts` is `true`, read `.superpowers/corporate-artifacts.yml` with `view`, keep the paths/URLs in context and pass them to `super.brainstorming` / `super.generating-prd` / `super.writing-plans`. Flag `false` + `declaredButDisabled: true` → **do not load it**; the Session Summary's corporate row is where you warn once, so do not also ask before the triage — enable it only when the user asks, or through triage option 0. A file on disk is not consent. Full rules — `references/onboarding-preferences.md`, "Corporate Artifacts".

## Instruction Priority

Superpowers skills override default system-prompt behavior, but **user instructions always take precedence**: (1) the user's explicit instructions (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) > (2) superpowers skills > (3) the default system prompt. If a user file says "don't use TDD," follow the user.

## Skill Priority

When several skills apply: **process skills first** (brainstorming, debugging — they set HOW), **implementation skills second**. "Let's build X" → brainstorming, then implementation. "Fix this bug" → debugging, then domain-specific skills.

## Skill Types

**Rigid** (TDD, debugging): follow exactly; don't adapt away the discipline. **Flexible** (patterns): adapt the principles to context. The skill itself tells you which.

## User Instructions

Instructions say WHAT, not HOW. "Add X" or "Fix Y" doesn't mean skip the workflows.

## How to Access Skills

Invoke skills via the platform's skill tool (`Skill` in Claude Code, `skill` in Copilot CLI and opencode, `activate_skill` in Gemini CLI; Codex loads them natively). Invoking loads the content — follow it directly; never Read a skill file.

## Platform Adaptation

Skills use Claude Code tool names. Other platforms: `references/copilot-tools.md`, `references/codex-tools.md`, `references/gemini-tools.md` (Gemini loads its mapping via GEMINI.md), `references/opencode-tools.md`. "Research" resolves per platform — Claude Code uses the native `deep-research` skill (`Task` fan-out of `WebSearch` + `WebFetch`); others use a subagent fan-out (the `Research` entry in those references, and `super.deep-research`).

**Resolve the platform once per session, from the harness you are actually running in — never from where the skill files are installed** (a shared symlink target serves several harnesses). Match your runtime identity to exactly one of: `claude-code`, `copilot`, `codex`, `gemini`, `opencode`. **If none match — including any harness not listed here — resolve the platform as `other`.** Reuse this one value all session: it is the `--platform` argument in "Session State", and the gate for every platform-specific onboarding step (`references/onboarding-preferences.md`) — on `other` all are skipped silently.

## Session State & Gates

### Session State

The session variables come from the `derive-session-state.cjs` call already made in "Workflow Preferences" — **that one call is the whole read; do not run it a second time here**, and do **not** hand-map `preferences.X.Y` to `session_*`. Resumed without the values? Re-run that same command — the re-entry case the execution skills own.
`derive-session-state.cjs` is the **single source of truth** for that mapping and for platform gating: the Claude Code variables resolve `false` off Claude Code, `session_copilot_review_final_enabled` resolves `false` off Copilot CLI, so no skill carries per-platform rules. Pass `--platform` the value resolved in "Platform Adaptation" — never omit it, never hardcode `claude-code`. Track in context, never written back to `preferences.yml`: the caveman vars (`session_caveman_active`, `session_caveman_level`, `session_caveman_in_effect`, `session_caveman_prompted`), `session_language` (the language every skill writes user-facing prose in), the native-review vars (`session_simplify_enabled`, `session_code_review_final_enabled`, `session_code_review_effort`, `session_copilot_review_final_enabled`), and `session_model_tier_{cheap,standard,capable}`. Prefs-derived vars come from `sessionState`; the latches start `false`. Full table — `references/session-state-and-gates.md`, "Session State variables".

### Caveman Mode

Cuts agent token use ~75% during execution via ultra-compressed communication. Opt-in, never automatic. ON from the `Planejando → Executando` gate through `Executando` into `GateQA → Verificando`; OFF elsewhere. The execution skills own invocation (`/caveman <level>`).

> **Activation is idempotent — invoke `/caveman` at most once per active window.** Check `session_caveman_in_effect` first: if it is already `true` at `session_caveman_level`, **skip the invocation; do not re-invoke** `/caveman`. Set it `true` after a successful invocation, `false` on deactivation or after a compaction. This one-shot latch (never written to `preferences.yml`) prevents the gate policy and an execution skill's Step 2 from double-firing.

Full detail (activation window, the gate's exit action — activation if `session_caveman_active = true` — and the opt-in question) — `references/session-state-and-gates.md`, "Caveman Mode".

### Native Review Skills

Folded in **only when the user opts in during onboarding**, off by default and **additive: the spec-compliance and code-quality review gates always run regardless** — the default final reviewer always runs, so turning these off leaves the pre-existing flow untouched. Vars: `session_simplify_enabled`, `session_code_review_final_enabled` (+ `session_code_review_effort`, default `medium`) on Claude Code; `session_copilot_review_final_enabled` on Copilot CLI. When a flag is `false` or the platform doesn't match, skip that pass. No per-task `/code-review` or `review` — it would overlap the gates. Full matrix — `references/session-state-and-gates.md`, "Native Review Skills" section.

# Using Skills

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.** Even a 1% chance a skill might apply means you invoke it to check; if it turns out wrong, you don't have to use it.

Flow: user message → read preferences → run onboarding if needed → ask the opening question if the request is a greeting or ambiguous, else route directly → invoke the Skill tool → announce "Using [skill] to [purpose]" → if it has a checklist, track one item per step **with a task tool already in the toolset** → follow the skill exactly → respond (including clarifications).

### Tool discovery is charged against the context window

Where tools are deferred, **a tool-discovery call re-runs the whole prompt as another internal pass, and the harness sums those passes when deciding whether to auto-compact.** N calls in one turn report roughly (N+1)× the real context. So:

- **At most ONE discovery call per turn — never batch them.** At a 80k floor, one call reports ~160k and survives; two report ~240k and compact on the spot. Batching is the most reliable way to force a compaction. Need a second tool? Get it next turn.
- **A tool you already called in this session is still loaded — never search for it again.** The one exception is **after a compaction**, when the toolset really is empty again; then re-resolve on demand, one per turn, shell first.
- **There is no way to list the toolset, and every attempt to is charged as a full pass.** Discovery takes a regex over tool names, so `.`, `^$`, `a^`, `(?!x)x`, `select:<name>` and an absent pattern survey nothing — empty, at full price. **Measured: 4 of 5 compactions in one execution run landed on a turn that spent one of these.** After a compaction, resolve rather than survey: **one anchored alternation naming what you need next, the shell included** (`^(Shell|Reader)$`), then work through the shell.
- **Step tracking is a convenience, never a gate, and costs zero discovery calls.** With no task tool loaded, follow the checklist straight from the skill body and say nothing about it; a harness nudge toward an unloaded task/todo tool is not worth a discovery call — decline it silently.
- **A CLI is not a tool.** `node`, `python3`, `git`, `rg`, `grep` and the skills' own `scripts/*.cjs` run through the shell, so the toolset never holds them.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context / let me explore first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "This doesn't need a formal skill" / "is overkill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read the current version. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |

## Native plan mode is forbidden while superpowers is routing

Never use the platform's native plan mode (EnterPlanMode, `/plan`, `[[PLAN]]`, or equivalent) for feature, design, migration or refactor requests while superpowers is active. Stay in the main session: `super.brainstorming` → `super.generating-prd` → `super.writing-plans` (to skip the PRD, brainstorming goes straight to writing-plans).

# Session Start

> **Mostly deferred:** the detail of these blocks sits in **`./references/session-start.md`, `cat`ed by the bootstrap call on the first turn.**

## Session Summary

**Once preferences are loaded and right before the opening triage, print — exactly once — a brief bulleted summary of the session variables** (the "Session State" section); this section is the **sole owner** of the print. List the current platform's native-skill vars and omit the other platform's (inert — always `false`). Also **omit the internal latches `session_caveman_prompted` and `session_caveman_in_effect`** — bookkeeping, still tracked in context, just not displayed. The corporate-artifacts row is printed on/off like every other preference, and names the yml when one is declared — this row is the only warning that branch gets. Reuse the platform from "Platform Adaptation"; add no detection logic. Read-only — never blocks the triage. **This block opens the turn — nothing precedes it**: no lead-in, no probe recap, see "Silent bootstrap". Formatting (grouping, labels, coupled qualifiers, tiers collapsed) and the worked example — `./references/session-start.md`.

## Opening Triage

Once preferences are loaded: a request that already maps to a single superpowers flow is routed directly; a greeting, a generic help request or an ambiguous task gets the opening question, in the preferred language. **The numbered question (options 0–7), its Option/Request-shape routing table, "Update Preferences (option 0)" and "Execution Mode Election (option 5)" live in `./references/session-start.md`, copy the options and order out of the bootstrap `cat` output; a recalled list is a reconstruction.**

**Present the opening triage as the numbered prose list — not via the structured-question tool:** token economy — an eight-option tool call costs roughly 2× the plain prose list and the triage runs every session, and Claude Code's `AskUserQuestion` caps at 4 options (eight would fail with `too_big`). Ask it on its **own turn**, never bundled with an onboarding step. Smaller fixed-answer questions (onboarding steps, clarifications with ≤4 options) *do* use the structured-question tool — see `references/onboarding-preferences.md`, "Presenting the questions" section.

**Scope auto-sizing (option 2) — checkpoint 0, advisory, not binding.** Classification table, the `assess-complexity.cjs --checkpoint 0` call and its two confirming questions — `./references/session-start.md`; tier provisioning — `references/triage-sizing.md`.
