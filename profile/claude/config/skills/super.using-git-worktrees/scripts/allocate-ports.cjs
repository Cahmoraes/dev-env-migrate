#!/usr/bin/env node
/**
 * allocate-ports.cjs — Deterministic, collision-free port blocks per git worktree.
 *
 * WHY THIS EXISTS
 * ---------------
 * A git worktree isolates FILES, not the RUNTIME. Two implementers working in two
 * worktrees still share one loopback interface, so the moment either one boots a dev
 * server, a database container, a broker or a Playwright `webServer`, they collide on
 * the same hard-coded port (3000, 5432, 5672, 6379...) and one of them fails with
 * EADDRINUSE — a failure that looks like a broken implementation, not like a missing
 * environment. That misdiagnosis is the expensive part: it is indistinguishable from a
 * real bug until someone reads the stack trace.
 *
 * This script closes that gap the way the platform world already closed it: the
 * environment assigns the port, the application reads it (12-factor "port binding").
 * The worktree IS the environment, so the worktree gets a block of ports and exports
 * them as environment variables the app already knows how to read.
 *
 * ALLOCATION MODEL (and why each part is the way it is)
 * ----------------------------------------------------
 * 1. HASH-SEEDED, not index-seeded. The starting block is derived from FNV-1a over the
 *    worktree's identity (branch name, falling back to its path). An index-based scheme
 *    ("the 3rd worktree gets +30") renumbers every later worktree when an earlier one is
 *    removed, silently moving a running service's port. A hash is stable across the
 *    add/remove churn that concurrent dispatches produce.
 * 2. LINEAR PROBING on collision. Hashing collides; probing walks to the next block.
 * 3. TWO independent liveness checks before a block is accepted:
 *      (a) no LIVE lease from another worktree overlaps it — cheap, catches siblings
 *          that hold a block for a service that is momentarily down;
 *      (b) every port in the block actually binds — catches anything outside our
 *          bookkeeping (the user's own `docker compose up`, another project, a stray
 *          process). Bookkeeping alone would hand out a port the OS refuses.
 * 4. LEASES ARE PERSISTED AND REUSED. Re-running for the same worktree returns the same
 *    block, so a long-running container keeps its port across a resumed session. The
 *    ledger lives under the git COMMON dir, which every worktree of the repo shares by
 *    construction and which is never committed — no .gitignore dependency, no chance of
 *    leaking a machine-local file into a PR.
 * 5. THE LEDGER IS WRITTEN UNDER AN EXCLUSIVE LOCK. A concurrent dispatch allocates for N
 *    worktrees at the same instant; without a lock, two allocators both read a ledger
 *    that does not yet contain the other's block, both pass the bind probe (nothing is
 *    listening YET), and both write the same block — a race whose symptom appears
 *    minutes later, when the servers actually start. Check-and-write is therefore one
 *    critical section, and the bind probe happens INSIDE it.
 * 6. THE MAIN WORKING TREE KEEPS THE CANONICAL PORTS. Slot allocation applies to linked
 *    worktrees only, so the developer's ordinary `git checkout` workflow is untouched
 *    and the same env-var contract works in both places.
 *
 * The range defaults to 20000-32767: above the crowded registered range and below the
 * Linux ephemeral range (`net.ipv4.ip_local_port_range`, typically 32768-60999), so the
 * kernel never hands one of our reserved ports to an unrelated outbound socket.
 *
 * CONFIGURATION — `.superpowers/ports.yml` in the consumer repo (absent = disabled):
 *
 *   range: 20000-32767        # optional
 *   block_size: 16            # optional; must be >= the number of services
 *   compose_project: true     # optional; also emit COMPOSE_PROJECT_NAME
 *   services:
 *     frontend: 3000          # <name>: <canonical port used by the main working tree>
 *     backend: 3333
 *     postgres: 5432
 *
 * Each service maps to `<NAME>_PORT` (upper snake case). A service that needs two ports
 * is two entries (`rabbitmq: 5672`, `rabbitmq_management: 15672`) — one slot per port
 * keeps the model flat and the env contract unambiguous.
 *
 * Usage:
 *   node scripts/allocate-ports.cjs [--worktree <path>] [--repo-root <path>]
 *                                   [--write-env|--no-write-env] [--json-only]
 *   node scripts/allocate-ports.cjs --release [--worktree <path>]
 *   node scripts/allocate-ports.cjs --list
 *   node scripts/allocate-ports.cjs --check
 *   node scripts/allocate-ports.cjs --detect
 *
 * Exit codes (the repo-wide contract: the VERDICT lives in the JSON, never in `$?`):
 *   0  ran successfully — inspect `enabled`, `configured`, `conflicts`
 *   1  usage error, or an unrecoverable IO/git failure
 */

"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const CONFIG_RELPATH = path.join(".superpowers", "ports.yml");
const LEDGER_RELPATH = path.join("superpowers", "port-leases.json");
const ENV_RELPATH = path.join(".superpowers", "ports.env");
const DEFAULT_RANGE = { start: 20000, end: 32767 };
const DEFAULT_BLOCK_SIZE = 16;
const LOCK_STALE_MS = 15000;
const LOCK_TIMEOUT_MS = 20000;

