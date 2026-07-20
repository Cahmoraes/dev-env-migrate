# Lessons Layer - Self-Improving Guidance

A grounded lessons layer that turns each verification failure into reusable, project-local
guidance. The LLM supplies judgment (which failure, how to phrase it, what grounds it); the script
`scripts/lessons.py` owns everything mechanical (IDs, recurrence counting, promotion, pruning,
demotion, rendering). Bookkeeping by hand is exactly what rots a lessons file, so it lives in the
script, not in a prompt.

- **Canonical state:** `.superpowers/lessons.json` (machine-owned - never hand-edit)
- **Rendered view:** `.superpowers/LESSONS.md` (regenerated on every write)
- Pure Python standard library, no dependencies. Run from the project root, or pass `--root`.

## WRITE - after validation (grounded only)

Runs inside the independent-verification gate, immediately after `validation.md` is written. For
**each grounded signal**, record **one** terse, general lesson:

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py add \
  --feature <feature> \
  --signal <ac_gap|surviving_mutant|spec_precision_gap|spec_deviation|gate_fail> \
  --source <file:line | AC id | mutant id | SPEC_DEVIATION ref> \
  --text "<one actionable sentence>" [--scope <path/layer/tag>]
```

**Hard gate: no signal → no lesson.** A clean PASS records nothing - an ungrounded lesson is
opinion, and the script rejects an `add` with no `--source` (exit 2). If there *was* a signal but
you recorded no lesson, that is a miss - check `lessons.py status` for a new entry before closing
the gate, and say so explicitly in the verdict.

**Scope discipline:** capture only project-local execution lessons with grounding (e.g. "sliding-
window boundary needs an explicit burst-across-boundary assertion"). Do **not** capture opinions
about the SDD process itself - those are maintainer decisions, not auto-written lessons.

## READ - at planning (confirmed only)

Load confirmed lessons at the start of `super.brainstorming` and again in `super.writing-plans`
(and for Large/Complex work, during design), then apply them while writing the spec/plan:

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py list --status confirmed \
  [--scope billing] [--query "idempotency"]
```

Only `confirmed` lessons are loaded as guidance - never `candidate` or `quarantined`.

## Lifecycle (script-owned, deterministic)

- **Recurrence = number of DISTINCT features** a lesson reappeared in. New lesson enters as
  `status=candidate, recurrence=1`.
- **Promotion:** candidate → `confirmed` when `recurrence >= promote_threshold` (default **2**
  distinct features).
- **Prune (auto on add/list):** candidates with `recurrence < threshold` older than `window_days`
  (default **45**) are dropped - keeps the file from becoming a dead log.
- **Demotion / quarantine:** if a `confirmed` lesson was loaded and the same failure recurred
  anyway, `lessons.py penalize --id L-NNN`. **2 penalties → quarantined** (stops being loaded).

Signals accepted by `--signal`: `ac_gap`, `surviving_mutant`, `spec_precision_gap`,
`spec_deviation`, `gate_fail`. Commands: `init`, `add`, `list`, `penalize`, `prune`, `status`.
