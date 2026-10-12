"use strict";

/**
 * Review-stage parity with upstream v6.4.1 — the four things its per-task review had that
 * ours did not (measured side by side on 2026-09-20), now guarded:
 *   1. a ⚠️ "Cannot verify from diff" channel with mandatory controller resolution;
 *   2. a scoped re-review after every fix round, with per-finding ADDRESSED / NOT ADDRESSED;
 *   3. the plan's global constraints handed to every reviewer as its attention lens;
 *   4. per-task Minor findings ledgered and rolled up to the final review, never dropped.
 *
 * Run with: node --test super.subagent-driven-development/scripts/__tests__/upstream-review-parity.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SKILLS = path.resolve(__dirname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), "utf8");

const TASK_REVIEWER = read("super.subagent-driven-development/agents/task-reviewer.md");
const FINAL = read("super.requesting-code-review/agents/code-reviewer.md");
const LOOP = read("super.subagent-driven-development/references/execution-loop.md");
const TAIL = read("super.subagent-driven-development/references/final-stage.md");
const SDD = read("super.subagent-driven-development/SKILL.md");
const TEMPLATE = read("super.writing-plans/templates/tasks-template.md");
const CHECKLIST = read("super.writing-plans/references/self-review-checklist.md");

test("the task reviewer reports what it cannot verify from the diff instead of widening its search", () => {
  for (const [name, body] of [["task-reviewer", TASK_REVIEWER]]) {
    assert.match(body, /\*\*Cannot verify from diff:\*\* a requirement of THIS task that lives in unchanged code/, `${name}: the instruction`);
    // 12 per-task reviews (S8.0): 7 ⚠️ items, 4 of them "belongs to task N" — the plan already
    // assigns those, so they are noise in the channel the controller must resolve.
    assert.match(body, /A requirement another task of the plan owns is not a ⚠️ item/, `${name}: the exclusion`);
    assert.match(body, /- ⚠️ Cannot verify from diff:/, `${name}: the output line`);
  }
});

test("a ⚠️ item is settled now or ledgered for the final review — DONE never drops one", () => {
  // Two prose formulations asking the controller to WRITE its resolution produced 0/7 lines;
  // the deferred ledger it already keeps reached the final review 4/4. The channel rides on the
  // flow that works: a completion definition plus a data path, no narration requirement.
  const sec = LOOP.split('### ⚠️ "Cannot verify from diff" — resolve it or ledger it')[1].split("\n### ")[0];
  assert.match(sec, /settle it now — a confirmed gap is a finding and enters the fix loop/);
  assert.match(sec, /`Task N: unverified: <item>`/);
  assert.match(sec, /DONE closes a task with every ⚠️ item\s+resolved or ledgered; none is dropped/);
  assert.doesNotMatch(sec, /one line per ⚠️ item|headless runs/, "no narration scaffolding, no run history in runtime prose");
  const ledger = LOOP.split("### The deferred ledger")[1].split("\n### ")[0];
  assert.match(ledger, /`Task N: unverified: <item>`/);
  assert.match(ledger, /\{DEFERRED_MINORS\}/);
  assert.match(SDD, /A ⚠️ \*cannot verify from diff\* item is settled now or ledgered for the final review, never dropped/);
  assert.match(FINAL, /`Task N: unverified: …`/);
  assert.match(TAIL, /`Task N: unverified: …`/);
});

test("every fix round ends in a re-review scoped to the fix diff, with per-finding verdicts", () => {
  const sec = LOOP.split("### Re-review after a fix")[1].split("\n### ")[0];
  assert.match(sec, /Every fix round ends in a re-review, and it is \*\*scoped\*\*/);
  assert.match(sec, /## Findings under verification/);
  assert.match(sec, /ADDRESSED \| NOT ADDRESSED/);
  assert.match(sec, /the fix's own RED→GREEN test is\s+evidence, never the\s+re-review/);
  for (const [name, body] of [["task-reviewer", TASK_REVIEWER]]) {
    assert.match(body, /## Findings under verification/, `${name}: the input section`);
    assert.match(body, /ADDRESSED \| NOT ADDRESSED with `file:line`/, `${name}: the per-finding verdict`);
    assert.match(body, /"attempted" is not addressed/i, `${name}: attempted ≠ addressed`);
  }
  assert.match(SDD, /→ re-review, scoped to the fix diff with the findings under verification/);
  assert.match(SDD, /Loop until ✅; the task is not complete while any finding is open/);
});

test("the plan carries `## Restrições Globais`, verbatim from the spec, and every reviewer receives it", () => {
  assert.match(TEMPLATE, /^## Restrições Globais\s*$/mu);
  assert.ok(TEMPLATE.indexOf("## Restrições Globais") > TEMPLATE.indexOf("## Tarefas"), "the tracker (tasks) leads; the reviewer lens sits after it");
  assert.match(TEMPLATE, /copied VERBATIM from\s+the spec/);
  assert.match(CHECKLIST, /\*\*8\. Global constraints verbatim:\*\*/);
  for (const [name, body] of [["task-reviewer", TASK_REVIEWER]]) {
    assert.match(body, /## Global constraints\n\n[\s\S]{0,200}\{GLOBAL_CONSTRAINTS\}/, `${name}: the slot`);
    assert.match(body, /`\{GLOBAL_CONSTRAINTS\}` — the body of the plan index's `## Restrições Globais` section \(its bullets\), verbatim/, `${name}: the slot's contract`);
  }
  assert.match(FINAL, /\{GLOBAL_CONSTRAINTS\}/);
  assert.match(TAIL, /`## Restrições Globais` the same way in `\{GLOBAL_CONSTRAINTS\}`/);
});

test("per-task Minor findings are ledgered and handed to the final review — a roll-up nobody reads is a discard", () => {
  const sec = LOOP.split("### The deferred ledger")[1].split("\n### ")[0];
  assert.match(sec, /Minor findings never enter the loop/);
  assert.match(sec, /`Task N: minor \(deferred\): <one-liner>`/);
  assert.match(sec, /\{DEFERRED_MINORS\}/);
  assert.match(FINAL, /\{DEFERRED_MINORS\}/);
  assert.match(FINAL, /`\{DEFERRED_MINORS\}` — [^\n]*triages the minors/);
  assert.match(TAIL, /in `\{DEFERRED_MINORS\}`/);
  assert.match(SDD, /a Minor, and every `Declined to judge` line \(`Task N: declined: …`\), go to the same ledger, never the loop/);
});
