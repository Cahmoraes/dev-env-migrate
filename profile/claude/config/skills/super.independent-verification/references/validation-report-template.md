# Validation Report Template

The Verifier writes this to `docs/superpowers/<feature-name>/qa/validation-<feature-name>.md`.
It is the persisted evidence artifact - always written, PASS or FAIL. Fill every section from
real evidence; never leave a placeholder.

**Language:** author the prose in `session_language` (`communication.language`, default `pt-BR`).
The skeleton below stays verbatim in any language — section headings, **table column headers**
(`Criterion`/`Result`, `Mutation`/`Killed?`), field labels (`**Date**`, `**Diff range**`, …),
status tokens (`PASS ✅`/`FAIL ❌`, `killed`/`survived`/`equivalent`), and IDs (`FR-001`, `AC-09`) are a
machine contract checked by `check-verification-report.cjs`. Do NOT translate them; put localized
wording in the table cells, not the headers.

```markdown
# <Feature> - Independent Validation

**Date**: <YYYY-MM-DD>
**Spec**: docs/superpowers/<feature>/specs/<feature>-design.md
**PRD**: docs/superpowers/<feature>/prd/prd-<feature>.md   <!-- or "none" -->
**Diff range**: <BASE_SHA>..<HEAD_SHA>   <!-- or: WORKING-TREE — never committed (auto_commit: false) -->
**Verifier**: INDEPENDENT   <!-- fresh subagent, author ≠ verifier. Only other legal value: SELF-DEGRADED (author == verifier) — which caps the verdict at PASS (degraded) -->
**Sensor depth**: <N> mutations across <M> logic files — <file>: <mutations>/<branches> branches, <file2>: <mutations>/<branches> branches   <!-- floor: max(3, one per new logic file), cap 10; per file: max(1, min(5, ceil(branches/3))) -->


---

## Gate Check

- **Command**: <TEST_COMMAND>
- **Result**: <N passed, M failed, K skipped> - exit <code>
- **Baseline**: <"ran" when you executed the suite yourself, or "reused from <source> @ <sha>" when you inherited the green from the gate before you. A reuse needs the SHA it was measured on — "already green" without one is an assertion, not evidence.>
- **Typecheck/build**: <result — or "no such script in this project". "Not run / out of scope" is not an acceptable answer when the project defines one: a type error is exactly the cross-cutting breakage scoped tests cannot see.>

---

<!-- REQUIRED whenever Gate Check reports 1+ failing test. Delete this whole section when
     the gate is green. A red gate can still be a legitimate PASS, but only if every
     failure is named here with the baseline SHA it was reproduced on — otherwise an
     accepted failure is indistinguishable from a regression this diff introduced, and
     nobody downstream can act on it. -->

## Pre-Existing Failures

| Failing test | Baseline SHA | Evidence |
| --- | --- | --- |
| <test name as the runner prints it> | <SHA where it was reproduced> | <how it was confirmed unrelated to this diff> |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion expression | Result |
| --- | --- | --- | --- |
| <AC-01 WHEN … THEN …> | <precise value/state from spec> | `path/to.test.ts:42` - `expect(x).toBe(v)` | ✅ PASS |
| <AC-02 …> | <value> | `path/to.test.ts:88` - `expect(res.status).toBe(429)` | ✅ PASS |
| <AC-03 …> | not pinned in spec | - | ⚠️ Spec-precision gap |
| <AC-04 …> | <value> | not located | ❌ Gap (uncovered) |

**Coverage**: <N/M> criteria PASS · <count> gaps · <count> spec-precision gaps

---

## Discrimination Sensor

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | `src/retry.ts:11` | `Math.min(...)` → `Math.max(...)` | ✅ Killed |
| 2 | `src/queue.ts:23` | `<= 0` → `< 0` | ✅ Killed |
| 3 | `src/store.ts:35` | corrupt-JSON `return []` → `throw` | ✅ Killed |

**Depth**: <lightweight (1–3) | P0-full (≥5 or dedicated tool)>
**Result**: <K/K killed, or "K killed, J equivalent (documented)"> - <PASS ✅ | FAIL ❌ (bare survivor → fix task)>

Post-sensor tree state: `git status --porcelain` empty, `git diff --stat` empty.

---

## Equivalent Mutants

<!-- Omit this whole section if no sensor row is marked "Equivalent". One block per such row -
     a bare "Survived" row still fails the gate; only a row backed by a block here is accepted. -->

### EQ-01 - <file:line>
- **Mutation**: <what was mutated, matching the sensor row>
- **Invariant**: <the traced proof that no reachable input can make this mutant observable>
- **Attempted**: <the alternative assertion you tried that still couldn't kill it>

---

## Gaps → Fix Tasks

<!-- Omit if clean PASS. One block per gap/survivor. -->

### FIX-01 - <title>
- **What**: <the fix>
- **Where**: <paths>
- **Verify**: <how the fix is proven>
- **Done-when**: <the fix's acceptance criteria>

---

## Verdict

**<PASS ✅ | FAIL ❌>** - <1–2 sentence technical summary>

**Lessons recorded**: <L-IDs, or "none (clean PASS)">
```
