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
 *   spec, this script recovers ONLY the input this skill actually consumes:
 *     - capableModel  → build-review-dispatch.cjs --capable-model (model_tiers.capable)
 *
 *   It is a projection, not a second parser: it reuses read-preferences.cjs's exported
 *   parse/merge/normalize functions IN-PROCESS (one fs read, one parse, no child process
 *   — faster than derive-session-state.cjs, which shells out to node twice). So the
 *   parse/merge/normalize semantics are identical to the full re-entry, and the SSOT
 *   for reading preferences stays in exactly one place.
 *
 * DEGRADES SAFELY
 *   No .superpowers/preferences.yml (the standalone-outside-a-superpowers-repo case) →
 *   found:false and every value is the embedded DEFAULT (capable "auto").
 *   Only `found` distinguishes "file absent" from "file present with
 *   defaults" — same contract as read-preferences.cjs.
 *
 * Usage:
 *   node scripts/lite-reentry.cjs [--repo-root <path>] [--platform <name>]
 *
 * Options:
 *   --repo-root <path>  Explicit repo root (else git detection via read-preferences).
 *   --platform <name>   Running harness: picks which catalog applies, and supplies the
 *                       `capable` rung alias when preferences map none. Default `other`
 *                       = open catalog, nothing dropped, no alias to supply.
 *   --help              Show this help and exit 0.
 *
 * Output (JSON to stdout): { found, repoRoot, capableModel }
 *
 * Exit codes: 0 success · 1 usage error.
 */

'use strict';

const { loadPreferences } = require('../../super.using-superpowers/scripts/read-preferences.cjs');
const {
  resolveDispatchModel,
  resolveModelTiers,
} = require('../../super.using-superpowers/scripts/lib/model-tiers.cjs');

const HELP = `lite-reentry.cjs — recover only the preferences a standalone spec review needs.

Usage:
  node scripts/lite-reentry.cjs [--repo-root <path>] [--platform <name>]

Options:
  --repo-root <path>  Explicit repo root (else git detection).
  --platform <name>   Running harness (claude-code | copilot | codex | gemini | opencode |
                      other). Unset, or a capable model this platform cannot serve,
                      resolves to the platform's own capable rung alias; "auto" only
                      where it publishes none. Default "other": open catalog.
  --help              Show this help and exit 0.

Output (JSON stdout): { found, repoRoot, capableModel }
`;

// Resolve the capable model the same way build-review-dispatch.cjs does at its input
// boundary: any configured name → verbatim; null/empty → the platform's own `capable`
// rung alias, and only where it publishes none does "auto" survive as the answer.
//
// A model the RUNNING harness cannot serve is the same situation as no mapping at all —
// preferences.yml is per-repo, model names are per-harness, so a `capable` written from
// one CLI can name a model another does not have. `platform` is what tells the shared
// rule which catalog applies; it defaults to `other` (open catalog, nothing rejected),
// so an omitted flag keeps this script's original behaviour exactly.
function resolveCapable(modelTiers, platform) {
  const { resolved } = resolveModelTiers(modelTiers || {}, platform);
  return resolveDispatchModel(resolved.capable, 'capable', platform);
}

/**
 * Project the fields this skill consumes out of the merged preferences.
 * Delegates the read/parse/merge/normalize to read-preferences.cjs's single in-process
 * loadPreferences (same path the full re-entry uses), then keeps only what a spec
 * review needs. Returns the same shape whether the file is present, absent, or the
 * repo is not a git repo — only `found` distinguishes them.
 */
function liteReentry(repoRoot, platform = 'other') {
  const { result, root } = loadPreferences(repoRoot);
  const prefs = result.preferences;
  return {
    found: result.found,
    repoRoot: root,
    capableModel: resolveCapable(prefs.model_tiers, platform),
  };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let repoRoot = null;
  // Optional: the harness this review is running on. Omitted → `other`, an open
  // catalog, so `capableModel` comes back exactly as configured (original behaviour).
  let platform = 'other';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--repo-root' && args[i + 1]) {
      repoRoot = args[++i];
    } else if (args[i] === '--platform' && args[i + 1]) {
      platform = args[++i];
    }
  }

  const result = liteReentry(repoRoot, platform);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { liteReentry, resolveCapable };

if (require.main === module) {
  main(process.argv);
}
