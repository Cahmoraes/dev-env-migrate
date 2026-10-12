'use strict';

/**
 * model-tiers.cjs — Resolve `model_tiers.{cheap,standard,capable}` to the value a
 * dispatch may actually use on the RUNNING harness, in ONE place.
 *
 * WHY THIS EXISTS
 *   `.superpowers/preferences.yml` lives in the consumer repo, but the model names it
 *   carries are harness-specific: the same file is read by Claude Code, Copilot CLI,
 *   Codex, Gemini CLI and opencode. A mapping written while running one harness names
 *   models another harness does not serve — configure `capable: gpt-5` from Copilot CLI
 *   and every `capable` dispatch in a later Claude Code session names a model that does
 *   not exist there. The failure is not a clean error at read time: the tier looks
 *   configured, the tier↔model gate happily enforces equality against it, and the cost
 *   lands at dispatch, mid-plan.
 *
 *   `auto` is already the contract for "no mapping — the harness picks the rung"
 *   (a null tier). A model the running harness cannot serve is the same situation
 *   arriving by a different route, so it resolves to the same answer: auto.
 *
 * WHAT IT WILL NOT DO
 *   It does not carry a model CATALOG. Version-level lists go stale on every release
 *   and would silently demote a brand-new model to auto — the exact silent drift this
 *   file exists to remove. It classifies a configured name by VENDOR and only falls
 *   back when the name is CONFIDENTLY another vendor's. An unrecognized name (a custom
 *   alias, an internal gateway id, a `provider/model` string) is never second-guessed:
 *   it passes through verbatim, because "we do not recognize it" is not evidence that
 *   the harness cannot serve it.
 *
 *   Platforms whose catalog is open (`opencode`, `other`) never fall back at all.
 */

/**
 * Vendor signatures. Deliberately family-level, never version-level, so a model
 * released tomorrow still classifies correctly.
 */
const VENDOR_PATTERNS = [
  ['anthropic', /\b(anthropic|claude|haiku|sonnet|opus)\b/i],
  ['openai', /\b(openai|gpt[-_.]?\d|gpt|chatgpt|codex|o[1-9](?:-mini|-pro)?)\b/i],
  ['google', /\b(google|gemini|bard|palm)\b/i],
  ['xai', /\b(xai|grok)\b/i],
  ['meta', /\b(meta|llama)\b/i],
  ['mistral', /\b(mistral|codestral|devstral)\b/i],
  ['deepseek', /\b(deepseek)\b/i],
  ['qwen', /\b(qwen|qwq)\b/i],
];

/**
 * Vendors each platform can serve. `null` = open catalog: the platform brokers many
 * providers (or we cannot know), so nothing is ever rejected there.
 */
const PLATFORM_VENDORS = {
  'claude-code': ['anthropic'],
  copilot: ['anthropic', 'openai', 'google'],
  codex: ['openai'],
  gemini: ['google'],
  opencode: null,
  other: null,
};

/**
 * The rung ALIASES a platform serves as part of its own dispatch contract: the words its
 * dispatch tool accepts in place of a model name. This is not the catalog this file
 * refuses to carry — these are family aliases the platform itself defines, so a model
 * released tomorrow still answers to them, and a platform that publishes no such aliases
 * simply has no entry here.
 *
 * WHY IT EXISTS: `auto` is the right INTERNAL answer for "the user configured no mapping",
 * but it must never reach a dispatch's `model:` field. Claude Code's dispatch tool rejects
 * the word outright (its enum is the four aliases), and a controller holding `auto` then
 * resolves it the only way it can — to its own model. Measured on one feature: a `capable`
 * tier with no mapping put five verifiers and four spec-review lenses on the controller's
 * `opus`, the exact silent over-provisioning the tier gate exists to stop.
 *
 * A platform is absent here for either of two reasons, and both are correct: its catalog is
 * open (nothing to name), or its dispatch carries no per-call model at all — Copilot CLI's
 * task tool takes none, and Gemini/opencode bind the model to a pre-defined agent instead.
 * Where no dispatch field exists, no value can leak into one.
 *
 * `capable` is deliberately NOT the platform's strongest rung. The roles that resolve
 * `capable` are reviewers executing a written procedure, and turn count
 * beats token price. The strongest rung is reached through the escalation ladder, with a
 * reason recorded in-thread — never as a default nobody chose.
 */
const PLATFORM_RUNGS = {
  'claude-code': { cheap: 'haiku', standard: 'sonnet', capable: 'sonnet' },
};

const TIERS = ['cheap', 'standard', 'capable'];

/**
 * The literal the Session Summary prints for a tier with no usable mapping. Exported
 * so the display wording has one owner and cannot drift into an improvised
 * "não definido" / "not set" per session.
 */
const AUTO_LABEL = 'auto';

/**
 * Classify a configured model name by vendor. Returns null when nothing matches —
 * which means "unknown", not "invalid".
 */
function identifyVendor(model) {
  if (typeof model !== 'string') return null;
  const name = model.trim();
  if (!name) return null;
  for (const [vendor, pattern] of VENDOR_PATTERNS) {
    if (pattern.test(name)) return vendor;
  }
  return null;
}

/**
 * Can `platform` serve `model`? Only a confidently-identified FOREIGN vendor is a no.
 */
function isModelAvailable(model, platform) {
  const vendors = PLATFORM_VENDORS[platform];
  if (!vendors) return true; // open catalog — never reject
  const vendor = identifyVendor(model);
  if (!vendor) return true; // unrecognized name — not our call to make
  return vendors.includes(vendor);
}

/**
 * Resolve the three tiers for `platform`.
 *
 * Returns `{ resolved, unavailable }` where `resolved.<tier>` is the model name to
 * dispatch with, or `null` meaning auto (unset, blank, or a model this harness cannot
 * serve), and `unavailable` lists the tiers that were configured but fell back, so the
 * session can say WHY a mapping the user wrote is not in effect instead of dropping it
 * in silence.
 */
function resolveModelTiers(modelTiers, platform) {
  const resolved = {};
  const unavailable = [];

  for (const tier of TIERS) {
    const raw = modelTiers?.[tier];
    const configured = typeof raw === 'string' ? raw.trim() : raw ?? null;

    if (!configured) {
      resolved[tier] = null;
      continue;
    }
    if (isModelAvailable(configured, platform)) {
      resolved[tier] = configured;
      continue;
    }
    resolved[tier] = null;
    unavailable.push({ tier, configured, vendor: identifyVendor(configured), platform });
  }

  return { resolved, unavailable };
}

/**
 * The model a dispatch may actually carry for `tier`, given `resolveModelTiers`' answer.
 *
 * The user's mapping wins. With none, the running platform's own rung alias. With neither,
 * the `auto` literal — and `auto` reaching a caller means the caller must pick the rung by
 * ROLE and pass that name explicitly: never the word `auto`, and never an omitted `model:`,
 * which inherits the controller's model and is the drift this file exists to remove.
 */
function resolveDispatchModel(resolvedValue, tier, platform) {
  if (resolvedValue) return resolvedValue;
  const rungs = PLATFORM_RUNGS[platform];
  if (rungs && rungs[tier]) return rungs[tier];
  return AUTO_LABEL;
}

/** Display value for one resolved tier: the model name, or the `auto` literal. */
function formatModelTier(resolvedValue) {
  return resolvedValue || AUTO_LABEL;
}

module.exports = {
  AUTO_LABEL,
  PLATFORM_RUNGS,
  TIERS,
  formatModelTier,
  identifyVendor,
  isModelAvailable,
  resolveDispatchModel,
  resolveModelTiers,
};
