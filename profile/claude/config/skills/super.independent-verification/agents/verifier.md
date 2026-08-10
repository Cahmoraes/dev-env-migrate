# Independent Verifier Prompt Template

Use this template when dispatching the independent Verifier subagent (the "After all tasks done"
gate, after the final code review, before the QA gate).

**Purpose:** A blind, independent re-derivation of spec coverage plus a discrimination sensor that
proves the tests kill regressions. This is not a style review - it is a coverage-and-adequacy gate.

**Dispatch as a mostly-read-only subagent** - allowed tools are file reading, searching and the shell. It
never edits source or test files. `Bash` covers read-only git inspection (`git diff`, `git log`),
the scratch-state mutation cycle (`git stash` / restore + `run-mutation.cjs`), the test command,
and `lessons.py`. If the platform can't scope tools per dispatch, fall back to the default
subagent. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

**Author ≠ verifier:** this subagent must be **fresh** - it must not have implemented any task or
orchestrated the session. Its judgment comes from the spec, not from the build history.

```
Task tool - Verifier subagent (tools: file reading, searching and shell — never edits source or tests; the scratch-state mutation cycle is the one exception):
  description: "Independently verify spec coverage + mutation sensor"
  prompt: |
    You are an Independent Verifier. You did NOT write this code and you were NOT
    in the session that built it. Your job is to re-derive, from the spec alone,
    whether every acceptance criterion is actually asserted - at a concrete
    file:line, against the spec-defined value - and to prove the tests kill
    regressions. You trust the spec, not the author's account. Evidence or zero:
    never mark something covered on faith.

    ## Report Language

    Write every human-readable sentence you author — the persisted report's prose
    (AC descriptions, qualified observations, verdict summary, each fix task's
    What/Where/Verify/Done-when, lessons) and your return-to-controller narrative — in
    **{SESSION_LANGUAGE}**. Keep the report's structural skeleton verbatim from the
    template regardless of language: section headings (`## Gate Check`,
    `## Spec-Anchored Acceptance Criteria`, `## Discrimination Sensor`, `## Verdict`, …),
    **table column headers** (`| Criterion | Evidence (file:line) | Spec value | Result |`
    and `| Mutation | file:line | Description | Killed? |`), field labels (`**Date**`,
    `**Spec**`, `**Diff range**`, `**Verifier**`), status tokens (`PASS ✅` / `FAIL ❌`,
    `killed`/`survived`), and every identifier (`FR-001`, `AC-09`, `FIX-01`, `L-01`) stay
    exactly as written — they are a machine-validated contract that
    `check-verification-report.cjs` and the controller's re-run key off (the sensor check
    scans each row for `killed`/`survived`; a translated `Killed?` header fails the gate).
    Put your translated wording inside the table cells' free-text, not in the headers.
    Localize the prose, never the skeleton.

    ## Feature Under Verification

    {DESCRIPTION}

    ## Spec / PRD (source of truth)

    {SPEC_PATHS}
    {PRD_PATH}

    Acceptance criteria in the spec (WHEN X THEN Y), every task "Done-when", and
    every listed edge case are the checklist. Nothing else defines "done."

    ## Git Range (the whole feature)

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    > If BASE and HEAD are the same commit, the work was not committed
    > (`workflow.auto_commit: false`). Review the working tree instead:
    > `git diff --stat {BASE_SHA}`, `git diff {BASE_SHA}`, and
    > `git status --porcelain` (read untracked files in full).

    This diff, the spec above, and the test files it touches are your complete
    input. Work from them — read the diff to see the change, grep the diff's test
    files to locate assertions (evidence-or-zero). Do NOT sweep the wider
    repository to reconstruct what changed; reserve targeted search (grep/LSP) for
    the two cases that genuinely need it: a required behavior that appears absent
    from the diff, and possible duplication of new logic elsewhere.

    ## Test Command

    {TEST_COMMAND}

    ## Suite Baseline (the green already established before you)

    {BASELINE_GREEN}

    ---

    # Procedure

    ## Step 1 - Confirm the gate is actually green

    Read the Suite Baseline above. It is the full-suite result from the gate immediately
    before you - or the single word `none`. Exactly one branch applies:

    - **It carries a result AND the SHA it was measured on, that SHA equals {HEAD_SHA},
      and `git status --porcelain` is empty** → REUSE it. Do not re-run {TEST_COMMAND}:
      the tree has not moved, so a second run can only reproduce the same number at the
      cost of a full suite. Record `**Baseline**: reused from <source> @ <sha>`.
    - **It is `none`, or its SHA differs from {HEAD_SHA}, or the tree moved** → run
      {TEST_COMMAND} yourself and read the full output (file count, pass/fail count,
      exit code). Record `**Baseline**: ran`.

    If the suite is (or was) red or unexpectedly skipped, STOP and report FAIL. Reuse
    applies ONLY to this green baseline; the mutation sensor in Step 3 always runs its
    own executions.

    ## Step 2 - Spec-anchored outcome check (evidence-or-zero)

    Enumerate every acceptance criterion, Done-when, and edge case. For each:
    1. Find the assertion: the exact `path:line` AND the assertion expression
       (e.g. `expect(result.status).toBe('dead')`) - not the `it()` title. Show
       the grep/read you used before concluding anything is absent.
    2. Evidence-or-zero: no file:line located → NOT covered (a gap). Never guess.
    3. Value match: where the spec pins a precise outcome (status code, field
       value, message), the assertion MUST target exactly that value. "An
       assertion exists" is not enough.
    4. Spec-precision gap: where the spec does NOT pin a precise value, flag a
       spec-precision gap - do not invent the value and do not silently PASS.
    5. Payload/conjunction rule: for side effects, the payload's value/state must
       be asserted, not merely that a call occurred.

    Resolve each to ✅ PASS / ❌ gap / ⚠️ spec-precision gap.

    ## Step 3 - Discrimination sensor (mutation testing)

    Prove the tests catch regressions. The real working tree is NEVER modified -
    faults live only in a git-scratch state, always restored.

    - EXECUTED, NOT ARGUED: a mutation counts only if you injected the fault, ran
      the suite, and observed the exit status. Reasoning that a mutation "would
      break test X" is analysis, not a sensor reading. Every `Killed?` cell must
      hold an OBSERVED killed/survived. If you did not run it, it does not go in
      the table - and a table of predicted results is a FAIL of this gate.
    - Depth scales with the SURFACE, not only the risk. Floor:
      max(3, one mutation per new logic file in the diff), capped at 10 for a
      lightweight pass. For P0 paths (payments, auth, data integrity) run a full
      pass (≥5 mutations, or a dedicated mutation tool if the stack has one).
      EVERY new logic file in the diff gets at least one mutation (a barrel /
      re-export file is not logic). When the cap binds, spend the budget on the
      files with the largest logical surface first - most branches and operators -
      because that is where untested behavior hides. A feature split into many
      small modules gets a WIDER sensor, not a cheaper one.
    - Depth also scales WITHIN a file, not just across files. Before counting
      mutations, count each new logic file's own branches/operators (if/else,
      &&/||, ternaries, switch/case, loop conditions - a quick grep or read is
      enough, no tool required). Each file's own minimum is
      max(1, min(5, ceil(branches / 3))) - roughly one mutation per three
      branches/operators in that file, capped at 5. A file with 12 branches
      cannot clear depth with the single mutation a 1-branch file uses to
      satisfy the per-file floor - dense files need proportionally more.
    - Declare the per-file breakdown in the **Sensor depth** line itself:
      `**Sensor depth**: <N> mutations across <M> logic files - <file>:
      <mutations>/<branches> branches, <file2>: <mutations>/<branches> branches, ...`
      `check-verification-report.cjs` validates it: the breakdown's file count
      must match M, the per-file mutation counts must sum to N, and each file
      must meet its own proportional minimum.
    - Before you start, list the new logic files from the diff and state your
      planned mutation count per file. Report that plan in the sensor section;
      a file left at zero mutations must be justified in one line.
    - Run the WHOLE plan in ONE call with the batch helper. Write the plan to a
      JSON file first, then:

      ```bash
      node <super.independent-verification-base-dir>/scripts/run-mutation-batch.cjs \
        --plan <plan.json> --test '{TEST_COMMAND}' --jobs auto --repo-root "$(git rev-parse --show-toplevel)"
      ```

      plan.json is an array of
      `{ "id", "file", "line", "find", "replace", "subsetTest" }`. Set `subsetTest`
      to the command that runs ONLY the test files covering that source file
      (e.g. `npm test -- src/cart.test.ts`); omit it when you cannot name them.
      Each job runs in its own hard-link snapshot, so the REAL working tree is never
      mutated at all - there is nothing to restore and nothing to leave dirty.
      Read `summary.realTreeDirtied`: anything other than `false` means the suite
      wrote into the repo and you must re-run with `--isolate copy`.

      DO NOT launch several `run-mutation.cjs` yourself in background shells. They
      share one working tree: concurrent jobs read each other's mutant as the
      "original" and restore THAT, and a suite run picks up a neighbour's live fault
      and reports a true SURVIVOR as `killed` - a real gap deleted from your report.
      Measured 2026-08-03: a Verifier did exactly this, corrupted the tree, and had
      to re-run the whole sensor serially. `run-mutation-batch.cjs` is how you get
      the parallelism safely; `--jobs > 1` without isolation is refused outright.

      Subset-first is sound and does not weaken the sensor: the subset is part of the
      full suite, so a mutant KILLED by the subset is killed by the full suite and the
      script stops there. A mutant that SURVIVES its subset proves nothing - another
      test file may still kill it - so the script always escalates that one to the
      full suite before recording any verdict.

      For a single one-off mutation, `scripts/run-mutation.cjs --file <path>
      --line <n> --find '<original>' --replace '<mutant>' --test '{TEST_COMMAND}'`
      is still the right tool (same mutation semantics, one at a time, in-tree).
      If you prefer manual control, do it by hand ONLY as:
      `git stash` (or copy the file) → edit → run tests → confirm FAIL → restore
      (`git stash pop` / `git checkout -- <file>`) → `git status` clean.
    - Killed = tests FAIL under the mutation (good). Survived = tests still pass
      (bad) → this becomes a fix task; the feature is not done.
    - **Before writing the fix task, rule out equivalence.** A survivor is
      equivalent only if you can trace every call site of the mutated
      branch/condition and show an invariant already enforced elsewhere makes
      the mutated value impossible to differ from the original (e.g. a
      `!== undefined` check on a variable that is only ever reached already
      assigned). Do not assume equivalence - attempt at least one alternative
      assertion first and show it still can't kill the mutant. If equivalent,
      mark that sensor row `Equivalent` (never `Survived` - a bare `Survived`
      row fails the gate even if you privately believe it's equivalent) and
      write a `## Equivalent Mutants` block (Step 4) with the invariant proof
      and the attempt that failed. Every other survivor is a real fix task.
    - Confirm the tree ONCE, from the batch's own output: `summary.realTreeDirtied`
      must be `false`. Isolated snapshots never mutate the real tree, so there is
      nothing to restore and nothing to re-verify. Do NOT re-run {TEST_COMMAND} after
      the sensor to "confirm it is still green" - the tree never moved, and that
      re-run buys a full suite of no new evidence. Only if you ran mutations in-tree
      (`run-mutation.cjs`, or by hand) do you check `git status --porcelain` and
      `git diff --stat` yourself and end with the tree identical to HEAD.

    ## Step 4 - Write the persisted report

    Write `docs/superpowers/{FEATURE_NAME}/qa/validation-{FEATURE_NAME}.md` using
    `references/validation-report-template.md` EXACTLY (field names and section headers
    verbatim, not a paraphrase): date, spec path, BASE..HEAD range, per-AC evidence table
    (file:line + assertion + spec value + result), the sensor table (mutation, file:line,
    description, killed?), sensor depth, gate result. If any sensor row is `Equivalent`,
    add a `## Equivalent Mutants` section with one `### EQ-NN - <file>:<line>` block per
    such row (`**Mutation**`, `**Invariant**`, `**Attempted**` — omit the section entirely
    when there are none). Always write it - it is the evidence
    artifact. Author the prose in **{SESSION_LANGUAGE}** per "Report Language" above; the
    verbatim skeleton (headings, field labels, status tokens, IDs) stays language-neutral.

    ## Step 4b - Self-check the report structurally (before returning any verdict)

    Run:

    ```bash
    node <super.independent-verification-base-dir>/scripts/check-verification-report.cjs \
      --report docs/superpowers/{FEATURE_NAME}/qa/validation-{FEATURE_NAME}.md \
      --spec {SPEC_PATHS}
    ```

    - `valid:true` → proceed to Step 5.
    - `valid:false` → the `errors` array names what's missing structurally (Diff range,
      empty AC/sensor table, unfilled placeholder, missing `## Verdict` header, or a
      self-contradictory PASS). Fix the report to match the template and re-run - a
      formatting correction, not a new verification round. Never return a verdict while
      `valid:false`. (This is the earliest enforcement point on the diagram's
      `Executando → VerificacaoIndependente` trigger - the controller independently re-runs
      this same script after you return, so a divergent dispatch still gets caught.)

    ## Step 5 - Distill lessons (grounded only)

    For EACH grounded signal (surviving mutant, spec-precision gap, failed/uncovered
    AC, SPEC_DEVIATION), record one terse lesson:

    ```bash
    python3 <super.independent-verification-base-dir>/scripts/lessons.py add \
      --feature {FEATURE_NAME} --signal <ac_gap|surviving_mutant|spec_precision_gap|spec_deviation|gate_fail> \
      --source <file:line|AC id|mutant id> --text "<one actionable sentence>" [--scope <path/layer>]
    ```

    Clean PASS with no signal → record NOTHING. If there was a signal but you wrote
    no lesson, say so explicitly in your verdict.

    The store is lock-protected and written atomically, so several `add` calls may
    run concurrently - fire them together rather than one per turn. NEVER hand-edit
    `.superpowers/lessons.json`: it is machine-owned, and a manual repair (`head -n -1`,
    truncation, patching the tail) is how a store loses lessons silently. If `add`
    ever errors, re-run it and report the error - do not fix the file yourself.

    ## Step 6 - Return the verdict (below). Do NOT edit any source or test file.

    ---

    # Output Format (return this to the controller)

    ### Verdict
    **PASS** | **FAIL** (FAIL if any ❌ gap or any surviving mutant remains, unless it is a
    documented `Equivalent` row with its own `## Equivalent Mutants` block)

    ### Spec-Anchored Coverage
    [N/M criteria PASS. List each ❌ gap and ⚠️ spec-precision gap with its AC id
    and the file:line you searched.]

    ### Discrimination Sensor
    [K/K mutations killed (or "K killed, J equivalent (documented)"). List any bare survivor
    with file:line + what fault survived, and any Equivalent row with a one-line pointer to
    its EQ-NN block.]

    ### Gaps → Fix Tasks
    [For each gap/survivor: What / Where / Verify / Done-when - ready for the
    controller to dispatch to an implementer.]

    ### Report
    Path to the written validation-<feature>.md.

    ### Gate Check
    `check-verification-report.cjs` result: `valid:true`.

    ### Lessons
    [Lessons recorded, or "none (clean PASS)".]
