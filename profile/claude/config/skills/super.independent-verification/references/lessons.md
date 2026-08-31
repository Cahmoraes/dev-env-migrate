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

Runs inside the independent-verification gate, immediately after `validation.md` is written.
**Read the store before writing to it** - promotion needs the *same* sentence twice:

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py list --status active
```

`active` is candidate + confirmed - everything still worth corroborating; quarantined lessons
are excluded, since writing into one is a dead record.

If a recorded lesson already states the rule the new signal proved, reuse its `--text`
**verbatim**; that is the only way recurrence ever reaches 2. For **each grounded signal**
with nothing to reuse, record **one** general lesson:

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py add \
  --feature <feature> \
  --signal <ac_gap|surviving_mutant|spec_precision_gap|spec_deviation|gate_fail> \
  --source <file:line | AC id | mutant id | SPEC_DEVIATION ref> \
  --text "<the general rule, max 200 chars>" [--scope <path/layer/tag>]
```

**Generality gate (mechanical).** A new `--text` is refused (exit 2) when it runs past
`MAX_TEXT_CHARS` (200) or names a file, a path, or a line number - a sentence bound to one
feature can never recur, so it would age out unread. The incident goes in `--source`, the area
in `--scope`. The gate covers **minting only**: re-affirming an already-recorded lesson is never
refused, including one written before the gate existed.

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

- **Identity = the normalized `--text`.** A lesson *is* its rule, so the same sentence is the
  same lesson no matter which signal detected it this time (the signals accumulate on it).
  Reusing a recorded text verbatim is therefore the only way a lesson ever corroborates.
- **Recurrence = number of DISTINCT features** a lesson reappeared in. New lesson enters as
  `status=candidate, recurrence=1`.
- **Promotion:** candidate → `confirmed` when `recurrence >= promote_threshold` (default **2**
  distinct features).
- **Prune (auto on `add`, and the explicit `prune` command):** candidates with
  `recurrence < threshold` older than `window_days` (default **45**) are dropped - keeps the
  file from becoming a dead log. Two orderings matter: **`list` never prunes and never
  writes**, and inside `add` the prune runs **after** the lesson is matched, never before.
  Both protect the same thing - a lesson the Verifier just read and is corroborating right
  now must not be deleted out from under the reuse. Age is measured from `updated`, so every
  corroboration renews the window.
- **Scope accumulates.** A rule corroborated in a second area is findable under both, so
  `list --scope` does not hide it from every area but the first one recorded.
- **Demotion / quarantine:** if a `confirmed` lesson was loaded and the same failure recurred
  anyway, `lessons.py penalize --id L-NNN`. **2 penalties → quarantined** (stops being loaded).
  This is **manual**: no skill invokes `penalize`, because deciding it needs to know which
  lessons were served at planning time for *this* feature, and nothing records that yet.
  Corroborating an already-`confirmed` lesson is *not* an automatic penalty - a rule that
  recurs often would then be quarantined for being useful.

Signals accepted by `--signal`: `ac_gap`, `surviving_mutant`, `spec_precision_gap`,
`spec_deviation`, `gate_fail`. Commands: `init`, `add`, `list`, `penalize`, `prune`, `status`.
