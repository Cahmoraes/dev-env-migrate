# Mutation Tooling - The Discrimination Sensor Recipe

The sensor proves the tests are **discriminating** - that they fail when the behavior is wrong,
not just pass when it is right. A suite that passes under an injected fault is not testing that
behavior. This is the single check that catches "green but hollow" tests.

The non-negotiables (real tree never mutated, only NEW logic mutated, a survivor is a fix task),
the proportional depth (lightweight 1–3 vs P0-full ≥5 or a dedicated tool - Stryker/mutmut/
cargo-mutants/pitest), and the safe mutate→test→restore cycle (`scripts/run-mutation.cjs`, or the
manual `git stash`/copy fallback) are the same procedure the Verifier runs - full text in
`agents/verifier.md`, Step 3.

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
