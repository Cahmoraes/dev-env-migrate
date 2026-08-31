# Session Start — summary, triage question and the two sub-flows

Everything here runs **once**, at the start of a session, before anything can be compacted.
It was moved out of `SKILL.md` for exactly that reason: it is read on the first turn and on
no turn after it, so keeping it inline paid twice per invocation (message + `invoked_skills`
attachment) and was dropped on every resume anyway. The router keeps the *rules* that govern
this material; this file keeps the wording, the tables and the sub-flows.

Read this file at session start, right after the preferences bootstrap has run.

## Session Summary — the printed block

Grouping rules, the omissions and the "this block opens the turn" invariant live in
`SKILL.md`, "Session Summary". What follows is the worked example they describe.

Group by theme under a short human-readable label with a one-line gloss of what it controls,
drop the raw `session_*` names from the display (cosmetic only — `sessionState` still carries
them), pair a variable with its coupled qualifier on the same line (caveman + its level,
code-review + its effort), and collapse the three `session_model_tier_*` values into a single
line. Example (Claude Code, `session_language: pt-BR`):

> **Preferências desta sessão** (de `.superpowers/preferences.yml`):
> - **Commit automático**: ativo — subagentes commitam a cada task concluída
> - **Gate de QA**: ativo — roda a verificação das user stories ao fim da implementação
> - **Visual Companion**: ativo — o brainstorming pode oferecer o preview local em decisões visuais
> - **Idioma das respostas**: pt-BR
> - **Caveman** (compressão ~75% durante a execução): ativo, nível ultra
> - **Revisões nativas extras** — simplify: desligado · code-review final: desligado (efeito: medium)
> - **Modelos por tier**: cheap: haiku · standard: sonnet · capable: sonnet
> - **Artefatos corporativos**: ativo — 2 em `.superpowers/corporate-artifacts.yml`

**The block is these eight rows, in this order, on every platform.** Exactly one row varies **by
platform**: "Revisões nativas extras" (row 8 varies by state, not by harness). Every other row — including **"Modelos por tier", which is
cross-platform** — is printed unchanged everywhere. The example above is labelled Claude Code
only because of that one row; it is not a Claude-Code-only block, and dropping a row because
the example came from another harness is the failure this paragraph exists to prevent.

Row 6 per platform (list the **current** platform's native-review vars, omit the other's —
they are inert, always `false`):

| Platform | "Revisões nativas extras" row |
|---|---|
| Claude Code | `simplify: <estado> · code-review final: <estado> (efeito: <effort>)` |
| Copilot CLI | `Copilot review final: <estado>` |
| Any other | omit the row entirely — no native-review vars apply |

Row 8 is a preference row like any other — **it is printed whether corporate artifacts are on
or off**, because a user who cannot see that the switch is off cannot know the company's
documents are being ignored. What varies is what it says. Read `corporateArtifacts` off the
bootstrap JSON (`declared` = the file exists and lists at least one entry; `enabled` = the
consent flag) and take the matching row:

| `declared` | `enabled` | Row 8 |
|---|---|---|
| ✓ | ✓ | **Artefatos corporativos**: ativo — `<count>` em `.superpowers/corporate-artifacts.yml` |
| ✓ | ✗ | **Artefatos corporativos**: desligado — `<count>` declarado(s) em `.superpowers/corporate-artifacts.yml`, **não carregados** (peça para ativar) |
| ✗ | ✓ | **Artefatos corporativos**: ativo, mas `.superpowers/corporate-artifacts.yml` não existe |
| ✗ | ✗ | **Artefatos corporativos**: desligado |

Name the file by its **repo-relative** path, the way the block header names
`.superpowers/preferences.yml` — `configPath` comes back absolute. **Never list the declared
entries**: the row says that corporate documents exist and how many, never which. Under
consent the router reads the file itself; without consent, a path list in context is an
invitation to act on a declaration the user never made.

## Opening Triage — the numbered question

