'use strict';

/**
 * verifier-dispatch-contract.test.cjs — the Verifier's tool grant must not describe it as
 * flatly read-only, because the same prompt orders it to write.
 *
 * The incident this closes: a sweep that replaced hardcoded tool names (`Read, Grep, Glob,
 * Bash`) with capability phrasing also appended "— read-only" to the dispatch header of
 * every reviewer template. For the six actual reviewers that is accurate. For the Verifier
 * it is not: the discrimination sensor works by applying a fault and proving the tests go
 * red, so the very same prompt body instructs `run-mutation.cjs` and, as a manual fallback,
 * `git stash` -> edit -> run tests -> confirm FAIL -> restore.
 *
 * That left the fenced block — the part actually pasted into the subagent's prompt —
 * self-contradictory: "read-only" at the top, "edit the file" 145 lines down. A subagent
 * resolving that contradiction in favour of the header skips the mutation sensor and
 * reports coverage only. The gate degrades to a spec-checklist and nothing fails loudly:
 * exactly the silent-degradation class `super.independent-verification` exists to prevent.
 *
 * The invariant is not "keep this sentence". It is:
 *
 *   the Verifier's tool grant may narrow WHAT it writes, never deny THAT it writes.
 *
 * Run: node --test super.independent-verification/scripts/__tests__/verifier-dispatch-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = path.resolve(__dirname, '..', '..', 'agents', 'verifier.md');
const body = fs.readFileSync(TEMPLATE, 'utf8');

/**
 * The fenced block is what gets pasted into the dispatch — prose outside it may not travel.
 *
 * Both fences are anchored to start-of-line: the prompt body embeds its own indented
 * ```bash fences (the run-mutation.cjs invocation), and a lazy match without `^` closes on
 * the first of those, truncating the block right before the mutation cycle this file exists
 * to assert on.
 */
function dispatchBlock() {
  const m = body.match(/^```\nSubagent[\s\S]*?^```/m);
  assert.ok(m, 'verifier.md must carry a fenced ``` block headed by the `Subagent (...)` dispatch');
  return m[0];
}

test('the dispatch header does not call the Verifier flatly read-only', () => {
  const header = dispatchBlock().split('\n')[1];

  assert.match(header, /^Subagent \(Verifier/, 'anti-staleness: the header line must be the Verifier dispatch');

  // A bare "read-only" qualifier on the tool grant. The six reviewer templates carry this
  // legitimately; here it contradicts the mutation cycle ordered further down.
  assert.doesNotMatch(
    header,
    /—\s*read-only\s*\)/,
    'the Verifier dispatch header must not end its tool grant with a bare "— read-only": ' +
      'the same prompt orders a scratch-state mutation cycle that edits a file. Narrow WHAT it ' +
      'writes ("never edits source or tests"), never deny THAT it writes.',
  );
});

test('the tool grant names the mutation cycle as the exception to not writing', () => {
  const header = dispatchBlock().split('\n')[1];
  assert.match(
    header,
    /mutation cycle is the one exception/,
    'the header must name the scratch-state mutation cycle as the carve-out, or a reader has ' +
      'no way to reconcile the grant with the instructions below it',
  );
});

test('the prompt body still orders the mutation cycle the header carves out', () => {
  // The carve-out is only meaningful while the thing it carves out is still ordered.
  // If the sensor were ever dropped, this test failing is the signal to revisit the header
  // rather than to quietly keep an exception for nothing.
  const block = dispatchBlock();
  assert.match(block, /run-mutation\.cjs/, 'the prompt must still invoke run-mutation.cjs');
  assert.match(
    block,
    /git stash/,
    'the prompt must still document the manual stash/restore fallback for the sensor',
  );
  assert.match(
    block,
    /always restored/,
    'the prompt must still promise the scratch state is restored — that is what makes the ' +
      'write safe to authorise',
  );
});

test('the orchestrator-facing prose keeps the "mostly" qualifier', () => {
  // The line the controller reads when deciding the tool scope. It said "mostly-read-only"
  // before the sweep and must keep saying so — that word is what stops a platform-side
  // allowlist from being built without write capability.
  assert.match(
    body,
    /mostly-read-only/,
    'the dispatch instruction must describe the Verifier as MOSTLY read-only',
  );
});
