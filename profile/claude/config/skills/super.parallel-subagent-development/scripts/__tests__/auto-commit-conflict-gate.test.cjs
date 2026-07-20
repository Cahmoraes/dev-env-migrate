'use strict';

/**
 * Contract test: the two parallel execution modes carry an ACTIVE auto-commit
 * conflict gate in their Step 2, not just a passive prose callout.
 *
 * Background — the bug this locks:
 *   The parallel modes commit per wave / per task by design and structurally
 *   cannot honor `workflow.auto_commit: false`. The ONLY active warning used to
 *   live in the election handoff message. But both skills can be entered
 *   directly — invoked standalone, or via a named-mode triage handoff — with the
 *   election phase (and its warning) skipped. A user who set `auto_commit: false`
 *   then saw the mode commit anyway, silently. The passive callout even *assumed*
 *   the election had warned ("The election handoff already warns about this"),
 *   which is false on the bypass paths.
 *
 * The fix adds a Step 2 gate that reads the preference deterministically and
 * STOPs for explicit consent before any dispatch, regardless of entry path.
 *
 * These are prose-in-SKILL.md invariants (no script owns them), so this test
 * grades the raw bytes — the same rationale as the cross-skill await-not-poll
 * enumeration test.
 *
 * Run: node --test super.parallel-subagent-development/scripts/__tests__/auto-commit-conflict-gate.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.resolve(__dirname, '..', '..', '..');

const SKILLS = [
  {
    name: 'super.parallel-subagent-development',
    skillMd: path.join(SKILLS_DIR, 'super.parallel-subagent-development', 'SKILL.md'),
    // per-task commit shape
    commitShape: /per task/i,
  },
  {
    name: 'super.parallel-subagent-in-tree',
    skillMd: path.join(SKILLS_DIR, 'super.parallel-subagent-in-tree', 'SKILL.md'),
    // per-wave commit shape
    commitShape: /per wave/i,
  },
];

for (const skill of SKILLS) {
  test(`${skill.name}: Step 2 has an active auto-commit conflict gate`, () => {
    const src = fs.readFileSync(skill.skillMd, 'utf8');

    // The gate is named, so prose can point at it from the callout.
    assert.match(
      src,
      /auto-commit conflict gate/i,
      'SKILL.md must name the "auto-commit conflict gate" so the passive callout can point at it',
    );

    // It must read the preference deterministically, not rely on session_* vars
    // (derive-session-state.cjs does NOT emit auto_commit) or on memory.
    assert.match(
      src,
      /read-preferences\.cjs/,
      'the gate must read the preference via read-preferences.cjs (auto_commit is not a session_* var)',
    );

    // It must be an active STOP, not a passive note.
    assert.match(src, /\bSTOP\b/, 'the gate must STOP before dispatching, not just warn in prose');

    // It must offer the escape hatch: switch to the sequential mode that honors the preference.
    assert.match(
      src,
      /super\.subagent-driven-development/,
      'the gate must offer switching to super.subagent-driven-development (the mode that honors auto_commit: false)',
    );

    // It must forbid silent commits under the preference.
    assert.match(
      src,
      /never commit silently under `auto_commit: false`/i,
      'the gate must forbid committing silently under auto_commit: false',
    );

    // Mode-correct commit shape must appear in the gate wording.
    assert.match(
      src,
      skill.commitShape,
      `the gate must describe this mode's commit shape (${skill.commitShape})`,
    );
  });

  test(`${skill.name}: passive callout no longer assumes the election warned`, () => {
    const src = fs.readFileSync(skill.skillMd, 'utf8');

    // Regression guard: the old parenthetical shifted responsibility to the
    // election handoff, which is skipped on standalone / named-mode entry.
    assert.doesNotMatch(
      src,
      /election handoff already warns about this/i,
      'the passive callout must not claim the election handoff already warned — it is skipped on direct entry',
    );

    // The callout should now point at the Step 2 gate instead.
    assert.match(
      src,
      /auto-commit conflict gate surfaces this before any dispatch/i,
      'the callout must point at the Step 2 gate as the surfacing mechanism',
    );
  });

  test(`${skill.name}: gate renders in the session language, not hard-coded English`, () => {
    const src = fs.readFileSync(skill.skillMd, 'utf8');

    // The whole thread may be non-English (e.g. pt-BR). A consent gate surfaced
    // verbatim in English is the drift this locks. The gate already reads
    // read-preferences.cjs, which returns communication.language — the fix reuses
    // that same value to render the conflict + options in the session language.
    // The English prose stays as the gate's *structure*, never printed verbatim.
    assert.match(
      src,
      /communication\.language/,
      'the gate must render its conflict and options in the session communication.language, not hard-coded English',
    );
  });
}

test('super.subagent-driven-development: carries the canonical user-facing-language rule', () => {
  // The single normative statement the execution skills' consent gates defer to.
  // Lives beside the Branch Guard (the shared consent gate) so every mode reads it.
  const src = fs.readFileSync(
    path.join(SKILLS_DIR, 'super.subagent-driven-development', 'SKILL.md'),
    'utf8',
  );
  assert.match(
    src,
    /User-facing language/i,
    'subagent-driven-development must carry the canonical User-facing language rule',
  );
  assert.match(
    src,
    /communication\.language/,
    'the canonical rule must anchor on communication.language',
  );
});
