# Blind-executor eval — what a returning research report puts on screen

A/B of the returning-report turn. **Arm A** = skill at the pre-fix commit, **Arm B** = post-fix.
Executors were fresh `sonnet` runs (`claude -p`, read-only toolset) handed one arm's real skill
directory on disk and placed at a decision point; they were not told an A/B existed, nor what
behaviour was under test. Pass criteria were registered before the runs.

Each executor answered with `{ message_to_user, tool_calls[], rationale }`, so grading is
mechanical: the graded object is the literal text the turn would send.

## The failure this fixes

Real session: the fan-out went out at 23:52:20-23:52:30 and the opening question rode the same
turn, as designed. The three subagents then returned asynchronously — 23:52:45, 23:52:59,
23:53:31 — while the user was still composing an answer. Each return re-invoked the controller.
The controller had a rule for that turn, and the rule was **"Say nothing while you wait."**

It tried exactly that. The harness answered:

> `[Your previous response had no visible output. Please continue and produce a user-visible response.]`

So the turn had to carry text, the procedure had named none, and what got improvised was the
pending question, restated once per returning subagent:

1. *"Ainda aguardando sua resposta à pergunta anterior sobre o objetivo do serviço de meteorologia — pode responder quando quiser."*
2. *"Ainda com a pergunta em aberto — fico no aguardo da sua resposta."*
3. *"Ainda aguardando sua resposta sobre o objetivo do serviço de meteorologia dentro do projeto."*

The user's verdict: *"esse feedback textual do agente ficou repetitivo a partir da segunda vez"*.

This is the second half of a defect whose first half was already fixed. The guard in
`opening-phase-dispatch-turn.test.cjs` was written after a run that produced **two agent-listing
calls and three "still waiting" messages**. "Say nothing while you wait" killed the polling and
left the messaging, because silence is not a turn this harness accepts — a rule that cannot be
executed is a rule that gets replaced by improvisation.

## Probes and results

Two context conditions, because the rule's home was in question:

- **warm** — the executor is directed to `SKILL.md` *and* `references/research-fan-out.md`, which
  is production: the reference is read at the top of the phase, ~1 minute and ~6 tool calls
  before the first notification lands.
- **cold** — only `SKILL.md` is in the window; the reference is reopenable but not open. This is
  the post-compaction state, and it is what decides whether a reference-only rule is enough.

| Probe | Situation | Pass = | A | B |
|---|---|---|---|---|
| **P1** ×3 | First report returns, opening question unanswered, harness rejected the empty turn | one line naming the finished track, nothing about what is pending | **0/3** | **3/3** |
| **P2** ×3 | Third report returns, two acknowledgments already sent, question still unanswered | same | **0/3** | **3/3** |
| P3 ×4 | Last report returns, user **has** answered | turn advances the interview (next question or tool calls), not a bare track notice | 4/4 | 4/4 |
| | | **total (warm)** | **4/10** | **10/10** |
| **P1** ×3-4 | Same as P1, **cold** | same as P1 | **0/3** | **3/4** |

## What actually discriminates

**P1 and P2.** Arm A splits two ways, both failing, and both are the production bug:

- *empty* — three of six A runs returned `message_to_user: ""`, faithfully executing "say
  nothing" **even though the probe carried the harness's rejection of the silent turn**. The
  prose beat the harness telling it the opposite, which is why the defect survives in production.
- *the filler* — the rest restated the question. One arm-A run produced *"Ainda estou aguardando
  sua resposta sobre o objetivo do serviço de meteorologia"*, near-verbatim the real session.

Arm B converged on the intended turn without being shown it: *"Histórico de features
concluída."*, *"Exploração do codebase concluída."* — 32-33 characters, in the session's
language, no mention of the question.

## Why the rule is in SKILL.md and not only in the reference

The first cold pass measured **B at 1/8** — indistinguishable from A. The executors never
reopened `research-fan-out.md`, so the fixed prose was never read. That is the same distance the
earlier fix already lost to (`SKILL.md carries the shape of the opening phase, not just its
steps`): the reference is read at the top of the phase, the reports land several tool calls
later. Carrying one sentence in `SKILL.md` moved cold from 1/8 to 3/4.

`SKILL.md` had 12 characters of headroom under the 20.000-char compaction cap, so the sentence
was paid for by compressing three unlocked spans (the `task`-only restatement, a duplicated
`complex-path.md` pointer two lines below its twin, and the anti-poll clause). Net **+7
characters**; the anti-poll strings the cross-skill sweep locks (`schedule a wakeup/timer`,
`busy-polling harness-tracked`) are intact.

## Negative results (the ones that could have sunk the fix)

- **No over-correction.** P3 is 4/4 in both arms. Once the user has answered, arm B does not
  degrade the turn into a track notice: it names the finished tracks in a clause and moves to
  the next question or to reading the reports. The rule is scoped to *"your question is still
  open"* and that scope holds.
- **The exclusion had to be widened once.** The first `SKILL.md` wording said *"never a
  restatement of the pending question"*. Cold B then produced *"A track de histórico de features
  terminou. Ainda aguardando as outras duas tracks e sua resposta anterior."* — which restates
  nothing and is the same noise. *"never a word about what is still pending"* covers both and is
  3 characters shorter.
- **Cheaper, not just quieter.** Warm cost was $2.76 (B) against $2.60 (A) over 10 runs each —
  flat. The one-line turn is not buying quiet with tokens.

## Limits

n=3-4 per cell; single model tier (`sonnet`); executors are placed at a decision point rather
than driving a full multi-turn session. One cold B run still produced the verbose version — the
`SKILL.md` sentence is a backstop for the compacted case, not a replacement for the reference.
Re-run P1 and P2 in **both** conditions before trusting any future change to this prose.

### Harness note

The first pass of this eval scored B at 1/8 and was **discarded, not reported**: the prompt said
*"consider that you have already read `SKILL.md` and `research-fan-out.md`"*, and the executors
took that as permission not to. A probe that lets the arm's own prose go unread measures nothing
about the prose. Direct the read explicitly, identically in both arms, and vary it deliberately
when the *location* of a rule is the question.
