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
 *   into skills that may run on another (Codex, Gemini). This script is the single
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
 *   caveman + memory + model_tiers are platform-agnostic (apply on every platform).
 *   The native-review variables exist only on their own platform:
 *     - claude_code.{simplify, code_review_final, code_review_effort} → Claude Code
 *     - copilot.review_final                                          → Copilot CLI
 *   Off their platform they resolve to their safe default, so a session can never
 *   try to run a native skill the current platform does not have.
 *
 * MODEL TIERS
 *   model_tiers.{cheap,standard,capable} map abstract execution tiers to concrete
 *   model names for the user's harness (see super.subagent-driven-development
 *   § Model Selection). null = "auto" — the controller picks the least-powerful
 *   model that fits each task's tier from whatever the harness offers, instead of
 *   inheriting its own (over-provisioning) model. Surfaced here so the Session
 *   State Re-Entry Guard restores them after a compaction like every other var.
 *
 * SCOPE
 *   Only PREFERENCES-DERIVED variables are emitted. Controller latches
 *   (session_caveman_in_effect, session_caveman_prompted, session_resync_completed)
 *   are runtime bookkeeping, not configuration — they are NOT derived here.
 *
 * Usage:
 *   node scripts/derive-session-state.cjs [--platform <name>] [--repo-root <path>]
 *
 * Options:
 *   --platform <name>   claude-code (default) | copilot | codex | gemini | other
 *   --repo-root <path>  Explicit repo root (else git detection, via read-preferences).
 *   --help              Show this help and exit 0.
 *
 * Output (JSON to stdout): { platform, preferencesFound, sessionState }
 *
 * Exit codes:
 *   0  success
 *   1  usage error (unknown platform/flag) or unrecoverable failure
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { DEFAULTS } = require('./read-preferences.cjs');

const PLATFORMS = ['claude-code', 'copilot', 'codex', 'gemini', 'other'];

const HELP = `
derive-session-state.cjs — Derive superpowers session_* variables from preferences.

Usage:
  node scripts/derive-session-state.cjs [--platform <name>] [--repo-root <path>]

Options:
  --platform <name>   ${PLATFORMS.join(' | ')} (default: claude-code)
  --repo-root <path>  Explicit repo root (else git detection).
  --help              Show this help and exit 0.

Output (JSON to stdout): { platform, preferencesFound, sessionState }
sessionState holds only preferences-derived variables; controller latches
(session_caveman_in_effect / _prompted / _resync_completed) are not derived here.
`.trimStart();

/**
 * Read the merged preferences by delegating to read-preferences.cjs, so the
 * YAML parse/merge/normalize logic lives in exactly one place.
 */
function readPreferences(repoRoot) {
  const readPrefsPath = path.join(__dirname, 'read-preferences.cjs');
  const args = [readPrefsPath];
  if (repoRoot) {
    args.push('--repo-root', repoRoot);
  }
  const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

/**
 * Map merged preferences to the session_* variables, applying platform gating.
 * This is the single source of truth for the variable→preference mapping.
 */
function deriveSessionState(preferences, platform) {
  const isClaudeCode = platform === 'claude-code';
  const isCopilot = platform === 'copilot';

  return {
    // Platform-agnostic — caveman and memory apply on every platform.
    session_memory_enabled: Boolean(preferences.memory.persistent_memory),
    session_caveman_active: Boolean(preferences.optimization.caveman),
    session_caveman_level: preferences.optimization.caveman_level,

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
    // never inherits its own model). See subagent-driven-development § Model Selection.
    session_model_tier_cheap: preferences.model_tiers?.cheap ?? null,
    session_model_tier_standard: preferences.model_tiers?.standard ?? null,
    session_model_tier_capable: preferences.model_tiers?.capable ?? null,
  };
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
  try {
    prefsResult = readPreferences(repoRoot);
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
    process.exit(1);
  }

  const result = {
    platform,
    preferencesFound: Boolean(prefsResult.found),
    sessionState: deriveSessionState(prefsResult.preferences, platform),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { PLATFORMS, deriveSessionState };

if (require.main === module) {
  main(process.argv);
}
