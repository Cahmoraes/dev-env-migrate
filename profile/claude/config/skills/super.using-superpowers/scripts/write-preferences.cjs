#!/usr/bin/env node
/**
 * write-preferences.cjs — Render a canonical .superpowers/preferences.yml from a
 * values object, with round-trip validation against the real reader.
 *
 * The reader (read-preferences.cjs) uses a hand-rolled YAML parser. Hand-writing
 * the file from the LLM risks producing YAML that parser silently misreads. This
 * script renders the file deterministically and then re-parses it with the EXACT
 * same parser the reader uses — refusing to write if the round-trip is lossy. So
 * a file this script writes is guaranteed to read back as intended.
 *
 * Input (JSON via --input-file <path> or stdin): a partial preferences object,
 * same shape as read-preferences.cjs `preferences`. Missing keys take defaults:
 *   {
 *     "workflow": { "auto_commit": bool, "confirm_destructive_actions": bool },
 *     "communication": { "language": str },
 *     "copilot": { "rubber_duck": bool, "review_final": bool },
 *     "claude_code": { "simplify": bool, "code_review_final": bool, "code_review_effort": str },
 *     "context": { "has_corporate_artifacts": bool },
 *     "optimization": { "caveman": bool, "caveman_level": str },
 *     "memory": { "persistent_memory": bool },
 *     "model_tiers": { "cheap": str|null, "standard": str|null, "capable": str|null }
 *   }
 *
 * Usage:
 *   node scripts/write-preferences.cjs --input-file prefs.json [--repo-root <path>] [--dry-run]
 *   echo '<json>' | node scripts/write-preferences.cjs --repo-root <path>
 *
 * Exit codes:
 *   0  written (or printed under --dry-run)
 *   2  round-trip validation failed — nothing written (would-be-unreadable file)
 *   1  usage error
 *
 * Output (stdout): JSON { written, dryRun, path, roundTripValid, preferences }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULTS, deepMerge, parseYaml, detectGitRoot, normalizeCodeReviewEffort } = require('./read-preferences.cjs');

const HELP = `
write-preferences.cjs — Render a canonical .superpowers/preferences.yml with round-trip validation.

Usage:
  node scripts/write-preferences.cjs --input-file <prefs.json> [--repo-root <path>] [--dry-run]
  echo '<json>' | node scripts/write-preferences.cjs --repo-root <path>

Options:
  --input-file <path>  JSON file with the (partial) preferences object
  --repo-root <path>   Repository root (default: git root of cwd)
  --dry-run            Print the rendered YAML and result without writing
  --help               Show this help and exit 0
`.trimStart();

function usage(message) {
  process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const options = { inputFile: null, repoRoot: null, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--input-file') { options.inputFile = path.resolve(args[++i] || usage('--input-file needs a value')); continue; }
    if (arg === '--repo-root') { options.repoRoot = path.resolve(args[++i] || usage('--repo-root needs a value')); continue; }
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    usage(`Unknown argument: ${arg}`);
  }
  return options;
}

function readInput(inputFile) {
  let raw;
  if (inputFile) {
    if (!fs.existsSync(inputFile)) usage(`input file not found: ${inputFile}`);
    raw = fs.readFileSync(inputFile, 'utf8');
  } else {
    try {
      raw = fs.readFileSync(0, 'utf8');
    } catch {
      usage('no --input-file given and stdin is empty');
    }
  }
  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      usage(`input is not valid JSON: ${err.message}`);
    }
  }
  return {}; // empty input → all defaults
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function renderScalar(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Render a nested key line; empty value becomes `key:` (parses back to null). */
function kv(key, value) {
  const rendered = renderScalar(value);
  return rendered === '' ? `  ${key}:` : `  ${key}: ${rendered}`;
}

