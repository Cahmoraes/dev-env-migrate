'use strict';

/**
 * validate-tasks-single-call.test.cjs — the Self-Review validation step must read as ONE call
 * with an optional-flag choice, never as two runnable commands in sequence.
 *
 * Found by an adjacency sweep for redundant tool calls: the step showed a bare
 * `--tasks-index` snippet, then prose ("also pass --prd ... also pass --mockups"), then a second
 * snippet with the flags. The second call's output is a strict superset of the first, so a
 * literal reading runs the same validation twice — the same superset-redundancy family as the
 * batching work in 76fab53.
 *
 * The obvious fix (collapse to a single fully-flagged snippet) is WRONG and this test pins why:
 * `--prd` pointing at a path that does not resolve is a hard error that flips a perfectly valid
 * spec-only plan to `valid:false`. So the snippets must stay two *alternatives* — the doc has to
 * say "pick one", not "run both" and not "always use the full form".
 *
 * Run: node --test super.writing-plans/scripts/__tests__/validate-tasks-single-call.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const SKILL = path.join(SKILL_DIR, 'SKILL.md');
const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');
const body = fs.readFileSync(SKILL, 'utf8');

/** The `## Self-Review` section only — a file-wide match would pass on unrelated prose. */
function selfReviewSection() {
  const start = body.indexOf('## Self-Review');
  assert.notEqual(start, -1, 'SKILL.md must have a "## Self-Review" section');
  const end = body.indexOf('\n## ', start + 1);
  return body.slice(start, end === -1 ? body.length : end);
}

/**
 * Flatten blockquote wrapping before matching prose. The step lives inside a `>` block, so a
 * sentence can wrap as "...the barer one\n> does" — a naive regex then misses text that is
 * plainly there, and the test fails for a formatting reason rather than a real one.
 */
function flat(section) {
  return section.replace(/\n>\s?/g, ' ').replace(/[ \t]+/g, ' ');
}

test('the validation step is presented as one call, not a sequence of two', () => {
  const section = flat(selfReviewSection());

  assert.match(
    section,
    /alternatives, not a sequence/i,
    'the two snippets must be labelled alternatives, so neither is read as a follow-up call',
  );
  assert.match(
    section,
    /ONE call/,
    'the step must state the validation is a single call',
  );
});

test('the section warns that the fuller form subsumes the barer one', () => {
  const section = flat(selfReviewSection());
  assert.match(
    section,
    /already reports everything the barer one does/i,
    'the redundancy must be stated explicitly — that is what stops the double run',
  );
});

test('the section keeps both forms, because --prd is not safe to pass unconditionally', () => {
  const section = selfReviewSection();

  // Two snippets must survive: a bare one for spec-only plans and a flagged one.
  const snippets = section.match(/```bash[\s\S]*?```/g) || [];
  assert.equal(snippets.length, 2, 'the step must offer exactly two forms of the call');
  assert.ok(!snippets[0].includes('--prd'), 'the first form must be usable by a spec-only plan');
  assert.ok(snippets[1].includes('--prd'), 'the second form must show the PRD flag');

  assert.match(
    flat(section),
    /does not resolve is itself an error/i,
    'the doc must say why --prd cannot just always be passed',
  );
});

test('behaviour: --prd at a missing path fails a plan that is otherwise valid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-single-call-'));
  const plans = path.join(dir, 'plans');
  fs.mkdirSync(plans);
  fs.writeFileSync(
    path.join(plans, 'tasks-x.md'),
    '# Tasks: x\n\n## Tasks\n- [ ] 1. Do the thing → `task-01.md`\n',
  );
  fs.writeFileSync(
    path.join(plans, 'task-01.md'),
    '# Task 01\n\n**Status:** PENDING\n**PRD:** N/A\n**Spec:** spec.md\n'
      + '**Depends on:** none\n**Tier:** cheap\n\n## Arquivos\n- src/a.ts\n\n## Steps\n1. do it\n',
  );

  const run = (args) =>
    JSON.parse(execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }));

  const index = path.join(plans, 'tasks-x.md');

  const bare = run(['--tasks-index', index]);
  assert.equal(bare.valid, true, 'a spec-only plan must be valid without --prd');

  const withMissingPrd = run(['--tasks-index', index, '--prd', path.join(dir, 'prd', 'nope.md')]);
  assert.equal(
    withMissingPrd.valid,
    false,
    'passing --prd at a path that does not resolve must fail — this is why the bare form stays',
  );
  assert.ok(
    withMissingPrd.errors.some((e) => /Could not read PRD/.test(e.message)),
    'the failure must be the unreadable-PRD error the SKILL.md cites verbatim',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
