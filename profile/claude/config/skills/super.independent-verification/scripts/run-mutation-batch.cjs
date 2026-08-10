#!/usr/bin/env node
'use strict';

/*
 * run-mutation-batch.cjs - drive a WHOLE discrimination-sensor plan in one call.
 *
 * `run-mutation.cjs` runs exactly one mutation, in the real working tree, serially.
 * That is correct but slow, and it is NOT re-entrant - which matters, because the
 * natural instinct is to launch several at once. Measured, 2026-08-03: a Verifier
 * launched 4 concurrent `run-mutation.cjs` in background shells, corrupted the
 * working tree, restored with `git checkout --`, and re-ran the whole sensor
 * serially. The concurrency was the right instinct; nothing offered a safe path.
 *
 * This script is that path. Three levers, each measured independently:
 *
 *   1. BATCH     - one tool call for the whole plan instead of one per mutation.
 *                  Worth ~0% of EXECUTION time (measured: 1.01x) - it buys back the
 *                  model round-trip between calls, not runtime. Listed so nobody
 *                  credits it with the speedup that belongs to the other two.
 *   2. ISOLATION - each job runs in its own hard-link snapshot, so jobs cannot
 *                  collide and the REAL tree is never mutated at all.  (2.16x)
 *   3. SUBSET    - run the related tests first; escalate to the full suite only
 *                  when the mutant survived the subset.                (1.65x)
 *   Combined, on a 6-core box with a CPU-bound suite:                  (3.21x)
 *
 * WHY SUBSET-FIRST DOES NOT WEAKEN THE SENSOR
 *   The subset is a subset of the full suite, so a test that FAILS in the subset
 *   also fails in the full suite:   killed(subset) => killed(full).
 *   "Killed by the subset" is therefore conclusive and the full suite is skipped.
 *   The converse does NOT hold - another test file may kill a mutant its own file
 *   lets through - so "survived(subset)" is INCONCLUSIVE and always escalates to
 *   the full suite. No final verdict is ever read off a surviving subset.
 *   Validated adversarially: a mutant that survives its own test file but is killed
 *   by another one reports `killed`, identical to the serial full-suite baseline.
 *
 * Usage:
 *   node run-mutation-batch.cjs --plan <plan.json> --test '<full test cmd>'
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
const { spawn, execSync } = require('child_process');

/**
 * `node --test` reads NODE_TEST_CONTEXT and, when it is set, reports to a parent
 * runner over IPC and exits 0 EVEN WHEN TESTS FAIL. Inherited, every mutant would
 * look SURVIVED - the one verdict this script exists to get right. Same guard as
 * run-mutation.cjs; both need it independently.
 */
function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/**
 * Parallelism default. Test runners are CPU-bound and most spawn their own workers,
 * so oversubscribing costs more than it buys. Measured on 6 cores with subset-first:
 * 2 jobs 2.61x, 4 jobs 3.03x, 6 jobs 3.46x, 8 jobs 3.26x (regression). Half the
 * cores, capped at 4, sits inside the knee on every box we measured.
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
 * Apply the mutation. Byte-for-byte the same semantics as run-mutation.cjs so the
 * two scripts can never disagree about what a given plan entry means.
 */
function mutate(content, find, replace, line) {
  if (Number.isInteger(line)) {
    const lines = content.split('\n');
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) return { mutated: content, applied: false };
    if (!lines[idx].includes(find)) return { mutated: content, applied: false };
    lines[idx] = lines[idx].replace(find, replace);
    return { mutated: lines.join('\n'), applied: true };
  }
  const at = content.indexOf(find);
  if (at === -1) return { mutated: content, applied: false };
  return { mutated: content.slice(0, at) + replace + content.slice(at + find.length), applied: true };
}

/**
 * Snapshot the tree with HARD LINKS: new directory entries, shared inodes. Cost
 * scales with file COUNT, not bytes (measured: 910 files in 102ms, zero extra disk).
 * Any directory named node_modules becomes a symlink at any depth - it is read-only
 * during a test run and walking it would dominate the cost.
 */
