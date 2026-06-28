#!/usr/bin/env node
'use strict';

/**
 * init-feature-dir.cjs — Create the research directory for a superpowers feature.
 *
 * Establishes `docs/superpowers/<slug>/research/` under the repository root. The
 * slug derived here is the one the rest of the pipeline (super.brainstorming and
 * onward) reuses, so it is validated strictly as a kebab-case identifier.
 *
 * Design notes (DbC / CQS / SOLID):
 *   - requires: --slug must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/ (kebab-case).
 *   - ensures:  on exit 0 the directory docs/superpowers/<slug>/research/ exists.
 *   - idempotent: a pre-existing directory is reused, never an error.
 *   - command-with-result: it creates the directory (effect) and reports the
 *     outcome as JSON (the only output). It does not also answer unrelated queries.
 *
 * Usage:
 *   node scripts/init-feature-dir.cjs --slug <slug> [--repo-root <path>]
 *
 * Root resolution (in order):
 *   1. --repo-root flag
 *   2. git rev-parse --show-toplevel (git root of cwd)
 *   3. If not in a git repo → cwd
 *
 * Exit codes:
 *   0  directory exists at exit (created now or already present)
 *   1  usage error or invalid slug (JSON error on stdout, message on stderr)
 *
 * Output (stdout): JSON
 *   { slug, path, created, alreadyExisted, repoRoot }
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const HELP = `
init-feature-dir.cjs — Create docs/superpowers/<slug>/research/ for a feature.

Usage:
  node scripts/init-feature-dir.cjs --slug <slug> [--repo-root <path>]

Options:
  --slug <slug>        Kebab-case feature slug (required), e.g. realtime-sync-strategy
  --repo-root <path>   Repository root (default: git root of cwd, else cwd)
  --help               Show this help and exit 0

Output (JSON to stdout): { slug, path, created, alreadyExisted, repoRoot }
`.trimStart();

/** Emit a JSON error on stdout, a human message on stderr, and exit non-zero. */
function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }

  const options = { slug: null, repoRoot: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--slug') {
      if (!args[index + 1]) fail('--slug <slug> is required');
      options.slug = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--repo-root') {
      if (!args[index + 1]) fail('--repo-root <path> requires a value');
      options.repoRoot = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  return options;
}

/** Resolve the git toplevel of cwd; null when cwd is not inside a git repo. */
function detectGitRoot() {
  try {
    const result = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function main() {
  const options = parseArgs(process.argv);

  // Guard (requires): slug is mandatory and must be kebab-case.
  if (options.slug === null) fail('--slug <slug> is required');
  if (!SLUG_PATTERN.test(options.slug)) {
    fail(`invalid slug "${options.slug}" — expected kebab-case matching ${SLUG_PATTERN.source}`);
  }

  const repoRoot = options.repoRoot || detectGitRoot() || process.cwd();
  const researchPath = path.join(repoRoot, 'docs', 'superpowers', options.slug, 'research');

  const alreadyExisted = fs.existsSync(researchPath);

  // Idempotent: mkdir recursive is a no-op when the directory is already present.
  try {
    fs.mkdirSync(researchPath, { recursive: true });
  } catch (error) {
    fail(`could not create ${researchPath}: ${error.message}`);
  }

  // Ensures: the directory exists at exit.
  if (!fs.existsSync(researchPath)) {
    fail(`post-condition failed — ${researchPath} does not exist after mkdir`);
  }

  const result = {
    slug: options.slug,
    path: researchPath,
    created: !alreadyExisted,
    alreadyExisted,
    repoRoot,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { SLUG_PATTERN };
