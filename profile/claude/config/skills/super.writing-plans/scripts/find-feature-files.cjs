#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HELP = `
find-feature-files.cjs — Locate PRD, spec, tasks index, QA report, and curated visual mockup artifacts for a feature.

Usage:
  node scripts/find-feature-files.cjs --feature-name <name> [--repo-root <path>] [--base-dir <path>]

Options:
  --feature-name <name>  Feature slug/name to resolve
  --repo-root <path>     Repository root override
  --base-dir <path>      Base directory override (relative to repo root unless absolute)
  --help                 Show usage and exit 0
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
  const options = {
    featureName: null,
    repoRoot: null,
    baseDir: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--feature-name') {
      if (!args[index + 1]) usage('--feature-name <name> is required');
      options.featureName = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--repo-root') {
      if (!args[index + 1]) usage('--repo-root <path> is required');
      options.repoRoot = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--base-dir') {
      if (!args[index + 1]) usage('--base-dir <path> is required');
      options.baseDir = args[index + 1];
      index += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  if (!options.featureName) usage('--feature-name <name> is required');
  return options;
}

function detectGitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function buildFileEntry(candidatePath) {
  if (fs.existsSync(candidatePath)) {
    return { found: true, path: candidatePath };
  }
  return { found: false, path: null };
}

// Curated visual artifacts live in a directory (specs/mockups/). The brainstorming
// step distills the approved mockups into this directory (prose + core HTML/JSX);
// the ephemeral companion session is NOT promoted here. An empty/absent directory
// means there is no visual artifact to carry into planning.
function buildDirEntry(candidateDir) {
  if (fs.existsSync(candidateDir) && fs.statSync(candidateDir).isDirectory()) {
    const files = fs
      .readdirSync(candidateDir)
      // Ignore dotfiles (.DS_Store, .gitkeep) — not curated artifacts. Keeps this
      // listing consistent with validate-tasks.cjs's mockup-coverage gate.
      .filter((name) => !name.startsWith('.') && fs.statSync(path.join(candidateDir, name)).isFile())
      .sort();
    if (files.length > 0) {
      return { found: true, path: candidateDir, files };
    }
  }
  return { found: false, path: null, files: [] };
}

// A spec's "Especificação Visual" section is the deterministic signal that a mockup or
// external design informed the feature (design-spec-structure.md). By the SAME condition a
// curated artifact must exist under specs/mockups/. If the section is present but the
// directory has no artifact, the visual-fidelity gate (validate-tasks --mockups) is
// silently skipped — so we surface it here, where both the spec path and the mockups dir
// are already resolved. Tolerant of heading level and numbering/prefix; accent-insensitive
// on ç/ã so a section written without diacritics is still detected (a false negative would
// be the dangerous direction). The phrase itself is specific enough to avoid false hits.
const VISUAL_SECTION_RE = /^#{1,6}[ \t].*\bEspecifica[çc][ãa]o[ \t]+Visual\b/im;

function specHasVisualSection(specPath) {
  try {
    return VISUAL_SECTION_RE.test(fs.readFileSync(specPath, 'utf8'));
  } catch {
    return false;
  }
}

function main() {
  const { featureName, repoRoot: providedRepoRoot, baseDir: baseDirArgument } = parseArgs(process.argv);
  const repoRoot = providedRepoRoot || detectGitRoot();
  if (!repoRoot) {
    process.stderr.write('Error: Unable to resolve repository root. Use --repo-root <path>.\n');
    process.exit(1);
  }
  const baseDir = baseDirArgument
    ? (path.isAbsolute(baseDirArgument) ? baseDirArgument : path.resolve(repoRoot, baseDirArgument))
    : path.join(repoRoot, 'docs', 'superpowers');
  const featureDir = path.join(baseDir, featureName);
  const spec = buildFileEntry(path.join(featureDir, 'specs', `${featureName}-design.md`));
  spec.visualSection = spec.found ? specHasVisualSection(spec.path) : false;
  const mockups = buildDirEntry(path.join(featureDir, 'specs', 'mockups'));
  const warnings = [];
  if (spec.visualSection && !mockups.found) {
    warnings.push({
      code: 'visual-spec-without-artifact',
      message:
        `spec has an "Especificação Visual" section but specs/mockups/ has no curated artifact — ` +
        `the visual-fidelity gate (validate-tasks --mockups) will be silently skipped. Add the ` +
        `artifact at specs/mockups/${featureName}-visual.md, or remove the section if no mockup ` +
        `or external design informed the feature.`,
    });
  }
  const result = {
    featureName,
    prd: buildFileEntry(path.join(featureDir, 'prd', `prd-${featureName}.md`)),
    spec,
    tasksIndex: buildFileEntry(path.join(featureDir, 'plans', `tasks-${featureName}.md`)),
    qaReport: buildFileEntry(path.join(featureDir, 'qa', `qa-report-${featureName}.md`)),
    mockups,
    warnings,
    baseDir,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
