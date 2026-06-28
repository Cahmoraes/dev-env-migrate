'use strict';

/**
 * Prose-guard: after a context compaction that resumes DIRECTLY into an
 * execution skill (without re-entering super.using-superpowers), the skill must
 * re-derive the FULL session-variable set — not just caveman — and it must do so
 * by delegating to the deterministic single source of truth, not by hand-mapping
 * preferences in prose.
 *
 * Two bugs are locked out here:
 *   1. The caveman-only restore (the original silent-drop bug): only
 *      session_caveman_* was restored, so /simplify and the final /code-review
 *      defaulted off on resume. A default-false flag is indistinguishable from a
 *      deliberately-disabled one, so nothing warned.
 *   2. The duplicated mapping (the coupling bug): the "session_* ← preferences.X.Y"
 *      table was copied into every execution skill, so a new preference meant
 *      editing 4+ files, and platform-specific rows leaked one platform's detail
 *      into skills that may run on another. The mapping now lives only in
 *      derive-session-state.cjs; the execution guards just run it.
 *
 * The "full set is covered" invariant is asserted against the script itself in
 * derive-session-state.test.cjs (the SSOT), not re-checked per skill here.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/compaction-reentry-guard.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const CANONICAL = 'super.subagent-driven-development/SKILL.md';
const EXECUTION_SKILLS = [
  CANONICAL,
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
];

const SSOT_SCRIPT = 'derive-session-state.cjs';

// Hand-mapped preference paths must NOT appear in an execution skill's re-entry
// guard — that is the duplication/leak the SSOT script exists to remove.
const HANDMAP_LEAKS = ['preferences.claude_code', 'preferences.copilot', 'preferences.optimization.caveman'];

// ─── Canonical guard (subagent-driven-development) ───────────────────────────

test('canonical skill declares a § Session State Re-Entry Guard section', () => {
  assert.match(
    read(CANONICAL),
    /###\s+Session State Re-Entry Guard/,
    'subagent-driven-development must own the canonical Session State Re-Entry Guard',
  );
});

test('canonical guard runs BEFORE the Memory Gate and Caveman (ordering fix)', () => {
  const body = read(CANONICAL);
  const guard = body.indexOf('### Session State Re-Entry Guard');
  const memory = body.indexOf('### Memory Gate Check');
  const caveman = body.indexOf('### Caveman Mode Activation');
  assert.ok(guard >= 0 && memory >= 0 && caveman >= 0, 'all three sections must exist');
  assert.ok(
    guard < memory,
    'the re-entry guard must precede the Memory Gate — the gate reads session_memory_enabled, which the guard restores',
  );
  assert.ok(memory < caveman, 'Memory Gate stays before Caveman Activation');
});

function canonicalGuardRegion() {
  const body = read(CANONICAL);
  const start = body.indexOf('### Session State Re-Entry Guard');
  const end = body.indexOf('### Memory Gate Check', start);
  return body.slice(start, end);
}

test('canonical guard delegates to the single source of truth (derive-session-state.cjs)', () => {
  assert.ok(
    canonicalGuardRegion().includes(SSOT_SCRIPT),
    `the canonical guard must re-derive via ${SSOT_SCRIPT}, the single source of truth for the mapping`,
  );
});

test('canonical guard does not hand-map preferences (no duplicated mapping/leak)', () => {
  const region = canonicalGuardRegion();
  for (const leak of HANDMAP_LEAKS) {
    assert.ok(
      !region.includes(leak),
      `the canonical guard must not hand-map "${leak}" — the mapping belongs only in ${SSOT_SCRIPT}`,
    );
  }
});

// ─── All three execution skills delegate, none hand-map ──────────────────────

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: re-entry guard delegates to ${SSOT_SCRIPT}`, () => {
    const body = read(rel);
    const anchor = body.search(/Session State Re-Entry Guard|Re-entry guard/i);
    assert.ok(anchor >= 0, `${rel} must reference a session-state re-entry guard`);
    const region = body.slice(anchor, anchor + 2000);
    assert.ok(
      region.includes(SSOT_SCRIPT),
      `${rel} re-entry guard must restore the full set via ${SSOT_SCRIPT}, not a hand-written list`,
    );
  });

  test(`${rel}: re-entry guard does not hand-map platform preferences`, () => {
    const body = read(rel);
    const anchor = body.search(/Session State Re-Entry Guard|Re-entry guard/i);
    const region = body.slice(anchor, anchor + 2000);
    for (const leak of HANDMAP_LEAKS) {
      assert.ok(
        !region.includes(leak),
        `${rel} re-entry guard must not hand-map "${leak}" (platform leak / duplication)`,
      );
    }
  });
}

// ─── Router documents the variables and points at the SSOT script ────────────

test('router § Session State derives via the script and lists the variables', () => {
  const body = read('super.using-superpowers/SKILL.md');
  const start = body.indexOf('### Session State');
  assert.ok(start >= 0, 'router must have a § Session State section');
  const region = body.slice(start, start + 3000);
  assert.ok(region.includes(SSOT_SCRIPT), 'router § Session State must derive via derive-session-state.cjs');
  for (const v of ['session_simplify_enabled', 'session_code_review_final_enabled', 'session_copilot_review_final_enabled']) {
    assert.ok(region.includes(v), `router § Session State must still document ${v}`);
  }
});

// ─── Risk-hardening: the guard is UNCONDITIONAL on resume (no judgment gate) ──
// A guard that only re-derives "if a variable looks unknown" can be skipped when
// an agent wrongly believes it still knows the values — and a wiped default-false
// is indistinguishable from a configured false. The hardened guard always
// re-derives; these tests lock that the judgment-gated phrasing does not return.

const SKIP_GATE = /do not re-derive|is a no-?op|if (any|every)[\s\S]{0,40}session_\*[\s\S]{0,40}(unknown|already known)/i;

test('canonical guard re-derives unconditionally (no judgment gate)', () => {
  const region = canonicalGuardRegion();
  assert.match(region, /unconditional/i, 'canonical guard must state it runs unconditionally');
  assert.doesNotMatch(region, SKIP_GATE, 'canonical guard must not gate re-derivation on whether vars are known');
});

test('parallel-subagent-development inline guard re-derives unconditionally', () => {
  const body = read('super.parallel-subagent-development/SKILL.md');
  const anchor = body.search(/Session State Re-Entry Guard/i);
  const region = body.slice(anchor, anchor + 2000);
  assert.match(region, /unconditional/i, 'inline guard must state it runs unconditionally');
  assert.doesNotMatch(region, SKIP_GATE, 'inline guard must not gate re-derivation on whether vars are known');
});
