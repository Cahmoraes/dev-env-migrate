#!/usr/bin/env node
/**
 * render-caveman-block.cjs — Deterministically render the Caveman Mode directive
 * to paste into a subagent prompt.
 *
 * WHY THIS EXISTS
 * The controller used to hand-fill a placeholder in each subagent prompt:
 *   "[If caveman is active: '...' | If not active: omit this section]"
 * Filling that in is a judgment call, and it was mis-filled in practice (the
 * "active" text emitted together with a contradicting "respond normally" note),
 * so dispatched implementers never activated caveman and burned extra tokens.
 * Per the superpowers philosophy, anything that must NOT depend on model judgment
 * is a deterministic script. This is that script: the block wording lives here,
 * once, and every prompt template / execution skill points to it instead of
 * duplicating a fill-in-the-blank placeholder.
 *
 * SESSION STATE PRECEDENCE
 * The dynamic question can turn caveman on for a session without touching the
 * file, so explicit flags always win over .superpowers/preferences.yml:
 *   --active <true|false>   session_caveman_active (overrides the file)
 *   --level  <level>        session_caveman_level (overrides the file)
 *   --repo-root <path>      where to read preferences when a flag is omitted
 *   --format <section|field>
 *       section (default) → a full "## Caveman Mode" markdown section, for the
 *                           implementer / spec-reviewer prompt templates
 *       field             → the bare directive sentence, for the code-quality
 *                           reviewer's `CAVEMAN:` field
 *   --help
 *
 * The level is passed through verbatim — this script is NOT the authority on
 * valid caveman levels (the `caveman` skill is); validating here would couple us
 * to that skill's level list and break forward-compatibility.
 *
 * Output (stdout): JSON { active, level, format, block }
 *   block — exact text to paste; "" when inactive (omit the section entirely).
 *
 * Exit codes: 0 success · 1 usage error.
 */

'use strict';

const { DEFAULTS, deepMerge, parseYaml, detectGitRoot } = require('./read-preferences.cjs');
const fs = require('fs');
const path = require('path');

const HELP = `render-caveman-block.cjs — render the Caveman Mode block for a subagent prompt.

Usage:
  node scripts/render-caveman-block.cjs [--active <true|false>] [--level <level>]
                                        [--repo-root <path>] [--format <section|field>]

Options:
  --active <true|false>   Session caveman state (overrides preferences file).
  --level  <level>        Caveman level (overrides preferences file).
  --repo-root <path>      Repository root for reading .superpowers/preferences.yml
                          when --active or --level is omitted.
  --format <section|field> Output shape (default: section).
  --help                  Show this help and exit 0.

Output (JSON stdout): { active, level, format, block }
  block is "" when caveman is inactive — omit the section from the prompt.`;

const VALID_FORMATS = ['section', 'field'];

function parseBool(raw, flag) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${flag} must be "true" or "false" (got "${raw}")`);
}

/**
 * Read optimization preferences from the file, falling back to DEFAULTS when the
 * repo/file is absent or unreadable. Only used to fill flags the caller omitted.
 */
function readOptimizationPrefs(repoRoot) {
  const root = repoRoot || detectGitRoot();
  if (!root) return DEFAULTS.optimization;
  const prefsPath = path.join(root, '.superpowers', 'preferences.yml');
  if (!fs.existsSync(prefsPath)) return DEFAULTS.optimization;
  let rawContent;
  try {
    rawContent = fs.readFileSync(prefsPath, 'utf8');
  } catch {
    return DEFAULTS.optimization;
  }
  const { parsed } = parseYaml(rawContent);
  return deepMerge(DEFAULTS, parsed).optimization;
}

/** Build the directive sentence (no header). */
function buildDirective(level) {
  return (
    `Caveman is active at level: \`${level}\`. Invoke \`/caveman ${level}\` before ` +
    'your first response and maintain it throughout your entire execution. ' +
    'Do not revert to normal mode.'
  );
}

/**
 * Render the block. Pure: given resolved state it returns the exact text.
 *   active=false → "" (the section is omitted)
 *   format=section → "## Caveman Mode\n\n<directive>"
 *   format=field   → "<directive>"
 */
function renderBlock(active, level, format) {
  if (!active) return '';
  const directive = buildDirective(level);
  if (format === 'field') return directive;
  return `## Caveman Mode\n\n${directive}`;
}

function main(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }

  let activeFlag = null;
  let levelFlag = null;
  let repoRoot = null;
  let format = 'section';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--active') {
      activeFlag = args[++i];
    } else if (arg === '--level') {
      levelFlag = args[++i];
    } else if (arg === '--repo-root') {
      repoRoot = args[++i];
    } else if (arg === '--format') {
      format = args[++i];
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(1);
    }
  }

  if (activeFlag === undefined || levelFlag === undefined || repoRoot === undefined || format === undefined) {
    process.stderr.write('A flag was given without a value.\n');
    process.exit(1);
  }

  if (!VALID_FORMATS.includes(format)) {
    process.stderr.write(`--format must be one of ${VALID_FORMATS.join('/')} (got "${format}")\n`);
    process.exit(1);
  }

  // Fill omitted flags from the preferences file (read once, only if needed).
  let prefs = null;
  if (activeFlag === null || levelFlag === null) {
    prefs = readOptimizationPrefs(repoRoot);
  }

  let active;
  try {
    active = activeFlag === null ? Boolean(prefs.caveman) : parseBool(activeFlag, '--active');
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const level = levelFlag === null ? prefs.caveman_level : levelFlag;

  const block = renderBlock(active, level, format);

  process.stdout.write(JSON.stringify({ active, level, format, block }, null, 2) + '\n');
  process.exit(0);
}

module.exports = { buildDirective, renderBlock, readOptimizationPrefs, VALID_FORMATS };

if (require.main === module) {
  main(process.argv);
}
