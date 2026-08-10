#!/usr/bin/env node
'use strict';

/*
 * barrier.cjs — the integration barrier as one deterministic call.
 *
 * WHY THIS EXISTS
 *
 * The barrier is prose in `references/integration-barrier.md`: "run the project's heavy
 * shared-state sequence — format/lint autofix -> typecheck -> full test suite -> build".
 * Correct, but every run was hand-assembled. Measured on one 19-task feature: 16 barrier
 * invocations written 16 different ways, 1.15h of wall-clock in Bash, and one workspace's
 * full suite executed 30+ times. Two costs were structural:
 *
 *   1. NO SCOPING. A wave that touched only one workspace still ran every other
 *      workspace's lint, typecheck and suite, because "full test suite" reads as "everything".
 *      Scoping is safe here precisely because the wave's write-set is already proven
 *      (check-wave-disjoint ran upstream): a workspace no task wrote cannot have broken.
 *   2. NO PARALLELISM. Backend and frontend are independent processes with no shared
 *      state, and they were run one after the other — often as two separate tool calls.
 *
 * This script fixes both without changing the semantics: same phases, same order, same
 * stop-at-first-failure, same exit-code evidence. `planBarrier()` is pure and is where
 * the decisions live; execution is a thin shell around it.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not decide whether the barrier should run, does not commit, and does not
 * interpret failures. Those stay with the orchestrator — this returns evidence, and
 * `super.verification-before-completion` still requires the orchestrator to read it.
 *
 * Usage:
 *   node scripts/barrier.cjs --repo-root <path> [--changed <a,b,c>] [--plan] [--json]
 *
 *   --changed  comma-separated paths the wave wrote (the union of its write-sets).
 *              Omitted -> full scope, every workspace (the conservative default).
 *   --plan     print the plan and exit without running anything.
 *
 * Exit codes:
 *   0  the barrier ran and every phase passed (or --plan)
 *   1  usage error / unreadable repo
 *   2  a phase failed (read `failedPhase` in the JSON output)
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** Phase order is normative — see references/integration-barrier.md. */
const PHASES = ['lint', 'typecheck', 'test', 'build'];

/**
 * Script-name candidates per phase, in preference order. First match in a workspace's
 * package.json wins. Deliberately a small list: an unrecognised project degrades to
 * "phase absent" (skipped, reported) rather than guessing a command that might mutate
 * something unexpected.
 */
const SCRIPT_CANDIDATES = {
  lint: ['lint:fix', 'biome:fix', 'format', 'lint'],
  typecheck: ['tsc:check', 'typecheck', 'type-check', 'tsc'],
  test: ['test:run', 'test'],
  build: ['build'],
};

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Discover workspaces from pnpm-workspace.yaml or package.json `workspaces`.
 * Returns [{ name, dir, scripts }]. A single-package repo yields one entry at the root.
 */
function discoverWorkspaces(repoRoot) {
  const globs = [];

  const pnpmFile = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile)) {
    // Intentionally a line matcher, not a YAML parser: this file is a fixed
    // `packages:` list in practice, and adding a dependency to read four lines
    // would be a worse trade than the narrow parse.
    for (const line of fs.readFileSync(pnpmFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m) globs.push(m[1].trim());
    }
  }

  const rootPkg = readJSON(path.join(repoRoot, 'package.json'));
  if (rootPkg && Array.isArray(rootPkg.workspaces)) globs.push(...rootPkg.workspaces);
  else if (rootPkg && rootPkg.workspaces && Array.isArray(rootPkg.workspaces.packages)) {
    globs.push(...rootPkg.workspaces.packages);
  }

  const dirs = new Set();
  for (const glob of globs) {
    if (glob.startsWith('!')) continue;
    const base = glob.replace(/\/\*+$/, '');
    const abs = path.join(repoRoot, base);
    if (!fs.existsSync(abs)) continue;
    if (glob.endsWith('*')) {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.isDirectory() && fs.existsSync(path.join(abs, entry.name, 'package.json'))) {
          dirs.add(path.join(base, entry.name));
        }
      }
    } else if (fs.existsSync(path.join(abs, 'package.json'))) {
      dirs.add(base);
    }
  }

  const workspaces = [];
  for (const dir of [...dirs].sort()) {
    const pkg = readJSON(path.join(repoRoot, dir, 'package.json'));
    if (!pkg) continue;
    workspaces.push({
      name: pkg.name || dir,
      dir,
      scripts: pkg.scripts || {},
      deps: Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }),
    });
  }

  if (workspaces.length === 0 && rootPkg) {
    workspaces.push({ name: rootPkg.name || '.', dir: '.', scripts: rootPkg.scripts || {}, deps: [] });
  }
  return workspaces;
}

