'use strict';
/*
 * hard-gate-stage-binding.test.cjs — the HARD-GATE binds approval to the stage actually
 * presented.
 *
 * Why: the motivating upstream session (2026-09) took "that scope is ok" as permission to
 * scaffold a project. The gate said "until the written design has been approved", which is
 * true and was not enough: an approval of the idea was read as the approval of a spec that did
 * not exist yet. The repair is three facts inside the gate itself — the one block that is in
 * the compaction window and read before any reference: a reply approves the stage presented;
 * an approved spec licenses only the planning skill (the plan opens its own gate); resume at
 * the earliest incomplete stage. Read-only exploration stays allowed so the gate is not read as
 * "do nothing".
 *
 * Run: node --test super.brainstorming/scripts/__tests__/hard-gate-stage-binding.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');

function hardGate() {
  const open = md.indexOf('<HARD-GATE>');
  const close = md.indexOf('</HARD-GATE>');
  assert.ok(open >= 0 && close > open, 'SKILL.md must carry one HARD-GATE block');
  return md.slice(open, close);
}

test('the gate says a reply approves the stage actually presented', () => {
  assert.match(hardGate(), /A reply approves the stage actually presented/);
});

test('approving an idea or scope does not approve a spec that does not exist yet', () => {
  assert.match(hardGate(), /approving an idea or a scope does not approve a spec that does not exist yet/);
});

test('an approved spec licenses only the planning skill, and the plan opens its own gate', () => {
  const gate = hardGate();
  assert.match(gate, /an approved spec licenses only `super\.writing-plans`/);
  assert.match(gate, /the plan opens its own execution gate/);
});

test('the gate resumes at the earliest incomplete stage and still allows read-only exploration', () => {
  const gate = hardGate();
  assert.match(gate, /Resume at the earliest incomplete stage/);
  assert.match(gate, /read-only project exploration is allowed/i);
});

test('the gate stays short: a router block, not a per-path list', () => {
  const gate = hardGate();
  assert.ok(gate.length < 900, `HARD-GATE is ${gate.length} chars; keep it under 900`);
  assert.doesNotMatch(gate, /Spike:|Bounded:|Architectural:/, 'the tiers cover the paths; no per-path list here');
});
