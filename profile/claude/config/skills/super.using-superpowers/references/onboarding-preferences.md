# Workflow Preferences Onboarding

## Trigger

The `super.using-superpowers` skill detects the absence of `.superpowers/preferences.yml` in the user's repository root and runs this wizard.

## Wizard Flow

Follow these steps in order, **one question at a time**.

### Presenting the questions

Every step offers a small set of fixed answers. **Present them with your platform's structured-question tool so the user can select instead of typing** — it renders options as a dialog with a free-form "Other":

| Platform | Tool |
|---|---|
| Claude Code | `AskUserQuestion` (native) |
| Copilot CLI | `ask_user` |
| Gemini CLI | `ask_user` |
| Codex | `ask_user_question` (interactive only) |
| Any other platform (unrecognized/unlisted harness) | none — use the prose-list Fallback below |

- **Platform is resolved once for the whole wizard** (see `SKILL.md`, "Platform Adaptation") — never re-detected per question, and never inferred from where the skill files are installed (a shared deploy/symlink location read by several harnesses is not proof of identity). A harness not in this table resolves to `other`: use the prose-list Fallback for every question, and skip both the "Copilot CLI: Additional Steps" and "Claude Code: Native Skills Additional Steps" blocks below without asking or mentioning them — the same treatment a named-but-non-matching platform already gets. When a future platform gains its own dedicated onboarding steps, add its row here and its own step block; `other` then covers only the platforms still unlisted.
- **One question per call.** The wizard branches on answers (caveman → level, code review → effort), so ask sequentially — never batch steps into one dialog, never bundle an onboarding step with the opening triage.
- **Respect the option cap: at most 4 options per question.** Claude Code's `AskUserQuestion` rejects more than 4 with a `too_big` error; other platforms are similarly limited. Every onboarding step fits. Questions with more options — e.g. the seven-option opening triage in `SKILL.md` — use the prose list instead, never the tool.
- The bullet options under each step are the choices: **bold label** is the option, trailing dash text is its description, default stays marked.
- **Fallback:** if the tool is unavailable (Codex `exec`/non-interactive, or any platform lacking it), present the same options as a prose list and wait for a typed reply. See `references/copilot-tools.md`, `references/gemini-tools.md`, `references/codex-tools.md`, `references/opencode-tools.md` for the per-platform mapping.

### Step 1 — Inform

Tell the user:
> "I couldn't find your workflow preferences (`.superpowers/preferences.yml`). I'll ask a few quick questions to configure agent behavior for this project."

### Step 2 — Auto-commit

Ask:
> "Would you like subagents to automatically commit after completing each task?"
> - **Yes** (default) — commits are made automatically
> - **No** — you will commit manually

Record the answer as `workflow.auto_commit` (true/false).

### Step 2a — QA Gate (required)

This step is **required** — always ask it to get an explicit choice; never skip it silently. Present the explanation and ask (in the configured language):

> "**QA Gate** runs `super.user-story-verification` at the very end of implementation — a final acceptance pass that validates the delivered feature against the user stories in the PRD. For example, it can run end-to-end tests in a headless browser via Playwright, driven by dedicated QA subagents derived from the PRD. It only runs when a PRD exists; the independent verification gate always runs regardless of this setting."
>
> "Enable the **QA Gate** at the end of implementation?"
> - **Yes** (default) — run the QA gate when a PRD exists
> - **No** — never run the QA gate; QA is not mentioned at all, not even at the PRD step

Record the answer as `workflow.qa_gate` (true/false).

### Step 2b — Visual Companion (required)

Ask (in the configured language):

> "The **Visual Companion** is a lightweight local browser preview `super.brainstorming` can offer when a feature touches a screen — mockups, diagrams and side-by-side layout options instead of describing them in text. Enabling it here does not open anything: brainstorming still asks for consent before each session's first render."
>
> "Allow the **Visual Companion** to be offered during brainstorming?"
> - **Yes** (default) — brainstorming offers it when the conversation reaches a visual decision
> - **No** — never offered; brainstorming stays text-only

Record the answer as `workflow.visual_companion` (true/false).

### Step 3 — Language

Ask:
> "What language do you prefer for agent communication?"
> - **pt-BR** (default)
> - **en**
> - **es**
> - Other (specify)

Record the answer as `communication.language`.

### Step 4 — Destructive Action Confirmation

Ask:
> "Would you like agents to ask for confirmation before destructive actions (deleting files, overwriting content)?"
> - **Yes** (default) — always ask for confirmation
> - **No** — execute without asking

Record the answer as `workflow.confirm_destructive_actions` (true/false).