const HELP = `
allocate-ports.cjs — Deterministic, collision-free port blocks per git worktree.

Usage:
  node scripts/allocate-ports.cjs [options]

Modes (default is allocate):
  (default)     Allocate or reuse this worktree's port block; write the env file
  --release     Release this worktree's lease (run before removing the worktree)
  --list        List every live lease in the repo (reaps leases of removed worktrees)
  --check       Verify live leases are mutually disjoint and still bindable
  --detect      Scan the repo for port-bearing services and print a ports.yml proposal

Options:
  --worktree <path>   Worktree to allocate for (default: cwd)
  --repo-root <path>  Repository root override (default: git detection from --worktree)
  --no-write-env      Do not write .superpowers/ports.env (allocation still persists)
  --json-only         Suppress the human-readable stderr summary
  --help              Show this help and exit 0

Configuration: .superpowers/ports.yml in the repo (absent → {"enabled": false}).
  range: 20000-32767
  block_size: 16
  compose_project: true
  services:
    backend: 3333
    postgres: 5432

Output (stdout): JSON. The verdict is in the JSON, never in the exit code.
  { enabled, configured, configPath, worktreePath, worktreeId, isMainWorktree,
    block: {start,size}|null, services: [...], env: {...}, envFile, envWritten,
    reused, probes, conflicts: [...], warnings: [...] }

Exit codes:
  0  success
  1  usage error or unrecoverable failure
`.trimStart();

// ─── CLI plumbing ────────────────────────────────────────────────────────────

