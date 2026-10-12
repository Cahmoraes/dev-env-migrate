#!/usr/bin/env node
/**
 * branch-guard.cjs — Deterministic verdict on WHERE the execution skills are about to commit.
 *
 * The execution skill commits per task onto the current branch, so starting on the
 * repository's default branch lands the whole feature there. This script replaces the
 * three-command shell block the skills used to carry in prose (measured: "repo is on main,
 * how should I proceed?" was the most frequent question in real sessions). It never creates
 * anything: it reads git state and prints one verdict the controller acts on.
 *
 * Usage:
 *   node scripts/branch-guard.cjs --tasks-index <path/to/tasks-<feature>.md> [--repo-root <path>]
 *   node scripts/branch-guard.cjs --feature-name <slug> [--repo-root <path>]
 *
 * Output (JSON to stdout):
 *   {
 *     current: "main",                 // `git rev-parse --abbrev-ref HEAD` ("HEAD" when detached)
 *     default: "main" | null,          // origin/HEAD, else the first local main/master, else null
 *     detached: false,
 *     onDefault: true,                 // current === default, or current is main/master
 *     featureBranch: "feat/<slug>",    // slug from tasks-<slug>.md or --feature-name
 *     featureBranchExists: false,
 *     action: "create" | "ask-existing" | "ask-mismatch" | "proceed",
 *     command: "git checkout -b feat/<slug>" | null
 *   }
 *
 * action:
 *   create        — on the default branch and feat/<slug> does not exist: run `command`, announce it.
 *   ask-existing  — on the default branch but feat/<slug> already exists: the user picks (use it
 *                   or name another) — the one collision a script cannot settle.
 *   ask-mismatch  — on ANOTHER feature's branch (feat/<other>, slug absent from the name): the
 *                   user picks (continue on it, or create feat/<slug> from here).
 *   proceed       — already on a non-default, non-feature branch (develop, release/x, feat/<slug>
 *                   itself), or detached HEAD: nothing to do.
 *
 * Exit codes: 0 verdict printed · 1 usage error or not a git repository
 */

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const HELP = `
branch-guard.cjs — verdict on the branch the execution skills are about to commit to.

Usage:
  node scripts/branch-guard.cjs --tasks-index <path> [--repo-root <path>]
  node scripts/branch-guard.cjs --feature-name <slug> [--repo-root <path>]

Prints JSON: { current, default, detached, onDefault, featureBranch, featureBranchExists, mismatch, action, command }
action: create | ask-existing | ask-mismatch | proceed
`.trimStart();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--tasks-index') out.tasksIndex = argv[++i];
    else if (a === '--feature-name') out.featureName = argv[++i];
    else if (a === '--repo-root') out.repoRoot = argv[++i];
    else {
      process.stderr.write(`Unknown argument: ${a}\n${HELP}`);
      process.exit(1);
    }
  }
  return out;
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Feature slug: `tasks-<slug>.md` → `<slug>`; anything else → basename without extension. */
function slugFromIndex(tasksIndex) {
  const base = path.basename(tasksIndex).replace(/\.md$/i, '');
  return base.replace(/^tasks-/, '');
}

// A branch that names a feature. On one of these whose name does not carry this
// feature's slug, the guard asks instead of stacking two features in silence — a
// real run implemented `admin-notice-broadcast` on `feat/user-activity-pagination`
// and merged both under the other name. `develop`/`release/*`/custom names are
// not feature branches: they proceed, so a resume never re-asks.
const FEATURE_BRANCH_PREFIX = /^(?:feat|feature|fix|hotfix|bugfix)\//i;

function verdict({ cwd, featureName }) {
  const current = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current === null) return null;

  // One spawn for every ref the verdict reads: origin/HEAD's target, local main/master and the
  // feature branch. Patterns also match refs below them (refs/heads/main/x), so names are exact-matched.
  const featureBranch = `feat/${featureName}`;
  const refs = new Map(
    (git(cwd, ['for-each-ref', '--format=%(refname)%00%(symref)', 'refs/remotes/origin/HEAD', 'refs/heads/main', 'refs/heads/master', `refs/heads/${featureBranch}`]) || '')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\0')),
  );
  const originHead = refs.get('refs/remotes/origin/HEAD');
  let def = originHead ? originHead.replace(/^refs\/remotes\//, '').replace(/^origin\//, '') : null;
  if (!def) def = ['main', 'master'].find((b) => refs.has(`refs/heads/${b}`)) || null;

  const detached = current === 'HEAD';
  const onDefault = !detached && (current === def || current === 'main' || current === 'master');
  const featureBranchExists = refs.has(`refs/heads/${featureBranch}`);

  const mismatch =
    !onDefault && !detached && FEATURE_BRANCH_PREFIX.test(current) && !current.toLowerCase().includes(featureName.toLowerCase());

  let action = 'proceed';
  if (onDefault) action = featureBranchExists ? 'ask-existing' : 'create';
  else if (mismatch) action = 'ask-mismatch';

  return {
    current,
    default: def,
    detached,
    onDefault,
    featureBranch,
    featureBranchExists,
    mismatch,
    action,
    command: action === 'create' ? `git checkout -b ${featureBranch}` : null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (!args.tasksIndex && !args.featureName) {
    process.stderr.write(`Error: --tasks-index or --feature-name is required.\n${HELP}`);
    process.exit(1);
  }
  const featureName = args.featureName || slugFromIndex(args.tasksIndex);
  const cwd = args.repoRoot ? path.resolve(args.repoRoot) : process.cwd();
  const result = verdict({ cwd, featureName });
  if (!result) {
    process.stderr.write('Error: not a git repository (or git unavailable).\n');
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { verdict, slugFromIndex };

if (require.main === module) main();
