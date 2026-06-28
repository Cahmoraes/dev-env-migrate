#!/usr/bin/env node
/**
 * check-integration.cjs — Deterministic pre-merge gate for a parallel wave.
 *
 * Before super.parallel-subagent-development integrates a wave's worktrees back
 * into the base branch, it must know — without guessing — that every task is
 * actually ready and that "independent" tasks really are disjoint. This script
 * answers those questions purely from git state, so the orchestrator never
 * INFERS readiness, ordering, or collision risk (inference is where the flow
 * drifts and burns tokens re-deciding what git already knows).
 *
 * It is READ-ONLY: every git command is a query (rev-parse, rev-list, diff,
 * worktree list). It never checks out, merges, commits, or mutates a ref.
 *
 * For each task N in the wave it resolves the expected branch
 * `wt/<feature>-task-NN` (zero-padded to 2 digits, with an unpadded fallback)
 * and reports whether it exists, how many commits it carries beyond the base,
 * which files it changed, and its worktree path if checked out. It then flags
 * any pair of sibling tasks whose changed-file sets overlap — tasks the planner
 * declared independent but that touch shared files, the classic missed-
 * dependency signal `integrating-worktrees.md` warns about.
 *
 * Usage:
 *   node scripts/check-integration.cjs --base <branch> --feature <name> \
 *        --tasks <N,N,...> [--repo-root <path>]
 *
 * Exit codes:
 *   0  ran successfully (inspect readyToIntegrate / blockers in the JSON)
 *   1  usage error or git is unavailable / not a repo
 *
 * Output (stdout): JSON
 *   {
 *     "base": string,
 *     "feature": string,
 *     "baseSafe": boolean,            // false when base is main/master
 *     "baseWarning": string|null,
 *     "tasks": [{
 *       "number": number,
 *       "branch": string,            // resolved branch name (padded form by default)
 *       "branchExists": boolean,
 *       "commitsAhead": number,      // commits on the branch beyond base
 *       "commitsBehind": number,     // commits on base beyond the branch
 *       "alreadyMerged": boolean,    // work already folded into base (resume: skip); false for an empty branch even when base advanced (first-parent check)
 *       "changedFiles": string[],    // sorted; branch's changes since merge-base
 *       "worktreePath": string|null  // checked-out worktree, if any
 *     }],
 *     "missedDependencySignals": [{ "tasks": [a,b], "overlappingFiles": string[] }],
 *     "mergeOrder": number[],        // deterministic ascending task order
 *     "readyToIntegrate": boolean,   // all branches present AND carrying work
 *     "blockers": string[]           // why it is not ready (empty when ready)
 *   }
 */

"use strict";

const path = require("path");
const { execFileSync } = require("child_process");

const HELP = `
check-integration.cjs — Deterministic pre-merge gate for a parallel wave.

Usage:
  node scripts/check-integration.cjs --base <branch> --feature <name> \\
       --tasks <N,N,...> [--repo-root <path>]

Options:
  --base <branch>     Base branch the wave integrates into (required)
  --feature <name>    Feature name used to build wt/<feature>-task-NN (required)
  --tasks <list>      Wave task numbers, comma/space separated, e.g. "1,2,3" (required)
  --repo-root <path>  Repository root to run git in (default: current directory)
  --help              Show this help text and exit 0
`.trimStart();

