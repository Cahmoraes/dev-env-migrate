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
  // Codex has NO `ask_user_question` tool — that name does not exist. The real tool is
  // `request_user_input`. Asserting the wrong name let a stale mapping pass for years.
  { file: 'super.using-superpowers/references/codex-tools.md', tool: 'request_user_input' },
  // opencode's tool is literally named `question`, which is too generic to assert bare —
  // match the mapping-table cell so a passing test means the ROW exists, not the word.
  { file: 'super.using-superpowers/references/opencode-tools.md', tool: '`question` (`questions[]`)' },
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

test('opening triage uses the prose list for token economy (cheaper than a multi-option tool call)', () => {
  const body = read('super.using-superpowers/SKILL.md');
  // The eight-option triage (0-7) runs every session; a tool call carrying eight
  // label+description objects plus the echoed answer costs ~2x the plain prose list.
  // Prose is the economical default here — and it also dodges Claude Code's 4-option cap.
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

test('the summary block is platform-invariant except the native-review row', () => {
  // Regression, 2026-08-01: the worked example is labelled "(Claude Code, …)", and on
  // Copilot the model treated the WHOLE block as Claude-Code-specific — it rebuilt a
  // shortened version, dropping "Modelos por tier" and printing the Claude flag name
  // (`code-review final`) instead of the Copilot one. The reference must say which rows
  // are fixed and give the per-platform row verbatim, or "adapt to your platform" reads
  // as "drop what looks foreign".
  const ref = read('super.using-superpowers/references/session-start.md');

  assert.match(ref, /seven rows, in this order, on every platform/i,
    'the reference must fix the row count and order across platforms');
  assert.match(ref, /"Modelos por tier", which is\s*\n?\s*cross-platform/i,
    'the tier row must be called out as cross-platform — it is the row that got dropped');
  // The per-platform row has to be spelled out for BOTH harnesses, not described.
  assert.match(ref, /\| Claude Code \| .*simplify.*code-review final/,
    'the Claude Code native-review row must be given verbatim');
  assert.match(ref, /\| Copilot CLI \| .*Copilot review final/,
    'the Copilot CLI native-review row must be given verbatim');
});

test('the activation orders the bootstrap BEFORE any printed block', () => {
  // Regression, 2026-08-01: the router was reworded to say the reference was
  // "already in context from the bootstrap cat". That asserts, in the present tense,
  // a state that only becomes true AFTER the call runs — so the model believed it
  // already held the data and printed from memory instead of executing. Both harnesses
  // (Claude Code effort=medium, Copilot effort=null) then emitted an invented triage
  // list AND default preference values, with zero tool calls in the turn.
  const body = read('super.using-superpowers/SKILL.md');
  const activation = body.slice(body.indexOf('<ACTIVATION>'), body.indexOf('</ACTIVATION>'));

  assert.ok(activation.length > 0, 'the ACTIVATION block must exist');
  assert.match(activation, /first act is the bootstrap call, never printed text/i,
    'the activation must order the call before any printed text');
  assert.match(activation, /[Nn]othing in this file is a value you may report/,
    'the activation must deny that the file itself carries reportable values');
  assert.match(activation, /wrong every time/i,
    'the activation must name printing from memory as the failure');

  // The load-bearing negative: no phrasing may claim the deferred content is on hand
  // before the call that fetches it. A model that believes it has the data skips the call.
  for (const claim of [/already in context/i, /printed verbatim from that file/i]) {
    assert.ok(!claim.test(body),
      `SKILL.md must not assert deferred content is already available (${claim}) — it reads as "no call needed"`);
  }
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
  assert.doesNotMatch(body, /Print the "Session Summary" section/,
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

test('the bootstrap prints at most one plain line before the Session Summary', () => {
  // Four real transcripts. Pure suppression was tried three times and never held —
  // the lead-in shrank each round ("Ambos os probes vieram limpos (dirty: false,
  // stale_count: 0), então não há perguntas pendentes." → "Both probes vieram limpos,
  // então nada para perguntar.") but always survived, and each rewrite was already in
  // context when the next one was produced. Two lessons are locked here:
  //   1. POSITION — the first two fixes lived at the END of the Memory Re-Sync Gate
  //      subsection, too late: the first preamble is emitted during the *preference
  //      load*, before that section is ever read.
  //   2. PRESCRIBE, don't forbid — the rule now budgets one short jargon-free line
  //      instead of banning the sentence, which also stops the anti-narration prose
  //      from growing on every failed round.
  const body = read('super.using-superpowers/SKILL.md');
  // Scope to the rule itself: matching the whole file lets a deleted clause "pass"
  // because the same word appears further down — a mutation run caught exactly that.
  const rule = body.slice(body.indexOf('**Silent bootstrap'), body.indexOf('## Session Summary'));

  assert.match(body, /Silent bootstrap/, 'SKILL.md must carry the Silent bootstrap rule');
  assert.match(rule, /at most one short line/i,
    'the rule must budget one line, not attempt a total ban (tried, did not hold)');
  assert.match(rule, /Memória em dia/,
    'the rule must give the canonical wording of that line');
  assert.match(rule, /session language/i,
    'that line must be rendered in the session language, never hardcoded');
  // The point of the rewrite the user asked for: "Both probes" means nothing to a reader.
  assert.match(rule, /jargon/i,
    'the rule must forbid internal jargon in the user-facing line');
  for (const term of ['probes', '`dirty`', '`stale_count`']) {
    assert.ok(rule.includes(term),
      `the rule must name ${term} as jargon to keep out of the printed line`);
  }
  // Narrating the commands themselves stays banned — that part of the fix DID work
  // (the preamble and between-probes lines disappeared once it was in the entry flow).
  assert.match(rule, /[Nn]ever narrate the commands/,
    'narrating the commands must stay forbidden');
  // The gate must keep speaking where it has to ask, or "be brief" swallows the questions.
  assert.match(rule, /ask the user something/i,
    'branches that must ask the user something have to speak');
  for (const branch of ['dirty: true', 'stale_count > 0']) {
    assert.ok(rule.includes(branch),
      `the rule must name the ${branch} branch so the gate still speaks when it asks`);
  }

  // POSITION is the other half of the fix: the rule sits in the entry flow, not in the
  // Session State & Gates reference below, which is where the first two attempts failed.
  const at = body.indexOf('Silent bootstrap');
  const summarySection = body.indexOf('## Session Summary');
  const gatesSection = body.indexOf('## Session State & Gates');
  assert.ok(at >= 0 && summarySection >= 0 && gatesSection >= 0, 'all three anchors must exist');
  assert.ok(at < summarySection && at < gatesSection,
    'the rule must sit in the entry flow, not buried in the gates reference');

  // The summary block still owns its own opening, and no longer duplicates the gate
  // outcome now that the one-line opener carries it.
  const summary = body.slice(summarySection, body.indexOf('## Opening Triage'));
  assert.match(summary, /block opens the turn/i,
    'the Session Summary section must state that the block opens the turn');
  assert.match(summary, /\*\*Memória persistente\*\*: ativa$/m,
    'the memory line must be plain again — the opener reports the gate, not this line');
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

test('router gates onboarding on the presence flag, not on a populated object', () => {
  // Regression guard for the missing-preferences onboarding bug: both loaders
  // ALWAYS return fully populated values (built-in defaults when the file is absent),
  // so the router must trigger onboarding off the presence flag — never assume the file
  // exists just because the values are populated. If this canary fails, the router can
  // silently run with defaults and skip onboarding (the reported bug).
  //
  // The flag is name-agnostic on purpose: the router reads the session state via
  // derive-session-state.cjs (`preferencesFound`) in ONE call, and read-preferences.cjs
  // (`found`) remains the documented fallback/raw-object path. The invariant is
  // "gate on the flag", not "gate on a particular spelling of the flag".
  const body = read('super.using-superpowers/SKILL.md');
  // Must instruct checking the presence flag first.
  assert.match(body, /[Cc]heck `(?:found|preferencesFound)` (?:first|FIRST)/,
    'the router must tell the agent to check the presence flag first');
  // Must warn that a populated defaults object does NOT mean the file exists.
  assert.match(body, /populated (?:`preferences`|values)[^.]*do(?:es)? \*\*not\*\* mean the file exists|not consent/i,
    'the router must warn that defaults-populated values are not proof the file exists');
  // Must bind onboarding to the false case explicitly.
  assert.match(body, /`(?:found|preferencesFound): false`/,
    'the router must name the flag:false case explicitly');
  assert.match(body, /(?:found|preferencesFound): false[\s\S]{0,400}onboarding wizard/i,
    'the flag:false case must run the onboarding wizard');
  // BOTH spellings must appear, so whichever loader the agent ends up on maps to the
  // same onboarding trigger — the equivalence note is what stops a half-migrated router
  // from treating one loader's absent-file signal as "nothing to do".
  for (const flag of ['found: false', 'preferencesFound: false']) {
    assert.ok(body.includes(flag),
      `the router must state the ${flag} case so both loaders map to the same trigger`);
  }
});

test('onboarding asks model tiers as a REQUIRED step with suggestions + cost warnings', () => {
  // The wizard makes model tiers a required Step 7a: it educates that `standard`
  // reviews `cheap` (one family up), suggests mappings, and warns when the mapping
  // would make an expensive model review mechanical code. Auto stays an explicit choice.
  const body = read('super.using-superpowers/references/onboarding-preferences.md');
  assert.match(body, /Model Tiers \(required\)/i,
    'onboarding must ask model tiers as a required step');
  assert.match(body, /Economical \(suggested\)/i,
    'the tier step must offer a suggested economic mapping');
  assert.match(body, /reviews your `cheap` tasks/i,
    'the tier step must teach that standard reviews cheap tasks (one family up)');
  assert.match(body, /one family above/i,
    'the tier step must state the standard-a-family-above-cheap rule');
  assert.match(body, /overkill/i,
    'the tier step must warn when an expensive model would review mechanical (cheap) code');
  assert.match(body, /\bAuto\b/,
    'auto (harness picks) must remain an explicit option');
  assert.match(body, /harness-specific/i,
    'tier model names must be documented as harness-specific (free text, not fixed options)');
  assert.doesNotMatch(body, /Model Tiers \(Optional\)/i,
    'the tier step must no longer be labelled Optional');
  assert.doesNotMatch(body, /Not asked in the wizard/i,
    'the field reference must no longer claim model tiers are not asked');
});
