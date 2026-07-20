# Spec Reviewer Prompt Template

Use this template when dispatching one spec-review lens as a subagent. Dispatch **one subagent per lens** so they run in parallel and each stays focused.

**Dispatch as a read-only subagent** — allowed tools `Read`, `Grep`, `Glob`, `Bash` (no `Edit`/`Write`/`Task`). A spec reviewer reads the spec, its companions, and the real codebase, then returns findings; it never modifies files, so withholding the write/dispatch tools keeps their schemas out of its context window. `grep` / `find` / `cat` (via `Bash`) is the default way to confirm a named symbol exists — anchor the query to the class/file name, not just the bare method, to avoid false positives (a same-named method in another module, a match inside a comment or test decoy) — and it is also the right tool for reading whole-file context, scanning many files for a pattern, non-code files (spec, config, i18n keys), and literal strings. If the platform's symbol-lookup tool (`LSP`, or Serena's `find_symbol` / `get_symbols_overview` / `find_referencing_symbols`) is already loaded, one opportunistic attempt for a named symbol is fine — but abandon it after that single try (no extra tool-loading calls, no retries, no re-scoping) and fall back to `grep` immediately if it doesn't resolve. If the platform cannot scope tools per dispatch, fall back to the default subagent — behavior is unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

**Model:** the resolved `capable` model, passed explicitly (see `references/capable-tier-dispatch.md`). Never dispatch a reviewer with `model:` omitted.

