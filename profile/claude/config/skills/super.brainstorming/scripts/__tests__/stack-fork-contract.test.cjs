#!/usr/bin/env node
'use strict';
/*
 * stack-fork-contract.test.cjs — the brainstorming asks the stack when nobody knows it.
 *
 * The project profile (preferences `project:`) can be declared and empty ("not decided yet" at
 * onboarding) or absent on a repo with no manifest. In both states every downstream skill would
 * otherwise inherit a guess. The interview owns the question; this pins where the rule lives,
 * that it fires only when the stack is really unknown, and that the answer is persisted through
 * the same detector + writer the wizard uses (one mechanism, not a second table of commands).
 *
 * Run: node --test super.brainstorming/scripts/__tests__/stack-fork-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

test('SKILL.md step 3 points at the stack fork inside the compaction window', () => {
  const md = read('SKILL.md');
  const at = md.indexOf('**Stack unknown**');
  assert.ok(at > 0, 'step 3 must carry the pointer');
  assert.ok(at < 20000, 'the pointer must sit inside the re-attach window');
  assert.match(md.slice(at, at + 300), /interview-process\.md`, "Stack fork", "Framework fork"/);
});

test('a known stack does not settle the framework: the reference asks it, never presents it decided', () => {
  const md = read('SKILL.md');
  assert.match(md, /\*\*framework open\*\* \(manifest silent\)/, 'step 3 must route the framework fork too');
  const ref = read('references/interview-process.md');
  const section = ref.slice(ref.indexOf('id="framework-fork"'), ref.indexOf('id="framework-fork"') + 2200);
  assert.match(section, /a framework dependency already declared there is a \*\*fact\*\* \(state it, never ask\)/);
  assert.match(section, /before the architecture section/);
  assert.match(section, /at most four options/);
  assert.match(section, /never presented already decided inside the design sections/);
  assert.match(section, /The runner is not a question/);
  assert.match(section, /the spec's Testes section must \*\*name\*\* it/);
  // The spec self-review closes the same end from the other side (design-spec-structure item 7).
  const structure = read('references/design-spec-structure.md');
  assert.match(structure, /^7\. \*\*The Testes section names the test runner/m);
});

test('the reference fires only when the stack is unknown, and treats a known stack as a fact', () => {
  const ref = read('references/interview-process.md');
  const section = ref.slice(ref.indexOf('id="stack-fork"'));
  assert.match(section, /`declared: true` with `stack` empty/);
  assert.match(section, /`declared: false` \*\*and\*\* `node <super\.using-superpowers-base-dir>\/scripts\/detect-project\.cjs --repo-root <project-repo-root>` answers `detected: false`/);
  assert.match(section, /the stack is a \*\*fact\*\*: state it in one clause and move on — never ask what the repo already answers/);
  assert.match(section, /\*\*first\*\* clarifying question/);
  assert.match(section, /at most four options/);
});

test('the answer is persisted through detect-project --stack and write-preferences, only after confirmation', () => {
  const ref = read('references/interview-process.md');
  const section = ref.slice(ref.indexOf('id="stack-fork"'));
  assert.match(section, /detect-project\.cjs --stack <name>/);
  assert.match(section, /write-preferences\.cjs --repo-root <project-repo-root>/);
  assert.match(section, /"project": \{ "stack": "<stack>", "manifest": "<manifest>" \}/);
  assert.doesNotMatch(section, /test_command|setup_command|ui_file_globs|format_command/, 'commands are not preferences');
  assert.match(section, /An unconfirmed suggestion is never written/);
  assert.match(section, /Persist the answer the moment it is confirmed/);
});
