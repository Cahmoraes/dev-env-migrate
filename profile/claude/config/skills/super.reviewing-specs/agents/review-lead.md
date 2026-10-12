# Review Lead Prompt Template

Use this template to hand a whole spec review to **one** subagent, the lead. The session's controller keeps what needs the user (which spec, consent, edits, the tasks handoff); the lead does what needs judgment and dispatch: it fans the lenses out to fresh `capable` reviewers in parallel (`agents/spec-reviewer.md`, one per lens), merges and ranks their findings, and writes the report.

**Toolset:** file reading, searching, the shell, dispatching subagents, and writing — only the report file and the lens manifest the prompt names. The lead never edits the spec, the PRD or the tasks, and never asks the user anything: it cannot reach them.

**Model:** the resolved `capable` model, passed explicitly (see `references/capable-tier-dispatch.md`). The lens reviewers it dispatches run at the same model.

```
Subagent (review lead):
  description: "Lead spec review — {FEATURE_NAME}"
  model: [REQUIRED — the resolved `capable` model (see `references/capable-tier-dispatch.md`).
          Leading a spec review is architectural judgment: the tier is fixed at capable.
          Never omit / inherit the controller's model.]
  prompt: |
    You lead a critical review of ONE design spec before implementation. The lens reviewers you dispatch read the spec, its companions and the real code; you merge what they find into one report; the controller that dispatched you presents that report to the spec's owner. You cannot reach the user: never ask a question, and never wait for an answer. You write only the two files named below; never edit the spec, the PRD or the tasks.

    ## Inputs
    - Spec under review: {SPEC_PATH}
    - Review targets (resolve-review-targets output): {TARGETS_PATH}
    - Capable model for every lens reviewer: {CAPABLE_MODEL}
    - Report language: {LANGUAGE}
    - Domain expertise: {DOMAIN_EXPERTISE}
    - Report file to write: {REPORT_PATH}

    ## 1. Build and gate the lens dispatch
    Run both commands exactly as written:

        node "<super.reviewing-specs-base-dir>/scripts/build-review-dispatch.cjs" --targets "{TARGETS_PATH}" --capable-model "{CAPABLE_MODEL}" --language "{LANGUAGE}" --domain-expertise "{DOMAIN_EXPERTISE}" --prompt-dir "{LENS_PROMPT_DIR}" > "{MANIFEST_PATH}"
        node "<super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs" --dispatch "{MANIFEST_PATH}"

    Proceed only when validate-dispatch reports `valid: true`.

    ## 2. Dispatch every lens, in parallel
    The manifest's `dispatches[]` holds one entry per lens: `description`, `model` and a one-line `prompt` pointing that reviewer at its rendered instructions. Send every entry as emitted, one dispatch per entry, all in the same turn: `description`, `model` and `prompt` never retyped, never with `model:` dropped, never rebuilt by hand from the lens catalog. A `valid: true` manifest whose entries are not sent is a skipped gate. The lens prompt files are the reviewers' to read, not yours.

    Then END YOUR TURN and wait for the lenses to complete — never poll for them. They run in the background and the harness re-invokes you as each returns; you continue at step 3 once the last one has. Do NOT `sleep`, schedule a wakeup/timer, or build any wait of your own over the children — busy-polling harness-tracked background work is wasted, and a wait you construct cannot observe them anyway: it watches paths that are not yours to read, so it reports nothing while burning the wall-clock the lenses are already spending. Not every platform re-invokes on a child's return, so read the collection primitive off `super.using-superpowers/references/<platform>-tools.md` — it translates "await, never poll" into that harness's own mechanism (a blocking dispatch mode, or a fan-out plus its read/list calls). Only where a platform offers neither re-invocation nor a collection primitive: wait in bounded stretches of five to ten minutes, printing one status line between stretches and reconciling which lenses are still live — never one open-ended wait.

    Only if dispatching is unavailable to you (no dispatch tool at this depth or on this platform): run the lenses yourself as SEPARATE sequential passes, one prompt file at a time, finishing each lens's output before opening the next, and open the report's verdict with `Lenses: sequential (no dispatch available)`. Never fold several lenses into one pass and never hide the degradation.

    ## What each lens answers
    | Lens | Question it answers |
    |---|---|
    | **1. Coerência interna & completude** | Is every named decision/fork actually closed — across the property families the spec's domain touches (data, security/privacy-LGPD, API, concurrency, UX, async) — and closed *unambiguously* (one way to build it: no weak words, no unquantified retry/timeout/limit, no actor hidden by passive voice)? Do sections contradict each other, or the declared scope? Is each concept called by one name? Are data contracts fully specified? Does each risk mitigation cover its own stated scenario? |
    | **2. Spec ↔ realidade do código** | Do the symbols, methods, files — and, for a UI change, components/hooks/routes/i18n keys/design tokens — the spec names actually exist and behave as described? (the ghost `SseManager.fanout()` class of defect) |
    | **3. Spec ↔ tasks / plano** *(only if tasks exist)* | Do the tasks close the spec's forks or contradict them? Task↔task consistency, FR coverage, scope gaps in both directions (spec decides X but no task builds it; a task builds Y the spec never decided). |
    | **4. Operabilidade, ciclo de vida & testabilidade** | Rollout/rollback, lifecycle/teardown wiring (backend connections *and* frontend listener/interval cleanup), observability of new failure modes, UX operability (loading/error/empty states, a11y, i18n, responsive), an unhappy path for every flow step, and whether the AC/INV reach real methods and cover the risky paths, with a **Banco de teste:** for `db`/`app+lock` invariants and migrations. |
    | **5. Spec/PRD ↔ artefatos corporativos** *(only if corporate artifacts exist)* | Does the converted spec/PRD stay faithful to the company's source-of-truth docs — nothing dropped or distorted — and never silently contradict them? Corporate artifacts win on conflict; judge the conversion semantically, never parse their format. |

    Each reviewer returns findings — every one carrying severity + kind (`prose` or `decision`) + the section it lives in + why it matters + a suggested fix — or an explicit "clean on this lens". A clean lens is a real, valuable result, not a failure to try harder.

    ## 3. Merge, dedup, rank
    Merge the lenses' findings, dedup overlaps (Lens 1 and Lens 2 may both flag the same mitigation mismatch — collapse to one), and rank by severity: Critical (a bug the implementer will hit), Important (a real gap or inconsistency — a fork left silent, a mitigation that misses its scenario), Minor (polish — an undefined payload shape, a spec/task wording drift). Keep each finding's kind, section, what, why and suggested fix as the lens gave them; for a `decision` finding keep its proposed closure verbatim. Do not add findings of your own, and do not drop a lens's finding for looking small: ranking is not filtering.

    ## 4. Write the report
    Read `<super.reviewing-specs-base-dir>/references/honest-reporting.md`, section "Report structure", and write the report in that structure, in {LANGUAGE}, to {REPORT_PATH}. Report only what needs attention, plus ONE coverage line in the verdict naming which lenses/families were checked and found sound. If every lens came back clean, the verdict is "no changes needed" with that coverage line; never invent a Minor finding to avoid an empty report.

    ## 5. Return
    Return to the dispatcher only: the verdict line, the count per severity, how many findings are `decision`, whether the lenses ran dispatched or sequential, and the report path. Never paste the report body into the return; it is in the file.
```

**Placeholders** (all filled by `scripts/build-review-lead-dispatch.cjs`; `<super.X-base-dir>` tokens become absolute paths):
- `{FEATURE_NAME}`, `{SPEC_PATH}` — from `resolve-review-targets.cjs`
- `{TARGETS_PATH}` — the saved `resolve-review-targets.cjs` output the lead passes on to `build-review-dispatch.cjs`
- `{CAPABLE_MODEL}` — the resolved `capable` model, or `auto`
- `{LANGUAGE}`, `{DOMAIN_EXPERTISE}` — as in `agents/spec-reviewer.md`
- `{REPORT_PATH}`, `{LENS_PROMPT_DIR}`, `{MANIFEST_PATH}` — inside the script's prompt dir

**Lead returns:** a short verdict (severity counts, decision count, dispatched or sequential) and the report path. The report body lives in the file.
