#!/usr/bin/env node
'use strict';

/*
 * run-mutation-batch.cjs - run a whole mutation plan in one call (the TDD MUTATE step).
 *
 * `run-mutation.cjs` runs exactly one mutation, in the real working tree, and is NOT
 * re-entrant: several launched at once read each other's mutant as the "original",
 * restore it, and corrupt the tree. This script is the safe way to run many:
 *
 *   1. BATCH     - one tool call for the whole plan instead of one per mutation (saves
 *                  model round-trips, not runtime).
 *   2. ISOLATION - each job runs in its own hard-link snapshot, so jobs cannot
 *                  collide and the REAL tree is never mutated at all.
 *   3. SUBSET    - run the related tests first; escalate to the full test command only
 *                  when the mutant survived the subset.
 *
 * WHY SUBSET-FIRST DOES NOT WEAKEN THE VERDICT
 *   The subset is a subset of the test command, so a test that FAILS in the subset
 *   also fails in the full run:   killed(subset) => killed(full).
 *   "Killed by the subset" is therefore conclusive and the full run is skipped.
 *   The converse does NOT hold - another test file may kill a mutant its own file
 *   lets through - so "survived(subset)" is INCONCLUSIVE and always escalates.
 *   No final verdict is ever read off a surviving subset.
 *
 * Usage:
 *   node run-mutation-batch.cjs --plan <plan.json> --test '<test cmd>'
 *        [--jobs auto|N] [--isolate hardlink|copy|none] [--repo-root <dir>]
 *
 * plan.json - array of:
 *   { "id": "M1", "file": "src/x.ts", "line": 42, "find": "...", "replace": "...",
 *     "subsetTest": "npm test -- src/x.test.ts" }     // subsetTest optional
 *
 * Output: single JSON object on stdout - { results: [...], summary: {...} }.
 * The verdict lives in the JSON, never in the exit code (house contract).
 * Exit codes: 0 the batch ran, 2 usage/IO error (unreadable plan, unsafe flags).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// One implementation of the mutation semantics, the NODE_TEST_CONTEXT-stripping test
// runner, the byte-exact restore and the signal guard: shared with run-mutation.cjs
// so the two scripts can never disagree about what a plan entry means or how a run
// is judged.
const { mutate, runTest, restoreBytes, withSignalGuard, FATAL_SIGNALS } = require('./run-mutation.cjs');

/**
 * Parallelism default. Test runners are CPU-bound and most spawn their own workers,
 * so oversubscribing costs more than it buys: half the cores, capped at 4.
 */
function autoJobs() {
  const cores = (os.cpus() || []).length || 2;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

function parseArgs(argv) {
  const a = {
    jobs: 'auto',
    isolate: 'hardlink',
    repoRoot: process.cwd(),
    linkDirs: ['node_modules'],
    skipDirs: ['.git'],
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--plan') a.plan = argv[++i];
    else if (k === '--test') a.test = argv[++i];
    else if (k === '--jobs') a.jobs = argv[++i];
    else if (k === '--isolate') a.isolate = argv[++i];
    else if (k === '--repo-root') a.repoRoot = path.resolve(argv[++i]);
    else if (k === '--link-dir') a.linkDirs.push(argv[++i]);
    else if (k === '--skip-dir') a.skipDirs.push(argv[++i]);
    else if (k === '--no-subset') a.noSubset = true;
    else if (k === '--keep-snapshots') a.keep = true;
    else if (k === '--help' || k === '-h') a.help = true;
  }
  a.jobs = a.jobs === 'auto' ? autoJobs() : Math.max(1, parseInt(a.jobs, 10) || 1);
  return a;
}

function usage() {
  return "run-mutation-batch.cjs --plan <plan.json> --test '<cmd>' [--jobs auto|N] [--isolate hardlink|copy|none] [--repo-root <dir>]";
}

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(2);
}

/**
 * Snapshot the tree with HARD LINKS: new directory entries, shared inodes. Cost
 * scales with file COUNT, not bytes (no byte copy, no extra disk).
 * Any directory named node_modules becomes a symlink at any depth - it is read-only
 * during a test run and walking it would dominate the cost.
 * A file that can be neither linked nor read (EACCES/EPERM, e.g. a dotfile owned by
 * another user in the repo root) is left out and reported in summary.unreadable.
 */
