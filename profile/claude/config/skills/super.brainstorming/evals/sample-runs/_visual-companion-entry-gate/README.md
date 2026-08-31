# Blind-executor eval — visual companion entry gate

A/B of the entry-gate fix. **Arm A** = skill at the pre-fix commit, **Arm B** = post-fix.
Executors were fresh `sonnet` runs (`claude -p`, read-only toolset) handed one arm's real
skill directory on disk and placed at a decision point; they were not told an A/B existed,
nor what behaviour was under test. Pass criteria were registered before the runs.

Each executor answered with `{ next_actions[], offers_visual_companion, renders_screen,
turn_ends_with }`, so grading is mechanical: did the offer go out this turn, and what kind
of screen (if any) went up.

## The failure this fixes

Real session, 2026-08-11: the request was *"vamos refatorar o módulo de analytics do admin
com novas informações"*. 52 seconds later — before a single clarifying question — the
companion offer went out, because "analytics" matched the **user-facing UI** signal on
vocabulary alone. Nobody yet knew whether "novas informações" meant new backend metrics,
new charts, or both. The user accepted. The only thing owed to them at that moment was a
**scope** question, and an open render debt pre-empts turn-ending steps — so the scope
question is what went on screen, as five `render-screen.cjs` text cards. Every rule in the
skill was satisfied. `check-visual-state.cjs` reported `renderDebt:false, reason:current`.

The user's verdict: *"essas perguntas conceituais poderiam ser respondidas no terminal sem
abrir o servidor"*.

Two independent defects, one visible symptom:

1. **The signal fired on the topic's vocabulary**, not on what the conversation had
   established. A feature noun says nothing about surface.
2. **Text cards settled the debt.** The Layout gate forbids `generated` screens for
   *layout* questions; nothing forbade migrating a *conceptual* question into the browser,
   which is the cheapest way to put something — anything — on screen.

## Probes and results

| Probe | Situation | Pass = | A (pre-fix) | B (post-fix) |
|---|---|---|---|---|
| **P1** ×3 | Opening turn, `"refatorar o módulo de analytics do admin com novas informações"`, surface unknown | does **not** offer this turn | **0/3** | **3/3** |
| P2 | Opening turn, `"redesenhar a tela de checkout, tenho um Figma"` | offers | 1/1 | 1/1 |
| P3 ×3 | Opening turn, backend weather module consuming an external API | does **not** offer | 3/3 | 3/3 |
| P4 | Backend interview underway, user turns to `"onde ficam os cards no dashboard"` | offers | 1/1 | 1/1 |
| P5 | Companion accepted **naming** a layout side-by-side, screen dir empty, conceptual question due | renders bespoke | 1/1 | 1/1 |
| **P6** ×3 | Companion accepted **without** naming an artifact, screen dir empty, conceptual scope question due | does **not** answer with text cards | **0/3** | **3/3** |
| | | **total** | **6/12** | **12/12** |

## What actually discriminates

**P1 and P6** — the two halves of the production bug. Both are 0/3 → 3/3.

In P1, all three Arm A runs named the same reasoning: *"o sinal 'user-facing UI —
dashboards' bate, já que analytics do admin é tipicamente uma tela"*. The signal is
inferred from the noun. All three Arm B runs instead asked the surface question, with
options: *"esse refactor vai tocar o frontend admin (dashboards/telas), o backend (NestJS,
APIs e dados) ou os dois?"*

In P6, all three Arm A runs rendered the scope question with `render-screen.cjs` and one
of them explicitly planned to *"rodar check-visual-state.cjs para confirmar `reason:
current` antes de encerrar o turno"* — the backstop confirming a debt that was never paid.
All three Arm B runs wrote a bespoke mockup of the current analytics screen as the
artifact, then asked the scope question **in the terminal**.

P2-P5 pass in both arms: an unambiguous visual request, an unambiguous backend one, and a
situation that already *names* the artifact are all salient enough for the pre-fix prose.
The failure needs the surface to be **ambiguous** and the artifact **unnamed** — exactly
the state a real opening turn is in.

## Negative results (the ones that could have sunk the fix)

- **No over-correction.** P2 and P4 still offer, 1/1 in both arms: gating the checklist on
  an established surface does not suppress the offer when the request states the surface
  itself, nor when a backend conversation later reaches a screen.
- **The offer got more concrete, not just rarer.** Arm A's P4 offer is the generic
  boilerplate; Arm B's names what it would draw: *"posso te mostrar as duas opções de
  layout do dashboard — cards de previsão acima do gráfico vs. abaixo — em um preview
  local"*. That is the readiness test doing visible work.
- **The backstop is not the fix, and was not needed to pass.** No Arm B run cited
  `generated-only`; they were routed by the prose. The reason code exists for the runs that
  drift anyway.

## Cost

Harness tokens per probe turn: A mean 170K, B mean 229K (**+34.7%**), variance wide
(B range 76K-463K, A range 75K-343K). Directional only, and not prose weight: `SKILL.md`
grew by **16 characters** net, and the acceptance-tier files are read only after consent.
The delta is Arm B doing the work the probe tests for — formulating a real scope question
instead of a boilerplate offer (P1, +1 turn), dispatching design-token discovery and
rendering a mockup instead of emitting text cards (P6). Arm A's cheaper turn is deferred
cost, not saved cost: the session it produces is the one where the user types "me mostre"
and "atualize o mockup" to get what the offer promised.

## Limits

n=3 on the two discriminating probes, n=1 on P2/P4/P5; single model tier (`sonnet`);
executors are placed at a decision point rather than driving a full multi-turn session, so
this measures the decision, not the whole flow. Re-run the P1 and P6 cells before trusting
any future change to the entry-gate or settlement prose.
