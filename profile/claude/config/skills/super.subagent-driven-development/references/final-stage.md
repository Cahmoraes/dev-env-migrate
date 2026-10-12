# Final Stage (canonical, path-agnostic)

Single source of truth for the **final stage** of `super.subagent-driven-development`, the one
execution skill, reached by both of its paths: the per-task loop and the single-implementer mode (`super.subagent-driven-development --single`,
`./single-implementer-mode.md`), which reaches
this final stage with no per-task review behind it and therefore never skips a gate here. The four
finishing gates below run in this exact order and are **identical in semantics on both
paths**. Wherever this file says **the integrated target**, read the current working tree.

Run this final stage **once per feature**, after every task is implemented, reviewed, and
verified. Do not reorder, merge, or drop any gate.

**Speak to the user by what each gate does, in their language** — the final code review, the
QA of the user stories, the branch finish. The names in this file
(`gate 1`, `session_*`) are for you, never for the user's screen.

## The four finishing gates (in order)

### 1. Final code review over the entire integrated implementation

Always dispatch the final code reviewer subagent (broad: architecture / security / testing
strategy / project principles). **Model: `capable`, always** — resolve
`session_model_tier_capable` and set `model:` explicitly on this dispatch. Never inherit yours by
omission and never floor it at the tasks' tier: this gate has no task, it reads the integrated
branch, and it is the one fresh context the whole run buys (`./model-selection.md`, "The one gate above the floor"). **Then, as an extra bug-focused pass: if
`session_code_review_final_enabled` (Claude Code) → also run
`/code-review <session_code_review_effort>` (default `medium`); if
`session_copilot_review_final_enabled` (Copilot CLI) → also run the native `review` skill.**
These are complementary layers (broad review + focused bug net), not duplicate: `review_final: false` drops only the extra pass — this reviewer is dispatched either way, and `sdd-finish.cjs` refuses a branch whose ledger has no `Final review: dispatched` line.

> **The final review does NOT re-run the test suite.** It is an architecture / security /
> quality *read* of the code (reviewing that tests exist and are adequate is in scope;
> physically re-executing the suite is not). The complete suite already ran green at the
> full-suite checkpoint, and each task's implementer already proved its tests kill mutants
> (`super.test-driven-development`, "MUTATE").

**Spec coverage is on this reviewer's checklist.** The rendered prompt tells it to map every
`AC-NN`/`INV-NN` of the spec to a test that asserts it with the spec's value (`file:line`); an
AC/INV with no asserting test, or asserted with another value, is an Important finding and goes
through the fix loop below like any other.

**Render the dispatch** — `build-task-dispatch.cjs --role final --tasks-index <index> --platform <platform> [--description "<one paragraph>"]` (`./execution-loop.md`, "Rendered dispatches") fills `{GLOBAL_CONSTRAINTS}`, `{REVIEW_FOCUS}` and `{DEFERRED_MINORS}` below from the index and the ledger, at `capable`; send its `prompt` unchanged.

**The range.** `BASE_SHA` is the commit the feature branch started from. The builder derives it —
`git merge-base <default-branch> HEAD`, never a bare `origin/main` (once the default branch moves
past the branch point, its newer files show up as phantom deletions the branch never made) and
never `HEAD~N` — and returns it as `base`; pass `--base` only when the branch forked from
something other than the default branch. It refuses a range HEAD is not on, or an empty one with
auto-commit on, and that refusal is a **STOP** (`./execution-loop.md`, "Review range guard"). If the plan index carries a
`## Foco de Revisão` section, pass it to the reviewer verbatim in `{REVIEW_FOCUS}`: those are
the inputs and failure modes no task's tests exercise, and the reviewer checks each one. Pass
`## Restrições Globais` the same way in `{GLOBAL_CONSTRAINTS}`, and the deferred ledger — read
from `.superpowers/sdd/<feature-name>/progress.md` (`./execution-loop.md`,
"The ledger on disk"; no file → nothing was deferred): the Minor findings the per-task reviews deferred, the ⚠️ items they could
not verify and the findings parked at a cap (`Task N: minor (deferred): …`,
`Task N: unverified: …`, `Task N: parked — …`) — in `{DEFERRED_MINORS}`: the reviewer triages the minors,
verifies the unverified items against the whole branch and sees both sides of every parked
finding. A roll-up nobody reads is a silent discard.

