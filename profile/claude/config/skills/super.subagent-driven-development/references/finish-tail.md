# Finish Tail (canonical, mode-agnostic)

Single source of truth for the **finish tail** shared by the three execution skills
(`super.subagent-driven-development`, `super.parallel-subagent-development`,
`super.parallel-subagent-in-tree`). The five finishing gates below run in this exact
order and are **identical in semantics across all three modes** — only the phrasing of
*where* fix work lands changes. Wherever this file says **the integrated target**, read:

> **the integrated target** = the base branch (worktree mode, `super.parallel-subagent-development`)
> / the shared tree (in-tree mode, `super.parallel-subagent-in-tree`)
> / the current working tree (sequential mode, `super.subagent-driven-development`).

Run this tail **once per feature**, after every task/wave is implemented, reviewed, and
verified. Do not reorder, merge, or drop any gate.

## The five finishing gates (in order)

### 1. Final code review over the entire integrated implementation

Always dispatch the final code reviewer subagent (broad: architecture / security / testing
strategy / project principles). **Then, as an extra bug-focused pass: if
`session_code_review_final_enabled` (Claude Code) → also run
`/code-review <session_code_review_effort>` (default `medium`); if
`session_copilot_review_final_enabled` (Copilot CLI) → also run the native `review` skill.**
These are complementary layers (broad review + focused bug net), not duplicate.

> **The final review does NOT re-run the test suite.** It is an architecture / security /
> quality *read* of the code (reviewing that tests exist and are adequate is in scope;
> physically re-executing the suite is not). The complete suite already ran green at the
> wave/batch checkpoint, and gate 2 (`super.independent-verification`) is the terminal gate
> that re-runs the full suite **plus** the mutation sensor immediately after.

**Findings are fixed, not just reported — same fix loop as the per-task gates.** Pool the
findings from every pass that ran. For each **Critical / Important** finding, dispatch a
fresh implementer subagent (`super.subagent-driven-development/agents/implementer.md`) to fix
it **on the integrated target**, pasting the finding (verdict + `file:line`) into its
`## Review Findings to Address` section — the controller orchestrates, it does not patch
inline — then **re-run the review pass that raised it**. Loop until no Critical/Important
findings remain — **capped**: if the same finding survives ~2 fix rounds (a fix reintroduces
it or fails to clear it), stop and route it to **super.systematic-debugging** or escalate to
the human; never loop on an oscillating finding. **Minor** findings: fix if cheap, else list
them for the user; they do not block. Do not proceed to the QA gate or finishing while a
Critical/Important finding is open. The per-task spec + quality gates already ran and are
unaffected.

### 2. Independent verification gate (`super.independent-verification` — always-on, never asked)

After the final review's Critical/Important findings are resolved, and **before** the QA gate
and **before** finishing, run `super.independent-verification` exactly once for the feature.
Dispatch a fresh Verifier subagent (author != verifier, template `agents/verifier.md`): it did
not implement or orchestrate any task, so it inherits none of the author's assumptions. It
re-derives spec coverage under **evidence-or-zero** (every acceptance criterion mapped to
`file:line` + the exact assertion expression and its spec-defined value), then runs the
**discrimination sensor** (mutation testing in a git-scratch state) proving the tests actually
kill regressions. It writes `docs/superpowers/<feature>/qa/validation-<feature>.md` and returns
PASS/FAIL + a ranked gap list.

**Controller-run structural gate (mandatory — do not skip even if the Verifier self-reports
`valid:true`).** A dispatched subagent's actual prompt can drift from the `agents/verifier.md`
template — observed in practice, not hypothetical — so a controller-run check must not depend on
what the subagent was told. Immediately after the Verifier returns, run this yourself:

```bash
node <super.independent-verification-base-dir>/scripts/check-verification-report.cjs \
  --report docs/superpowers/<feature>/qa/validation-<feature>.md --spec <spec-path>
```

`valid:false`, or no report found at that path, is a FAIL regardless of what the Verifier claimed.

**On FAIL:** each uncovered AC, wrong-value assertion, or surviving mutant becomes a fix task
dispatched to a fresh implementer, then re-dispatch a fresh Verifier over the new range —
bounded to ~3 rounds, then escalate to the human or `super.systematic-debugging`. Do not
proceed to the QA gate while the Verifier verdict is FAIL, or the controller-run check above is
not `valid:true`. This gate is **unconditional** — never ask the user whether to run it, and it
runs **even when no PRD exists**.

### 3. QA gate — user story verification (preference-gated + consent-based, only when a PRD exists)

**Preference gate — check `session_qa_gate_enabled` first.** If it is `false` (from
`workflow.qa_gate`), **skip this entire gate silently**: do not run
`super.user-story-verification`, and do **not** mention QA anywhere — not here and not at the
PRD-discovery step below — go straight to gate 4. The rest of this gate applies only when
`session_qa_gate_enabled` is `true`. (Independent verification, gate 2, is always-on and is
never affected by this preference.)