### Step 5 — Caveman Mode

Present the following explanation and ask (in the configured language):

> "**Caveman Mode** optimizes token usage during implementation stages: the agent communicates telegraphically — no pleasantries, connectors, or redundant explanation — while keeping 100% technical precision (~75% fewer tokens, longer sessions). It applies only to implementation, code review, and technical checks; planning, brainstorming, and user-facing communication stay normal."
>
> "Enable **Caveman Mode** during implementation stages to optimize token usage?"
> - **No** (default) — normal communication in all phases
> - **Yes** — enables caveman in implementation phases

Record the answer as `optimization.caveman` (true/false).

If the user says **yes**, ask:

> "Which compaction level do you want?"
> - **lite** — drops pleasantries, keeps grammar
> - **full** (default) — telegraphic style
> - **ultra** — maximum compaction, absolute minimum tokens

Record the answer as `optimization.caveman_level` (`lite`, `full`, or `ultra`). Wenyan levels (`wenyan-lite`, `wenyan-full`, `wenyan-ultra`) are available for manual configuration in the YAML but are omitted from the onboarding wizard.

If the user says **no**, record `optimization.caveman: false` and `optimization.caveman_level: full` (default).

### Step 6 — Corporate Artifacts (Optional)

Ask:
> "Do you have any corporate artifacts that could help me understand the project better? For example: PRDs, technical specs, UML diagrams, user stories, wikis, data mappings, API contracts, ADRs, or design mockups created by your team?"
> - **Yes** — please share them
> - **No** — skip this step

If the user says **yes**, collect all references they provide:
- **Local file paths** (e.g., `./docs/prd.md`, `../specs/architecture.md`)
- **Public URLs** (e.g., `https://wiki.company.com/product-spec`)
- **Inline content** (pasted directly in the chat)

For inline content, warn the user:
> "Inline content is available for this session only. To use these artifacts in future sessions, save them to a file and provide the path."

For paths and URLs, create `.superpowers/corporate-artifacts.yml` in the repository root with the following format:

```yaml
# Superpowers Corporate Artifacts
# Collected during onboarding. Edit manually or ask the agent to update.
# Entries are local paths (relative to the repo root) or public URLs.
artifacts:
  - path: <repo-relative-path>
  - url: <public-url>
```

**The key is `artifacts:` and every item is tagged `path:` or `url:` — this exact shape, not
a list of bare scalars.** It is what `lib/corporate-artifacts.cjs` parses, and a file written
in any other shape parses to **zero entries**: the wizard would report success while the
declaration silently declares nothing.

Then set `context.has_corporate_artifacts: true` in the preferences before saving in the next step.

If the user says **no** or provides nothing, leave `context.has_corporate_artifacts: false` (default) and do NOT create the corporate-artifacts.yml file.

> **Why this matters:** Corporate artifacts carry business constraints, validated user stories, design decisions, and domain context the agent cannot discover from the codebase alone — they significantly improve brainstorming questions, research, and PRD generation.

### Step 6a — Model Tiers (required)

This step is **required** — always ask it and get an explicit choice (a concrete mapping or "auto"); never skip it silently. Present the explanation and ask (in the configured language). Model names are **harness-specific**, so the concrete suggestions below are Claude Code examples — adapt them to the families your running harness exposes.

