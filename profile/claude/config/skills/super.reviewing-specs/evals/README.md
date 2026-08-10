# super.reviewing-specs — eval harness

Diagnoses whether the spec review **finds the real defects without inventing any** — the two symmetric failures the skill exists to avoid (see `../references/honest-reporting.md`):

- **Silence (false negative):** a real open fork, contradiction, or spec↔task break left unmentioned.
- **Manufacturing (false positive):** a fabricated finding on a spec that is actually sound, or an over-built "fix" (a DLQ / dedup store the design does not need).

Run with the `skill-creator` eval loop (`Running and evaluating test cases`). This directory holds the eval definitions, the ground-truth spec fixtures, and the deterministic integrity gate; the executor/grader agents live in `skill-creator`.

## Why this harness is more tractable than the brainstorming one

Unlike `super.brainstorming` (interactive — needs a simulated user), `super.reviewing-specs` is **autonomous**: it takes a spec path and produces a review report with no human in the loop. So the executor can run each eval directly, and the discriminating signal is objective — *did the report surface defect X at severity Y, and did it stay silent where the spec is sound?* No simulated-user protocol, no self-play answer-key leak.

## What we measure

| Signal | Definition | Source |
|---|---|---|
| **Detection (eval 1)** | Fraction of the planted defects the report surfaces at roughly correct severity — the durable task↔task contradiction (Critical), the `dispatch()` internal contradiction, the named-but-dropped duplicate fork, the phantom-mitigation, the QoS scope gap. | grader vs expectations |
| **No over-build (eval 1)** | The open forks are closed by rule-out/toleration, never by bolting on machinery the design already makes unnecessary. | grader expectation #4 |
| **Honesty (eval 2)** | On a sound spec, the verdict is "no changes needed" (or ≤1 genuine Minor); no Critical/Important is manufactured, no fork from an unrelated domain is hallucinated. | grader vs expectations |

## Scenarios

| id | fixture | shape | what it probes |
|---|---|---|---|
| 1 | `files/webhook-outbound-delivery/` (spec + index + task-01/02) | feature-with-tasks, 5 planted defects + 1 well-closed axis | **detection + no-over-build**, incl. the task↔task `durable` contradiction that only surfaces reading tasks against each other (Lens 3) |
| 2 | `files/api-rate-limiting/` (spec only) | pure spec review, genuinely sound | **honesty** — the report must come back clean, not fabricate |

The planted defects in scenario 1 mirror the real defect classes observed in the field (the message-fanout review that inspired them): a ghost method (here reframed as an internal 2.1↔2.2 contradiction so the fixture is self-contained, no external codebase needed), a durable-arg divergence across two tasks, a named-but-dropped messaging fork, a mitigation citing a mechanism that exists nowhere, and a plan that quietly decided QoS the spec is silent on.

### The real-spec simulation (not a committed eval)

A third, higher-fidelity scenario — reviewing a **live** spec in a real consuming repo — is run as the skill's end-to-end **simulation**, not a committed fixture, because it points at an absolute path outside this repo. Pick a spec that has already been corrected, so its ground truth is known: the review must stay honest about the forks that spec closed well (naming them back as closed, not manufacturing findings) while still surfacing the ones it genuinely left open, and treating deliberate silence as acceptable. Same honesty bar as evals 1+2, at full fidelity.

## Grading integrity — grade the raw report, not a compressed Read

A grader subagent reads the produced report through its `Read` tool, and **that tool-result can be compressed inside the grader's own context** (the same lesson as `super.brainstorming/evals/check-spec-integrity.cjs`). A grader looking at a compressed view can mis-judge an intact report as truncated, or — worse for this skill — mis-count findings. So decide "is this a well-formed review report" **mechanically, over the raw bytes**, before grading its content:

```bash
node evals/check-review-integrity.cjs --report <run>/outputs/review-report.md --expect changes   # eval 1
node evals/check-review-integrity.cjs --report <run>/outputs/review-report.md --expect clean     # eval 2
```

It checks (deterministically): min size, balanced code fences, no `U+FFFD` mojibake, and that the report is classifiable as exactly one shape — a needs-changes report with ≥1 severity-tagged finding, **or** an honest clean verdict (which is a valid, non-failing output). A FAIL here means re-run the executor, not the grader. When grading closure/detection, prefer a deterministic `grep` for the defect's marker in the report body over an eyeballed Read.

## Files

- `evals.json` — the eval definitions (skill-creator schema), ids 1–2.
- `files/webhook-outbound-delivery/` — the planted-defect spec + companion tasks (scenario 1).
- `files/api-rate-limiting/` — the sound spec (scenario 2).
- `check-review-integrity.cjs` (+ `__tests__/`) — deterministic report-integrity gate; run before grading.