function usage(message) {
  process.stderr.write(`${message}\n\n${HELP}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const opts = {
    mode: "allocate",
    worktree: process.cwd(),
    repoRoot: null,
    writeEnv: true,
    jsonOnly: false,
  };
  const modes = { "--release": "release", "--list": "list", "--check": "check", "--detect": "detect" };
  let modeFlag = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (modes[a]) {
      if (modeFlag) usage(`Conflicting modes: ${modeFlag} and ${a}`);
      modeFlag = a;
      opts.mode = modes[a];
      continue;
    }
    if (a === "--worktree") { opts.worktree = args[++i]; continue; }
    if (a === "--repo-root") { opts.repoRoot = args[++i]; continue; }
    if (a === "--no-write-env") { opts.writeEnv = false; continue; }
    if (a === "--write-env") { opts.writeEnv = true; continue; }
    if (a === "--json-only") { opts.jsonOnly = true; continue; }
    usage(`Unknown argument: ${a}`);
  }
  if (!opts.worktree) usage("--worktree requires a path");
  opts.worktree = path.resolve(opts.worktree);
  if (opts.repoRoot) opts.repoRoot = path.resolve(opts.repoRoot);
  return opts;
}

// ─── git queries (read-only) ─────────────────────────────────────────────────

function git(cwd, gitArgs) {
  try {
    const out = execFileSync("git", ["-C", cwd, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: ((err && err.stdout) || "").toString().trim() };
  }
}

/**
 * Resolve the git topology this script depends on.
 *
 * `commonDir` is what makes the ledger correct: every linked worktree of a repository
 * resolves `--git-common-dir` to the SAME directory, so a ledger stored under it is
 * automatically shared by all of them and automatically separate from another repo's.
 * `mainRoot` (the common dir's parent) is where `.superpowers/ports.yml` lives, because
 * a freshly created worktree may not have the config committed on its branch yet.
 */
function resolveGitEnv(startDir, repoRootOverride) {
  const probe = fs.existsSync(startDir) ? startDir : process.cwd();

  // ONE spawn instead of six. `rev-parse` answers its flags in argument order, one line
  // each, and stops at the first one that fails — so the line count says how far it got.
  // Outside a repo nothing prints; in a bare repo (or inside .git/) `--show-toplevel`
  // fails, leaving three lines. Only the last flag is allowed to fail on its own: an
  // unborn HEAD makes `--abbrev-ref HEAD` exit non-zero after printing "HEAD", which is
  // the same "no branch" answer a detached HEAD gives with exit 0.
  const all = git(probe, [
    "rev-parse",
    "--is-inside-work-tree",
    "--absolute-git-dir",
    "--git-common-dir",
    "--show-toplevel",
    "--is-bare-repository",
    "--abbrev-ref", "HEAD",
  ]);
  const lines = all.out ? all.out.split("\n").map((l) => l.trim()) : [];
  if (lines.length < 5) return { ok: false };
  const [, gitDirOut, commonRaw, topLevelOut, isBareOut, branchOut] = lines;

  // --git-common-dir may come back relative (".git") on older git; resolve against the
  // worktree top level, never against cwd, which may be a subdirectory.
  const commonDir = path.resolve(topLevelOut, commonRaw);
  const isLinkedWorktree = path.resolve(gitDirOut) !== commonDir;

  // A bare repo's common dir has no working-tree parent; guard so mainRoot stays sane.
  const isBare = isBareOut === "true";
  const mainRoot = repoRootOverride || (isBare ? commonDir : path.dirname(commonDir));

  const branch = all.ok && branchOut && branchOut !== "HEAD" ? branchOut : null;

  return {
    ok: true,
    commonDir,
    mainRoot,
    worktreeRoot: path.resolve(topLevelOut),
    isLinkedWorktree,
    branch,
  };
}

/** Absolute paths of every worktree git currently knows about. */
function knownWorktreePaths(cwd) {
  const res = git(cwd, ["worktree", "list", "--porcelain"]);
  if (!res.ok) return null;
  const paths = new Set();
  for (const line of res.out.split("\n")) {
    if (line.startsWith("worktree ")) paths.add(path.resolve(line.slice("worktree ".length).trim()));
  }
  return paths;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Minimal two-level YAML reader for `.superpowers/ports.yml`.
 *
 * Deliberately local rather than shared with super.using-superpowers' preferences
 * parser: skills are distributed independently, so a cross-skill `require` breaks the
 * moment someone installs this skill alone — the parser is small and is being duplicated
 * on purpose. The grammar this file needs is a flat scalar map plus one
 * nested `services:` map — small enough that duplication is cheaper than coupling.
 */
function parsePortsYaml(content) {
  const root = { services: {} };
  let inServices = false;
  let malformed = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\s+#.*$/u, "").replace(/^\s*#.*$/u, "").trimEnd();
    if (!line.trim()) continue;

    // Service names follow Compose's grammar, which allows dots and dashes.
    const nested = line.match(/^(\s+)([A-Za-z_][A-Za-z0-9_.-]*):\s*(.*)$/u);
    if (nested) {
      if (!inServices) { malformed = true; continue; }
      root.services[nested[2]] = nested[3].trim().replace(/^['"]|['"]$/gu, "");
      continue;
    }

    const topSection = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*$/u);
    if (topSection) {
      inServices = topSection[1] === "services";
      if (!inServices) root[topSection[1]] = {};
      continue;
    }

    const topKv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s+(.+)$/u);
    if (topKv) {
      inServices = false;
      const raw = topKv[2].trim();
      let value;
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else value = raw.replace(/^['"]|['"]$/gu, "");
      root[topKv[1]] = value;
      continue;
    }

    malformed = true;
  }
  return { config: root, malformed };
}

function readConfig(mainRoot) {
  const configPath = path.join(mainRoot, CONFIG_RELPATH);
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    const warnings = err.code === "ENOENT" ? [] : [`Cannot read ${configPath}: ${err.message}`];
    return { found: false, configPath, services: [], warnings };
  }
  const { config, malformed } = parsePortsYaml(raw);
  const warnings = [];
  if (malformed) warnings.push(`${CONFIG_RELPATH} has lines this reader does not understand; only flat keys and a nested services: map are supported.`);

  // Services keep DECLARATION ORDER, not alphabetical order: the slot index is derived
  // from position, so re-sorting would silently move every service's port.
  const services = Object.entries(config.services || {}).map(([name, value], index) => ({
    name,
    canonicalPort: Number.parseInt(String(value), 10),
    slot: index,
    envVar: `${name.replace(/[^A-Za-z0-9]+/gu, "_").toUpperCase()}_PORT`,
  }));

  for (const svc of services) {
    if (!Number.isFinite(svc.canonicalPort) || svc.canonicalPort < 1 || svc.canonicalPort > 65535) {
      warnings.push(`Service "${svc.name}" has an invalid canonical port; it will still receive an allocated slot.`);
      svc.canonicalPort = null;
    }
  }

  const range = parseRange(config.range, warnings);
  let blockSize = Number.parseInt(String(config.block_size ?? DEFAULT_BLOCK_SIZE), 10);
  if (!Number.isFinite(blockSize) || blockSize < 1) {
    warnings.push(`Invalid block_size; falling back to ${DEFAULT_BLOCK_SIZE}.`);
    blockSize = DEFAULT_BLOCK_SIZE;
  }
  if (services.length > blockSize) {
    warnings.push(`block_size (${blockSize}) is smaller than the ${services.length} declared services; raising it to ${services.length}.`);
    blockSize = services.length;
  }

  return {
    found: true,
    configPath,
    services,
    range,
    blockSize,
    composeProject: config.compose_project !== false,
    warnings,
  };
}

function parseRange(raw, warnings) {
  if (raw === undefined || raw === null || raw === "") return { ...DEFAULT_RANGE };
  const m = String(raw).match(/^(\d+)\s*-\s*(\d+)$/u);
  if (!m) {
    warnings.push(`Invalid range "${raw}"; falling back to ${DEFAULT_RANGE.start}-${DEFAULT_RANGE.end}.`);
    return { ...DEFAULT_RANGE };
  }
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (start < 1024 || end > 65535 || end <= start) {
    warnings.push(`Range ${start}-${end} is out of bounds; falling back to ${DEFAULT_RANGE.start}-${DEFAULT_RANGE.end}.`);
    return { ...DEFAULT_RANGE };
  }
  const ephemeral = readEphemeralRange();
  if (ephemeral && start < ephemeral.end && end >= ephemeral.start) {
    warnings.push(`Range ${start}-${end} overlaps this machine's ephemeral port range (${ephemeral.start}-${ephemeral.end}); the kernel may hand an allocated port to an unrelated outbound socket.`);
  }
  return { start, end };
}

