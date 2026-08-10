---
name: super.user-story-verification
description: "QA Gate that verifies each PRD user story against the live implementation via parallel subagents — running/creating acceptance tests and capturing UI screenshots (playwright-cli) — producing a PASSED/FAILED/PARTIAL report with evidence. Invoked by super.subagent-driven-development, super.parallel-subagent-in-tree, and super.parallel-subagent-development before super.finishing-a-development-branch, or directly to confirm all PRD user stories are implemented before merge/PR. Activate on 'rodar QA', 'verificar user stories', 'validar implementação contra PRD', 'run acceptance tests', 'generate QA report'."
user-invocable: false
---

# User Story Verification

QA Gate that verifies each PRD user story against the implementation before a branch can be merged or submitted for PR, collecting test evidence and UI screenshots into a consolidated report.

**Announce at start:** "I'm using the super.user-story-verification skill to verify user stories against the implementation."

Throughout, **"the orchestrator"** means whichever skill invoked this gate: `super.subagent-driven-development`, `super.parallel-subagent-in-tree`, or `super.parallel-subagent-development`.

> **Recovery pointer:** `./references/gate-context.md` — why this gate exists, its tier mechanism (opt-in at every tier; inline in Small/Medium), its pipeline placement, and the rationale behind Step 3's once-per-wave stack boot. Entry material: read once when deciding to run the gate, never needed mid-run.

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
4. **Embedded in spec** — a physical PRD file is not the only valid form. Small/Medium (`medium-inline-path.md`, "PRD folded or skipped") permits folding requirements straight into the spec. Run `node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>` and check `prd.embeddedIn`: if set (reported with `code: 'prd-embedded-in-spec'`), treat that spec path as the PRD source for every step below — `generate-slugs.cjs` only needs a markdown path containing `Como/eu quero/para que` story lines, regardless of filename.

**If no PRD is found — neither a physical file nor one embedded in the spec:** report `"No PRD found for this feature — skipping QA gate."` and return control to the caller without blocking. This is the genuine "nothing to verify" case; priority 4 above already covers a folded PRD.

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

**Never install** a browser automation library to enable screenshots; if none is found, mark screenshots unavailable and continue.

**Stack readiness for screenshots (decide once, before dispatch):** if browser automation is available and any story is UI-facing, the orchestrator — never a subagent — boots or confirms the stack (`docker compose up`, `pnpm dev`) and passes the resulting base URL to every subagent via **App base URL**, once for the whole wave. No UI-facing story, or no browser automation → skip this step, field is "not applicable." Boot fails or stack stays unreachable → same: field "not applicable," note it in the report, continue; never block the gate on it (the story degrades to `PARTIAL`). Rationale: `./references/gate-context.md`.

**Acceptance test location (one rule, applies everywhere):** acceptance tests created by QA subagents go **only** in `docs/superpowers/<feature-name>/qa/evidence/<us-slug>/<us-slug>-<short-description>.acceptance.test.<ext>`. For JS/TS they run directly via full path (e.g. `npx vitest run docs/superpowers/.../us-001-foo.acceptance.test.tsx`). **Never** place new test files in the project source tree (`apps/`, `src/`, `lib/`, or any project test directory). For non-JS/TS ecosystems (Go, Rust, Python...), skip creating new test files — capture evidence through existing tests and playwright-cli screenshots instead.

**TypeScript path-alias resolution (JS/TS projects only):** before dispatching, run `node scripts/setup-qa-tsconfig.cjs --ensure-templates --repo-root "$(git rev-parse --show-toplevel)"` once — it writes/reuses `docs/superpowers/tsconfig.<frontend|backend>-qa.json` templates so acceptance tests saved in the evidence tree resolve `@/...`-style imports in the editor instead of showing false "Cannot find module" errors. See `references/qa-typescript-resolution.md` for the full design and the disambiguation flags for an `ambiguous` warning.

### Step 4: Dispatch QA Subagents in Parallel

Launch one background subagent per user story, in parallel waves of up to **3 subagents** at a time. Do not wait for one wave to finish before launching the next while stories remain.