**Re-grade before you gate.** The reviewer's severity labels are advice; the gate is yours.
The spec is a vision document: a finding's grade is what a reasonable person using this
software gets if it ships, not whether the spec names the input that triggers it — a
reviewer who set a finding at Minor because the spec was silent has graded the spec, not the
effect. The reviewer's **Declined to judge** list is yours too: rule on every line as you
would on a plan conflict — it becomes a finding (graded, into the loop below) or it stands,
with the cost if wrong — and carry every ruling into the final message. Nothing the reviewer
set aside is dropped silently. A `plan-mandated` finding quotes the task-file line that
prescribes it and the spec line it breaks: rule on it from those two quotes, the spec as the
binding authority — open the spec or a task file only for a finding that lacks them. Write each
ruling as `Final review: Ruling: <what> — <why> — <cost if wrong>` to the ledger. **Every
task's deferred line gets a ruling, once the fix rounds are done** — the later tasks and the
fix rounds settle most of them, and only you can say which: check each against the branch as
it stands and write, per task and kind, `Final review: Ruling: Task N unverified closed — <evidence> — <cost>`
when all are settled (verified, fixed or moot) or `… Task N unverified open — <why> — <cost>`
when none is (`minor`/`parked` alike). Partly settled: the `closed` ruling, then the still-open
part as a new `Task N: <kind>: …` line, then an `open` ruling — a ruling covers the lines above
it. Gate 3 lists as left to do only lines no `closed` ruling covers, and refuses to finish while
a task's line has no ruling at all: an unruled line reads as open even when later work fixed
it, and the user gets a to-do list of settled items.

**Findings are fixed, not just reported — same fix loop as the per-task gates.** Pool the
**Critical / Important** findings from every pass that ran and dispatch a
fresh implementer subagent (`super.subagent-driven-development/agents/implementer.md`) to fix
them **on the integrated target** — **ONE** fixer carrying the complete list, never one per
finding — every finding (verdict +
`file:line`) goes into its `## Review Findings to Address` section — the controller orchestrates, it
does not patch inline. Write the pooled findings to `.superpowers/sdd/<feature-name>/final-findings-<R>.md`
and render the fixer with them:

```bash
node <super.subagent-driven-development-base-dir>/scripts/build-task-dispatch.cjs --role final-fix \
  --tasks-index <index> --findings-file .superpowers/sdd/<feature-name>/final-findings-<R>.md --platform <platform>
```

It carries every task file as background, runs at the tasks' highest tier floored at `standard`,
writes the ledger's `Final review: fix round <R>` line itself and returns the report path
(`final-fix-<R>-report.md`); send its `prompt` unchanged. Every fix is proven by a test that reproduced the finding and failed first: the
implementer's report names it with its RED→GREEN evidence and the green suite. That suite run is
the suite run — do not re-run it yourself. That evidence
is the re-review for a testable finding — do not dispatch a reviewer to re-read a diff whose
covering test already answers "addressed" and whose suite run already answers "broke
nothing". **Re-run the review pass that raised it** only when the fix carries no such test
(an architectural or structural finding a test cannot pin), or when the report lacks the
evidence. Loop until no Critical/Important findings remain — **capped**: if the same finding
survives ~2 fix rounds (a fix reintroduces it or fails to clear it), stop and route it to
**super.systematic-debugging** or escalate to the human; never loop on an oscillating
finding. **Minor** findings: fix if cheap, else ledger each as `Final review: minor (deferred): …`
— gate 3 returns them in `deferred` and its `summary` lists them for the user under what is left
to do; they do not block. Do not proceed to the QA gate or finishing
while a Critical/Important finding is open. The per-task spec + quality gates already ran and
are unaffected.

### 2. QA gate — user story verification (preference-gated + PRD-gated)

**Preference gate — check `session_qa_gate_enabled` first.** If it is `false` (from
`workflow.qa_gate: false`), **skip this entire gate silently**: do not run
`super.user-story-verification`, and do **not** mention QA anywhere — not here and not at the
PRD-discovery step below — go straight to gate 3. The rest of this gate applies only when
`session_qa_gate_enabled` is `true`.

PRD exists? → **No PRD:** skip this gate, go to gate 3 — nothing to verify against, so nothing to
ask either. **PRD found:** `session_qa_gate_ask` says where the consent came from:

- **`false`** (`workflow.qa_gate: true`) — **the preference is the consent**: it was the user's
  decision at onboarding, and asking again at the final stage re-asks an answered question. Say in
  one line that the QA gate is running, then invoke `super.user-story-verification`, passing the
  PRD path, feature name and test runner command.
- **`true`** (`workflow.qa_gate: ask`) — the user deferred that decision to this point. Ask it
  **once**, in the user's language, through the platform's structured-question tool (prose list
  only when it is unavailable); the options name outcomes:
  > "Run the QA gate for `<feature-name>`? It verifies the PRD's N user stories against the running app (boots the stack, drives a browser)."
  > - **Run it** — verify the user stories now
  > - **Skip** — go straight to the done-state gate
  **Run it** → invoke exactly as above. **Skip** → one line, then gate 3. The answer covers this
  feature only. When no answer can arrive (delegated decisions, non-interactive harness) → **Skip**:
  autonomy is not consent for a gate that boots the app and opens a browser.

