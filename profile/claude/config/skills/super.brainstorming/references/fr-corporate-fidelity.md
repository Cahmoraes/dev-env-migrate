# FR mechanism fidelity & corporate artifact precedence

Shared rules for any skill that **writes** or **audits** a PRD/spec carrying functional
requirements (`FR-NNN`) or content sourced from corporate artifacts. **Single source of
truth — edit here, not inline in each skill.** Callers apply these rules at their own
moment (drafting vs. auditing); only the *definition* lives here.

## FR mechanism fidelity

For every functional requirement (`FR-NNN`) that names a concrete mechanism — a protocol,
a header, a specific endpoint, an algorithm, a specific technique — search the spec for that
same mechanism. If the spec describes it differently — deprecated, out of scope, "does not
exist today" — the FR is carrying a stale or false claim.

Fix it by making the FR text match what the spec actually decided, or, if the gap is a
deliberate trade-off the spec accepted, state the deviation explicitly in the FR itself
rather than restating the original, unmet promise.

Left uncorrected, this is the same defect as a named-but-dropped fork (below), just carried
across two documents instead of one: **a QA gate that checks only the FR-NNN *token* — not
its *mechanism* — will mark it "PASSED"** because the produced behavior looks close enough.
Canonical shape: a PRD promising catch-up "via `Last-Event-ID`" while the spec quietly
resolves the same gap through a `GET` re-fetch endpoint, with neither document pointing at
the other.

## Corporate artifact precedence

Corporate artifacts (a pre-existing PRD, a wiki export, an API schema, an ADR, loose notes
— anything the company brought in) are the company's source of truth and **win on
conflict — but never silently**:

- Use them to populate the working document (user stories, acceptance criteria, constraints
  it may already document).
- If a corporate artifact conflicts with the current spec/PRD or a session decision, do
  **not** just follow the spec: flag the conflict, present the corporate value as the
  recommended truth, and ask which one to follow. The answer governs.
- Where the working document restates a corporate decision, the restatement must not
  weaken, invert, or silently reinterpret it — a corporate "must be idempotent" converted
  into "should retry" is a distortion, not a paraphrase.

## Named-but-dropped fork

Every capability *named* in prose — a retry, a deduplication, an ordering guarantee, an
audit trail, a rate limit — must land somewhere resolvable: specified as a requirement/
decision, or explicitly ruled out (e.g. listed under scope exclusions). A capability
mentioned in a paragraph but resolved in neither place is a dropped fork — downstream work
cannot tell whether to build it.
