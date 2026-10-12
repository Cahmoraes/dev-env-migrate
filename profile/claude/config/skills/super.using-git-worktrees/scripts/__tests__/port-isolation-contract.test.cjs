#!/usr/bin/env node
"use strict";

/*
 * port-isolation-contract.test.cjs — the PROSE half of runtime isolation.
 *
 * allocate-ports.cjs is only half the mechanism. The other half is prose, and prose is
 * the part that silently stops working: the allocator can be perfect while the controller
 * never calls it, or calls it and never tells the implementer, at which point every
 * subagent hard-codes the canonical port and the collision comes back with the script
 * still passing all 38 of its own tests.
 *
 * So this file pins the two places the instruction has to exist, and pins them where a
 * reader would look:
 *   1. the worktree skill runs the allocator, BEFORE the baseline;
 *   2. teardown releases the block before the worktree directory goes away.
 *
 * Run: node --test super.using-git-worktrees/scripts/__tests__/port-isolation-contract.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SKILLS = path.resolve(__dirname, "..", "..", "..");
const WT = "super.using-git-worktrees";

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
  const alloc = skill.indexOf("## Step 3: Runtime Isolation (Ports)");
  const baseline = skill.indexOf("## Step 4: Report");
  assert.ok(alloc > 0, "Step 3 must exist");
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

// ─── 4. teardown returns the block ───────────────────────────────────────────

test("the skill says to release the lease when the worktree is torn down", () => {
  // --release needs the path to still exist, so "release, then remove" is the only
  // runnable order. A lease nobody gives back survives until something reaps it, and
  // the next worktree gets a narrower range for no visible reason.
  assert.match(
    read(`${WT}/SKILL.md`),
    /Release the block when the worktree is torn down: `allocate-ports\.cjs --release --worktree <path>`/u,
    "the SKILL.md must name the release command, not just the idea",
  );
});

test("the reference states the ordering and what forgetting it costs", () => {
  const ref = read(`${WT}/references/port-isolation.md`);
  assert.match(ref, /run before removing the worktree/u, "the ordering is the contract");
  assert.match(
    ref,
    /Removing a worktree without `--release`/u,
    "the failure mode has to be named, or the ordering reads as a style preference",
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

test("the quick reference routes the port situations to Step 3", () => {
  const quick = read(`${WT}/references/quick-reference.md`);
  assert.match(quick, /--detect/u);
  assert.match(quick, /--release/u);
  assert.match(quick, /\(Step 3\)/u);
});
