#!/usr/bin/env node
'use strict';

/**
 * superpowers-status.cjs — report pipeline phase and progress for superpowers feature(s).
 *
 * Scans docs/superpowers/<feature>/ and reports, per feature, which pipeline artifacts
 * exist (research, spec, prd, plan, qa), task execution progress (done/total parsed from
 * the tasks index), the derived current phase, and the deterministic next action. Lets the
 * router (super.using-superpowers) resume work without re-exploring the filesystem.
 *
 * The PRD is optional: a feature may legitimately go spec → plan with no PRD. Its absence
 * never blocks phase derivation; it only changes the next action (QA gate vs finishing).
 */

const fs = require('fs');
const path = require('path');
const { detectRepoRoot } = require('./lib/repo-root.cjs');
const { loadPreferences } = require('./read-preferences.cjs');

const HELP = `
superpowers-status.cjs — Report pipeline phase/progress for superpowers feature(s).

Usage:
  node superpowers-status.cjs [--feature-name <name>] [--repo-root <path>] [--base-dir <path>] [--pending]

Options:
  --feature-name <name>  Report only this feature. Omit to scan every feature.
  --repo-root <path>     Repository root override (defaults to git toplevel).
  --base-dir <path>      Base directory override (default: <repo-root>/docs/superpowers).
  --pending              Keep only features with resumable execution work (phase
                         "planned" or "executing"). This is the "locate pending work" query.
  --help                 Show usage and exit 0.

Output: JSON on stdout. Always exits 0; "repoNotFound"/"docsExists" flags signal absence.
`.trimStart();

// Phases that represent execution work a session can pick up and resume.
const PENDING_PHASES = new Set(['planned', 'executing']);

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
  const options = { featureName: null, repoRoot: null, baseDir: null, pending: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--pending') {
      options.pending = true;
      continue;
    }
    if (arg === '--feature-name') {
      if (!args[index + 1]) usage('--feature-name <name> requires a value');
      options.featureName = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--repo-root') {
      if (!args[index + 1]) usage('--repo-root <path> requires a value');
      options.repoRoot = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--base-dir') {
      if (!args[index + 1]) usage('--base-dir <path> requires a value');
      options.baseDir = args[index + 1];
      index += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  return options;
}

// Git working-tree root, resolved in-process (no `git` spawn) — see lib/repo-root.cjs.
function detectGitRoot() {
  return detectRepoRoot();
}

// Same task-line shape validate-tasks.cjs enforces: capture group 1 is the checkbox state.
const TASK_LINE_PATTERN = /^-\s+\[([ xX])\]\s+\d+\.\s+.+?\s*(?:→|->)\s*`[^`]+`\s*$/u;

function countTasks(indexPath) {
  let content;
  try {
    content = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return null;
  }
  let total = 0;
  let done = 0;
  for (const line of content.split('\n')) {
    const match = line.match(TASK_LINE_PATTERN);
    if (!match) continue;
    total += 1;
    if (match[1] === 'x' || match[1] === 'X') done += 1;
  }
  return { total, done };
}

/**
 * Derive the current phase and the deterministic next action from which artifacts exist
 * and how far execution has progressed. Order of precedence runs from the end of the
 * pipeline backwards so the furthest-reached stage wins.
 */
function derivePhaseAndNext(artifacts, tasks, qaGateEnabled = true) {
  if (artifacts.qa) {
    return { phase: 'qa-complete', nextAction: 'super.finishing-a-development-branch' };
  }
  if (artifacts.plan) {
    if (tasks && tasks.total > 0 && tasks.done >= tasks.total) {
      // All tasks done; the QA gate runs only when a PRD exists to verify against AND the
      // qa_gate preference is on. With qa_gate off it is skipped silently (never surfaced),
      // so the resume router points straight at finishing.
      return artifacts.prd && qaGateEnabled
        ? { phase: 'execution-complete', nextAction: 'super.user-story-verification' }
        : { phase: 'execution-complete', nextAction: 'super.finishing-a-development-branch' };
    }
    if (tasks && tasks.done > 0) {
      return { phase: 'executing', nextAction: 'resume execution (chosen execution mode)' };
    }
    return { phase: 'planned', nextAction: 'start execution (chosen execution mode)' };
  }
  if (artifacts.prd) {
    return { phase: 'prd', nextAction: 'super.writing-plans' };
  }
  if (artifacts.spec) {
    return { phase: 'spec', nextAction: 'super.generating-prd (optional) or super.writing-plans' };
  }
  if (artifacts.research) {
    return { phase: 'research', nextAction: 'super.brainstorming' };
  }
  return { phase: 'not-started', nextAction: 'super.brainstorming' };
}

function statusForFeature(baseDir, featureName, qaGateEnabled = true) {
  const featureDir = path.join(baseDir, featureName);
  const artifacts = {
    research: fs.existsSync(path.join(featureDir, 'research', `research-${featureName}.md`)),
    spec: fs.existsSync(path.join(featureDir, 'specs', `${featureName}-design.md`)),
    prd: fs.existsSync(path.join(featureDir, 'prd', `prd-${featureName}.md`)),
    plan: fs.existsSync(path.join(featureDir, 'plans', `tasks-${featureName}.md`)),
    qa: fs.existsSync(path.join(featureDir, 'qa', `qa-report-${featureName}.md`)),
  };
  const tasks = artifacts.plan
    ? countTasks(path.join(featureDir, 'plans', `tasks-${featureName}.md`))
    : null;
  const { phase, nextAction } = derivePhaseAndNext(artifacts, tasks, qaGateEnabled);
  return { featureName, artifacts, tasks, phase, nextAction };
}

function listFeatureDirs(baseDir) {
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

function main() {
  const { featureName, repoRoot: providedRepoRoot, baseDir: baseDirArgument, pending } = parseArgs(process.argv);
  const repoRoot = providedRepoRoot || detectGitRoot();
  if (!repoRoot) {
    process.stdout.write(`${JSON.stringify({ repoNotFound: true, features: [], count: 0 }, null, 2)}\n`);
    process.exit(0);
  }
  const baseDir = baseDirArgument
    ? (path.isAbsolute(baseDirArgument) ? baseDirArgument : path.resolve(repoRoot, baseDirArgument))
    : path.join(repoRoot, 'docs', 'superpowers');

  const docsExists = fs.existsSync(baseDir);

  // qa_gate off → the QA gate is skipped silently, so the resume router must never point at it.
  const qaGateEnabled = loadPreferences(repoRoot).result.preferences.workflow.qa_gate !== false;

  let features;
  if (featureName) {
    features = [statusForFeature(baseDir, featureName, qaGateEnabled)];
  } else {
    features = listFeatureDirs(baseDir).map((name) => statusForFeature(baseDir, name, qaGateEnabled));
  }

  if (pending) {
    features = features.filter((feature) => PENDING_PHASES.has(feature.phase));
  }

  const result = { baseDir, docsExists, pending, features, count: features.length };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