/** Linux exposes the ephemeral range; other platforms return null and we skip the check. */
function readEphemeralRange() {
  try {
    const raw = fs.readFileSync("/proc/sys/net/ipv4/ip_local_port_range", "utf8").trim();
    const [start, end] = raw.split(/\s+/u).map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(start) && Number.isFinite(end)) return { start, end };
  } catch { /* not Linux, or unreadable — the check is best-effort by design */ }
  return null;
}

// ─── Ledger (shared across all worktrees of the repo) ────────────────────────

function ledgerPath(commonDir) {
  return path.join(commonDir, LEDGER_RELPATH);
}

function readLedger(commonDir) {
  const file = ledgerPath(commonDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.leases !== "object" || parsed.leases === null) {
      return { version: 1, leases: {} };
    }
    return { version: 1, leases: parsed.leases };
  } catch {
    // Absent ledger → empty. A corrupt ledger must not wedge every future allocation. Rebuilding costs at most
    // one reallocation per worktree, and the bind probe still keeps that safe.
    return { version: 1, leases: {} };
  }
}

function writeLedger(commonDir, ledger) {
  const file = ledgerPath(commonDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file); // atomic replace — a reader never observes a partial ledger
}

/**
 * Drop leases whose worktree git no longer knows about. Path-existence alone is not the
 * test: `git worktree remove` deletes the directory, but a user who deletes it by hand
 * leaves git's administrative entry behind, and a prunable entry should not keep holding
 * ports. When git cannot answer (`knownPaths === null`) nothing is reaped — losing a
 * live lease is worse than keeping a dead one.
 */
function reapLeases(ledger, knownPaths, mainRoot) {
  if (!knownPaths) return { ledger, reaped: [] };
  const reaped = [];
  for (const wtPath of Object.keys(ledger.leases)) {
    const alive = knownPaths.has(path.resolve(wtPath)) || path.resolve(wtPath) === path.resolve(mainRoot);
    if (!alive) {
      reaped.push(wtPath);
      delete ledger.leases[wtPath];
    }
  }
  return { ledger, reaped };
}

// ─── Exclusive lock around check-and-write ───────────────────────────────────