Render the numbered list exactly like this (the user may reply with a number **or** describe
their need in their own words). Ask it in the configured language, on its own turn — **translate
the bold labels and the dashes into that language; the digits `0`–`7`, their order, and the
route each one maps to are fixed and never renumbered or reordered.**

  > How can I help? Pick a number or just tell me what you need:
  >
  > 0. **Preferences** — update your preferences
  > 1. **Research** — technical research/investigation
  > 2. **Brainstorming** — new feature, refactor, migration, architecture change
  > 3. **Debugging** — bug, regression, failing test
  > 4. **Planning** — approved spec/PRD → execution plan
  > 5. **Execution** — existing tasks → implementation
  > 6. **Spec review** — validate an existing spec/design (open points, inconsistencies, spec↔code/tasks)
  > 7. **Review/QA** — review implemented work or verification

Map a bare numeric reply (`0`–`7`) via the **Option** column; free-form requests that skip the
question via **Request shape**.

| Option | Request shape | Required action |
|---|---|---|
| — | Greeting, generic help request, or ambiguous task | Ask the opening question above and wait for the user's answer. |
| **0** | Change/update saved preferences or redo onboarding ("mudar preferências", "atualizar configuração", "refazer onboarding") | Re-run the preferences wizard — follow "Update Preferences (option 0)" below. |
| **1** | Research / deep investigation / technology comparison ("pesquise sobre X", "compare X e Y") | Invoke `super.deep-research`. |
| **2** | New feature, behavior/architecture change, migration, or refactor | Invoke `super.brainstorming` immediately. |
| **3** | Bug, regression, failing test, or unexpected behavior | Invoke `super.systematic-debugging` immediately. |
| **4** | Approved design spec/PRD and the user wants the implementation plan | Invoke `super.writing-plans` immediately. |
| **5** | Existing tasks index, task file, or "execute task X" request | **Never invoke an execution skill directly** — follow "Execution Mode Election (option 5)" below. Sole exception: the user already named a mode ("execute com worktrees", "parallel in-tree") → invoke that skill directly. |
| **6** | Review/validate an **existing spec/design** doc — "review this spec", "pontos abertos/inconsistências no design", a spec path like `/super.reviewing-specs path/to/spec.md` | Invoke `super.reviewing-specs`. It runs the review lenses in parallel at the `capable` tier, reports findings by severity (honest when the spec is already sound), and only after consent applies surgical fixes and optionally re-plans tasks via `super.writing-plans`. |
| **7** | Review of **implemented** work, QA, or user-story verification | Invoke `super.user-story-verification` (or the code-review skill). This is for work that already exists in code — not for validating a spec/design doc (that is option 6). |

## Scope auto-sizing (option 2) — the semantic derivation rubric

Derive the signals from the request's *intent*, not keywords ("criar uma API" = new component;
"consumir uma API" = integration); take the lightest tier whose **all** criteria match, one
heavier when in doubt.

### Classification checklist

| Tier | `fileScope` | `abstraction` | `prd` | `decision` | `steps` |
|---|---|---|---|---|---|
| **Micro** | single-existing | none | none | none | 1 |
| **Small** | few-existing | none | none (not PRD-worthy) | none | 1-3 |
| **Medium** | new-component / few-existing | small | optional | none | 3-8 |
| **Large** | multi-component | yes | required | may-exist | 8+ |
| **Complex** | cross-cutting | ambiguous | required | open-fork | 8+ ambiguous |

```bash
<super.using-superpowers-base-dir>/scripts/assess-complexity.cjs --checkpoint 0 --signals '{"fileScope":"…","abstraction":"…","prd":"…","decision":"…","steps":<number>,"text":"<raw request>"}'
```

Use the exact enum strings from the table — a loose value throws. `micro` →
`requiresConfirmation: true`: offer the confirming question before skipping
`super.brainstorming`/`super.writing-plans`, never skip silently. `complex` → `consentGates:
["deep-research"]`: offer `super.deep-research` first, defaulting to skip, route in only on
consent.

The bootstrap `cat`s this file in the same call as the state read, so keeping the table and
the invocation here costs no extra round trip.

