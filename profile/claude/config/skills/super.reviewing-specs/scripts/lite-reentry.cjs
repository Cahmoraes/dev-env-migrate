#!/usr/bin/env node
/**
 * lite-reentry.cjs — the "lite re-entry" projection for a STANDALONE spec review.
 *
 * WHY THIS EXISTS
 *   super.reviewing-specs is a self-standing route: the user can invoke it directly
 *   (`/super.reviewing-specs path/to/spec.md`) WITHOUT going through
 *   super.using-superpowers' triage, which is the step that normally reads
 *   .superpowers/preferences.yml and latches the session_* variables. Run standalone,
 *   none of that state exists. Rather than re-run the full onboarding/re-entry (which
 *   derives ~12 session vars, gates platforms, runs the re-sync gate) just to review a
 *   spec, this script recovers ONLY the three inputs this skill actually consumes:
 *     - capableModel  → build-review-dispatch.cjs --capable-model (model_tiers.capable)
 *     - caveman.*     → render-caveman-block.cjs (optimization.caveman / _level)
 *     - language      → the {LANGUAGE} placeholder in agents/spec-reviewer.md
 *
 *   It is a projection, not a second parser: it reuses read-preferences.cjs's exported
 *   parse/merge/normalize functions IN-PROCESS (one fs read, one parse, no child process
 *   — faster than derive-session-state.cjs, which shells out to node twice). So the
 *   parse/merge/normalize semantics are identical to the full re-entry, and the SSOT
 *   for reading preferences stays in exactly one place.
 *
 * DEGRADES SAFELY
 *   No .superpowers/preferences.yml (the standalone-outside-a-superpowers-repo case) →
 *   found:false and every value is the embedded DEFAULT (capable "auto", caveman off,
 *   language pt-BR). Only `found` distinguishes "file absent" from "file present with
 *   defaults" — same contract as read-preferences.cjs.
 *
 * Usage:
 *   node scripts/lite-reentry.cjs [--repo-root <path>]
 *
 * Options:
 *   --repo-root <path>  Explicit repo root (else git detection via read-preferences).
 *   --help              Show this help and exit 0.
 *
 * Output (JSON to stdout): { found, repoRoot, capableModel, caveman: { active, level }, language }
 *
 * Exit codes: 0 success · 1 usage error.
 */

'use strict';

const { loadPreferences } = require('../../super.using-superpowers/scripts/read-preferences.cjs');

const HELP = `lite-reentry.cjs — recover only the preferences a standalone spec review needs.

Usage:
  node scripts/lite-reentry.cjs [--repo-root <path>]

Options:
  --repo-root <path>  Explicit repo root (else git detection).
  --help              Show this help and exit 0.

Output (JSON stdout): { found, repoRoot, capableModel, caveman: { active, level }, language }
`;

// Resolve the capable model the same way build-review-dispatch.cjs does at its input
// boundary: null/empty → "auto" (harness picks the most capable), any name → verbatim.
function resolveCapable(modelTiers) {
  const raw = modelTiers && typeof modelTiers.capable === 'string' ? modelTiers.capable.trim() : '';
  return raw || 'auto';
}

/**
 * Project the three fields this skill consumes out of the merged preferences.
 * Delegates the read/parse/merge/normalize to read-preferences.cjs's single in-process
 * loadPreferences (same path the full re-entry uses), then keeps only what a spec
 * review needs. Returns the same shape whether the file is present, absent, or the
 * repo is not a git repo — only `found` distinguishes them.
 */
function liteReentry(repoRoot) {
  const { result, root } = loadPreferences(repoRoot);
  const prefs = result.preferences;
  return {
    found: result.found,
    repoRoot: root,
    capableModel: resolveCapable(prefs.model_tiers),
    caveman: {
      active: Boolean(prefs.optimization.caveman),
      level: prefs.optimization.caveman_level,
    },
    language: prefs.communication.language,
  };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let repoRoot = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--repo-root' && args[i + 1]) {
      repoRoot = args[++i];
    }
  }

  const result = liteReentry(repoRoot);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { liteReentry, resolveCapable };

if (require.main === module) {
  main(process.argv);
}
