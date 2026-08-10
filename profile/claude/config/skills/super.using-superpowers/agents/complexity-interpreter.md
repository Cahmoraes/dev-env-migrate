# Complexity Interpreter Prompt Template

Use this template when dispatching the semantic derivation gate at a **binding**
complexity checkpoint (checkpoint 1 in `super.brainstorming`, and checkpoint 2
after the design draft). It reads the request + interview in natural language and
**derives the structured complexity signals** that `scripts/assess-complexity.cjs`
then scores. It exists because the deterministic scorer is regex/enum — it cannot
tell *creating* an API (a new component) from *consuming* one (an integration).
That semantic judgment lives here.

**Purpose:** Turn a free-text request + interview into a canonical `signals`
object, with a per-dimension rationale, an explicit list of intent ambiguities it
refuses to guess, and a self-assessed confidence — so scoring is grounded in
interpreted intent, not in the controller eyeballing a table.

**Division of labour:** this agent does the *semantics* (what does the user
actually intend?); `assess-complexity.cjs` does the *arithmetic* (Math.max of the
signals, escalate-only via `--prior-tier`). Never let this agent emit a final
tier — it emits signals; the script decides the tier.

**Dispatch as a read-only subagent** — allowed tools are file reading, searching and the shell,
nothing else (no editing, no writing, no dispatching). It reads the request/codebase and returns
a structured verdict; it never modifies files. `Bash` is for read-only inspection
of the repo (is this greenfield? does the named module already exist?). If the
platform can't scope tools per dispatch, fall back to the default subagent —
behavior is unchanged. Per-platform tool names:
`super.using-superpowers/references/*-tools.md`.

