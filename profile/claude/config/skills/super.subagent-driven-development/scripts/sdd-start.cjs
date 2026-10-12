#!/usr/bin/env node
'use strict';

// sdd-start.cjs — everything the controller needs before its first dispatch, in one call:
// the session state (derive-session-state.cjs), what each task needs (parse-plan.cjs), what is
// done (parse-tasks.cjs) and the branch verdict (branch-guard.cjs).
//
// Why one script: in the S10 side-by-side (2026-09-22) our controller spent ~10 Bash calls
// before its first implementer — four entry scripts, two of them re-run with a corrected flag,
// plus `ls`/`cat`/`--help` probes to find them — where upstream's opens with one. Each part
// still runs its own script's code, unchanged, so the verdicts are the ones those scripts own; the
// four are required in process — four `node` children cost ~25 ms of startup each, more than
// the parts themselves.
//
// It also settles the ledger (`.superpowers/sdd/<feature>/progress.md`, ./lib/ledger.cjs): a plan
// with work left gets the pre-flight table (./lib/preflight.cjs) once, before Task 1.
//
// Usage: node sdd-start.cjs --tasks-index <path> --platform <name> [--repo-root <path>]
// Output (stdout JSON, exit 0): { session, plan, tasks, branch, ledger, errors }. `ledger` is
// { path, preflight: { written, flagged }, seeded } — `seeded` are the `unverified`/`parked` lines
// lib/seeds.cjs took from the plan's [unverified] criteria and the spec's human actions — `flagged` lists the conflict rows
// with no `Pre-flight <row>: Ruling:` line yet; each gets one before the next dispatch. A part that fails carries { error } and is named in `errors` — a gate that did
// not run is a STOP, never a pass. Exit 1 only on a usage error.

const path = require('path');

const ledger = require('./lib/ledger.cjs');
const preflight = require('./lib/preflight.cjs');
const seeds = require('./lib/seeds.cjs');

const SKILLS = path.resolve(__dirname, '..', '..');
const session = require(path.join(SKILLS, 'super.using-superpowers', 'scripts', 'derive-session-state.cjs'));
const { parsePlan } = require(path.join(SKILLS, 'super.writing-plans', 'scripts', 'parse-plan.cjs'));
const { parseTasks } = require(path.join(__dirname, 'parse-tasks.cjs'));
const branchGuard = require(path.join(__dirname, 'branch-guard.cjs'));

/** Each part as its script's CLI would print it; a failure is `{ error }` with the CLI's message. */
const PARTS = {
  session: (o) => {
    if (!session.PLATFORMS.includes(o.platform)) throw new Error(`--platform must be one of ${session.PLATFORMS.join('/')} (got "${o.platform}")`);
    try {
      return session.buildSessionReport({ platform: o.platform, repoRoot: o.repoRoot });
    } catch (err) {
      throw new Error(`Failed to read preferences: ${err.message}`);
    }
  },
  plan: (o) => parsePlan(o.tasksIndex),
  tasks: (o) => parseTasks({ indexPath: o.tasksIndex, repoRoot: o.repoRoot }).result,
  branch: (o) => {
    const verdict = branchGuard.verdict({ cwd: o.repoRoot, featureName: branchGuard.slugFromIndex(o.tasksIndex) });
    if (!verdict) throw new Error('Error: not a git repository (or git unavailable).');
    return verdict;
  },
};

const HELP = `sdd-start.cjs — session state + plan + progress + branch verdict in one call.

  --tasks-index <path>   Required.
  --platform <name>      Required (the platform super.using-superpowers resolved).
  --repo-root <path>     Default: git toplevel of the index.
`;

function usage(message) {
  process.stderr.write(`Error: ${message}\n\n${HELP}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const flags = { '--tasks-index': 'tasksIndex', '--platform': 'platform', '--repo-root': 'repoRoot' };
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = flags[args[i]];
    if (!key) usage(`Unknown argument: ${args[i]}`);
    if (args[i + 1] == null) usage(`${args[i]} requires a value`);
    opts[key] = args[++i];
  }
  if (!opts.tasksIndex) usage('--tasks-index <path> is required');
  if (!opts.platform) usage('--platform <name> is required');
  opts.tasksIndex = path.resolve(opts.tasksIndex);
  if (!opts.repoRoot) opts.repoRoot = ledger.gitFacts(path.dirname(opts.tasksIndex)).root || process.cwd();
  return opts;
}

/** A part's result, or `{ error }` with the first line of what went wrong. */
function run(part, opts) {
  try {
    return part(opts);
  } catch (err) {
    return { error: String(err.message || err).trim().split('\n')[0] };
  }
}

/** The pre-flight table, written once for a plan with work left; its flagged rows every time. */
function settleLedger(opts, plansDir, tasks) {
  const file = ledger.ledgerPathFor(plansDir, opts.repoRoot);
  const out = { path: file, preflight: { written: false, flagged: [] }, seeded: [] };
  if (!tasks || tasks.error || !tasks.found || tasks.allDone) return out;
  try {
    const rows = preflight.scan(opts.tasksIndex);
    const content = ledger.readLedger(file);
    const done = new Set((tasks.completed || []).map((t) => t.number));
    out.preflight.flagged = preflight.flagged(rows, done)
      .filter((r) => !preflight.isRuled(content, r.id))
      .map((r) => `${r.id} ${r.subject}: ${r.finding}`);
    if (rows.length && !preflight.hasTable(content)) out.preflight.written = ledger.appendBlock(file, preflight.table(rows));
    // Unverified criteria and human actions the plan and the spec declared: ledgered once, so
    // sdd-finish asks a ruling on each and the final summary lists them.
    out.seeded = seeds.pendingSeeds(opts.tasksIndex, opts.repoRoot)
      .map((line) => ledger.appendLine(file, line)).filter(Boolean);
  } catch (err) {
    return { ...out, error: `pre-flight table not written: ${err.message}` };
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  const result = {};
  const plansDir = path.dirname(opts.tasksIndex);
  const parts = { ...opts, repoRoot: path.resolve(opts.repoRoot) };
  for (const name of Object.keys(PARTS)) result[name] = run(PARTS[name], parts);
  result.ledger = settleLedger(opts, plansDir, result.tasks);
  result.errors = [...Object.keys(PARTS), 'ledger'].filter((name) => result[name] && result[name].error);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