**PRD discovery order** (same logic as `super.writing-plans`):
1. Explicit path in context (forwarded from `super.generating-prd` this session).
2. Deterministic derivation: `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`.
3. Directory scan: files with `prd-` prefix in `docs/superpowers/<feature-name>/prd/`.

**When QA runs and returns a result:**

| QA Result | Action |
|-----------|--------|
| `PASSED` | Continue |
| `PARTIAL` | Continue (note partial coverage in handoff) |
| `FAILED` | The QA skill already ran its one fix round (reopened task → implementer → task review → re-verify). **STOP.** Report the residual stories and let the user choose `super.systematic-debugging` or stopping here. Never patch source inline, never edit the QA report, never proceed to finishing. |

The QA report is saved to `docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md` by
`super.user-story-verification`.

### 3. Done-state gate (deterministic — before handoff)

The QA gate verifies *features*, not bookkeeping. One call runs the gate and, when it passes, the
bookkeeping gate 4 needs:

```bash
node <super.subagent-driven-development-base-dir>/scripts/sdd-finish.cjs --tasks-index <path>
```

It runs `parse-tasks.cjs --assert-all-done` — red if any task is not `[x]`/`Status: DONE`, if the
index and a task file disagree, or if a file a DONE task declares under `## Arquivos` is not on
disk. `allDone: false` → it touched nothing: fix the tasks in `open` with `mark-task-status.cjs`
while the execution machinery is still loaded, then run it again (a batched dispatch makes a
missed checkbox especially easy). `allDone: true` → it returns the ledger's `rulings`,
`deferred` and `pending` lines and the `summary` gate 4 hands the user, deletes the plan's workspace `.superpowers/sdd/<feature-name>/` with the ledger
in it (`workspaceRemoved`, `ledgerRemoved`) and, with auto-commit on, commits the
tracker edits in the plans directory (`trackerCommit`); `dirty` lists what is uncommitted outside
it. Anything in `errors` is a **STOP** — the gate did not run.

### 4. Finish the branch

**Hand over the rulings.** Gate 3's `summary` already holds them: rendered from ledger lines
and git alone, it lists what was done (each task's `complete` line, the final review's dispatch,
verdict and fix rounds, the tracker commit), every ledger line containing `Ruling:` under a "Rulings I made"
heading (plan-conflict rulings, `BLOCKED` corrections, parked findings, cap adjudications, the
re-graded "Declined to judge" lines — in the order you made them, each with what it costs if
wrong), and what is left for the user (deferred minors, unverified items, parked findings no
ruling closed; no uncommitted paths — the finishing skill's clean-tree step runs before the
summary is printed, so `dirty` stays in the JSON only). Its headings follow the plan's language
(the heading is a meaning, not a fixed string: in a pt-BR session it reads "Decisões que tomei"). The list is exhaustive: if
the ledger holds a ruling, the list holds it. It is the only place the decisions you took on the
user's behalf reach them — they read it and rework whatever you got wrong; a ruling that dies
unread was a decision made in secret. Do not restate it now: gate 3 also wrote it to
`summaryFile`, and `super.finishing-a-development-branch` prints that file in its last step, where
you paste `summary` into your message **translated line for line into the session's language**:
no line otherwise reworded, merged, dropped or added. Written from the JSON instead, it reached the user
several tool calls later rewritten from memory — merged, each ruling's cost dropped.

**Then delete the ledger.** Gate 3's call already did, with the workspace it lives in: it was the
loop's scratch memory, the rulings are now in front of the user and the git history holds the
code. `workspaceRemoved: false` or `ledgerRemoved: false` → remove the workspace by hand (the
ledger, prompts, reports and review packages: every reader ran before gate 3):

```bash
rm -rf .superpowers/sdd/<feature-name>
```

Then invoke `super.finishing-a-development-branch`, passing the tasks index path (it re-runs the
done-state gate as a backstop).

## Continuous Execution

Run the gates back to back, without "should I continue?" prompts. Conflicts,
ambiguities and plan defects are rulings written to the ledger, not questions; the stops are the
four in `SKILL.md` (a plan so broken that every path forward is a guess is one) and completion.

## Required workflow skills

`super.requesting-code-review` (gate 1's reviewer template), `super.systematic-debugging` (a finding
or bug that survives its fix loop), `super.user-story-verification` (gate 2),
`super.finishing-a-development-branch` (gate 4).