async function withLock(commonDir, fn) {
  const lockFile = path.join(commonDir, "superpowers", "port-leases.lock");
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd = null;

  for (;;) {
    try {
      fd = fs.openSync(lockFile, "wx"); // O_CREAT|O_EXCL — atomic on POSIX and Windows
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), host: os.hostname() }));
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (isStaleLock(lockFile)) {
        try { fs.unlinkSync(lockFile); } catch { /* another waiter won the cleanup race */ }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for the port-lease lock (${lockFile}). Remove it if no allocation is running.`);
      }
      await sleep(20 + Math.floor(Math.random() * 60)); // jitter so N waiters do not resynchronize
    }
  }

  try {
    return await fn();
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    try { fs.unlinkSync(lockFile); } catch { /* already removed by a stale-lock reaper */ }
  }
}

function isStaleLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) return true;
    const holder = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (holder && typeof holder.pid === "number" && holder.host === os.hostname()) {
      try {
        process.kill(holder.pid, 0); // signal 0 = liveness probe, sends nothing
        return false;
      } catch (err) {
        return err.code === "ESRCH"; // holder is gone; EPERM means alive but not ours
      }
    }
  } catch { /* unreadable or vanished mid-check → let the caller retry */ }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// ─── Port probing ────────────────────────────────────────────────────────────

/**
 * True when nothing is listening on `port`.
 *
 * Binding the wildcard address is the strongest single probe available: on Linux a
 * wildcard bind fails with EADDRINUSE when ANY address (including 127.0.0.1, where
 * Docker commonly publishes) already holds the port, so one probe covers both the
 * loopback-only and the all-interfaces case. `exclusive: true` disables SO_REUSEPORT-style
 * sharing so the probe cannot succeed alongside an existing listener.
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch { /* never listened */ }
      resolve(value);
    };
    server.once("error", () => done(false));
    server.once("listening", () => done(true));
    try {
      server.listen({ port, host: "0.0.0.0", exclusive: true });
    } catch {
      done(false);
    }
  });
}

/**
 * Probe the whole block concurrently: the ports are independent, so N sequential
 * bind/close round-trips collapse into one. Every probe socket is closed before the
 * promise settles, so nothing is left listening either way.
 */
async function blockIsBindable(start, size) {
  const probes = [];
  for (let p = start; p < start + size; p += 1) probes.push(isPortFree(p));
  return (await Promise.all(probes)).every(Boolean);
}

// ─── Allocation ──────────────────────────────────────────────────────────────

/** FNV-1a (32-bit). Chosen for being tiny, dependency-free and well-dispersed. */
function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function blocksOverlap(aStart, aSize, bStart, bSize) {
  return aStart < bStart + bSize && bStart < aStart + aSize;
}

/**
 * Find a block for `worktreePath`, honouring an existing lease when it is still usable.
 *
 * MUST run inside `withLock`: it reads the ledger, probes the OS, and returns the block
 * the caller then writes back. Splitting read from write reopens the race the lock exists
 * to close.
 */
async function findBlock({ ledger, worktreePath, seedKey, range, blockSize }) {
  const key = path.resolve(worktreePath);
  const others = Object.entries(ledger.leases)
    .filter(([p]) => path.resolve(p) !== key)
    .map(([, lease]) => lease);

  const overlapsSibling = (start) =>
    others.some((lease) => blocksOverlap(start, blockSize, lease.blockStart, lease.blockSize));

  const existing = ledger.leases[key];
  if (existing && existing.blockSize === blockSize && !overlapsSibling(existing.blockStart)) {
    if (await blockIsBindable(existing.blockStart, blockSize)) {
      return { blockStart: existing.blockStart, reused: true, probes: 1, exhausted: false };
    }
  }

  const blockCount = Math.floor((range.end - range.start + 1) / blockSize);
  if (blockCount < 1) return { blockStart: null, reused: false, probes: 0, exhausted: true };

  const startIndex = fnv1a32(seedKey) % blockCount;
  for (let attempt = 0; attempt < blockCount; attempt += 1) {
    const index = (startIndex + attempt) % blockCount;
    const candidate = range.start + index * blockSize;
    if (overlapsSibling(candidate)) continue;
    if (await blockIsBindable(candidate, blockSize)) {
      return { blockStart: candidate, reused: false, probes: attempt + 1, exhausted: false };
    }
  }
  return { blockStart: null, reused: false, probes: blockCount, exhausted: true };
}

/**
 * Docker Compose isolates networks, volumes and container names by PROJECT, not by
 * directory, so two worktrees running the same compose file collide on container names
 * even after their published ports differ. Deriving the project name from the worktree
 * identity restores that isolation. Compose accepts [a-z0-9][a-z0-9_-]* only.
 */
function composeProjectName(seedKey) {
  const slug = seedKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(-40)
    .replace(/^-+/u, "");
  const base = slug || "worktree";
  return /^[a-z0-9]/u.test(base) ? base : `w-${base}`;
}

function buildAssignment({ services, blockStart, canonical, composeProject, seedKey }) {
  const assigned = services.map((svc) => ({
    name: svc.name,
    envVar: svc.envVar,
    slot: svc.slot,
    canonicalPort: svc.canonicalPort,
    port: canonical ? svc.canonicalPort : blockStart + svc.slot,
  }));
  const env = {};
  for (const svc of assigned) {
    if (svc.port !== null && svc.port !== undefined) env[svc.envVar] = String(svc.port);
  }
  if (composeProject) env.COMPOSE_PROJECT_NAME = composeProjectName(seedKey);
  return { assigned, env };
}

function renderEnvFile(env, meta) {
  const lines = [
    "# Generated by super.using-git-worktrees/scripts/allocate-ports.cjs — DO NOT EDIT.",
    "# Regenerate with: node <skill>/scripts/allocate-ports.cjs --worktree .",
    `# worktree: ${meta.worktreePath}`,
    `# identity: ${meta.seedKey}`,
    meta.blockStart === null
      ? "# block:    canonical (main working tree)"
      : `# block:    ${meta.blockStart}-${meta.blockStart + meta.blockSize - 1}`,
    "",
  ];
  for (const [key, value] of Object.entries(env)) lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

/**
 * Keep the generated env file out of `git status`.
 *
 * A worktree that reports a dirty tree breaks the clean-baseline check the execution
 * skills rely on, and `check-integration.cjs` would read a machine-local artefact as
 * task output.
 *
 * The ignore goes in `<common-dir>/info/exclude`, NOT in `.gitignore`, for two reasons
 * that both matter:
 *   1. `.gitignore` is VERSIONED, so editing the main root's copy does nothing for a
 *      linked worktree, whose checkout carries whatever `.gitignore` its branch has. The
 *      file would keep showing up as untracked in exactly the worktrees that generate it.
 *   2. `info/exclude` lives under the common dir, so it is shared by every worktree of the
 *      repo, is never committed, and never turns a machine-local concern into a diff in
 *      the consumer's repository.
 */
function ensureIgnored(commonDir, worktreeRoot, warnings) {
  const entry = ".superpowers/ports.env";
  const excludeFile = path.join(commonDir, "info", "exclude");
  let current = "";
  try { current = fs.readFileSync(excludeFile, "utf8"); } catch { /* absent — created below */ }
  // Our own exclude entry is the common case on every re-allocation: answer it from the
  // file we already read, and only spawn `git check-ignore` for the first run.
  if (current.split("\n").some((l) => l.trim() === entry)) return;
  if (git(worktreeRoot, ["check-ignore", "-q", entry]).ok) return;
  try {
    fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
    const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
    fs.appendFileSync(excludeFile, `${prefix}${entry}\n`, "utf8");
    warnings.push(`Added "${entry}" to ${path.join("$GIT_COMMON_DIR", "info", "exclude")} so the generated env file never reaches a commit.`);
  } catch (err) {
    warnings.push(`Could not ignore "${entry}" (${err.message}); add it to .gitignore manually to keep worktrees clean.`);
  }
}

