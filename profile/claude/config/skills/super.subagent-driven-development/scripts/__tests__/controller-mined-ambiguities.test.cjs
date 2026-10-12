'use strict';
// Four ambiguities a real Claude Code run (2026-09-22, 12 tasks, sonnet controller) hit with only
// SKILL.md in context — it opened no reference. Each rule has to be readable where the controller
// acts, so each is pinned in SKILL.md (and in the subagent prompt that carries the other half).
//   1. the ledger path: the controller derived `<plans>/progress.md` and appended there;
//   2. the `--verify` command: it ran `find` before every DONE to guess the test file;
//   3. a destructive command: consent relayed to the implementer was refused twice;
//   4. `review_final: false` read as "no final code review".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SKILL = read('SKILL.md');
const IMPLEMENTER = read('agents/implementer.md');

test('the ledger is the path sdd-start returns, never one the controller derives', () => {
  assert.match(SKILL, /the file at `ledger\.path` in the start call's output, never a path you derive/);
});

test('--verify re-runs the GREEN command the implementer reported, from its directory', () => {
  assert.match(SKILL, /`<test command>` is the GREEN command in the implementer's `reportFile`, run from the directory it ran in/);
  assert.match(IMPLEMENTER, /GREEN — the focused command, runnable\s+as-is, with the directory it ran in/);
});

test('a destructive command is asked once and run by the controller, never relayed to a subagent', () => {
  assert.match(SKILL, /\*\*BLOCKED:\*\* on a destructive operation .*ask the user once; approved, run that one command yourself/);
  assert.match(IMPLEMENTER, /\*\*Destructive operations are not yours to run\.\*\*/);
  assert.match(IMPLEMENTER, /report `BLOCKED` naming the exact command/);
});

test('review_final never turns the final code review off', () => {
  assert.match(SKILL, /\*\*Final code review\*\* over the whole integrated implementation, always dispatched — `review_final` only adds the opt-in native pass on top, it never turns this gate off/);
  assert.match(read('references/final-stage.md'), /`review_final: false` drops only the extra pass — this reviewer is dispatched either way/);
});
