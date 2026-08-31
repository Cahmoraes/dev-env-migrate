#!/usr/bin/env node
'use strict';
/*
 * stop-gate-registry.test.cjs — every STOP in the skills that can destroy work has a
 * named owner.
 *
 * A STOP is the strongest instruction these skills issue: abort, do not merge, do not
 * discard, ask the user. It is also pure prose, so it can be reworded into a suggestion,
 * moved into a branch that no longer runs, or deleted, with the whole suite green. The
 * coverage was already known to be uneven — some STOPs had dedicated tests, most had
 * nothing, and there was no way to tell which was which without reading all of them.
 *
 * Scope is deliberate: the three execution skills and finishing. These are where a
 * skipped STOP costs work rather than quality — a merge onto the wrong branch, a
 * discarded stash, a force-push over changes the merge did not capture. Informational
 * STOPs elsewhere are a later pass.
 *
 * The registry has one entry per STOP, and each entry names an owner:
 *
 *   owner.test   — another test already pins it. This file then verifies the DELEGATION
 *                  IS REAL: the named test must exist and must actually contain the
 *                  proof phrase. A registry that only records intentions is how a gate
 *                  ends up "covered" by a test that stopped covering it.
 *   owner: HERE  — nothing else pins it, so this file does: the phrase must survive
 *                  verbatim in the SKILL.md.
 *
 * And the sweep closes the set: every STOP in those four files must match exactly one
 * entry. Add a gate and the registry fails until you classify it; delete or reword one
 * and it fails until you say that was intended. Neither can happen quietly.
 *
 * Known boundary, worth stating because it bounds what a green run means: this indexes
 * gates that use the WORD "STOP". A gate phrased without it is invisible here — the
 * dirty-tree gate in finishing is exactly that, and it is pinned by its own test
 * (finishing-dirty-tree.test.cjs). So this guard makes the STOP-shaped gates auditable;
 * it does not claim to enumerate every abort in the pipeline.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/stop-gate-registry.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const HERE = Symbol('pinned by this file');

const SDD = 'super.subagent-driven-development';
const PSIT = 'super.parallel-subagent-in-tree';
const PSD = 'super.parallel-subagent-development';
const FIN = 'super.finishing-a-development-branch';

const BRANCH_GUARD = `${SDD}/scripts/__tests__/branch-guard.test.cjs`;
const AUTO_COMMIT = `${PSD}/scripts/__tests__/auto-commit-conflict-gate.test.cjs`;
const GIT_SAFETY = `${FIN}/scripts/__tests__/finishing-git-safety.test.cjs`;
const PORT_ISOLATION = 'super.using-git-worktrees/scripts/__tests__/port-isolation-contract.test.cjs';
const RW_HAZARD = `${PSD}/scripts/__tests__/readwrite-hazard-gate.test.cjs`;

const REGISTRY = [
  // --- controller never implements inline -------------------------------------------
  // The most-repeated invariant in the execution skills and, until now, the least
  // guarded. Losing it does not fail anything: the work still gets done, just without
  // the reviews, the per-task model selection and the verification gate.
  { skill: SDD, what: 'cardinal rule: no inline implementation',
    anchor: /thinking "this is small, I'll do it inline," STOP/, owner: HERE },
  { skill: PSIT, what: 'cardinal rule: no inline implementation',
    anchor: /If you catch yourself editing a file directly, STOP\./, owner: HERE },
  { skill: PSD, what: 'cardinal rule: no inline implementation',
    anchor: /If you catch yourself editing a file directly, STOP:/, owner: HERE },

  // --- branch guard ------------------------------------------------------------------
  { skill: SDD, what: 'default-branch guard before dispatching',
    anchor: /\*\*STOP and ask the user before dispatching\*\*/,
    owner: { test: BRANCH_GUARD, proof: /STOP and ask the user before dispatching/ } },
  { skill: PSIT, what: 'default-branch guard before the first wave',
    anchor: /\*\*STOP and ask the user\*\* before the first wave/,
    owner: { test: BRANCH_GUARD, proof: /EXECUTION_SKILLS/ } },
  { skill: PSD, what: 'default-branch guard before spawning a worktree',
    anchor: /\*\*STOP and ask the user\*\* before spawning any worktree/,
    owner: { test: BRANCH_GUARD, proof: /EXECUTION_SKILLS/ } },

  // --- auto_commit conflict ------------------------------------------------------------
  { skill: PSIT, what: 'auto_commit:false conflict gate (per wave)',
    anchor: /\*\*STOP before the first wave\*\*/,
    owner: { test: AUTO_COMMIT, proof: /never commit silently under/ } },
  { skill: PSD, what: 'auto_commit:false conflict gate (before dispatch)',
    anchor: /\*\*STOP before dispatching\*\*/,
    owner: { test: AUTO_COMMIT, proof: /never commit silently under/ } },

  // --- runtime (port) isolation across a wave's worktrees --------------------------------
  // Worktrees isolate files, not the loopback interface. Two implementers booting the
  // same stack collide on EADDRINUSE, and the failure lands on whichever task started
  // second — so it reads as that task's bug, not as a missing environment.
  // Owner moved from prose to mechanism: the audit is now run by validate-dispatch.cjs on
  // any worktree fan-out, so the STOP is a returned error code rather than a step the
  // controller has to remember. The textual anchor stays because the SKILL.md still has to
  // TELL the controller which verdict is fatal.
  { skill: PSD, what: 'overlapping port blocks block the wave dispatch',
    anchor: /`port_block_overlap` is a \*\*STOP\*\*/,
    owner: { test: PORT_ISOLATION, proof: /`port_block_overlap` is a \\\*\\\*STOP\\\*\\\*/ } },

  // --- stale reads across a wave's worktrees ---------------------------------------------
  // Isolation solves write∩write and nothing else. A task reading a file its sibling
  // creates in another worktree gets the pre-change version, merges clean, and no gate
  // downstream disagrees — so the pre-flight is the only place it can surface.
  { skill: PSD, what: 'read∩write hazard halts the wave before dispatch',
    anchor: /Non-empty `readWriteHazards` → \*\*STOP\*\*, serialize those tasks in dependency order/,
    owner: { test: RW_HAZARD, proof: /read_write_hazard/ } },

  // --- written tier is binding ---------------------------------------------------------
  // Drift here is silent by construction: a more expensive model produces good work, so
  // nothing looks wrong. Only the bill and the manifest disagree.
  { skill: SDD, what: 'pre-dispatch tier gate',
    anchor: /\*\*STOP and correct if it differs with no recorded escalation\*\*/, owner: HERE },
  { skill: PSD, what: 'pre-dispatch tier gate',
    anchor: /\*\*STOP and correct if the model differs and no escalation reason is recorded\*\*/, owner: HERE },

  // --- QA gate verdict -------------------------------------------------------------------
  // Two locations, deliberately. The prose STOP stays in the SKILL.md five-gate index so a
  // controller that has not yet opened the reference already knows a FAILED QA halts the
  // flow; the verdict table is the reference's, next to the rest of the QA procedure.
  { skill: SDD, what: 'QA FAILED halts the flow (prose, in the five-gate index)',
    anchor: /On `FAILED` → \*\*STOP\*\* and report the failing user stories/, owner: HERE },
  { skill: SDD, what: 'QA FAILED halts the flow (verdict table, in finish-tail.md)',
    anchor: /\| `FAILED` \| \*\*STOP\.\*\* Report the failing user stories/, owner: HERE },

  // --- finish tail: the index must not be mistaken for the procedure --------------------
  // The index lists five gates in a few lines. That is enough to look actionable and is not
  // enough to run: the fix-loop caps, the PRD discovery order and the consent wording all
  // live in the reference. Without this STOP the cheapest reading is "I have the list".
  { skill: SDD, what: 'the five-gate index is not a substitute for finish-tail.md',
    anchor: /\*\*STOP — read `\.\/references\/finish-tail\.md` before running any of them\.\*\*/, owner: HERE },

  // --- finishing: the irreversible ones ----------------------------------------------------
  { skill: FIN, what: 'invalid IV report blocks merge/PR/handoff',
    anchor: /→ STOP\. Do not merge\/PR\/handoff/, owner: HERE },
  { skill: FIN, what: 'unguarded checkout would pollute the wrong branch',
    anchor: /pollute it\. STOP\./,
    owner: { test: GIT_SAFETY, proof: /land on whatever branch MAIN_ROOT is still on/ } },
  { skill: FIN, what: 'failed checkout must not fall through to the merge',
    anchor: /# STOP and report\. Do NOT proceed to the merge/,
    owner: { test: GIT_SAFETY, proof: /the checkout to the base branch must be guarded/ } },
  { skill: FIN, what: 'merge conflict leaves the feature branch intact',
    anchor: /# STOP and report the conflict\./, owner: HERE },
  { skill: FIN, what: 'post-merge test failure leaves the feature branch intact',
    anchor: /# STOP and report the failure\./, owner: HERE },
  { skill: FIN, what: 'push failure is reported, not swallowed',
    anchor: /non-fast-forward\), STOP and report;/, owner: HERE },
  { skill: FIN, what: 'a stash holding work is never discarded',
    anchor: /STOP and report; do not discard it/, owner: HERE },
  { skill: FIN, what: 'uncommitted changes are surfaced before any --force',
    anchor: /\*\*STOP and surface them to the user\*\*/, owner: HERE },

  // --- a gate script that will not run --------------------------------------------------
  // Measured on Copilot CLI session 8bf714be: the controller could not resolve
  // `<super.using-superpowers-base-dir>`, fell back to `glob` (blind to dotdirs, so
  // `.claude/skills/**` answered "no files matched"), and continued in silence. Session
  // state, the memory gate and caveman never ran, and nothing in the transcript said so.
  // Later in the same session it asserted a script was "not available in this environment"
  // with that script's absolute path printed in its own context header.
  //
  // The STOP is the half that stops the silence; the resolution rule beside it removes the
  // reason to go hunting in the first place. Both halves are one sentence, verbatim in all
  // four skills, so a reworded copy fails here rather than degrading quietly in one skill.
  { skill: SDD, what: 'a gate script that will not run is a STOP, not a skip',
    anchor: /a gate script that will not run is a \*\*STOP\*\*, never a skipped gate/, owner: HERE },
  { skill: PSIT, what: 'a gate script that will not run is a STOP, not a skip',
    anchor: /a gate script that will not run is a \*\*STOP\*\*, never a skipped gate/, owner: HERE },
  { skill: PSD, what: 'a gate script that will not run is a STOP, not a skip',
    anchor: /a gate script that will not run is a \*\*STOP\*\*, never a skipped gate/, owner: HERE },
  { skill: FIN, what: 'a gate script that will not run is a STOP, not a skip',
    anchor: /a gate script that will not run is a \*\*STOP\*\*, never a skipped gate/, owner: HERE },

  // --- modifier, not a gate ----------------------------------------------------------------
  // Registered so the sweep stays exhaustive. It governs HOW every gate above is phrased
  // to the user; it does not itself stop anything.
  { skill: SDD, what: 'user-facing language applies to every STOP (modifier, not a gate)',
    anchor: /Surface each STOP, conflict, and option list/, owner: HERE },
];

