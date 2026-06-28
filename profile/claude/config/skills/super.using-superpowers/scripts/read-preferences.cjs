#!/usr/bin/env node
/**
 * read-preferences.js — Read .superpowers/preferences.yml from the repository root.
 *
 * Usage:
 *   node scripts/read-preferences.cjs [--repo-root <path>]
 *
 * Root resolution (in order):
 *   1. --repo-root flag
 *   2. git rev-parse --show-toplevel (git root of cwd)
 *   3. If not in a git repo → return {found: false, repo_not_found: true}
 *
 * Exit codes:
 *   0 — success (including "file not found" or "not a git repo")
 *   1 — usage error or unrecoverable runtime failure
 *
 * Output (stdout): JSON
 * Diagnostics (stderr): warnings only
 *
 * Also usable as a module: `require('./read-preferences.cjs')` exports
 * { DEFAULTS, deepMerge, parseYaml, detectGitRoot } so write-preferences.cjs can
 * validate a rendered file against the exact same parser (round-trip safety).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HELP = `
read-preferences.js — Read .superpowers/preferences.yml from the repository root.

Usage:
  node scripts/read-preferences.cjs [--repo-root <path>]

Options:
  --repo-root <path>  Explicit path to the repository root (overrides git detection)
  --help              Show this help text and exit 0

Output (JSON to stdout): { found, repo_not_found, malformed, preferencesPath, preferences }
where preferences merges file values over defaults:
  workflow.auto_commit (true), workflow.confirm_destructive_actions (true),
  communication.language ("pt-BR"), copilot.rubber_duck (false),
  copilot.review_final (false; native review skill as an extra bug pass at the final review),
  claude_code.simplify (false),
  claude_code.code_review_final (false; /code-review as an extra bug pass at the final review),
  claude_code.code_review_effort ("medium"; low/medium/high/max — ultra unsupported),
  context.has_corporate_artifacts (false),
  optimization.caveman (false), optimization.caveman_level ("full"),
  memory.persistent_memory (false),
  model_tiers.cheap/standard/capable (null — harness decides when unset)

Exit codes:
  0  success
  1  usage error or unrecoverable failure
`.trimStart();

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  workflow: {
    auto_commit: true,
    confirm_destructive_actions: true,
  },
  communication: {
    language: 'pt-BR',
  },
  copilot: {
    rubber_duck: false,
    // Native `review` skill at the final review — an extra bug-focused pass ON TOP OF the default
    // final reviewer (which still runs). Additive; spec + quality gates always run too.
    review_final: false,
  },
  // Platform-specific. The claude_code: section is ignored by Copilot CLI, Codex,
  // and Gemini CLI. Both default to false — the user opts in during onboarding.
  claude_code: {
    // /simplify applies cleanups to changed code during execution (per task; not a review).
    simplify: false,
    // /code-review at the final review — an extra bug-focused pass ON TOP OF the default final
    // reviewer (which still runs). Additive; spec + quality gates always run too.
    code_review_final: false,
    // Effort for the final /code-review (low/medium/high/max; ultra clamped to medium).
    code_review_effort: 'medium',
  },
  context: {
    has_corporate_artifacts: false,
  },
  optimization: {
    caveman: false,
    caveman_level: 'full',
  },
  memory: {
    persistent_memory: false,
  },
  // Maps the abstract model tiers used by execution skills (see
  // super.subagent-driven-development § Model Selection) to concrete model names
  // for THIS harness. null means "let the harness pick its cheap/standard/capable".
  model_tiers: {
    cheap: null,
    standard: null,
    capable: null,
  },
};

function deepMerge(defaults, overrides) {
  if (!overrides || typeof overrides !== 'object') return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(defaults[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}

// ─── Normalization ───────────────────────────────────────────────────────────
//
// Valid effort levels for the final /code-review. `ultra` is intentionally excluded:
// it runs in the cloud on a separate tier, so the flow must never select it
// automatically. An invalid or `ultra` value is clamped back to the default.
const VALID_CODE_REVIEW_EFFORTS = ['low', 'medium', 'high', 'max'];

/**
 * Clamp claude_code.code_review_effort to a valid level (in place), returning a
 * list of human-readable notes about anything changed. Shared by read AND write
 * so the write-side round-trip check stays consistent (both clamp identically,
 * so an `ultra`/invalid value can never be persisted — not even by a hand edit).
 */
function normalizeCodeReviewEffort(preferences) {
  const notes = [];
  const cc = preferences && preferences.claude_code;
  if (cc && !VALID_CODE_REVIEW_EFFORTS.includes(cc.code_review_effort)) {
    notes.push(`claude_code.code_review_effort "${cc.code_review_effort}" is not one of ${VALID_CODE_REVIEW_EFFORTS.join('/')} (ultra is unsupported) — using "medium"`);
    cc.code_review_effort = 'medium';
  }
  return notes;
}

