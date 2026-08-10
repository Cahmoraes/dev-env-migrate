#!/usr/bin/env node
"use strict";

/*
 * port-isolation-contract.test.cjs — the PROSE half of runtime isolation.
 *
 * allocate-ports.cjs is only half the mechanism. The other half is prose, and prose is
 * the part that silently stops working: the allocator can be perfect while the wave
 * never calls it, or calls it and never tells the implementer, at which point every
 * subagent hard-codes the canonical port and the collision comes back with the script
 * still passing all 38 of its own tests.
 *
 * So this file pins the four places the instruction has to exist, and pins them where a
 * reader would look:
 *   1. the worktree skill runs the allocator, BEFORE the baseline;
 *   2. the parallel wave audits the whole wave once every worktree exists;
 *   3. the dispatched implementer is told to load its ports and never hard-code one;
 *   4. teardown releases the block.
 *
 * It also owns the wave-level STOP registered in stop-gate-registry.test.cjs.
 *
 * Run: node --test super.using-git-worktrees/scripts/__tests__/port-isolation-contract.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SKILLS = path.resolve(__dirname, "..", "..", "..");
const WT = "super.using-git-worktrees";
const PSD = "super.parallel-subagent-development";

const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), "utf8");

// ─── the mechanism exists where the skill says it does ───────────────────────

test("the allocator script exists and the skill points at it by its real path", () => {
  const scriptPath = path.join(SKILLS, WT, "scripts", "allocate-ports.cjs");
  assert.ok(fs.existsSync(scriptPath), "allocate-ports.cjs must exist");
  assert.match(read(`${WT}/SKILL.md`), /scripts\/allocate-ports\.cjs/u);
});

test("the reference the SKILL.md defers the full model to actually exists", () => {
  const skill = read(`${WT}/SKILL.md`);
  const match = skill.match(/`references\/(port-isolation\.md)`/u);
  assert.ok(match, "SKILL.md must name the reference it defers to");
  assert.ok(fs.existsSync(path.join(SKILLS, WT, "references", match[1])));
});

// ─── 1. allocation happens, and happens before the baseline ──────────────────

test("port allocation is ordered BEFORE the clean-baseline step", () => {
  // Integration tests bind ports. Allocating after the baseline would let the baseline
  // itself collide — and a red baseline is exactly the signal the skill uses to refuse
  // to dispatch, so the failure would be attributed to the task's starting state.
  const skill = read(`${WT}/SKILL.md`);
  const alloc = skill.indexOf("## Step 3.5: Runtime Isolation (Ports)");
  const baseline = skill.indexOf("## Step 4: Verify Clean Baseline");
  assert.ok(alloc > 0, "Step 3.5 must exist");
  assert.ok(baseline > 0, "Step 4 must exist");
  assert.ok(alloc < baseline, "allocation must precede the baseline");
});

test("the skill reads the JSON verdict, not the exit code", () => {
  // The repo-wide script contract. A skill that branches on `$?` would treat a granted
  // block and a conflict identically, since both exit 0.
  assert.match(read(`${WT}/SKILL.md`), /Read the JSON, not the exit code/u);
});

test("a conflicts result forbids starting services, rather than degrading quietly", () => {
  const skill = read(`${WT}/SKILL.md`);
  assert.match(skill, /`conflicts` non-empty/u);
  assert.match(skill, /Do not start\s*\n?\s*services/u);
});

test("an absent ports.yml is a supported state, not an error to work around", () => {
  // Most repos bind nothing. If "disabled" read as a problem, the model would invent a
  // config file for a project that does not need one.
  assert.match(read(`${WT}/SKILL.md`), /`enabled: false`/u);
});

test("the model is forbidden from writing ports.yml from its own inference", () => {
  const skill = read(`${WT}/SKILL.md`);
  assert.match(skill, /Never write `ports\.yml` yourself from a guess/u);
  assert.match(skill, /detection proposes, a human decides/iu);
});

// ─── 2. the wave-level audit (owns the registered STOP) ──────────────────────

test("the parallel wave audits every worktree's block once they all exist", () => {
  const ref = read(`${PSD}/references/integrating-worktrees.md`);
  assert.match(ref, /allocate-ports\.cjs --check/u);
  assert.match(ref, /`disjoint: false` is a \*\*STOP\*\*/u);
});

