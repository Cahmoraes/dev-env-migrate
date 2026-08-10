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

    // It must read the preference deterministically from a script, never from
    // recollection. derive-session-state.cjs is that script: it loads the same YAML
    // through read-preferences.cjs's in-process loader and emits `preferencesFound`
    // (= `found`) and `session_auto_commit` (= `workflow.auto_commit`). The gate reads
    // THOSE, so the Step 2 re-entry guard's single call covers it.
    assert.match(
      src,
      /derive-session-state\.cjs/,
      'the gate must read the preference via derive-session-state.cjs (the deterministic loader)',
    );
    for (const field of ['preferencesFound', 'session_auto_commit']) {
      assert.match(
        src,
        new RegExp(`\\b${field}\\b`),
        `the gate must name ${field} — the field it actually branches on`,
      );
    }

    // Anti-regression for the token-optimization pass: the gate must NOT re-introduce
    // a second, redundant read-preferences.cjs INVOCATION. Naming the script in prose
    // (to state the field equivalence) is fine; ordering a `scripts/read-preferences.cjs`
    // run is the duplicate call that was removed — derive-session-state.cjs already
    // parsed that exact file moments earlier in the same step.
    assert.doesNotMatch(
      src,
      /scripts\/read-preferences\.cjs/,
      'the gate must not invoke read-preferences.cjs again — derive-session-state.cjs already returned found/auto_commit/language',
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
    // verbatim in English is the drift this locks. The gate reads the language off the
    // same derive-session-state.cjs output as the rest of Step 2 — `session_language`
    // IS `communication.language` — and renders the conflict + options in it.
    // The English prose stays as the gate's *structure*, never printed verbatim.
    assert.match(
      src,
      /session_language/,
      'the gate must render its conflict and options in session_language, not hard-coded English',
    );
    assert.match(
      src,
      /communication\.language/,
      'the gate must anchor session_language to the communication.language preference it derives from',
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