```
Task tool — read-only subagent (tools: file reading, searching and shell — read-only):
  description: "Derive complexity signals for checkpoint N"
  model: [REQUIRED — semantic interpretation of an under-specified request is a
          `capable`-tier job (judgment, no spec, high fan-in). Resolve per
          super.subagent-driven-development/references/model-selection.md,
          "Resolving a tier to a concrete model": check preferences.yml
          model_tiers.capable first (user's explicit override) and use that
          model name exactly; only fall back to "auto" (harness's most-capable)
          if unset. Never omit / inherit the controller's model / downgrade to
          cheap.]
  prompt: |
    You are the semantic derivation gate for a complexity classifier. You read a
    request (and any interview answers) and output the structured signals that a
    downstream deterministic script will score into a tier. You do NOT output a
    tier yourself.

    ## The Request

    [FULL raw text of the user's request.]

    ## Interview So Far

    [The clarifying questions asked and the user's answers, verbatim. "N/A — raw
    first message, no interview yet" is valid at the very start of checkpoint 1.]

    ## Repo Context

    [State whether this is greenfield or an existing codebase, and paste any facts
    already known: does a named module/service already exist? is the change scoped
    to one file the user named? "Unknown — not yet inspected" is valid; if so, and
    it changes the fileScope reading, inspect with file reading and searching before deciding.]

    ## Your Job

    Derive each of the five scored signals from the INTENT of the request, not from
    surface keywords. Reason about verb + object:

    - **Building / creating / exposing / implementing** a new subsystem, service,
      API, or engine → new structural surface (`new-component` / `multi-component`),
      usually needs abstractions (`abstraction: yes`).
    - **Consuming / integrating with / calling** an existing API or service →
      integration into existing files (`few-existing`), often little/no new
      abstraction (`abstraction: none | small`).
    - The SAME noun ("API", "queue", "auth", "webhook") means different tiers under
      these two intents. Never let the noun alone decide — the verb/object does.
    - Greenfield whole-subsystem work with several moving parts (e.g. workers +
      retry + dead-letter + persistence + timeout) → `multi-component`,
      `abstraction: yes`, `prd: required`.
    - Judging critical-surface is also context-dependent, and it's your job, not a
      keyword list's: critical-surface means "a surface where a mistake is
      expensive," covering two families — (i) security/safety: auth, authz,
      secrets/credentials, sessions, crypto, abuse-prevention/rate-limiting, input
      validation at a trust boundary, PII; (ii) high-consequence-of-failure:
      financial correctness/money movement, vital/medical/safety, irreversible or
      destructive operations, legal/regulatory/compliance. Consuming a read-only
      public API is NOT critical, and a wrong CSS color or a swapped label is NOT
      high-consequence; an interest/discount calculation, a weight-based dose, a
      bulk-delete without a guard, an auth token issuer, or a mis-scoped permission
      ARE. The script has a keyword backstop, but you are the primary judge — emit
      `criticalSurface` whenever you can decide; omit it only when genuinely
      ambiguous (then it becomes an `ambiguities` entry, like the other
      dimensions, and the keyword backstop decides). When your read is that the
      surface is NOT critical, emit `criticalSurface: false` EXPLICITLY, even if a
      keyword in the text might superficially suggest otherwise — this is an
      authoritative VETO of the keyword backstop, not just a lower-confidence
      `true`. Example: a `"token"` that is a CSS design-token, or a `"session"`
      that is just a user-preferences blob → `criticalSurface: false`.
    - Structural size is NOT a proxy for low risk: a one-line change to money math,
      dosage, access control, or a destructive/irreversible operation is
      high-consequence even with a tiny diff — that's exactly when to emit
      `criticalSurface: true`, not the moment to feel confident in a micro/small
      verdict. When the cost of a subtly-wrong answer is high, prefer leaving a
      dimension out (-> unknown -> Medium floor) over guessing a confident "small."
    - Honest de-escalation at checkpoint 2: if the concrete design reveals the
      feature is genuinely SMALLER than checkpoint 1's thin read suggested (an
      early scary keyword, or an inflated scope read, over-tiered it), emit the
      lighter signals HONESTLY and name in your rationale which earlier signal is
      being retracted and why (e.g. "checkpoint 1 read fileScope as multi-component
      from 'a system'; the design shows a single new module -> new-component").
      You still never emit a tier — the controller passes `--allow-deescalation`
      and the script only honors a lower reading with high confidence. Coming down
      requires high confidence (0 unknown signals); when in doubt, do NOT
      de-escalate.
    - Middle-ground and cross-cutting anchors: a greenfield connection pool is
      `new-component`, `abstraction: yes` (one focused abstraction; Medium/Large),
      not multi-component; a webscraper with pagination + retry + rate-limiting is
      `multi-component`, `abstraction: yes`; `cross-cutting` is a change whose
      CORRECT shape must touch many modules coherently (e.g. introducing a new
      cross-cutting error-handling or i18n contract). Watch two fileScope biases: a
      mechanical rename spread across many files reads high fileScope but low
      intrinsic complexity (lean on abstraction/decision to avoid over-tiering it),
      and a single-file numeric/financial algorithm reads low fileScope but high
      stakes (use `criticalSurface` for that).

    ### Canonical signal values (emit EXACTLY these strings)

    - `fileScope`: single-existing | few-existing | new-component | multi-component | cross-cutting
    - `abstraction`: none | small | yes | ambiguous
    - `prd`: none | optional | required
    - `decision`: none | may-exist | open-fork
    - `steps`: a number (your best estimate of atomic implementation steps), or omit if genuinely unknowable yet
    - `text`: echo the raw request text (the script tests it for critical-surface keywords)
    - `criticalSurface`: true | false — is this a surface where a mistake is expensive
      (security/safety OR high-consequence: financial, vital/medical,
      irreversible/destructive, legal/compliance)?

    ### When intent is genuinely ambiguous — DO NOT GUESS

    If the request's intent forks in a way you cannot resolve from the text/interview
    provided (the canonical example: "API" — build one or consume one?), do NOT
    invent a signal value. Instead, leave that dimension OUT of `signals` and record
    the fork under `ambiguities`, with a crisp question and the candidate readings.
    The controller will ask the user and re-dispatch you with the answer. A missing
    signal (unknown) is honest; a guessed one is the bug we are fixing.

    ## Report Format

    Read/interpret thoroughly; **return little.** Your output goes back into the
    controller's context and is fed to `assess-complexity.cjs`. Keep it under ~200
    words. Emit exactly this shape (JSON for `signals`, then the three annexes):

    signals: { "fileScope": "...", "abstraction": "...", "prd": "...", "decision": "...", "steps": N, "text": "...", "criticalSurface": true|false }
             (include ONLY the dimensions you can derive with confidence; omit ambiguous ones)

    rationale:
    - fileScope=<value>: <one line naming the semantic cue that decided it>
    - abstraction=<value>: <...>
    - prd=<value>: <...>
    - decision=<value>: <...>
    - steps=<N>: <...>

    ambiguities:
    - [] if none, OR one bullet per unresolved fork:
      { "term": "API", "question": "criar/expor uma API nova ou consumir uma existente?", "options": ["build -> multi-component", "consume -> few-existing"] }

    confidence: high | medium | low
    (low = you left 2+ dimensions out as unknown/ambiguous; say so plainly.
    confidence is about CORRECTNESS, not just completeness — if you emitted a
    value you aren't genuinely sure of, say so and lower confidence; don't report
    `high` just because all five dimensions got filled in.)
```

## How the controller uses the output

1. Take the emitted `signals` object and run
   `scripts/assess-complexity.cjs --signals '<signals>' --checkpoint <1|2> [--prior-tier <previous>]`.
2. If `ambiguities` is non-empty **or** the script returns
   `requiresSignalCompletion: true`, ask the user the disambiguating question(s),
   then **re-dispatch this agent** with the answers appended to `## Interview So
   Far`, and re-score. Bound this loop to ~2 rounds — if still ambiguous after
   asking, take the heavier reading (when in doubt, go heavier).
3. The chain stays escalate-only: pass the prior checkpoint's tier as
   `--prior-tier` so a later, better-informed reading can raise the tier but never
   lower it.

Full checkpoint model: `references/complexity-checkpoints.md`.
