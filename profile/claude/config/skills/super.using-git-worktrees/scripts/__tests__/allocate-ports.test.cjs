"use strict";

/**
 * Tests for allocate-ports.cjs.
 *
 * The expensive defects here are not parsing bugs — they are ALLOCATION bugs that only
 * appear under concurrency and only cause damage minutes later, when two servers finally
 * try to bind. So the suite is deliberately weighted towards behaviour that a unit test
 * on a pure function cannot reach:
 *   - real git repositories with real linked worktrees,
 *   - a real listening socket in the middle of a candidate block,
 *   - N allocator PROCESSES racing for the same handful of blocks.
 * The pure-function tests exist to localise a failure once one of those goes red.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, execFile } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "allocate-ports.cjs");
const mod = require(SCRIPT);

// ─── helpers ─────────────────────────────────────────────────────────────────

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A repo with one commit — enough for `git worktree add` to work. */
function makeRepo() {
  const root = mkTmp("sp-ports-repo-");
  git(root, ["init", "--quiet", "--initial-branch", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(root, "README.md"), "# fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "init"]);
  return root;
}

function writeConfig(root, body) {
  fs.mkdirSync(path.join(root, ".superpowers"), { recursive: true });
  fs.writeFileSync(path.join(root, ".superpowers", "ports.yml"), body, "utf8");
}

function addWorktree(root, name) {
  const wt = path.join(root, ".worktrees", name);
  git(root, ["worktree", "add", "--quiet", "-b", name, wt]);
  return wt;
}

function run(args, opts = {}) {
  const res = execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  return JSON.parse(res);
}

function runAsync(args) {
  return new Promise((resolve, reject) => {
    execFile("node", [SCRIPT, ...args], { encoding: "utf8" }, (err, stdout) => {
      if (err) reject(err);
      else resolve(JSON.parse(stdout));
    });
  });
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ port, host: "0.0.0.0", exclusive: true }, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/**
 * Find a window of `size` consecutive free ports at or above `from`, aligned so the
 * window can be used as a whole `range:`. Hard-coding a range would make the suite fail
 * on a machine that happens to run something there — a flake that looks like a bug.
 */
async function freeWindow(size, from = 21000) {
  for (let start = from; start < from + 4000; start += size) {
    let ok = true;
    for (let p = start; p < start + size; p += 1) {
      if (!(await mod.isPortFree(p))) { ok = false; break; }
    }
    if (ok) return { start, end: start + size - 1 };
  }
  throw new Error("no free port window available for the test");
}

// ─── configuration parsing ───────────────────────────────────────────────────

test("parsePortsYaml reads flat keys and the nested services map", () => {
  const { config, malformed } = mod.parsePortsYaml([
    "# a comment",
    "range: 20000-30000",
    "block_size: 8",
    "compose_project: false",
    "services:",
    "  backend: 3333",
    "  postgres: 5432",
  ].join("\n"));
  assert.equal(malformed, false);
  assert.equal(config.range, "20000-30000");
  assert.equal(config.block_size, "8");
  assert.equal(config.compose_project, false);
  assert.deepEqual(config.services, { backend: "3333", postgres: "5432" });
});

test("service DECLARATION ORDER is what assigns slots, not alphabetical order", () => {
  // Sorting would silently move every service's port the next time someone renames one.
  const root = makeRepo();
  writeConfig(root, "services:\n  zebra: 9000\n  alpha: 8000\n");
  const out = run(["--worktree", root, "--json-only"]);
  assert.deepEqual(out.services.map((s) => s.name), ["zebra", "alpha"]);
  assert.deepEqual(out.services.map((s) => s.slot), [0, 1]);
});

test("a service name is normalised into an UPPER_SNAKE env var", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  rabbitmq-management: 15672\n  api.gateway: 8080\n");
  const out = run(["--worktree", root, "--json-only"]);
  assert.deepEqual(out.services.map((s) => s.envVar), ["RABBITMQ_MANAGEMENT_PORT", "API_GATEWAY_PORT"]);
});

test("parseRange falls back to the default on garbage and out-of-bounds input", () => {
  const warnings = [];
  assert.deepEqual(mod.parseRange(undefined, warnings), { start: 20000, end: 32767 });
  assert.deepEqual(mod.parseRange("not-a-range", warnings), { start: 20000, end: 32767 });
  assert.deepEqual(mod.parseRange("500-600", warnings), { start: 20000, end: 32767 });
  assert.deepEqual(mod.parseRange("30000-20000", warnings), { start: 20000, end: 32767 });
  assert.ok(warnings.length >= 3, "each rejection explains itself");
  assert.deepEqual(mod.parseRange("21000-22000", []), { start: 21000, end: 22000 });
});

test("a range overlapping the machine's ephemeral ports is warned about, not silently accepted", () => {
  // Best-effort: only Linux exposes ip_local_port_range, so skip the assertion elsewhere.
  let ephemeral = null;
  try {
    const raw = fs.readFileSync("/proc/sys/net/ipv4/ip_local_port_range", "utf8").trim();
    const [start, end] = raw.split(/\s+/u).map(Number);
    if (Number.isFinite(start) && Number.isFinite(end)) ephemeral = { start, end };
  } catch { /* not Linux */ }
  if (!ephemeral) return;
  const warnings = [];
  mod.parseRange(`${ephemeral.start}-${Math.min(65535, ephemeral.start + 500)}`, warnings);
  assert.ok(
    warnings.some((w) => /ephemeral/iu.test(w)),
    "the kernel can hand an ephemeral port to an unrelated socket; that must be surfaced",
  );
});

test("block_size smaller than the service count is raised, never silently truncated", () => {
  const root = makeRepo();
  writeConfig(root, "block_size: 2\nservices:\n  a: 1\n  b: 2\n  c: 3\n  d: 4\n");
  const out = run(["--worktree", root, "--json-only"]);
  assert.equal(out.services.length, 4, "every declared service still gets a slot");
  assert.ok(out.warnings.some((w) => /block_size/u.test(w)));
});

// ─── pure helpers ────────────────────────────────────────────────────────────

test("fnv1a32 is deterministic and disperses similar worktree names", () => {
  assert.equal(mod.fnv1a32("wt/feature-task-01"), mod.fnv1a32("wt/feature-task-01"));
  const seeds = ["wt/f-task-01", "wt/f-task-02", "wt/f-task-03", "wt/f-task-04"];
  const mods = seeds.map((s) => mod.fnv1a32(s) % 64);
  assert.equal(new Set(mods).size, seeds.length, "sibling task branches must not land on one block");
});

test("blocksOverlap is inclusive at the boundaries and exclusive when adjacent", () => {
  assert.equal(mod.blocksOverlap(100, 16, 116, 16), false, "adjacent blocks do not overlap");
  assert.equal(mod.blocksOverlap(100, 16, 115, 16), true, "one shared port is an overlap");
  assert.equal(mod.blocksOverlap(100, 16, 84, 16), false);
  assert.equal(mod.blocksOverlap(100, 16, 85, 16), true);
});

test("composeProjectName always yields a name Docker Compose accepts", () => {
  for (const input of ["wt/Feature_Task-01", "---", "9lives", "feat/ÁREA", "a".repeat(80)]) {
    const name = mod.composeProjectName(input);
    assert.match(name, /^[a-z0-9][a-z0-9_-]*$/u, `"${input}" produced "${name}"`);
  }
});

test("isPortFree reports a port that is actually being listened on as taken", async () => {
  const { start } = await freeWindow(1, 25000);
  assert.equal(await mod.isPortFree(start), true);
  const server = await listen(start);
  try {
    assert.equal(await mod.isPortFree(start), false, "a bound port must never be handed out");
  } finally {
    await close(server);
  }
});

// ─── allocation behaviour ────────────────────────────────────────────────────

test("the main working tree keeps the canonical ports and takes no lease", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n  frontend: 3000\n");
  const out = run(["--worktree", root, "--json-only"]);
  assert.equal(out.isMainWorktree, true);
  assert.equal(out.block, null);
  assert.equal(out.env.BACKEND_PORT, "3333");
  assert.equal(out.env.FRONTEND_PORT, "3000");
  const leases = run(["--worktree", root, "--list", "--json-only"]);
  assert.equal(leases.leases.length, 0, "the developer's ordinary checkout is not part of the ledger");
});

