#!/usr/bin/env node
'use strict';
/*
 * finishing-memory-resync.test.cjs — the end-of-flow memory re-sync gate (Step 8).
 *
 * What changed and why it needs a guard: a finished feature used to reach persistent
 * memory only through the ENTRY gate of `super.using-superpowers`, in some later session
 * that happened to open the repo. Everything about that path is correct, and it stays —
 * but it makes the moment of ingestion depend on the user coming back, and the artifacts
 * are final exactly once: right after the integration choice runs here.
 *
 * So finishing now syncs the one feature it just finished. Three properties make that safe
 * rather than merely convenient, and all three are pure prose — the failure mode this file
 * exists for is any of them being softened into a suggestion while the suite stays green:
 *
 *   1. FEATURE-SCOPED. `compute-inventory.cjs --feature <slug>`. Not the repo. A whole-repo
 *      sync at the end of a session would ingest other developers' features that the user
 *      was never asked about, and would pull every feature's artifact entry into a context
 *      that is already at its longest.
 *   2. DISCARD NEVER SYNCS, and this gate never prunes. Remembering the spec/PRD/QA of work
 *      the user just threw away is worse than not remembering it at all; pruning here would
 *      delete memory for a slug that is simply on another branch.
 *   3. NON-BLOCKING. The integration already happened. A memory failure must not read as a
 *      reason to roll anything back — the entry gate retries next session.
 *
 * Position is asserted too, not just content. The measured failure of this skill's tail
 * (Copilot session 8bf714be: 0 of 5 finish-tail gates ran, with the SKILL.md whole in
 * context) was not a delivery problem — the one gate that did fire was the mechanical one,
 * which looks for a file on disk. Step 8 is therefore written as a numbered step with a
 * command whose JSON decides the branch, and it must stay inside "The Process", ahead of
 * the Red Flags, where the model is still executing steps.
 *
 * Run: node --test super.finishing-a-development-branch/scripts/__tests__/finishing-memory-resync.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const FIN = read('super.finishing-a-development-branch/SKILL.md');
const RESYNC = read('super.using-superpowers/references/memory-resync.md');
const ENTRY = read('super.using-superpowers/SKILL.md');
const INVENTORY = read('super.using-superpowers/scripts/compute-inventory.cjs');

/** The Step 8 body: from its heading to the next heading of the same or higher level. */
function step8() {
  const start = FIN.indexOf('### Step 8: Memory Re-Sync');
  assert.ok(start >= 0, 'Step 8 is gone from the finishing SKILL.md');
  const rest = FIN.slice(FIN.indexOf('\n', start) + 1); // skip the heading line itself
  const next = rest.search(/^#{1,3} /m);
  const body = next === -1 ? rest : rest.slice(0, next);
  assert.ok(body.trim().length > 0, 'Step 8 has an empty body');
  return body;
}

test('Step 8 exists and sits inside The Process, before the Red Flags', () => {
  // Position, not just presence: a gate written after the Red Flags reads as an appendix,
  // and this skill has a measured history of skipping prose-only tail gates.
  const process = FIN.indexOf('## The Process');
  const step7 = FIN.indexOf('### Step 7: Cleanup Workspace');
  const step8Idx = FIN.indexOf('### Step 8: Memory Re-Sync');
  const redFlags = FIN.indexOf('## Red Flags');

  assert.ok(process >= 0 && step7 >= 0 && redFlags >= 0, 'anchors must exist');
  assert.ok(step8Idx > step7, 'Step 8 must follow Step 7 — it runs after cleanup');
  assert.ok(step8Idx < redFlags, 'Step 8 must be a step of the procedure, not a trailing note');
});

test('Step 8 is gated on memory being enabled and on a feature tree existing', () => {
  const body = step8();
  assert.match(body, /`session_memory_enabled` is `false`/,
    'the memory preference is the trigger — without it the gate must skip silently');
  assert.match(body, /docs\/superpowers\/<feature>\//,
    'a branch with no feature tree has nothing to ingest (same exemption as the IV gate)');
});

test('Discard never syncs', () => {
  assert.match(step8(), /\*\*Discard\*\*/,
    'the discard case must be named in the skip list: memory must not hold work the user threw away');
});

test('Step 8 is feature-scoped, not a whole-repo sync', () => {
  const body = step8();
  assert.match(body, /--feature <feature>/,
    'the scoped flag is the whole point — a repo-wide sync ingests features nobody consented to');
  assert.match(body, /compute-inventory\.cjs/,
    'the decision must come from the script, not from the model reading docs/');
});

test('Step 8 runs against the main repo root, never a worktree', () => {
  const body = step8();
  assert.match(body, /git rev-parse --git-common-dir/,
    '.memory/ lives in the main working tree; a worktree has none, and pmem init there would fork the DB');
  assert.match(body, /--repo-root "\$MEMORY_ROOT"/,
    'the root must be passed explicitly — defaulting to the cwd resolves to the worktree');
});

test('the orchestrator dispatches a sync-worker instead of reading the artifacts', () => {
  const body = step8();
  assert.match(body, /dispatch \*\*one\*\* sync-worker subagent/,
    'one subagent for the one feature');
  assert.match(body, /never read its artifacts yourself/,
    'reading spec/prd/qa inline at the end of a long session is the most expensive moment to do it');
});

test('Step 8 is non-blocking — a memory failure never undoes the integration', () => {
  assert.match(step8(), /Non-blocking/,
    'the work is already merged/pushed; a failed sync is a reported line, not a rollback');
});

test('the manifest write and the verify audit are both named', () => {
  const body = step8();
  assert.match(body, /update the manifest for that slug/,
    'writing only this slug is what keeps the entry gate correct for every other feature');
  assert.match(body, /verify-sync\.cjs/,
    'the manifest<->DB audit is required here for the same reason it is required in the entry gate');
});

test('the old "memory only happens next session" claim is gone', () => {
  // The exact sentence this gate replaces. Left in place it would contradict Step 8 and give
  // a reader an explicit licence to skip it.
  assert.doesNotMatch(FIN, /does \*\*not\*\* persist to memory itself/,
    'finishing now performs the feature-scoped sync; the deferral-only claim is false');
  assert.doesNotMatch(FIN, /picked up by the \*\*next session's Memory Re-Sync Gate\*\*/,
    'the entry gate is the FALLBACK now, not the only path');
});

test('SKILL.md carries the trigger, the reference carries the algorithm', () => {
  // Progressive disclosure: the always-paid tier gets the conditions and the one call; the
  // dispatch prompt, the preconditions and the report wording are pay-on-read.
  const body = step8();
  assert.match(body, /references\/memory-resync\.md`, "End-of-Flow Re-Sync"/,
    'the pointer must name the section, so a reader knows what to look for');
  assert.doesNotMatch(body, /You are a memory-sync worker/,
    'the dispatch prompt belongs to the reference — restating it here is paid every invocation');
  assert.match(RESYNC, /^## End-of-Flow Re-Sync \(feature-scoped, automatic\)$/m,
    'the pointed-at section must exist in the destination');
});

test('the reference states the automatic-vs-ask split between the two gates', () => {
  const start = RESYNC.indexOf('## End-of-Flow Re-Sync');
  const section = RESYNC.slice(start, RESYNC.indexOf('\n## ', start + 1));

  assert.match(section, /Discard skips this gate/,
    'the reference is where the reason lives, and the reason is what survives rewording');
  assert.match(section, /never prunes/,
    'a slug missing from the main root usually means "on another branch", not "gone"');
  assert.match(RESYNC, /\*\*automatic\*\* — the user's own feature/,
    'no question here: memory.persistent_memory is already the consent for the feature the user just built');
  assert.match(RESYNC, /\*\*asks\*\* — the changes may be artifacts other developers committed/,
    'the entry gate keeps asking — that is the behaviour the end-of-flow gate must not replace');
});

test('the entry gate is untouched — it still detects, asks, and latches', () => {
  // The end-of-flow gate ADDS a moment; it does not move one. A refactor that "simplified"
  // the entry gate away would leave a repo shared with other developers with no ask at all.
  assert.match(ENTRY, /### Memory Re-Sync Gate/);
  assert.match(ENTRY, /If dirty, ask the user\*\* in the configured language/);
  assert.match(ENTRY, /Set `session_resync_completed` = true|Set `session_resync_completed = true`/);
});

test('the --feature flag the prose calls is really implemented', () => {
  // The prose↔script coupling: a flag an unaware script ignores would sync the whole repo
  // silently, which is exactly what this gate must never do.
  assert.match(INVENTORY, /--feature\s+<slug>/, 'the script must document the flag');
  assert.match(INVENTORY, /featureFilter/, 'the script must implement the filter');
});