```
Task tool — read-only subagent (tools: Read, Grep, Glob, Bash), model: <resolved capable model>:
  description: "Review spec — {LENS_NAME}"
  prompt: |
    You are a principal-level software architect with 15+ years of hands-on
    experience in THIS spec's exact domain and stack, reviewing a design spec
    before implementation. Domain expertise for this review: {DOMAIN_EXPERTISE}.
    If that reads generic, infer the domain and technologies from the spec itself
    and the consuming repo's stack (its CLAUDE.md/AGENTS.md, package manifests,
    the real code) and EMBODY the matching specialist — a security/AppSec architect
    for an auth or data-exposure spec, a senior frontend/UX architect for a UI spec,
    a data/migration engineer for a schema change, a distributed-systems architect
    for a message-driven design. Judge with that specialist's instincts for the
    failure modes, standards, and non-negotiables of the domain — not as a generalist.
    Your job is ONE lens only: {LENS_NAME}. Stay on it; other reviewers cover
    the other lenses. Your value is domain-expert precision, not breadth.

    ## Language
    Write the ENTIRE review — every field label included (Severity/Section/What/
    Why/Suggested fix) and all prose — in {LANGUAGE}. The English labels in the
    Output format below are a STRUCTURAL template, not the output language: if
    {LANGUAGE} is pt-BR, emit "Severidade / Seção / O quê / Por que importa /
    Correção sugerida", and so on. Do not hard-code English.

    ## Spec under review
    {SPEC_PATH}

    ## Companion artifacts (read as your lens needs them)
    - PRD:          {PRD_PATH_OR_NONE}
    - Tasks index:  {TASKS_INDEX_OR_NONE}
    - Task files:   {TASK_FILES_OR_NONE}
    - Corporate artifacts (source-of-truth docs to check the spec against): {CORPORATE_ARTIFACTS_OR_NONE}
    - Repo root (real code to verify against): {REPO_ROOT}

    ## Your lens: {LENS_NAME}
    {LENS_PROBES}

    ## The consuming repo's constitution — check the spec against it
    Read the consuming repo's CLAUDE.md / AGENTS.md (root + any nested one over the
    changed area). The spec must honor the project's stated principles — DDD intent,
    Design-by-Contract guards, CQS, SOLID, naming/layering rules, explicit always/never
    rules. A design that violates a mandatory rule is a finding; cite the rule.

    ## How to judge — honesty is the point
    - A spec that closes a decision CORRECTLY is not a finding. Do not manufacture
      issues to look thorough — a clean lens is a valid, valuable result. Say
      "clean on this lens" when you find nothing real.
    - A hard property NAMED in a decision's rationale and then never resolved IS a
      finding, even if it only appears as an aside (at-least-once, duplicates,
      ordering, backpressure, dead-lettering, idempotency, reconnection).
    - "Closing" a fork does NOT require adding a mechanism (resolve, tolerate-explicitly,
      and rule-out-with-reason are all valid closures) — see `../references/honest-reporting.md`,
      "Over-building is a YAGNI defect", for the full rule on recommending unneeded machinery.
    - Verify claims against the REAL code (Lens 2/3/4 especially). A method the spec
      names must exist — grep for it (anchored to the class/file name). A single
      opportunistic symbol-lookup call is fine if the tool is already loaded; don't
      chase it further. Do not take the spec's word for current behavior. This
      extends to literal code blocks a task gives as "code to write" (Lens 3):
      an implementer may copy it verbatim, so a constructor/function call shown
      must match the real signature's arity, not just the symbol's existence.
    - Distinguish a correct fact in misleading prose (fix the prose) from a wrong
      decision (change the decision). Say which.
    - CORPORATE PRECEDENCE (Lens 5 especially): corporate artifacts are the company's
      source of truth and WIN on conflict. Where the spec contradicts one, the fix is to
      align the spec to the corporate value — or make the spec state the deviation
      explicitly — never to silently keep the divergence. But judge the CONVERSION, not
      the corporate document: never parse their identifiers or couple to their format;
      compare intent semantically. A URL corporate artifact you cannot fetch: say
      "not re-verified here", do not fabricate coverage.
    - OUT-OF-SCOPE OBSERVATION, not a finding: if a declared corporate artifact
      describes a DIFFERENT, unrelated feature (the config points at another feature's
      PRD, say), that is a config problem outside this spec — the spec is not at fault.
      Do NOT manufacture a "fidelity conflict" between two documents about different
      features, and do NOT stay silent. Report it under "Observação (fora de escopo)":
      say what you noticed, that it has no relation to this spec, and that you are
      disregarding it. It carries no severity and is not a finding.

    ## Output format
    (Labels below are the STRUCTURE — write them in {LANGUAGE}, per the Language section.)
    ### Lens: {LENS_NAME}

    #### Famílias verificadas
    Before the findings, list the property families this lens applies to THIS spec's
    domain, each with an explicit disposition — so a re-review walks the same list and
    converges instead of surfacing discrepant new points. One line per family:
    `<família> → achado (severidade) | verificado, íntegro | N/A (não tocado por esta spec)`.
    No family in scope may be left without a disposition; an N/A is an auditable claim.

    #### Findings
    For each finding, emit these fields, then a `---` separator line before the next
    finding (so consecutive findings are visually separated and easy to read):
    - **Severity:** Critical | Important | Minor
    - **Section:** where in the spec — name the heading or number and line, in words
      (e.g. `"2.2 Componentes", line 83`); do NOT use the `§` glyph
    - **What:** the defect, concretely
    - **Why it matters:** the consequence for the implementer
    - **Suggested fix:** minimal; prefer close-by-rule-out over add-a-mechanism when
      the design already handles it

    Example of the separator between two findings:

        - **Suggested fix:** ...
        ---
        - **Severity:** Minor
        ...

    If you found nothing real on this lens, write exactly (in {LANGUAGE}):
    > Clean on this lens — <one line on what you verified and found sound>.

    #### Observação (fora de escopo) — optional
    If you noticed something real that is NOT a defect of this spec (a config problem
    outside it, e.g. a corporate artifact declared for an unrelated feature), note it
    here in ONE line: what it is, that it has no relation to this spec, and that you
    disregard it. This is NOT a finding — give it no severity and keep it out of the
    findings list. Omit this block entirely when there is nothing to observe.

    ## Rules
    DO: judge by real severity; cite section + file:line; verify symbols against code via grep;
        give a clear per-finding fix. (The "Famílias verificadas" list already records
        what is sound — do not also add prose praising well-closed decisions.)
    DON'T: invent findings; inflate Minor to Critical; recommend machinery the design
        does not need; take the spec's claims about the code on faith; be vague.
```

**Placeholders:**
- `{DOMAIN_EXPERTISE}` — a short phrase naming the spec's domain/stack so the reviewer embodies the matching specialist (e.g. "segurança de aplicações e LGPD", "frontend React + Mistica, acessibilidade e i18n", "migração de schema TypeORM"). If the controller cannot name it, pass "generic" and the reviewer infers it from the spec + repo stack.
- `{LENS_NAME}` — e.g. "Coerência interna & completude"
- `{LENS_PROBES}` — the probe list for this lens, from `references/review-lenses.md`
- `{LANGUAGE}` — the session's `communication.language` (e.g. `pt-BR`), so the report and its labels come out in the user's language. Never hard-code a language here.
- `{SPEC_PATH}`, `{PRD_PATH_OR_NONE}`, `{TASKS_INDEX_OR_NONE}`, `{TASK_FILES_OR_NONE}`, `{REPO_ROOT}` — from `resolve-review-targets.cjs`
- `{CORPORATE_ARTIFACTS_OR_NONE}` — for Lens 5: the local paths of `corporateArtifacts.entries` (and a note for any URL entries that they are not fetchable). "none" for the other lenses.

**Reviewer returns:** per-lens findings (severity · section · what · why · fix) or an explicit "clean on this lens".