test("a linked worktree gets a block, and two worktrees never share one", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n  postgres: 5432\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");

  const outA = run(["--worktree", a, "--json-only"]);
  const outB = run(["--worktree", b, "--json-only"]);

  assert.equal(outA.isMainWorktree, false);
  assert.ok(outA.block && outB.block);
  assert.equal(
    mod.blocksOverlap(outA.block.start, outA.block.size, outB.block.start, outB.block.size),
    false,
    "sibling worktrees must not overlap",
  );
  assert.notEqual(outA.env.BACKEND_PORT, outB.env.BACKEND_PORT);
  assert.notEqual(outA.env.POSTGRES_PORT, outB.env.POSTGRES_PORT);
  // Slot order is the contract: service i of a block is always blockStart + i.
  assert.equal(Number(outA.env.POSTGRES_PORT) - Number(outA.env.BACKEND_PORT), 1);
});

test("re-running for the same worktree reuses its block (a running container keeps its port)", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  const first = run(["--worktree", a, "--json-only"]);
  const second = run(["--worktree", a, "--json-only"]);
  assert.equal(second.block.start, first.block.start);
  assert.equal(second.reused, true, "reuse must be reported, not inferred from equal numbers");
});

test("a block whose ports are actually taken is probed past, not handed out", async () => {
  const root = makeRepo();
  const win = await freeWindow(8, 26000);
  writeConfig(root, `range: ${win.start}-${win.end}\nblock_size: 4\nservices:\n  backend: 3333\n`);
  const a = addWorktree(root, "task-01");

  // Occupy whichever block the hash would pick first, then confirm the allocator moves on.
  const dry = run(["--worktree", a, "--json-only", "--no-write-env"]);
  const squatted = dry.block.start;
  run(["--worktree", a, "--release", "--json-only"]);

  const server = await listen(squatted + 2); // mid-block: the whole block must be rejected
  try {
    const out = run(["--worktree", a, "--json-only"]);
    assert.notEqual(out.block.start, squatted, "a block containing a live listener is unusable");
    assert.ok(out.probes >= 2, "moving on requires at least one extra probe");
  } finally {
    await close(server);
  }
});

