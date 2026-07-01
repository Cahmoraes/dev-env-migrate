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

- **One question per call.** The wizard branches on answers (caveman → level, code review → effort), so ask sequentially — never batch steps into one dialog, never bundle an onboarding step with the memory re-sync question or the opening triage.
- **Respect the option cap: at most 4 options per question.** Claude Code's `AskUserQuestion` rejects more than 4 with a `too_big` error; other platforms are similarly limited. Every onboarding step fits. Questions with more options — e.g. the seven-option opening triage in `SKILL.md` — use the prose list instead, never the tool.
- The bullet options under each step are the choices: **bold label** is the option, trailing dash text is its description, default stays marked.
- **Fallback:** if the tool is unavailable (Codex `exec`/non-interactive, or any platform lacking it), present the same options as a prose list and wait for a typed reply. See `references/copilot-tools.md`, `references/gemini-tools.md`, `references/codex-tools.md` for the per-platform mapping.

### Step 1 — Inform

Tell the user:
> "I couldn't find your workflow preferences (`.superpowers/preferences.yml`). I'll ask a few quick questions to configure agent behavior for this project."

### Step 2 — Auto-commit

Ask:
> "Would you like subagents to automatically commit after completing each task?"
> - **Yes** (default) — commits are made automatically
> - **No** — you will commit manually

Record the answer as `workflow.auto_commit` (true/false).

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

> "O **Caveman Mode** otimiza o consumo de tokens nas etapas de implementação: o agente se comunica de forma telegráfica — sem formalidades, conectores ou explicações redundantes — mantendo 100% da precisão técnica (~75% menos tokens, sessões mais longas). Aplica-se apenas a implementação, revisão de código e verificações técnicas; planejamento, brainstorming e comunicações com o usuário continuam normais."
>
> "Deseja ativar o **Caveman Mode** durante as etapas de implementação para otimizar o consumo de tokens?"
> - **Não** (padrão) — comunicação normal em todas as fases
> - **Sim** — ativa caveman nas fases de implementação

Record the answer as `optimization.caveman` (true/false).

If the user says **yes**, ask:

> "Qual nível de compactação deseja usar?"
> - **lite** — remove formalidades, mantém gramática
> - **full** (padrão) — comunicação estilo telegráfico
> - **ultra** — compactação máxima, mínimo absoluto de tokens

Record the answer as `optimization.caveman_level` (`lite`, `full`, or `ultra`). Wenyan levels (`wenyan-lite`, `wenyan-full`, `wenyan-ultra`) are available for manual configuration in the YAML but are omitted from the onboarding wizard.

If the user says **no**, record `optimization.caveman: false` and `optimization.caveman_level: full` (default).

### Step 6 — Persistent Memory

Present **both sides** so the choice is informed — do not let the default decide by omission; many users leave it off only because they never heard what it does:

