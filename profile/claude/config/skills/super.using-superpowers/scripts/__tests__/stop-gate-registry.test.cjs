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
const FIN = 'super.finishing-a-development-branch';

const GIT_SAFETY = `${FIN}/scripts/__tests__/finishing-git-safety.test.cjs`;

const REGISTRY = [
  // --- controller never implements inline -------------------------------------------
  // The most-repeated invariant in the execution skills and, until now, the least
  // guarded. Losing it does not fail anything: the work still gets done, just without
  // the reviews, the per-task model selection and the verification gate.
  { skill: SDD, what: 'cardinal rule: no inline implementation',
    anchor: /opening a source or test file to edit it yourself is the STOP signal/, owner: HERE },

  // --- branch guard: deliberately NOT a STOP any more ------------------------------------
  // On the default branch the execution skills create `feat/<feature-name>` themselves and
  // announce it — a local branch is safe and reversible, so it is not a consent gate. The
  // check is still deterministic and still runs every session; branch-guard.test.cjs owns
  // that contract. Only its two exceptions (the branch already exists, or the repo pins
  // work to the default branch) ask, and neither is phrased as a STOP.

  // --- written tier is binding ---------------------------------------------------------
  // Drift here is silent by construction: a more expensive model produces good work, so
  // nothing looks wrong. Only the bill and the manifest disagree.
  { skill: SDD, what: 'pre-dispatch tier gate',
    anchor: /\*\*STOP and correct if it differs with no recorded escalation\*\*/, owner: HERE },

  // --- QA gate verdict -------------------------------------------------------------------
  // Two locations, deliberately. The prose STOP stays in the SKILL.md gate index so a
  // controller that has not yet opened the reference already knows a FAILED QA halts the
  // flow; the verdict table is the reference's, next to the rest of the QA procedure.
  { skill: SDD, what: 'QA FAILED halts the flow (prose, in the gate index)',
    anchor: /`FAILED` → the QA skill ran its one fix round; still failing → \*\*STOP\*\* and report/, owner: HERE },
  { skill: SDD, what: 'QA FAILED halts the flow (verdict table, in final-stage.md)',
    anchor: /\| `FAILED` \| The QA skill already ran its one fix round.*\*\*STOP\.\*\* Report the residual stories/, owner: HERE },

  // --- final stage: the index must not be mistaken for the procedure --------------------
  // The index lists the gates in a few lines. That is enough to look actionable and is not
  // enough to run: the fix-loop caps, the PRD discovery order and the consent wording all
  // live in the reference. Without this STOP the cheapest reading is "I have the list".
  { skill: SDD, what: 'the gate index is not a substitute for final-stage.md',
    anchor: /\*\*STOP — read `\.\/references\/final-stage\.md` before running any of them\.\*\*/, owner: HERE },

  // --- review range: a reviewer handed nothing, or the wrong line, approves it -------------
  // Upstream reproduced both: an implementer committed to another branch, the range was
  // empty, and the reviewer returned "clean". The verdict is the script's; the STOP is the
  // half that keeps the controller from dispatching over it. Registered in the loop line of
  // the SKILL.md and, spelled out, in the execution-loop reference.
  { skill: SDD, what: 'review range guard: the reviewer builder refuses a bad range, and the refusal is a STOP (loop line)',
    anchor: /The builder refuses a range it cannot hand over — HEAD not on BASE's line, or empty with auto-commit on — and that refusal is a \*\*STOP\*\* \(`\.\/references\/execution-loop\.md`, "Review range guard"\)/,
    owner: { test: `${SDD}/scripts/__tests__/build-task-dispatch.test.cjs`, proof: /reviewer refuses a range it cannot hand over/ } },
  { skill: SDD, what: 'review range guard: the builder refusal (per task and final) is a STOP, not retried around (reference)',
    anchor: /on either shape — that refusal is a \*\*STOP\*\*, never a flag to retry around/, owner: HERE },
  { skill: SDD, what: 'final review: the builder refuses a merge-base range HEAD is not on, or empty with auto-commit on',
    anchor: /auto-commit on, and that refusal is a \*\*STOP\*\* \(`\.\/execution-loop\.md`, "Review range guard"\)/,
    owner: { test: `${SDD}/scripts/__tests__/build-task-dispatch.test.cjs`, proof: /final without --base derives the merge-base/ } },
  { skill: SDD, what: 'finish call: a done-state gate that did not run is a STOP, never a pass',
    anchor: /Anything in `errors` is a \*\*STOP\*\* — the gate did not run/,
    owner: { test: `${SDD}/scripts/__tests__/sdd-finish.test.cjs`, proof: /a gate that cannot run is named in errors/ } },
  { skill: SDD, what: 'start call: a part that did not run is a STOP, never a pass',
    anchor: /A name in its `errors` is a gate that did not run: \*\*STOP\*\*/,
    owner: { test: `${SDD}/scripts/__tests__/sdd-start.test.cjs`, proof: /a part that cannot run is named in errors/ } },

  // --- single-implementer mode (--single / answer 3): opt-in, no per-task reviewer -------
  // The mode is offered only for a plan the parser marked eligible; a plan that changed since
  // the gate (or an answer given to a plan the option was never rendered for) re-opens the
  // gate instead of running a capable-tier task on the standard tier anyway.
  { skill: SDD, what: 'single-implementer: ineligible plan re-opens the gate, never downgrades a review',
    anchor: /`false` → \*\*STOP\.\*\* Say which reason in `singleImplementer\.reasons\[\]` blocks it/,
    owner: { test: 'super.writing-plans/scripts/__tests__/parse-plan-single-implementer.test.cjs', proof: /need the capable tier/ } },
  { skill: SDD, what: 'single-implementer: a task reported done without Status: DONE on disk is a claim',
    anchor: /the tracker is the record\. \*\*STOP\*\* and re-dispatch from that task/, owner: HERE },

  // --- finishing: the irreversible ones ----------------------------------------------------
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
  // state and the memory gate never ran, and nothing in the transcript said so.
  // Later in the same session it asserted a script was "not available in this environment"
  // with that script's absolute path printed in its own context header.
  //
  // The STOP is the half that stops the silence; the resolution rule beside it removes the
  // reason to go hunting in the first place. Both halves are one sentence, verbatim in all
  // both skills, so a reworded copy fails here rather than degrading quietly in one skill.
  { skill: SDD, what: 'a gate script that will not run is a STOP, not a skip',
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
const SCOPE = [SDD, FIN];

// Files a skill delegates to, whose STOPs are still that skill's responsibility.
//
// Scanning SKILL.md alone made this registry lose gates the moment prose moved into a
// reference — which is precisely how a STOP goes unowned without anyone noticing, the
// failure this file exists to catch. `references/final-stage.md` is the canonical final
// stage for both execution modes; it is hosted under SDD, so its STOPs are registered
// once, there. The parallel skill pointing at the same file needs no duplicate entry.
const DELEGATED = {
  [SDD]: [`${SDD}/references/final-stage.md`, `${SDD}/references/execution-loop.md`, `${SDD}/references/single-implementer-mode.md`],
  [FIN]: [
    `${FIN}/references/options-standard.md`,
    `${FIN}/references/options-on-base.md`,
    `${FIN}/references/options-detached.md`,
  ],
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