test("the wave-level STOP survives verbatim in the parallel SKILL.md", () => {
  // Registered in stop-gate-registry.test.cjs with this file as its owner. The wording
  // is the gate: "overlapping blocks are a STOP" is what makes it non-optional.
  assert.match(
    read(`${PSD}/SKILL.md`),
    /overlapping blocks are a \*\*STOP\*\*/u,
    "the wave-level port audit must remain a STOP, not a suggestion",
  );
});

test("a repo without port isolation PASSES the wave audit instead of blocking it", () => {
  // Without this, every consumer that never configured ports would hit a gate it cannot
  // satisfy, and the pressure would be to skip the gate rather than configure the repo.
  assert.match(
    read(`${PSD}/references/integrating-worktrees.md`),
    /`enabled: false`[^\n]*that is a pass, not a skip/u,
  );
});

// ─── 3. the dispatched implementer is told ───────────────────────────────────

test("the implementer scoping block carries the ports into the subagent prompt", () => {
  // The measured failure mode this closes: a rule that lives only in the controller's
  // prose never reaches the subagent, which then hard-codes the canonical port.
  const block = read(`${PSD}/agents/implementer.md`);
  assert.match(block, /\.superpowers\/ports\.env/u, "the prompt must name the file");
  assert.match(block, /set -a; \. \.superpowers\/ports\.env; set \+a/u, "and how to load it");
  assert.match(block, /never a literal port number/u, "and the prohibition");
});

test("the implementer is told what to do when no ports were allocated", () => {
  // The open branch is where a subagent improvises. "No ports.env" must resolve to
  // "report it", never to "pick a number".
  assert.match(
    read(`${PSD}/agents/implementer.md`),
    /rather than picking a number yourself/u,
  );
});

test("the worktree scoping block lists ports alongside the path and branch", () => {
  const block = read(`${PSD}/agents/implementer.md`);
  const ports = block.indexOf("**Your ports:**");
  const rules = block.indexOf("Rules:");
  assert.ok(ports > 0, "ports must be one of the pinned scope fields");
  assert.ok(ports < rules, "it belongs with the other scope facts, before the rules");
});

// ─── 4. teardown returns the block ───────────────────────────────────────────

test("cleanup releases the lease before the worktree directory disappears", () => {
  // --release needs the path to still exist. Ordering it after removal would make the
  // instruction unrunnable, which is indistinguishable from not having it.
  const ref = read(`${PSD}/references/integrating-worktrees.md`);
  const cleanup = ref.slice(ref.indexOf("## Cleanup"));
  const release = cleanup.indexOf("--release");
  const remove = cleanup.indexOf("git worktree remove");
  assert.ok(release > 0, "cleanup must release the block");
  assert.ok(remove > 0, "precondition: cleanup still removes worktrees");
  assert.ok(release < remove, "release must come before removal");
});

test("cleanup also stops containers, which outlive a worktree and keep holding ports", () => {
  assert.match(
    read(`${PSD}/references/integrating-worktrees.md`),
    /docker compose down/u,
  );
});

// ─── the reference carries what the SKILL.md deliberately does not ───────────

test("the reference documents the config file, the env contract and the adjacent collisions", () => {
  // Progressive disclosure: SKILL.md pays every session, the reference pays on read. The
  // split is only worth anything if the deferred half really holds the detail.
  const ref = read(`${WT}/references/port-isolation.md`);
  for (const required of [
    /\.superpowers\/ports\.yml/u,        // where configuration lives
    /block_size/u,                        // the knobs
    /COMPOSE_PROJECT_NAME/u,              // container/network/volume isolation
    /container_name:/u,                   // the pin that defeats it
    /ephemeral/u,                         // why the default range is what it is
    /node_modules/u,                      // the non-port resource worktrees do not share
  ]) {
    assert.match(ref, required, `the reference must cover ${required}`);
  }
});

test("the quick reference routes the port situations to Step 3.5", () => {
  const quick = read(`${WT}/references/quick-reference.md`);
  assert.match(quick, /--detect/u);
  assert.match(quick, /--release/u);
  assert.match(quick, /Step 3\.5/u);
});
