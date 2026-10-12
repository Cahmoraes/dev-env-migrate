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
 *     "workflow": { "auto_commit": bool, "qa_gate": true|"ask"|false,
 *                   "visual_companion": bool, "finish_action": "ask"|"merge"|"pr"|"keep" },
 *     "copilot": { "review_final": bool },
 *     "claude_code": { "review_final": bool, "review_effort": str },
 *     "context": { "has_corporate_artifacts": bool },
 *     "model_tiers": { "cheap": str|null, "standard": str|null, "capable": str|null },
 *     "project": { "stack": str|null, "manifest": str|null }
 *   }
 *
 * The `project:` section is rendered ONLY when the input or the existing file declares it
 * (see read-preferences.cjs `projectDeclared`). Rendering it unconditionally would turn
 * every one-key edit ("set auto_commit false") into a declaration of an empty profile, and
 * the router would stop offering the project step to a repo that never confirmed one.
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
const { DEFAULTS, deepMerge, parseYaml, detectGitRoot, normalizeCodeReviewEffort, normalizeFinishAction, normalizeQaGate } = require('./read-preferences.cjs');

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

function renderProject(p) {
  const pr = p.project;
  return [
    '',
    '# Project profile — what THIS repo is: the ecosystem label and the manifest that describes it.',
    '# Proposed by detect-project.cjs at onboarding and confirmed by the user. Commands (test, setup,',
    '# format) are not preferences: the repo instructions file (AGENTS.md / CLAUDE.md) and the',
    '# manifest carry them, and the agent reads those when it needs one. Leave both empty when the',
    '# stack is not decided yet.',
    'project:',
    kv('stack', pr.stack),
    kv('manifest', pr.manifest),
  ];
}

// The reader's clamps, applied identically on both sides of the round-trip check.
function normalizeConstrained(p) {
  normalizeCodeReviewEffort(p);
  normalizeFinishAction(p);
  normalizeQaGate(p);
}

function normalizeProject(p) {
  for (const key of Object.keys(DEFAULTS.project)) {
    if (p.project[key] === '') p.project[key] = null;
  }
}

