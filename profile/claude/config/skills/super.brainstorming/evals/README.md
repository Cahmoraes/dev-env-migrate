# super.brainstorming — eval harness

Diagnoses whether the brainstorming **interview** closes hard decisions or leaks them "outside the spec template", and A/B-tests the *research-grounded specialist persona* (the "Interviewing as a research-grounded specialist" section of `references/decision-tree-interviewing.md`) against the as-is skill.

Run with the `skill-creator` eval loop (`Running and evaluating test cases`). This directory only holds the eval definitions and the ground-truth briefs; the executor/grader/comparator/analyzer agents live in `skill-creator`.

## Why this harness is non-standard: the interactive-skill problem

brainstorming is **interactive** — it asks the user one question at a time and waits. The skill-creator executor runs a prompt **autonomously, with no human in the loop**. An interview skill produces nothing if no one answers. So each eval supplies a **simulated user**: a persona plus a *ground-truth answer key* the interviewer must extract.

### Simulated-user protocol (per eval)

Each eval's `prompt` instructs the executor to run a brainstorming session where the user is simulated from a **brief** (`files/brief-<scenario>.md`). The brief separates two layers:

1. **Surface intent** — what the persona says unprompted (the initial request + shallow answers). Deliberately underspecified, the way a real stakeholder frames a request.
2. **Ground-truth decisions** — the hard forks a senior architect should extract. Each carries a **reveal trigger**: the persona discloses its preferred answer *only when the interviewer's question actually probes toward that fork*. The persona never volunteers a ground-truth decision the interviewer didn't reach.

This makes the discriminating signal **whether the interviewer asks the right questions** — exactly what the specialist persona is meant to change.

**Self-play caveat.** The executor plays both interviewer and simulated user, so it can see the answer key. To keep it honest: the prompt forbids the simulated-user half from volunteering un-probed decisions, and the comparison is **relative** (as-is vs +persona use the identical protocol), so any residual self-play inflation is constant across both arms and cancels in the delta. If self-play proves leaky in practice, escalate to a separate user-simulator subagent (heavier; only if the diagnosis warrants it).

## What we measure

| Signal | Definition | Source |
|---|---|---|
| **Ground-truth closure (primary)** | Fraction of the brief's ground-truth decisions the spec resolves — *structural* with a trade-off, *reversible leaf* with a safe default plus a revisit trigger, or *external blocker* as a risk naming the unblocking task. The spec closes every end; left vague or silently dropped = not closed. | grader assertions vs brief |
| **Hidden-fork surfacing (secondary)** | Count of ground-truth forks flagged `hidden: true` (absent from surface intent) that the interview surfaced. The specialist's value; weighted heaviest on the `armadilha` scenario. | grader assertions |
| **Cost guardrail** | Token/time delta. Ship bar: **≤ +30% tokens** vs as-is (revised from +25% after the real-harness measured +25.9%). | benchmark |

Judges: **grader** (per-config assertions + benchmark number and reason) + **blind comparator** (as-is vs +persona, blind) + **analyzer** (why the winner won, non-discriminating assertions, variance).

## Scenarios (calibrated to the complexity table)

Only branchy topics discriminate — a trivial tweak scores the same either way. The four span `decision-tree-interviewing.md`'s complexity gate:

| id | scenario | shape | brief |
|---|---|---|---|
| 1 | rate limiting on an existing NestJS API | feature-in-existing (light) | `files/brief-feature-existente.md` |
| 2 | URL shortener from zero | greenfield (full) | `files/brief-greenfield.md` |
| 3 | legacy React class → hooks + Module Federation | migration (full) | `files/brief-migracao.md` |
| 4 | "just add a CSV export button" | armadilha (deceptively simple) | `files/brief-armadilha.md` |
| 5 | consolidate notification broadcast onto RabbitMQ | feature-in-existing (backend/infra) — **named-but-dropped fork** | `files/brief-broker-fanout.md` |

Scenario 5 specifically probes the **named-but-dropped** failure (the "A hard property you name is a fork you now owe closure on" section of `decision-tree-interviewing.md`): a hard technical property (at-least-once → duplicates; best-effort → dead-lettering) that the interviewer must surface *from the domain itself* and **close — including by explicit rule-out — without over-building**. It scores both failure directions: silence (leak) and a bolted-on DLQ/dedup store (YAGNI over-close).