/**
 * Case-normalize optimization.caveman_level to lower-case (in place), returning a
 * list of human-readable notes about anything changed. The rendered directive
 * `/caveman <level>` is case-sensitive, so a hand-edited `ULTRA` would otherwise
 * fail to match the caveman skill's level. We ONLY lower-case — we do not validate
 * against a level list, to stay forward-compatible with the caveman skill (same
 * reasoning as render-caveman-block.cjs, which is not the authority on levels).
 */
function normalizeCavemanLevel(preferences) {
  const notes = [];
  const opt = preferences && preferences.optimization;
  if (opt && typeof opt.caveman_level === 'string' && opt.caveman_level !== opt.caveman_level.toLowerCase()) {
    const original = opt.caveman_level;
    opt.caveman_level = opt.caveman_level.toLowerCase();
    notes.push(`optimization.caveman_level "${original}" normalized to "${opt.caveman_level}" (levels are lower-case)`);
  }
  return notes;
}

// ─── YAML Parser ─────────────────────────────────────────────────────────────
//
// Handles the specific subset of YAML used in preferences.yml:
//   - Comments (#)
//   - Nested mappings (key: / one level of indent)
//   - Scalar values: strings, booleans (true/false), null (empty / null / ~)
//   - No arrays, no multi-line strings
//
// Returns { parsed, malformed }.

function parseYaml(content) {
  const lines = content.split('\n');
  const root = {};
  let currentSection = null;
  let malformed = false;

  for (const rawLine of lines) {
    // Strip inline comments — but preserve #-in-values like language: pt-BR
    const line = rawLine.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    // Top-level section (no leading whitespace, ends with colon, no value)
    const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*$/);
    if (topMatch) {
      currentSection = topMatch[1];
      root[currentSection] = {};
      continue;
    }

    // Nested key (leading whitespace)
    const nestedMatch = line.match(/^(\s+)([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (nestedMatch) {
      const key = nestedMatch[2];
      const rawValue = nestedMatch[3].trim();

      // Parse value
      let value;
      if (rawValue === 'true') value = true;
      else if (rawValue === 'false') value = false;
      else if (rawValue === '' || rawValue === 'null' || rawValue === '~') value = null;
      else value = rawValue.replace(/^['"]|['"]$/g, ''); // strip optional quotes

      if (currentSection) {
        root[currentSection][key] = value;
      }
      continue;
    }

    // Top-level key-value pair (no indentation, has value)
    const topKvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s+(.+)$/);
    if (topKvMatch) {
      const key = topKvMatch[1];
      const rawValue = topKvMatch[2].trim();
      let value;
      if (rawValue === 'true') value = true;
      else if (rawValue === 'false') value = false;
      else value = rawValue.replace(/^['"]|['"]$/g, '');
      root[key] = value;
      currentSection = null;
      continue;
    }

    // Anything else that looks structural is a sign of malformed YAML
    if (line.trim() && !line.trim().startsWith('#')) {
      const suspicious = /^[^a-zA-Z\s]/.test(line.trim()) ||
                         line.includes('[') ||
                         line.includes('{') ||
                         /^\w+\s+\w+/.test(line.trim()); // key without colon
      if (suspicious) {
        malformed = true;
      }
    }
  }

  return { parsed: root, malformed };
}

// ─── Git root detection ───────────────────────────────────────────────────────

function detectGitRoot() {
  try {
    const result = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

// ─── Main (CLI) ─────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let repoRoot = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && args[i + 1]) {
      repoRoot = path.resolve(args[++i]);
    }
  }

  // Resolve repo root
  if (!repoRoot) {
    repoRoot = detectGitRoot();
    if (!repoRoot) {
      const result = {
        found: false,
        repo_not_found: true,
        malformed: false,
        preferencesPath: null,
        preferences: deepMerge(DEFAULTS, {}),
      };
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    }
  }

  const prefsPath = path.join(repoRoot, '.superpowers', 'preferences.yml');

  // File does not exist — not an error
  if (!fs.existsSync(prefsPath)) {
    const result = {
      found: false,
      repo_not_found: false,
      malformed: false,
      preferencesPath: prefsPath,
      preferences: deepMerge(DEFAULTS, {}),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }

  // Read and parse the file
  let rawContent;
  try {
    rawContent = fs.readFileSync(prefsPath, 'utf8');
  } catch (err) {
    process.stderr.write(`Error reading preferences file: ${err.message}\n`);
    process.exit(1);
  }

  const { parsed, malformed } = parseYaml(rawContent);

  if (malformed) {
    process.stderr.write(`Warning: preferences.yml appears malformed — using defaults for missing values\n`);
  }

  const merged = deepMerge(DEFAULTS, parsed);
  for (const note of [...normalizeCodeReviewEffort(merged), ...normalizeCavemanLevel(merged)]) {
    process.stderr.write(`Warning: ${note}\n`);
  }

  const result = {
    found: true,
    repo_not_found: false,
    malformed,
    preferencesPath: prefsPath,
    preferences: merged,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { DEFAULTS, deepMerge, parseYaml, detectGitRoot, normalizeCodeReviewEffort, normalizeCavemanLevel };

if (require.main === module) {
  main(process.argv);
}
