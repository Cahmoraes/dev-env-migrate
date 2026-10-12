'use strict';

/**
 * Prose-guard: an agent declared "read-only" must be bounded on the WRITE, and
 * a bounded effort must have a countable ceiling.
 *
 * Two measured failures from session 303caf93, same shape — a limit that was
 * true in spirit and absent as a mechanism:
 *
 * 1. READ-ONLY WITHOUT A SHELL BOUND. Every reviewer template says "no editing,
 *    no writing, no dispatching" — a statement about which TOOLS are granted.
 *    All of them then grant `Bash`, which writes. A code-quality reviewer duly
 *    ran `pnpm --filter frontend lint:fix` mid-review and reformatted the repo:
 *    it mutated the diff it was reviewing, invalidating its own verdict, and
 *    silently edited code the full-suite checkpoint had already validated.
 *
 * 2. OPTIONAL WORK WITHOUT AN ATTEMPT CAP. user-story-verification already says
 *    screenshots are optional and never block the gate. With no countable cap, a
 *    QA subagent spent 30 min and ~20 script invocations (plus a `sleep 70` and
 *    four throwaway debug scripts) fighting an auth wall for an artifact that
 *    could not change the verdict. "Optional" is a property of the OUTCOME; only
 *    a number bounds the EFFORT.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/readonly-agent-bounds.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

/** Every template that dispatches a subagent described as read-only. */
const READONLY_AGENTS = [
  'super.subagent-driven-development/agents/task-reviewer.md',
  'super.requesting-code-review/agents/code-reviewer.md',
];

test('the read-only agent roster is not silently shrinking', () => {
  // Anti-staleness floor: a renamed template would empty the sweep and pass forever.
  assert.ok(READONLY_AGENTS.length >= 2, 'roster shrank — re-derive it before trusting this file');
  for (const rel of READONLY_AGENTS) {
    assert.ok(fs.existsSync(path.join(SKILLS, rel)), `${rel} no longer exists — update the roster`);
  }
});

test('every read-only template says the bound is on the write, not on the tool', () => {
  for (const rel of READONLY_AGENTS) {
    const content = read(rel);
    assert.match(
      content,
      /Read-only is about the WRITE, not the tool/i,
      `${rel}: "no editing, no writing" describes the TOOLSET and is satisfied while Bash is granted — `
        + 'the observed reviewer ran lint:fix without contradicting a word of it',
    );
    assert.match(
      content,
      /`Bash` is a write tool/i,
      `${rel}: naming Bash as a write surface is the part that closes the loophole`,
    );
  }
});

test('every read-only template names the mutating commands it forbids', () => {
  // A category ("do not mutate") is easy to reason around; the observed command
  // was a project script the model considered routine hygiene. Name the shapes.
  for (const rel of READONLY_AGENTS) {
    const content = read(rel);
    for (const forbidden of ['lint:fix', 'format', '--write', 'build', 'git add']) {
      assert.ok(
        content.includes(forbidden),
        `${rel}: the prohibition must name \`${forbidden}\` — the reviewer that broke this ran a named project script`,
      );
    }
  }
});

test('every read-only template says findings are reported, never applied', () => {
  for (const rel of READONLY_AGENTS) {
    assert.match(
      read(rel),
      /Findings are \*\*reported\*\*, never applied/i,
      `${rel}: without this, "fix the trivial ones while you are here" is the obvious next step`,
    );
  }
});

/** Templates that carry their OWN dispatch block. */
const SELF_CONTAINED_DISPATCH = [
  ['super.requesting-code-review/agents/code-reviewer.md', '{PLAN_OR_REQUIREMENTS}'],
  ['super.subagent-driven-development/agents/task-reviewer.md', '- **Task file:** {TASK_FILES}'],
];

test('the read-only bound sits INSIDE the dispatched prompt, ahead of the pasted plan', () => {
  // Measured, not assumed. With the bound above `prompt: |` — framing addressed to the
  // controller, which cannot express "no lint:fix" through a toolset — two reviewer probes
  // ran `lint:fix`, `tsc:check` and an unscoped suite, and cited "412 passed" as a strength
  // while reviewing a two-file diff. Moving the same words below `prompt: |` and ahead of
  // the pasted plan took both to zero package-script invocations, with longer reviews.
  // Position is the mechanism; presence in the file is not.
  assert.ok(SELF_CONTAINED_DISPATCH.length >= 2, 'roster shrank — re-derive it before trusting this file');
  for (const [rel, planMarker] of SELF_CONTAINED_DISPATCH) {
    const content = read(rel);
    const promptStart = content.indexOf('prompt: |');
    const planStart = content.indexOf(planMarker);
    const boundStart = content.indexOf('bound is on the WRITE, not on the tool', promptStart);
    assert.ok(promptStart > -1, `${rel}: no \`prompt: |\` — the dispatch block moved, re-derive this test`);
    assert.ok(planStart > promptStart, `${rel}: could not find ${planMarker} inside the prompt body`);
    assert.ok(
      boundStart > promptStart,
      `${rel}: the bound is outside the dispatched prompt — the subagent never receives it, `
        + 'and the controller can only withhold tools, which cannot forbid a shell command',
    );
    assert.ok(
      boundStart < planStart,
      `${rel}: the bound must precede ${planMarker} — the pasted plan carries "run lint:fix" and `
        + '"run the full suite" as success criteria, and the reviewer reads them as its own checklist',
    );
  }
});

