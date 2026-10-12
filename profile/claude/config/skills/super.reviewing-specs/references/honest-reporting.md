# Honest reporting — the report format and the honesty contract

A spec review is only useful if the reader can trust it. The failure mode that destroys trust is a review that **always finds something**: once the implementer learns the review manufactures findings to look thorough, they stop reading it, and a real Critical slips through next to the invented Minor. The discipline is not "find as much as possible" — it is "report exactly what is true, at its real severity, and nothing else."

## The two symmetric failures

Every finding you write, and every finding you *don't*, sits between two errors. Both are defects.

1. **Manufacturing (false positive).** Inventing a gap where the spec is actually closed, or inflating a Minor into a Critical. This is the worse of the two because it poisons the whole report. A spec that is genuinely sound must produce a **"no changes needed"** verdict — an empty findings list is a valid, honest, *good* outcome, not a sign you failed to look hard enough.

2. **Silence (false negative).** Leaving a real open fork unmentioned because closing it felt like extra work, or because the spec's prose sounded confident. A hard technical property named in a decision's rationale — whichever family the spec's domain touches: delivery/ordering/idempotency/reconnection (async), migration reversibility/transaction boundaries (data), authz/PII/consent/audit (security & privacy-LGPD), versioning/pagination contracts (API), accessibility/i18n/loading-error-empty states (frontend/UX) — is a **fork the spec now owes closure on**, even if it only surfaced as an aside. If the spec names it and then goes quiet, that silence is the finding.

## Closing is not building

When you flag an open fork, the fix is to **close** it — and closing has three shapes, only one of which adds a mechanism:

- **Resolve it** with a decision and its trade-off ("two-stage pipeline because mixing persistence with broadcast couples two concerns").
- **Tolerate it explicitly**, naming why the tolerance is safe ("duplicates tolerated — the client already dedupes by event ID; no consumer-side dedup store").
- **Rule it out with a reason** ("no DLQ — recovery is the `Last-Event-ID` catch-up against Postgres, the source of truth").

The last two are single lines. A fork closed by an explicit rule-out is **just as closed** as one closed by a new subsystem — and usually the correct answer.

### Over-building is a YAGNI defect

Recommending a dead-letter queue, a dedup table, or a retry engine that the design's own shape already makes unnecessary is **over-building**: a YAGNI defect dressed as diligence. So when you find an open fork, ask first "does the design already handle this by its shape?" — if yes, the finding is "the spec should *state* that rule-out", not "the spec should *add* a mechanism."

## Distinguish a correct fact from misleading prose — the finding's kind

A section can state something true in a way that will mislead the implementer, and that is a real (usually Important or Minor) finding — but the fix is to the *prose*, not the *decision*. Example: a table row reads "Sem mudanças em `SseManager`" and that is factually correct (the tasks do use `send`), yet an adjacent sentence in the flow narration calls a `SseManager.fanout()` that does not exist. The decision is right; the narration is stale. Say exactly that — "the decision is correct; this sentence is out of date" — so the user fixes one line instead of re-opening a settled decision.