function renderYaml(p, { includeProject = false } = {}) {
  return [
    '# Superpowers Workflow Preferences',
    '# Managed by write-preferences.cjs (round-trip validated). Edit manually or ask the agent to update.',
    '',
    '# qa_gate: run the user-story QA gate (super.user-story-verification) at the end of',
    '#   implementation (E2E user-story checks, e.g. headless-browser Playwright runs driven by QA',
    '#   subagents from the PRD). true (default) runs it automatically whenever a PRD exists — nothing',
    '#   is asked at the final stage. ask asks once at the gate, only when a PRD exists; the answer',
    '#   covers that feature. false disables it silently — the gate never runs and QA is never',
    '#   mentioned, even at the PRD step.',
    '# visual_companion: offer the browser companion (mockups/diagrams) during super.brainstorming.',
    '#   true (default) keeps the consent question before anything opens. false skips the companion',
    '#   entirely — it is never offered and never mentioned.',
    '# finish_action: what super.finishing-a-development-branch does once the branch is verified.',
    '#   ask (default) shows the finishing menu; merge merges locally; pr pushes and opens a pull',
    '#   request; keep leaves the branch as-is. Discard is never automatic.',
    'workflow:',
    kv('auto_commit', p.workflow.auto_commit),
    kv('qa_gate', p.workflow.qa_gate),
    kv('visual_companion', p.workflow.visual_companion),
    kv('finish_action', p.workflow.finish_action),
    '',
    '# Platform-specific. The copilot: section is ignored by Claude Code, Codex, and Gemini CLI.',
    '# review_final: run the native `review` skill at the final review as an extra bug-focused pass',
    '# on top of the default final reviewer. Additive (spec + quality gates always run); no effort levels.',
    'copilot:',
    kv('review_final', p.copilot.review_final),
    '',
    '# Platform-specific. The claude_code: section is ignored by Copilot CLI, Codex, and Gemini CLI.',
    '# Claude Code native skill, off by default. Additive — spec + quality gates always run.',
    '# review_final: run /code-review at the final review as an extra bug-focused pass on top',
    '# of the default final reviewer.',
    '# review_effort: low | medium | high | max (ultra unsupported — cloud, separate tier).',
    'claude_code:',
    kv('review_final', p.claude_code.review_final),
    kv('review_effort', p.claude_code.review_effort),
    '',
    '# When has_corporate_artifacts is true, the agent reads .superpowers/corporate-artifacts.yml.',
    'context:',
    kv('has_corporate_artifacts', p.context.has_corporate_artifacts),
    '',
    '# Maps abstract model tiers (see super.subagent-driven-development, "Model Selection" section) to',
    '# concrete model names for THIS harness. Leave empty to let the harness pick ("auto").',
    '# A tier naming a model the harness in use does not serve is treated as empty for that session.',
    'model_tiers:',
    kv('cheap', p.model_tiers.cheap),
    kv('standard', p.model_tiers.standard),
    kv('capable', p.model_tiers.capable),
    ...(includeProject ? renderProject(p) : []),
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
  // tiers back to defaults.) No file yet, or an unparseable
  // one → fall back to DEFAULTS (first write / onboarding).
  let existing = {};
  if (targetPath && fs.existsSync(targetPath)) {
    const { parsed: existingParsed, malformed: existingMalformed } = parseYaml(fs.readFileSync(targetPath, 'utf8'));
    if (!existingMalformed) existing = existingParsed;
  }
  const intended = deepMerge(deepMerge(DEFAULTS, existing), input);
  const includeProject = Object.prototype.hasOwnProperty.call(existing, 'project')
    || Object.prototype.hasOwnProperty.call(input, 'project');
  // Clamp constrained values (e.g. an `ultra`/invalid review_effort) before
  // rendering, so the written file is always valid and the round-trip below stays
  // consistent with the reader (which clamps identically).
  normalizeConstrained(intended);
  normalizeProject(intended);

  const yaml = renderYaml(intended, { includeProject });

  // Round-trip: re-parse what we rendered with the reader's own parser.
  const { parsed, malformed } = parseYaml(yaml);
  const reparsed = deepMerge(DEFAULTS, parsed);
  normalizeConstrained(reparsed);
  const roundTripValid = !malformed
    && JSON.stringify(reparsed) === JSON.stringify(intended)
    && Object.prototype.hasOwnProperty.call(parsed, 'project') === includeProject;

  if (!roundTripValid) {
    process.stderr.write('Error: round-trip validation failed — the rendered file would not read back as intended. Nothing written.\n');
    process.stdout.write(`${JSON.stringify({ written: false, dryRun: opts.dryRun, path: targetPath, roundTripValid: false, preferences: intended }, null, 2)}\n`);
    process.exit(2);
  }

  if (opts.dryRun) {
    process.stdout.write(`${yaml}\n`);
    process.stdout.write(`${JSON.stringify({ written: false, dryRun: true, path: targetPath, roundTripValid: true, projectDeclared: includeProject, preferences: intended }, null, 2)}\n`);
    process.exit(0);
  }

  if (!targetPath) {
    usage('repository root not found — pass --repo-root <path> (or use --dry-run)');
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    // Atomic replace: a crash or a concurrent reader mid-write never sees a truncated file,
    // which the reader would silently parse as "defaults for every missing key".
    // Resolved through a symlink so the rename replaces the file, never the link.
    const destPath = fs.existsSync(targetPath) ? fs.realpathSync(targetPath) : targetPath;
    const tmpPath = `${destPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmpPath, yaml, 'utf8');
      fs.renameSync(tmpPath, destPath);
    } catch (err) {
      fs.rmSync(tmpPath, { force: true });
      throw err;
    }
  } catch (err) {
    process.stderr.write(`Error writing preferences: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify({ written: true, dryRun: false, path: targetPath, roundTripValid: true, projectDeclared: includeProject, preferences: intended }, null, 2)}\n`);
  process.exit(0);
}

main();