test("an exhausted range reports a conflict instead of returning an unusable block", () => {
  const root = makeRepo();
  writeConfig(root, "range: 21500-21503\nblock_size: 4\nservices:\n  a: 1\n  b: 2\n  c: 3\n  d: 4\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");
  run(["--worktree", a, "--json-only"]); // takes the only block
  const out = run(["--worktree", b, "--json-only"]);
  assert.equal(out.block, null);
  assert.equal(out.conflicts.length, 1);
  assert.match(out.conflicts[0], /range/iu, "the message must name the fix");
  assert.equal(out.envWritten, false, "no env file may claim ports that were never granted");
});

// ─── concurrency: the defect that only appears under a real race ─────────────

/**
 * Branch names whose hash lands on the SAME starting block.
 *
 * Without this, a race test proves nothing: with N worktrees and N blocks the hash
 * usually scatters them onto different blocks, every allocator succeeds on its first
 * probe, and the lock is never exercised — a mutation run confirmed that a race test on
 * arbitrary names survives deleting the lock entirely. Forcing the collision is what
 * turns "they happened not to clash" into "they all wanted the same block".
 */
function collidingBranchNames(count, blockCount) {
  const names = [];
  for (let i = 0; names.length < count && i < 100000; i += 1) {
    const candidate = `race-${i}`;
    if (mod.fnv1a32(candidate) % blockCount === 0) names.push(candidate);
  }
  assert.equal(names.length, count, "fixture: could not find enough colliding branch names");
  return names;
}

test("N allocator PROCESSES that all hash to the SAME block still get disjoint blocks", async () => {
  const parallelism = 4;
  const blockSize = 2;
  const win = await freeWindow(parallelism * blockSize, 27000);

  const root = makeRepo();
  writeConfig(root, `range: ${win.start}-${win.end}\nblock_size: ${blockSize}\nservices:\n  backend: 3333\n  postgres: 5432\n`);
  const worktrees = collidingBranchNames(parallelism, parallelism).map((name) => addWorktree(root, name));

  // All four want block 0, launched together on purpose: without the exclusive lock, each
  // allocator reads a ledger that does not yet contain the others' entries, each passes
  // the bind probe (nothing is listening YET) and each writes the same block — a race
  // whose symptom only appears minutes later, when the servers actually start.
  const results = await Promise.all(worktrees.map((wt) => runAsync(["--worktree", wt, "--json-only"])));

  const starts = results.map((r) => r.block && r.block.start);
  assert.ok(starts.every((s) => typeof s === "number"), `every worktree got a block: ${JSON.stringify(starts)}`);
  assert.equal(new Set(starts).size, parallelism, `blocks must be distinct, got ${JSON.stringify(starts)}`);

  const allPorts = results.flatMap((r) => Object.values(r.env).filter((v) => /^\d+$/u.test(v)));
  assert.equal(new Set(allPorts).size, allPorts.length, "no port may be assigned twice across the wave");

  const check = run(["--worktree", root, "--check", "--json-only"]);
  assert.equal(check.disjoint, true);
  assert.deepEqual(check.conflicts, []);
});