/**
 * Expand a set of workspaces to include everything that depends on them, transitively.
 *
 * A shared package's consumers are part of its blast radius. Encoded from a real miss:
 * a change to `packages/api-types` broke the FRONTEND typecheck while the wave that
 * wrote it touched no frontend file at all — write-set scoping alone would have called
 * that wave green. Iterates to a fixed point so second-order dependents are covered too.
 */
function withDependents(workspaces, seed) {
  const selected = new Set(seed);
  let grew = true;
  while (grew) {
    grew = false;
    const selectedNames = new Set([...selected].map((w) => w.name));
    for (const ws of workspaces) {
      if (selected.has(ws)) continue;
      if ((ws.deps || []).some((d) => selectedNames.has(d))) {
        selected.add(ws);
        grew = true;
      }
    }
  }
  return [...selected];
}

/** First script in a workspace matching the phase's candidates, else null. */
function scriptFor(workspace, phase) {
  for (const candidate of SCRIPT_CANDIDATES[phase]) {
    if (workspace.scripts[candidate]) return candidate;
  }
  return null;
}

/**
 * Which workspaces a set of changed paths touches. A path under `apps/backend/...`
 * selects the `apps/backend` workspace. Anything that matches no workspace (a root
 * config, a lockfile, a shared package) widens the scope back to ALL workspaces —
 * a root-level change can break any of them, and narrowing there would be the one
 * case where scoping actually loses coverage.
 */