test('the dispatched bound names roles, not one stack\'s tools', () => {
  // superpowers runs against whatever the consuming repo uses — ESLint or Biome, tsc or
  // mypy or `go build`, npm or bun. A bound written as "no `biome:fix`, no `tsc:check`"
  // reads as inapplicable in a Python or Go repo, which is worse than vague: the reviewer
  // concludes the rule is not about its stack. Name the ROLE, keep examples as examples.
  for (const [rel] of SELF_CONTAINED_DISPATCH) {
    const content = read(rel);
    const block = content.slice(content.indexOf('prompt: |'));
    for (const coupled of ['biome:fix', 'tsc:check', 'lint:fix']) {
      assert.ok(
        !block.includes(coupled),
        `${rel}: the dispatched prompt names \`${coupled}\`, a JS/npm-script spelling, as the rule. `
          + 'State the role (formatter in fix mode / typecheck step) and leave tool names as examples',
      );
    }
    assert.match(block, /formatter or linter in FIX mode/u, `${rel}: the role has to be named, or the rule has no referent outside JS`);
    assert.match(block, /typecheck\/compile step/u, `${rel}: same for the typecheck step`);
    // Anti-monoculture floor, applied PER LIST. Counting across the whole block lets one
    // list go all-JS while the other keeps the total up — a mutant that swapped the
    // formatter examples for `xo --fix`/`standard --fix` survived exactly that way.
    const NON_JS = ['ruff', 'gofmt', 'cargo', 'mypy', 'mix ', 'go build', 'rubocop', 'black'];
    const listOf = (from, to) => block.slice(block.indexOf(from), typeof to === 'string' ? block.indexOf(to) : block.search(to));
    for (const [label, from, to] of [
      ['formatter', 'formatter or linter in FIX mode', 'Build, codegen'],
      ['typecheck', 'typecheck/compile step', /Both r[au]n at the full-suite checkpoint/],
    ]) {
      const list = listOf(from, to);
      const found = NON_JS.filter((t) => list.includes(t));
      assert.ok(
        found.length >= 2,
        `${rel}: the ${label} examples name ${found.length} non-JS ecosystem(s) — a JS-only list `
          + 'reads as a JS-only rule, and this framework runs against Python, Go and Rust repos too',
      );
    }
  }
});

test('the dispatched prompt tells the reviewer the plan is not its checklist', () => {
  for (const [rel] of SELF_CONTAINED_DISPATCH) {
    assert.match(
      read(rel),
      /instruction sheet, not yours/u,
      `${rel}: naming WHOSE checklist it is beats a bare prohibition — the reviewer that broke this `
        + 'was following the task\'s own "Critérios de Sucesso", not defying an instruction',
    );
  }
});

test('the QA screenshot task carries a countable attempt cap', () => {
  const usv = read('super.user-story-verification/agents/qa-story-verifier.md');
  const task3 = usv.slice(usv.indexOf('### Task 3 — Capture UI Screenshot'), usv.indexOf('### Task 4'));
  assert.ok(task3.length > 0, 'Task 3 (screenshot capture) is missing');
  assert.match(
    task3,
    /Cap: 3 capture attempts/,
    'the cap must be a NUMBER inside the task the subagent is given — "optional" bounds the outcome, '
      + 'not the effort, and the measured run burned 30 min proving that',
  );
  assert.match(
    task3,
    /one attempt = navigate → capture/i,
    'an uncounted "attempt" is unbounded by redefinition: the observed subagent wrote four different '
      + 'capture scripts and could call that one attempt',
  );
});

test('the QA cap names the landing, so stopping is not read as giving up', () => {
  const usv = read('super.user-story-verification/agents/qa-story-verifier.md');
  const task3 = usv.slice(usv.indexOf('### Task 3 — Capture UI Screenshot'), usv.indexOf('### Task 4'));
  assert.match(task3, /leave `screenshot_path` null/, 'the cap must say what to WRITE on giving up, or the subagent keeps trying');
  assert.match(
    task3,
    /mark the story `PARTIAL` per the Status guide/,
    'a smoke run caught this: told only that the shot "never changes gate status", the subagent '
      + 'marked the story PASSED. It does not block the GATE, but the Status guide degrades the '
      + 'STORY to PARTIAL — the cap has to name the landing status, not just permit stopping',
  );
  assert.match(
    task3,
    /Normal outcome, not a wall to push through/i,
    'a cap without permission to stop is a cap the model treats as a hint',
  );
  assert.match(task3, /No throwaway debug scripts/i, 'the observed escape hatch was writing debug-*.cjs one after another');
});
