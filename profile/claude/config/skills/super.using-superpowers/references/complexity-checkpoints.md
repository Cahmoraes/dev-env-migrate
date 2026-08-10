# Complexity Checkpoints — checkpoint-based tier assessment (replaces single-shot triage)

Before this mechanism, the tier (Micro/Small/Medium/Large/Complex) was judged **once**, in prose, from whatever the user's first message contained — before `super.brainstorming` ever ran. Two failure modes fell out of that:

- A vague first message could lock in the wrong tier (and the wrong ceremony) for the rest of the session, with no formal re-check until the atomic-step-count tripwire in `references/medium-inline-path.md` — which only fires late, after planning, and only catches *under*-classification.
- A request that skips the numbered Opening Triage and enters directly at "opção 2" (`super.brainstorming` invoked immediately, per the Option table in `session-start.md`) never ran the tier check at all — `super.brainstorming` had no tier-assessment responsibility of its own.

This reference formalizes a **checkpoint-based** assessment: the same deterministic function (`scripts/assess-complexity.cjs`), called at four fixed points regardless of entry path, each contributing real signal as it becomes available.

## The two-stage gate: semantic derivation → deterministic scoring

Assessment is two stages with a clean split of responsibility:

1. **Semantic derivation (LLM).** Turn the free-text request + interview into a structured `signals` object. This is a *judgment* about intent, not a keyword match — the same noun forks by intent, and the classic trap is **"API"**: *creating/exposing* one is a new component (`fileScope: new-component|multi-component`, `abstraction: yes`), while *consuming/integrating* an existing one is an integration (`fileScope: few-existing`, `abstraction: none|small`). At the **binding** checkpoints 1 and 2 this runs as the `agents/complexity-interpreter.md` subagent (`capable` tier); at advisory checkpoint 0 the controller derives inline (light, no subagent).
2. **Deterministic scoring (script).** `scripts/assess-complexity.cjs` takes the derived `signals` and computes the tier by `Math.max` over the dimensions, escalate-only via `--prior-tier` (with one controlled de-escalation exception, see below). It never reads free text itself for the scored dimensions — the critical-surface floor is the one exception, and even there the primary source is the interpreter's own semantic `criticalSurface` verdict: TRI-STATE, authoritative when present (`true` floors, `false` VETOES the backstop), with the `CRITICAL_SURFACE_KEYWORDS` regex only consulted as a subordinate backstop when the verdict is absent (only the optional `text` field is tested against the regex). The math is auditable and reproducible; the semantics are not baked into a fragile regex — that is now literally true for the critical-surface floor as well, not just the five scored dimensions.

**Why this split exists.** A prior run classified a greenfield job-queue subsystem as **Medium**: the controller hand-built the `--signals` JSON with the wrong keys (`files`, `new_abstractions`, `decisions`) and boolean values, so every canonical dimension read as absent → defaulted to Medium → `confidence: low`, which was ignored. Two fixes prevent a repeat: the semantic gate derives the signals deliberately (no eyeballing a table), and the script now **rejects** a mis-keyed/loose call loudly instead of silently defaulting (see "Input robustness" below).

### The revalidation loop

The derivation can be wrong or incomplete. After scoring:

- If the interpreter returned non-empty **`ambiguities`** (a fork it refused to guess) **or** the script returned **`requiresSignalCompletion: true`** (see the confidence gate below), the controller **asks the user the disambiguating question**, re-dispatches the interpreter with the answer, and re-scores.
- Bound the loop to ~2 rounds. If still ambiguous, take the heavier reading ("when in doubt, go heavier").
- The chain stays escalate-only: pass the prior checkpoint's tier as `--prior-tier` so a better-informed re-derivation can raise the tier, never lower it. ONE controlled exception: checkpoint 2 can de-escalate via `--allow-deescalation`, honored only with `confidence: high` and never below the critical-surface floor. This asymmetry (escalating is cheap, de-escalating requires proof) is what keeps it safe.

### Input robustness (the script as a safety net)

