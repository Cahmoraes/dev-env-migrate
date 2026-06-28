---
name: super.user-story-verification
description: "QA Gate that verifies every user story in a feature PRD against the live implementation. Dispatches parallel subagents per user story — running existing tests, creating missing acceptance tests saved in the evidence directory, and capturing UI screenshots via playwright-cli when available. Produces a structured QA report with PASSED/FAILED/PARTIAL status and evidence files. Invoked by super.subagent-driven-development, super.parallel-subagent-in-tree, and super.parallel-subagent-development when a PRD exists and the user opts into QA verification, before super.finishing-a-development-branch. Also use directly when you need to verify that all user stories from a PRD are fully implemented before merging or creating a PR. Activate whenever someone says 'rodar QA', 'verificar user stories', 'validar implementação contra PRD', 'run acceptance tests', or 'generate QA report'."
---

# User Story Verification

QA Gate that verifies each PRD user story against the implementation before a branch can be merged or submitted for PR. Collects test evidence and UI screenshots, then produces a consolidated report.

**Announce at start:** "I'm using the super.user-story-verification skill to verify user stories against the implementation."

Throughout, **"the orchestrator"** means whichever skill invoked this gate: `super.subagent-driven-development`, `super.parallel-subagent-in-tree`, or `super.parallel-subagent-development`.

## Why This Gate Exists

Unit tests and code reviews verify *how* the code works; this gate verifies *what* the feature does for the user. Before merge there must be evidence each PRD user story was delivered — behaviors exist, flows work end-to-end, screenshots capture the real UI. Without it, branches that pass linting and unit tests still ship missing user-facing requirements.

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

**If no PRD is found:** report `"No PRD found for this feature — skipping QA gate."` and return control to the caller without blocking.

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
- `playwright-cli` available (`playwright-cli --version` or `npx playwright-cli --version`) → playwright-cli ✅ *(preferred — installs no new dependency)*
- `@playwright/test` in `devDependencies` → Playwright ✅
- `puppeteer` in deps/devDeps → Puppeteer ✅
- None found → screenshots unavailable ⚠️ (note in report, do not fail)

**Never install** a browser automation library (`npm install`, `pip install`, etc.) to enable screenshots; if none is found, mark screenshots unavailable and continue.

**Acceptance test location (one rule, applies everywhere):** acceptance tests created by QA subagents go **only** in `docs/superpowers/<feature-name>/qa/evidence/<us-slug>/<us-slug>-<short-description>.acceptance.test.<ext>`. For JS/TS they run directly via full path (e.g. `npx vitest run docs/superpowers/.../us-001-foo.acceptance.test.tsx`). **Never** place new test files in the project source tree (`apps/`, `src/`, `lib/`, or any project test directory). For non-JS/TS ecosystems (Go, Rust, Python...), skip creating new test files — capture evidence through existing tests and playwright-cli screenshots instead.

### Step 4: Dispatch QA Subagents in Parallel

Launch one background subagent per user story, in parallel waves of up to **3 subagents** at a time. Do not wait for one wave to finish before launching the next while stories remain.

Set an explicit `model:` on each dispatch — QA is judgment work, so floor it at `standard`; never inherit the controller's model by omission. A wave fans out many subagents at once, so an inherited capable model multiplies the cost for no gain (see super.subagent-driven-development § Model Selection).

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
**Evidence directory**: docs/superpowers/<feature-name>/qa/evidence/<us-slug>/
**Acceptance tests location**: if you need to create new tests, save them ONLY inside this evidence directory — never in the project source tree.

**Caveman Mode**: [paste the `block` field from `node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level> --format field` — the bare directive when on, empty when off (then omit). Do NOT hand-write it.]

---

### Task 1 — Map to Existing Tests

Search the codebase for tests covering this story's behaviors — files testing the related components/functions/routes/endpoints and asserting its FR-XXX outcomes.

Run them:
```bash
[test runner command] [relevant files or pattern]
```
Summarize the results (pass/fail counts, relevant test names) into `result.json`'s `test_output_summary` field. Do not save raw test output as a file.

---

### Task 2 — Create Missing Acceptance Tests (if needed)

If no existing test covers this story (or coverage is clearly partial), write a minimal acceptance test verifying its primary behavior end-to-end.

- **JS/TS only** — save the file in the evidence directory as `<us-slug>-<short-description>.acceptance.test.<ext>` (e.g. `us-003-theme-persistence.acceptance.test.tsx`); run it immediately via its full path; record the path(s) in `evidence/<us-slug>/acceptance-tests-created.txt`.
- **Non-JS/TS** — skip; capture evidence via existing tests (Task 1) and playwright-cli screenshots (Task 3).
- **Never** add test files to the project source tree (`apps/`, `src/`, `lib/`, or any project test directory).

If comprehensive tests already exist, skip this task.

---

### Task 3 — Capture UI Screenshot (if browser automation is available)

**If `playwright-cli` is available** (preferred):
```bash
playwright-cli open http://localhost:3000
playwright-cli goto /feature-path
playwright-cli screenshot --filename=evidence/<us-slug>/screenshot.png
playwright-cli close
```
Save the screenshot to `evidence/<us-slug>/screenshot.png`.

**If `@playwright/test` or `Puppeteer` is available** (library-based): write a minimal script that starts the app (if needed), navigates to the feature's primary UI state, and captures a screenshot. Save it to `evidence/<us-slug>/screenshot.png` and the script to `evidence/<us-slug>/screenshot-script.ts` (or `.js`).

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
- `PARTIAL` — tests pass but some aspect could not be verified (e.g. no browser for screenshot; coverage exists but incomplete)
- `UNVERIFIABLE` — cannot locate or write tests for this story; document the reason in `notes`
```
---

### Step 5: Collect Results and Generate QA Report

Wait for all subagents to complete. Read every `evidence/<us-slug>/result.json`.

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
- Mark a story `PASSED` without running a test or verifying a behavior
- Proceed to merge/PR when gate status is `FAILED`
- Create evidence for "Fora de Escopo" features
- Block the pipeline because screenshots are unavailable (browser automation is optional)
- Add test files to the project source tree — acceptance tests live only in the evidence directory
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

**Invoked by:** the orchestrator — after all tasks complete and the final code reviewer approves, when a PRD exists **and the user opts into QA verification**, before `super.finishing-a-development-branch` is called
**Artifacts saved to:** `docs/superpowers/<feature-name>/qa/`
**Required context:** PRD path, feature name, test runner command
**Optional context:** playwright-cli, Playwright, or Puppeteer availability