Every finding therefore carries a **kind**: `prose` (the fix is one edit that restores a fact) or `decision` (the fix is a choice only the spec's owner can make — an open fork, an ambiguous closure, a wrong decision). A decision finding's suggested fix must spell out the closure it proposes, with the concrete value; the consent step then treats "apply all" as accepting those closures *as written*, and the model never substitutes a closure it likes better at apply time. Kind is not severity: a Minor can be a decision (an unquantified `staleTime`) and a Critical can be prose (a ghost method name copied into three sections).

**Ambiguity is a gap, not a style note.** A closure that two competent implementers would build differently — "validado de forma adequada", "tenta algumas vezes", "será tratado" with no actor — is an open fork wearing a decision's clothes. It is Important when the sentence governs behavior the implementer must build; Minor when it is descriptive only. The fix is the concrete value or rule, or an explicit "implementer's choice within [range]".

## Out-of-scope observations — noted, not findings

A review will sometimes notice something real that is **not a defect of the spec under review** — most often a *configuration* problem outside the spec. The canonical case: `.superpowers/corporate-artifacts.yml` declares a corporate artifact (a PRD, say) that belongs to a **different, unrelated feature**, so Lens 5 is handed a document with no thematic relation to this spec. Comparing the spec against it and reporting a "fidelity conflict" would be nonsense — the two describe different features; the spec is not at fault, the config points at the wrong artifact.

This is a third category, distinct from both symmetric failures above: it is neither a finding to rank nor a silence to break. Do **not** force it into a Critical / Important / Minor finding, and do **not** stay quiet about it either. Report it as an **out-of-scope observation**: state plainly what you noticed, that it has no relation to this spec, and that you are **disregarding it** for this review — it does not enter the severity counts and needs no consent to "apply". One line, in a dedicated **"Observações (fora de escopo)"** note in the verdict. Findings are defects of the artifact under review; observations are everything else worth surfacing so the user can fix the config when they choose to.

## Language and readability

- **Write the whole report — headings, field labels, and prose — in the user's language** (the one they write in, or the one their harness instructions set). The English headings and labels in the templates below are the structure; translate them into that language when you print. Never hard-code a single language into the output.
- **Separate consecutive findings with a `---` line** so the report is easy to scan — one blank line and a horizontal rule between each finding, within every severity block.
- **Reference spec sections in words, not the `§` glyph** — name the heading or number (`"2.2 Componentes", linha 83`, `decisão D3`), which reads clearly regardless of font.

## Report structure

Use this shape. It mirrors `super.requesting-code-review`'s reviewer output so it reads familiar, but it is aimed at a *spec*, not a diff. **Report only what needs attention.** Do not enumerate, decision by decision, everything the spec closes correctly — that praise is pure token cost the reader did not ask for. Trust is preserved cheaply by the verdict's one-line **coverage** statement (what was checked and found sound), not by a section of well-earned compliments.

Render the report in the user's language (e.g. `pt-BR`): translate the headings and labels below into that language when you print them.

```
## Spec review: <feature>

### Findings

#### 🔴 Critical (blocks implementation)
[A bug the implementer will hit: a runtime-breaking contradiction between two tasks,
 a decision that cannot be built as written, or a spec that violates a corporate
 constraint. For each: kind (prose | decision) · what · which section · why it blocks ·
 suggested fix. Put a `---` line between consecutive findings.]

#### 🟡 Important (should close before coding)
[A real open fork or inconsistency: a named-but-dropped property, an ambiguous closure,
 a mitigation that does not cover its own risk scenario, a scope gap, a corporate
 requirement dropped or distorted in the conversion. For each: kind · what · section ·
 why · fix (prefer close-by-rule-out over add-a-mechanism when the design already
 handles it; for a decision, spell out the proposed closure).
 Put a `---` line between consecutive findings.]

#### 🟢 Minor (polish)
[Undefined payload shape, spec/task wording drift, a name drift, a silence that is
 probably acceptable but worth a one-line note. For each: kind · what · section ·
 suggested fix. Put a `---` line between consecutive findings.]

### Verdict
Coverage: I checked <lenses/families> — <what was sound, in ONE line>.
N findings: <count by severity>, of which <n> are decisions with a proposed closure.
I recommend applying <which>.
Out-of-scope observations: <optional — something real you noticed that is NOT a defect of
 this spec, e.g. corporate-artifacts.yml points at another feature's PRD; unrelated to this
 spec, disregarded in this review>.
```

Omit any severity subsection that has no findings — do not print an empty `#### 🟢 Minor` header just to fill the template. When **every lens is clean**, drop the Findings block entirely and collapse to:

```
## Spec review: <feature>

### Verdict: no changes needed
I checked <lenses/families>. The spec closes the verified points and is consistent with <code/tasks>.
No open point, inconsistency, or gap found. One item that is NOT a defect: <optional
 note on an acceptable silence, e.g. ordering not discussed but not required here>.
Out-of-scope observations: <optional — something real you noticed that is NOT a defect of this
 spec, e.g. corporate-artifacts.yml points at another feature's PRD; disregarded in this review>.
```

## Consent, minimal edits, and the tasks handoff

- **Report before you edit.** Post the full report as a normal chat message (prose/Markdown, rendered outside any elicitation dialog); then call the platform's structured question tool with a short plain-text question and the four options of SKILL.md Step 3 (apply all — spec and tasks / apply all — spec only / apply a subset / save to adjust later) — never embed the report body inside the tool's `message`/prompt field, since that field is an options dialog, not a Markdown renderer. Fall back to a numbered prose list where no such tool exists, e.g. `codex exec`. Never edit a file before the user consents — the spec is theirs.
- **"Save to adjust later" persists the report.** When the user declines to apply anything but wants the findings for later, save the full report to `<feature>-review.md` in the reviewed artifact's own directory (`specs/<feature>-review.md`, or `prd/<feature>-review.md` if a PRD was the artifact under review) — never overwrite an existing one silently — and tell them the path. That is the only write this branch makes; the spec/PRD/tasks stay untouched.
- **Corporate conflicts follow the conflict protocol.** When a finding is a spec↔corporate contradiction, the corporate artifact wins — but surface it, recommend the corporate value as the fix, and let the user decide (their answer governs). Never silently rewrite the spec to the corporate value, and never silently keep the divergence.
- **"Apply all" applies proposed closures as written.** For a decision finding, apply exactly the closure the report proposed — never a different one chosen at apply time. A user who wants another closure names it under "apply a subset". Findings left unapplied under a subset are offered the same persistence as "save to adjust later".
- **Edit surgically, then propagate.** Apply only what was agreed, only as much as each fix needs. Do not rewrite a section that is already right — but do update every restatement of the fact you fixed (flow, component table, risk row, test table, tasks if agreed); one corrected copy next to three stale ones is a new Lens 1 contradiction.
- **Tasks ride on the same consent.** The Step 3 answer already says whether the tasks follow ("spec and tasks" vs "spec only"); there is no second question after the spec is fixed. When they follow and tasks exist, hand off to `super.writing-plans` (it re-discovers by feature-name and edits/creates the affected `task-NN.md`); otherwise stop.
- **Verify deterministically.** Close with the validator's real output (`validate-tasks.cjs`, a residual search), never a self-declared "done".
