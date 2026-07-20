'use strict';

/**
 * await-not-poll.test.cjs — cross-skill contract lock.
 *
 * Two real sessions (estudo-clean-arch-solid-ddd) reproduced the same defect: after
 * dispatching background/parallel subagents, the orchestrator tried to BUSY-POLL their
 * completion with a `ScheduleWakeup`/timer and emitted a malformed call (`prompt` is
 * required when `stop` is not true), erroring mid-flow. Root cause was prose that said
 * "dispatch ... then collect/await" while staying silent on HOW to await — so the model
 * improvised a poll. The harness already re-invokes the orchestrator when background
 * work finishes, so polling is always wrong.
 *
 * Every place a superpowers orchestrator dispatches subagents and then waits for them
 * must state the invariant explicitly: await the harness re-invocation, never sleep or
 * schedule a wakeup/timer to poll. This test pins that guard across ALL such flows so a
 * future edit cannot silently drop it from one skill.
 *
 * Run: node --test super.dispatching-parallel-agents/scripts/__tests__/await-not-poll.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

// Every dispatch-and-await point in the pipeline. Adding a new parallel/background
// dispatch flow? Add its file here and give it the same guard.
const DISPATCH_AND_AWAIT_FILES = [
  'super.dispatching-parallel-agents/SKILL.md',
  'super.parallel-subagent-development/references/wave-execution.md',
  'super.parallel-subagent-in-tree/references/integration-barrier.md',
  'super.user-story-verification/SKILL.md',
  'super.writing-plans/SKILL.md',
  'super.deep-research/references/research-execution.md',
  'super.brainstorming/SKILL.md',
  'super.brainstorming/references/diagram-enrichment.md',
  'super.subagent-driven-development/SKILL.md',
  'super.using-superpowers/references/memory-resync.md',
];

for (const rel of DISPATCH_AND_AWAIT_FILES) {
  test(`${rel} forbids polling background subagents (await, never poll)`, () => {
    const body = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    // The load-bearing prohibition: no wakeup/timer to poll dispatched work.
    assert.match(body, /schedule a wakeup\/timer/i,
      `${rel} must explicitly forbid scheduling a wakeup/timer to poll dispatched subagents`);
    // The positive instruction: wait for the harness to re-invoke you.
    assert.match(body, /re-invokes you/i,
      `${rel} must tell the orchestrator the harness re-invokes it when subagents return`);
    // The rationale: busy-polling harness-tracked work is wasted.
    assert.match(body, /busy-polling harness-tracked/i,
      `${rel} must state why polling is wrong (harness-tracked work re-invokes automatically)`);
  });
}