PRD exists? → **No PRD:** skip this gate, go to gate 4. **PRD found:** ask the user whether to
run the QA gate. Ask it like this (render it in `session_language` — the wording is a template,
not a literal):

```
A PRD was found for this feature. Do you want to run super.user-story-verification (QA gate)
to verify all user stories against the implementation before finishing the branch?
This will dispatch parallel subagents to check acceptance criteria and collect evidence.
```

**PRD discovery order** (same logic as `super.writing-plans`):
1. Explicit path in context (forwarded from `super.generating-prd` this session).
2. Deterministic derivation: `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`.
3. Directory scan: files with `prd-` prefix in `docs/superpowers/<feature-name>/prd/`.

| User decision | Action |
|--------------|--------|
| **Yes / confirmed** | Invoke `super.user-story-verification`, passing the PRD path, feature name, and test runner command |
| **No / declined** | Skip the gate — proceed to gate 4 |

**When QA runs and returns a result:**

| QA Result | Action |
|-----------|--------|
| `PASSED` | Continue |
| `PARTIAL` | Continue (note partial coverage in handoff) |
| `FAILED` | **STOP.** Report the failing user stories. Do not proceed to finishing until the user resolves them and re-runs. |

The QA report is saved to `docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md` by
`super.user-story-verification`.

**Caveman + QA gate:** `super.user-story-verification` runs in the `Verificando` state —
caveman remains active during QA; pass the caveman block into its invocation context so its
subagents also use caveman. Deactivate caveman only after QA returns and **before** gate 5:

```
[QA Gate result received]
→ Deactivate caveman: say the phrase "normal mode" in your own turn — do NOT re-invoke
  the caveman skill (invoking it returns the activation text, which turns it back ON)
  (and set session_caveman_in_effect = false)
→ Invoke super.finishing-a-development-branch
```

### 4. Done-state gate (deterministic — before handoff)

The QA gate verifies *features*, not bookkeeping. Run `parse-tasks.cjs` with `--assert-all-done`
— it exits non-zero if any task is not `[x]`/`Status: DONE`, or if the index and a task file
disagree:

```bash
node <super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs \
  --tasks-index <path> --assert-all-done
```

If it exits non-zero, fix the open or inconsistent tasks with `mark-task-status.cjs` while the
execution machinery is still loaded — `super.finishing-a-development-branch` re-runs this same
gate as a backstop, so a skip here surfaces there anyway. (Parallel/concurrent waves make a
missed checkbox especially easy — check carefully.)

### 5. Finish the branch

Deactivate caveman if active by **saying** `"normal mode"` — never by re-invoking the caveman
skill, whose output is activation text — and set `session_caveman_in_effect = false`
(finishing requires clear human-facing communication), then invoke
`super.finishing-a-development-branch`, passing the tasks index path (it re-runs the done-state
gate as a backstop).

## Continuous Execution

Do not pause to check in between tasks or waves. Execute everything without stopping for
"should I continue?" prompts — you were asked to execute the plan, so execute it. The only
reasons to stop: an unresolvable BLOCKED status, genuine ambiguity that prevents progress, a
wave-engine (`parse-waves.cjs`) error, a `safeForInTreeParallel: false` wave you cannot
reclassify (in-tree mode only), or completion.

## Required workflow skills (shared finish-gate set)

- **super.writing-plans** — produces the plan (and, when present, the PRD mapping and
  `## Execution Waves` data) these skills execute.
- **super.requesting-code-review** — code review template for the reviewer subagents.
- **super.systematic-debugging** — invoked when a verified bug or failing test surfaces
  during a task (not a review nit); capped attempt loop.
- **super.independent-verification** — always-on verification gate (gate 2): a fresh Verifier
  (author != verifier) re-derives spec coverage (evidence-or-zero) and runs the mutation-testing
  discrimination sensor; unconditional (runs even with no PRD).
- **super.user-story-verification** — QA gate (gate 3) before finishing: runs only when
  `session_qa_gate_enabled` is `true` (preference `workflow.qa_gate`, default on) **and** a PRD
  exists **and** the user consents; skipped silently when the preference is off, and skipped
  when no PRD or the user declines.
- **super.finishing-a-development-branch** — completes development after all tasks/waves
  (gate 5).

Each execution skill adds its own **mode-specific** required skills on top of this shared set
(e.g. `super.using-git-worktrees` for worktree isolation, `super.subagent-driven-development`
as the source of the per-task templates for the parallel skills, or the shared `parse-waves.cjs`
engine) — see that skill's own Integration section.

**Subagents should use:** `super.test-driven-development` — implementers follow TDD per task.
