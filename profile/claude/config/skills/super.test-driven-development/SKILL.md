---
name: super.test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

"I'm keeping the spirit, not the letter" is not available here: there is no gap between them. Skipping a step of the cycle is skipping TDD.

## When to Use

**Always:** new features, bug fixes, refactoring, behavior changes.

**Exceptions (ask your human partner):** throwaway prototypes, generated code, configuration files.

Thinking "skip TDD just this once"? Stop. That's rationalization.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it and implement fresh from the tests. Not kept "as reference", not "adapted" as you write the test, not re-read — code you have just looked at makes the next test describe what you built instead of what was asked for. Delete means delete.

## Red-Green-Refactor

RED (write a failing test) → verify it fails for the right reason → GREEN (minimal code) → verify it passes → REFACTOR → next test. A *wrong* failure sends you back to RED; a failure after GREEN means fix the code, never the test.

### RED - Write Failing Test

Write one minimal test showing what should happen.

<Good>
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
Clear name, tests real behavior, one thing
</Good>

<Bad>
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
Vague name, tests mock not code
</Bad>

**Requirements:**
- One behavior — "and" in the name means split it
- A name that states the behavior (`test1` states nothing), demonstrating the API you wish you had
- Real code (no mocks unless unavoidable) — a mock test proves the mock works
- Deep assertion (full relevant state/payload, not one field lifted out of it; for guard clauses,
  the state exactly at the boundary — see Assertion Depth)

### Verify RED - Watch It Fail

**MANDATORY. Never skip.**

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.

**Test errors?** Fix error, re-run until it fails correctly.

### GREEN - Minimal Code

Write the simplest code that passes.

#### The YAGNI ladder

Descend the ladder, stopping at the first rung that covers the test:

1. Does it need to exist? No → don't write it (YAGNI).
2. Stdlib does it? → use it.
3. Native platform feature does it? (e.g. `<input type="date">`) → use it.
4. Already-installed dependency does it? → use it.
5. One line? → one line.
6. Only then: the minimum that passes the test.

Never skip a safety guard (validation, escaping, auth, edge-case check) to save lines — cutting safety is not YAGNI, it's a bug.

<Good>
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```
Just enough to pass
</Good>

<Bad>
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI
}
```
Over-engineered
</Bad>

Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN - Watch It Pass

**MANDATORY.**

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.

**Other tests fail?** Fix now.

### REFACTOR - Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green, add no behavior.

*Use the `refactoring` skill here — it names the code smells and gives the catalog of moves.*

### Repeat

Next failing test for next feature.

## Assertion Depth

**Density kills mutants, count doesn't.** A test asserting one field of a multi-field result
gives every mutation on the *other* fields a free pass — the suite grows, the behavior it actually
locks down doesn't. More tests with shallow asserts score worse against mutation testing than
fewer tests that each assert deep.

**Rule:** assert the complete relevant state or payload the caller depends on, not a single field
lifted out of it.

<Good>
```typescript
test('creates order with computed total', () => {
  const order = createOrder({ items: [{ price: 10, qty: 2 }], customerId: 'c1' });

  expect(order).toEqual({
    customerId: 'c1',
    items: [{ price: 10, qty: 2 }],
    total: 20,
    status: 'pending',
  });
});
```
One assertion locks the whole shape — a mutant on `status` or `total` alone still gets caught
</Good>

<Bad>
```typescript
test('creates order with computed total', () => {
  const order = createOrder({ items: [{ price: 10, qty: 2 }], customerId: 'c1' });

  expect(order.total).toBe(20);
});
```
Passes untouched if `status` defaults wrong, `customerId` gets dropped, or `items` gets mutated —
none of that is asserted
</Bad>

Use `toEqual`/`toStrictEqual` (or the language equivalent) over a chain of single-field `toBe`
calls whenever the result is a value the caller consumes as a whole. For side effects (a call, a
write, an emitted event), assert the payload's value/state — not merely that the call happened.

**Where to stop:** assert every field the spec or the caller actually reads — not
implementation-internal fields nobody depends on (that's coupling, not depth).

**Signal you're under-asserting:** pick a field of the returned/stored value and imagine flipping
it. If you can't name the test that would fail, the assertion is too shallow — deepen it before
moving to the next test.

**Before testing a branch that skips a side effect** — an early return that avoids an eviction, a
duplicate write, a re-notify — read `references/assertion-depth-boundaries.md` (a reference doc to
open with your file reader, not a skill to invoke). At that branch's boundary the wrong path
returns the *right value*, so a return-value assertion passes by coincidence; the file gives the
worked Good/Bad pair for placing the state at the edge and asserting the side effect.

## Why Order Matters

Tests-after pass immediately and prove nothing; test-first forces you to watch the test fail, proving it tests something. Tests-after answer "What does this do?"; tests-first answer "What should this do?" — and force edge-case discovery before implementing. Full rebuttals to each "tests-after is fine" argument: `references/why-test-first.md`.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. The test costs 30 seconds. |
| "I'll test after" | Tests written after pass immediately and prove nothing. |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost. The unverified code is the debt, not the delete. |
| "Need to explore first" | Fine. Throw the exploration away, start with TDD. |
| "Test hard to write" | Hard to test = hard to use. Listen to the test; simplify the design. |
| "Manual test is faster" | It misses edge cases, and you re-run it by hand on every change. |
| "TDD will slow me down" | Slower than debugging is a race nobody wins. |
| "Existing code has no tests" | You're improving it — add tests for what you touch. |

## Red Flags - STOP and Start Over

These are observable states, not opinions. Any one of them means: delete the code, start over with TDD.

- Production code exists that no failing test preceded
- A new test passed the first time it ran
- You can't say why the test failed
- Tests are queued to be "added later"
- You are arguing with this skill — "just this once", "this is different because…", "spirit not ritual", "dogmatic vs pragmatic", "keep it as reference", "I already tested it by hand", "deleting those hours is wasteful", or any fresh variant of the same move
- An assertion checks one field of a value that has several (see Assertion Depth)
- A guard clause is tested away from its boundary instead of exactly at the edge where the wrong branch would fire (see Assertion Depth)

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered
- [ ] Assertions cover the full relevant state/payload, not a single shallow field (Assertion Depth)
- [ ] Guard clauses are tested exactly at their boundary with a full side-effect assertion, not just
  away from the edge (Assertion Depth)

Can't check all boxes? You skipped TDD. Start over.

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API. Write assertion first. Ask your human partner. |
| Test too complicated | Design too complicated. Simplify interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify design. |

## Debugging Integration

Bug found? Write a failing test that reproduces it, watch it fail, then run the cycle — the reproduction test is your RED. Never fix a bug without one.

## Testing Anti-Patterns

When adding mocks or test utilities, read the local file `testing-anti-patterns.md` in this skill's directory (a reference doc to open with your file reader — not a skill to invoke) to avoid:
- Testing mock behavior instead of real behavior
- Adding test-only methods to production classes
- Mocking without understanding dependencies

## Final Rule

```
Production code → test exists and failed first
Otherwise → not TDD
```

No exceptions without your human partner's permission.
