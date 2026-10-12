'use strict';

/**
 * qa-dispatch-contract.test.cjs — the QA gate relays dispatches the script built, and the
 * per-story prompt lives in exactly one place: agents/qa-story-verifier.md.
 *
 * Measured (Claude Code, haiku controller, n=3, 2026-09-11):
 *   - prose only: one subagent per story 3/3, but `model:` omitted on 6/6 dispatches.
 *   - script printing the full rendered block (~7 KB per story) to stdout: model 1/3 — the
 *     controller narrated the block as text in one run and retyped the prompt without `model:`
 *     in another. A payload in the controller's thread gets re-emitted or acted on there.
 * Hence the script writes each rendered prompt to a file and the controller relays three
 * short fields: description, model, and a one-line prompt pointing at the file.
 *
 * Pinned here:
 *   1. Step 4 builds the dispatches with build-qa-dispatch.cjs and relays the emitted fields.
 *   2. SKILL.md no longer carries the per-story prompt (two copies = one of them stale).
 *   3. The template is a real dispatch block with a required model slot and all four tasks.
 *   4. The FAILED round's re-verify rebuilds the story's dispatch with --only, not by hand.
 *
 * Run: node --test super.user-story-verification/scripts/__tests__/qa-dispatch-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const template = fs.readFileSync(path.join(SKILL_DIR, 'agents', 'qa-story-verifier.md'), 'utf8');

function step4() {
  const start = skill.indexOf('### Step 4: Dispatch QA Subagents in Parallel');
  const end = skill.indexOf('### Step 5', start);
  assert.ok(start >= 0 && end > start, 'SKILL.md: could not isolate Step 4');
  return skill.slice(start, end);
}

test('Step 4 builds the dispatches with the script and relays the emitted fields', () => {
  const s = step4();
  assert.match(s, /<super\.user-story-verification-base-dir>\/scripts\/build-qa-dispatch\.cjs/,
    'Step 4 must invoke build-qa-dispatch.cjs by its owner path');
  assert.match(s, /its `description`, `model` and `prompt` exactly as emitted/,
    'the controller relays three short fields, not a rendered prompt it could retype');
  assert.match(s, /never with `model:` dropped/, 'the measured defect was the omitted model field');
  assert.match(s, /never written into your reply as text/,
    'a haiku controller narrated a rendered block as text instead of dispatching it');
  assert.match(s, /they are the subagent's to follow, never yours/,
    'the rendered instructions are the subagent\'s; a controller holding them executes them');
  assert.doesNotMatch(s, /`dispatches\[\]\.block`/, 'the block no longer travels through the controller');
});

test('SKILL.md no longer carries the per-story prompt', () => {
  assert.doesNotMatch(skill, /You are a QA verification subagent/,
    'the per-story prompt lives in agents/qa-story-verifier.md only; a second copy in SKILL.md drifts');
  assert.doesNotMatch(skill, /### Task [1-4] —/, 'the subagent tasks belong to the template');
});

test('the template is a dispatch block with a required model slot and all four tasks', () => {
  const m = template.match(/^```\n(Subagent \(QA[\s\S]*?)\n```$/m);
  assert.ok(m, 'agents/qa-story-verifier.md must carry a column-0 fenced `Subagent (QA ...)` block');
  const block = m[1];
  assert.match(block, /^ {2}model: \[REQUIRED/m, 'the model slot must be required, so the renderer has something to fill');
  assert.match(block, /^ {2}prompt: \|$/m);
  for (const heading of ['### Task 1 —', '### Task 2 —', '### Task 3 —', '### Task 4 —']) {
    assert.ok(block.includes(heading), `the prompt body lost ${heading} (rule outside prompt: | never reaches the subagent)`);
  }
});

test('the FAILED round re-verifies with the story\'s rebuilt dispatch', () => {
  const start = skill.indexOf('**If status is `FAILED`');
  assert.ok(start > 0, 'SKILL.md: FAILED branch missing');
  assert.match(skill.slice(start), /re-dispatch the story's QA subagent — its Step 4 dispatch, rebuilt with `--only <story-id>`/);
});