function scopeWorkspaces(workspaces, changed) {
  if (!changed || changed.length === 0) return { selected: workspaces, reason: 'full-scope' };

  const selected = new Set();
  let widen = false;

  for (const raw of changed) {
    const file = raw.trim().replace(/^\.\//, '');
    if (!file) continue;
    const owner = workspaces.find((w) => w.dir !== '.' && (file === w.dir || file.startsWith(w.dir + '/')));
    if (owner) selected.add(owner);
    else widen = true;
  }

  if (widen || selected.size === 0) return { selected: workspaces, reason: 'widened-by-unowned-path' };

  // The written workspaces are not the whole blast radius: anything that depends on them
  // can break without having been written. Pull those in before calling the scope safe.
  const expanded = withDependents(workspaces, selected);
  const reason = expanded.length > selected.size ? 'scoped-by-write-set+dependents' : 'scoped-by-write-set';
  return { selected: expanded, reason };
}

/**
 * Build the execution plan. Pure — no side effects, no spawning. This is the unit the
 * tests pin, because it is where every decision that matters is made.
 */
function planBarrier({ repoRoot, changed }) {
  const workspaces = discoverWorkspaces(repoRoot);
  const { selected, reason } = scopeWorkspaces(workspaces, changed);

  // In a monorepo the build is normally a single root-level orchestration (turbo/nx/lerna),
  // not a per-workspace script. Prefer that one root build when it exists — running it
  // per workspace would both duplicate work and skip the cross-workspace graph it exists
  // to check. Falls back to per-workspace builds for repos without a root build.
  const rootPkg = readJSON(path.join(repoRoot, 'package.json'));
  const rootBuild = rootPkg && rootPkg.scripts && scriptFor({ scripts: rootPkg.scripts }, 'build');
  const buildTargets = rootBuild
    ? [{ name: rootPkg.name || '.', dir: '.', scripts: rootPkg.scripts }]
    : workspaces;

  const phases = [];
  for (const phase of PHASES) {
    // Build is an integration check over the whole repo: scoping it to one workspace
    // would not prove the repo still builds, which is the only thing it is there for.
    const targets = phase === 'build' ? buildTargets : selected;
    const jobs = [];
    for (const ws of targets) {
      const script = scriptFor(ws, phase);
      if (script) jobs.push({ workspace: ws.name, dir: ws.dir, script });
    }
    phases.push({ phase, jobs, skipped: jobs.length === 0 });
  }

  return {
    repoRoot,
    scope: reason,
    workspacesDiscovered: workspaces.map((w) => w.dir),
    workspacesSelected: selected.map((w) => w.dir),
    phases,
  };
}

/**
 * Run one phase's jobs concurrently. They are independent processes by construction —
 * different workspaces, no shared state — which is the whole reason the phase can be
 * parallelised at all. Within a phase order does not matter; ACROSS phases it does, so
 * the caller awaits each phase fully before starting the next.
 */
function runPhase(repoRoot, phaseplan) {
  return Promise.all(
    phaseplan.jobs.map(
      (job) =>
        new Promise((resolve) => {
          const started = Date.now();
          const proc = spawn('npm', ['run', '--silent', job.script], {
            cwd: path.join(repoRoot, job.dir),
            shell: false,
          });
          let out = '';
          proc.stdout.on('data', (d) => { out += d; });
          proc.stderr.on('data', (d) => { out += d; });
          proc.on('error', () => resolve({ ...job, exitCode: 1, ms: Date.now() - started, tail: 'failed to spawn' }));
          proc.on('close', (code) =>
            resolve({
              ...job,
              exitCode: code == null ? 1 : code,
              ms: Date.now() - started,
              tail: out.split('\n').filter(Boolean).slice(-8).join('\n'),
            }),
          );
        }),
    ),
  );
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') args.repoRoot = argv[++i];
    else if (argv[i] === '--changed') args.changed = (argv[++i] || '').split(',');
    else if (argv[i] === '--plan') args.plan = true;
  }
  if (!args.repoRoot) {
    process.stderr.write('usage: barrier.cjs --repo-root <path> [--changed a,b] [--plan]\n');
    process.exit(1);
  }
  if (!fs.existsSync(args.repoRoot)) {
    process.stderr.write(`repo root not found: ${args.repoRoot}\n`);
    process.exit(1);
  }

  const plan = planBarrier({ repoRoot: args.repoRoot, changed: args.changed });
  if (args.plan) {
    process.stdout.write(JSON.stringify({ ...plan, executed: false }, null, 2) + '\n');
    process.exit(0);
  }

  runAllPhases(plan).then(({ phaseResults, failedPhase }) => {
    const out = { ...plan, executed: true, phases: phaseResults, failedPhase, green: failedPhase === null };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(failedPhase ? 2 : 0);
  });
}

/** Phases run in order and stop at the first failure — that ordering is normative. */
async function runAllPhases(plan) {
  const phaseResults = [];
  let failedPhase = null;
  for (const phaseplan of plan.phases) {
    if (phaseplan.skipped) {
      phaseResults.push({ phase: phaseplan.phase, skipped: true, jobs: [] });
      continue;
    }
    const jobs = await runPhase(plan.repoRoot, phaseplan);
    phaseResults.push({ phase: phaseplan.phase, skipped: false, jobs });
    if (jobs.some((j) => j.exitCode !== 0)) {
      failedPhase = phaseplan.phase;
      break;
    }
  }
  return { phaseResults, failedPhase };
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { planBarrier, discoverWorkspaces, scopeWorkspaces, scriptFor, PHASES };