// ─── env file emission ───────────────────────────────────────────────────────

test("the env file lands in the worktree, is parseable, and is kept out of git status", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n  postgres: 5432\n");
  const a = addWorktree(root, "task-01");
  const out = run(["--worktree", a, "--json-only"]);

  assert.equal(out.envWritten, true);
  assert.equal(out.envFile, path.join(a, ".superpowers", "ports.env"));
  const body = fs.readFileSync(out.envFile, "utf8");
  for (const [key, value] of Object.entries(out.env)) {
    assert.match(body, new RegExp(`^${key}=${value}$`, "mu"), `${key} must be exported verbatim`);
  }
  assert.match(body, /DO NOT EDIT/u, "a generated file must say so");

  const status = git(a, ["status", "--porcelain"]);
  assert.equal(status.includes("ports.env"), false, "a dirty worktree breaks the clean-baseline gate");
});

test("the generated env file is ignored INSIDE the worktree, without touching .gitignore", () => {
  // The regression this pins: .gitignore is versioned, so appending to the main root's
  // copy leaves the linked worktree — the only place the file is actually generated —
  // still reporting it as untracked. The ignore must come from the shared common dir.
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  run(["--worktree", a, "--json-only"]);

  execFileSync("git", ["-C", a, "check-ignore", "-q", ".superpowers/ports.env"], { stdio: "ignore" });

  // --git-common-dir can answer relatively (".git"); resolve it against the repo root.
  const commonDir = path.resolve(root, git(root, ["rev-parse", "--git-common-dir"]));
  const excludeFile = path.join(commonDir, "info", "exclude");
  assert.match(fs.readFileSync(excludeFile, "utf8"), /\.superpowers\/ports\.env/u);
  assert.equal(
    fs.existsSync(path.join(root, ".gitignore")),
    false,
    "the consumer's versioned .gitignore must not gain a machine-local entry",
  );
});

test("COMPOSE_PROJECT_NAME is emitted by default and suppressed by compose_project: false", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  assert.ok(run(["--worktree", a, "--json-only"]).env.COMPOSE_PROJECT_NAME);

  writeConfig(root, "compose_project: false\nservices:\n  backend: 3333\n");
  const b = addWorktree(root, "task-02");
  assert.equal(run(["--worktree", b, "--json-only"]).env.COMPOSE_PROJECT_NAME, undefined);
});

test("two worktrees get different Compose project names", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");
  assert.notEqual(
    run(["--worktree", a, "--json-only"]).env.COMPOSE_PROJECT_NAME,
    run(["--worktree", b, "--json-only"]).env.COMPOSE_PROJECT_NAME,
  );
});

// ─── lifecycle: release, reaping, check ──────────────────────────────────────

test("--release frees the block for the next worktree", () => {
  const root = makeRepo();
  writeConfig(root, "range: 21600-21607\nblock_size: 8\nservices:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");
  const held = run(["--worktree", a, "--json-only"]).block.start;
  assert.equal(run(["--worktree", b, "--json-only"]).block, null, "precondition: the range holds one block");

  const released = run(["--worktree", a, "--release", "--json-only"]);
  assert.equal(released.released, true);
  assert.equal(run(["--worktree", b, "--json-only"]).block.start, held);
});

test("--list reaps the lease of a worktree git no longer knows about", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  run(["--worktree", a, "--json-only"]);
  assert.equal(run(["--worktree", root, "--list", "--json-only"]).leases.length, 1);

  git(root, ["worktree", "remove", "--force", a]);
  const after = run(["--worktree", root, "--list", "--json-only"]);
  assert.equal(after.leases.length, 0);
  assert.equal(after.reaped.length, 1, "reaping is reported so an operator can see it happened");
});