> "superpowers dispatches every subagent at an abstract **model tier**, and the tier drives **who implements AND who reviews**:
> - **`cheap`** — mechanical work (most of the volume; the cheapest).
> - **`standard`** — multi-file integration AND **reviews your `cheap` tasks** (a mechanical task's gate runs one family up, at `standard`).
> - **`capable`** — architecture/design (implements and reviews design tasks); it is **not** spent reviewing mechanical code.
>
> Key rule: because `standard` reviews `cheap`, **keep `standard` one family above `cheap`**. The most-expensive model (e.g. opus) is only worth it at `capable`, and only for architecture."
>
> "How do you want to map the tiers?"
> - **Economical (suggested)** — `cheap: haiku`, `standard: sonnet`, `capable: sonnet` (sonnet as reviewer/architect; no opus)
> - **Opus for architecture** — `cheap: haiku`, `standard: sonnet`, `capable: opus` (opus only on `capable` tasks)
> - **Auto** — leave all three empty; the harness picks distinct capability rungs
> - **Custom** — provide one model per tier manually

For **Auto**, leave `model_tiers` empty (`cheap`/`standard`/`capable` all unset) — the harness picks distinct capability rungs. For the two preset mappings or **Custom**, record the concrete names under `model_tiers.cheap` / `.standard` / `.capable`; a partial mapping is valid (any unset tier auto-resolves).

**Before saving, validate the mapping and warn — the most-expensive model can be chosen, but only explicitly.** Model families are harness-specific, so reason about relative cost/capability (Claude Code: `haiku` < `sonnet` < `opus`; if the ordering is unclear on another harness, ask the user which is cheaper):
- **`standard` equals `cheap`** (same model) → warn: "`standard` reviews your `cheap` tasks; with `standard` == `cheap` it is the same model reviewing itself (e.g. haiku reviewing haiku). I recommend `standard` **one family above**." Offer to bump it before saving.
- **`standard` is the most-expensive family** (e.g. `standard: opus` while `cheap: haiku`) → warn: "`standard: opus` makes your mechanical (`cheap`) tasks reviewed by the most expensive model — usually **overkill**; a `sonnet`-class model already catches the failures. Proceed only if intentional." Proceed only on explicit confirmation.
- **`capable` most-expensive** (e.g. `capable: opus`) → no warning, but state it so the choice is informed: `capable` only implements/reviews architecture tasks, never mechanical code.

### Step 7 — Generate and Save

> **Deterministic write (preferred):** render the file with the validator script — it writes canonical YAML and refuses anything the reader cannot parse back (round-trip validation). Build a JSON object from the answers and pass it in:
> ```bash
> node <super.using-superpowers-base-dir>/scripts/write-preferences.cjs \
>   --input-file <answers.json> --repo-root "$(git rev-parse --show-toplevel)"
> ```
> The input JSON mirrors the preferences shape (`workflow`, `communication`, `copilot`, `claude_code`, `context`, `optimization`, `model_tiers`); omit any key to accept its default. Check the output: `written: true` and `roundTripValid: true` confirm success. **Fallback (if the script is unavailable):**
> 1. Read the YAML structure from `../template/preferences.md`
> 2. Fill the placeholders with the answers collected in the previous steps
> 3. Create the `.superpowers/` directory if needed, then save to `.superpowers/preferences.yml`

Then confirm:
> "Preferences saved to `.superpowers/preferences.yml`. You can edit them manually at any time or ask me to update them."

### Step 8 — Opening Triage

Immediately after saving preferences, decide whether to ask the opening question or route straight into a flow:

- If the session started with a greeting, a generic request for help, or no concrete task yet, ask the opening question in the chosen language.
- If the user's message already maps cleanly to a single superpowers flow, skip it and hand off directly using `super.using-superpowers` routing rules.

Use the canonical numbered opening question defined in `session-start.md`, "Opening Triage — the numbered question" (Preferences · Research · Brainstorming · Debugging · Planning · Execution · Spec review · Review/QA). The user may reply with a number (`0`–`7`) or describe what they need. Do not paraphrase it here — that file is the single source of truth so the wording never drifts.

## Generated YAML Structure

The full YAML template is in `../template/preferences.md`; every key is documented in the Field Reference below.

## Field Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `workflow.auto_commit` | bool | `true` | Subagents commit automatically after each task |
| `workflow.qa_gate` | bool | `true` | Run the end-of-implementation QA gate (`super.user-story-verification`) — offered when a PRD exists (e.g. Playwright E2E from user stories). When `false`, the QA gate never runs and QA is never mentioned, even at the PRD step. Independent verification is unaffected |
| `workflow.visual_companion` | bool | `true` | Allow `super.brainstorming` to offer the browser companion (mockups/diagrams). `true` keeps the consent question before anything opens; `false` skips the companion entirely — never offered, never mentioned, and no visual signal fires |
| `workflow.confirm_destructive_actions` | bool | `true` | Ask for confirmation before deleting/overwriting files |
| `communication.language` | string | `pt-BR` | Language for agent communication |
| `copilot.rubber_duck` | bool | `false` | Forces Rubber Duck at every critical checkpoint. When `false`/absent, Copilot CLI decides automatically — Copilot CLI only |
| `copilot.review_final` | bool | `false` | When `true`, runs native `review` once over the whole implementation at the final review — extra bug pass on top of the always-on reviewer (per-task gates unaffected). No effort levels. Copilot CLI only. See `references/copilot-tools.md` |
| `claude_code.simplify` | bool | `false` | When `true`, runs native `/simplify` on changed code during execution, per task (before review). Applies cleanups, not a review. Claude Code only. See `references/claude-code-tools.md` |
| `claude_code.code_review_final` | bool | `false` | When `true`, runs `/code-review` once over the whole implementation at the final review — extra bug pass on top of the always-on reviewer (per-task gates unaffected). Claude Code only. See `references/claude-code-tools.md` |
| `claude_code.code_review_effort` | enum | `medium` | Effort for the final `/code-review`: `low`/`medium`/`high`/`max`. `ultra` is unsupported (cloud, separate tier), clamped to `medium`. Only meaningful when `code_review_final` is `true` |
| `context.has_corporate_artifacts` | bool | `false` | When `true`, the agent reads `.superpowers/corporate-artifacts.yml` for corporate artifact references in brainstorming and PRD generation |
| `optimization.caveman` | bool | `false` | When `true`, activates caveman ultra-compressed communication during execution, review, and QA. Never during planning, brainstorming, or finalization |
| `optimization.caveman_level` | string | `full` | Compression intensity: `lite` \| `full` \| `ultra` \| `wenyan-lite` \| `wenyan-full` \| `wenyan-ultra`. Onboarding only offers `lite`, `full`, `ultra`; wenyan levels are manual-only |
| `model_tiers.cheap` / `.standard` / `.capable` | string | empty | **Required** wizard step (Step 6a) with model suggestions + cost warnings. Maps abstract model tiers used by execution skills (see super.subagent-driven-development, "Model Selection" section) to concrete model names for this harness. A `cheap` task is reviewed by `standard` (one family up), so onboarding warns if `standard` equals `cheap` or is the most-expensive family (opus reviewing mechanical code); `capable` is spent only on architecture. Empty = auto (harness picks); partial mapping valid. |

## Runtime Mutability

If the user requests a preference change during a session (e.g., "set auto_commit to false"):
1. Read the current file (`read-preferences.cjs`)
2. Build the full preferences object with only the requested key changed
3. Save it with `write-preferences.cjs --input-file <obj.json> --repo-root <root>` (round-trip validated; falls back to a manual edit if the script is unavailable)
4. Confirm the change to the user

**Rule:** Never change preferences without explicit user request.

## Reading Rules & Compatibility

- Missing preference key → use default value (see Field Reference table above and template at `../template/preferences.md`)
- Unknown keys → **ignored** (forward-compatible)
- Malformed file (invalid YAML) → warn the user, assume all defaults, offer to recreate
- The `copilot:` and `claude_code:` sections hold platform-specific settings (e.g. `simplify`, `code_review`); other AI tools silently ignore these keys.

## Copilot CLI: Additional Steps

If the platform resolved in `SKILL.md`'s "Platform Adaptation" is **Copilot CLI**, add these steps **after Step 4** (before Step 5 — Caveman Mode). Present each in the configured language; all default to **No**.

### Rubber Duck

> "By default, Copilot CLI invokes the **Rubber Duck Agent** automatically. You can override this to force it at every critical checkpoint (after plan draft, after complex implementations, after writing tests).
>
> Would you like to force Rubber Duck at every checkpoint?"
> - **No** (default) — Copilot CLI decides when to invoke Rubber Duck
> - **Yes** — guarantee Rubber Duck is invoked at every defined checkpoint

Record the answer as `copilot.rubber_duck` (true/false) in the generated YAML.

### Review at the final review

> "**review** is a native Copilot CLI skill. When enabled, it runs once over the **entire implementation** at the final review (before QA/merge) as an **extra bug-detection layer**, **in addition** to the broad standard final reviewer (which keeps running). The per-task spec and quality review gates also keep running. No effort levels.
>
> Enable **review** at the final review?"
> - **No** (default) — only the broad standard final reviewer
> - **Yes** — runs `review` as an extra bug layer, on top of the broad reviewer

Record the answer as `copilot.review_final` (true/false).

Agents on any platform other than Copilot CLI — Claude Code, Codex, Gemini CLI, opencode, and any unrecognized harness resolved as `other` — **must skip these steps silently** (no asking, no mentioning them) — they lack the Rubber Duck Agent and the `review` skill. For correct-checkpoint usage, see `copilot-tools.md`.

## Claude Code: Native Skills Additional Steps

If the platform resolved in `SKILL.md`'s "Platform Adaptation" is **Claude Code**, add these two steps **after Step 4** (before Step 5 — Caveman Mode), folding two native Claude Code skills into the workflow. Present each in the configured language, both default to **No** — present both sides so the choice is informed, do not let the default decide by omission.

### Step 4a — Simplify (execution)

> "**/simplify** is a native Claude Code skill that reviews changed code for reuse, simplification, and efficiency — and **applies** the fixes (quality only, not bug hunting). When enabled, it runs automatically during **execution**, right after implementing a task and before review.
>
> Enable **/simplify** during execution?"
> - **No** (default) — no simplification pass
> - **Yes** — runs `/simplify` on changed code after each task

Record the answer as `claude_code.simplify` (true/false).

### Step 4b — Code Review at the final review

> "**/code-review** is a native Claude Code skill that reviews the implementation for correctness bugs. When enabled, it runs once over the **entire implementation** at the final review (before QA/merge) as an **extra bug-detection layer**, **in addition** to the broad standard final reviewer (architecture/security/testing, which keeps running). The per-task spec and quality review gates also keep running.
>
> Enable **/code-review** at the final review?"
> - **No** (default) — only the broad standard final reviewer
> - **Yes** — runs `/code-review` as an extra bug layer, on top of the broad reviewer

Record the answer as `claude_code.code_review_final` (true/false). **If — and only if — the user answers Yes**, ask the effort follow-up:

> "At which effort level? **medium** (default) gives high-confidence findings with little noise; `low` is shallower; `high`/`max` widen coverage but include uncertain findings. (`ultra` unavailable — runs in the cloud on a separate tier.)"
> - **medium** (default) · **low** · **high** · **max**

Record the answer as `claude_code.code_review_effort` (default `medium` if skipped).

Agents on any platform other than Claude Code — Copilot CLI, Codex, Gemini CLI, opencode, and any unrecognized harness resolved as `other` — **must skip these steps silently** (no asking, no mentioning them) — they lack these skills. For correct-checkpoint usage of `/simplify` and `/code-review`, see `claude-code-tools.md`.

## Update Preferences (option 0)

Reached when triage option 0 fires — the user wants to revise `.superpowers/preferences.yml` mid-session without hand-editing YAML. Walks the same wizard again so the user can flip one switch or several. (For a single explicitly-named key like "set auto_commit false", use `## Runtime Mutability` instead.)

1. **Load current values as defaults.** Run `read-preferences.cjs`; use each current value as the **pre-selected default** for its question so the user only changes what they want — do not show or name the raw `preferences` object.
2. **Re-run the wizard questions.** Walk the same steps as `## Wizard Flow`, one question per turn, via the platform's structured-question tool (respecting the ≤4-option cap, prose fallback when unavailable). Skip steps that don't apply to the current resolved platform (`claude_code:` steps off Claude Code, `copilot:` steps off Copilot CLI — including when the resolved platform is `other`). The user may keep any answer by accepting its current default.
3. **Save deterministically.** Build the full preferences object with the changed keys and write it via `write-preferences.cjs --input-file <obj.json> --repo-root "$(git rev-parse --show-toplevel)"` (round-trip validated). Confirm what changed in the configured language.
4. **Refresh session state.** Re-derive the "Session State" section's variables from the new preferences (a changed `optimization.caveman`, `workflow.qa_gate`, etc. takes effect this session) — these are session-only; the save did not rewrite them.
5. **Return to triage.** Re-ask the opening question, or route directly if the user already stated their next task. Updating preferences is a setup step, not a destination.

## Corporate Artifacts

Gated by `preferences.context.has_corporate_artifacts`. The router (`SKILL.md`) keeps a
one-line pointer; the handling rules live here.

If `context.has_corporate_artifacts` is `true`, read `.superpowers/corporate-artifacts.yml`
with `view` (not `glob`) and keep the paths/URLs in context. When routing to
`super.brainstorming`, `super.generating-prd`, or `super.writing-plans`, pass them in
the handoff: _"Corporate artifacts are available: [list of paths/URLs]."_ If the file is
missing despite the flag, warn the user once and continue without artifacts. Conversely,
if the flag is `false` but `.superpowers/corporate-artifacts.yml` exists and lists
artifacts (`corporateArtifacts.declaredButDisabled` in the bootstrap JSON), do not
silently skip the company's source of truth. **The Session Summary's corporate row is that
warning** — it names the file, the count, and that they are not loaded, and it costs no
round trip because the block prints anyway. Do not add a question ahead of the triage on
top of it; enable `has_corporate_artifacts` when the user asks, or through triage option 0.

**Until they do, the artifacts stay unloaded.** The flag is the user's declaration;
the file is only a leftover of one. Loading it "because it is there" is how a document
the pipeline itself wrote for an unrelated feature ends up outranking the current spec —
corporate precedence is exactly what makes an unconsented artifact dangerous rather than
merely noisy. Same rule downstream: `super.reviewing-specs` runs its corporate lens only
when consent AND a declaration are both present (`resolve-review-targets.cjs` returns
`declaredButDisabled` for the mismatch, which is reported as a config observation).