// ─── Modes ───────────────────────────────────────────────────────────────────

async function modeAllocate(opts, gitEnv, config) {
  const warnings = [...config.warnings];
  const worktreePath = gitEnv.worktreeRoot;
  const isMainWorktree = !gitEnv.isLinkedWorktree;
  const seedKey = gitEnv.branch || path.relative(gitEnv.mainRoot, worktreePath) || path.basename(worktreePath);

  // The main working tree keeps the canonical ports: the developer's normal workflow must
  // not change just because the repo gained a ports.yml, and canonical values stay the
  // documented default the config file itself declares.
  let blockStart = null;
  let reused = false;
  let probes = 0;
  const conflicts = [];

  if (!isMainWorktree) {
    const result = await withLock(gitEnv.commonDir, async () => {
      const ledger = readLedger(gitEnv.commonDir);
      reapLeases(ledger, knownWorktreePaths(worktreePath), gitEnv.mainRoot);
      const found = await findBlock({
        ledger,
        worktreePath,
        seedKey,
        range: config.range,
        blockSize: config.blockSize,
      });
      if (found.blockStart === null) return found;
      ledger.leases[path.resolve(worktreePath)] = {
        branch: gitEnv.branch,
        seedKey,
        blockStart: found.blockStart,
        blockSize: config.blockSize,
        services: Object.fromEntries(config.services.map((s) => [s.name, found.blockStart + s.slot])),
        updatedAt: new Date().toISOString(),
      };
      writeLedger(gitEnv.commonDir, ledger);
      return found;
    });
    blockStart = result.blockStart;
    reused = result.reused;
    probes = result.probes;
    if (blockStart === null) {
      conflicts.push(`No free block of ${config.blockSize} ports found in ${config.range.start}-${config.range.end}. Widen "range" in ${CONFIG_RELPATH}, or release stale leases with --list.`);
    }
  }

  const { assigned, env } = buildAssignment({
    services: config.services,
    blockStart,
    canonical: isMainWorktree,
    composeProject: config.composeProject,
    seedKey,
  });

  let envFile = null;
  let envWritten = false;
  if (opts.writeEnv && conflicts.length === 0 && config.services.length > 0) {
    envFile = path.join(worktreePath, ENV_RELPATH);
    try {
      fs.mkdirSync(path.dirname(envFile), { recursive: true });
      fs.writeFileSync(envFile, renderEnvFile(env, { worktreePath, seedKey, blockStart, blockSize: config.blockSize }), "utf8");
      envWritten = true;
      ensureIgnored(gitEnv.commonDir, worktreePath, warnings);
    } catch (err) {
      warnings.push(`Could not write ${envFile}: ${err.message}`);
    }
  }

  return {
    mode: "allocate",
    enabled: true,
    configured: config.services.length > 0,
    configPath: config.configPath,
    worktreePath,
    worktreeId: seedKey,
    isMainWorktree,
    block: blockStart === null ? null : { start: blockStart, size: config.blockSize },
    range: config.range,
    services: assigned,
    env,
    envFile,
    envWritten,
    reused,
    probes,
    conflicts,
    warnings,
  };
}

async function modeRelease(opts, gitEnv, config) {
  const worktreePath = gitEnv.worktreeRoot;
  const released = await withLock(gitEnv.commonDir, async () => {
    const ledger = readLedger(gitEnv.commonDir);
    const key = path.resolve(worktreePath);
    if (!ledger.leases[key]) return false;
    delete ledger.leases[key];
    writeLedger(gitEnv.commonDir, ledger);
    return true;
  });
  return {
    mode: "release",
    enabled: true,
    configured: config.services.length > 0,
    configPath: config.configPath,
    worktreePath,
    released,
    warnings: config.warnings,
  };
}

async function modeList(opts, gitEnv, config) {
  const result = await withLock(gitEnv.commonDir, async () => {
    const ledger = readLedger(gitEnv.commonDir);
    const { reaped } = reapLeases(ledger, knownWorktreePaths(gitEnv.worktreeRoot), gitEnv.mainRoot);
    if (reaped.length > 0) writeLedger(gitEnv.commonDir, ledger);
    return { ledger, reaped };
  });
  const leases = Object.entries(result.ledger.leases).map(([wtPath, lease]) => ({
    worktreePath: wtPath,
    branch: lease.branch || null,
    block: { start: lease.blockStart, size: lease.blockSize },
    services: lease.services || {},
    updatedAt: lease.updatedAt || null,
  }));
  return {
    mode: "list",
    enabled: true,
    configured: config.services.length > 0,
    configPath: config.configPath,
    ledgerPath: ledgerPath(gitEnv.commonDir),
    leases,
    reaped: result.reaped,
    warnings: config.warnings,
  };
}

