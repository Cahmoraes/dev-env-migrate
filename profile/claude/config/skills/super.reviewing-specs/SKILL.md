---
name: super.reviewing-specs
description: "Use to critically review an existing design spec (and its tasks, if any) for open decisions, unaddressed technical forks, internal contradictions, spec↔code / spec↔task inconsistencies, and — when corporate artifacts exist — spec↔corporate fidelity (whether the converted spec still honors the company's source-of-truth docs, which win on conflict) — before implementation. Runs several review lenses in parallel at the capable model tier, reports findings with severity in the session language, and only after your consent applies surgical corrections and optionally re-plans tasks via super.writing-plans. Honest when the spec is already sound — reports 'nothing to change' rather than inventing problems. Trigger whenever you have a spec/design doc and want it validated, e.g. 'review this spec', '/super.reviewing-specs path/to/spec.md', 'are there open points in my design?', 'is my design doc consistent with the code and the tasks?', 'does my spec match the corporate PRD?'."
---

# Reviewing Specs

A critical, surgical review of an **existing** design spec — and its tasks, if they exist — to find what an implementer would trip over: decisions named but never closed, technical forks raised in passing and dropped, contradictions between sections, and places where the spec disagrees with the real code or with the plan. It runs after a spec exists (post-`super.brainstorming`/`super.generating-prd`) and before or during planning, on demand.

**Entry:** the spec path is the argument — `/super.reviewing-specs path/to/spec.md`. It is also reached from **inside `super.writing-plans`' Execution Handoff** (option 0, offered right after tasks are created) — that caller already knows the spec path and hands it to you, so treat it the same as an explicit argument; do not re-ask. It hands control back to that same Execution Handoff step once you finish, so the user lands on the execution-mode choice either way — see `super.writing-plans/references/execution-handoff-message.md`, "Step 4". If the invocation carries no path (for example the user just picked "6" from the triage, or said "review my spec" with no path), **ask which spec to review before doing anything else** — never derive a slug from the working directory and never auto-pick a spec you happen to find. See Step 1.

**The one thing that makes this skill trustworthy is honesty.** A review that always finds something is worthless — the implementer learns to ignore it. When a spec closes a decision correctly, leave it alone; when it is silent on a fork that matters, name it. Never manufacture a finding to look thorough (see `./references/honest-reporting.md`, "Over-building is a YAGNI defect", for the over-building rule). The full contract: **read `./references/honest-reporting.md`**.

## 1. Locate the spec and its companions

**First, make sure you actually have a spec path — if you don't, ask; do not guess.** This skill scrutinizes exactly one spec, so running it against a spec the user did not name is a *silent* error: the reviewers would pore over the wrong document and you would report findings nobody asked for. So before resolving anything:

- If the invocation included a spec path — or the user, this turn, unambiguously pointed at one specific spec — use it.
- If it did **not** (they picked "6" from the triage, or said "review my spec" with no path), **stop and ask which spec to review**, in the user's language, and wait. Do **not** derive a feature slug from the working directory, and do **not** auto-select a spec just because discovery turns one up. To make the question easy to answer you may first look for candidate specs (`*-design.md` under `docs/superpowers/*/specs/`) and offer them as a short numbered list — but the user still chooses; a single candidate is a question, not a default.

Once you have the path, resolve the companions the review must agree with deterministically:

```bash
node <super.reviewing-specs-base-dir>/scripts/resolve-review-targets.cjs --spec <path/to/spec.md>
```

It returns JSON: `{ featureName, featureDir, repoRoot, spec, prd, tasksIndex, taskFiles[], mockups, corporateArtifacts }`. If `spec.found` is `false`, the path is wrong — stop and ask for the correct one (do not guess). The `--feature-name <slug>` + `--base-dir` form exists only for when the user gives you a slug instead of a path; it is not a license to invent a slug when none was given.

