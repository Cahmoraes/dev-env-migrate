'use strict';

/**
 * Guards that onboarding + brainstorming instruct the agent to use each platform's
 * structured-question tool (so the user *selects* answers instead of typing them),
 * and that every platform tool-mapping documents its equivalent plus a safe fallback.
 *
 * These are prose-layer canaries: if a future edit drops the dialog-tool guidance or
 * the fallback, the onboarding regresses to "type your answer" and these fail loudly.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

function read(rel) {
  return fs.readFileSync(path.join(SKILLS, rel), 'utf8');
}

// Canonical AskUserQuestion → platform tool, per the repo's tool-mapping convention.
const PLATFORM_TOOLS = [
  { file: 'super.using-superpowers/references/copilot-tools.md', tool: 'ask_user' },
  { file: 'super.using-superpowers/references/gemini-tools.md', tool: 'ask_user' },
  { file: 'super.using-superpowers/references/codex-tools.md', tool: 'ask_user_question' },
];

for (const { file, tool } of PLATFORM_TOOLS) {
  test(`${file}: maps AskUserQuestion to ${tool}`, () => {
    const body = read(file);
    assert.ok(body.includes('AskUserQuestion'), `${file} must map the canonical AskUserQuestion`);
    assert.ok(body.includes(tool), `${file} must name its platform tool ${tool}`);
  });
}

test('codex-tools.md documents the exec/non-interactive fallback', () => {
  const body = read('super.using-superpowers/references/codex-tools.md');
  assert.match(body, /codex exec/i, 'must warn that ask tools are removed in codex exec');
  assert.match(body, /fall back/i, 'must state the prose fallback');
});

test('onboarding wizard instructs using the structured-question tool with a fallback', () => {
  const body = read('super.using-superpowers/references/onboarding-preferences.md');
  assert.match(body, /structured-question tool/, 'onboarding must tell the agent to use the dialog tool');
  assert.match(body, /Fallback/i, 'onboarding must give a prose fallback when the tool is unavailable');
  assert.match(body, /One question per call/i, 'onboarding must keep one-question-at-a-time branching');
});

test('opening triage uses the prose list for token economy (cheaper than a 6-option tool call)', () => {
  const body = read('super.using-superpowers/SKILL.md');
  // The 6-option triage runs every session; a tool call carrying six label+description
  // objects plus the echoed answer costs ~2x the plain prose list. Prose is the
  // economical default here — and it also dodges Claude Code's 4-option cap.
  assert.match(body, /triage as the numbered prose list/i,
    'the triage must be the numbered prose list, not the structured-question tool');
  assert.match(body, /token economy/i,
    'the triage must justify prose by token economy (the primary reason)');
  assert.match(body, /at most 4|too_big/i,
    'the triage must still note the Claude Code 4-option cap as the secondary reason');
  // The economy call is scoped to the triage: small (≤4) questions keep the tool.
  assert.match(body, /clarifications with ≤4 options\)\s*\*?do\*? use the structured-question tool/i,
    'small (≤4) fixed-answer questions must still use the selectable tool');
});

test('onboarding documents the 4-option cap for the structured-question tool', () => {
  const body = read('super.using-superpowers/references/onboarding-preferences.md');
  assert.match(body, /at most 4 options per question/i, 'onboarding must state the option cap');
});

test('SKILL.md prints a platform-filtered session-variable summary before the triage', () => {
  const body = read('super.using-superpowers/SKILL.md');
  // The opening triage must be preceded by a read-only summary of the
  // preference-derived session variables (mirrors the Copilot CLI output the
  // user asked to make permanent).
  assert.match(body, /## Session Summary/, 'SKILL.md must define a Session Summary section');
  assert.match(body, /brief bulleted summary of the session variables/i,
    'the summary must be a bulleted list of the session variables');
  // It must print exactly once, after the re-sync gate, to avoid the double-print
  // (one before re-sync, one after) that the user reported.
  assert.match(body, /exactly once/i,
    'the summary must print exactly once (no duplicate before/after re-sync)');
  assert.match(body, /sole owner\*{0,2} of the print/i,
    'the Session Summary section must declare itself the sole owner of the print');
  // Platform filtering: show the running platform's native-skill vars, omit the
  // other platform's. No new detection logic — reuse the resolved platform.
  assert.match(body, /omit the other platform/i,
    'the summary must omit the other platform\'s native-skill variables');
  assert.match(body, /add no detection logic/i,
    'the summary must not introduce platform-detection coupling');
  // The summary is sequenced right before the triage, after the re-sync gate.
  assert.match(body, /After the Memory Re-Sync Gate has been processed \(or skipped\)/i,
    'the summary must be sequenced after the re-sync gate (and before Triagem)');
  // The re-sync gate's exit step must NOT print the summary itself — it only
  // proceeds to Triagem and defers the print to the sole-owner section. This is
  // the fix for the double-print.
  assert.doesNotMatch(body, /Print the § Session Summary/,
    'the re-sync gate must not print the summary itself (avoids double-print)');
  // Internal latches are bookkeeping, not configured behavior — the summary must
  // explicitly omit them (they stay tracked in context, just not displayed).
  assert.match(body, /omit the internal latches `session_caveman_prompted` and `session_caveman_in_effect`/i,
    'the summary must omit the internal caveman latches from the printed list');
  // And the worked example must not print them.
  const summary = body.slice(body.indexOf('## Session Summary'), body.indexOf('## Opening Triage'));
  assert.ok(!/^>.*session_caveman_prompted/m.test(summary),
    'the Session Summary example must not list session_caveman_prompted');
  assert.ok(!/^>.*session_caveman_in_effect/m.test(summary),
    'the Session Summary example must not list session_caveman_in_effect');
});

test('brainstorming stays platform-agnostic (no platform tool name leaks in)', () => {
  const body = read('super.brainstorming/SKILL.md');
  // Platform normalization lives in super.using-superpowers + the *-tools.md
  // mappings, never in a consumed skill. Brainstorming must describe the behavior
  // (selectable multiple choice), not name the platform tool.
  for (const leak of ['AskUserQuestion', 'ask_user', 'ask_user_question']) {
    assert.ok(!body.includes(leak), `brainstorming must not name the platform tool "${leak}"`);
  }
  assert.match(body, /selectable multiple-choice/,
    'brainstorming should still prefer selectable multiple-choice questions');
});

test('router gates onboarding on `found`, not on a populated preferences object', () => {
  // Regression guard for the missing-preferences onboarding bug: read-preferences.cjs
  // ALWAYS returns a fully populated `preferences` (built-in defaults when the file is
  // absent), so the router must trigger onboarding off the `found` flag — never assume
  // the file exists just because `preferences` is populated. If this canary fails, the
  // router can silently run with defaults and skip onboarding (the reported bug).
  const body = read('super.using-superpowers/SKILL.md');
  // Must instruct checking `found` first.
  assert.match(body, /[Cc]heck `found` (?:first|FIRST)/,
    'the router must tell the agent to check `found` first');
  // Must warn that a populated preferences object does NOT mean the file exists.
  assert.match(body, /populated `preferences`[^.]*does \*\*not\*\* mean the file exists|not consent/i,
    'the router must warn that defaults-populated preferences is not proof the file exists');
  // Must bind onboarding to found:false explicitly.
  assert.match(body, /`found: false`/,
    'the router must name the found:false case explicitly');
  assert.match(body, /found: false[\s\S]{0,400}onboarding wizard/i,
    'the found:false case must run the onboarding wizard');
  // Must treat derive-session-state.cjs preferencesFound:false identically.
  assert.match(body, /preferencesFound: false/,
    'the router must map derive-session-state preferencesFound:false to the same onboarding trigger');
});

test('onboarding asks model tiers as an optional step, default = harness picks', () => {
  // The wizard now offers a model-tiers step (Step 7a). It is OPTIONAL and defaults
  // to leaving model_tiers empty (harness auto-picks), so it adds no friction and no
  // regression for users who skip it. This canary locks the step in and ensures the
  // field-ref no longer claims tiers are "not asked".
  const body = read('super.using-superpowers/references/onboarding-preferences.md');
  assert.match(body, /Model Tiers \(Optional\)/i,
    'onboarding must offer an optional model-tiers step');
  assert.match(body, /Deseja configurar os modelos por tier/i,
    'the tier step must ask whether to configure tiers');
  assert.match(body, /leave `model_tiers` empty/i,
    'the No path must leave model_tiers empty (harness picks)');
  assert.match(body, /harness-specific/i,
    'tier model names must be documented as harness-specific (free text, not fixed options)');
  // The field reference must no longer say tiers are unaskable in the wizard.
  assert.doesNotMatch(body, /Not asked in the wizard/i,
    'the field reference must no longer claim model tiers are not asked');
});
