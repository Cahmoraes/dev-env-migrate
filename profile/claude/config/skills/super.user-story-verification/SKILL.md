---
name: super.user-story-verification
description: "QA Gate that verifies each PRD user story against the live implementation via parallel subagents — running/creating acceptance tests and capturing UI screenshots (playwright-cli) — producing a PASSED/FAILED/PARTIAL report with evidence. Invoked by super.subagent-driven-development, super.parallel-subagent-in-tree, and super.parallel-subagent-development before super.finishing-a-development-branch, or directly to confirm all PRD user stories are implemented before merge/PR. Activate on 'rodar QA', 'verificar user stories', 'validar implementação contra PRD', 'run acceptance tests', 'generate QA report'."
---

# User Story Verification

QA Gate that verifies each PRD user story against the implementation before a branch can be merged or submitted for PR. Collects test evidence and UI screenshots, then produces a consolidated report.

**Announce at start:** "I'm using the super.user-story-verification skill to verify user stories against the implementation."

Throughout, **"the orchestrator"** means whichever skill invoked this gate: `super.subagent-driven-development`, `super.parallel-subagent-in-tree`, or `super.parallel-subagent-development`.

## Why This Gate Exists

Unit tests and code reviews verify *how* the code works; this gate verifies *what* the feature does for the user. Before merge there must be evidence each PRD user story was delivered — behaviors exist, flows work end-to-end, screenshots capture the real UI. Without it, branches that pass linting and unit tests still ship missing user-facing requirements.

**This gate is opt-in at every tier.** It boots a server and drives a browser (screenshots via `playwright-cli`), so it is never automatic — the controller offers it and runs it only on user consent, at any tier. It is **not** part of the mandatory verification gate (which is spec coverage + mutation + code-quality, always-on and blind). What varies by tier is only the mechanism when the user *does* opt in: in **Small/Medium** (`super.using-superpowers/references/medium-inline-path.md`) the boot-app / run-primary-flow / screenshot mechanism runs **once, inline**, not fanned out per story; in **Large/Complex** this skill's full mechanism applies unchanged — one QA subagent per story, dispatched in parallel waves, exactly as described below. Declining QA (any tier) skips only this user-observable lens; the mandatory verification gate still runs.

---

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| PRD path | Passed in context by the orchestrator, or discovered automatically | Required |
| Feature name | Derived from PRD path | Required |
| Test runner command | Detected from project files | Required |
| Browser automation tool | Detected via `playwright-cli` availability or project dependencies | Optional |

---

## Process

### Step 1: Discover PRD and Extract User Stories

Locate the PRD by priority:
1. **Explicit path** — passed in context by the orchestrator
2. **Deterministic derivation** — `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`
3. **Directory scan** — `prd-`-prefixed files in `docs/superpowers/<feature-name>/prd/`
4. **Embedded in spec** — a physical PRD file is not the only valid form. Small/Medium (`medium-inline-path.md`, "PRD folded or skipped") permits folding requirements straight into the spec instead of writing a separate PRD file — the same case `super.writing-plans`' FR-coverage gate already handles via `find-feature-files.cjs`. Run `node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>` and check `prd.embeddedIn`: if set (reported with `code: 'prd-embedded-in-spec'`), treat that spec path as the PRD source for every step below — `generate-slugs.cjs` only needs a markdown path containing `Como/eu quero/para que` story lines, regardless of filename.

**If no PRD is found — neither a physical file nor one embedded in the spec:** report `"No PRD found for this feature — skipping QA gate."` and return control to the caller without blocking. This is the genuine "nothing to verify" case, not a symptom of the PRD having been folded — priority 4 above already covers folding.

Extract user stories deterministically with `scripts/generate-slugs.cjs` — see `references/slug-extraction.md` for the command, JSON shape, ID-marker tolerance, and manual fallback.