const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');
const SCOPE = [SDD, PSIT, PSD, FIN];

// Files a skill delegates to, whose STOPs are still that skill's responsibility.
//
// Scanning SKILL.md alone made this registry lose gates the moment prose moved into a
// reference — which is precisely how a STOP goes unowned without anyone noticing, the
// failure this file exists to catch. `references/finish-tail.md` is the canonical finish
// tail for all three execution modes; it is hosted under SDD, so its STOPs are registered
// once, there. The two parallel skills pointing at the same file need no duplicate entry.
const DELEGATED = {
  [SDD]: [`${SDD}/references/finish-tail.md`],
};

function stopLines(skill) {
  const out = [];
  for (const rel of [`${skill}/SKILL.md`, ...(DELEGATED[skill] || [])]) {
    read(rel).split('\n').forEach((line, i) => {
      if (/\bSTOP\b/.test(line)) out.push({ line, n: i + 1, file: rel });
    });
  }
  return out;
}

test('the sweep still finds STOP gates in every skill in scope', () => {
  // Anti-staleness: a sweep matching nothing would report a fully-owned registry.
  for (const skill of SCOPE) {
    const n = stopLines(skill).length;
    assert.ok(n >= 2, `expected ${skill}/SKILL.md to still carry STOP gates, found ${n}`);
  }
});

