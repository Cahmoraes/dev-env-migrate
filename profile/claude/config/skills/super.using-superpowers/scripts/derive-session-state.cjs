#!/usr/bin/env node
/**
 * derive-session-state.cjs — Derive the superpowers session variables from
 * .superpowers/preferences.yml, deterministically and in ONE place.
 *
 * WHY THIS EXISTS
 *   The mapping "session_* variable ← preferences.X.Y" used to live as a prose
 *   table duplicated across super.using-superpowers and every execution skill.
 *   Every new preference meant editing 4+ files, and the platform-specific rows
 *   ("always false off Claude Code / Copilot CLI") leaked one platform's detail
 *   into skills that may run on another (Codex, Gemini, opencode). This script is the single
 *   source of truth for that mapping and the platform gating, so the skills just
 *   run it and read the resolved values — no hand-mapping, no duplication, no leak.
 *   This is the superpowers rule that anything which must not depend on model
 *   judgment becomes a deterministic script.
 *
 * LAYERING
 *   read-preferences.cjs   → reads / merges / normalizes the raw YAML (SSOT for READING).
 *   derive-session-state   → maps those preferences to session_* vars and applies
 *                            platform gating (SSOT for the MAPPING). It shells out
 *                            to read-preferences.cjs, so the parse/merge logic is
 *                            never duplicated.
 *
 * PLATFORM GATING
 *   model_tiers + qa_gate + visual_companion + auto_commit
 *   are platform-agnostic
 *   (apply on every platform).
 *   The native-review variables exist only on their own platform:
 *     - claude_code.{review_final, review_effort} → Claude Code
 *     - copilot.review_final                      → Copilot CLI
 *   Off their platform they resolve to their safe default, so a session can never
 *   try to run a native skill the current platform does not have.
 *
 * MODEL TIERS
 *   model_tiers.{cheap,standard,capable} map abstract execution tiers to concrete
 *   model names for the user's harness (see super.subagent-driven-development,
 *   "Model Selection" section). null = "auto" — the controller picks the least-powerful
 *   model that fits each task's tier from whatever the harness offers, instead of
 *   inheriting its own (over-provisioning) model. Surfaced here so the Session
 *   State Re-Entry Guard restores them after a compaction like every other var.
 *
 *   The tiers emitted here are RESOLVED for the running platform, not echoed: the same
 *   preferences.yml is read by every harness, so a mapping written on one names models
 *   another does not serve (`capable: gpt-5` configured from Copilot CLI, then read in a
 *   Claude Code session). A tier naming a model this platform cannot serve resolves to
 *   null — the same `auto` an unset tier already means — so no dispatch is ever built on
 *   a model that does not exist here. `lib/model-tiers.cjs` owns that rule and only falls
 *   back on a CONFIDENTLY foreign vendor; an unrecognized name passes through verbatim.
 *   Every fallback is reported in top-level `unavailableModelTiers` so the Session
 *   Summary can say why a configured mapping is not in effect instead of hiding it.
 *
 * WHY corporateArtifacts IS A DISK PROBE, NOT A PREFERENCE
 *   `session_has_corporate_artifacts` is the owner's CONSENT, read from preferences.yml.
 *   Whether `.superpowers/corporate-artifacts.yml` actually exists is a separate fact, and
 *   nothing used to establish it: the router is told to warn when the file is present while
 *   the flag is off, but no step ever looked at the disk, so that branch could not fire and
 *   a declared corporate document was ignored in total silence. This probe is what makes
 *   the branch reachable, and what lets the Session Summary name the file.
 *
 *   The probe reports HOW MANY entries are declared and WHERE the file is. It does NOT
 *   report the entries themselves: presence is not consent, corporate artifacts win on
 *   conflict, and a path list in the controller's context is an invitation to act on an
 *   unconsented declaration. Under consent the router reads the file itself anyway.
 *
 * Usage:
 *   node scripts/derive-session-state.cjs [--platform <name>] [--repo-root <path>]
 *
 * Options:
 *   --platform <name>   claude-code (default) | copilot | codex | gemini | opencode | other
 *   --repo-root <path>  Explicit repo root (else git detection, via read-preferences).
 *   --help              Show this help and exit 0.
 *
 * Output (JSON to stdout):
 *   { platform, preferencesFound, malformed, preferencesPath, sessionState,
 *     corporateArtifacts, unavailableModelTiers, projectProfile }
 *
 * WHY projectProfile IS TOP-LEVEL AND CARRIES `declared`
 *   The project profile (stack + manifest) is read by execution skills, not by the router's
 *   gates, so it is not a session_* variable — it rides next to corporateArtifacts as its
 *   own object. `declared` is the disk fact the values cannot carry: an older
 *   preferences.yml (written before the section existed) reads found:true with both values
 *   null, and a consumer that saw only the nulls would conclude "stack not decided" instead
 *   of "nobody was asked yet". The router runs ONLY the project step of the wizard when
 *   preferencesFound && !projectProfile.declared. The commands (test, setup, format) are
 *   deliberately NOT here: the repo's instructions file and manifest carry them.
 *
 * WHY IT ALSO CARRIES preferencesFound / malformed / has_corporate_artifacts
 *   The entry point used to run read-preferences.cjs AND this script back to back, one
 *   tool call each, over the same YAML — the first one only for `found`, `malformed` and
 *   `context.has_corporate_artifacts`, since every other field it read is already mapped
 *   into sessionState here. Those three now ride along, so session start is ONE call.
 *   read-preferences.cjs stays the SSOT for reading (and the raw object still matters for
 *   the option-0 wizard, which needs current values as pre-selected defaults).
 *
 * Exit codes:
 *   0  success
 *   1  usage error (unknown platform/flag) or unrecoverable failure
 */

