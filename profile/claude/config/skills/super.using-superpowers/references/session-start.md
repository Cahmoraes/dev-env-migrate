# Session Start — opening block, triage and the two sub-flows

Runs once, right after the preferences bootstrap; governed by the router (`SKILL.md`, "Session Summary" and "Opening Triage"). The opening turn is the triage block below and nothing else — no greeting, no narration of the commands.

## Session Summary — the opening sentence

One sentence, in the user's language, naming the preferences file and the shortcut (`0`) that shows and edits it — the first of the triage's three opening lines. The full listing, with what each switch controls, is the preferences view of option 0.

Right after the opening block, one `Atenção:` line per exception, only when it applies (the happy path prints none), read off the bootstrap JSON:

| Signal | `Atenção:` line |
|---|---|
| `unavailableModelTiers` non-empty | `Atenção: \`standard: gpt-5\` não existe nesta plataforma (claude-code) — esse tier caiu para \`sonnet\`.` — one line per dropped tier, naming the configured model |
| `corporateArtifacts.declared` ✓ and `enabled` ✗ | `Atenção: <count> artefato(s) corporativo(s) declarado(s) em \`.superpowers/corporate-artifacts.yml\`, **não carregados** — ative com \`0\`.` |
| `projectProfile.declared: false` | `Atenção: perfil do projeto não configurado — detecto e confirmo agora, antes da triagem.` |

The profile line is a commitment for **this same turn**: right after it, `cat` `onboarding-preferences.md` and follow its "Project profile only" section (detector, confirmation question and writer command). The triage comes only after the profile is saved — never the whole wizard again. Name files by their **repo-relative** path (`configPath` comes back absolute). The corporate line says how many documents are declared, never which.

**Model tiers.** `session_model_tier_*` arrive resolved to the user's mapping or to this platform's rung alias. A tier that still reads `auto` (no rung alias on this platform) prints the literal `auto`: it is the contract's name for "picked by role at dispatch time".

## Opening Triage — the map and the shortcuts

Three consecutive lines, one sentence each — preferences loaded, what superpowers does end to end, describe or pick — separated by a line break, never by an empty line. Then the `Atenção:` lines, if any. Then the shortcuts, grouped by where the user stands and phrased as the user's situation; free text is the primary affordance, the digits are shortcuts. Render it like this, translated to the session language (sentences, group titles, labels, glosses); the digits `0`–`7`, their grouping and their routes are fixed. Each group, option 0 included, opens with its own title line, so every numbered list starts fresh at its first digit instead of continuing the previous group's count.

  > **Preferences loaded** from `.superpowers/preferences.yml` (`0` to view or change).
  > Superpowers takes a request from idea to merge: idea → spec → plan → verification → finish.
  > Describe what you need in your own words, or pick a shortcut:
  >
  > **Start**
  > 1. **Research** — investigate or compare options before deciding
  > 2. **Idea or request** — new feature, refactor, migration, architecture change
  > 3. **Bug** — regression, failing test, unexpected behaviour
  >
  > **Continue** (a spec or tasks already exist)
  > 4. **Plan** — approved spec/PRD → execution plan
  > 5. **Implement** — existing tasks → code
  >
  > **Verify**
  > 6. **Review a spec** — open points and inconsistencies in an existing design
  > 7. **Review code** — QA or code review of implemented work
  >
  > **Configure**
  > 0. **Preferences** — view or change

**The turn ends on option 0** — "Describe what you need…" is the question.

Map a bare numeric reply (`0`–`7`) via the **Option** column; free-form requests that skip the
question via **Request shape**.

| Option | Request shape | Required action |
|---|---|---|
| — | Greeting, generic help request, or ambiguous task | Ask the opening question above and wait for the user's answer. |
| **0** | See or change saved preferences, or redo onboarding ("ver preferências", "mudar preferências", "atualizar configuração", "refazer onboarding") | Run `render-preferences-view.cjs` and reply with its output verbatim (rows + the change-or-back question); **no question tool** — the turn ends on that text. Follow "Update Preferences (option 0)" below. |
| **1** | Research / deep investigation / technology comparison ("pesquise sobre X", "compare X e Y") | Invoke `super.deep-research`. |
| **2** | New feature, behavior/architecture change, migration, or refactor | Classify per "Scope sizing (option 2)" below: a spike or a bounded change runs from here; architectural → invoke `super.brainstorming`. |
| **3** | Bug, regression, failing test, or unexpected behavior | Invoke `super.systematic-debugging` immediately. |
| **4** | Approved design spec/PRD and the user wants the implementation plan | Invoke `super.writing-plans` immediately. |
| **5** | Existing tasks index, task file, or "execute task X" request | Follow "Execution Mode Election (option 5)" below: option 1 (`super.subagent-driven-development`) is `(recommended)` and the user is asked before execution starts. The user naming the execution skill → invoke it directly. |
| **6** | Review/validate an **existing spec/design** doc — "review this spec", "pontos abertos/inconsistências no design", a spec path like `/super.reviewing-specs path/to/spec.md` | Invoke `super.reviewing-specs`. It runs the review lenses in parallel at the `capable` tier, reports findings by severity (honest when the spec is already sound), and only after consent applies surgical fixes and optionally re-plans tasks via `super.writing-plans`. |
| **7** | Review of **implemented** work, QA, or user-story verification | Invoke `super.user-story-verification` (or the code-review skill). This is for work that already exists in code — not for validating a spec/design doc (that is option 6). |

