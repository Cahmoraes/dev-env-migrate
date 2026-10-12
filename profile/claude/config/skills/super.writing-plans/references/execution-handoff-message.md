# Execution Handoff Message

**Who reaches this gate: every plan `super.writing-plans` writes, whatever its size.** A plan on disk is executed by dispatch (`super.subagent-driven-development`), never by the controller writing code in the main thread; the inline path (`super.using-superpowers/references/bounded-path.md`) is for a bounded change, which never plans. The plan's size changed how it was *written* (at most four tasks: the controller wrote them itself); it does not change what happens now.

After saving the index and task files, the plan is done and the session pauses **once**: the user reads the plan and decides what runs next. This is the one gate between planning and the end of the feature — execution is the stage that spends the most credits, and every gate after it (branch guard exceptions, `qa_gate: ask`, the finish menu) is already defined by its own skill. In the message, fill in feature name, task count and the elected option's skill name — like any other `<placeholder>` in this template, replace it with the real value, never leave the bracketed token in your output.

## Step 1 — Read the parser

`parse-plan.cjs` (already run in self-review) emits, besides the per-task tiers, whether option 3 may be offered:

```jsonc
{
  "singleImplementer": {
    "eligible": true|false,   // ≤ 6 tasks, no capable-tier task
    "reasons": [ "..." ]      // why not, when false
  }
}
```

## Step 2 — The recommendation

Option 1 is always the one tagged `(recommended)`: one subagent execution mode, one recommendation. **Option 3 is never tagged.** `singleImplementer.eligible: true` only adds it to the list below; the user opts into it knowing there is no reviewer between tasks.

When `validate-tasks.cjs` reported `specTrace.unverified`, add one line listing them (`INV-02 — <reason> — conferência: <query>`): what no test will prove, said before the user pays for execution.

Write one short paragraph on what the plan asks of the executor (task count, the tasks that need the `capable` tier, an environment chokepoint such as a database that must be up or a `generate:types` step) — it is the reasoning the user reads before paying for execution.

## Step 3 — Open the gate (always)

Always — for every plan, whatever its task count, including a two-task chain whose answer is obvious: the user reads the plan before it is executed, and the recommendation is the answer we propose, not the answer we take. Render this in the session language, then ask through the platform's structured-question tool (`AskUserQuestion` / `ask_user` / `question`; options 0/1, plus 3 when offered, fit its cap) as the **last call of the turn** — the answer arrives in the next turn, and nothing of the execution runs in the turn that asked. The message is the plan's summary, the recommendation and the options; the tool call is the question. Do not invoke an execution skill before the answer arrives.

---

**"Tasks created and saved to `docs/superpowers/<feature-name>/plans/`.**
**Task index: `tasks-<feature-name>.md` with N tasks.**

**Recommended for this plan: option X** — <one short paragraph of reasoning from Step 2>

**0. Deep review by a subagent first** — `super.reviewing-specs` reads the spec and these tasks against the real code (open forks, contradictions between tasks, FR coverage). It costs credits and takes minutes; pick it when the plan is not yet trusted. You come back to this question afterwards.

**1. Subagent-Driven** — `super.subagent-driven-development`: a fresh subagent per task, one task at a time in this workspace, one task review (spec + quality) between tasks; small same-shape tasks may share one dispatch.

**3. Single implementer** — *render this line only when `singleImplementer.eligible` is `true`; otherwise omit it entirely.* `super.subagent-driven-development --single`: one implementer subagent runs every task in order in this workspace, with **no reviewer between tasks**; the whole-branch final review and QA run unchanged afterwards. Cheapest (1 implementer, 0 per-task reviewers); a task-level mistake is caught only at the end. Never recommended by default — pick it to spend less on a small, low-risk chain.

**To resume in a later session** — the plan is on disk; invoke the elected option's skill with the tasks index, prefixed with `/`. `<elected-skill>` below is a placeholder like `<feature-name>` — copy the skill name you tagged `(recommended)` above into its place; the fence you render must contain a real skill name (`super.subagent-driven-development`), never the literal characters `<elected-skill>`:
```
/<elected-skill> docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
```

**Which option? (my recommendation is option X — see above)"**

---

> The resume block is information, not another option: render it with the real path and still close with the question. When option 3 was chosen, the resume line is `super.subagent-driven-development` with ` --single` appended after the index path. The `(recommended)` tag and the fence must name the same skill.

**Once answered, the feature runs to its end.** Option 1 → invoke the skill with the tasks index path in the next turn; option 3 → invoke `super.subagent-driven-development` with the index path and `--single`; it never re-raises this election, and the pipeline continues through verification, QA and finishing without a "continue?" (their own gates are the only pauses left). The user naming an execution skill directly (`/super.subagent-driven-development <index>`) is the same answer given upfront — no message here.

**The answer cannot arrive only when that tool is absent from the toolset** (`codex exec`, `opencode run`, a headless run): then take option 1 and proceed. A user who said "retomar", "continue" or "faça" named no mode and did not answer this question — that plan is still owed the gate.

## Step 4 — Option 0 (deep review)

Invoke `super.reviewing-specs`, passing the spec path this plan was built from — do not ask the user for it, and do not let `super.reviewing-specs` ask either. Tasks exist for this feature, so its Lens 3 (spec↔tasks) runs automatically once it resolves the feature's companions.

- **Reached from `super.writing-plans`' own Execution Handoff** (right after tasks were created): you already have the spec path from `find-feature-files.cjs` at the start of this skill.
- **Reached from `super.using-superpowers`' Execution Mode Election (option 5)**, which renders this same Step 3 message for pre-existing tasks: resolve the spec path from the `featureName` you already located (`node <super.using-superpowers-base-dir>/scripts/superpowers-status.cjs --pending`) via `node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>` — `spec.path` in its output.

When `super.reviewing-specs` returns control, one of two things happened:

- **It handed off to `super.writing-plans`** (its own Step 5 — only when the user both applied a finding *and* agreed to update the tasks). That inner run ends by re-running this same Execution Handoff with a freshly computed recommendation. **Do not present the Step 3 message a second time** — the loop is already closed.
- **It did not** (the spec was sound, the user declined the findings, applied a spec-only fix, or chose "save to adjust later"). Nothing reached the tasks — **re-open Step 3** with the recommendation you already computed; no need to re-run `parse-plan.cjs`.

Either way the user lands back at this gate — reviewing never strands them mid-flow or forces a restart through the opening triage.
