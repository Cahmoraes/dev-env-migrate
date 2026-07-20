'use strict';

/**
 * Tests for assess-complexity.cjs — the checkpoint-based complexity-tier
 * classifier. These double as the routing simulation: each test names the
 * triage/brainstorming scenario it stands in for.
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

test('checkpoint 0, fully vague first message -> defaults to Medium, not Micro (when-in-doubt-go-heavier)', () => {
  const r = assess({ signals: {}, checkpoint: 0 });
  assert.equal(r.tier, 'medium');
  assert.equal(r.confidence, 'low');
});

test('checkpoint 0, fully-specified trivial request -> Micro, but requires confirmation', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'corrige o typo na linha 42 de foo.ts' },
    checkpoint: 0,
  });
  assert.equal(r.tier, 'micro');
  assert.equal(r.confidence, 'high');
  assert.equal(r.requiresConfirmation, true, 'checkpoint 0 alone never commits Micro without asking');
});

test('checkpoint 1, same Micro signals confirmed by a real interview answer -> no confirmation needed', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    checkpoint: 1,
  });
  assert.equal(r.tier, 'micro');
  assert.equal(r.requiresConfirmation, false);
});

test('direct option-2 entry (skips numbered triage): checkpoint 1 runs standalone, no priorTier, and alone decides tier', () => {
  // Simulates the gap found in the previous session: user types
  // "quero fazer brainstorming sobre X" and super.brainstorming's opening
  // question is the FIRST real signal — there was no triage checkpoint 0.
  const r = assess({
    signals: { fileScope: 'new-component', abstraction: 'small', prd: 'optional', decision: 'none' },
    checkpoint: 1,
  });
  assert.equal(r.tier, 'medium');
});

test('checkpoint 0 is advisory, not binding: its tier must NOT be threaded into checkpoint 1 as priorTier', () => {
  const checkpoint0 = assess({ signals: {}, checkpoint: 0 }); // defaults to medium
  assert.equal(checkpoint0.tier, 'medium');

  // Caller correctly does NOT pass checkpoint0.tier as --prior-tier here.
  const checkpoint1 = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    checkpoint: 1,
  });
  assert.equal(checkpoint1.tier, 'micro', 'checkpoint 0\'s cautious default did not lock the session into Medium');
});

test('escalate-only from checkpoint 1 onward: checkpoint 2 cannot lower what checkpoint 1 committed to', () => {
  const checkpoint1 = assess({
    signals: { fileScope: 'multi-component', abstraction: 'yes', prd: 'required', decision: 'may-exist' },
    checkpoint: 1,
  });
  assert.equal(checkpoint1.tier, 'large');

  // The design draft narrows scope and now reads lighter...
  const checkpoint2 = assess({
    signals: { fileScope: 'new-component', abstraction: 'small', prd: 'optional', decision: 'none' },
    priorTier: checkpoint1.tier,
    checkpoint: 2,
  });
  assert.equal(checkpoint2.tier, 'large', 'never silently de-escalates once checkpoint 1 committed');
  assert.equal(checkpoint2.escalatedByPrior, true);
});

test('gated de-escalation: checkpoint 2, high confidence, --allow-deescalation honors the lower reading', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    priorTier: 'large',
    checkpoint: 2,
    allowDeescalation: true,
  });
  assert.equal(r.confidence, 'high');
  assert.equal(r.tier, 'micro');
  assert.equal(r.deescalated, true);
  assert.equal(r.escalatedByPrior, false);
  assert.equal(r.deescalationBlocked, null);
});

test('gated de-escalation: low confidence blocks it even with --allow-deescalation, stays escalate-only', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', steps: 1 }, // abstraction/prd/decision unknown -> low confidence
    priorTier: 'large',
    checkpoint: 2,
    allowDeescalation: true,
  });
  assert.equal(r.confidence, 'low');
  assert.equal(r.tier, 'large', 'requested but not earned -> stays at the prior tier');
  assert.equal(r.deescalated, false);
  assert.match(r.deescalationBlocked, /confidence/);
});

test('gated de-escalation never crosses the critical-surface floor, even at high confidence + checkpoint 2', () => {
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 1,
      text: 'calcula os juros compostos do emprestimo',
      criticalSurface: true,
    },
    priorTier: 'large',
    checkpoint: 2,
    allowDeescalation: true,
  });
  assert.equal(r.confidence, 'high');
  assert.equal(r.criticalSurface, true);
  assert.equal(r.tier, 'small', 'floors at small, never all the way down to micro');
  assert.equal(r.deescalated, true);
});

test('gated de-escalation is checkpoint-2-only: same high-confidence light signals at checkpoint 1 stay escalate-only', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    priorTier: 'large',
    checkpoint: 1,
    allowDeescalation: true,
  });
  assert.equal(r.tier, 'large');
  assert.equal(r.deescalated, false);
  assert.match(r.deescalationBlocked, /checkpoint/);
});

test('gated de-escalation is checkpoint-2-only: same high-confidence light signals at checkpoint 3 stay escalate-only', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    priorTier: 'large',
    checkpoint: 3,
    allowDeescalation: true,
  });
  assert.equal(r.tier, 'large');
  assert.equal(r.deescalated, false);
  assert.match(r.deescalationBlocked, /checkpoint/);
});

test('de-escalation stays off by default (no --allow-deescalation) even at checkpoint 2 with high confidence', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    priorTier: 'large',
    checkpoint: 2,
  });
  assert.equal(r.tier, 'large');
  assert.equal(r.deescalated, false);
  assert.equal(r.deescalationBlocked, null);
  assert.equal(r.escalatedByPrior, true);
});

test('CLI: --allow-deescalation flag round-trips a lower tier at checkpoint 2 with prior large and light signals', () => {
  const cli = runCli([
    '--signals',
    '{"fileScope":"single-existing","abstraction":"none","prd":"none","decision":"none","steps":1}',
    '--checkpoint', '2',
    '--prior-tier', 'large',
    '--allow-deescalation',
  ]);
  assert.equal(cli.deescalated, true);
  assert.ok(['micro', 'small'].includes(cli.tier));
});

test('checkpoint 3 tripwire: step list blows past 8 steps -> escalates Medium to Large even late', () => {
  const checkpoint2 = assess({
    signals: { fileScope: 'new-component', abstraction: 'small', prd: 'optional', decision: 'none' },
    checkpoint: 2,
  });
  assert.equal(checkpoint2.tier, 'medium');

  const checkpoint3 = assess({
    signals: { steps: 11 },
    priorTier: checkpoint2.tier,
    checkpoint: 3,
  });
  assert.equal(checkpoint3.tier, 'large');
});

test('critical-surface keyword floors delivery tier at Small even for a 1-file, 1-step request', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'corrige o middleware de auth' },
    checkpoint: 0,
  });
  assert.equal(r.tier, 'small');
  assert.equal(r.criticalSurface, true);
});

test('critical-surface floor never fires on unrelated text', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'ajusta o texto do botao de salvar' },
    checkpoint: 0,
  });
  assert.equal(r.criticalSurface, false);
  assert.equal(r.tier, 'micro');
});

test('tri-state veto: explicit criticalSurface:false suppresses the keyword backstop ("middleware")', () => {
  // The semantic verdict is context-aware and judged this specific middleware
  // (a logging middleware) not critical; the regex alone would have matched
  // "middleware" and floored the tier. The semantic false must veto it.
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 1,
      text: 'adiciona um middleware de log de requisições',
      criticalSurface: false,
    },
    checkpoint: 1,
  });
  assert.equal(r.criticalSurface, false);
  assert.equal(r.tier, 'micro');
});

test('tri-state veto is authoritative even over a strong keyword match ("api key")', () => {
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 1,
      text: 'valida api key no header',
      criticalSurface: false,
    },
    checkpoint: 1,
  });
  assert.equal(r.criticalSurface, false);
});

test('semantic interpreter verdict floors delivery tier at Small even with no keyword match', () => {
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 1,
      text: 'limita requisições por cliente com um balde de fichas',
      criticalSurface: true,
    },
    checkpoint: 0,
  });
  assert.equal(r.tier, 'small');
  assert.equal(r.criticalSurface, true);
});

test('keyword backstop catches a newly-added term ("rate limit") without an interpreter verdict', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'adiciona rate limit na rota' },
    checkpoint: 0,
  });
  assert.equal(r.criticalSurface, true);
  assert.equal(r.tier, 'small');
});

test('keyword backstop catches "api key" without an interpreter verdict', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'valida a api key no header' },
    checkpoint: 0,
  });
  assert.equal(r.criticalSurface, true);
});

test('"token bucket" does NOT match the keyword regex, but the semantic verdict still floors the tier', () => {
  const withoutVerdict = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1, text: 'implementa o algoritmo token bucket' },
    checkpoint: 0,
  });
  assert.equal(withoutVerdict.criticalSurface, false);

  const withVerdict = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 1,
      text: 'implementa o algoritmo token bucket',
      criticalSurface: true,
    },
    checkpoint: 0,
  });
  assert.equal(withVerdict.criticalSurface, true);
  assert.equal(withVerdict.tier, 'small');
});

test('structurally-tiny high-consequence change floors via the semantic verdict, without a keyword', () => {
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 3,
      text: 'adiciona no BillingService o calculo de juros compostos do emprestimo',
      criticalSurface: true,
    },
    checkpoint: 0,
  });
  assert.equal(r.criticalSurface, true);
  assert.equal(r.tier, 'small');
});

test('without the semantic verdict, the keyword regex does not invent high-consequence', () => {
  const r = assess({
    signals: {
      fileScope: 'single-existing',
      abstraction: 'none',
      prd: 'none',
      decision: 'none',
      steps: 3,
      text: 'adiciona no BillingService o calculo de juros compostos do emprestimo',
    },
    checkpoint: 0,
  });
  assert.equal(r.criticalSurface, false);
});

test('criticalSurface must be a boolean when present — non-boolean value throws', () => {
  assert.throws(() => {
    assess({ signals: { criticalSurface: 'yes', text: 'x' } });
  }, /criticalSurface must be a boolean/);
});

test('Complex signal (open architecture fork) always wins the max, regardless of small file count', () => {
  const r = assess({
    signals: { fileScope: 'single-existing', abstraction: 'ambiguous', prd: 'required', decision: 'open-fork', steps: 2 },
    checkpoint: 1,
  });
  assert.equal(r.tier, 'complex');
});

test('CLI wrapper round-trips the same result as the pure function', () => {
  const cli = runCli(['--signals', '{"fileScope":"few-existing","abstraction":"none","prd":"none","decision":"none","steps":2}', '--checkpoint', '1']);
  const direct = assess({
    signals: { fileScope: 'few-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 2 },
    checkpoint: 1,
  });
  assert.deepEqual(cli, direct);
});

test('CLI exits 1 on malformed --signals JSON', () => {
  assert.throws(() => runCli(['--signals', '{not-json']));
});

test('Complex at checkpoint 0 offers deep-research first, under consent (before brainstorming)', () => {
  const r = assess({ signals: { decision: 'open-fork' }, checkpoint: 0 });
  assert.equal(r.tier, 'complex');
  assert.deepEqual(r.consentGates, ['deep-research']);
});

test('Complex at checkpoint 1 still offers deep-research (interview just started)', () => {
  const r = assess({ signals: { abstraction: 'ambiguous' }, checkpoint: 1 });
  assert.equal(r.tier, 'complex');
  assert.deepEqual(r.consentGates, ['deep-research']);
});

test('Complex at checkpoint 2 offers reviewing-specs, under consent (design exists now)', () => {
  const r = assess({ signals: { decision: 'open-fork' }, checkpoint: 2, priorTier: 'complex' });
  assert.equal(r.tier, 'complex');
  assert.deepEqual(r.consentGates, ['reviewing-specs']);
});

test('Non-complex tiers never surface a consent gate', () => {
  const micro = assess({
    signals: { fileScope: 'single-existing', abstraction: 'none', prd: 'none', decision: 'none', steps: 1 },
    checkpoint: 0,
  });
  assert.equal(micro.tier, 'micro');
  assert.deepEqual(micro.consentGates, []);
  const large = assess({
    signals: { fileScope: 'multi-component', abstraction: 'yes', prd: 'required', decision: 'may-exist', steps: 10 },
    checkpoint: 2,
    priorTier: 'large',
  });
  assert.equal(large.tier, 'large');
  assert.deepEqual(large.consentGates, []);
});

// --- Input robustness: the mis-keyed-call bug that silently returned Medium ---

test('normalizeSignals: a present-but-wrong key throws with a did-you-mean (never silently Medium)', () => {
  // `fileScop` is neither canonical nor an alias — a genuine typo, not `files`
  // (which IS aliased). It must be rejected loudly, not read as unknown -> Medium.
  assert.throws(
    () => assess({ signals: { fileScop: 'multi-component' }, checkpoint: 1 }),
    /Unknown signal key "fileScop".*did you mean "fileScope"/,
  );
});

test('normalizeSignals: an invalid enum value throws with the valid set (e.g. greenfield)', () => {
  assert.throws(
    () => assess({ signals: { fileScope: 'greenfield' }, checkpoint: 1 }),
    /Invalid fileScope value "greenfield".*single-existing/,
  );
});

test('normalizeSignals: known key-typos are aliased so a reasonable guess still scores correctly', () => {
  const aliased = assess({
    signals: { files: 'multi-component', new_abstractions: true, prd: true, decisions: true, steps: 8 },
    checkpoint: 1,
  });
  const canonical = assess({
    signals: { fileScope: 'multi-component', abstraction: 'yes', prd: 'required', decision: 'may-exist', steps: 8 },
    checkpoint: 1,
  });
  assert.equal(aliased.tier, 'large');
  assert.deepEqual(aliased.signals, canonical.signals, 'aliased + boolean-coerced input scores identically to canonical');
});

test('invariant #1 preserved: an ABSENT key (not a wrong key) still resolves to unknown -> Medium', () => {
  const r = assess({ signals: { steps: 2 }, checkpoint: 1 });
  assert.equal(r.tier, 'medium', 'silence about a dimension stays cautious-Medium; only wrong keys throw');
});

test('confidence gate: low confidence at a binding checkpoint sets requiresSignalCompletion', () => {
  const binding = assess({ signals: { steps: 5 }, checkpoint: 1 }); // 4 unknown dims -> confidence low
  assert.equal(binding.confidence, 'low');
  assert.equal(binding.requiresSignalCompletion, true);
  const advisory = assess({ signals: { steps: 5 }, checkpoint: 0 });
  assert.equal(advisory.requiresSignalCompletion, false, 'checkpoint 0 is advisory — never blocks on low confidence');
});

test('regression (Project B): the background-job-queue signal set scores Large, not Medium', () => {
  const r = assess({
    signals: {
      fileScope: 'multi-component',
      abstraction: 'yes',
      prd: 'required',
      decision: 'may-exist',
      steps: 8,
      text: 'fila de jobs em background com retry, backoff, dead-letter queue e timeout',
    },
    checkpoint: 1,
  });
  assert.equal(r.tier, 'large');
  assert.equal(r.confidence, 'high');
});

test('CLI: the original malformed call now exits 1 (loud) instead of returning a silent Medium', () => {
  assert.throws(() =>
    runCli([
      '--signals',
      '{"files":"greenfield","new_abstractions":true,"prd":true,"decisions":true,"steps":8}',
      '--checkpoint',
      '1',
    ]),
  );
});