'use strict';

const path = require('path');
const { DEFAULTS, loadPreferences } = require('./read-preferences.cjs');
const { resolveCorporateArtifacts } = require('./lib/corporate-artifacts.cjs');
const { resolveDispatchModel, resolveModelTiers } = require('./lib/model-tiers.cjs');

const PLATFORMS = ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other'];

const HELP = `
derive-session-state.cjs — Derive superpowers session_* variables from preferences.

Usage:
  node scripts/derive-session-state.cjs [--platform <name>] [--repo-root <path>]

Options:
  --platform <name>   ${PLATFORMS.join(' | ')} (default: claude-code)
  --repo-root <path>  Explicit repo root (else git detection).
  --help              Show this help and exit 0.

Output (JSON to stdout):
  { platform, preferencesFound, malformed, preferencesPath, sessionState,
    corporateArtifacts, unavailableModelTiers, projectProfile }
projectProfile is { declared, stack, manifest }; declared:false means the project: section
  is absent and the wizard's project step still has to run (values are then null). The
  commands (test, setup, format) are not here: read the repo's instructions file/manifest.
unavailableModelTiers lists tiers configured with a model this platform cannot serve;
each resolved to null (auto) in sessionState instead.
corporateArtifacts is a disk probe ({ declared, enabled, declaredButDisabled, configPath,
count }); it never carries the declared entries themselves.
`.trimStart();

/**
 * Map merged preferences to the session_* variables, applying platform gating.
 * This is the single source of truth for the variable→preference mapping.
 */
function deriveSessionState(preferences, platform) {
  const isClaudeCode = platform === 'claude-code';
  const isCopilot = platform === 'copilot';
  const { resolved } = resolveModelTiers(preferences.model_tiers, platform);
  const modelTiers = {
    cheap: resolveDispatchModel(resolved.cheap, 'cheap', platform),
    standard: resolveDispatchModel(resolved.standard, 'standard', platform),
    capable: resolveDispatchModel(resolved.capable, 'capable', platform),
  };

  return {
    // Platform-agnostic workflow gates. qa_gate drives whether the end-of-implementation QA gate (super.user-story-verification)
    // exists at all; false skips it silently and suppresses every QA mention, including at the
    // PRD step. `true` and `ask` both keep the gate in the flow — `ask` only moves the consent
    // from the preference to one question at the gate (PRD present), so it is surfaced as its
    // own flag instead of a third value in the boolean every consumer already branches on.
    // auto_commit is surfaced for the session-state
    // display (the execution skills still read workflow.auto_commit directly at their commit gate).
    session_qa_gate_enabled: preferences.workflow.qa_gate !== false,
    session_qa_gate_ask: preferences.workflow.qa_gate === 'ask',
    // visual_companion drives whether super.brainstorming may offer the browser companion at all;
    // false skips the offer silently (no consent question, no browser mention), true leaves the
    // existing consent-gated behaviour untouched.
    session_visual_companion_enabled: Boolean(preferences.workflow.visual_companion),
    session_auto_commit: Boolean(preferences.workflow.auto_commit),
    // finish_action is the destination declared before the work starts: `ask` (default) keeps
    // the finishing menu; merge/pr/keep let super.finishing-a-development-branch run that option
    // without a question. Already clamped by the loader, so only the four valid values arrive.
    session_finish_action: preferences.workflow.finish_action,

    // Platform-agnostic — whether the repo declares corporate artifacts. Surfaced here so the
    // entry point learns it from THIS call instead of spending a second tool call on
    // read-preferences.cjs just for one boolean (the rest of that object is already mapped above).
    session_has_corporate_artifacts: Boolean(preferences.context?.has_corporate_artifacts),

    // Claude Code native — resolve to safe defaults off Claude Code.
    session_code_review_final_enabled: isClaudeCode ? Boolean(preferences.claude_code.review_final) : false,
    session_code_review_effort: isClaudeCode
      ? preferences.claude_code.review_effort
      : DEFAULTS.claude_code.review_effort,

    // Copilot CLI native — resolve to safe default off Copilot CLI.
    session_copilot_review_final_enabled: isCopilot ? Boolean(preferences.copilot.review_final) : false,

    // Abstract model tiers → the concrete model name a dispatch may carry on this
    // platform. An unset tier and a tier naming a model this harness cannot serve both land
    // on the platform's own rung alias; only a platform publishing no aliases leaves "auto"
    // here, and there the controller picks the rung by role and passes it explicitly. These
    // variables are copied verbatim onto dispatches, so "auto" reaching one is not a neutral
    // default: the dispatch tool rejects the word, and a controller resolves it to its own
    // model. See subagent-driven-development, "Model Selection".
    session_model_tier_cheap: modelTiers.cheap,
    session_model_tier_standard: modelTiers.standard,
    session_model_tier_capable: modelTiers.capable,
  };
}