test('every STOP in scope is registered exactly once', () => {
  const problems = [];
  for (const skill of SCOPE) {
    const entries = REGISTRY.filter((e) => e.skill === skill);
    for (const { line, n, file } of stopLines(skill)) {
      const hits = entries.filter((e) => e.anchor.test(line));
      if (hits.length === 0) {
        problems.push(`${file}:${n} — unregistered STOP: ${line.trim().slice(0, 90)}`);
      } else if (hits.length > 1) {
        problems.push(`${file}:${n} — matches ${hits.length} registry entries (${hits.map((h) => h.what).join(', ')}); make the anchors distinct`);
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    'A STOP gate is unclassified. Add it to REGISTRY with an owner, or remove it deliberately:\n  ' +
    problems.join('\n  '),
  );
});

test('every registry entry still matches a live STOP', () => {
  // The other direction: an entry whose anchor no longer matches means the gate was
  // reworded or deleted. Either is allowed; going unnoticed is not.
  const dead = REGISTRY
    .filter((e) => !stopLines(e.skill).some(({ line }) => e.anchor.test(line)))
    .map((e) => `${e.skill}: "${e.what}" — no STOP line matches ${e.anchor}`);
  assert.deepEqual(
    dead,
    [],
    'A registered STOP gate is gone from the SKILL.md:\n  ' + dead.join('\n  '),
  );
});

test('delegated gates are really covered by the test they name', () => {
  // The failure this prevents: an entry saying "covered by X" while X no longer asserts
  // anything about it. Recording the delegation without checking it just moves the blind
  // spot into the registry.
  const broken = [];
  for (const e of REGISTRY) {
    if (e.owner === HERE) continue;
    const abs = path.join(SKILLS, e.owner.test);
    if (!fs.existsSync(abs)) {
      broken.push(`${e.skill}: "${e.what}" delegates to ${e.owner.test}, which does not exist`);
      continue;
    }
    if (!e.owner.proof.test(fs.readFileSync(abs, 'utf8'))) {
      broken.push(`${e.skill}: "${e.what}" delegates to ${e.owner.test}, which no longer contains ${e.owner.proof}`);
    }
  }
  assert.deepEqual(broken, [], 'A delegation went stale:\n  ' + broken.join('\n  '));
});

// Gates nobody else pins: assert them here, one test each, so a failure names the gate.
for (const e of REGISTRY.filter((x) => x.owner === HERE)) {
  test(`${e.skill}: ${e.what} survives verbatim`, () => {
    // Search the same surface the sweep does — SKILL.md plus anything it delegates to —
    // so a gate stays pinned after it moves into a reference instead of silently going
    // unpinned at the moment it becomes hardest to notice.
    assert.match(
      stopLines(e.skill).map((s) => s.line).join('\n'),
      e.anchor,
      `This STOP is pinned only here. If the wording changed on purpose, update REGISTRY; ` +
      `if it was softened into a suggestion, that is the regression this guard exists for.`,
    );
  });
}
