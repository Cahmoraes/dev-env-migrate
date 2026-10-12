'use strict';

/**
 * await-not-poll.test.cjs — cross-skill contract lock.
 *
 * Two real sessions reproduced the same defect: after
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
  'super.user-story-verification/SKILL.md',
  'super.writing-plans/SKILL.md',
  'super.deep-research/references/research-execution.md',
  'super.brainstorming/SKILL.md',
  'super.brainstorming/references/diagram-enrichment.md',
  'super.subagent-driven-development/SKILL.md',
  // A subagent that dispatches is as exposed as a controller — more so: it improvised a
  // 558 s shell loop that matched nothing, three minutes past when its lenses had finished.
  'super.reviewing-specs/agents/review-lead.md',
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

// Presence is not survival. The guard above proved the prohibition exists in the file;
// it said nothing about WHERE. A compaction re-injects only the first 20.000 characters
// of an invoked SKILL.md, and a resumed run that sees pending background work is exactly
// the moment the poll gets improvised — so a prohibition sitting past the cut is a
// prohibition that is absent when it matters. Measured 2026-08-01: super.writing-plans
// carried it at char 24.050 and super.brainstorming at 26.042, both past the cap, and
// both are flows whose dispatch (research fan-out, sequential task writer) runs long
// enough to be compacted through. References are exempt: they are read in full on demand,
// so no cap applies to them.
const CAP = 20000;

for (const rel of DISPATCH_AND_AWAIT_FILES.filter((f) => f.endsWith('SKILL.md'))) {
  test(`${rel} keeps the await-never-poll guard inside the compaction window`, () => {
    const body = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    const at = body.search(/busy-polling harness-tracked/i);
    assert.ok(
      at >= 0 && at < CAP,
      `${rel} states the await-never-poll guard at char ${at}, past the ${CAP}-char compaction cut. `
      + 'A resumed run with subagents still pending is precisely when the poll gets improvised, '
      + 'and that is the run where this text no longer exists. Move it inside the window.',
    );
  });
}
