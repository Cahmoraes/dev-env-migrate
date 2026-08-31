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
 *   caveman + model_tiers + qa_gate + visual_companion + auto_commit + language are platform-agnostic
 *   (apply on every platform).
 *   The native-review variables exist only on their own platform:
 *     - claude_code.{simplify, code_review_final, code_review_effort} → Claude Code
 *     - copilot.review_final                                          → Copilot CLI
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
 * SCOPE
 *   Only PREFERENCES-DERIVED variables are emitted. Controller latches
 *   (session_caveman_in_effect, session_caveman_prompted)
 *   are runtime bookkeeping, not configuration — they are NOT derived here.
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
 *   { platform, preferencesFound, malformed, preferencesPath, sessionState, corporateArtifacts }
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
  { platform, preferencesFound, malformed, preferencesPath, sessionState, corporateArtifacts }
corporateArtifacts is a disk probe ({ declared, enabled, declaredButDisabled, configPath,
count }); it never carries the declared entries themselves.
sessionState holds only preferences-derived variables; controller latches
(session_caveman_in_effect / _prompted) are not derived here.
`.trimStart();

/**
 * Read the merged preferences by calling read-preferences.cjs's loadPreferences
 * IN-PROCESS (no subprocess spawn), so the YAML parse/merge/normalize logic lives in
 * exactly one place and this runs with one fewer node process. We drop the warnings
 * array — the previous spawn already discarded read-preferences' stderr (stdio:'ignore').
 *
 * `root` comes back too, because corporate-artifacts.yml is the SIBLING of the
 * preferences.yml that granted consent. That is not always the root we were handed: inside
 * a linked worktree the loader falls back to the main working tree (`.superpowers/` is
 * gitignored, so a worktree has none). Probing the input root there would report "no
 * corporate artifacts" for a repo that has them.
 */
function readPreferences(repoRoot) {
  const { result, root } = loadPreferences(repoRoot);
  return { result, root };
}

/**
 * Map merged preferences to the session_* variables, applying platform gating.
 * This is the single source of truth for the variable→preference mapping.
 */
function deriveSessionState(preferences, platform) {
  const isClaudeCode = platform === 'claude-code';
  const isCopilot = platform === 'copilot';

  return {
    // Platform-agnostic — caveman applies on every platform.
    session_caveman_active: Boolean(preferences.optimization.caveman),
    session_caveman_level: preferences.optimization.caveman_level,

    // Platform-agnostic workflow gates. qa_gate drives whether the end-of-implementation
    // QA gate (super.user-story-verification) runs at all; false skips it silently and
    // suppresses every QA mention, including at the PRD step (independent verification is
    // unaffected — it is always-on). auto_commit is surfaced for the session-state display
    // (the execution skills still read workflow.auto_commit directly at their commit gate).
    session_qa_gate_enabled: Boolean(preferences.workflow.qa_gate),
    // visual_companion drives whether super.brainstorming may offer the browser companion at all;
    // false skips the offer silently (no consent question, no browser mention), true leaves the
    // existing consent-gated behaviour untouched.
    session_visual_companion_enabled: Boolean(preferences.workflow.visual_companion),
    session_auto_commit: Boolean(preferences.workflow.auto_commit),

    // Platform-agnostic — whether the repo declares corporate artifacts. Surfaced here so the
    // entry point learns it from THIS call instead of spending a second tool call on
    // read-preferences.cjs just for one boolean (the rest of that object is already mapped above).
    session_has_corporate_artifacts: Boolean(preferences.context?.has_corporate_artifacts),

    // Platform-agnostic — the human-language every skill writes its user-facing artifacts in
    // (validation/QA reports, spec/PRD prose, subagent-authored notes). Defaults to pt-BR.
    // The structural skeleton of machine-validated artifacts (report section headings, field
    // labels, status tokens like PASS ✅/FAIL ❌, and FR/AC/US identifiers) stays canonical
    // regardless — only human-readable prose follows this. See the report-producing skills
    // (super.independent-verification, super.user-story-verification) for that split.
    session_language: preferences.communication.language,

    // Claude Code native — resolve to safe defaults off Claude Code.
    session_simplify_enabled: isClaudeCode ? Boolean(preferences.claude_code.simplify) : false,
    session_code_review_final_enabled: isClaudeCode ? Boolean(preferences.claude_code.code_review_final) : false,
    session_code_review_effort: isClaudeCode
      ? preferences.claude_code.code_review_effort
      : DEFAULTS.claude_code.code_review_effort,

    // Copilot CLI native — resolve to safe default off Copilot CLI.
    session_copilot_review_final_enabled: isCopilot ? Boolean(preferences.copilot.review_final) : false,

    // Platform-agnostic — abstract model tiers → concrete model names for the
    // harness. null = "auto" (controller picks least-powerful-sufficient per task,
    // never inherits its own model). See subagent-driven-development, "Model Selection" section.
    session_model_tier_cheap: preferences.model_tiers?.cheap ?? null,
    session_model_tier_standard: preferences.model_tiers?.standard ?? null,
    session_model_tier_capable: preferences.model_tiers?.capable ?? null,
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

  let prefsResult;
  let resolvedRoot;
  try {
    ({ result: prefsResult, root: resolvedRoot } = readPreferences(repoRoot));
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
    process.exit(1);
  }

  const result = {
    platform,
    preferencesFound: Boolean(prefsResult.found),
    malformed: Boolean(prefsResult.malformed),
    preferencesPath: prefsResult.preferencesPath ?? null,
    sessionState: deriveSessionState(prefsResult.preferences, platform),
    corporateArtifacts: probeCorporateArtifacts(
      resolvedRoot,
      Boolean(prefsResult.preferences.context?.has_corporate_artifacts),
    ),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { PLATFORMS, deriveSessionState, probeCorporateArtifacts };

if (require.main === module) {
  main(process.argv);
}