function snapshotTree(src, dst, opts) {
  const skip = new Set(opts.skipDirs || ['.git']);
  const link = new Set(opts.linkDirs || ['node_modules']);
  let files = 0;
  (function walk(from, to) {
    fs.mkdirSync(to, { recursive: true });
    let ents;
    try { ents = fs.readdirSync(from, { withFileTypes: true }); } catch (e) {
      if (e.code !== 'EACCES' && e.code !== 'EPERM') throw e;
      if (opts.unreadable) opts.unreadable.add(path.relative(src, from) + '/');
      return;
    }
    for (const ent of ents) {
      const s = path.join(from, ent.name);
      const d = path.join(to, ent.name);
      if (ent.isSymbolicLink()) {
        try { fs.symlinkSync(fs.readlinkSync(s), d); } catch (e) { /* dangling link: skip */ }
      } else if (ent.isDirectory()) {
        if (skip.has(ent.name)) continue;
        if (link.has(ent.name)) { try { fs.symlinkSync(s, d, 'junction'); } catch (e) { /* best effort */ } continue; }
        walk(s, d);
      } else if (ent.isFile()) {
        try { fs.linkSync(s, d); files++; } catch (e) {
          try { fs.copyFileSync(s, d); files++; } catch (e2) {
            // A file this process cannot read cannot be read by the suite either.
            if (e2.code !== 'EACCES' && e2.code !== 'EPERM') throw e2;
            if (opts.unreadable) opts.unreadable.add(path.relative(src, s));
          }
        }
      }
    }
  })(src, dst);
  return files;
}

/**
 * Write the mutant WITHOUT touching the shared inode: write a sibling temp file and
 * rename over the target. Rename swaps the directory entry, so the real tree - which
 * shares the original inode - is untouched.
 *
 * A plain writeFileSync here would write THROUGH the hard link and silently corrupt
 * the real working tree. That is not theoretical: it is asserted by this skill's own
 * test suite, which mutates this function's callers and watches the source file change.
 */
function applyMutationBreakingLink(file, contents) {
  const tmp = file + '.mutation-tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

/**
 * Cheap real-tree tripwire: any modification shows up in porcelain output. git is
 * spawned directly (no shell) - this runs twice per batch on every batch.
 */
function gitPorcelain(repoRoot) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null; // not a git repo - tripwire simply unavailable
  }
}

/**
 * What an interrupt must undo, keyed by job: live test processes to kill, in-tree
 * mutants to restore (--isolate none) and snapshot dirs to delete. A job registers on
 * entry and unregisters in its own finally, so the set holds only in-flight work.
 */
const inFlight = new Set();

function onBatchSignal(sig) {
  const dirty = [];
  for (const job of inFlight) {
    if (job.restore) {
      let ok = false;
      try { ok = job.restore(); } catch (e) { /* reported below */ }
      if (!ok) dirty.push(job.file);
    }
    if (job.child && job.child.exitCode === null) { try { job.child.kill(sig); } catch (e) { /* already gone */ } }
    if (job.cleanup) { try { job.cleanup(); } catch (e) { /* best effort: tmp dir */ } }
  }
  process.stdout.write(JSON.stringify(dirty.length
    ? { error: 'RESTORE FAILED - working tree may be dirty: ' + dirty.join(', '), interrupted: sig }
    : { error: 'interrupted by ' + sig + ' - in-flight mutants restored, snapshots removed', interrupted: sig }) + '\n');
  process.exit(FATAL_SIGNALS[sig]);
}

async function runOne(m, opts, slot) {
  const started = Date.now();
  const rec = { id: m.id, file: m.file, line: Number.isInteger(m.line) ? m.line : null, stages: [] };
  const job = { file: m.file, child: null, restore: null, cleanup: null };
  let snapDir = null;
  let workdir = opts.repoRoot;
  let snapshotMs = 0;
  inFlight.add(job);

  try {
    if (opts.isolate !== 'none') {
      const t = Date.now();
      snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-' + slot + '-'));
      if (!opts.keep) job.cleanup = () => fs.rmSync(snapDir, { recursive: true, force: true });
      try {
        if (opts.isolate === 'copy') fs.cpSync(opts.repoRoot, snapDir, { recursive: true, dereference: false });
        else snapshotTree(opts.repoRoot, snapDir, opts);
      } catch (e) {
        // One job's snapshot failing (ENOSPC, EACCES) is that job's error, not the batch's.
        rec.error = 'snapshot failed: ' + (e && e.message || e);
        return rec;
      }
      snapshotMs = Date.now() - t;
      workdir = snapDir;
    }

    const rel = path.relative(opts.repoRoot, path.resolve(opts.repoRoot, m.file));
    const target = path.join(workdir, rel);

    let original;
    try { original = fs.readFileSync(target); } catch (e) { rec.error = 'file not found: ' + m.file; return rec; }
    const { mutated, applied } = mutate(original.toString('utf8'), m.find, m.replace, m.line);
    if (!applied) {
      // A no-op mutant is NOT evidence: if --find never matched, the file never changed
      // and a green run is vacuous - indistinguishable from a weak test. Fail loudly.
      rec.applied = false;
      rec.error = '--find not present' + (Number.isInteger(m.line) ? ' on line ' + m.line : '') + ': ' + m.find;
      return rec;
    }
    rec.applied = true;

    await runMutant(m, opts, rec, job, target, original, mutated, workdir);
    rec.snapshotMs = snapshotMs;
    rec.totalMs = Date.now() - started;
    return rec;
  } catch (e) {
    // An I/O failure inside one job (EACCES on the mutant write, ...) is recorded on that
    // job; it must not reject Promise.all and throw away every other job's verdict.
    rec.error = (rec.error ? rec.error + '; ' : '') + String(e && e.message || e);
    return rec;
  } finally {
    if (job.cleanup) job.cleanup();
    inFlight.delete(job);
  }
}

