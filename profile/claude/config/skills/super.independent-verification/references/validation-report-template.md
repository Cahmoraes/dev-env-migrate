# Validation Report Template

The Verifier writes this to `docs/superpowers/<feature-name>/qa/validation-<feature-name>.md`.
It is the persisted evidence artifact - always written, PASS or FAIL. Fill every section from
real evidence; never leave a placeholder.

```markdown
# <Feature> - Independent Validation

**Date**: <YYYY-MM-DD>
**Spec**: docs/superpowers/<feature>/specs/<feature>-design.md
**PRD**: docs/superpowers/<feature>/prd/prd-<feature>.md   <!-- or "none" -->
**Diff range**: <BASE_SHA>..<HEAD_SHA>
**Verifier**: fresh independent subagent (author ≠ verifier)

---

## Gate Check

- **Command**: <TEST_COMMAND>
- **Result**: <N passed, M failed, K skipped> - exit <code>
- **Typecheck/build** (if applicable): <result>

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
**Result**: <K/K killed> - <PASS ✅ | FAIL ❌ (survivor → fix task)>

Post-sensor tree state: `git status --porcelain` empty, `git diff --stat` empty.

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