## Scope sizing (option 2) — three paths

Before the first question or step, classify the request. The label stays internal: the user sees what the path does — the probe, the bounded announcement or the first interview round — and can override it ("full"). The same three paths are defined in `super.brainstorming` for a session that enters it directly.

- **Spike** — a feasibility question ("can we…", "is it possible…", "quick and dirty is fine") whose output is an answer, not code you keep. State the question and what you will try in 2-3 sentences, get a nod, find out as cheaply as correctness allows, report a recommendation. No spec, no plan; anything built stays labeled throwaway. Keeping it is a new request — classify it.
- **Bounded** — a change to a flow that already exists in this repo to read: no new component, no interface others depend on, no open decision, no user story, reversible, ~1-3 files (a constant, a one-line guard, an existing validation, a small behavior tweak). Bounded measures the repo, not your familiarity with the kind of app. Skip `super.brainstorming` and `super.writing-plans`; execute with the combined gate (`bounded-path.md`). Announced, not asked: name the files and the atomic steps, and **what closes the work** — the fresh reviewer's verdict, then the final stage — in one message, and proceed in the same turn; "full" is the escape. That announcement is the whole plan and the definition of done.
- **Architectural** — everything else: a new project, subsystem or component, a change to how components fit together or to an interface others depend on, an open decision. Invoke `super.brainstorming` (spec, optional PRD, plan, execution gate).

**When in doubt between two paths, take the heavier one.** Reaching for a label to skip work is the doubt. The ratchet is one-way: hidden complexity found mid-task upgrades the path — stop, say so, step up. Nothing downgrades mid-task.

> "Mudança pequena em 2 arquivos: sigo direto, sem brainstorming nem plano. Passos: (1) …, (2) …, (3) …. Fecho com a revisão por um subagente novo e o final stage. Diga "full" se quiser o pipeline completo."

**User pauses per path — the whole list.** Spike: the nod on the probe. Bounded: none. Architectural: the spec approval — the PRD decision is one option of brainstorming's single approval gate, never a question of its own — the PRD approval when one was chosen, and the execution gate owed by every plan on disk — execution spends the most credits, and the user reads the plan before paying for it. `super.deep-research` and `super.reviewing-specs` are offered inside a message the flow already owes, never on a turn of their own. Everything else runs to the end of the final stage on its own gates. A question outside this list is model-invented.

## Update Preferences (option 0)

The reply is the output of `render-preferences-view.cjs`, verbatim — the rows and the closing question — and the turn ends there. Next turn the user's reply routes: **0** (or *voltar*) re-prints the triage; **1** (or *alterar*) re-walks the wizard with the current values pre-selected, saves and re-derives the "Session State" variables — `onboarding-preferences.md`, "Update Preferences (option 0)".

## Execution Mode Election (option 5)

When triage routes to execution, the user is asked once, at the gate that starts execution — the
same gate `super.writing-plans` opens right after writing a plan. First locate pending work
(`node <super.using-superpowers-base-dir>/scripts/superpowers-status.cjs --pending`), read the
parser (`node <super.writing-plans-base-dir>/scripts/parse-plan.cjs --tasks-index <tasks-index>`)
and open the gate: deep review (option 0), subagent-driven (1, always `(recommended)`),
plus single implementer (3, never tagged) when `singleImplementer.eligible` is true, through
the structured-question tool as the last call of the turn.

The user having named a **mode** (the execution skill's name, with or without `--single`) is
the answer given upfront; *"they're independent"*, *"just run it"* describe the plan or the
mood, not a mode — that plan is still owed the gate. The autonomous/non-interactive fallback
(only when that tool is absent from the toolset) and the full steps —
`session-state-and-gates.md`, "Execution Mode Election (option 5)" section.
