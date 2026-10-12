'use strict';

/*
 * single-implementer-mode.test.cjs — option 3 at the execution gate: one implementer subagent
 * runs every task, no reviewer between tasks, the final stage unchanged.
 *
 * Measured 2026-09-20 on a real four-task chain: per-task reviewers found no Critical or
 * Important finding the whole-branch final review missed, at 4-7x its cost. The mode banks
 * that finding as an OPT-IN: it is offered only when the parser marks the plan eligible, it
 * is never tagged (recommended), the headless fallback never picks it, and the controller
 * still never implements — it dispatches one agent instead of N and then runs the same
 * final stage. These guards pin the prose on each side of that contract.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/single-implementer-mode.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const SDD = 'super.subagent-driven-development';
const MODE = `${SDD}/references/single-implementer-mode.md`;
const AGENT = `${SDD}/agents/whole-plan-implementer.md`;
const SKILL = `${SDD}/SKILL.md`;
const ROUTING = `${SDD}/references/entry-routing.md`;
const TAIL = `${SDD}/references/final-stage.md`;
const HANDOFF = 'super.writing-plans/references/execution-handoff-message.md';
const GATES = 'super.using-superpowers/references/session-state-and-gates.md';
const SESSION_START = 'super.using-superpowers/references/session-start.md';
const DIAGRAM = 'super.using-superpowers/assets/state-diagram.mmd';

test('the handoff renders option 3 only when the parser marks the plan eligible, and never tags it', () => {
  const handoff = read(HANDOFF);
  assert.match(handoff, /\*\*3\. Single implementer\*\* — \*render this line only when `singleImplementer\.eligible` is `true`; otherwise omit it entirely\.\*/);
  assert.match(handoff, /\*\*Option 3 is never tagged\.\*\*/);
  assert.match(handoff, /no reviewer between tasks/);
  assert.match(handoff, /option 3 → invoke `super\.subagent-driven-development` with the index path and `--single`/);
  assert.match(handoff, /"eligible": true\|false/, 'Step 1 documents the field the option keys off');
});

test('the router paths carry the same conditional option and the fallback never picks it', () => {
  const gates = read(GATES);
  assert.match(gates, /plus 3 Single implementer only when `singleImplementer\.eligible` is true \(never tagged\)/);
  assert.match(gates, /the fallback never picks 3/);
  assert.match(read(SESSION_START), /plus single implementer \(3, never tagged\) when `singleImplementer\.eligible` is\s+true/);
});

test('the mode is entered by --single or answer 3, re-checks eligibility, and STOPs back to the gate otherwise', () => {
  const mode = read(MODE);
  assert.match(mode, /The user answered \*\*3\*\* at the execution gate, or invoked this skill with `--single`/);
  assert.match(mode, /It is never the recommended mode/);
  assert.match(mode, /`singleImplementer\.eligible: true` → proceed\./);
  assert.match(mode, /`false` → \*\*STOP\.\*\* Say which reason in `singleImplementer\.reasons\[\]` blocks it[\s\S]*re-open the execution gate with options 0\/1 only/);
  assert.match(mode, /Never downgrade the\s+blocking task's review to run the plan anyway/);
});

test('the controller dispatches once, waits, never implements, and runs the unchanged final stage', () => {
  const mode = read(MODE);
  assert.match(mode, /you never implement; you dispatch one implementer instead of N/);
  assert.match(mode, /\*\*After dispatching, await its result — never poll\.\*\*/);
  assert.match(mode, /`model:` resolved from `session_model_tier_standard`/);
  assert.match(mode, /never implement task N yourself/);
  assert.match(mode, /Then `\.\/final-stage\.md`, gate 1 onward, unchanged/);
  assert.match(read(TAIL), /the single-implementer mode \(`super\.subagent-driven-development --single`/);
  assert.match(read(TAIL), /never skips a gate here/);
});

test('the whole-plan implementer keeps the tracker through --verify, stops on BLOCKED and never dispatches', () => {
  const agent = read(AGENT);
  assert.match(agent, /^Subagent \(general-purpose\):/m, 'the dispatch block names the role and type');
  assert.match(agent, /model: \[REQUIRED: the model resolved from session_model_tier_standard/);
  assert.match(agent, /mark-task-status\.cjs --task-file <task-NN\.md> --status DONE --tasks-index <tasks-index> --task-number N --verify -- <test command>/);
  assert.match(agent, /DONE is written only when that run exits 0/);
  assert.match(agent, /Never skip a task, never reorder tasks, never/);
  assert.match(agent, /Stop at that task\. Do not\s+guess, do not patch around it, do not continue with later tasks/);
  assert.match(agent, /Never dispatch a subagent of your own/);
  assert.match(agent, /Failures seen \(any, incl\. pre-existing\)/);
  assert.doesNotMatch(agent, /reasonable person/, 'the reviewer standard is inert on an implementer');
});

test('SKILL.md, entry routing and the state diagram know the third mode', () => {
  const skill = read(SKILL);
  assert.match(skill, /argument-hint: "\[path-to-tasks-<feature>\.md\] \[--single\]"/);
  assert.match(skill, /\*\*`--single` after the index path \(answer 3 at the execution gate\)\*\* → one implementer subagent runs every task with no per-task reviewer: `\.\/references\/single-implementer-mode\.md` replaces the Execution Loop; the final stage is unchanged\./);
  assert.match(skill, /`\.\/references\/single-implementer-mode\.md` \(`--single`\)/, 'the recovery chain lists the reference');
  assert.match(read(ROUTING), /with `--single` after the index path, or after answer 3 at the gate, run `\.\/single-implementer-mode\.md`/);
  const diagram = read(DIAGRAM);
  assert.match(diagram, /EscolhendoModo --> ModoImplementadorUnico : opcao 3, opt-in/);
  assert.match(diagram, /ChecandoElegibilidade --> \[\*\] : false — STOP, reabre o gate 0\/1/);
  assert.match(diagram, /ModoImplementadorUnico --> \[\*\]/);
});
