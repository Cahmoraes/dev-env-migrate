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

- **Platform is resolved once for the whole wizard** (see `SKILL.md`, "Platform Adaptation") — never re-detected per question, and never inferred from where the skill files are installed (a shared deploy/symlink location read by several harnesses is not proof of identity). A harness not in this table resolves to `other`: use the prose-list Fallback for every question, and skip both the "Copilot CLI: Additional Step" and "Claude Code: Native Skill Additional Step" blocks below without asking or mentioning them — the same treatment a named-but-non-matching platform already gets.
- **One question per call.** The wizard branches on answers (code review → effort), so ask sequentially — never batch steps into one dialog, never bundle an onboarding step with the opening triage.
- **Respect the option cap: at most 4 options per question.** Claude Code's `AskUserQuestion` rejects more than 4 with a `too_big` error; other platforms are similarly limited. Every onboarding step fits. Questions with more options — e.g. the eight-option opening triage in `session-start.md` — use the prose list instead, never the tool.
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

### Step 2b — QA Gate (required)

This step is **required** — always ask it to get an explicit choice; never skip it silently. Present the explanation and ask (in the user's language):

> "**QA Gate** runs `super.user-story-verification` at the very end of implementation — a final acceptance pass that validates the delivered feature against the user stories in the PRD. For example, it can run end-to-end tests in a headless browser via Playwright, driven by dedicated QA subagents derived from the PRD. It only runs when a PRD exists. **This answer is the consent**: with it on, the gate runs automatically at the end of every feature that has a PRD — nothing is asked again at that point. You can also keep that decision for each feature: then the only question is at the gate itself."
>
> "**QA Gate** at the end of implementation?"
> - **Always** (default) — runs the QA gate automatically whenever a PRD exists
> - **Ask me each time** — one question at the gate, per feature with a PRD
> - **Never** — never run the QA gate; QA is not mentioned at all, not even at the PRD step

Record the answer as `workflow.qa_gate` (`true` / `ask` / `false`).

### Step 2b' — Finish action (required)

Ask (in the user's language) — the options name **outcomes**, never ceremony, so the user declares before any work starts what happens once a branch is verified:

> "When a feature branch is finished and verified, what should happen?"
> - **Ask me** (default) — show the finishing menu each time (merge / PR / keep / discard)
> - **Merge locally** — merge into the base branch and delete the feature branch, without asking
> - **Push + PR** — push the branch and open a pull request, without asking
> - **Keep the branch** — leave it as-is for you to integrate later

Record the answer as `workflow.finish_action` (`ask` / `merge` / `pr` / `keep`). Discard is deliberately not offered here — destroying work is only ever a typed confirmation at the menu.

### Step 2c — Visual Companion (required)

Ask (in the user's language):

> "The **Visual Companion** is a lightweight local browser preview `super.brainstorming` can offer when a feature touches a screen — mockups, diagrams and side-by-side layout options instead of describing them in text. Enabling it here does not open anything: brainstorming still asks for consent before each session's first render."
>
> "Allow the **Visual Companion** to be offered during brainstorming?"
> - **Yes** (default) — brainstorming offers it when the conversation reaches a visual decision
> - **No** — never offered; brainstorming stays text-only

Record the answer as `workflow.visual_companion` (true/false).

### Step 3 — Corporate Artifacts (Optional)

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

### Step 3a — Model Tiers (required)

This step is **required** — always ask it and get an explicit choice (a concrete mapping or "auto"); never skip it silently. Present the explanation and ask (in the user's language). Model names are **harness-specific**, so the concrete suggestions below are Claude Code examples — adapt them to the families your running harness exposes.

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

For **Auto**, leave `model_tiers` empty (`cheap`/`standard`/`capable` all unset) — the harness picks distinct capability rungs. For the two preset mappings or **Custom**, record the concrete names under `model_tiers.cheap` / `.standard` / `.capable`; a partial mapping is valid (any unset tier auto-resolves). The same file is later read by whatever harness the repo is opened in, so a tier naming a model the running one does not serve auto-resolves there too, reported in the bootstrap's `unavailableModelTiers` — write the names for the harness in front of you and let the resolution handle the rest.

**Before saving, validate the mapping and warn — the most-expensive model can be chosen, but only explicitly.** Model families are harness-specific, so reason about relative cost/capability (Claude Code: `haiku` < `sonnet` < `opus`; if the ordering is unclear on another harness, ask the user which is cheaper):
- **`standard` equals `cheap`** (same model) → warn: "`standard` reviews your `cheap` tasks; with `standard` == `cheap` it is the same model reviewing itself (e.g. haiku reviewing haiku). I recommend `standard` **one family above**." Offer to bump it before saving.
- **`standard` is the most-expensive family** (e.g. `standard: opus` while `cheap: haiku`) → warn: "`standard: opus` makes your mechanical (`cheap`) tasks reviewed by the most expensive model — usually **overkill**; a `sonnet`-class model already catches the failures. Proceed only if intentional." Proceed only on explicit confirmation.
- **`capable` most-expensive** (e.g. `capable: opus`) → no warning, but state it so the choice is informed: `capable` only implements/reviews architecture tasks, never mechanical code.

### Step 3b — Project Profile (required)

This step is **required** — it records **what** the repo is, not how it is run: the ecosystem label (`stack`) and the repo-relative path of the manifest that describes it (`manifest`: `package.json`, `pubspec.yaml`, `pyproject.toml`, `Cargo.toml`, `go.mod`...). Nothing else goes in this section. Test, setup and format commands are **not** preferences — the repo's instructions file (`AGENTS.md`/`CLAUDE.md`) and the manifest carry them, and every skill that needs a command reads those at the moment it needs it, so this file never has to change when a script does. **Detect first, then confirm — never type the answer from memory:**

```bash
node <super.using-superpowers-base-dir>/scripts/detect-project.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

Read `detected`, `suggestion` (`{ stack, manifest }`), `candidates` and `notes`. **The confirmation question below is the step, and the save waits for its answer.** The detector proposes; only the user's reply makes it a preference — an unconfirmed `suggestion` is never written, however unambiguous the manifest looks (the file records consent, not detection). With no answer yet, stop after asking; do not fill it in for the user.

**`detected: true`** — ask (in the user's language):

> "I detected a **<stack>** project from `<manifest>`. Record this as the project profile?"
> - **Yes** (default) — save it as detected
> - **Another stack** — pick one of the other candidates (when `candidates` has more than one) or name a stack and its manifest

**`detected: false`** (greenfield, or nothing at the repo root) — ask:

> "I found no project manifest at the repo root. Which stack will this project use?"
> - **Flutter** · **Node/React** · **Python** · **Other (name it)**
> - **Not decided yet** — leave the profile empty; brainstorming settles the stack and the profile is saved then

For a named stack run `detect-project.cjs --stack <name>` and confirm its `suggestion` the same way (the manifest is the canonical file name for that stack, created by the scaffold later); for "not decided yet" record `project` with both values empty (the section is still **declared** — the question was asked — and gets filled when the design fixes the stack).

Record the confirmed values as `project.stack` and `project.manifest`.

### Step 4 — Generate and Save

> **Deterministic write (preferred):** render the file with the validator script — it writes canonical YAML and refuses anything the reader cannot parse back (round-trip validation). Build a JSON object from the answers and pass it in:
> ```bash
> node <super.using-superpowers-base-dir>/scripts/write-preferences.cjs \
>   --input-file <answers.json> --repo-root "$(git rev-parse --show-toplevel)"
> ```
> The input JSON mirrors the preferences shape (`workflow`, `copilot`, `claude_code`, `context`, `model_tiers`, `project`); omit any key to accept its default — **except `project`, which must be present** (even with empty values) so the file declares the section (`projectDeclared: true` in the output). Check the output: `written: true` and `roundTripValid: true` confirm success. **Fallback (if the script is unavailable):**
> 1. Read the YAML structure from `../template/preferences.md`
> 2. Fill the placeholders with the answers collected in the previous steps
> 3. Create the `.superpowers/` directory if needed, then save to `.superpowers/preferences.yml`

Then confirm:
> "Preferences saved to `.superpowers/preferences.yml`. You can edit them manually at any time or ask me to update them."

### Step 5 — Opening Triage

Immediately after saving preferences, decide whether to ask the opening question or route straight into a flow:

- If the session started with a greeting, a generic request for help, or no concrete task yet, ask the opening question in the user's language.
- If the user's message already maps cleanly to a single superpowers flow, skip it and hand off directly using `super.using-superpowers` routing rules.

Use the canonical opening question defined in `session-start.md`, "Opening Triage — the map and the shortcuts" (Preferences · Research · Brainstorming · Debugging · Planning · Execution · Spec review · Review/QA). The user may reply with a number (`0`–`7`) or describe what they need. Do not paraphrase it here — that file is the single source of truth so the wording never drifts.

## Generated YAML Structure

The full YAML template is in `../template/preferences.md`; every key is documented in the Field Reference below.

## Field Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `workflow.auto_commit` | bool | `true` | Subagents commit automatically after each task |
| `workflow.qa_gate` | enum | `true` | The end-of-implementation QA gate (`super.user-story-verification`, e.g. Playwright E2E from user stories), only when a PRD exists. `true`: runs automatically — the preference is the consent, nothing is asked at the final stage. `ask`: the final stage asks once, per feature with a PRD, whether to run it. `false`: the QA gate never runs and QA is never mentioned, even at the PRD step. Any other value clamps to `true`. |
| `workflow.finish_action` | enum | `ask` | What `super.finishing-a-development-branch` does once the branch is verified: `ask` shows the finishing menu; `merge` merges locally; `pr` pushes and opens a pull request; `keep` leaves the branch as-is. Declared once so a run can finish without a menu answered hours later. `discard` is not a value — an invalid value clamps to `ask` |
| `workflow.visual_companion` | bool | `true` | Allow `super.brainstorming` to offer the browser companion (mockups/diagrams). `true` keeps the consent question before anything opens; `false` skips the companion entirely — never offered, never mentioned, and no visual signal fires |
| `copilot.review_final` | bool | `false` | When `true`, runs native `review` once over the whole implementation at the final review — extra bug pass on top of the always-on reviewer (per-task gates unaffected). No effort levels. Copilot CLI only. See `references/copilot-tools.md` |
| `claude_code.review_final` | bool | `false` | When `true`, runs `/code-review` once over the whole implementation at the final review — extra bug pass on top of the always-on reviewer (per-task gates unaffected). Claude Code only. See `references/claude-code-tools.md` |
| `claude_code.review_effort` | enum | `medium` | Effort for the final `/code-review`: `low`/`medium`/`high`/`max`. `ultra` is unsupported (cloud, separate tier), clamped to `medium`. Only meaningful when `review_final` is `true` |
| `context.has_corporate_artifacts` | bool | `false` | When `true`, the agent reads `.superpowers/corporate-artifacts.yml` for corporate artifact references in brainstorming and PRD generation |
| `project.stack` | string | empty | Label for the primary ecosystem (`node`, `flutter`, `python`, `rust`, `go`, ...). **Required** wizard step (Step 3b): proposed by `detect-project.cjs`, confirmed by the user. Empty = not decided yet (brainstorming asks it first) |
| `project.manifest` | string | empty | Repo-relative path of the manifest that describes the project (`package.json`, `pubspec.yaml`, `pyproject.toml`, `Cargo.toml`, `go.mod`). A skill that needs a command (test suite, one test file, install, formatter) reads the repo's instructions file (`AGENTS.md`/`CLAUDE.md`) and this manifest — commands are never stored in preferences |
| `model_tiers.cheap` / `.standard` / `.capable` | string | empty | **Required** wizard step (Step 3a) with model suggestions + cost warnings. Maps abstract model tiers used by the execution skill (see super.subagent-driven-development, "Model Selection" section) to concrete model names for this harness. A `cheap` task is reviewed by `standard` (one family up), so onboarding warns if `standard` equals `cheap` or is the most-expensive family (opus reviewing mechanical code); `capable` is spent only on architecture. Empty = auto (harness picks); partial mapping valid. A name the running harness cannot serve resolves to auto for that session (per-harness names, one shared file) and is listed in `unavailableModelTiers`. |

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
- The `copilot:` and `claude_code:` sections hold platform-specific settings (`review_final`, `review_effort`); other AI tools silently ignore these keys.

## Copilot CLI: Additional Step

If the platform resolved in `SKILL.md`'s "Platform Adaptation" is **Copilot CLI**, add this step **after Step 2c** (before Step 3 — Corporate Artifacts). Present it in the user's language; it defaults to **No**.

### Review at the final review

> "**review** is a native Copilot CLI skill. When enabled, it runs once over the **entire implementation** at the final review (before QA/merge) as an **extra bug-detection layer**, **in addition** to the broad standard final reviewer (which keeps running). The per-task spec and quality review gates also keep running. No effort levels.
>
> Enable **review** at the final review?"
> - **No** (default) — only the broad standard final reviewer
> - **Yes** — runs `review` as an extra bug layer, on top of the broad reviewer

Record the answer as `copilot.review_final` (true/false).

Agents on any platform other than Copilot CLI — Claude Code, Codex, Gemini CLI, opencode, and any unrecognized harness resolved as `other` — **must skip this step silently** (no asking, no mentioning it) — they lack the `review` skill. For correct-checkpoint usage, see `copilot-tools.md`.

## Claude Code: Native Skill Additional Step

If the platform resolved in `SKILL.md`'s "Platform Adaptation" is **Claude Code**, add this step **after Step 2c** (before Step 3 — Corporate Artifacts), folding one native Claude Code skill into the workflow. Present it in the user's language; it defaults to **No** — present both sides so the choice is informed, do not let the default decide by omission.

### Step 2d — Code Review at the final review

> "**/code-review** is a native Claude Code skill that reviews the implementation for correctness bugs. When enabled, it runs once over the **entire implementation** at the final review (before QA/merge) as an **extra bug-detection layer**, **in addition** to the broad standard final reviewer (architecture/security/testing, which keeps running). The per-task spec and quality review gates also keep running.
>
> Enable **/code-review** at the final review?"
> - **No** (default) — only the broad standard final reviewer
> - **Yes** — runs `/code-review` as an extra bug layer, on top of the broad reviewer

Record the answer as `claude_code.review_final` (true/false). **If — and only if — the user answers Yes**, ask the effort follow-up:

> "At which effort level? **medium** (default) gives high-confidence findings with little noise; `low` is shallower; `high`/`max` widen coverage but include uncertain findings. (`ultra` unavailable — runs in the cloud on a separate tier.)"
> - **medium** (default) · **low** · **high** · **max**

Record the answer as `claude_code.review_effort` (default `medium` if skipped).

Agents on any platform other than Claude Code — Copilot CLI, Codex, Gemini CLI, opencode, and any unrecognized harness resolved as `other` — **must skip this step silently** (no asking, no mentioning it) — they lack this skill. For correct-checkpoint usage of `/code-review`, see `claude-code-tools.md`.

## Update Preferences (option 0)

Reached when triage option 0 fires — the user wants to see what is configured in `.superpowers/preferences.yml`, and maybe revise it mid-session. (For a single explicitly-named key like "set auto_commit false", use `## Runtime Mutability` instead.)

### The preferences view

The view is rendered. Run the renderer and paste its output as the whole reply:

```bash
node <super.using-superpowers-base-dir>/scripts/render-preferences-view.cjs --platform <resolved-platform> --repo-root "$(git rev-parse --show-toplevel)" --lang <pt-BR|en>
```

It prints one row per switch — label, **state**, one line on what the switch controls; the native-review row appears only on Claude Code and Copilot CLI — and ends with the change-or-back question, so option 0 uses **no question tool** on any platform: the reply is text only and the turn ends there. **The user does not see the tool's output**, so the rows are copied into the reply unchanged. `--lang` follows the session language (`pt-BR`, `en`); for another language, translate the pt-BR output row by row, keeping every row.

### The word routes the next turn

**0** (*voltar*, *back*, *menu*) re-prints the opening triage and nothing else; **1** (*alterar*, *change*, *editar*, a named key) continues. The question stays one prose sentence with the digits in bold, never a numbered list — a list `1.`/`0.` renders as `1.`/`2.`:

1. **Load current values as defaults.** Run `read-preferences.cjs`; use each current value as the **pre-selected default** for its question so the user only changes what they want — do not show or name the raw `preferences` object.
2. **Re-run the wizard questions.** Walk the same steps as `## Wizard Flow`, one question per turn, via the platform's structured-question tool (respecting the ≤4-option cap, prose fallback when unavailable). Skip steps that don't apply to the current resolved platform (`claude_code:` steps off Claude Code, `copilot:` steps off Copilot CLI — including when the resolved platform is `other`). The user may keep any answer by accepting its current default.
3. **Save deterministically.** Build the full preferences object with the changed keys and write it via `write-preferences.cjs --input-file <obj.json> --repo-root "$(git rev-parse --show-toplevel)"` (round-trip validated). Confirm what changed in the user's language.
4. **Refresh session state.** Re-derive the "Session State" section's variables from the new preferences (a changed `workflow.qa_gate`, `workflow.finish_action`, etc. takes effect this session) — these are session-only; the save did not rewrite them.
5. **Return to triage.** Re-ask the opening question, or route directly if the user already stated their next task. Updating preferences is a setup step, not a destination.

## Project profile only

Reached when the bootstrap reports `preferencesFound: true` **and** `projectProfile.declared: false` — a `preferences.yml` written before the `project:` section existed. The other preferences are already the user's; do not re-ask them. Run **Step 3b alone** — detect, then ask its confirmation question **through the platform's structured-question tool** (the table under "Presenting the questions"; prose list only when the tool is unavailable). That tool call is the last thing in the turn: the answer arrives in the **next** turn, and only then the save, the triage or the routing — nothing of the flow runs in the turn that asked. Save with exactly this command — the writer keeps every other key from the existing file and adds the section; there is no `--patch`, no JSON file to find, and the YAML is never edited by hand while the script runs:

```bash
echo '{"project":{"stack":"<stack>","manifest":"<manifest>"}}' \
  | node <super.using-superpowers-base-dir>/scripts/write-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
```

Check `written: true` and `projectDeclared: true` in its output. Confirm in one line ("Project profile saved: <stack> — `<manifest>`") and continue to the triage. This path repeats nothing: the Session Summary's `Atenção:` profile line already told the user the profile was missing.

## Corporate Artifacts

Gated by `preferences.context.has_corporate_artifacts`. The router (`SKILL.md`) keeps a
one-line pointer; the handling rules live here.

If `context.has_corporate_artifacts` is `true`, read `.superpowers/corporate-artifacts.yml`
with the file-reading tool (not `glob`) and keep the paths/URLs in context. When routing to
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
