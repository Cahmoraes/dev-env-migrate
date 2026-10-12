# Execution Loop — mechanics

The mechanics behind the running order in `SKILL.md`, "Execution Loop": how each step is written
to disk, how a dispatch can fail without looking like a failure, and what bounds the review loops.
Read it **once, at the start of an execution run**, before the first dispatch.

## Tracker writes are physical edits on disk

Every status transition is a **real file edit**, never a session task-list entry or a mental
note. A tracker that only exists in the session is not an audit record: it disappears with the
context and cannot be re-read after a compaction or a resume.

**Before dispatching each implementer** — `**Status:** PENDING` → `**Status:** IN_PROGRESS`.
The task's first implementer dispatch does it: `build-task-dispatch.cjs --role implementer --start`
runs `mark-task-status.cjs --status IN_PROGRESS` after the prompt renders (a refused render leaves
the task PENDING) and reports it under `started`; re-running it is a safe no-op.

**When all gates pass** — one call does both edits atomically and idempotently: it sets the task
file Status and flips the matching index checkbox (`[x]` for DONE):

```bash
node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs \
  --task-file <path/to/task-NN.md> --status DONE \
  --tasks-index <path/to/tasks-<feature-name>.md> --task-number N \
  --verify -- <the GREEN command from the implementer's report>
```

Run it from the directory the report's GREEN command ran in. `--verify` re-runs the command with `NODE_TEST_CONTEXT` cleared and writes DONE only on exit 0;
the JSON `verify` block is the record of what proved the task green. A failing run writes nothing
(`verify.marked: false`) — the task is not complete, whatever the implementer reported.

Inspect the JSON: `statusChanged` and `indexUpdated` confirm the writes; any `errors` (e.g. task
number not found) require manual resolution. **Fallback:** make the edits by hand if the script
is unavailable — the edits are mandatory, the script is only the safe way to make them.

**Reopen — the QA gate only** — `**Status:** DONE` → `**Status:** IN_PROGRESS` on the task behind a
failed user story (`--tasks-index <path> --task-number N --status IN_PROGRESS`): the index box flips back to
`[ ]`, so `parse-tasks.cjs --assert-all-done` stays red until the task closes again with `DONE` at the end of
its implementer + review round (`super.user-story-verification`, Step 6).

## The ledger on disk

