# Why Order Matters

Long-form rebuttals to the common "tests-after is fine" arguments. The condensed
versions live in the **Common Rationalizations** table and **Red Flags** list in
`SKILL.md`; this file expands the reasoning.

**"I'll write tests after to verify it works"**

Tests written after code pass immediately, which proves nothing: might test the wrong thing, test implementation not behavior, or miss edge cases you forgot — and you never saw it catch the bug. Test-first forces you to see the test fail, proving it actually tests something.

**"I already manually tested all the edge cases"**

Manual testing is ad-hoc: no record of what you tested, can't re-run when code changes, easy to forget cases under pressure. "It worked when I tried it" ≠ comprehensive. Automated tests are systematic — they run the same way every time.

**"Deleting X hours of work is wasteful"**

Sunk cost fallacy — the time is already gone. Your choice now: delete and rewrite with TDD (X more hours, high confidence) vs. keep it and add tests after (30 min, low confidence, likely bugs). The "waste" is keeping code you can't trust. Working code without real tests is technical debt.

**"TDD is dogmatic, being pragmatic means adapting"**

TDD IS pragmatic: finds bugs before commit (faster than debugging after), prevents regressions, documents behavior, enables refactoring (change freely, tests catch breaks). "Pragmatic" shortcuts = debugging in production = slower.

**"Tests after achieve the same goals - it's spirit not ritual"**

No. Tests-after answer "What does this do?"; tests-first answer "What should this do?" Tests-after are biased by your implementation — you test what you built, not what's required, and verify remembered edge cases, not discovered ones. Tests-first force edge case discovery before implementing; tests-after verify you remembered everything (you didn't). 30 minutes of tests after ≠ TDD: you get coverage, lose proof tests work.