Depth is set by complexity, not run at full ceremony every time — full-ceremony provisioning
is the dominant context cost on small changes. Take the lightest tier whose **all** criteria
match; the moment a heavier tier's criterion appears (a new abstraction, a cross-cutting
change, ambiguous or novel-domain requirements), move up a tier; when in doubt, go heavier.

This is a **semantic derivation rubric**, not a keyword lookup: read the request's intent and
map it to the JSON signal *values*. The same noun resolves differently by intent — *creating
or exposing* an API is `fileScope: new-component|multi-component, abstraction: yes`;
*consuming or integrating* an existing API is `fileScope: few-existing, abstraction:
none|small`.

Checkpoint 0 is light and inline — no subagent; the rigorous semantic derivation via the
`complexity-interpreter` subagent runs at the binding checkpoints 1/2 inside
`super.brainstorming`. Its output only decides how `super.brainstorming` *starts* (flat
one-question pass vs full fan-out) — never pass its tier forward as `--prior-tier`; the real
commitment happens inside `super.brainstorming` at checkpoint 1, once genuine interview signal
exists. A mis-keyed or loose enum value now throws (the script no longer silently defaults to
Medium). Full checkpoint model, the confidence gate, and the reason unknown signals default to
Medium (not Micro): `complexity-checkpoints.md` — which also covers requests that skip the
numbered triage entirely and enter `super.brainstorming` directly ("opção 2" free-form).

**Micro:** skip `super.brainstorming` and `super.writing-plans`; execute inline with combined
gate. Only for truly trivial changes (constant, one-line guard, local rename). It requires a
confirming question, not a silent skip: when checkpoint 0 (or checkpoint 1) returns
`requiresConfirmation: true` — always true for a `micro` result computed at checkpoint 0 —
offer the lightweight-path-style confirming question before skipping. See
`complexity-checkpoints.md`, "Why Micro gets a confirming question."

**Complex:** routes like Large through execution (full gates, unchanged), but
`assess-complexity.cjs` emits a `consentGates` field so the controller proactively **offers**
two token-costly stages, one at a time, each skipped unless the user consents:
`super.deep-research` before brainstorming (checkpoint 0/1, `consentGates: ["deep-research"]`,
a single yes/no defaulting to skip because it costs tokens) and `super.reviewing-specs` after
the design (checkpoint 2, `["reviewing-specs"]`). Full pattern and both confirming questions:
`complex-path.md`.

**What each tier provisions** (artifacts per tier, the per-path references, and the
verification-rigor invariant) — `triage-sizing.md`. The router only needs the tier itself;
read that file when you need to know what the tier builds.

## Update Preferences (option 0)

Lets the user revise `.superpowers/preferences.yml` mid-session without hand-editing YAML (the
multi-question counterpart to a single named key like "set auto_commit false"). **Do not
hardcode a platform tool;** the wizard abstracts the structured-question tool per platform.
Load current values with `read-preferences.cjs` (each as the pre-selected default), re-walk the
wizard, save with `write-preferences.cjs`, re-derive the router's "Session State" variables,
return to triage. Full steps — `onboarding-preferences.md`, "Update Preferences (option 0)"
section.

## Execution Mode Election (option 5)

When triage routes to execution, **the user — not you — chooses the execution mode** (never
default to `super.subagent-driven-development` because it "is the default" — that is the exact
bug this section prevents). Exception, and it is narrow: the user named a **mode**, meaning the
skill's name. *"In parallel"*, *"at the same time"*, *"they're independent"* name a **property
two of the three modes share**, so they elect neither and the exception does not fire — that
reading is how a plan the rubric sent to worktrees ends up running in-tree with nobody asked.
Otherwise: locate pending work
(`superpowers-status.cjs --pending`), derive the recommendation from wave shape
(`parse-waves.cjs`), present the three options (Subagent-Driven / Parallel in-tree / Parallel
worktrees) with `(recommended)` elected by the rubric — **never hardcoded on option 1** — and
wait for the choice. Full steps (script invocations, sibling-skill path resolution, handoff
message) — `session-state-and-gates.md`, "Execution Mode Election (option 5)" section.