async function runMutant(m, opts, rec, job, target, original, mutated, workdir) {
  const run = async (cmd) => {
    const r = await runTest(cmd, workdir, (ch) => { job.child = ch; });
    job.child = null;
    return r;
  };
  if (opts.isolate === 'none') job.restore = () => restoreBytes(target, original);
  try {
    if (opts.isolate === 'hardlink') applyMutationBreakingLink(target, mutated);
    else fs.writeFileSync(target, mutated);

    let decided = false;
    if (m.subsetTest && !opts.noSubset) {
      const r = await run(m.subsetTest);
      rec.stages.push({ stage: 'subset', exit: r.exit, ms: r.ms });
      if (r.exit !== 0) {
        // killed(subset) => killed(full). Conclusive; the full suite adds nothing.
        rec.killed = true; rec.survived = false; rec.decidedBy = 'subset';
        decided = true;
      }
    }
    if (!decided) {
      const r = await run(opts.test);
      rec.stages.push({ stage: 'full', exit: r.exit, ms: r.ms });
      rec.killed = r.exit !== 0; rec.survived = r.exit === 0;
      rec.decidedBy = 'full';
    }
  } finally {
    if (opts.isolate === 'none') {
      try {
        rec.restored = restoreBytes(target, original);
      } catch (e) {
        rec.restored = false;
        rec.error = 'RESTORE FAILED - working tree may be dirty: ' + m.file;
      }
      job.restore = null;
    } else {
      rec.restored = 'n/a (real tree never mutated)';
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(usage() + '\n'); process.exit(0); }
  if (!opts.plan || !opts.test) fail('missing required arg. ' + usage());
  if (!['hardlink', 'copy', 'none'].includes(opts.isolate)) fail('--isolate must be hardlink|copy|none');
  if (opts.jobs > 1 && opts.isolate === 'none') {
    // Concurrent jobs in the real tree read each other's mutant as "original" and
    // restore THAT. Two failure modes, both reproduced by this skill's tests: a left-behind mutant in the tree, and a
    // true survivor reported `killed` because another job's fault was live during its
    // run. A false `killed` deletes a real gap from the report. Refuse, never degrade.
    fail('--jobs > 1 requires --isolate hardlink|copy: concurrent jobs in the real tree corrupt the restore and falsify verdicts');
  }

  let plan;
  try { plan = JSON.parse(fs.readFileSync(opts.plan, 'utf8')); } catch (e) { fail('unreadable plan: ' + e.message); }
  if (!Array.isArray(plan) || plan.length === 0) fail('plan must be a non-empty array');
  for (const [i, m] of plan.entries()) {
    if (!m.file || m.find === undefined || m.replace === undefined) fail('plan[' + i + '] needs file, find, replace');
    if (!m.id) m.id = 'M' + (i + 1);
  }

  opts.unreadable = new Set();
  const porcelainBefore = gitPorcelain(opts.repoRoot);
  const t0 = Date.now();
  const results = new Array(plan.length);
  let next = 0;
  await withSignalGuard(onBatchSignal, () => Promise.all(Array.from({ length: Math.min(opts.jobs, plan.length) }, (_, slot) =>
    (async function pump() {
      for (;;) {
        const i = next++;
        if (i >= plan.length) return;
        results[i] = await runOne(plan[i], opts, slot);
      }
    })())));
  const wallMs = Date.now() - t0;
  const porcelainAfter = gitPorcelain(opts.repoRoot);

  const count = (pred) => results.reduce((n, r) => n + (pred(r) ? 1 : 0), 0);
  const summary = {
    total: results.length,
    killed: count((r) => r.killed),
    survived: count((r) => r.survived),
    errors: count((r) => r.error),
    decidedBySubset: count((r) => r.decidedBy === 'subset'),
    decidedByFull: count((r) => r.decidedBy === 'full'),
    jobs: opts.jobs,
    isolate: opts.isolate,
    wallMs,
    // Left out of every snapshot because this process cannot read them.
    unreadable: [...opts.unreadable].sort(),
    // Tripwire, not decoration: if a suite writes into the repo (snapshot updates,
    // generated files) a hard-link snapshot can write through to the real tree.
    // null = not a git repo, so the tripwire could not run.
    realTreeDirtied: porcelainBefore === null || porcelainAfter === null ? null : porcelainBefore !== porcelainAfter,
  };
  process.stdout.write(JSON.stringify({ results, summary }, null, 2) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = { mutate, snapshotTree, applyMutationBreakingLink, parseArgs, autoJobs };