function renderYaml(p) {
  return [
    '# Superpowers Workflow Preferences',
    '# Managed by write-preferences.cjs (round-trip validated). Edit manually or ask the agent to update.',
    '',
    'workflow:',
    kv('auto_commit', p.workflow.auto_commit),
    kv('confirm_destructive_actions', p.workflow.confirm_destructive_actions),
    '',
    'communication:',
    kv('language', p.communication.language),
    '',
    '# Platform-specific. The copilot: section is ignored by Claude Code, Codex, and Gemini CLI.',
    '# review_final: run the native `review` skill at the final review as an extra bug-focused pass',
    '# on top of the default final reviewer. Additive (spec + quality gates always run); no effort levels.',
    'copilot:',
    kv('rubber_duck', p.copilot.rubber_duck),
    kv('review_final', p.copilot.review_final),
    '',
    '# Platform-specific. The claude_code: section is ignored by Copilot CLI, Codex, and Gemini CLI.',
    '# Claude Code native skills, all off by default. Additive — spec + quality gates always run.',
    '# simplify: run /simplify on changed code during execution (per task; applies cleanups).',
    '# code_review_final: run /code-review at the final review as an extra bug-focused pass on top',
    '# of the default final reviewer.',
    '# code_review_effort: low | medium | high | max (ultra unsupported — cloud, separate tier).',
    'claude_code:',
    kv('simplify', p.claude_code.simplify),
    kv('code_review_final', p.claude_code.code_review_final),
    kv('code_review_effort', p.claude_code.code_review_effort),
    '',
    '# When has_corporate_artifacts is true, the agent reads .superpowers/corporate-artifacts.yml.',
    'context:',
    kv('has_corporate_artifacts', p.context.has_corporate_artifacts),
    '',
    '# Token optimization. caveman applies only to execution/review phases.',
    '# caveman_level: lite | full | ultra | wenyan-lite | wenyan-full | wenyan-ultra.',
    'optimization:',
    kv('caveman', p.optimization.caveman),
    kv('caveman_level', p.optimization.caveman_level),
    '',
    '# Persistent memory (.memory/ SQLite). false = recall/persist skipped (data not deleted).',
    'memory:',
    kv('persistent_memory', p.memory.persistent_memory),
    '',
    '# Maps abstract model tiers (see super.subagent-driven-development § Model Selection) to',
    '# concrete model names for THIS harness. Leave empty to let the harness pick.',
    'model_tiers:',
    kv('cheap', p.model_tiers.cheap),
    kv('standard', p.model_tiers.standard),
    kv('capable', p.model_tiers.capable),
    '',
  ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  const input = readInput(opts.inputFile);

  const repoRoot = opts.repoRoot || detectGitRoot();
  const targetPath = repoRoot ? path.join(repoRoot, '.superpowers', 'preferences.yml') : null;

  // Base the write on the EXISTING file when one is present, so a PARTIAL input
  // only changes the keys it names — it never silently resets untouched keys to
  // defaults. (A one-key edit like "set auto_commit false" would otherwise wipe
  // language/caveman/memory back to defaults.) No file yet, or an unparseable
  // one → fall back to DEFAULTS (first write / onboarding).
  let existing = {};
  if (targetPath && fs.existsSync(targetPath)) {
    const { parsed: existingParsed, malformed: existingMalformed } = parseYaml(fs.readFileSync(targetPath, 'utf8'));
    if (!existingMalformed) existing = existingParsed;
  }
  const intended = deepMerge(deepMerge(DEFAULTS, existing), input);
  // Clamp constrained values (e.g. an `ultra`/invalid code_review_effort) before
  // rendering, so the written file is always valid and the round-trip below stays
  // consistent with the reader (which clamps identically).
  normalizeCodeReviewEffort(intended);

  const yaml = renderYaml(intended);

  // Round-trip: re-parse what we rendered with the reader's own parser.
  const { parsed, malformed } = parseYaml(yaml);
  const reparsed = deepMerge(DEFAULTS, parsed);
  normalizeCodeReviewEffort(reparsed);
  const roundTripValid = !malformed && JSON.stringify(reparsed) === JSON.stringify(intended);

  if (!roundTripValid) {
    process.stderr.write('Error: round-trip validation failed — the rendered file would not read back as intended. Nothing written.\n');
    process.stdout.write(`${JSON.stringify({ written: false, dryRun: opts.dryRun, path: targetPath, roundTripValid: false, preferences: intended }, null, 2)}\n`);
    process.exit(2);
  }

  if (opts.dryRun) {
    process.stdout.write(`${yaml}\n`);
    process.stdout.write(`${JSON.stringify({ written: false, dryRun: true, path: targetPath, roundTripValid: true, preferences: intended }, null, 2)}\n`);
    process.exit(0);
  }

  if (!targetPath) {
    usage('repository root not found — pass --repo-root <path> (or use --dry-run)');
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, yaml, 'utf8');
  } catch (err) {
    process.stderr.write(`Error writing preferences: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify({ written: true, dryRun: false, path: targetPath, roundTripValid: true, preferences: intended }, null, 2)}\n`);
  process.exit(0);
}

main();