`taskFiles` is the individual `plans/task-NN.md` list — the reviewers need those, not just the index, because task↔task contradictions (the same exchange declared `durable: true` in one task and `durable: false` in another) only surface when you read the tasks against each other.

`corporateArtifacts` resolves `.superpowers/corporate-artifacts.yml` (from `repoRoot`): `{ found, enabled, declaredButDisabled, configPath, entries[] }`, each entry a local `path:` (with `resolvedPath` + `exists`) or a `url:` (`fetchable: false` — a read-only reviewer cannot fetch it). `found` is the switch that turns on **Lens 5** (spec/PRD ↔ corporate artifacts) — the review's fidelity check that the converted spec still honors the company's source-of-truth documents, which take precedence on conflict. Because that lens lets an external document **outrank the spec**, `found` requires two things: the owner's consent (`context.has_corporate_artifacts: true`) *and* at least one declared artifact. **The file being on disk is not consent.** When `declaredButDisabled` is true, Lens 5 stays off and you report the config mismatch as an out-of-scope observation (`references/honest-reporting.md`) — never as a finding against the spec.

## 2. Fan out the review lenses in parallel — always at the `capable` tier

Reviewing a spec is architectural judgment, not mechanical work — `references/model-selection.md` (in `super.subagent-driven-development`) names *review* and *ambiguous specs* as exactly what the `capable` tier is for. So the reviewers run at `capable`, **always**, regardless of how the tasks (if any) are tiered. This tier does not come from a task's `**Tier:**` field — at review time the task may not even exist — so it is fixed here and enforced mechanically. Why this matters and how the resolution works: **read `./references/capable-tier-dispatch.md`**.

**First, recover the review context — a lite re-entry.** This skill is a standalone route: run directly (`/super.reviewing-specs path/to/spec.md`) it never passed through `super.using-superpowers`' triage, so the session_* variables were never latched. Rather than re-run the full onboarding, recover only the three inputs a review consumes with one deterministic call:

> **Resolving `<super.X-base-dir>`:** the skills are siblings — parent of your header's base directory + `/super.X`. Never `glob` for one (`glob` misses dotdirs); a gate script that will not run is a **STOP**, never a skipped gate.

```bash
node <super.reviewing-specs-base-dir>/scripts/lite-reentry.cjs --repo-root <repoRoot>
# → { found, capableModel, caveman: { active, level }, language }
```

It reuses `read-preferences.cjs`'s parser in-process (no subprocess, no full re-entry) and degrades to safe defaults when there is no `preferences.yml` (`found:false`, `capableModel:"auto"`, caveman off, `language:"pt-BR"`). If you *did* arrive via triage — or via `super.writing-plans`' Execution Handoff option 0, which is always reached after triage in the nominal flow — the session state already holds these — the script just returns the same values, so the call is harmless, not wasted.

Then build the dispatch deterministically so the tier can never drift toward the controller's model:

```bash
node <super.reviewing-specs-base-dir>/scripts/build-review-dispatch.cjs \
  --targets <targets.json> --capable-model <capableModel-from-lite-reentry> \
  > <manifest.json>
node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>
```

