'use strict';

/**
 * derive-session-state.cjs is the single source of truth for the
 * "session_* variable ← preferences.X.Y" mapping and the platform gating.
 *
 * These tests lock in:
 *   - the Claude Code native vars derive only on Claude Code, safe defaults elsewhere;
 *   - the Copilot native var derives only on Copilot CLI, false elsewhere;
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
  'workflow:\n  auto_commit: false\n' +
  'claude_code:\n  review_final: true\n  review_effort: high\n' +
  'copilot:\n  review_final: true\n';

test('qa_gate + auto_commit derive platform-agnostically (default on, honored off)', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    // Defaults (no file) → all on.
    let root = mkRepo();
    try {
      const s = derive(root, platform).sessionState;
      assert.equal(s.session_qa_gate_enabled, true, `qa_gate default on ${platform}`);
      assert.equal(s.session_auto_commit, true, `auto_commit default on ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    // Explicit false → all off on every platform (no platform gating).
    root = mkRepo('workflow:\n  qa_gate: false\n  auto_commit: false\n');
    try {
      const s = derive(root, platform).sessionState;
      assert.equal(s.session_qa_gate_enabled, false, `qa_gate off ${platform}`);
      assert.equal(s.session_auto_commit, false, `auto_commit off ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('qa_gate: ask keeps the gate enabled and raises session_qa_gate_ask; true/false leave it down; invalid clamps to true', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    let root = mkRepo('workflow:\n  qa_gate: ask\n');
    try {
      const s = derive(root, platform).sessionState;
      assert.equal(s.session_qa_gate_enabled, true, `ask keeps the gate in the flow ${platform}`);
      assert.equal(s.session_qa_gate_ask, true, `ask raises the flag ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    for (const value of ['true', 'false']) {
      root = mkRepo(`workflow:\n  qa_gate: ${value}\n`);
      try {
        const s = derive(root, platform).sessionState;
        assert.equal(s.session_qa_gate_ask, false, `qa_gate: ${value} never asks ${platform}`);
        assert.equal(s.session_qa_gate_enabled, value === 'true', `qa_gate: ${value} enabled ${platform}`);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
    // A typo is not a third behaviour: it falls back to the default (run automatically).
    root = mkRepo('workflow:\n  qa_gate: always\n');
    try {
      const s = derive(root, platform).sessionState;
      assert.equal(s.session_qa_gate_enabled, true, `invalid clamps to true ${platform}`);
      assert.equal(s.session_qa_gate_ask, false, `invalid never asks ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('finish_action derives platform-agnostically (default ask, value verbatim, discard clamped)', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    let root = mkRepo();
    try {
      assert.equal(derive(root, platform).sessionState.session_finish_action, 'ask', `default ask ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    root = mkRepo('workflow:\n  finish_action: keep\n');
    try {
      assert.equal(derive(root, platform).sessionState.session_finish_action, 'keep', `keep ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    // A destructive destination is never a standing preference: it falls back to the menu.
    root = mkRepo('workflow:\n  finish_action: discard\n');
    try {
      assert.equal(derive(root, platform).sessionState.session_finish_action, 'ask', `discard clamped ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('visual_companion derives platform-agnostically (default on, honored off)', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    // No file → the companion stays available, exactly as before the preference existed.
    let root = mkRepo();
    try {
      assert.equal(derive(root, platform).sessionState.session_visual_companion_enabled, true,
        `visual_companion default on ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    // Explicit false → off on every platform (the companion is not a platform-specific feature).
    root = mkRepo('workflow:\n  visual_companion: false\n');
    try {
      assert.equal(derive(root, platform).sessionState.session_visual_companion_enabled, false,
        `visual_companion off ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('an unset model_tiers lands on the platform rung, or "auto" where it has none', () => {
  // These variables are copied verbatim onto dispatches. A platform that publishes rung
  // aliases must therefore surface one: "auto" is not a value a dispatch tool accepts, and
  // a controller handed it resolves it to its own model.
  const root = mkRepo(ALL_ON); // ALL_ON does not set model_tiers
  try {
    const cc = derive(root, 'claude-code').sessionState;
    assert.equal(cc.session_model_tier_cheap, 'haiku');
    assert.equal(cc.session_model_tier_standard, 'sonnet');
    assert.equal(cc.session_model_tier_capable, 'sonnet');

    for (const platform of ['copilot', 'codex', 'gemini', 'opencode', 'other']) {
      const { sessionState } = derive(root, platform);
      assert.equal(sessionState.session_model_tier_cheap, 'auto', `cheap auto on ${platform}`);
      assert.equal(sessionState.session_model_tier_standard, 'auto', `standard auto on ${platform}`);
      assert.equal(sessionState.session_model_tier_capable, 'auto', `capable auto on ${platform}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configured model tiers are surfaced verbatim and are platform-agnostic', () => {
  const yaml = 'model_tiers:\n  cheap: fast-model\n  standard: mid-model\n  capable: top-model\n';
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
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

test('a partially-configured model_tiers fills the unset tiers from the platform rungs', () => {
  const root = mkRepo('model_tiers:\n  cheap: fast-model\n');
  try {
    const { sessionState } = derive(root, 'claude-code');
    assert.equal(sessionState.session_model_tier_cheap, 'fast-model');
    assert.equal(sessionState.session_model_tier_standard, 'sonnet');
    assert.equal(sessionState.session_model_tier_capable, 'sonnet');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude Code native vars derive only on Claude Code', () => {
  const root = mkRepo(ALL_ON);
  try {
    const cc = derive(root, 'claude-code').sessionState;
    assert.equal(cc.session_code_review_final_enabled, true);
    assert.equal(cc.session_code_review_effort, 'high');

    for (const off of ['copilot', 'codex', 'gemini', 'opencode', 'other']) {
      const s = derive(root, off).sessionState;
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
    for (const off of ['claude-code', 'codex', 'gemini', 'opencode', 'other']) {
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
    assert.equal(r.sessionState.session_code_review_final_enabled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing preferences file → safe defaults, preferencesFound false', () => {
  const root = mkRepo(); // no file
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.preferencesFound, false);
    assert.equal(r.sessionState.session_code_review_final_enabled, false);
    assert.equal(r.sessionState.session_code_review_effort, 'medium');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('partial/asymmetric config loads each field independently (no all-or-nothing bleed)', () => {
  // auto_commit off, review_final ON, effort omitted.
  // Catches a loader that couples fields or defaults the whole block when one key is set.
  const root = mkRepo(
    'workflow:\n  auto_commit: false\n' +
    'claude_code:\n  review_final: true\n',
  );
  try {
    const s = derive(root, 'claude-code').sessionState;
    assert.equal(s.session_auto_commit, false, 'auto_commit read false');
    assert.equal(s.session_qa_gate_enabled, true, 'qa_gate falls back to its default when omitted');
    assert.equal(s.session_code_review_final_enabled, true, 'review_final read true');
    assert.equal(s.session_code_review_effort, 'medium', 'effort defaults when omitted');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit all-false file is loaded as false with preferencesFound true (not defaulted)', () => {
  // A present file with every flag false must be distinguishable from a missing file:
  // both yield false flags, but preferencesFound proves the values came from disk.
  const root = mkRepo(
    'claude_code:\n  review_final: false\n' +
    'copilot:\n  review_final: false\n',
  );
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.preferencesFound, true, 'file present → preferencesFound true');
    assert.equal(r.sessionState.session_code_review_final_enabled, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session_has_corporate_artifacts derives on EVERY platform (no gating)', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    for (const value of [true, false]) {
      const root = mkRepo(`context:\n  has_corporate_artifacts: ${value}\n`);
      try {
        assert.equal(
          derive(root, platform).sessionState.session_has_corporate_artifacts,
          value,
          `corporate=${value} on ${platform}`,
        );
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
  }
});

test('session_has_corporate_artifacts defaults to false when the file is absent', () => {
  const root = mkRepo();
  try {
    assert.equal(derive(root, 'claude-code').sessionState.session_has_corporate_artifacts, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('malformed + preferencesPath ride along, so the router needs no second read', () => {
  // Sound file: malformed false, path resolved.
  let root = mkRepo(ALL_ON);
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.malformed, false, 'a sound file is not malformed');
    assert.equal(
      r.preferencesPath,
      path.join(root, '.superpowers', 'preferences.yml'),
      'preferencesPath must resolve to the real file',
    );
    assert.equal(r.preferencesFound, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }

  // Malformed file: the flag must surface, exactly as read-preferences.cjs reports it.
  root = mkRepo('workflow:\n\tauto_commit: true\n  - stray\n');
  try {
    assert.equal(derive(root, 'claude-code').malformed, true, 'malformed YAML must be reported');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('absent file still reports preferencesFound:false (defaults are not consent)', () => {
  const root = mkRepo();
  try {
    const r = derive(root, 'claude-code');
    assert.equal(r.preferencesFound, false, 'a populated sessionState must not imply the file exists');
    assert.equal(r.malformed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unknown platform fails loudly (exit 1) rather than leaking wrong gating', () => {
  const root = mkRepo(ALL_ON);
  try {
    assert.throws(() => derive(root, 'windows'), /exited with code 1|Command failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('opencode is an accepted platform and resolves every native-review var off', () => {
  // opencode ships no equivalent of /code-review or Copilot's `review`,
  // so BOTH platform sections must resolve to their safe defaults there. This is the
  // same "a session can never try to run a native skill the platform lacks" guarantee
  // the Claude Code / Copilot tests assert from their own side.
  const root = mkRepo(ALL_ON);
  try {
    const s = derive(root, 'opencode').sessionState;
    assert.equal(s.session_code_review_final_enabled, false, 'claude_code.review_final must not leak into opencode');
    assert.equal(s.session_code_review_effort, 'medium', 'effort must fall back to the default off Claude Code');
    assert.equal(s.session_copilot_review_final_enabled, false, 'copilot.review_final must not leak into opencode');
    // ...while the platform-agnostic vars still derive normally.
    assert.equal(s.session_auto_commit, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── corporateArtifacts — the disk probe beside the consent flag ─────────────
//
// `session_has_corporate_artifacts` is the owner's CONSENT. Whether the file they
// consented to actually exists is a different fact, and nothing established it: the
// router is told to warn when the yml is present while the flag is off, but no step
// ever looked at the disk, so that branch could not fire and a declared corporate
// document was ignored in total silence. These lock the probe that makes it reachable
// — and the omission that keeps the consent gate intact.

function withCorporate(root, yml) {
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'corporate-artifacts.yml'), yml, 'utf8');
  return root;
}

const ONE_ARTIFACT = 'artifacts:\n  - path: docs/prd.md\n';

test('corporateArtifacts covers the full declared x enabled matrix', () => {
  const cases = [
    // [enabled, declare a yml?, expected {declared, declaredButDisabled, count, hasPath}]
    [true, true, { declared: true, declaredButDisabled: false, count: 1, hasPath: true }],
    [false, true, { declared: true, declaredButDisabled: true, count: 1, hasPath: true }],
    [true, false, { declared: false, declaredButDisabled: false, count: 0, hasPath: false }],
    [false, false, { declared: false, declaredButDisabled: false, count: 0, hasPath: false }],
  ];
  for (const [enabled, declare, want] of cases) {
    const root = mkRepo(`context:\n  has_corporate_artifacts: ${enabled}\n`);
    try {
      if (declare) withCorporate(root, ONE_ARTIFACT);
      const c = derive(root, 'claude-code').corporateArtifacts;
      const label = `enabled=${enabled} declared=${declare}`;
      assert.equal(c.enabled, enabled, `${label}: enabled`);
      assert.equal(c.declared, want.declared, `${label}: declared`);
      assert.equal(c.declaredButDisabled, want.declaredButDisabled, `${label}: declaredButDisabled`);
      assert.equal(c.count, want.count, `${label}: count`);
      assert.equal(Boolean(c.configPath), want.hasPath, `${label}: configPath`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('the probe NEVER carries the declared entries themselves', () => {
  // Presence is not consent, and corporate artifacts win on conflict. A path list sitting
  // in the controller's context is an invitation to act on a declaration the user never
  // made — which is exactly the regression the consent flag exists to prevent. The router
  // reads the file itself once consent is there; until then it may know HOW MANY and
  // WHERE, never WHICH.
  const root = withCorporate(
    mkRepo('context:\n  has_corporate_artifacts: false\n'),
    'artifacts:\n  - path: docs/superpowers/other-feature/prd/prd-other-feature.md\n',
  );
  try {
    const out = derive(root, 'claude-code');
    assert.equal(out.corporateArtifacts.declaredButDisabled, true, 'precondition: the mismatch is live');
    assert.ok(!('entries' in out.corporateArtifacts), 'entries must not be emitted');
    assert.doesNotMatch(JSON.stringify(out), /other-feature/,
      'no declared path may appear anywhere in the bootstrap JSON while consent is off');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a yml with no items is not a declaration', () => {
  const root = withCorporate(mkRepo('context:\n  has_corporate_artifacts: true\n'), '# nothing here\nartifacts:\n');
  try {
    const c = derive(root, 'claude-code').corporateArtifacts;
    assert.equal(c.declared, false, 'an empty list declares nothing');
    assert.equal(c.count, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('corporateArtifacts is platform-agnostic — the file is on disk, not in a harness', () => {
  for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
    const root = withCorporate(mkRepo('context:\n  has_corporate_artifacts: false\n'), ONE_ARTIFACT);
    try {
      const c = derive(root, platform).corporateArtifacts;
      assert.equal(c.declared, true, `declared on ${platform}`);
      assert.equal(c.declaredButDisabled, true, `mismatch surfaced on ${platform}`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('the probe holds with no preferences.yml at all — it is not gated on preferencesFound', () => {
  // A repo mid-onboarding still gets the row: `declared` is a disk fact, and defaults
  // masking an absent preferences file must not also mask a present corporate file.
  const root = withCorporate(mkRepo(), ONE_ARTIFACT);
  try {
    const out = derive(root, 'claude-code');
    assert.equal(out.preferencesFound, false, 'precondition: no preferences.yml');
    assert.equal(out.corporateArtifacts.declared, true);
    assert.equal(out.corporateArtifacts.enabled, false, 'no file means no consent');
    assert.equal(out.corporateArtifacts.declaredButDisabled, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
