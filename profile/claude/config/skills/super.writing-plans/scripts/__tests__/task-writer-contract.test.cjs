'use strict';

/*
 * The task writer authors documents; it never builds. Measured 2026-09-15 on a Copilot session
 * (claude-sonnet-5 writer): to "confirm the expected output" it implemented every task in the
 * working tree, ran vitest/tsc/biome, wrote probe tests and reverted with `git checkout` —
 * 299 tool calls, 32M tokens, 41 minutes for five task files — and the implementer redid all of
 * it at execution. Two pieces of prose licensed it: "real expected outputs" in the step pattern
 * and "Run the command once and read the file count in its output before you write it into the
 * plan". The boundary now lives in `agents/task-writer.md`; the file-count check moved to the
 * research subagent, which is read-only by contract.
 *
 * The plan-document-reviewer (an 8.6-minute, 2.5M-token second read of the same plan) was
 * removed in the same pass: the deep review of spec and tasks is option 0 of the handoff,
 * chosen by the user because it costs credits.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(SKILL, relative), 'utf8');

test('the writer contract exists, is a dispatch block, and states the read/write boundary', () => {
  const contract = read('agents/task-writer.md');
  assert.match(contract, /^Subagent \(general-purpose\):/m, 'the contract carries a declarative dispatch block');
  assert.match(contract, /\*\*writes only\*\* `docs\/superpowers\/<feature-name>\/plans\/task-NN\.md`/);
  assert.match(contract, /\*\*never\*\* creates, edits or reverts any other file/);
  assert.match(contract, /\*\*never runs\*\* the project's test runner, typecheck, build, formatter or linter/);
  assert.match(contract, /not from a captured run/, 'Expected: lines are derived, not measured');
  assert.match(contract, /writes that uncertainty \*\*into the task\*\* as an explicit first step for the implementer/);
  assert.match(contract, /\*\*withhold the shell\*\*/, 'where tools can be scoped, the boundary is mechanical');
  // The prompt itself carries the boundary for platforms that cannot scope tools.
  const prompt = contract.slice(contract.indexOf('prompt: |'));
  assert.match(prompt, /You author documents\. You do not build/);
  assert.match(prompt, /never run the test runner, typecheck, build, linter or formatter, never write a probe/);
});

test('the step pattern no longer tells the writer to run the runner', () => {
  const pattern = read('references/required-task-step-pattern.md');
  assert.doesNotMatch(pattern, /Run the command once and read the \*\*file\s+count\*\*/, 'the sentence that licensed running the suite must stay out');
  assert.doesNotMatch(pattern, /real expected outputs/, '"real" reads as "measured" — the outputs are derived');
  assert.match(pattern, /the writer never runs the runner to check it/);
  assert.match(pattern, /derived by reading, never captured by running the step yourself/);
});

test('the narrowing check moved to the read-only research subagent', () => {
  const research = read('references/research-subagent-prompt.md');
  assert.match(research, /narrowest per-file form for EVERY test kind/);
  assert.match(research, /run each\s+form once against one existing test file and report the number of files it collected/);
  assert.match(research, /a form you did not run is reported as unverified/);
});

test('entry-phase and SKILL.md point at the contract; the plan reviewer is gone', () => {
  assert.match(read('references/entry-phase.md'), /\*\*Dispatch with the contract in `\.\.\/agents\/task-writer\.md`\.\*\*/);
  const skill = read('SKILL.md');
  assert.match(skill, /`\.\/agents\/task-writer\.md` — it authors documents and never builds, tests or reverts anything/);
  assert.match(skill, /No further reviewer is dispatched here/);
  assert.doesNotMatch(skill, /plan-document-reviewer|high-stakes plan|independent second opinion/);
  assert.ok(!fs.existsSync(path.join(SKILL, 'agents', 'plan-document-reviewer.md')), 'the plan reviewer contract was removed; the deep review is handoff option 0');
});