Everything the loop defers or decides is written to **one file in the plan's workspace**,
`.superpowers/sdd/<feature-name>/progress.md` (git-ignored, beside the prompts, reports and
review packages; its absolute path is `ledger.path` in `sdd-start.cjs`'s output) — never kept only in your
context, which does not survive a compaction. The scripts create it with the header line
`# Ledger — <feature-name>`; after that it is append-only, one line per entry, each after a blank
line (a Markdown preview otherwise joins them into one paragraph), in this shape.
It is scratch, not documentation: it lives until `./final-stage.md`, gate 4, hands the user its
rulings and deletes it with the workspace — the git history and that message are the record from then on.

```bash
printf '\n%s\n' 'Task <N>: <kind>: <one-liner>' >> .superpowers/sdd/<feature-name>/progress.md
```

The bookkeeping entries are **written by scripts, never by you**: the transition to
`IN_PROGRESS` appends `Task N: started (base <sha7>)` and a written `DONE` appends
`Task N: complete (commits <base7>..<head7>, <--note>)` (`mark-task-status.cjs`); every re-review
render (`--role reviewer --findings-file`) appends
`Task N: fix round <R> (findings: <file>; commits <fixbase7>..<head7>)` — the round's outcome is
the next line, another fix round or `complete`; `sdd-start.cjs` writes the pre-flight table
("Pre-flight table" below). A resume reads the in-progress task's BASE and fix round from
`parse-tasks.cjs` (`inProgress[].base`, `.fixRound`), never from memory.

The kinds you write, and who consumes each:

- `Task N: minor (deferred): <one-liner>`, `Task N: unverified: <item>` and
  `Task N: declined: <behavior> — <reviewer's reason>` (one per `Declined to judge` line) — the
  deferred ledger ("Review loop bounds" below); the final review reads them as `{DEFERRED_MINORS}`.
- `Task N: Ruling: <what you decided> — <why> — <what it costs if wrong>` — every decision you
  took on the user's behalf: a finding that conflicts with the plan text, a `BLOCKED` on a plan
  defect, an open finding adjudicated at the cap. `./final-stage.md`, gate 4, hands the user the
  complete list before the branch is finished — a ruling that stays in the ledger unread was a
  decision made in secret.
- `Task N: parked — <finding> — Ruling: <why the code stands>` — an open finding the cap
  adjudicated as not load-bearing; the final review sees both sides.
- `Pre-flight <row>: Ruling: <what you decided> — <why> — <what it costs if wrong>` — one per
  flagged row of the pre-flight table, before Task 1.

On a resume, read the ledger right after the tracker: the commits and rounds it names exist even
when your context no longer remembers them.

### Pre-flight table

On a plan with work left, `sdd-start.cjs` writes a `## Pre-flight` table to the ledger once, from
the task files' `## Arquivos` and `**Consome:**` lines: one row per file two or
more tasks touch, one row per task. A row reads `conflict` when two tasks create one file, a task
touches a file before the task that creates it, or a task consumes a later task. `ledger.preflight.flagged` in the
start call's output lists the flagged rows still without a ruling that touch a task not yet done. Before the next dispatch, rule
on each one — read only the task files that row names, the spec is the binding authority — and
append `Pre-flight <row>: Ruling: …`; a ruling that changes what a task must do goes into its
dispatch as `--context`. `flagged: []` → proceed without comment. Whether a task's own tests agree
with its own code is not in the table: the task reviewer judges it (`plan-mandated`).

## Rendered dispatches

`scripts/build-task-dispatch.cjs` renders every prompt the loop sends — `--role implementer`
(`../agents/implementer.md`), `--role reviewer` (`../agents/task-reviewer.md`) and `--role final`
(`super.requesting-code-review/agents/code-reviewer.md`) — from the task files, the index, the
preferences and the ledger: the task and spec/PRD paths, the index's `## Restrições Globais`
verbatim, the write-set, `auto_commit`, the model for the tier (reviewers
floored at `standard`, the final review `capable`). It keeps the plan's workspace in
`.superpowers/sdd/<feature-name>/` (git-ignored): the implementer's report file with its TDD
evidence (`reportFile`) and, for a reviewer, the review package — commits, stat and
`diff -U10` for `BASE..HEAD` (`diffFile`); a HEAD that does not descend from BASE is refused.
The workspace is scratch: `sdd-finish.cjs` (final stage, gate 3) deletes it once every task is done. You add only what the files cannot know:

| Flag | When |
|---|---|
| `--context "<1-3 lines>"` | implementer: interfaces or rulings from earlier tasks |
| `--findings-file <f>` | implementer fix round (becomes `## Review Findings to Address`); reviewer re-review (becomes `## Findings under verification`) — the findings verbatim, one per line, with `file:line` |
| `--base <sha>` | reviewer re-review: the head the previous review saw; final: `git merge-base <default-branch> HEAD` |
| `--escalate-to <tier> --escalation-reason "<why>"` | implementer: the escalation ladder's one rung up |
| `--role implementer --task-number <tasks whose files the findings touch> --findings-file <f>` | the final review's ONE fixer: every Critical/Important finding in `<f>` |

Relay `prompt` unchanged with `model` and `description`. `warnings` names a collapsed tier map
(`capable` = `standard`): say it to the user once, at the final review.

## Arriving at a finished plan

`parse-tasks.cjs` reports `allDone: true` when every task is `[x]` on the index **and**
`Status: DONE` in its own file: the Execution Loop is finished by definition.

**Do not restart at task 1.** The code is already on the branch; re-dispatching implementers
over it produces duplicate work and review rounds against changes nobody asked for.

What to do:

1. Say it plainly, in the session language — the plan is already complete, N tasks done.
2. Go to the final stage. Its gates still apply in full: the done-state gate re-asserts
   `--assert-all-done`, and the QA gate runs as its preference says. A
   finished implementation is not a verified one.
3. If the user expected pending work, the disagreement is about *which* plan or *which*
   feature — resolve that before touching anything. Never resolve it by re-implementing.

The mirror case matters too: `mismatches` non-empty means the index and the task files
disagree about completion. Resolve those before reading `allDone` at all — a mismatch
makes both `allDone: true` and `allDone: false` untrustworthy.

**`allDone: true` with `missingDeliverables` non-empty is a tracker that lies:** the files a
DONE task declares under `## Arquivos` are not on this branch. Say which files and which tasks,
in the session language, and stop for the user — the work may live on another branch or may
never have happened, and only they know which. Never re-dispatch over a lying tracker, and never
flip it back to `PENDING` yourself.

## Dispatch failure modes

### Platform note — "await, never poll" is Claude Code semantics

On a platform whose dispatch tool does **not** auto-reinvoke the orchestrator on completion
(Copilot CLI's `task`), "await its result" means dispatch in the **blocking/`sync` mode** so the
call returns the subagent's output directly — see `super.using-superpowers/references/copilot-tools.md`,
"Dispatching subagents".

**Never substitute a user-question tool (`ask_user`) as a wait/synchronization primitive** to
pause for a subagent — that turns an autonomous per-task dispatch (including the spec and
code-quality reviews) into a spurious approval prompt. The only `ask_user` calls the flow makes
are its named consent gates (the Branch Guard's `ask-*` verdicts, the auto-commit suggestion).

### A dispatch that errors at launch has NOT run its gate

A `task`/Agent call can fail at *launch* — the harness rejects the tool call itself (truncated or
malformed arguments, an EOF-while-parsing error) and returns an error **in place of** a subagent
handle. This is not a subagent that ran and returned; it is a gate that never started.

When a dispatch returns an error instead of a result, treat that stage as **not run**:
re-dispatch it before advancing, and never let a task review or verification stage count as
satisfied unless its subagent actually launched and returned a
verdict. A swallowed dispatch error skips the gate with **no failing signal**.

## Review loop bounds

### Review range guard

A reviewer diffs whatever `BASE..HEAD` it is handed. An implementer that committed to the
wrong branch, or did not commit, leaves that range empty — the reviewer reads nothing and
approves "clean" work — or leaves HEAD off BASE's line, so the reviewer reviews commits the
task never made. Both corrupt the review chain in silence, so the range is checked before
**every** reviewer dispatch. Per task, `build-task-dispatch.cjs --role reviewer` checks it while
building the review package, and `--role final` over the branch's merge-base, and each
**refuses** (exit 1, the reason on stderr) on either shape — that refusal is a **STOP**, never a flag to retry around: HEAD not descending from BASE → find where the work went before anything is
reviewed; an empty range while `workflow.auto_commit` is on → nothing to review means the
implementer committed elsewhere or not at all. BASE = HEAD under `auto_commit: false` is the
expected shape, not a refusal: the reviewer diffs the working tree instead.

### ⚠️ "Cannot verify from diff" — resolve it or ledger it

A reviewer returns a ⚠️ item for a requirement of the task it could not see in the diff (a
helper the task calls, a config it relies on). You hold the plan. When one read or one targeted
check settles it, settle it now — a confirmed gap is a finding and enters the fix loop with its
`file:line`. Otherwise it goes on the deferred ledger, `Task N: unverified: <item>`, and the
final review verifies it against the whole branch. DONE closes a task with every ⚠️ item
resolved or ledgered; none is dropped.

### Re-review after a fix — scoped to the fix diff

Every fix round ends in a re-review, and it is **scoped**: the same reviewer template, a fresh
subagent, the range of the fix commit(s) only, and the previous round's findings pasted into its
`## Findings under verification` section. It returns one ADDRESSED | NOT ADDRESSED line per
finding with `file:line` before any new verdict ("attempted" is not addressed: the specific
defect must no longer exist), then any breakage or new edge the fix diff introduced, and one `Out-of-scope:` line per issue it
saw outside the fix diff — ledger each as `Task N: minor (deferred)`; it never extends the loop. The fix is
where the next defect is born, so the fix's own RED→GREEN test is evidence, never the
re-review. Its render (`--role reviewer --base <fix base> --findings-file <f>`) appends the round's
ledger line itself; never write one by hand. (The whole-branch final review is the exception: `./final-stage.md`, gate 1.)

### The deferred ledger

Minor findings never enter the loop. Ledger them as you go, `Task N: minor (deferred): <one-liner>`,
next to the ⚠️ items you could not settle, `Task N: unverified: <item>` — appended to the ledger
file ("The ledger on disk" above), never held in your context alone — and hand those lines to the
final review in `{DEFERRED_MINORS}` (`./final-stage.md`, gate 1): it triages the minors and
verifies the unverified items against the whole branch. A roll-up nobody reads is a silent discard.

### A finding that conflicts with the plan text — rule, ledger, then act

A finding the reviewer labels plan-mandated, or any finding that contradicts what the plan's text
requires, is yours to rule on before anyone acts on it: weigh the finding against the plan text
with the spec as the binding authority, write `Task N: Ruling: …` to the ledger, then either
dispatch the fix or let the code stand. Never dismiss a finding because the plan mandates it, and
never dispatch a fix that contradicts the plan without the ruling written first. Do not pre-judge
for the reviewer either: a prompt that says "do not flag X" or "the plan chose Y" is you sparing
yourself a review loop — let the reviewer raise it and rule on it here.

### The review loop is capped — and the cap ends in a ruling, not a stall

If a reviewer keeps rejecting the same task across ~3 rounds without converging (each fix trades
one finding for another, or reintroduces a prior one), the next round is not another resume: climb
the ladder of `SKILL.md`, "Handling Implementer Status" — more context, then a **fresh** implementer
one tier up carrying the open findings and "a prior implementer attempted this task N times; you own
it now", then a split. When the ladder is spent and findings are still open, stop dispatching and
adjudicate each one yourself — you hold the plan and the cross-task context the reviewer lacks:
the reviewer is wrong or the point is contestable → `Task N: parked — … — Ruling: …`; real but
nothing downstream builds on it → parked the same way, saying it is real and deferred; real and
load-bearing (a later task builds on it, or it reveals a plan defect) → rule on the smallest change
that unblocks the dependent work, ledger it, and carry it into the next task's dispatch. Adjudicate
only at the cap — earlier is pre-judging under another name — and stop only when the defect leaves
every path forward a guess.

## Batched dispatch — several same-shape tasks, one implementer, one review

Batching same-shape tasks (the rule above the per-task loop in the SKILL.md) is the controller's
call; when it applies, the batch runs through the same loop as one task:

1. One implementer, `--role implementer --task-number n1,n2,… --start`: every task file of the
   batch goes IN_PROGRESS and its `**Task file:**` slot lists them in index order.
2. One task reviewer, `--role reviewer --task-number n1,n2,…`, over the whole batch (BASE from the
   first task's `started` line; the builder refuses a bad range as above); it checks the diff file by file against each task's
   `## Arquivos`. Findings loop exactly as for a single task.
3. One `mark-task-status.cjs --tasks-index <index> --task-number n1,n2,… --status DONE --verify -- <cmd>`:
   the command runs once, and a failure marks none of them.

A batch is never split mid-loop: a finding on one of its files is a finding on the batch.

## Full-suite checkpoint — once per batch, not per task

Per-task verification runs only the tests **affected** by that task. Run the **complete** suite
green **once** at the end of each batch as a safety net against cross-task interaction — in
this sequential skill, once after the last task of the batch, immediately before the final stage.

You, the controller, run it and confirm exit 0; running read-only verification is not
implementing. It is the last full run: the final review reads code and does not re-run the
suite, and each task's mutants already ran inside its implementer (`super.test-driven-development`,
"MUTATE").

## Native review pass — opt-in, per platform

The optional final review pass (`/code-review` on Claude Code, `review` on Copilot CLI) is
handled by the final stage, not here — see `./final-stage.md`. Flag off or a non-matching
platform → skip. Tool details in `super.using-superpowers/references/claude-code-tools.md`
and `copilot-tools.md`.