function usage(msg) {
  process.stderr.write(`Error: ${msg}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const opts = { base: null, feature: null, tasks: null, repoRoot: process.cwd() };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--base") { opts.base = args[++i]; continue; }
    if (a === "--feature") { opts.feature = args[++i]; continue; }
    if (a === "--tasks") { opts.tasks = args[++i]; continue; }
    if (a === "--repo-root") { opts.repoRoot = args[++i]; continue; }
    usage(`Unknown argument: ${a}`);
  }
  if (!opts.base) usage("--base <branch> is required");
  if (!opts.feature) usage("--feature <name> is required");
  if (!opts.tasks) usage("--tasks <list> is required");
  const numbers = (opts.tasks.match(/\d+/gu) || []).map((n) => Number.parseInt(n, 10));
  if (numbers.length === 0) usage("--tasks must contain at least one task number");
  // De-duplicate and sort ascending — the integration order is deterministic.
  opts.taskNumbers = [...new Set(numbers)].sort((a, b) => a - b);
  opts.repoRoot = path.resolve(opts.repoRoot);
  return opts;
}

/** Run a read-only git query. Returns {ok, out}; never throws on git's exit. */
function git(repoRoot, gitArgs) {
  try {
    const out = execFileSync("git", ["-C", repoRoot, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: (err.stdout || "").toString().trim() };
  }
}

function branchExists(repoRoot, branch) {
  return git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok;
}

function commitsAhead(repoRoot, base, branch) {
  const r = git(repoRoot, ["rev-list", "--count", `${base}..${branch}`]);
  const n = Number.parseInt(r.out, 10);
  return Number.isFinite(n) ? n : 0;
}

function commitsBehind(repoRoot, base, branch) {
  const r = git(repoRoot, ["rev-list", "--count", `${branch}..${base}`]);
  const n = Number.parseInt(r.out, 10);
  return Number.isFinite(n) ? n : 0;
}

function changedFiles(repoRoot, base, branch) {
  const r = git(repoRoot, ["diff", "--name-only", `${base}...${branch}`]);
  if (!r.ok || !r.out) return [];
  return r.out.split(/\r?\n/u).map((s) => s.trim()).filter(Boolean).sort();
}

/**
 * Is the branch tip on the base's first-parent spine? Disambiguates the
 * ahead===0 && behind>0 case, where a branch carries no unique commits but the base
 * has advanced — two opposite states that are identical by ahead/behind:
 *   - already merged (--no-ff): the tip entered base as a merge's SECOND parent, so it
 *     is OFF the first-parent spine → false.
 *   - empty branch, base advanced only because a SIBLING merged: the tip still points
 *     at a commit the base descends from linearly → ON the spine → true.
 * Only the off-spine case is a real merge; treating an on-spine branch as merged would
 * silently drop never-committed work on resume.
 */
function tipOnFirstParentChain(repoRoot, base, branch) {
  const tip = git(repoRoot, ["rev-parse", branch]);
  if (!tip.ok) return false;
  const spine = git(repoRoot, ["rev-list", "--first-parent", base]);
  if (!spine.ok) return false;
  return spine.out.split(/\r?\n/u).some((h) => h.trim() === tip.out);
}

/** Map every branch checked out in a worktree to its path. */
function worktreePaths(repoRoot) {
  const r = git(repoRoot, ["worktree", "list", "--porcelain"]);
  const map = new Map();
  if (!r.ok) return map;
  let currentPath = null;
  for (const line of r.out.split(/\r?\n/u)) {
    if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length).trim();
    else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim().replace(/^refs\/heads\//u, "");
      if (currentPath) map.set(ref, currentPath);
    }
  }
  return map;
}

/** Resolve a task's branch: padded `wt/<feature>-task-NN`, falling back to unpadded. */
function resolveBranch(repoRoot, feature, number) {
  const padded = `wt/${feature}-task-${String(number).padStart(2, "0")}`;
  const unpadded = `wt/${feature}-task-${number}`;
  if (branchExists(repoRoot, padded)) return { branch: padded, exists: true };
  if (padded !== unpadded && branchExists(repoRoot, unpadded)) return { branch: unpadded, exists: true };
  return { branch: padded, exists: false };
}

function main() {
  const opts = parseArgs(process.argv);

  if (!git(opts.repoRoot, ["rev-parse", "--is-inside-work-tree"]).ok) {
    usage(`Not a git repository: ${opts.repoRoot}`);
  }

  const baseSafe = !/^(main|master)$/iu.test(opts.base);
  const baseWarning = baseSafe
    ? null
    : `Base branch is "${opts.base}". Parallel work spawns worktrees off the base and integrates into it — never run a wave directly off main/master without explicit user consent.`;

  const wtMap = worktreePaths(opts.repoRoot);

  const tasks = opts.taskNumbers.map((number) => {
    const { branch, exists } = resolveBranch(opts.repoRoot, opts.feature, number);
    const ahead = exists ? commitsAhead(opts.repoRoot, opts.base, branch) : 0;
    const behind = exists ? commitsBehind(opts.repoRoot, opts.base, branch) : 0;
    const files = exists ? changedFiles(opts.repoRoot, opts.base, branch) : [];
    // A branch with no unique commits (ahead===0) AND an advanced base (behind>0) is
    // AMBIGUOUS by counts alone: EITHER already merged (its work folded into base) OR
    // genuinely empty (implementer never committed; base moved only because a sibling
    // merged). Disambiguate by the first-parent spine — a real --no-ff merge leaves the
    // tip OFF the spine (second parent), while an empty branch's tip stays ON it. Only
    // the off-spine case is "skip, already integrated"; the on-spine case falls through
    // to the no-work blocker so resume never silently drops never-committed work.
    const noUniqueCommits = exists && ahead === 0 && behind > 0;
    const alreadyMerged = noUniqueCommits
      && !tipOnFirstParentChain(opts.repoRoot, opts.base, branch);
    return {
      number,
      branch,
      branchExists: exists,
      commitsAhead: ahead,
      commitsBehind: behind,
      alreadyMerged,
      changedFiles: files,
      worktreePath: wtMap.get(branch) || null,
    };
  });

  // Pairwise file overlap between supposedly-independent siblings → missed dependency.
  const missedDependencySignals = [];
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const a = tasks[i];
      const b = tasks[j];
      if (!a.branchExists || !b.branchExists) continue;
      // An already-merged branch is no longer part of the concurrent set, and its
      // base..branch diff is spurious (base is ahead of it) — skip the pair.
      if (a.alreadyMerged || b.alreadyMerged) continue;
      const setB = new Set(b.changedFiles);
      const overlapping = a.changedFiles.filter((f) => setB.has(f)).sort();
      if (overlapping.length > 0) {
        missedDependencySignals.push({ tasks: [a.number, b.number], overlappingFiles: overlapping });
      }
    }
  }

  const blockers = [];
  for (const t of tasks) {
    if (!t.branchExists) {
      blockers.push(`Task ${t.number}: branch ${t.branch} does not exist — its implementer has not committed in an isolated worktree yet.`);
    } else if (t.alreadyMerged) {
      // Its work is already in base (resume after a partial integration) — skip
      // it, do not re-merge and do not block the wave on it.
      continue;
    } else if (t.commitsAhead === 0) {
      blockers.push(`Task ${t.number}: branch ${t.branch} has no commits beyond ${opts.base} (no work committed).`);
    }
  }

  const readyToIntegrate = blockers.length === 0;

  const result = {
    base: opts.base,
    feature: opts.feature,
    baseSafe,
    baseWarning,
    tasks,
    missedDependencySignals,
    mergeOrder: opts.taskNumbers,
    readyToIntegrate,
    blockers,
  };

  if (baseWarning) process.stderr.write(`Warning: ${baseWarning}\n`);
  blockers.forEach((b) => process.stderr.write(`Blocker: ${b}\n`));
  missedDependencySignals.forEach((s) =>
    process.stderr.write(`Signal: tasks ${s.tasks.join(" & ")} both touch ${s.overlappingFiles.join(", ")} — verify they were truly independent.\n`),
  );

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