test("--check reports an overlap that was injected into the ledger behind the allocator's back", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");
  run(["--worktree", a, "--json-only"]);
  run(["--worktree", b, "--json-only"]);

  const ledgerFile = path.join(git(root, ["rev-parse", "--absolute-git-dir"]), "superpowers", "port-leases.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  const keys = Object.keys(ledger.leases);
  ledger.leases[keys[1]].blockStart = ledger.leases[keys[0]].blockStart; // force the collision
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));

  const check = run(["--worktree", root, "--check", "--json-only"]);
  assert.equal(check.disjoint, false);
  assert.equal(check.conflicts[0].kind, "lease_overlap");
});

test("--check flags a range that swallows a canonical port of the main working tree", () => {
  const root = makeRepo();
  // 21700-21707 is the block range AND 21701 is declared canonical: the main tree and a
  // worktree would fight over it.
  writeConfig(root, "range: 21700-21707\nblock_size: 8\nservices:\n  backend: 21701\n");
  const a = addWorktree(root, "task-01");
  run(["--worktree", a, "--json-only"]);
  const check = run(["--worktree", root, "--check", "--json-only"]);
  assert.equal(check.disjoint, false);
  assert.equal(check.conflicts[0].kind, "canonical_overlap");
});

test("a corrupt ledger is rebuilt instead of wedging every future allocation", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  run(["--worktree", a, "--json-only"]);
  const ledgerFile = path.join(git(root, ["rev-parse", "--absolute-git-dir"]), "superpowers", "port-leases.json");
  fs.writeFileSync(ledgerFile, "{ this is not json");
  const out = run(["--worktree", a, "--json-only"]);
  assert.ok(out.block, "allocation still succeeds");
});

test("a lock held by a LIVE process is not treated as stale", () => {
  // The symmetric half of stale-lock handling. If this returned true the lock would stop
  // being exclusive — and the failure would only show up as an intermittent double
  // allocation, never as an error.
  const dir = mkTmp("sp-ports-lock-");
  const lockFile = path.join(dir, "port-leases.lock");
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now(), host: os.hostname() }));
  assert.equal(mod.isStaleLock(lockFile), false);
});

test("a lock whose holder is gone IS stale, and so is one older than the timeout", () => {
  const dir = mkTmp("sp-ports-lock-");
  const dead = path.join(dir, "dead.lock");
  fs.writeFileSync(dead, JSON.stringify({ pid: 0x7fffffff, at: Date.now(), host: os.hostname() }));
  assert.equal(mod.isStaleLock(dead), true);

  const old = path.join(dir, "old.lock");
  fs.writeFileSync(old, JSON.stringify({ pid: process.pid, at: 0, host: os.hostname() }));
  const ancient = Date.now() / 1000 - 3600;
  fs.utimesSync(old, ancient, ancient);
  assert.equal(mod.isStaleLock(old), true, "an abandoned lock must not wedge the repo forever");
});

test("reaping is skipped entirely when git cannot answer, so a live lease is never lost", () => {
  // `knownPaths === null` means `git worktree list` failed. Reaping on that signal would
  // strip ports from worktrees that are very much alive.
  const ledger = { version: 1, leases: { "/gone": { blockStart: 100, blockSize: 4 } } };
  const { reaped } = mod.reapLeases(ledger, null, "/main");
  assert.deepEqual(reaped, []);
  assert.ok(ledger.leases["/gone"], "an unverifiable lease is kept, not guessed away");

  const known = new Set(["/alive"]);
  const ledger2 = {
    version: 1,
    leases: { "/gone": { blockStart: 100, blockSize: 4 }, "/alive": { blockStart: 200, blockSize: 4 } },
  };
  const res2 = mod.reapLeases(ledger2, known, "/main");
  assert.deepEqual(res2.reaped, ["/gone"]);
  assert.ok(ledger2.leases["/alive"]);
});

test("a stale lock left by a dead process does not block allocation forever", () => {
  const root = makeRepo();
  writeConfig(root, "services:\n  backend: 3333\n");
  const a = addWorktree(root, "task-01");
  const lockDir = path.join(git(root, ["rev-parse", "--absolute-git-dir"]), "superpowers");
  fs.mkdirSync(lockDir, { recursive: true });
  // pid 0x7FFFFFFF cannot exist; the holder is unambiguously gone.
  fs.writeFileSync(
    path.join(lockDir, "port-leases.lock"),
    JSON.stringify({ pid: 0x7fffffff, at: Date.now(), host: os.hostname() }),
  );
  const out = run(["--worktree", a, "--json-only"]);
  assert.ok(out.block, "a dead holder's lock must be reclaimed");
});