/**
 * Verification lens, distinct from allocation: allocation ASSIGNS, this one AUDITS what
 * is on record. It answers the two questions a controller must not infer — do any
 * two live leases overlap, and has anything outside our bookkeeping taken a leased port.
 */
async function modeCheck(opts, gitEnv, config) {
  const ledger = readLedger(gitEnv.commonDir);
  reapLeases(ledger, knownWorktreePaths(gitEnv.worktreeRoot), gitEnv.mainRoot);
  const entries = Object.entries(ledger.leases);
  const conflicts = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [pathA, a] = entries[i];
      const [pathB, b] = entries[j];
      if (blocksOverlap(a.blockStart, a.blockSize, b.blockStart, b.blockSize)) {
        conflicts.push({
          kind: "lease_overlap",
          worktrees: [pathA, pathB],
          message: `Leases overlap: ${pathA} holds ${a.blockStart}-${a.blockStart + a.blockSize - 1} and ${pathB} holds ${b.blockStart}-${b.blockStart + b.blockSize - 1}.`,
        });
      }
    }
  }

  // The main working tree is not leased, so its canonical ports are only checked here.
  const canonicalPorts = new Set(config.services.map((s) => s.canonicalPort).filter(Boolean));
  const sortedCanonical = [...canonicalPorts].sort((a, b) => a - b);
  for (const [wtPath, lease] of entries) {
    for (const p of sortedCanonical) {
      if (p >= lease.blockStart && p < lease.blockStart + lease.blockSize) {
        conflicts.push({
          kind: "canonical_overlap",
          worktrees: [wtPath],
          message: `Lease for ${wtPath} covers ${p}, which is a canonical service port used by the main working tree. Move "range" in ${CONFIG_RELPATH} away from the canonical ports.`,
        });
      }
    }
  }

  return {
    mode: "check",
    enabled: true,
    configured: config.services.length > 0,
    configPath: config.configPath,
    ledgerPath: ledgerPath(gitEnv.commonDir),
    leaseCount: entries.length,
    disjoint: conflicts.length === 0,
    conflicts,
    warnings: config.warnings,
  };
}

// ─── Detection (adoption aid) ────────────────────────────────────────────────

const COMPOSE_FILES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

/**
 * Propose a `services:` map by reading what the repo already declares. Detection is an
 * ADOPTION AID, never an authority: it prints a proposal for a human to confirm and
 * never writes ports.yml itself. Inferring a runtime topology and acting on it silently
 * is exactly the class of guess the deterministic scripts exist to remove.
 */
function modeDetect(opts, gitEnv) {
  const root = gitEnv.mainRoot;
  const findings = [];
  const warnings = [];

  for (const name of COMPOSE_FILES) {
    let text;
    try { text = fs.readFileSync(path.join(root, name), "utf8"); } catch { continue; }
    findings.push(...scanCompose(text, name, warnings));
  }

  // Workspace apps first: their env files carry the app-specific bare `PORT=`, and
  // scanning them before the root ones means the app name wins the merge over the
  // generic "app" fallback a root .env would produce for the same port.
  for (const groupDir of ["apps", "packages"]) {
    const group = path.join(root, groupDir);
    let children;
    try { children = fs.readdirSync(group, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      for (const envName of [".env", ".env.local", ".env.example", ".env.local.example", ".env.test.example"]) {
        findings.push(...scanEnvFile(path.join(group, child.name, envName), `${groupDir}/${child.name}/${envName}`, child.name));
      }
    }
  }
  for (const envName of [".env", ".env.example", ".env.test", ".env.test.example", ".env.local"]) {
    findings.push(...scanEnvFile(path.join(root, envName), envName, null));
  }

  // Merge by port: the same service is usually declared in both compose and an env file.
  const byPort = new Map();
  for (const f of findings) {
    if (!byPort.has(f.port)) byPort.set(f.port, f);
  }
  const services = [...byPort.values()].sort((a, b) => a.port - b.port);

  const proposal = [
    "# .superpowers/ports.yml",
    "range: 20000-32767",
    "block_size: 16",
    "compose_project: true",
    "services:",
    ...services.map((s) => `  ${s.name}: ${s.port}`),
  ].join("\n");

  return {
    mode: "detect",
    enabled: true,
    configExists: fs.existsSync(path.join(root, CONFIG_RELPATH)),
    configPath: path.join(root, CONFIG_RELPATH),
    detected: services,
    proposal: services.length > 0 ? `${proposal}\n` : null,
    warnings,
  };
}

function scanCompose(text, sourceLabel, warnings) {
  const findings = [];
  const lines = text.split("\n");
  let currentService = null;
  let inServices = false;
  let servicesIndent = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/u, "").trimEnd();
    if (!line.trim()) continue;

    if (/^services:\s*$/u.test(line)) { inServices = true; continue; }
    if (/^[A-Za-z_]/u.test(line) && !/^services:/u.test(line)) { inServices = false; currentService = null; continue; }
    if (!inServices) continue;

    const svc = line.match(/^(\s+)([A-Za-z0-9._-]+):\s*$/u);
    if (svc) {
      const indent = svc[1].length;
      if (servicesIndent === null) servicesIndent = indent;
      if (indent === servicesIndent) { currentService = svc[2]; continue; }
    }
    if (!currentService) continue;

    if (/^\s*container_name:\s*\S/u.test(line)) {
      warnings.push(`${sourceLabel}: service "${currentService}" pins container_name, which overrides COMPOSE_PROJECT_NAME and makes two worktrees collide on the container name even when their ports differ. Remove it and let Compose derive the name from the project.`);
      continue;
    }

    // Published mappings: "HOST:CONTAINER", HOST:CONTAINER, or "HOST:CONTAINER/proto".
    const mapping = line.match(/^\s*-\s*["']?(\d+):(\d+)(?:\/\w+)?["']?\s*$/u);
    if (mapping) {
      findings.push({ name: serviceKey(currentService, findings), port: Number.parseInt(mapping[1], 10), source: sourceLabel });
    }
  }
  return findings;
}

function serviceKey(base, findings) {
  const normalized = base.replace(/[^A-Za-z0-9]+/gu, "_").toLowerCase();
  const taken = findings.filter((f) => f.name === normalized || f.name.startsWith(`${normalized}_`)).length;
  return taken === 0 ? normalized : `${normalized}_${taken + 1}`;
}

/**
 * Read `<PREFIX>_PORT=<n>` and bare `PORT=<n>` out of an env file.
 *
 * The bare form matters most and is easy to miss: 12-factor apps read `PORT`, so the
 * frontend and the backend of a monorepo BOTH declare `PORT=` in their own env file and
 * neither carries a prefix to name it. The owning app directory is the only name
 * available there, which is also the name a human recognises.
 */
function scanEnvFile(file, label, ownerHint) {
  const findings = [];
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return findings; }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z][A-Z0-9_]*_)?PORT\s*=\s*["']?(\d+)["']?\s*$/u);
    if (!m) continue;
    const port = Number.parseInt(m[2], 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) continue;
    const prefix = (m[1] || "").replace(/_$/u, "").toLowerCase();
    const name = prefix || ownerHint || "app";
    findings.push({ name, port, source: label });
  }
  return findings;
}