From the PRD also extract:
- All **Histórias de Usuário** (`Como [persona], eu quero [ação] para que [benefício]`)
- All **Requisitos Funcionais** (`FR-001`, `FR-002`...) and their mapping to each story
- The **Fora de Escopo** section — never verify excluded features

### Step 2: Set Up QA Directory

Create the evidence tree before dispatching any subagents:

```
docs/superpowers/<feature-name>/
  qa/
    evidence/
      us-01-cancelar-pedido/        # one dir per story, named by the JSON `slug` (already prefixed)
      us-02-bloquear-cancelamento/
      ...
```

### Step 3: Detect Project Capabilities

Gather this **before** dispatching so every subagent receives accurate context.

**Test runner** — check in order: `package.json` `scripts.test` (vitest/jest/playwright) → `pyproject.toml` / `pytest.ini` (pytest) → `Cargo.toml` (cargo test) → `go.mod` (go test ./...).

**Browser automation** — check in order:
- `playwright-cli` available (`playwright-cli --version` or `npx playwright-cli --version`) → playwright-cli ✅ *(preferred — installs no new dependency)*. Task 3 below covers the minimal flow and when to reach for the fuller `/playwright-cli` skill instead.
- `@playwright/test` in `devDependencies` → Playwright ✅
- `puppeteer` in deps/devDeps → Puppeteer ✅
- None found → screenshots unavailable ⚠️ (note in report, do not fail)

**Never install** a browser automation library (`npm install`, `pip install`, etc.) to enable screenshots; if none is found, mark screenshots unavailable and continue.

**Stack readiness for screenshots (decide once, before dispatch):** if browser automation is available and at least one user story is UI-facing, the orchestrator — never an individual subagent — boots or confirms the app stack is reachable (e.g. `docker compose up`, `pnpm dev`) and records the resulting base URL. Pass that URL to every subagent via the dispatch template's **App base URL** field. This is a one-time decision made once for the whole wave, not a per-subagent judgment call repeated 3-8 times in parallel — that duplication is what previously produced inconsistent screenshot coverage across otherwise-equivalent UI stories. If no story is UI-facing, or browser automation is unavailable, skip this step and set the field to "not applicable." If a boot is attempted but fails or the stack stays unreachable (port in use, no Docker, broken build, missing env), treat screenshots as unavailable — set the field to "not applicable," note the boot failure in the report, and continue; never block the gate on it (a story that needed a screenshot degrades to `PARTIAL`, per the "never block on screenshots" rule).

**Acceptance test location (one rule, applies everywhere):** acceptance tests created by QA subagents go **only** in `docs/superpowers/<feature-name>/qa/evidence/<us-slug>/<us-slug>-<short-description>.acceptance.test.<ext>`. For JS/TS they run directly via full path (e.g. `npx vitest run docs/superpowers/.../us-001-foo.acceptance.test.tsx`). **Never** place new test files in the project source tree (`apps/`, `src/`, `lib/`, or any project test directory). For non-JS/TS ecosystems (Go, Rust, Python...), skip creating new test files — capture evidence through existing tests and playwright-cli screenshots instead.

**TypeScript path-alias resolution (JS/TS projects only):** before dispatching, run `node scripts/setup-qa-tsconfig.cjs --ensure-templates --repo-root "$(git rev-parse --show-toplevel)"` once. It auto-detects each app's tsconfig(s) and writes/reuses `docs/superpowers/tsconfig.<frontend|backend>-qa.json` templates so acceptance tests saved in the evidence tree resolve `@/...`-style imports in the editor instead of showing false "Cannot find module" errors. See `references/qa-typescript-resolution.md` for the full design and the disambiguation flags if it reports an `ambiguous` warning.

### Step 4: Dispatch QA Subagents in Parallel

Launch one background subagent per user story, in parallel waves of up to **3 subagents** at a time. Do not wait for one wave to finish before launching the next while stories remain.