`normalizeSignals` in `assess-complexity.cjs` makes the old silent-Medium failure impossible even if a caller bypasses the interpreter and hand-builds signals:

- **Known key-typos are aliased:** `files`→`fileScope`, `decisions`→`decision`, `new_abstractions`→`abstraction`, `request`/`description`/`title`→`text`.
- **Booleans are coerced** on the three yes/no dimensions: `abstraction`/`prd`/`decision` `true`→`"yes"`/`"required"`/`"may-exist"`, `false`→`"none"`.
- **Anything still unrecognized throws** a self-documenting error (valid keys + enums + a "did you mean" suggestion) and exits 1 — never a silent Medium.
- **Invariant #1 preserved:** a genuinely ABSENT key still resolves to unknown → Medium. Only a key that is *present-but-wrong* is rejected.

### The confidence gate

`confidence` is `high` (0 unknown dimensions), `medium` (1), or `low` (2+). At a **binding** checkpoint (1/2/3), `confidence: "low"` now sets **`requiresSignalCompletion: true`** in the output — a low-confidence tier is a cautious default, not a real read, so the controller must gather more signal (re-run the semantic gate / ask a question) before committing it, instead of treating a low-confidence Medium as a genuine decision. At advisory checkpoint 0 it stays informational.

## The four checkpoints