## Running the A/B

1. **Two configs:** `as-is` = current `super.brainstorming`; `+persona` = with the specialist-persona section active. (The section already ships in `decision-tree-interviewing.md`; the as-is arm runs the skill with that section removed/ignored — see skill-creator's config-swap.)
2. **3 trials per config per scenario** (variance protection; `aggregate_benchmark` gives mean ± stddev).
3. Grade each run against its brief; aggregate; run the blind comparator; do the analyst pass; launch the eval-viewer.
4. **Ship `+persona` iff:** mean ground-truth-closure ≥ as-is on **every** scenario **AND** it wins/ties the blind comparison on the majority **AND** token cost ≤ +30%. Human confirms in the viewer.

## Grading integrity — grade the raw file, not a compressed Read

A grader subagent reads the produced spec through its `Read` tool, and **that tool-result can be compressed inside the grader's own context**. A grader looking at a compressed/truncated view can mis-report an intact artifact as "materially corrupted / truncated / garbled" — and, because closure assertions are phrase-keyed, still pass it. A subagent's self-reported corruption is therefore **not trustworthy**. So decide "is the artifact intact" **mechanically, over the raw bytes**, before grading:

```bash
node evals/check-spec-integrity.cjs --spec <run>/outputs/spec.md \
  --require "Decisões Arquiteturais" --require "Riscos"
```

It checks (deterministically): min size, balanced code fences, no `U+FFFD` mojibake, a minimum number of `##` sections, every `--require` heading present, and warns on a mid-sentence last line. A FAIL here means **re-run the executor, not the grader**. (Observed in iteration-1: a grader called `enriched/run-2` "corrupted" from a compressed read; the file on disk was intact — `intact=true`, 7 sections, balanced fences, 0 mojibake. The gate would have settled it without an eyeball.) When grading closure, prefer a deterministic `grep` for the closure phrase in the spec **body** (under Decisões/Riscos) over an eyeballed Read — phrase-keyed assertions that match anywhere (headers, transcript) pass over an incomplete body.

## Self-play ceiling — measured, and the blind-interviewer escalation

**Iteration-1 A/B result (baseline = `decision-tree-interviewing.md` pre-`named-but-dropped` reinforcement; enriched = with it):**

| scenario | baseline mean | enriched mean | Δ |
|---|---|---|---|
| 5 broker-fanout (3 runs each) | 1.00 (8/8) | 1.00 (8/8) | **0** |
| 4 armadilha (1 run each, regression) | 1.00 (7/7) | 1.00 (7/7) | **0** |

The reinforcement is **safe** (no regression; the enriched armadilha run was leaner and explicitly ruled out a DLQ — the YAGNI guard held), but its marginal lift is **not measurable here**: both arms sit at the ceiling. Both graders independently diagnosed the cause as a **self-play answer-key leak** — one executor authors both the interviewer's questions and the persona's answers, and the brief telegraphs the exact closure ("tolerate", "no dedup store", "no DLQ", "Last-Event-ID catch-up"), so the interviewer largely relays what the persona hands over. Only expectation #7 (*hidden forks surfaced BY the interviewer, not volunteered*) actually discriminates under self-play.

To get a discriminating lift number, **escalate to a blind two-agent harness** (the README's original self-play caveat, now warranted):

1. **User-simulator subagent** holds the brief (answer key), answers the interviewer's questions per the reveal triggers, and **never volunteers** an un-probed decision. Does not write the spec.
2. **Interviewer subagent** runs the skill (the config under test) but has **only the Surface intent** — never the ground-truth table or the closure phrases. It must *derive* the closure (this is where the `named-but-dropped` reinforcement bites). It writes the spec at the end.
3. The main thread relays questions/answers between them (bounded rounds). Grade the interviewer's spec.

The brief is being restructured toward this: the ground-truth table reveals the **facts the persona knows** (client dedupes by event ID; reconnect catches up via `Last-Event-ID`), while the **closure decision** the spec must derive (tolerate → no dedup store; best-effort → no DLQ) is the grader rubric, not something the persona says.

## Files

- `evals.json` — the eval definitions (skill-creator schema), ids 1–5.
- `files/brief-*.md` — one ground-truth brief per scenario.
- `check-spec-integrity.cjs` (+ `__tests__/`) — deterministic artifact-integrity gate; run before grading.
