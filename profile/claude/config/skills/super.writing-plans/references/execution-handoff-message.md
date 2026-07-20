# Execution Handoff Message

After saving the index and task files, offer the message below (fill in feature name, task count, wave summary).

> **The `(recommended)` tag is dynamic — never hardcode it on option 1.** Run `parse-waves.cjs` (already run in self-review), read `executionRecommendation`, and place `(recommended)` on the option matching the mode you elect per the rubric below. Tagging the same option every time is the bug this prevents.

## Step 1 — Read the deterministic recommendation

`parse-waves.cjs` emits `executionRecommendation`:

```jsonc
{
  "mode": "parallel-subagent",       // the mode to tag (recommended), derived from wave structure
  "optionNumber": 3,                  // 1..3 — 1 for sequential plans, 3 for parallel
  "confidence": "high|medium",
  "decisionRequired": true|false,    // true → you MAY refine the in-tree/worktrees pick
  "signals": [ "..." ],              // structural facts about THIS plan
  "alternatives": [ { "mode": "...", "optionNumber": 2, "when": "..." } ]
}
```

## Step 2 — Elect the mode (the rubric)

- **`decisionRequired: false`** (no parallelizable wave) → decidable from the artifacts alone. Tag the named option (`optionNumber`) `(recommended)`, give the one-line reason from `signals`, done — parallel modes add no speedup here.

- **`decisionRequired: true`** (≥1 parallel wave) → `parse-waves` already recommends a **parallel mode — option 3 (worktrees)** (wave structure shows parallelism; worktrees are safe regardless of write-set disjointness). It does **not** fall back to option 1. Confirm or refine for THIS plan before tagging, in order:
  1. **Tightly coupled?** If the parallel-wave tasks are tightly coupled (high fan-in in `signals`, one task's shape dictates the others, a known design trap from research/brainstorming) so an early error would cascade, the per-task review checkpoint of **option 1 (subagent-driven)** can outweigh the parallelism → move `(recommended)` to option 1 and say why.
  2. **Disjoint writes + expensive isolation?** If the wave's tasks write **disjoint files** (confirm `check-wave-disjoint.cjs --wave N` → `safeForInTreeParallel: true`) **and** worktree isolation is expensive — a pnpm/npm/yarn monorepo where each worktree needs its own heavy `node_modules`, or a sandbox that forbids extra checkouts — move `(recommended)` to **option 2 (in-tree)**. Note `check-wave-disjoint.cjs` lives in the sibling skill `super.parallel-subagent-in-tree` (not alongside `parse-waves.cjs`); resolve its path by replacing the final `super.writing-plans` segment of this skill's base directory with `super.parallel-subagent-in-tree`.
  3. **Otherwise** keep `(recommended)` on the recommended **option 3 (worktrees)**.
- Whichever you elect, **move `(recommended)` there** and give your reasoning in one short paragraph (raw material: `signals`, `alternatives[].when`). Then flag environment chokepoints (e.g. a wave needing Postgres up or `generate:types`) that serialize regardless of mode.

## Step 3 — Offer the message

---

**"Tasks created and saved to `docs/superpowers/<feature-name>/plans/`.**
**Task index: `tasks-<feature-name>.md` with N tasks.**

**Execution Waves: W wave(s) — P parallelizable (largest parallel wave: K tasks).**

**Recommended for this plan: option X** — <one short paragraph of reasoning from Step 2>

**0. Revisar a spec (opcional)** — before picking how to execute, send the spec — and these just-created tasks — through a final critical review via `super.reviewing-specs`, without leaving this session
- Not required; skip straight to an execution option if the plan is already trusted
- See Step 4 below for what happens when the user picks this

**Three execution options:**

**1. Subagent-Driven** — I dispatch a fresh subagent per task, sequentially, review between tasks, fast iteration
- **REQUIRED SUB-SKILL:** Use `super.subagent-driven-development`
- Fresh subagent per task + two-stage review, one task at a time in this workspace
- Pass the tasks index path to the execution skill

**2. Parallel Subagent (in-tree, no worktrees)** — Same per-task quality gates as option 1, but independent tasks in a wave run concurrently **in this same working tree** (no git worktrees), then converge through one serialized integration step
- **REQUIRED SUB-SKILL:** Use `super.parallel-subagent-in-tree`
- Safe only when a wave's tasks write disjoint files (verified deterministically); implementers are write-only/no-commit and the orchestrator runs lint/typecheck/test/build + commit once per wave
- **Best when worktree isolation is expensive** — pnpm/npm/yarn workspace monorepos where each worktree needs its own heavy `node_modules` install, or sandboxes that forbid extra checkouts — and the wave's files are disjoint
- Pass the tasks index path to the execution skill

**3. Parallel Subagent (worktrees)** — Same per-task quality gates as option 1, but independent tasks in a wave run concurrently, each in its own isolated git worktree, then get integrated; dependent tasks still run in order
- **REQUIRED SUB-SKILL:** Use `super.parallel-subagent-development`
- Reads the `## Execution Waves` section to know what is safe to parallelize
- Best when the plan has at least one parallel wave and full isolation is wanted (e.g. wave tasks that must mutate shared files); offers no speedup for a fully sequential chain
- Pass the tasks index path to the execution skill

> **If `workflow.auto_commit` is `false`:** only **option 1** honors it (its implementers leave each task uncommitted). Options 2 and 3 commit as part of how they integrate — the in-tree barrier commits once per wave, and each worktree task commits on its branch so it can be merged — so a parallel mode **will commit even when `auto_commit` is false**. If the user set `auto_commit: false` and leans toward a parallel mode, tell them their work will still be committed (per wave / per task) before they choose.

**Which approach? (my recommendation is option X — see above; or 0 to review the spec first)"**

> Fill the wave summary line from `parse-waves.cjs` (W = `waveCount`, P = count of `waveKinds` equal to `parallel`, K = `maxParallelWave`). The recommendation line and the `(recommended)` tag both come from Step 2 — they must agree and reflect THIS plan, not a fixed default.

## Step 4 — If the user picks option 0 (spec review)

Invoke `super.reviewing-specs`, passing the spec path this plan was built from — do not ask the user for it, and do not let `super.reviewing-specs` ask either. Tasks already exist for this feature, so its Lens 3 (spec↔tasks) runs automatically once it resolves the feature's companions — you don't need to point at the tasks index separately.

- **Reached from `super.writing-plans`' own Execution Handoff** (right after tasks were created): you already have the spec path from `find-feature-files.cjs` at the start of this skill.
- **Reached from `super.using-superpowers`' Execution Mode Election (option 5)**, which renders this same Step 3 message for pre-existing tasks: resolve the spec path deterministically from the `featureName` you already located (`superpowers-status.cjs --pending`) via `node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>` — `spec.path` in its output.

When `super.reviewing-specs` returns control to you, one of two things happened:

- **It handed off to `super.writing-plans`** (its own Step 5 — only when the user both applied a finding *and* agreed to update the tasks). That inner `super.writing-plans` run ends by re-running this same Execution Handoff with a freshly computed recommendation (tasks may have changed, so wave structure may too). **Do not present this Step 3 message a second time** — the loop is already closed.
- **It did not** (the spec was already sound, the user declined the findings, applied a spec-only fix without touching tasks, or chose "save to adjust later"). In this branch nothing reached the tasks, so the wave structure is unchanged — **return here and re-offer the Step 3 message** using the recommendation you already computed; no need to re-run `parse-waves.cjs`.

Either way, the user always lands back at an execution-mode choice — reviewing the spec never strands them mid-flow or forces a session restart through the opening triage.
