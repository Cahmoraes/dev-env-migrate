# Assertion Depth at a Guard's Boundary

Read this when the code under test has a branch that **skips a side effect** — an early return
that avoids an eviction, a duplicate write, a re-notify, a second charge. It extends the
`SKILL.md`, "Assertion Depth" section for the one case where a deep assertion still is not enough.

## Why this branch is different

A guard like that is easy to verify at the "obviously true" and "obviously false" ends of its
condition, and easy to leave unverified exactly **at the boundary** — where taking the wrong
branch still produces the same *return value* through a different, wrong path. A
return-value-only assertion then passes by coincidence, and so does a mutant that deletes the
guard.

Two things have to be true of the test:

1. The state sits exactly at the edge where the guard decides — at capacity, at the TTL instant,
   at the duplicate key, at the retry ceiling. One step away from the edge and the guard's
   skip-branch is never exercised.
2. The assertion covers the **observable side effect** — a counter, a call count, a stored key,
   an emitted event — and not only what the function returned.

<Good>
```typescript
test('re-inserting the only key at capacity updates it without evicting', () => {
  const cache = new LruTtlCache({ maxSize: 1, defaultTtlMs: 1000 });
  cache.set('a', 1); // fills the cache to capacity
  cache.set('a', 2); // re-set the same key exactly at the guard's boundary

  expect(cache.stats()).toEqual({ hits: 0, misses: 0, evictions: 0, expirations: 0 });
  expect(cache.get('a')).toBe(2);
});
```
Puts the state exactly where the "key already exists" guard decides whether eviction runs, and
asserts the eviction counter directly — a broken guard shows up even though `get('a')` alone would
still return `2` via a delete-then-reinsert side path that masks the bug
</Good>

<Bad>
```typescript
test('set updates an existing value', () => {
  const cache = new LruTtlCache({ maxSize: 10, defaultTtlMs: 1000 });
  cache.set('a', 1);
  cache.set('a', 2);

  expect(cache.get('a')).toBe(2);
});
```
`maxSize` is far from capacity, so the guard's "skip eviction" branch is never actually exercised at
its edge — a broken guard would only misbehave once the cache is full, which this test never
reaches, and it only checks the return value regardless
</Bad>

## Finding the edge

Name the guard's condition out loud, then write the input that makes it *just barely* true and the
input that makes it *just barely* false. Both belong in tests. If the two inputs produce the same
return value, that is the confirmation you need the side-effect assertion rather than a stronger
return check.