> "Would you like to enable **persistent memory**?
>
> **What you gain:** the agent stores architectural decisions, feature scope, and artifact paths in a local SQLite database (`.memory/`), so future sessions recall them instead of re-deriving. Best for teams and long-lived features; all data stays local to this repository.
>
> **The trade-off (why it's off by default):** it adds a recall/persist step at the start of brainstorming and end of planning, and on a repo with many unrelated features old memories can surface as noise — for a quick one-off it may not pay off. Recommendation: enable it for ongoing work on a real codebase; leave it off for a throwaway or exploratory session."
> - **No** (default) — memory is not persisted between sessions
> - **Yes** — enables persistent memory for cross-session recall

Record the answer as `memory.persistent_memory` (true/false).

> **Note:** Disabling persistent memory does NOT delete existing `.memory/` data — it only prevents future reads and writes. To remove stored data, delete `.memory/` manually.

### Step 7 — Corporate Artifacts (Optional)

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
# Entries are local paths or public URLs to corporate documents.
items:
  - <path-or-url>
```

Then set `context.has_corporate_artifacts: true` in the preferences before saving in the next step.

If the user says **no** or provides nothing, leave `context.has_corporate_artifacts: false` (default) and do NOT create the corporate-artifacts.yml file.

> **Why this matters:** Corporate artifacts carry business constraints, validated user stories, design decisions, and domain context the agent cannot discover from the codebase alone — they significantly improve brainstorming questions, research, and PRD generation.

### Step 7a — Model Tiers (Optional)

Present the following explanation and ask (in the configured language):

> "O superpowers despacha cada subagente num **tier de modelo** abstrato — `cheap` (trabalho mecânico), `standard` (integração multi-arquivo, padrão seguro) e `capable` (arquitetura/design). Por padrão o harness escolhe automaticamente o modelo de cada tier; você pode fixar modelos concretos se quiser controlar custo e capacidade."
>
> "Deseja configurar os modelos por tier agora?"
> - **Não** (padrão) — o harness escolhe o modelo de cada tier automaticamente
> - **Sim** — informar um modelo concreto por tier

If the user says **no**, leave `model_tiers` empty (`cheap`/`standard`/`capable` all unset) — the harness picks. This is the default; do not press.

If the user says **yes**, collect a concrete model name for each tier the user names (do not press for the rest). These names are **harness-specific**, so they are typed free-text answers, not a fixed-option list (e.g. on Claude Code: `cheap: haiku`, `standard: sonnet`, `capable: opus`). Accept all three at once or one tier per reply; leave any tier the user skips **unset** (the harness picks for that one — a partial configuration is valid). Record under `model_tiers.cheap` / `.standard` / `.capable`.

### Step 8 — Generate and Save

> **Deterministic write (preferred):** render the file with the validator script — it writes canonical YAML and refuses anything the reader cannot parse back (round-trip validation). Build a JSON object from the answers and pass it in:
> ```bash
> node <super.using-superpowers-base-dir>/scripts/write-preferences.cjs \
>   --input-file <answers.json> --repo-root "$(git rev-parse --show-toplevel)"
> ```
> The input JSON mirrors the preferences shape (`workflow`, `communication`, `copilot`, `claude_code`, `context`, `optimization`, `memory`, `model_tiers`); omit any key to accept its default. Check the output: `written: true` and `roundTripValid: true` confirm success. **Fallback (if the script is unavailable):**
> 1. Read the YAML structure from `../template/preferences.md`
> 2. Fill the placeholders with the answers collected in the previous steps
> 3. Create the `.superpowers/` directory if needed, then save to `.superpowers/preferences.yml`

Then confirm:
> "Preferences saved to `.superpowers/preferences.yml`. You can edit them manually at any time or ask me to update them."

### Step 9 — Opening Triage

Immediately after saving preferences, decide whether to ask the opening question or route straight into a flow:

- If the session started with a greeting, a generic request for help, or no concrete task yet, ask the opening question in the chosen language.
- If the user's message already maps cleanly to a single superpowers flow, skip it and hand off directly using `super.using-superpowers` routing rules.

Use the canonical numbered opening question defined in `SKILL.md § Opening Triage` (⚙️ Preferências · 🔍 Research · 🧠 Brainstorming · 🐛 Debugging · 📋 Planejamento · ⚡ Execução · ✅ Review/QA). The user may reply with a number (`0`–`6`) or describe what they need. Do not paraphrase it here — `SKILL.md` is the single source of truth so the wording never drifts.

## Generated YAML Structure

The full YAML template is in `../template/preferences.md`. The structure is:

```yaml
workflow:
  auto_commit: <true|false>
  confirm_destructive_actions: <true|false>

communication:
  language: <language-code>

copilot:                       # Copilot CLI only — ignored by other tools
  rubber_duck: <true|false>
  review_final: <true|false>

claude_code:                   # Claude Code only — ignored by other tools
  simplify: <true|false>
  code_review_final: <true|false>
  code_review_effort: <low|medium|high|max>

context:
  has_corporate_artifacts: <true|false>

optimization:
  caveman: <true|false>         # default: false
  caveman_level: <level>        # default: full — lite | full | ultra | wenyan-lite | wenyan-full | wenyan-ultra

memory:
  persistent_memory: <true|false>

model_tiers:                   # optional — abstract tiers → concrete models
  cheap: <model|empty>
  standard: <model|empty>
  capable: <model|empty>
```

## Field Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `workflow.auto_commit` | bool | `true` | Subagents commit automatically after each task |
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
| `memory.persistent_memory` | bool | `false` | When `true`, enables cross-session memory recall/persistence via `.memory/` SQLite. When `false`, all super.persistent-memory operations are skipped |
| `model_tiers.cheap` / `.standard` / `.capable` | string | empty | Optional. Maps abstract model tiers used by execution skills (see super.subagent-driven-development § Model Selection) to concrete model names for this harness. Empty → the harness picks. Asked as an optional wizard step (Step 7a). |

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

If running in **Copilot CLI**, add these steps **after Step 4** (before Step 5 — Caveman Mode). Present each in the configured language; all default to **No**.

### Rubber Duck

> "By default, Copilot CLI invokes the **Rubber Duck Agent** automatically. You can override this to force it at every critical checkpoint (after plan draft, after complex implementations, after writing tests).
>
> Would you like to force Rubber Duck at every checkpoint?"
> - **No** (default) — Copilot CLI decides when to invoke Rubber Duck
> - **Yes** — guarantee Rubber Duck is invoked at every defined checkpoint

Record the answer as `copilot.rubber_duck` (true/false) in the generated YAML.

### Review at the final review

> "O **review** é uma skill nativa do Copilot CLI. Quando ativada, roda uma vez sobre a **implementação inteira** no review final (antes do QA/merge) como **camada extra de detecção de bugs**, **em adição** ao revisor final padrão amplo (que continua rodando). Os gates de spec e quality review por tarefa também continuam. Sem níveis de esforço.
>
> Deseja habilitar o **review** no review final?"
> - **Não** (padrão) — só o revisor final amplo padrão
> - **Sim** — roda `review` como camada extra de bugs, além do revisor amplo

Record the answer as `copilot.review_final` (true/false).

Agents on other platforms (Claude Code, Codex, Gemini CLI) **must skip these steps** — they lack the Rubber Duck Agent and the `review` skill. For correct-checkpoint usage, see `copilot-tools.md`.

## Claude Code: Native Skills Additional Steps

If running in **Claude Code**, add these two steps **after Step 4** (before Step 5 — Caveman Mode), folding two native Claude Code skills into the workflow. Present each in the configured language, both default to **No** — present both sides so the choice is informed, do not let the default decide by omission.

### Step 4a — Simplify (execution)

> "O **/simplify** é uma skill nativa do Claude Code que revisa o código alterado buscando reuso, simplificação e eficiência — e **aplica** as correções (só qualidade, não caça bugs). Quando ativada, roda automaticamente na **execução**, logo após implementar uma tarefa e antes da revisão.
>
> Deseja habilitar o **/simplify** durante a execução?"
> - **Não** (padrão) — não roda passagem de simplificação
> - **Sim** — roda `/simplify` no código alterado após cada tarefa

Record the answer as `claude_code.simplify` (true/false).

### Step 4b — Code Review at the final review

> "O **/code-review** é uma skill nativa do Claude Code que revisa a implementação em busca de bugs de correção. Quando ativada, roda uma vez sobre a **implementação inteira** no review final (antes do QA/merge) como **camada extra de detecção de bugs**, **em adição** ao revisor final padrão amplo (arquitetura/segurança/testes, que continua rodando). Os gates de spec e quality review por tarefa também continuam.
>
> Deseja habilitar o **/code-review** no review final?"
> - **Não** (padrão) — só o revisor final amplo padrão
> - **Sim** — roda `/code-review` como camada extra de bugs, além do revisor amplo

Record the answer as `claude_code.code_review_final` (true/false). **If — and only if — the user answers Sim**, ask the effort follow-up:

> "Em qual nível de esforço? **medium** (padrão) traz achados de alta confiança com pouco ruído; `low` é mais raso; `high`/`max` ampliam a cobertura mas incluem achados incertos. (`ultra` indisponível — roda na nuvem em tier apartado.)"
> - **medium** (padrão) · **low** · **high** · **max**

Record the answer as `claude_code.code_review_effort` (default `medium` if skipped).

Agents on other platforms (Copilot CLI, Codex, Gemini CLI) **must skip these steps** — they lack these skills. For correct-checkpoint usage of `/simplify` and `/code-review`, see `claude-code-tools.md`.

## Update Preferences (option 0)

Reached when triage option 0 fires — the user wants to revise `.superpowers/preferences.yml` mid-session without hand-editing YAML. Walks the same wizard again so the user can flip one switch or several. (For a single explicitly-named key like "set auto_commit false", use `## Runtime Mutability` instead.)

1. **Load current values as defaults.** Run `read-preferences.cjs`; use each current value as the **pre-selected default** for its question so the user only changes what they want — do not show or name the raw `preferences` object.
2. **Re-run the wizard questions.** Walk the same steps as `## Wizard Flow`, one question per turn, via the platform's structured-question tool (respecting the ≤4-option cap, prose fallback when unavailable). Skip steps that don't apply to the current platform (`claude_code:` steps off Claude Code, `copilot:` steps off Copilot CLI). The user may keep any answer by accepting its current default.
3. **Save deterministically.** Build the full preferences object with the changed keys and write it via `write-preferences.cjs --input-file <obj.json> --repo-root "$(git rev-parse --show-toplevel)"` (round-trip validated). Confirm what changed in the configured language.
4. **Refresh session state.** Re-derive the § Session State variables from the new preferences (a changed `optimization.caveman`, `memory.persistent_memory`, etc. takes effect this session) — these are session-only; the save did not rewrite them.
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
artifacts, do not silently skip the company's source of truth: warn the user once that
the file is present while the flag is off (so the artifacts are being ignored) and ask
whether to enable `has_corporate_artifacts`, then proceed per their answer.
