# Mutation Tooling - The Discrimination Sensor Recipe

The sensor proves the tests are **discriminating** - that they fail when the behavior is wrong,
not just pass when it is right. A suite that passes under an injected fault is not testing that
behavior. This is the single check that catches "green but hollow" tests.

The non-negotiables (real tree never mutated, only NEW logic mutated, a survivor is a fix task),
the proportional depth (lightweight 1–3 vs P0-full ≥5 or a dedicated tool - Stryker/mutmut/
cargo-mutants/pitest) — now scaled *within* a file too, by its own branch/operator count, not just
its existence in the diff (`max(1, min(5, ceil(branches / 3)))` per file) — and the safe
mutate→test→restore cycle (`scripts/run-mutation.cjs`, or the manual `git stash`/copy fallback) are
the same procedure the Verifier runs - full text in `agents/verifier.md`, Step 3.

## Running the plan (one call, isolated, subset-first)

`scripts/run-mutation-batch.cjs` runs the whole plan in a single call:

```bash
node <base>/scripts/run-mutation-batch.cjs --plan plan.json \
  --test '<full test command>' --jobs auto --repo-root "$(git rev-parse --show-toplevel)"
```

`plan.json` is an array of `{ id, file, line, find, replace, subsetTest }`. Three
things make it faster without changing a single verdict - measured on a 6-core box
with a CPU-bound suite, verdict vector identical to the serial baseline in every
configuration:

| Lever | What it does | Speedup |
|---|---|---|
| batch | one tool call instead of one per mutation | 1.01x (buys round-trips, not runtime) |
| isolation | each job in its own hard-link snapshot | 2.16x |
| subset-first | related tests first, escalate on survival | 1.65x |
| **all three** | | **3.21x** |

**Isolation is what makes the parallelism safe.** Mutations share one working tree,
so `run-mutation.cjs` is *not* re-entrant: launching several at once makes each read
a neighbour's mutant as the "original" and restore that, and makes a suite run trip
over a neighbour's live fault. The second failure is the dangerous one - a genuine
survivor comes back `killed`, and a real gap silently leaves the report. The batch
script gives each job a hard-link snapshot (file-count cost, no byte copy: 910 files
in ~100ms) and refuses `--jobs > 1` without it. The real tree is never mutated, so
there is nothing to restore; `summary.realTreeDirtied` is the tripwire for a suite
that writes into the repo (use `--isolate copy` for those).

**Subset-first does not weaken the sensor.** The subset is part of the full suite,
so `killed(subset) ⟹ killed(full)` - a kill there is conclusive. The converse fails:
a mutant can survive its own test file and still be killed by another one, so a
surviving subset is inconclusive and always escalates to the full suite before any
verdict is recorded. Skipping that escalation produces false survivors, which is why
the escalation branch has a dedicated test.

Single one-off mutation: `scripts/run-mutation.cjs` (same mutation semantics, in-tree).

## Mutation types (pick faults a correct test must catch)

- **Boolean-condition flip:** `if (x)` → `if (!x)`, `>` → `>=`, `&&` → `||`.
- **Return-value change:** wrong status code, `status:'active'` → `'inactive'`, `0` instead of a
  computed value, `min` → `max`.
- **Off-by-one:** loop bound, slice index, `attempt-1` → `attempt`.
- **Remove a required side effect:** delete a `notify()` / `persist()` call the spec demands.

## Reading the result

- **All killed** → the tests discriminate for the behaviors you probed. Sensor PASS.
- **Any survivor** → the assertion for that behavior is missing or too weak. Emit a fix task
  ("strengthen assertion so mutation X is caught"), let the implementer add/fix the test, then
  re-run the sensor over the new range.
- **Before emitting the fix task, rule out equivalence.** Trace every call site of the mutated
  branch/condition; if an invariant already enforced elsewhere in the code guarantees the mutated
  value can never actually differ (e.g. `x !== undefined` right after a check that guarantees `x`
  is assigned), no test can kill it — attempting one only produces a tautological assertion.
  Confirm this by tracing the code, not by assumption, and attempt at least one alternative
  assertion first. Mark it `Equivalent` (not `Survived`) in the sensor table and add a dedicated
  `## Equivalent Mutants` block (file:line, the invariant proof, the attempt that still couldn't
  kill it) to the report — a bare `Survived` row fails the gate regardless of what you privately
  believe, and a `check-verification-report.cjs` run rejects an `Equivalent` row with no matching
  block or a placeholder justification.
