'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (relative) => fs.readFileSync(path.join(SKILLS, relative), 'utf8');

test('missing configured toolchain blocks verification instead of degrading to static review', () => {
  const body = read('super.verification-before-completion/SKILL.md');

  assert.match(
    body,
    /exit 126/i,
    'a non-executable command must be named explicitly',
  );
  assert.match(
    body,
    /\b127\b[\s\S]*NOT_RUN[\s\S]*BLOCKED/i,
    'a command that cannot start must produce a blocked verification result',
  );
  assert.match(
    body,
    /static (?:review|inspection)[\s\S]*never (?:replaces|substitutes for)\s+executable verification/i,
    'static inspection must not be accepted as proof that executable behavior passes',
  );
});

test('sequential execution cannot mark a task done after unavailable verification', () => {
  const body = read('super.subagent-driven-development/SKILL.md');

  assert.match(
    body,
    /configured verification command is unavailable[\s\S]*do not mark the task `DONE`/i,
    'the controller must preserve the incomplete tracker state when the gate cannot run',
  );
  assert.match(
    body,
    /configured verification command is unavailable[\s\S]*do not[\s\S]*advance/i,
    'the controller must stop instead of moving to a later task after NOT_RUN',
  );
});

test('implementer treats tracker metadata as read-only and reports missing toolchain as blocked', () => {
  const body = read('super.subagent-driven-development/agents/implementer.md');

  assert.match(
    body,
    /task file and tasks index are read-only[\s\S]*never edit[\s\S]*status or[\s\S]*checkboxes/i,
    'only the controller may update the authoritative task tracker',
  );
  assert.match(
    body,
    /configured verification command is unavailable[\s\S]*report `BLOCKED`/i,
    'the implementer must not return DONE based only on static review',
  );
});