Set an explicit `model:` on each dispatch — QA is a validation gate over many user stories and leans on executable acceptance tests, so floor it at `standard`; never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section).

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
**Report language**: [`session_language` — write every human-readable string you author (`result.json`'s `notes`, `failure_details`, `test_output_summary`) in this language. Keep the JSON keys, the `status` enum tokens (`PASSED`/`FAILED`/`PARTIAL`/`UNVERIFIABLE`), and every identifier (`us-001`, `FR-001`) verbatim — they are a machine contract.]

---

### Task 1 — Consume IV Coverage, Then Locate the Story's Tests

**First, read the Independent Verification report** at `docs/superpowers/<feature-name>/qa/validation-<feature-name>.md` — the IV gate always runs, unconditionally, before this QA gate, and has already re-derived (blind, evidence-or-zero) every FR/AC → `file:line` + assertion expression + spec-defined value, plus mutation testing proving the tests kill regressions. Take its per-FR verdict (covered / correct-value / surviving-mutant) as given: do **not** re-map tests→FRs from scratch, and do **not** re-judge whether the implementation's *mechanism* matches an FR's literal text (a protocol, a header, a specific endpoint, an algorithm) — the IV already did that at the assertion level. QA's job here is narrower and insubstitutable: confirm the user story is **observable to the user** when the app actually runs (Tasks 2-3). Only the fallback below reopens mechanism fidelity.

**Fallback (no IV report).** If `validation-<feature-name>.md` does not exist (e.g. this QA gate was run in isolation, without the IV having run), search the codebase for tests covering this story's behaviors — files testing the related components/functions/routes/endpoints and asserting its FR-XXX outcomes — and, if an associated FR names a concrete mechanism the implementation satisfies through a *different* mechanism, quote the FR's literal text against what the tests exercise, record the divergence in `notes`, and mark the story `PARTIAL` even when every test is green.

Then, in both cases, locate the test files exercising this story's behaviors (the IV report's `file:line` references point straight at them when present).

Run **only** those files or a narrow pattern matching them:
```bash
[test runner command] [relevant files or pattern]
```
**Never run the full, unfiltered test suite** — QA fans out, so one full run becomes one per story, and concurrent siblings then collide on shared resources. Scope to this story's files every time, even if the list is short.

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

Use the **App base URL** given above — the orchestrator booted or confirmed the stack for the whole wave. Do not start it yourself, and do not re-decide whether it's worth trying; that was settled once, upstream. If the field says "not applicable", skip this task.

**Cap: 3 capture attempts** (one attempt = navigate → capture). On the third failure (auth you cannot satisfy, a state you cannot reach), stop: say why in `notes`, leave `screenshot_path` null, mark the story `PARTIAL` per the Status guide — an unverified aspect, not a failure — and move on. Normal outcome, not a wall to push through: a 4th try cannot move it off `PARTIAL`, only spend wall clock. No throwaway debug scripts.

**If `playwright-cli` is available** (preferred):
```bash
playwright-cli open <App base URL>
playwright-cli goto /feature-path
playwright-cli screenshot --filename=evidence/<us-slug>/screenshot.png
playwright-cli close
```
Behind auth, or needing interaction before the shot means anything (fill a form, open a detail view, await a modal)? This minimal flow is not enough — invoke the `/playwright-cli` skill for the full command set (`snapshot`/`click`/`fill`/`state-save`/`state-load`) instead of improvising around `open`/`goto`/`screenshot`/`close`: the retry worth spending reaches for the right tool, not another guess at the same one.

**If `@playwright/test`/`Puppeteer` is available** (library-based): write one minimal script navigating to `<App base URL>` plus the story's primary UI state and capturing the shot. Save it as `evidence/<us-slug>/screenshot.png`, the script as `evidence/<us-slug>/screenshot-script.ts` (or `.js`).

The shot must show the story's feature in its natural state. If browser automation is **not** available, skip this task — it does not affect gate status.

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
- `PARTIAL` — tests pass but some aspect could not be verified (e.g. no browser for screenshot; coverage exists but incomplete); or — **only in the no-IV-report fallback** — the implementation satisfies the story's outcome through a mechanism different from the one its FR names literally (record which, and why, in `notes`)
- `UNVERIFIABLE` — cannot locate or write tests for this story; document the reason in `notes`
```
---

### Step 5: Collect Results and Generate QA Report

Wait for all subagents to complete — **never poll for them.** They run in the background and the harness re-invokes you as each returns; simply wait for their results. Do **not** `sleep` or schedule a wakeup/timer to "check on" subagents you just launched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. Once they have returned, read every `evidence/<us-slug>/result.json`.

**Reconcile coverage first (deterministic backstop).** Assert `count(readable result.json) === count(PRD user stories)`. Any story whose `result.json` is missing, empty, or unparseable (e.g. its subagent crashed before writing) is `FAILED` with `notes` "no result captured — subagent did not complete" and counts in the tally — a missing result is a verification failure, never a silently dropped story. If the PRD yielded **zero** stories, report `UNVERIFIABLE` (nothing to verify), not a vacuous `PASSED`.

**Compute overall status** (first match wins, so every combination maps to exactly one overall status):
- `FAILED` — one or more stories are `FAILED`.
- `PASSED` — every story is `PASSED`.
- `PARTIAL` — no story is `FAILED`, but at least one is `PARTIAL` or `UNVERIFIABLE`. Continue, recording the reason in the report notes.

Save the report using the template and date rules in `references/qa-report-structure.md`. Author the report's prose in `session_language` (`communication.language`, default `pt-BR`); the template's section headings and column labels stay verbatim.

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

When fixing: the orchestrator skips tasks already `[x]`/`DONE`, so a bare re-run is a no-op. To re-execute a completed task a failed story depends on — trace it via the story's `FR-XXX` mappings to the task's PRD/Spec — first flip it back with `mark-task-status.cjs --tasks-index <tasks-<feature>.md> --task-number N --status IN_PROGRESS` (the status flag alone is rejected — it also needs a locator: either `--task-file <path>`, or `--tasks-index` together with `--task-number`). A failure in the *interaction between* tasks (not any single one) is fixed directly in code, not by re-running a task.

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

**Rationale, tier mechanism and pipeline placement:** `./references/gate-context.md`.
