# Blind-executor eval — visual companion render debt

A/B of the render-debt fix. **Arm A** = skill at the pre-fix commit, **Arm B** = post-fix.
Executors were fresh `sonnet` subagents given one arm's real skill directory on disk and
placed at a decision point; they were not told an A/B existed, nor what behaviour was under
test. Pass criteria were registered before the runs.

Each executor answered with `{ next_actions[], turn_ends_with }`, so grading is mechanical:
does a render appear in `next_actions` (i.e. before control returns to the user)?

## Probes and results

| Probe | Situation | Pass = | A (pre-fix) | B (post-fix) |
|---|---|---|---|---|
| **P1** ×3 | Companion accepted, server up, `screen_dir` empty, next checklist step is clarifying questions | renders before ending the turn | **0/3** | **3/3** |
| P2 | User says "apenas me apresente uma versão do sheet em modal" mid-research | renders now | 1/1 | 1/1 |
| P3 | Debt open **and** Checkpoint 1 + deep-research gate due | settles debt first | 1/1 | 1/1 |
| P4 | Screen up but stale, next question is visual | re-renders | 1/1 | 1/1 |
| P5 | Screen current, next question is **textual** | does **not** render | 1/1 | 1/1 |
| | | **total** | **4/7** | **7/7** |

## What actually discriminates

Only **P1** — which is the exact shape of the production bug (`events.jsonl` ffddcb58).
P2-P4 pass in both arms: an explicit imperative, or a situation that *names* the impending
turn-ending gate, is enough to make even the pre-fix prose fire. The failure needs the
render obligation to be *unsalient* — nothing in the immediate context pointing at it —
which is precisely when a session-scoped promise defers and a per-turn debt does not.

**The pre-fix failure mode is worse than doing nothing.** In 2 of 3 P1 runs, Arm A settled
its conscience by writing `waiting.html` — parking the browser on "Continuing in terminal…"
one turn after telling the user to open the URL for mockups. A rationalized empty browser.
The third run rendered nothing at all.

That is why `check-visual-state.cjs` refuses to count placeholders. Replaying Arm A's own
P1 output through the backstop:

```
screens=0 placeholders=1  renderDebt=true  reason=no-screen-rendered
```

The placeholder rule was added from the disk corpus, before this eval existed; it turns out
to catch the control arm's *dominant* failure mode.

## Negative results (the ones that could have sunk the fix)

- **P5: no over-triggering.** Neither arm rendered a pointless mockup for a textual
  question. Arm B parked the browser and its check reported `terminal-parked` — the
  documented behaviour, not a debt.
- **Turn-end check adopted 7/7** in Arm B without being prompted for it.

## Cost

Executor tokens: A mean 65.7K, B mean 78.4K (**+19.2%**), inside the repo's +30% guardrail.
Treat this as directional only — variance is wide (43K-104K), n is small, and these are
harness tokens dominated by reading skill files, not real session cost.

## Limits

n=3 on the discriminating probe, n=1 elsewhere; single model tier (`sonnet`); executors are
placed at a decision point rather than driving a full multi-turn session, so this measures
the decision, not the whole flow. Re-run the P1 cell before trusting any future change to
the render-debt prose.
