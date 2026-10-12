'use strict';
/*
 * tier-header-contract.test.cjs — `**Tier:**` is warned about at plan time, and the two
 * skills agree about what its absence means.
 *
 * They did not. `super.writing-plans/SKILL.md` said "Omit it only to let the executor infer
 * the tier; explicit is preferred" — absence allowed. `super.subagent-driven-development`
 * said "Each task carries a `**Tier:**` in its file header (written by
 * `super.writing-plans`)" and treated the written value as binding. One skill's optional
 * field was the other's guarantee.
 *
 * Practice sided with neither: in a real consumer plan produced by this pipeline, all 8
 * task files came back `explicitTier: null`. The template does carry `**Tier:** standard`,
 * but nothing checked, so plans shipped without it and validation passed clean.
 *
 * Two halves:
 *   - plan time: the validator WARNS. Not an error — writing-plans genuinely allows
 *     omitting, and erroring would invalidate every plan already on disk in consumer
 *     repos. A warning names the gap where it is cheapest to close.
 *   - dispatch time: the execution skill stops promising the field is there and states
 *     the real contract — written tier if present, `suggestedTier` otherwise, both
 *     binding with the same force.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/tier-header-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const SKILLS = path.resolve(SCRIPTS, '..', '..');
const VALIDATE = path.join(SCRIPTS, 'validate-tasks.cjs');

function makePlan(t, { tier = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tier-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plans = path.join(dir, 'plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.writeFileSync(path.join(plans, 'tasks-demo.md'), [
    '# Tasks: demo', '', '## Tasks', '', '- [ ] 1. Do the thing → `task-01.md`', '',
  ].join('\n'));
  fs.writeFileSync(path.join(plans, 'task-01.md'), [
    '# Task 1: Do the thing', '',
    '**Status:** PENDING',
    '**PRD:** N/A',
    '**Spec:** `../specs/demo-design.md`',
    ...(tier ? ['**Tier:** standard'] : []),
    '',
    '## Arquivos', '- src/a.ts', '',
    '## Steps', '1. do it', '',
  ].join('\n'));
  return path.join(plans, 'tasks-demo.md');
}

function validate(indexPath) {
  const out = execFileSync('node', [VALIDATE, '--tasks-index', indexPath], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('a task file without **Tier:** produces a warning, not an error', (t) => {
  const r = validate(makePlan(t, { tier: false }));
  const tierWarnings = (r.warnings || []).filter((w) => /\*\*Tier:\*\*/.test(w.message));
  assert.equal(tierWarnings.length, 1,
    'the gap must be surfaced at plan time, where writing the field is cheap');
  assert.equal((r.errors || []).filter((e) => /\*\*Tier:\*\*/.test(e.message)).length, 0,
    'it must NOT be an error: writing-plans allows omitting it, and erroring would '
    + 'invalidate plans already on disk in consumer repos');
  assert.match(tierWarnings[0].message, /suggestedTier/,
    'say what happens without it, so the warning is actionable rather than nagging');
});

test('a task file with **Tier:** produces no tier warning', (t) => {
  const r = validate(makePlan(t, { tier: true }));
  assert.deepEqual((r.warnings || []).filter((w) => /\*\*Tier:\*\*/.test(w.message)), []);
});

test('the execution skill does not claim the field is always present', () => {
  const sdd = fs.readFileSync(
    path.join(SKILLS, 'super.subagent-driven-development', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(sdd, /Each task carries a `\*\*Tier:\*\*`/,
    'that phrasing promises a guarantee writing-plans does not make, and that a real '
    + 'pipeline-generated plan did not meet in any of its 8 tasks');
  assert.match(sdd, /absent is normal/i,
    'state that absence is the normal case, not an edge case — the controller has to know '
    + 'which branch it is on without inferring');
  assert.match(sdd, /suggestedTier/,
    'name the fallback source explicitly');
});

test('both tiers bind — the fallback is not a weaker signal', () => {
  const sdd = fs.readFileSync(
    path.join(SKILLS, 'super.subagent-driven-development', 'SKILL.md'), 'utf8');
  assert.match(sdd, /Whichever of the two applies is binding/,
    'a fallback described as merely "inferred" invites the controller to override it, '
    + 'which is exactly the silent drift toward its own model the gate exists to stop');
});

test('writing-plans still documents the field it recommends', () => {
  const wp = fs.readFileSync(path.join(SKILLS, 'super.writing-plans', 'SKILL.md'), 'utf8');
  assert.match(wp, /\*\*Tier:\*\*/,
    'the skill that writes task files must keep documenting the field the validator warns about');
  const template = fs.readFileSync(
    path.join(SKILLS, 'super.writing-plans', 'templates', 'task-file-template.md'), 'utf8');
  assert.match(template, /^\*\*Tier:\*\*\s*(cheap|standard|capable)\s*$/mi,
    'the template must emit a concrete tier — a template without it is how plans ended up '
    + 'without it in the first place');
});