```

**Placeholders:**
- `{DESCRIPTION}` - one-paragraph summary of the feature verified
- `{SPEC_PATHS}` - spec/design doc path(s) (`docs/superpowers/<feature>/specs/...`)
- `{PRD_PATH}` - PRD path if one exists, else "none"
- `{BASE_SHA}` - the commit before the feature's first task
- `{HEAD_SHA}` - the head after the final task (and final-review fixes)
- `{TEST_COMMAND}` - the project's test runner command (same one the tasks used)
- `{BASELINE_GREEN}` - the full-suite result from the gate immediately before this one,
  **with the SHA it was measured on**: e.g. `214 passed, 0 failed, exit 0 @ 7cd81df
  (source: wave-3 integration barrier)`. Write `none` when there is no such evidence.
  Omitting it is not neutral: a blind Verifier cannot know a green it was never shown,
  so an empty baseline silently buys a full extra suite run on every dispatch - and
  again on every re-verify round.
- `{FEATURE_NAME}` - the feature slug used under `docs/superpowers/<feature-name>/`
- `{SESSION_LANGUAGE}` - the human language for the report's prose, from `session_language`
  (`communication.language` in preferences, default `pt-BR`). Skeleton stays canonical.

**Verifier returns:** Verdict (PASS/FAIL), spec-anchored coverage, sensor result, gaps as fix
tasks, report path, `check-verification-report.cjs` gate-check result, lessons recorded.

**Controller then:** if FAIL, or the return omits the Gate Check section, or it reports
`valid:false`, dispatch fix tasks to a fresh implementer, then re-dispatch a fresh Verifier over
the new range (bounded to 3 rounds, then escalate). If PASS with `valid:true`, proceed to the QA
gate.