// ─── absent configuration ────────────────────────────────────────────────────

test("without ports.yml the feature is OFF and says so, rather than inventing ports", () => {
  const root = makeRepo();
  const out = run(["--worktree", root, "--json-only"]);
  assert.equal(out.enabled, false);
  assert.equal(out.configured, false);
  assert.deepEqual(out.env, {});
  assert.match(out.hint, /--detect/u, "the way to turn it on must be discoverable from the output");
});

test("ports.yml with no services parses as enabled but unconfigured", () => {
  const root = makeRepo();
  writeConfig(root, "range: 21000-21100\n");
  const out = run(["--worktree", root, "--json-only"]);
  assert.equal(out.enabled, true);
  assert.equal(out.configured, false);
});

// ─── detection ───────────────────────────────────────────────────────────────

test("compose published ports are detected and a pinned container_name is warned about", () => {
  const warnings = [];
  const findings = mod.scanCompose([
    "services:",
    "  postgresql:",
    "    container_name: postgresql-dev",
    "    image: postgres",
    "    ports:",
    "      - 5432:5432",
    "  rabbitmq:",
    "    ports:",
    '      - "5672:5672"',
    "      - 15672:15672",
  ].join("\n"), "compose.yaml", warnings);

  assert.deepEqual(findings.map((f) => [f.name, f.port]), [["postgresql", 5432], ["rabbitmq", 5672], ["rabbitmq_2", 15672]]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /container_name/u);
  assert.match(warnings[0], /COMPOSE_PROJECT_NAME/u, "the warning must explain why a pinned name defeats isolation");
});

test("a bare PORT= is attributed to its app directory, and a prefixed one to its prefix", () => {
  const dir = mkTmp("sp-ports-env-");
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, [
    "PORT=3333",
    "REDIS_PORT=6379",
    "# PORT=9999",     // commented out
    "EXPORT=1",        // ends in PORT-like letters but is not a *_PORT key
    "PORTAL=8080",     // starts with PORT but is not one
    "SMTP_PORT=abc",   // non-numeric value
  ].join("\n"));
  const findings = mod.scanEnvFile(file, "apps/backend/.env", "backend");
  assert.deepEqual(findings.map((f) => [f.name, f.port]), [["backend", 3333], ["redis", 6379]]);
});

test("--detect proposes a ports.yml but never writes one", () => {
  const root = makeRepo();
  fs.writeFileSync(path.join(root, "compose.yaml"), "services:\n  redis:\n    ports:\n      - 6379:6379\n");
  const out = run(["--worktree", root, "--detect", "--json-only"]);
  assert.equal(out.configExists, false);
  assert.match(out.proposal, /^ {2}redis: 6379$/mu);
  assert.equal(fs.existsSync(path.join(root, ".superpowers", "ports.yml")), false, "detection proposes; a human decides");
});

// ─── script contract ─────────────────────────────────────────────────────────

test("the verdict lives in the JSON: a conflict still exits 0", () => {
  const root = makeRepo();
  writeConfig(root, "range: 21800-21803\nblock_size: 4\nservices:\n  a: 1\n  b: 2\n  c: 3\n  d: 4\n");
  const a = addWorktree(root, "task-01");
  const b = addWorktree(root, "task-02");
  run(["--worktree", a, "--json-only"]);
  const res = execFileSync("node", [SCRIPT, "--worktree", b, "--json-only"], { encoding: "utf8" });
  const parsed = JSON.parse(res);
  assert.equal(parsed.conflicts.length, 1, "precondition: this run really is in conflict");
  // execFileSync would have thrown on a non-zero exit, so reaching here proves exit 0.
});

test("--help exits 0 and documents every mode", () => {
  const out = execFileSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  for (const flag of ["--release", "--list", "--check", "--detect", "--worktree", "--no-write-env"]) {
    assert.ok(out.includes(flag), `--help must document ${flag}`);
  }
});

test("an unknown argument is a usage error, not a silent no-op", () => {
  assert.throws(() => execFileSync("node", [SCRIPT, "--nope"], { encoding: "utf8", stdio: "pipe" }));
});

test("outside a git repository the script fails loudly instead of guessing a root", () => {
  const dir = mkTmp("sp-ports-nogit-");
  assert.throws(
    () => execFileSync("node", [SCRIPT, "--worktree", dir], { encoding: "utf8", stdio: "pipe" }),
    /./u,
  );
});
