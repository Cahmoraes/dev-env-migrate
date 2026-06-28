'use strict';

/**
 * Prose-guard: the "Conformidade com as Skills Padrão" guidance must instruct the
 * planner to EXCLUDE `super.*`-prefixed skills from a task's compliance list.
 *
 * Why: every `super.*` skill is pipeline machinery the execution flow already runs
 * as a per-task gate (super.verification-before-completion, super.test-driven-
 * development, …). Listing one in the task file makes the implementer invoke it a
 * SECOND time — duplicate work and wasted tokens. The compliance section is only
 * for domain/code skills. If a future edit drops the filter rule, these fail.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/skill-compliance-filter.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLANS = path.resolve(__dirname, '..', '..'); // .../super.writing-plans

// Files that carry the compliance-section guidance.
const GUIDANCE = [
  'SKILL.md',
  'templates/task-file-template.md',
  'references/self-review-checklist.md',
];

for (const rel of GUIDANCE) {
  test(`${rel}: instructs excluding super.* skills from the compliance list`, () => {
    const body = fs.readFileSync(path.join(PLANS, rel), 'utf8');
    assert.match(
      body,
      /super\.\*/,
      `${rel} must mention the super.* prefix as the filter for the compliance section`,
    );
    // Must frame super.* as something to drop/exclude/filter, not to list.
    assert.match(
      body,
      /(exclude|filter out|drop|remove|no `?super\.).*super|super.*(pipeline|gate|already run|duplicat)/is,
      `${rel} must explain that super.* skills are excluded because the flow already runs them`,
    );
  });
}

test('the guidance names verification-before-completion as a flow gate, not a listable skill', () => {
  // It is the canonical example of the duplication the filter prevents.
  const skill = fs.readFileSync(path.join(PLANS, 'SKILL.md'), 'utf8');
  assert.match(skill, /super\.verification-before-completion/);
});
