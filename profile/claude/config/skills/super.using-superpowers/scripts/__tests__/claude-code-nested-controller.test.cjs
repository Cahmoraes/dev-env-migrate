'use strict';
/*
 * claude-code-nested-controller.test.cjs — the Claude Code reference offers the nested
 * controller as an OPT-IN cost lever for a whole plan, and keeps the tier contract binding one
 * layer down.
 *
 * Why: the controller seat is the expensive one in a plan run. Measured upstream (2026-09-17,
 * three reps, six-task plan, session on the capable tier): one standard-tier orchestrator running
 * the loop one layer down cost about half the money and wall clock of the session running it
 * itself. Our own precedent is the `super.reviewing-specs` lead, which dispatches its lenses a
 * layer down for the same reason.
 *
 * What the guard pins is the shape of the offer, not its wording:
 *   - opt-in, on the user's request — never the default (a nested controller that runs by
 *     itself removes the session's visibility of every dispatch);
 *   - whole plan only — nesting one task adds a seat and buys nothing;
 *   - the written tier stays binding a layer down, and `validate-dispatch` still runs there;
 *   - the nested controller never implements;
 *   - the top-level session relays the final message verbatim, never a summary — that message
 *     is the only route by which rulings reach the user.
 *
 * This is the one layer allowed to name a harness tool and its environment variable, so the
 * depth limit is pinned here and nowhere else.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/claude-code-nested-controller.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REF = path.resolve(__dirname, '..', '..', 'references', 'claude-code-tools.md');
const body = fs.readFileSync(REF, 'utf8');

function section() {
  const start = body.indexOf('## Cheaper orchestration: nested controller (opt-in)');
  assert.ok(start >= 0, 'the reference must carry the nested-controller section');
  const next = body.indexOf('\n## ', start + 10);
  return body.slice(start, next < 0 ? undefined : next);
}

test('the section names the nesting mechanism and its depth limit', () => {
  const s = section();
  assert.match(s, /three layers below the main conversation by default/);
  assert.match(s, /CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH/);
});

test('it is opt-in on the user\'s request and only for a whole plan', () => {
  const s = section();
  assert.match(s, /\*\*Opt-in only, and only for a whole plan\.\*\*/);
  assert.match(s, /when the user asks for it, or says the session model is too expensive to spend on coordination/);
  assert.match(s, /Never for a single task/);
  assert.match(s, /Absent that request, the session runs the elected execution skill itself/);
});

test('one standard-tier orchestrator, dispatched as a role block, not a tool name', () => {
  const s = section();
  assert.match(s, /dispatch ONE orchestrator on the `standard` tier/);
  assert.match(s, /```\nSubagent \(general-purpose\):\n/);
  assert.match(s, /model: <session_model_tier_standard>/);
  assert.doesNotMatch(s, /model: (claude|gpt|gemini)-/i, 'no hard-coded model: the tier resolves per harness');
});

test('the tier contract survives the extra layer: written tier binding, validate-dispatch run, models recorded', () => {
  const s = section();
  assert.match(s, /`\*\*Tier:\*\*` written in each task file is binding one layer down exactly as it is at the top/);
  assert.match(s, /<super\.dispatching-parallel-agents-base-dir>\/scripts\/validate-dispatch\.cjs/);
  assert.match(s, /record the resolved models in the manifest/);
  assert.match(s, /Never implement a task yourself/);
});

test('the top-level session relays the nested final message verbatim, never a summary', () => {
  const s = section();
  assert.match(s, /final message carries every finding, ruling and deferred item verbatim/);
  assert.match(s, /\*\*relay the nested controller's final message, not summarize it\*\*/);
});

test('the lever lives only in the Claude Code layer: no other harness reference offers nesting', () => {
  const refs = path.dirname(REF);
  const others = fs.readdirSync(refs).filter((f) => /-tools\.md$/.test(f) && f !== 'claude-code-tools.md');
  assert.ok(others.length >= 3, 'the sweep must reach the other harness references');
  for (const f of others) {
    const text = fs.readFileSync(path.join(refs, f), 'utf8');
    assert.doesNotMatch(text, /nested controller/i, `${f} must not offer the nested controller: nesting is not guaranteed there`);
  }
});
