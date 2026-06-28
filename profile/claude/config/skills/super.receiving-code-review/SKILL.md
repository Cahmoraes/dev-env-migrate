---
name: super.receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# Code Review Reception

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:
1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

**NEVER:**
- "You're absolutely right!" (explicit CLAUDE.md/AGENTS.md violation)
- "Great point!" / "Excellent feedback!" (performative)
- "Let me implement that now" (before verification)

**INSTEAD:** restate the technical requirement; ask clarifying questions; push back with technical reasoning if wrong; or just start working (actions > words).

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items
WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:** partner says "Fix 1-6"; you understand 1,2,3,6 but not 4,5.
```
❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From your human partner
- **Trusted** - implement after understanding; **still ask** if scope unclear
- **No performative agreement** - skip to action or technical acknowledgment

### From External Reviewers
```
BEFORE implementing, check: (1) technically correct for THIS codebase? (2) breaks
existing functionality? (3) reason for current impl? (4) works on all platforms/versions?
(5) does reviewer understand full context?

IF suggestion seems wrong:  push back with technical reasoning
IF can't easily verify:     "I can't verify this without [X]. Should I [investigate/ask/proceed]?"
IF conflicts with partner's prior decisions: stop and discuss with partner first
```

**Partner's rule:** "External feedback - be skeptical, but check carefully"

## YAGNI Check for "Professional" Features

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage
  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used:   implement properly
```

**Partner's rule:** "You and reviewer both report to me. If we don't need this feature, don't add it."

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Implement in order: blocking (breaks, security) → simple (typos, imports) → complex (refactoring, logic)
  3. Test each fix individually; verify no regressions
```

## When To Push Back

Push back when the suggestion: breaks existing functionality; comes from a reviewer lacking full context; violates YAGNI (unused feature); is technically incorrect for this stack; ignores legacy/compatibility reasons; or conflicts with partner's architectural decisions.

**How:** technical reasoning, not defensiveness; ask specific questions; reference working tests/code; involve partner if architectural.

**Signal if uncomfortable pushing back out loud:** "Strange things are afoot at the Circle K"

## Acknowledging Correct Feedback

When feedback IS correct:
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "Thanks for [anything]" / ANY gratitude expression (plus the Forbidden Responses above)
```

**Why no thanks:** Actions speak; the code shows you heard the feedback. About to write "Thanks"? DELETE IT — state the fix instead.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong, state the correction factually and move on:
```
✅ "You were right - I checked [X] and it does [Y]. My understanding was wrong because [reason]. Implementing now."
❌ Long apology / defending why you pushed back / over-explaining
```

## Real Example

```
Reviewer: "Remove legacy code"
❌ Performative: "You're absolutely right! Let me remove that..."
✅ Technical:    "Checking... build target needs the older API for backward compat. Current impl has a bug - fix it, or drop the legacy path?"
```

## GitHub Thread Replies

Reply to inline review comments in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.

## The Bottom Line

**External feedback = suggestions to evaluate, not orders to follow.** Verify. Question. Then implement. No performative agreement. Technical rigor always.