function snapshotTree(src, dst, opts) {
  const skip = new Set(opts.skipDirs || ['.git']);
  const link = new Set(opts.linkDirs || ['node_modules']);
  let files = 0;
  (function walk(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
      const s = path.join(from, ent.name);
      const d = path.join(to, ent.name);
      if (ent.isSymbolicLink()) {
        try { fs.symlinkSync(fs.readlinkSync(s), d); } catch (e) { /* dangling link: skip */ }
      } else if (ent.isDirectory()) {
        if (skip.has(ent.name)) continue;
        if (link.has(ent.name)) { try { fs.symlinkSync(s, d, 'junction'); } catch (e) { /* best effort */ } continue; }
        walk(s, d);
      } else if (ent.isFile()) {
        try { fs.linkSync(s, d); files++; } catch (e) { fs.copyFileSync(s, d); files++; }
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

/** Cheap real-tree tripwire: any modification shows up in porcelain output. */
function gitPorcelain(repoRoot) {
  try {
    return execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null; // not a git repo - tripwire simply unavailable
  }
}

function runCmd(cmd, cwd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // The test command is the project's own, supplied by the trusted Verifier, and
    // needs shell features (`--`, `&&`, globs). Mutation inputs never reach the shell.
    const ch = spawn(cmd, { shell: true, cwd, stdio: 'ignore', env: childEnv() });
    ch.on('close', (code) => resolve({ exit: code === null ? 1 : code, ms: Date.now() - t0 }));
    ch.on('error', () => resolve({ exit: 1, ms: Date.now() - t0 }));
  });
}

async function runOne(m, opts, slot) {
  const started = Date.now();
  const rec = { id: m.id, file: m.file, line: Number.isInteger(m.line) ? m.line : null, stages: [] };
  let snapDir = null;
  let workdir = opts.repoRoot;
  let snapshotMs = 0;

  if (opts.isolate !== 'none') {
    const t = Date.now();
    snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-sensor-' + slot + '-'));
    if (opts.isolate === 'copy') fs.cpSync(opts.repoRoot, snapDir, { recursive: true, dereference: false });
    else snapshotTree(opts.repoRoot, snapDir, opts);
    snapshotMs = Date.now() - t;
    workdir = snapDir;
  }

  const rel = path.relative(opts.repoRoot, path.resolve(opts.repoRoot, m.file));
  const target = path.join(workdir, rel);
  const cleanup = () => { if (snapDir && !opts.keep) fs.rmSync(snapDir, { recursive: true, force: true }); };

  if (!fs.existsSync(target)) { rec.error = 'file not found: ' + m.file; cleanup(); return rec; }

  const original = fs.readFileSync(target, 'utf8');
  const { mutated, applied } = mutate(original, m.find, m.replace, m.line);
  if (!applied) {
    // A no-op mutant is NOT evidence: if --find never matched, the file never changed
    // and a green run is vacuous - indistinguishable from a weak test. Fail loudly.
    rec.applied = false;
    rec.error = '--find not present' + (Number.isInteger(m.line) ? ' on line ' + m.line : '') + ': ' + m.find;
    cleanup();
    return rec;
  }
  rec.applied = true;

  try {
    if (opts.isolate === 'hardlink') applyMutationBreakingLink(target, mutated);
    else fs.writeFileSync(target, mutated);

    let decided = false;
    if (m.subsetTest && !opts.noSubset) {
      const r = await runCmd(m.subsetTest, workdir);
      rec.stages.push({ stage: 'subset', exit: r.exit, ms: r.ms });
      if (r.exit !== 0) {
        // killed(subset) => killed(full). Conclusive; the full suite adds nothing.
        rec.killed = true; rec.survived = false; rec.decidedBy = 'subset';
        decided = true;
      }
    }
    if (!decided) {
      const r = await runCmd(opts.test, workdir);
      rec.stages.push({ stage: 'full', exit: r.exit, ms: r.ms });
      rec.killed = r.exit !== 0; rec.survived = r.exit === 0;
      rec.decidedBy = 'full';
    }
  } finally {
    if (opts.isolate === 'none') {
      try {
        fs.writeFileSync(target, original);
        rec.restored = fs.readFileSync(target, 'utf8') === original;
      } catch (e) {
        rec.restored = false;
        rec.error = 'RESTORE FAILED - working tree may be dirty: ' + m.file;
      }
    } else {
      rec.restored = 'n/a (real tree never mutated)';
    }
    cleanup();
  }

  rec.snapshotMs = snapshotMs;
  rec.totalMs = Date.now() - started;
  return rec;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(usage() + '\n'); process.exit(0); }
  if (!opts.plan || !opts.test) fail('missing required arg. ' + usage());
  if (!['hardlink', 'copy', 'none'].includes(opts.isolate)) fail('--isolate must be hardlink|copy|none');
  if (opts.jobs > 1 && opts.isolate === 'none') {
    // Concurrent jobs in the real tree read each other's mutant as "original" and
    // restore THAT - the exact corruption measured on 2026-08-03. Two failure modes,
    // both reproduced by this skill's tests: a left-behind mutant in the tree, and a
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

  const porcelainBefore = gitPorcelain(opts.repoRoot);
  const t0 = Date.now();
  const results = new Array(plan.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(opts.jobs, plan.length) }, (_, slot) =>
    (async function pump() {
      for (;;) {
        const i = next++;
        if (i >= plan.length) return;
        results[i] = await runOne(plan[i], opts, slot);
      }
    })()));
  const wallMs = Date.now() - t0;
  const porcelainAfter = gitPorcelain(opts.repoRoot);

  const summary = {
    total: results.length,
    killed: results.filter((r) => r.killed).length,
    survived: results.filter((r) => r.survived).length,
    errors: results.filter((r) => r.error).length,
    decidedBySubset: results.filter((r) => r.decidedBy === 'subset').length,
    decidedByFull: results.filter((r) => r.decidedBy === 'full').length,
    jobs: opts.jobs,
    isolate: opts.isolate,
    wallMs,
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
