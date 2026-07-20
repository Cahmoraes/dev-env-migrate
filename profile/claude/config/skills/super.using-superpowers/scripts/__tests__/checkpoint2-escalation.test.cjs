'use strict';

/**
 * Regression coverage for checkpoint 2 (super.brainstorming's design-draft
 * tier re-assessment) escalate-only guarantees. Added after Relatório V21
 * (Copilot CLI session, Project B) found checkpoint 2 never actually ran in
 * that session, so a request that escalated to `complex` at checkpoint 1
 * never re-surfaced the `reviewing-specs` consent gate at checkpoint 2. The
 * SKILL.md fix makes checkpoint 2 explicitly mandatory/blocking (see
 * super.brainstorming/SKILL.md); this file protects the scoring mechanics
 * assess-complexity.cjs already gets right, so a future change to the
 * escalate-only logic cannot silently regress checkpoint 2's guarantees.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'assess-complexity.cjs');
const { assess } = require('../assess-complexity.cjs');

function runCli(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('checkpoint 2, prior-tier large, lighter design-draft signals -> stays large (escalate-only, never demoted)', () => {
  const r = assess({
    signals: { fileScope: 'few-existing', abstraction: 'small', prd: 'optional', decision: 'none', steps: 3 },
    priorTier: 'large',
    checkpoint: 2,
  });
  assert.equal(r.tier, 'large');
  assert.equal(r.escalatedByPrior, true);
});

test('checkpoint 2, computed tier complex -> consentGates offers reviewing-specs, not deep-research', () => {
  const r = assess({
    signals: { fileScope: 'cross-cutting', abstraction: 'ambiguous', prd: 'required', decision: 'open-fork', steps: 8 },
    priorTier: 'large',
    checkpoint: 2,
  });
  assert.equal(r.tier, 'complex');
  assert.deepEqual(r.consentGates, ['reviewing-specs']);
});

test('checkpoint 2, prior-tier complex, lighter design-draft signals -> stays complex (never demoted below prior)', () => {
  const r = assess({
    signals: { fileScope: 'new-component', abstraction: 'small', prd: 'optional', decision: 'none', steps: 4 },
    priorTier: 'complex',
    checkpoint: 2,
  });
  assert.equal(r.tier, 'complex');
  assert.equal(r.escalatedByPrior, true);
  assert.deepEqual(
    r.consentGates,
    ['reviewing-specs'],
    'complex retained via prior tier still offers the checkpoint-2 consent gate',
  );
});

test('CLI wrapper: checkpoint 2 with --prior-tier complex round-trips the same escalation as the pure function', () => {
  const cli = runCli([
    '--signals',
    '{"fileScope":"new-component","abstraction":"small","prd":"optional","decision":"none","steps":4}',
    '--checkpoint', '2',
    '--prior-tier', 'complex',
  ]);
  const direct = assess({
    signals: { fileScope: 'new-component', abstraction: 'small', prd: 'optional', decision: 'none', steps: 4 },
    priorTier: 'complex',
    checkpoint: 2,
  });
  assert.deepEqual(cli, direct);
});