Set an explicit `model:` on each dispatch — QA is a validation gate over many user stories and leans on executable acceptance tests, so floor it at `standard` (a wave fans out many subagents — don't over-provision); never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section).

Give each subagent exactly this context:

---
```
You are a QA verification subagent. Your sole job: verify one user story is implemented correctly and collect evidence.

**User Story**: [full user story text]
**Associated Requirements**: [FR-001: ..., FR-002: ...]
**Feature PRD**: [path]
**Feature Spec**: [path]
**Test runner command**: [command, e.g. "npx vitest run"]
**Browser automation**: [playwright-cli | Playwright | Puppeteer | not available]
**App base URL**: [confirmed URL the orchestrator booted the stack against, e.g. http://localhost:3000 — or "not applicable"]
**Evidence directory**: docs/superpowers/<feature-name>/qa/evidence/<us-slug>/
**Acceptance tests location**: if you need to create new tests, save them ONLY inside this evidence directory — never in the project source tree.

**Caveman Mode**: [paste the `block` field from `node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level> --format field` — the bare directive when on, empty when off (then omit). Do NOT hand-write it.]

---

### Task 1 — Consume IV Coverage, Then Locate the Story's Tests

**First, read the Independent Verification report** at `docs/superpowers/<feature-name>/qa/validation-<feature-name>.md` — the IV gate always runs, unconditionally, before this QA gate, and has already re-derived (blind, evidence-or-zero) every FR/AC → `file:line` + assertion expression + spec-defined value, plus mutation testing proving the tests kill regressions. Take its per-FR verdict (covered / correct-value / surviving-mutant) as given: do **not** re-map tests→FRs from scratch, and do **not** re-judge whether the implementation's *mechanism* matches an FR's literal text (a protocol, a header, a specific endpoint, an algorithm) — the IV already did that at the assertion level. QA's job here is narrower and insubstitutable: confirm the user story is **observable to the user** when the app actually runs (Tasks 2-3). Only the fallback below reopens mechanism fidelity.

**Fallback (no IV report).** If `validation-<feature-name>.md` does not exist (e.g. this QA gate was run in isolation, without the IV having run), search the codebase for tests covering this story's behaviors — files testing the related components/functions/routes/endpoints and asserting its FR-XXX outcomes — and, if an associated FR names a concrete mechanism the implementation satisfies through a *different* mechanism, quote the FR's literal text against what the tests exercise, record the divergence in `notes`, and mark the story `PARTIAL` even when every test is green.

Then, in both cases, locate the test files exercising this story's behaviors to gather its runnable evidence (the IV report's `file:line` references point straight at them when present).

Run **only** those files or a narrow pattern matching them:
```bash
[test runner command] [relevant files or pattern]
```
**Never run the full, unfiltered test suite** — up to 3 subagents run this task concurrently in the same wave, and a full-suite run from one collides with the others (shared resource contention, unrelated failures bleeding into this story's result). Scope the command to this story's files every time, even if that means a shorter list than the whole feature.

Summarize the results (pass/fail counts, relevant test names) into `result.json`'s `test_output_summary` field. Do not save raw test output as a file.

---

### Task 2 — Create Missing Acceptance Tests (if needed)

If no existing test covers this story (or coverage is clearly partial), write a minimal acceptance test verifying its primary behavior end-to-end.

- **JS/TS only** — before saving, run `node scripts/setup-qa-tsconfig.cjs --scaffold-evidence --repo-root "$(git rev-parse --show-toplevel)" --evidence-dir docs/superpowers/<feature-name>/qa/evidence/<us-slug> --kind <frontend|backend>` (pick the kind matching whichever app the test imports from) — this scaffolds a per-story `tsconfig.json` and `node_modules` symlink so the editor resolves the app's path aliases; see `references/qa-typescript-resolution.md`. Then save the file in the evidence directory as `<us-slug>-<short-description>.acceptance.test.<ext>` (e.g. `us-003-theme-persistence.acceptance.test.tsx`); run it immediately via its full path; record the path(s) in `evidence/<us-slug>/acceptance-tests-created.txt`.
- **Non-JS/TS** — skip; capture evidence via existing tests (Task 1) and playwright-cli screenshots (Task 3).
- **Never** add test files to the project source tree (`apps/`, `src/`, `lib/`, or any project test directory).

If comprehensive tests already exist, skip this task.

---

### Task 3 — Capture UI Screenshot (if browser automation is available)

Use the **App base URL** given above — the orchestrator already booted or confirmed the stack for the whole wave. Do not start the stack yourself and do not decide whether it's "worth it" to try; that judgment was already made once, upstream, for every subagent. If the field says "not applicable", skip this task entirely.

**If `playwright-cli` is available** (preferred):
```bash
playwright-cli open <App base URL>
playwright-cli goto /feature-path
playwright-cli screenshot --filename=evidence/<us-slug>/screenshot.png
playwright-cli close
```
Save the screenshot to `evidence/<us-slug>/screenshot.png`. If the story is behind auth (e.g. an admin-only panel) or needs interaction before the screenshot is meaningful (fill a form, click into a detail view, wait for a modal), this minimal flow is not enough — invoke the `/playwright-cli` skill directly for the full command set (`snapshot`/`click`/`fill`/`state-save`/`state-load`, etc.) instead of improvising with only `open`/`goto`/`screenshot`/`close`.

**If `@playwright/test` or `Puppeteer` is available** (library-based): write a minimal script that navigates to `<App base URL>` plus the feature's primary UI state and captures a screenshot. Save it to `evidence/<us-slug>/screenshot.png` and the script to `evidence/<us-slug>/screenshot-script.ts` (or `.js`).

The screenshot must show the feature from the user story in its natural state. If browser automation is **not** available, skip this task entirely — it does not affect gate status.

---

### Task 4 — Write Result

Create `evidence/<us-slug>/result.json`:

```json
{
  "us_id": "us-001",
  "user_story": "[full story text]",
  "requirements": ["FR-001", "FR-002"],
  "status": "PASSED|FAILED|PARTIAL|UNVERIFIABLE",
  "existing_tests_found": true,
  "acceptance_tests_created": ["docs/superpowers/<feature-name>/qa/evidence/<us-slug>/<us-slug>-<desc>.acceptance.test.tsx"],
  "test_output_summary": "15 tests passed, 0 failed",
  "screenshot_path": "evidence/<us-slug>/screenshot.png",
  "failure_details": null,
  "notes": ""
}
```

**Status guide:**
- `PASSED` — behavior verified (tests pass; screenshot captured if browser available)
- `FAILED` — tests fail, a created acceptance test fails, or critical behavior is missing
- `PARTIAL` — tests pass but some aspect could not be verified (e.g. no browser for screenshot; coverage exists but incomplete); or — **only in the no-IV-report fallback** — the implementation satisfies the story's outcome through a mechanism different from the one its FR names literally (record which, and why, in `notes`). When the IV report exists, mechanism fidelity is the IV's verdict, not a QA reason for `PARTIAL`
- `UNVERIFIABLE` — cannot locate or write tests for this story; document the reason in `notes`
```
---

### Step 5: Collect Results and Generate QA Report

Wait for all subagents to complete — **never poll for them.** They run in the background and the harness re-invokes you as each returns; simply wait for their results. Do **not** `sleep` or schedule a wakeup/timer to "check on" subagents you just launched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. Once they have returned, read every `evidence/<us-slug>/result.json`.

**Reconcile coverage first (deterministic backstop).** Assert `count(readable result.json) === count(PRD user stories)`. Any story whose `result.json` is missing, empty, or unparseable (e.g. its subagent crashed before writing) is `FAILED` with `notes` "no result captured — subagent did not complete" and counts in the tally — a missing result is a verification failure, never a silently dropped story. If the PRD yielded **zero** stories, report `UNVERIFIABLE` (nothing to verify), not a vacuous `PASSED`.

**Compute overall status** (first match wins, so every combination of per-story statuses maps to exactly one overall status):
- `FAILED` — one or more stories are `FAILED`.
- `PASSED` — every story is `PASSED`.
- `PARTIAL` — no story is `FAILED`, but at least one is `PARTIAL` or `UNVERIFIABLE`. Continue, recording the reason in the report notes.

Save the report using the template and date rules in `references/qa-report-structure.md` (it points to the canonical `assets/qa-report-template.md` and the frontmatter-date mechanics).

### Step 6: Gate Decision

**If status is `PASSED` or `PARTIAL`:**

```
✅ QA Gate passed — N/M user stories verified.
QA report saved to: docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md
Returning control to orchestrator.
```

Return control to the orchestrator to proceed to `super.finishing-a-development-branch`.

**If status is `FAILED`:**

```
❌ QA Gate failed — N user story(ies) did not pass verification.

Failed stories:
- US-002: [failure description]
- US-003: [failure description]

QA report: docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md

Cannot proceed with merge or PR until the failures above are addressed.
Fix the implementation, then re-run the orchestrator.
```

When fixing: the orchestrator skips tasks already `[x]`/`DONE`, so a bare re-run is a no-op. To re-execute a completed task a failed story depends on — trace it via the story's `FR-XXX` mappings to the task's PRD/Spec — first flip it back with `mark-task-status.cjs --status IN_PROGRESS`. A failure in the *interaction between* tasks (not any single one) is fixed directly in code, not by re-running a task.

**STOP.** Do not return control to the orchestrator for branch finishing until this gate is resolved — the orchestrator must not invoke `super.finishing-a-development-branch`.

---

## Red Flags

**Never:**
- Skip a user story — verify all PRD stories
- Run the full, unfiltered test suite in Task 1 — scope every run to the story's own files (concurrent subagents in the same wave share resources)
- Mark a story `PASSED` without running a test or verifying a behavior
- Re-derive FR/AC coverage or re-judge FR mechanism fidelity from scratch when `validation-<feature-name>.md` exists — consume the IV's verdict instead
- In the no-IV-report fallback only, mark a story `PASSED` when its FR names a mechanism the implementation does not actually use — even if the behavioral outcome is satisfied; use `PARTIAL` and record the divergence in `notes`
- Proceed to merge/PR when gate status is `FAILED`
- Create evidence for "Fora de Escopo" features
- Block the pipeline because screenshots are unavailable (browser automation is optional)
- Add test files to the project source tree — acceptance tests live only in the evidence directory
- Copy an acceptance test into the project source tree to work around a TypeScript "Cannot find module" editor warning — run `scripts/setup-qa-tsconfig.cjs --scaffold-evidence` instead (`references/qa-typescript-resolution.md`). Copying into a tree shared with other parallel QA subagents can race another subagent's test run.
- Install a browser automation library — use `playwright-cli` or mark screenshots unavailable
- Save raw test output to a file — summaries go in `result.json`'s `test_output_summary`

**Always:**
- Save `result.json` for every story, even `UNVERIFIABLE` ones
- Pass the complete PRD and spec to each subagent
- Create evidence directories before dispatching subagents
- Include failure details and evidence paths in the report on `FAILED`
- Keep new acceptance tests in the evidence directory, never the project source tree

---

## Integration

**Invoked by:** the orchestrator — after all tasks complete and the final code reviewer approves, when a PRD exists **and the user opts into QA verification**, before `super.finishing-a-development-branch` is called. Tier mechanism (Large/Complex fan-out vs. Small/Medium inline) is covered above under "Why This Gate Exists."
**Artifacts saved to:** `docs/superpowers/<feature-name>/qa/`
**Required context:** PRD path, feature name, test runner command
**Optional context:** playwright-cli, Playwright, or Puppeteer availability