Proceed only when `validate-dispatch` reports `valid: true` (it fails the dispatch if any reviewer's `model:` diverges from the `capable` resolution without a recorded escalation — the same gate the execution skills use). Then dispatch each lens **as a read-only subagent** (allowed tools are file reading, searching and the shell — no editing, writing or dispatching; the template explains `grep` as the default, with the platform's symbol-lookup tool as an opportunistic one-shot bonus only), passing the reviewer template **`./agents/spec-reviewer.md`** with the lens filled in. When you fill the template, also set `{LANGUAGE}` to the `language` from the lite re-entry (the session's `communication.language` — e.g. `pt-BR`) so the report and its labels come out in the user's language, and set `{CORPORATE_ARTIFACTS_OR_NONE}` to the corporate artifacts' local paths for Lens 5 (noting any URL entries as not fetchable), or "none" for the other lenses. **Set `{DOMAIN_EXPERTISE}` to a short phrase naming the spec's domain and stack** (read the spec's title/scope and the repo's stack — e.g. `"mensageria RabbitMQ / sistemas distribuídos"`; more examples in the template's placeholder note) so each lens reviews as a specialist with years in that exact domain, not a generalist; pass `"generic"` only if you truly cannot tell, and the reviewer infers it. The lenses are domain-agnostic angles; the expertise is what you match to the spec. Reviewers read; they never edit.

The lenses (full catalog with concrete probes and worked examples: **read `./references/review-lenses.md`**):

| Lens | Question it answers |
|---|---|
| **1. Coerência interna & completude** | Is every named decision/fork actually closed — across the property families the spec's domain touches (data, security/privacy-LGPD, API, concurrency, UX, async)? Do sections contradict each other? Are data contracts fully specified? Does each risk mitigation cover its own stated scenario? |
| **2. Spec ↔ realidade do código** | Do the symbols, methods, files — and, for a UI change, components/hooks/routes/i18n keys/design tokens — the spec names actually exist and behave as described? (the ghost `SseManager.fanout()` class of defect) |
| **3. Spec ↔ tasks / plano** *(only if tasks exist)* | Do the tasks close the spec's forks or contradict them? Task↔task consistency, FR coverage, scope gaps in both directions (spec decides X but no task builds it; a task builds Y the spec never decided). |
| **4. Operabilidade, ciclo de vida & testabilidade** | Rollout/rollback, lifecycle/teardown wiring (backend connections *and* frontend listener/interval cleanup), observability of new failure modes, UX operability (loading/error/empty states, a11y, i18n, responsive), and whether the test table maps to real methods and covers the risky paths. |
| **5. Spec/PRD ↔ artefatos corporativos** *(only if corporate artifacts exist)* | Does the converted spec/PRD stay faithful to the company's source-of-truth docs — nothing dropped or distorted — and never silently contradict them? Corporate artifacts win on conflict; judge the conversion semantically, never parse their format. |

Each reviewer returns findings — every one carrying **severity + the section it lives in + why it matters + a suggested fix** — **or an explicit "clean on this lens"** when it found nothing. A clean lens is a real, valuable result, not a failure to try harder.

## 3. Aggregate and report FIRST — never edit before consent

Merge the lenses' findings, dedup overlaps (Lens 1 and Lens 2 may both flag the reconnect-mitigation mismatch — collapse to one), and rank by severity: **Critical** (a bug the implementer will hit — the `durable` mismatch that closes the channel), **Important** (a real gap or inconsistency — a fork left silent, a mitigation that misses its scenario), **Minor** (polish — an undefined payload shape, a spec/task wording drift). Report format and the honesty rules: `./references/honest-reporting.md`.

Two things this report must always do:
- **Report only what needs attention — do not enumerate what is already sound.** A decision-by-decision list of everything the spec closes correctly is token cost the reader did not ask for. Preserve trust with a single **coverage** line in the verdict (which lenses/families were checked and found sound), so the reader knows the gaps you list are the real ones — not with a section of praise.
- **Be honest about a clean spec.** If every lens came back clean, the verdict is **"no changes needed"** with the one-line coverage summary of what was verified. Do not invent a Minor finding to avoid an empty report.

**Present the report and ask for a decision in two separate turns — never one.** First, post the full report as a normal chat message: plain prose/Markdown, which renders outside any elicitation dialog. Only after that message has been sent, in a second, separate turn, **ask which findings to apply using the platform's structured question tool** — with a short plain-text question (e.g. "Aplicar quais achados?") and the options schema below. Never embed the report's body, or any part of it, inside the tool's `message`/prompt field: that field is an options dialog, not a Markdown renderer, and long text there risks malformed payloads or truncation. Tool: `AskUserQuestion` on Claude Code, its equivalent elsewhere (`ask_user` on Copilot / Gemini, `ask_user_question` on Codex; see `super.using-superpowers/references/*-tools.md`). Offer these options:
- **Apply all** — apply every finding.
- **Apply a subset** — the user says which; you apply only those.
- **Save to adjust later** — keep the report as a reference and apply nothing now (persists the report, see below).
- **Discard** — no changes and no saved report.

Where the platform has no structured-question tool (a non-interactive `codex exec` run removes `ask_user_question`), fall back to the same options as a numbered prose list. Do not touch a single file before the user consents.

**If the user chooses "save to adjust later"** (they want to review the findings later and merge them into their artifacts by hand), do not just discard the report — **persist it next to the artifact it reviewed** so it survives the session:
- Write the full report to **`<feature>-review.md` in the same directory as the reviewed artifact** — `specs/<feature>-review.md` for a design spec, `prd/<feature>-review.md` if the artifact under review is a PRD. Derive the directory from the resolved `spec.path` (its parent) and the name from `featureName`.
- If that file already exists (a prior review), don't clobber it silently — write `<feature>-review-<n>.md` or confirm overwrite with the user.
- Tell the user the exact path you saved it to, so they can open it, decide, and merge later.

This is the *only* file this branch writes — you still do **not** edit the spec, PRD, or tasks. Saving the report is not "applying" it.

## 4. Apply the agreed corrections — surgically

Edit only what was agreed, and only as much as each fix needs. Distinguish a *correct fact stated in misleading prose* (fix the prose) from a *wrong decision* (change the decision). Do not rewrite a section that is already right.

**When you touch an artifact, bump its `updated_at` with the same deterministic scripts that `super.brainstorming` / `super.generating-prd` use — never hand-write the timestamp and never add a second `updated_at` line.** Hand-writing it produces a stale or wrong time and, worse, appends a duplicate key that corrupts the frontmatter. Use `frontmatter-utils.cjs --set-key` (which *replaces* the existing key) with the clock read by `get-current-datetime.cjs` (the real host time), both in `super.brainstorming/scripts/` — from this skill, at `<super.reviewing-specs-base-dir>/../super.brainstorming/scripts/`:

```bash
FU=<super.reviewing-specs-base-dir>/../super.brainstorming/scripts/frontmatter-utils.cjs
NOW=<super.reviewing-specs-base-dir>/../super.brainstorming/scripts/get-current-datetime.cjs
node "$FU" --file <spec-or-prd-path> --set-key updated_at --set-value "$(node "$NOW")"
```

Preserve `created_at` untouched. The full date rules and mechanics: `super.brainstorming/references/deterministic-scaffolding.md`.

Re-run any deterministic validator the corrected artifact has.

## 5. Offer to update the tasks

Once the spec corrections are in, **ask the user whether to update the tasks** — this is a separate decision, made after they have seen the corrected spec. If they accept **and** tasks exist (or the review found the spec now needs tasks that are missing), hand off to **`super.writing-plans`**: it re-discovers the feature's artifacts by feature-name and edits the affected `plans/task-NN.md` files or creates new ones. Keep the feature slug consistent so the discovery resolves. If the user declines, stop — the spec is corrected and that was the ask.

## 6. Close with deterministic verification

Never self-declare success. If tasks changed, re-run `super.writing-plans`' `validate-tasks.cjs` and confirm `valid: true` with full FR coverage. Search the spec and tasks for residuals of anything you corrected (a renamed symbol, a divergent argument) to prove zero stragglers. Report the verification output, not a claim.

## Reference files

- `references/honest-reporting.md` — the report format, the honesty contract (open vs closed, no manufactured findings, no over-building), minimal-edit discipline, and the tasks handoff.
- `references/review-lenses.md` — the full lens catalog: each lens's concrete probes and worked examples of the defects it catches.
- `references/capable-tier-dispatch.md` — why spec review is always `capable`, how to resolve the tier to a model, and how the dispatch is gated.
- `agents/spec-reviewer.md` — the read-only per-lens reviewer prompt template.