| # | When | Who calls it | Binding? |
|---|---|---|---|
| **0** | Opening Triage, on the raw first message, before any question is asked | `super.using-superpowers` (Opening Triage) | **No — advisory only.** Decides how `super.brainstorming` *starts* (flat one-question pass vs full research fan-out). Its tier is never passed as `--prior-tier` to checkpoint 1. |
| **1** | Right after the first 1-2 clarifying answers in `super.brainstorming` — OR immediately, on the freeform request text, when the user entered directly via "opção 2" and skipped the numbered triage | `super.brainstorming` (Checklist step 3, before "Propose 2-3 approaches") — signals derived by the `complexity-interpreter` subagent (`capable`) | **Yes — first real commitment.** No `--prior-tier` (checkpoint 0 doesn't feed it). |
| **2** | After the design draft exists (enough of Checklist step 5 to know real file/abstraction/PRD/decision scope) | `super.brainstorming` (after presenting the design, before writing the spec doc) — signals re-derived by the `complexity-interpreter` subagent with the concrete design as context | **Yes.** `--prior-tier` = checkpoint 1's tier. Escalate-only. |
| **3** | The existing tripwire — atomic step list / tasks index, `references/medium-inline-path.md` | Controller, before writing any code | **Yes.** `--prior-tier` = checkpoint 2's tier. Escalate-only. |

Checkpoint 0 is deliberately **not** chained forward. It exists only to decide provisioning for the interview itself (do we run one question or a full fan-out) — treating its necessarily-uncertain read of an unclarified message as a hard floor for the rest of the session would defeat the entire point of asking questions. Checkpoints 1 through 3 are chained (`--prior-tier`) and are strictly escalate-only, mirroring the existing invariant in `references/large-known-domain-fast-path.md`: *"only ever escalate up to more rigor, never skip down to less."*

## Why this closes the direct-entry gap

Because checkpoint 1 lives inside `super.brainstorming` itself — not inside the Opening Triage — a request that enters via "opção 2" and never saw the numbered triage still gets a real, deterministic tier assessment on its first real signal. The mechanism no longer depends on the Opening Triage having run carefully; `super.brainstorming` carries its own checkpoint regardless of how it was invoked.

## Why Micro gets a confirming question and Small/Large fast-path already had one

`references/lightweight-path.md` (Small) and `references/large-known-domain-fast-path.md` (Large, known domain) both gate their lighter path behind an explicit yes/no question to the user. Micro had no equivalent gate — it skipped `super.brainstorming` and `super.writing-plans` outright on the triage's first read. `assess-complexity.cjs` closes this by setting `requiresConfirmation: true` whenever the computed tier is `micro` **and** the checkpoint is `0` — i.e., whenever the read came only from the raw, unclarified message. Present it the same way the other two paths already do:

> "Isso parece uma mudança trivial e reversível em 1 arquivo (checkpoint 0: `<signals>`). Posso seguir direto — sem brainstorming, sem plano — ou preferes confirmar o escopo antes? (seguir / confirmar)"

Once a tier of `micro` is reached at checkpoint 1 (i.e., confirmed by a real interview turn, not just the raw message), `requiresConfirmation` is `false` — no second gate.

## Why Complex proactively offers deep-research and reviewing-specs

The lighter fast paths (`references/lightweight-path.md`, `references/large-known-domain-fast-path.md`) gate *less* ceremony behind a yes/no. Complex is the mirror image: it gates *more* — two token-costly stages that fortify a novel/ambiguous design before the expensive fan-out builds on it. `assess-complexity.cjs` closes the "the controller might forget to offer them" gap the same way it did for Micro: whenever the tier is `complex`, it emits an advisory `consentGates` array naming the stage to offer at the current checkpoint — `["deep-research"]` at checkpoints 0/1 (a research gate before/at the start of brainstorming) and `["reviewing-specs"]` at checkpoint 2 (a spec-review gate once the design exists). Every other tier emits `[]`.

The polarity is inverted from the fast paths: because each stage *adds* token cost, the default without explicit consent is to **skip** it (the fast paths default to the heavier full pipeline when the lighter path is declined; Complex defaults to *not* running the extra stage). The array only names which offer to present; the user's yes/no is the real decision, and a declined stage is skipped silently. Execution and every quality gate stay identical to Large — the two stages are additive front-end fortification, never a substitute for any gate. Full pattern and both confirming questions: `references/complex-path.md`.

## Why unknown signals default to Medium, not Micro

Each of the five scored dimensions (`fileScope`, `abstraction`, `prd`, `decision`, `steps`) maps an unresolved ("unknown") value to Medium — never to Micro or Small. This mirrors the existing prose rule ("when in doubt, go heavier") but scopes it correctly: silence about a dimension is not evidence that dimension is trivial. `steps` is the sole exception — it legitimately has no opinion before a real step list exists (checkpoints 0-2), so it is excluded from the score entirely (not defaulted) until it is a real number.

## Why the critical-surface floor doesn't force Large

`assess-complexity.cjs` floors the critical-surface delivery tier TRI-STATE, interpreter-primary: the `complexity-interpreter` subagent's semantic `criticalSurface` verdict (primary, context-aware — distinguishes *consuming* from *building* a critical surface, and now covers high-consequence-of-failure domains — financial, vital/medical, irreversible/destructive, legal/compliance — not just security) is AUTHORITATIVE when present — `true` floors the tier, `false` VETOES the keyword backstop below it. Only when the verdict is absent does the same `CRITICAL_SURFACE_KEYWORDS` regex `super.parallel-subagent-development/scripts/parse-waves.cjs` already uses to force `two-stage` review regardless of tier get consulted, as a subordinate deterministic backstop for the paths that run without the subagent (checkpoint 0, hand-run CLI/tests). Here it floors the **delivery** tier at Small (never Micro) — it does not force Large: extra rigor for these high-stakes domains comes from the verifier-tier-routing floor below, not from delivery ceremony. This is intentional and matches the existing division of concerns: `references/medium-inline-path.md`'s Verifier-tier-routing table already separately floors the *verification model tier* at `standard` for security/critical paths, independent of the delivery tier. Conflating the two would make every auth-adjacent one-line fix pay full Large ceremony, which nothing in the codebase asks for.

## Usage

```bash
node scripts/assess-complexity.cjs \
  --signals '{"fileScope":"single-existing","abstraction":"none","prd":"none","decision":"none","steps":1,"text":"..."}' \
  --checkpoint 1 \
  [--prior-tier medium]
```

See the script's header comment for the full signal shape and the invariants it enforces, and `scripts/__tests__/assess-complexity.test.cjs` for worked scenarios (vague first message, direct opção-2 entry, escalate-only across checkpoints, critical-surface floor, tripwire escalation).