// ─── Human-readable summary (stderr; stdout stays pure JSON) ─────────────────

function summarize(result) {
  if (result.mode === "allocate") {
    if (!result.enabled) return "Port isolation is disabled (no .superpowers/ports.yml).";
    if (!result.configured) return "No services declared in .superpowers/ports.yml — nothing to allocate.";
    if (result.conflicts.length > 0) return result.conflicts.join(" ");
    const where = result.isMainWorktree ? "main working tree (canonical ports)" : `block ${result.block.start}-${result.block.start + result.block.size - 1}`;
    const list = result.services.map((s) => `${s.envVar}=${s.port}`).join(" ");
    return `${where}: ${list}`;
  }
  if (result.mode === "check") {
    return result.disjoint
      ? `${result.leaseCount} lease(s), all disjoint.`
      : `${result.conflicts.length} conflict(s): ${result.conflicts.map((c) => c.message).join(" ")}`;
  }
  if (result.mode === "list") return `${result.leases.length} live lease(s); reaped ${result.reaped.length}.`;
  if (result.mode === "release") return result.released ? "Lease released." : "No lease was held.";
  if (result.mode === "detect") {
    return result.detected.length === 0
      ? "No port-bearing services detected."
      : `Detected ${result.detected.length} service(s).`;
  }
  return "";
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  const gitEnv = resolveGitEnv(opts.worktree, opts.repoRoot);
  if (!gitEnv.ok) usage(`Not a git repository: ${opts.worktree}`);

  const config = readConfig(gitEnv.mainRoot);

  if (opts.mode === "detect") {
    emit(modeDetect(opts, gitEnv), opts);
    return;
  }

  if (!config.found) {
    emit({
      mode: opts.mode,
      enabled: false,
      configured: false,
      configPath: config.configPath,
      worktreePath: gitEnv.worktreeRoot,
      isMainWorktree: !gitEnv.isLinkedWorktree,
      services: [],
      env: {},
      conflicts: [],
      warnings: config.warnings,
      hint: `Port isolation is off. Run --detect to propose ${CONFIG_RELPATH}, or leave it off if nothing in this repo binds a port.`,
    }, opts);
    return;
  }

  const handlers = { allocate: modeAllocate, release: modeRelease, list: modeList, check: modeCheck };
  emit(await handlers[opts.mode](opts, gitEnv, config), opts);
}

function emit(result, opts) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!opts.jsonOnly) {
    const line = summarize(result);
    if (line) process.stderr.write(`${line}\n`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`allocate-ports.cjs: ${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

module.exports = {
  parsePortsYaml,
  parseRange,
  fnv1a32,
  blocksOverlap,
  composeProjectName,
  findBlock,
  isPortFree,
  isStaleLock,
  renderEnvFile,
  scanCompose,
  scanEnvFile,
  reapLeases,
  withLock,
};