/**
 * Declaration state of the repo's corporate artifacts, WITHOUT their values.
 * See "WHY corporateArtifacts IS A DISK PROBE" above for why `entries` is dropped —
 * the omission is the consent gate, not an oversight.
 */
function probeCorporateArtifacts(repoRoot, enabled) {
  const { declared, declaredButDisabled, configPath, count } = resolveCorporateArtifacts(repoRoot, { enabled });
  return { declared, enabled: Boolean(enabled), declaredButDisabled, configPath, count };
}

/**
 * The project profile as the skills consume it: the two project.* values (stack, manifest)
 * plus the `declared` flag from the reader. See "WHY projectProfile IS TOP-LEVEL" above.
 */
function deriveProjectProfile(prefsResult) {
  const project = (prefsResult.preferences && prefsResult.preferences.project) || DEFAULTS.project;
  return { declared: Boolean(prefsResult.projectDeclared), ...DEFAULTS.project, ...project };
}

function main(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let platform = 'claude-code';
  let repoRoot = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[++i];
    } else if (args[i] === '--repo-root' && args[i + 1]) {
      repoRoot = path.resolve(args[++i]);
    }
  }

  if (!PLATFORMS.includes(platform)) {
    process.stderr.write(`--platform must be one of ${PLATFORMS.join('/')} (got "${platform}")\n`);
    process.exit(1);
  }

  let result;
  try {
    result = buildSessionReport({ platform, repoRoot });
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

// The whole bootstrap JSON as one object — the CLI prints it; render-preferences-view.cjs
// renders it. One builder, so the view can never disagree with the JSON the router read.
function buildSessionReport({ platform = 'claude-code', repoRoot = null } = {}) {
  // In-process loader (no `node read-preferences.cjs` spawn); warnings are dropped. `root` is
  // the root the loader resolved — inside a linked worktree it falls back to the main working
  // tree, and corporate-artifacts.yml is the SIBLING of the preferences.yml that granted consent,
  // so probing the input root there would report "no corporate artifacts" for a repo that has them.
  const { result: prefsResult, root: resolvedRoot } = loadPreferences(repoRoot);
  return {
    platform,
    preferencesFound: Boolean(prefsResult.found),
    malformed: Boolean(prefsResult.malformed),
    preferencesPath: prefsResult.preferencesPath ?? null,
    sessionState: deriveSessionState(prefsResult.preferences, platform),
    corporateArtifacts: probeCorporateArtifacts(
      resolvedRoot,
      Boolean(prefsResult.preferences.context?.has_corporate_artifacts),
    ),
    unavailableModelTiers: resolveModelTiers(prefsResult.preferences.model_tiers, platform).unavailable,
    projectProfile: deriveProjectProfile(prefsResult),
  };
}

module.exports = { PLATFORMS, deriveSessionState, probeCorporateArtifacts, buildSessionReport };

if (require.main === module) {
  main(process.argv);
}
