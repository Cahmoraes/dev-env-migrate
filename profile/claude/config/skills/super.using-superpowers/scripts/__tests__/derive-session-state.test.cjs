'use strict';

/**
 * derive-session-state.cjs is the single source of truth for the
 * "session_* variable ← preferences.X.Y" mapping and the platform gating.
 *
 * These tests lock in:
 *   - caveman + memory derive from preferences on EVERY platform;
 *   - the Claude Code native vars derive only on Claude Code, safe defaults elsewhere;
 *   - the Copilot native var derives only on Copilot CLI, false elsewhere;
 *   - controller latches are NOT emitted (they are not configuration);
 *   - invalid platform fails loudly rather than leaking the wrong gating.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/derive-session-state.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'derive-session-state.cjs');

function mkRepo(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-state-'));
  if (yaml !== undefined) {
    fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
    fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml, 'utf8');
  }
  return root;
}

function derive(root, platform) {
  const args = [SCRIPT, '--repo-root', root];
  if (platform) args.push('--platform', platform);
  const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

const ALL_ON =
  'optimization:\n  caveman: true\n  caveman_level: ultra\n' +
  'memory:\n  persistent_memory: true\n' +
  'claude_code:\n  simplify: true\n  code_review_final: true\n  code_review_effort: high\n' +
  'copilot:\n  review_final: true\n';

test('caveman + memory derive from preferences on every platform', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'other']) {
    const root = mkRepo(ALL_ON);
    try {
      const { sessionState } = derive(root, platform);
      assert.equal(sessionState.session_memory_enabled, true, `memory on ${platform}`);
      assert.equal(sessionState.session_caveman_active, true, `caveman on ${platform}`);
      assert.equal(sessionState.session_caveman_level, 'ultra', `level on ${platform}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('model tiers default to null ("auto") on every platform when unset', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'other']) {
    const root = mkRepo(ALL_ON); // ALL_ON does not set model_tiers
    try {
      const { sessionState } = derive(root, platform);
      assert.equal(sessionState.session_model_tier_cheap, null, `cheap auto on ${platform}`);
      assert.equal(sessionState.session_model_tier_standard, null, `standard auto on ${platform}`);
      assert.equal(sessionState.session_model_tier_capable, null, `capable auto on ${platform}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('configured model tiers are surfaced verbatim and are platform-agnostic', () => {
  const yaml = 'model_tiers:\n  cheap: fast-model\n  standard: mid-model\n  capable: top-model\n';
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'other']) {
    const root = mkRepo(yaml);
    try {
      const { sessionState } = derive(root, platform);
      assert.equal(sessionState.session_model_tier_cheap, 'fast-model', `cheap on ${platform}`);
      assert.equal(sessionState.session_model_tier_standard, 'mid-model', `standard on ${platform}`);
      assert.equal(sessionState.session_model_tier_capable, 'top-model', `capable on ${platform}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('a partially-configured model_tiers leaves the unset tiers at null (auto)', () => {
  const root = mkRepo('model_tiers:\n  cheap: fast-model\n');
  try {
    const { sessionState } = derive(root, 'claude-code');
    assert.equal(sessionState.session_model_tier_cheap, 'fast-model');
    assert.equal(sessionState.session_model_tier_standard, null);
    assert.equal(sessionState.session_model_tier_capable, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude Code native vars derive only on Claude Code', () => {
  const root = mkRepo(ALL_ON);
  try {
    const cc = derive(root, 'claude-code').sessionState;
    assert.equal(cc.session_simplify_enabled, true);
    assert.equal(cc.session_code_review_final_enabled, true);
    assert.equal(cc.session_code_review_effort, 'high');

    for (const off of ['copilot', 'codex', 'gemini', 'other']) {
      const s = derive(root, off).sessionState;
      assert.equal(s.session_simplify_enabled, false, `simplify off on ${off}`);
      assert.equal(s.session_code_review_final_enabled, false, `code_review off on ${off}`);
      assert.equal(s.session_code_review_effort, 'medium', `effort defaults on ${off}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Copilot native review var derives only on Copilot CLI', () => {
  const root = mkRepo(ALL_ON);
  try {
    assert.equal(derive(root, 'copilot').sessionState.session_copilot_review_final_enabled, true);
    for (const off of ['claude-code', 'codex', 'gemini', 'other']) {
      assert.equal(
        derive(root, off).sessionState.session_copilot_review_final_enabled,
        false,
        `copilot review off on ${off}`,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('platform defaults to claude-code when the flag is omitted', () => {
  const root = mkRepo(ALL_ON);
  try {
    const r = derive(root, null);
    assert.equal(r.platform, 'claude-code');
    assert.equal(r.sessionState.session_simplify_enabled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing preferences file → safe defaults, preferencesFound false', () => {
  const root = mkRepo(); // no file
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.preferencesFound, false);
    assert.equal(r.sessionState.session_caveman_active, false);
    assert.equal(r.sessionState.session_caveman_level, 'full');
    assert.equal(r.sessionState.session_memory_enabled, false);
    assert.equal(r.sessionState.session_simplify_enabled, false);
    assert.equal(r.sessionState.session_code_review_effort, 'medium');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('partial/asymmetric config loads each field independently (no all-or-nothing bleed)', () => {
  // caveman on (level omitted → default full), memory OFF, simplify on, code_review_final OFF.
  // Catches a loader that couples fields or defaults the whole block when one key is set.
  const root = mkRepo(
    'optimization:\n  caveman: true\n' +
    'memory:\n  persistent_memory: false\n' +
    'claude_code:\n  simplify: true\n  code_review_final: false\n',
  );
  try {
    const s = derive(root, 'claude-code').sessionState;
    assert.equal(s.session_caveman_active, true, 'caveman read true');
    assert.equal(s.session_caveman_level, 'full', 'level falls back to full when omitted');
    assert.equal(s.session_memory_enabled, false, 'memory read explicit false');
    assert.equal(s.session_simplify_enabled, true, 'simplify read true');
    assert.equal(s.session_code_review_final_enabled, false, 'code_review_final read explicit false');
    assert.equal(s.session_code_review_effort, 'medium', 'effort defaults when omitted');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit all-false file is loaded as false with preferencesFound true (not defaulted)', () => {
  // A present file with every flag false must be distinguishable from a missing file:
  // both yield false flags, but preferencesFound proves the values came from disk.
  const root = mkRepo(
    'optimization:\n  caveman: false\n' +
    'memory:\n  persistent_memory: false\n' +
    'claude_code:\n  simplify: false\n  code_review_final: false\n' +
    'copilot:\n  review_final: false\n',
  );
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.preferencesFound, true, 'file present → preferencesFound true');
    assert.equal(r.sessionState.session_caveman_active, false);
    assert.equal(r.sessionState.session_memory_enabled, false);
    assert.equal(r.sessionState.session_simplify_enabled, false);
    assert.equal(r.sessionState.session_code_review_final_enabled, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('code_review_effort ultra is clamped to medium (inherited from read-preferences)', () => {
  const root = mkRepo('claude_code:\n  code_review_effort: ultra\n');
  try {
    assert.equal(derive(root, 'claude-code').sessionState.session_code_review_effort, 'medium');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('controller latches are NOT emitted (they are runtime bookkeeping)', () => {
  const root = mkRepo(ALL_ON);
  try {
    const keys = Object.keys(derive(root, 'claude-code').sessionState);
    for (const latch of ['session_caveman_in_effect', 'session_caveman_prompted', 'session_resync_completed']) {
      assert.ok(!keys.includes(latch), `${latch} must not be a derived variable`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unknown platform fails loudly (exit 1) rather than leaking wrong gating', () => {
  const root = mkRepo(ALL_ON);
  try {
    assert.throws(() => derive(root, 'windows'), /exited with code 1|Command failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
