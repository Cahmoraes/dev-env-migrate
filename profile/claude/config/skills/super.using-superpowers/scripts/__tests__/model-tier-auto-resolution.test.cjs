'use strict';

/**
 * model-tier-auto-resolution.test.cjs
 *
 * Two defects, one rule.
 *
 * 1. THE DISPLAY. With `model_tiers` left empty the Session Summary printed
 *    "Modelos por tier: cheap: não definido · standard: não definido · capable: não
 *    definido". Nothing in the repo ever said "não definido" — the wording was improvised
 *    per session, and it misreports the state: an empty mapping is not a gap the user has
 *    to fill, it is the `auto` option onboarding offered and the user picked. `auto` is
 *    also the word every execution skill uses for that same state, so the summary was the
 *    one surface calling it something else.
 *
 * 2. THE RESOLUTION. `.superpowers/preferences.yml` is per-REPO but model names are
 *    per-HARNESS. Configure `standard: gpt-5` from Copilot CLI and a later Claude Code
 *    session in the same repo reads a tier pointing at a model that does not exist there —
 *    and the tier↔model gate enforces equality against it, so the failure lands at
 *    dispatch, mid-plan. A model the running platform cannot serve is the same situation
 *    as no mapping at all, and resolves to the same answer: auto.
 *
 * The rule that must NOT follow from this: falling back on any name we do not recognize.
 * A version-level catalog goes stale on every model release and would silently demote a
 * brand-new model to auto. Only a confidently FOREIGN vendor falls back.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPTS = path.resolve(__dirname, '..');
const REFERENCES = path.resolve(__dirname, '../../references');

const {
  AUTO_LABEL,
  PLATFORM_RUNGS,
  TIERS,
  formatModelTier,
  identifyVendor,
  isModelAvailable,
  resolveDispatchModel,
  resolveModelTiers,
} = require(path.join(SCRIPTS, 'lib/model-tiers.cjs'));
const { deriveSessionState } = require(path.join(SCRIPTS, 'derive-session-state.cjs'));

function mkRepo(yamlBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tiers-'));
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yamlBody, 'utf8');
  return root;
}

// ─── The display literal ─────────────────────────────────────────────────────

test('an unresolved tier displays as the literal "auto"', () => {
  assert.equal(AUTO_LABEL, 'auto');
  assert.equal(formatModelTier(null), 'auto');
  assert.equal(formatModelTier(''), 'auto');
  assert.equal(formatModelTier('haiku'), 'haiku');
});

test('session-start.md pins "auto" as the wording for an unresolved tier', () => {
  const ref = fs.readFileSync(path.join(REFERENCES, 'session-start.md'), 'utf8');

  assert.match(
    ref,
    /A tier that still reads .auto.[\s\S]{0,80}prints the[\s\S]{0,20}literal .auto./,
    'the row-6 rule must state the literal, not leave the empty state to improvisation',
  );
  assert.match(
    ref,
    /unavailableModelTiers/,
    'the summary must be told where to read the dropped mappings from',
  );
});

test('no reference tells the model to print a tier as "não definido"', () => {
  for (const name of fs.readdirSync(REFERENCES)) {
    if (!name.endsWith('.md')) continue;
    // Sweep a WINDOW, not a line: the surrounding prose is hard-wrapped, so a
    // line-scoped assertion breaks the moment a paragraph is re-flowed.
    const body = fs.readFileSync(path.join(REFERENCES, name), 'utf8');
    const re = /não definido/g;
    let hit;
    while ((hit = re.exec(body)) !== null) {
      const window = body.slice(Math.max(0, hit.index - 220), hit.index + 220);
      assert.match(
        window,
        /never|nunca|forbid|proib/i,
        `${name}: "não definido" may only appear as the forbidden wording, not as a value to print`,
      );
    }
  }
});

// ─── Vendor identification ───────────────────────────────────────────────────

test('vendors are identified at family level, not by a version catalog', () => {
  assert.equal(identifyVendor('haiku'), 'anthropic');
  assert.equal(identifyVendor('claude-opus-9-20991231'), 'anthropic');
  assert.equal(identifyVendor('gpt-5'), 'openai');
  assert.equal(identifyVendor('o3-mini'), 'openai');
  assert.equal(identifyVendor('gemini-3-pro'), 'google');
  assert.equal(identifyVendor('grok-4'), 'xai');
});

test('an unrecognized name is "unknown", never "invalid"', () => {
  for (const name of ['fast-model', 'mid-model', 'c', 'internal-gateway-v2', '']) {
    assert.equal(identifyVendor(name), null, `${name} must not be classified`);
    assert.equal(isModelAvailable(name, 'claude-code'), true, `${name} must pass through`);
  }
});

// ─── Availability per platform ───────────────────────────────────────────────

test("a foreign vendor's model is unavailable on a platform with a known catalog", () => {
  assert.equal(isModelAvailable('gpt-5', 'claude-code'), false);
  assert.equal(isModelAvailable('gemini-3-pro', 'claude-code'), false);
  assert.equal(isModelAvailable('sonnet', 'claude-code'), true);

  // Copilot CLI brokers all three families — the user's own example of the mismatch.
  assert.equal(isModelAvailable('gpt-5', 'copilot'), true);
  assert.equal(isModelAvailable('sonnet', 'copilot'), true);
});

test('platforms with an open catalog never reject anything', () => {
  for (const platform of ['opencode', 'other']) {
    assert.equal(isModelAvailable('gpt-5', platform), true);
    assert.equal(isModelAvailable('anything/at-all', platform), true);
  }
});

// ─── Resolution ──────────────────────────────────────────────────────────────

test('resolveModelTiers reports every fallback instead of dropping it silently', () => {
  const { resolved, unavailable } = resolveModelTiers(
    { cheap: 'haiku', standard: 'gpt-5', capable: null },
    'claude-code',
  );

  assert.deepEqual(resolved, { cheap: 'haiku', standard: null, capable: null });
  assert.equal(unavailable.length, 1, 'only the foreign model falls back');
  assert.deepEqual(unavailable[0], {
    tier: 'standard',
    configured: 'gpt-5',
    vendor: 'openai',
    platform: 'claude-code',
  });
});

test('a blank / whitespace-only tier is auto, and is not reported as unavailable', () => {
  const { resolved, unavailable } = resolveModelTiers(
    { cheap: '   ', standard: undefined, capable: '' },
    'claude-code',
  );
  assert.deepEqual(resolved, { cheap: null, standard: null, capable: null });
  assert.deepEqual(unavailable, [], 'unset is not a mapping the user lost');
});

// ─── The session variable the whole flow reads ───────────────────────────────

test('session_model_tier_* carries the RESOLVED tier, so no dispatch names a foreign model', () => {
  const root = mkRepo('model_tiers:\n  cheap: haiku\n  standard: gpt-5\n  capable: opus\n');
  try {
    const prefs = require(path.join(SCRIPTS, 'read-preferences.cjs')).loadPreferences(root).result.preferences;

    const cc = deriveSessionState(prefs, 'claude-code');
    assert.equal(cc.session_model_tier_cheap, 'haiku');
    assert.equal(cc.session_model_tier_standard, 'sonnet', 'gpt-5 does not exist on Claude Code');
    assert.equal(cc.session_model_tier_capable, 'opus', 'a mapping the user wrote still wins');

    // Same file, same repo, different harness — the mapping the user wrote there holds.
    const copilot = deriveSessionState(prefs, 'copilot');
    assert.equal(copilot.session_model_tier_standard, 'gpt-5');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the bootstrap JSON surfaces unavailableModelTiers next to sessionState', () => {
  const root = mkRepo('model_tiers:\n  cheap: gemini-3-pro\n  standard: sonnet\n  capable:\n');
  try {
    const out = require('node:child_process').execFileSync(
      process.execPath,
      [path.join(SCRIPTS, 'derive-session-state.cjs'), '--platform', 'claude-code', '--repo-root', root],
      { encoding: 'utf8' },
    );
    const json = JSON.parse(out);
    assert.equal(json.sessionState.session_model_tier_cheap, 'haiku');
    assert.equal(json.sessionState.session_model_tier_standard, 'sonnet');
    assert.deepEqual(
      json.unavailableModelTiers.map((u) => `${u.tier}:${u.configured}`),
      ['cheap:gemini-3-pro'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── The consumers ───────────────────────────────────────────────────────────

test('the dispatch manifest and the model-selection ladder read the RESOLVED variable', () => {
  const SKILLS = path.resolve(__dirname, '../../..');

  const dispatch = fs.readFileSync(
    path.join(SKILLS, 'super.dispatching-parallel-agents/SKILL.md'), 'utf8');
  assert.match(
    dispatch,
    /Copy the three values verbatim out of `session_model_tier_\{cheap,standard,capable\}`/,
    'the manifest must be filled from the resolved vars, not from raw model_tiers',
  );

  const ladder = fs.readFileSync(
    path.join(SKILLS, 'super.subagent-driven-development/references/model-selection.md'), 'utf8');
  assert.match(
    ladder,
    /Read the resolved variable, not the YAML/,
    'the resolution ladder must forbid re-reading the raw mapping',
  );
});

// ─── "auto" must never reach a dispatch's model: field ───────────────────────
//
// `auto` is a fine answer INSIDE this library — it says "the user configured no mapping".
// It is not an answer a dispatch can carry. Claude Code's dispatch tool takes one of four
// rung aliases and rejects the word outright; a controller holding `auto` then resolves it
// the only way it can, to its own model. Measured on one feature: an empty `model_tiers`
// put four spec-review lenses on the controller's `opus` — the lenses
// after an InputValidationError made the lead re-send them with `model:` dropped, which
// inherits the same way. So every build-*-dispatch script resolves a tier with no mapping
// to the running platform's own rung alias, and only a platform that publishes none still
// emits `auto`.

const { execFileSync } = require('node:child_process');

const SKILLS = path.resolve(SCRIPTS, '../..');

test('with no mapping, a tier resolves to the platform\'s own rung alias', () => {
  assert.equal(resolveDispatchModel(null, 'cheap', 'claude-code'), 'haiku');
  assert.equal(resolveDispatchModel(null, 'standard', 'claude-code'), 'sonnet');
  assert.equal(resolveDispatchModel(null, 'capable', 'claude-code'), 'sonnet');
});

test('a configured model always wins over the platform rung', () => {
  assert.equal(resolveDispatchModel('opus', 'cheap', 'claude-code'), 'opus');
  assert.equal(resolveDispatchModel('gpt-5', 'capable', 'copilot'), 'gpt-5');
});

test('capable is NOT the platform\'s strongest rung — opus is reached by escalation only', () => {
  // The roles that resolve `capable` (reviewers) run a written procedure, and
  // turn count beats token price. A default nobody chose is how the drift got in.
  assert.notEqual(PLATFORM_RUNGS['claude-code'].capable, 'opus');
  for (const tier of TIERS) {
    assert.notEqual(resolveDispatchModel(null, tier, 'claude-code'), 'opus');
  }
});

test('a platform that publishes no rung aliases still answers "auto"', () => {
  for (const platform of ['other', 'opencode', 'copilot', 'codex', 'gemini']) {
    assert.equal(resolveDispatchModel(null, 'capable', platform), AUTO_LABEL);
  }
});

test('no build-*-dispatch script emits model "auto" on a platform with rung aliases', () => {
  // The regression itself, end to end: an empty `model_tiers` is the DEFAULT preferences
  // file onboarding writes, so this is the common path, not an edge case.
  const root = mkRepo('workflow:\n  auto_commit: true\nmodel_tiers:\n  cheap:\n  standard:\n  capable:\n');

  const lite = JSON.parse(
    execFileSync('node', [
      path.join(SKILLS, 'super.reviewing-specs/scripts/lite-reentry.cjs'),
      '--repo-root', root, '--platform', 'claude-code',
    ], { encoding: 'utf8' })
  );
  assert.equal(lite.capableModel, 'sonnet');
});
