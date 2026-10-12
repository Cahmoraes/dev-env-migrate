---
name: super.user-story-verification
description: "QA gate: verify each PRD user story against the running implementation before merge or PR ('rodar QA', 'verificar user stories'). Needs a PRD."
user-invocable: false
---

# User Story Verification

QA gate: one fresh subagent per PRD user story verifies it against the implementation, collecting test evidence and UI screenshots into a consolidated report, before the branch is merged or submitted for PR. **"The orchestrator"** is whichever skill invoked this gate (`super.subagent-driven-development`). Why the gate exists, its tier mechanism and its pipeline placement: `./references/gate-context.md` — entry material, never needed mid-run.

## Process

### Step 1: Discover PRD and Extract User Stories

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

Locate the PRD by priority: (1) the path the orchestrator passed; (2) `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`; (3) a `prd-` file in that directory; (4) embedded in the spec — `node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>` returns `prd.embeddedIn` (`code: 'prd-embedded-in-spec'`), and that spec path is the PRD source for every step below. None of the four → report `"No PRD found for this feature — skipping QA gate."` and return control without blocking.

Extract the stories with `scripts/generate-slugs.cjs` (command, JSON shape, ID-marker tolerance and manual fallback: `./references/slug-extraction.md`). Each story comes with its `requirements` (FR ids read from the PRD's `**FR-001** (US-01, US-02)` annotation; `requirementsMapped: false` → derive the mapping and say so in the report) and `uiFacing`. Stories under **Fora de Escopo** are never verified.

### Step 2: Set Up QA Directory

Create the evidence tree before dispatching: `docs/superpowers/<feature-name>/qa/evidence/<slug>/`, one directory per story, named by the JSON `slug` (already prefixed `us-NN-…`).

### Step 3: Settle the Dispatch Inputs

The dispatch needs four inputs — the single-file **test runner**, the **browser** automation available, whether each story is **UI-facing**, and the **app base URL** when a UI-facing story can be screenshotted. `projectProfile` answers the first on most repos; the detection order for the rest, the once-per-feature UI-facing rule, the stack boot (orchestrator-owned, never blocking) and the evidence-tree-only rule for acceptance tests are in `./references/project-capabilities.md` — read it now, before building the dispatches. On a JS/TS repo it also carries the one-time path-alias scaffold command.

### Step 4: Dispatch QA Subagents in Parallel

One background subagent per story, in waves of up to **3** at a time; launch the next wave as soon as a slot frees. Each dispatch carries an explicit `model:` — floor it at `standard`; a validation gate never inherits the controller's model by omission (`super.subagent-driven-development`, "Model Selection"). The script resolves that model and renders every story's prompt from `./agents/qa-story-verifier.md`:

```bash
node <super.user-story-verification-base-dir>/scripts/generate-slugs.cjs --prd <prd-path> \
  | node <super.user-story-verification-base-dir>/scripts/build-qa-dispatch.cjs --slugs - \
      --feature-name <feature-name> --prd <prd-path> --spec <spec-path> --test-runner "<runner>" \
      --browser "<browser>" --app-base-url "<base-url>" --language <language> \
      --repo-root "$(git rev-parse --show-toplevel)" --platform <harness>
```

`<browser>` is `playwright-cli`, `Playwright`, `Puppeteer` or `not available`; `<base-url>` is the URL Step 3 confirmed, or `not applicable`; `<harness>` is the platform you run on (`claude-code`, `copilot`, …).

**Send each `dispatches[]` entry as one dispatch call, in waves of up to 3:** its `description`, `model` and `prompt` exactly as emitted — never retyped, never with `model:` dropped, never written into your reply as text. The prompt points the subagent at its rendered instructions: they are the subagent's to follow, never yours. `dispatches: []` means the PRD yielded zero stories (Step 5).

### Step 5: Collect Results and Generate QA Report

Wait for the subagents — **never poll for them.** They run in the background and the harness re-invokes you as each returns; do not `sleep` or schedule a wakeup/timer to "check on" them — busy-polling harness-tracked background work is wasted and a malformed wakeup errors out mid-flow. Once all have returned, read every `evidence/<us-slug>/result.json`.

**Reconcile coverage first.** `count(readable result.json)` must equal the story count: a missing, empty or unparseable file is `FAILED` with `notes` "no result captured — subagent did not complete". Zero stories → `UNVERIFIABLE`, not a vacuous `PASSED`.

**Overall status**, first match wins: `FAILED` (any story `FAILED`) → `PASSED` (every story `PASSED`) → `PARTIAL` (otherwise; record why in the notes).

Save the report per `./references/qa-report-structure.md` (template and date rules); prose in the user's language, headings and column labels verbatim.

### Step 6: Gate Decision

**`PASSED` or `PARTIAL`:**

```
✅ QA Gate passed — N/M user stories verified.
QA report saved to: docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md
Returning control to orchestrator.
```

Return control; the orchestrator proceeds to `super.finishing-a-development-branch`.

**If status is `FAILED` — run one fix round before reporting.** The controller orchestrates and never patches source inline. Per failed story, in order:

1. **Reopen its task:** the story's `requirements` name its FR ids; its task is the one whose task-file title carries that `[FR-XXX]` tag (`parse-tasks.cjs` → `requirements`); no tagged task → the last task whose `## Arquivos` names the file in `failure_details`. `node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs --tasks-index <tasks-<feature>.md> --task-number N --status IN_PROGRESS` (or `--task-file <path>`) — the done-state gate stays red until the task closes.
2. **Implementer:** write the story's `failure_details` to a findings file and render the dispatch — `node <super.subagent-driven-development-base-dir>/scripts/build-task-dispatch.cjs --role implementer --tasks-index <tasks-<feature>.md> --task-number N --platform <platform> --findings-file <f>` renders `agents/implementer.md` with them in `## Review Findings to Address` and the model from the task's `Tier`. Send its `prompt`, `model` and `description` unchanged.
3. **Review:** the same script with `--role reviewer --base <fix base> --findings-file <f>` renders `agents/task-reviewer.md` over the fix (floor `standard`); Critical/Important findings go back to step 2.
4. **Re-verify:** re-dispatch the story's QA subagent — its Step 4 dispatch, rebuilt with `--only <story-id>` — for a fresh `result.json`. `PASSED` → `mark-task-status.cjs … --status DONE`; otherwise the task stays `IN_PROGRESS`.

Recompute the status and regenerate the report (Step 5) from the new `result.json` set — never by hand. Now `PASSED`/`PARTIAL` → the block above. Still `FAILED`:

```
❌ QA Gate failed — N user story(ies) still fail after one fix round.

Failed stories:
- US-003 (task 6 stays IN_PROGRESS): [failure description]

QA report: docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md

Cannot proceed with merge or PR until the failures above are addressed.
```

**STOP.** Do not return control for branch finishing until this gate is resolved — the orchestrator must not invoke `super.finishing-a-development-branch`. Let the user choose `super.systematic-debugging` or stopping here.

## Red Flags

- Proceed to merge/PR, edit project source, or rewrite the report or a `result.json` by hand after a `FAILED` — the fix runs through the implementer + review loop above.
- A story marked `PASSED` without a test run or a verified behavior; a story whose FR names a mechanism the implementation does not use is `PARTIAL` with the divergence in `notes`.
- A `result.json` missing for any story — `UNVERIFIABLE` ones included.
