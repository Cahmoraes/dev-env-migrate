'use strict';
/**
 * ledger-and-rulings.test.cjs — the loop's deferred items and decisions live in a FILE, and
 * every decision the controller takes on the user's behalf reaches them.
 *
 * Reviewed against upstream 6.4.1 on 2026-09-21: our deferred ledger existed only as prose
 * ("ledger them as you go") with no path — it lived in the controller's context and died at the
 * first compaction, exactly the failure upstream's on-disk `progress.md` prevents. The same
 * review found "the plan itself is wrong → escalate to the human" where upstream rules, ledgers
 * and re-dispatches, and a final-review fix loop that dispatched one implementer PER finding
 * where upstream measured one fixer with the whole list as the cheaper shape.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/ledger-and-rulings.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SDD = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SDD, rel), 'utf8');
const SKILL = read('SKILL.md');
const LOOP = read('references/execution-loop.md');
const TAIL = read('references/final-stage.md');
const RED = read('references/red-flag-procedures.md');

const LEDGER_PATH = '.superpowers/sdd/<feature-name>/progress.md';

test('the ledger is a file in the plan\'s git-ignored workspace, append-only, named once and pointed to', () => {
  const sec = LOOP.split('## The ledger on disk')[1].split('\n## ')[0];
  assert.ok(sec, 'execution-loop.md has a "The ledger on disk" section');
  assert.match(sec, new RegExp(LEDGER_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sec, /append-only, one line per entry/);
  assert.match(sec, />> \.superpowers\/sdd\/<feature-name>\/progress\.md/, 'a fenced append command');
  assert.doesNotMatch(LOOP + TAIL, /plans\/progress\.md/, 'no prose still points beside the tasks index');
  assert.match(sec, /never kept only in your\s+context, which does not survive a compaction/);
  assert.match(sec, /On a resume, read the ledger right after the tracker/);
  assert.match(SKILL, /`\.\/references\/execution-loop\.md`, "The ledger on disk"/, 'the SKILL.md points at the section');
});

test('the four entry kinds are spelled, each with its consumer', () => {
  const sec = LOOP.split('## The ledger on disk')[1].split('\n## ')[0];
  assert.match(sec, /`Task N: minor \(deferred\): <one-liner>`, `Task N: unverified: <item>` and\s+`Task N: declined: <behavior> — <reviewer's reason>`/);
  assert.match(sec, /`Task N: Ruling: <what you decided> — <why> — <what it costs if wrong>`/);
  assert.match(sec, /`Task N: parked — <finding> — Ruling: <why the code stands>`/);
  assert.match(sec, /`Pre-flight <row>: Ruling: <what you decided> — <why> — <what it costs if wrong>`/);
  assert.match(sec, /every re-review\s+render \(`--role reviewer --findings-file`\) appends\s+`Task N: fix round <R> \(findings: <file>; commits <fixbase7>\.\.<head7>\)`/,
    'the fix round line is the script\'s: a real run (2026-09-22) ran two task fix rounds and ledgered neither');
  assert.doesNotMatch(SKILL, /append `Task N: fix round/, 'SKILL.md no longer asks the controller to write it');
  const deferred = LOOP.split('### The deferred ledger')[1].split('\n### ')[0];
  assert.match(deferred, /appended to the ledger\s+file \("The ledger on disk" above\), never held in your context alone/);
});

test('the final review reads {DEFERRED_MINORS} from the ledger file, parked findings included', () => {
  const gate1 = TAIL.split('### 1. Final code review')[1].split('\n### 2.')[0];
  assert.match(gate1, /read\s+from `\.superpowers\/sdd\/<feature-name>\/progress\.md`/);
  assert.match(gate1, /`Task N: parked — …`/);
  assert.match(gate1, /sees both sides of every parked\s+finding/);
});

test('rulings, not stalls: conflicts and plan defects are ruled and ledgered, and only four things stop the run', () => {
  assert.match(SKILL, /\*\*Continuous execution — rulings, not stalls:\*\*/);
  assert.match(SKILL, /Only four things stop you: an irreversible or destructive operation, a security-sensitive action, a side effect outside this worktree \(merge, push, publish\), or a plan so broken that every path forward is a guess/);
  assert.match(SKILL, /the plan itself is wrong → rule on the correction, ledger it, re-dispatch with the ruling/);
  assert.doesNotMatch(SKILL, /escalate to the human/, 'a plan defect is a ruling, never a stall');
  const tail = TAIL.split('## Continuous Execution')[1].split('\n## ')[0];
  assert.match(tail, /Conflicts,\s+ambiguities and plan defects are rulings written to the ledger, not questions/);
  assert.match(tail, /a plan so broken that every path forward is a guess/);
});

test('a finding that conflicts with the plan text is ruled before anyone acts, and the reviewer is never pre-judged', () => {
  const sec = LOOP.split('### A finding that conflicts with the plan text')[1].split('\n### ')[0];
  assert.match(sec, /write `Task N: Ruling: …` to the ledger, then either\s+dispatch the fix or let the code stand/);
  assert.match(sec, /Never dismiss a finding because the plan mandates it/);
  assert.match(sec, /Do not pre-judge\s+for the reviewer/);
  assert.match(RED, /\*\*Never pre-judge a finding for the reviewer:\*\*/);
});

test('the review cap ends in a ruling: fresh implementer one tier up, then adjudication, parked or load-bearing', () => {
  const sec = LOOP.split('### The review loop is capped')[1].split('\n## ')[0];
  assert.match(sec, /a \*\*fresh\*\* implementer\s+one tier up carrying the open findings/);
  assert.match(sec, /stop dispatching and\s+adjudicate each one yourself/);
  assert.match(sec, /`Task N: parked — … — Ruling: …`/);
  assert.match(sec, /rule on the smallest change\s+that unblocks the dependent work, ledger it, and carry it into the next task's dispatch/);
  assert.match(sec, /Adjudicate\s+only at the cap/);
  assert.doesNotMatch(sec, /escalate to the human/);
});

test('gate 4 hands the user every Ruling: line before the branch is finished', () => {
  const gate4 = TAIL.split('### 4. Finish the branch')[1].split('\n## ')[0];
  assert.match(gate4, /every ledger line containing `Ruling:` under a "Rulings I made"\s+heading/);
  assert.match(gate4, /you paste `summary` into your message \*\*translated line for line into the session's language\*\*:\s+no line otherwise reworded, merged, dropped or added/,
    'a real run (2026-09-23) handed over 5 ledger rulings as 3 paraphrased bullets');
  assert.match(gate4, /`super\.finishing-a-development-branch` prints that file in its last step/,
    'handed over from the JSON, 3/3 runs (2026-09-23) rewrote it from memory at the final message');
  const fin = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'super.finishing-a-development-branch', 'SKILL.md'), 'utf8');
  const step7 = fin.split('### Step 7: Hand Over the Run Summary')[1];
  assert.ok(step7, 'the finishing skill has the step that prints the summary');
  assert.match(step7, /```bash\ncat \.superpowers\/sdd\/<feature>-summary\.md && rm \.superpowers\/sdd\/<feature>-summary\.md\n```/);
  assert.match(step7, /Your final message opens with that output, \*\*translated line for line into the session's language\*\*/,
    'the ledger is English in a pt-BR session (2026-09-23): the user asked for the summary in the session language');
  assert.match(step7, /each decision keeps every ` — ` clause, its cost included/);
  assert.match(step7, /no line reworded, shortened, merged, dropped or added/);
  assert.match(gate4, /the heading is a meaning, not a fixed string/, 'the English string is never forced on a pt-BR session');
  assert.match(gate4, /in the order you made them, each with what it costs if\s+wrong/);
  assert.match(gate4, /The list is exhaustive: if\s+the ledger holds a ruling, the list holds it/);
  assert.ok(gate4.indexOf('Rulings I made') < gate4.indexOf('Then invoke `super.finishing-a-development-branch`'),
    'gate 4 says what the summary holds before handing the conversation to finishing, which prints it');
});

test('gate 4 deletes the ledger after the rulings are handed over, as upstream deletes its workspace', () => {
  const gate4 = TAIL.split('### 4. Finish the branch')[1].split('\n## ')[0];
  assert.match(gate4, /\*\*Then delete the ledger\.\*\*/);
  assert.match(gate4, /```bash\nrm -rf \.superpowers\/sdd\/<feature-name>\n```/,
    'the ledger lives in the workspace: one fenced command removes both');
  const rulings = gate4.indexOf('Rulings I made');
  const del = gate4.indexOf('Then delete the ledger');
  const finish = gate4.indexOf('Then invoke `super.finishing-a-development-branch`');
  assert.ok(rulings < del && del < finish, 'rulings → delete → finishing, in that order');
  const sec = LOOP.split('## The ledger on disk')[1].split('\n## ')[0];
  assert.match(sec, /It is scratch, not documentation: it lives until `\.\/final-stage\.md`, gate 4, hands the user its\s+rulings and deletes it/);
  const gate1 = TAIL.split('### 1. Final code review')[1].split('\n### 2.')[0];
  assert.match(gate1, /no file → nothing was deferred/, 'a tail re-entered after the deletion does not stall on the missing file');
});

test('the final-review fix loop dispatches ONE fixer with the whole list, never one per finding', () => {
  assert.match(SKILL, /findings are fixed \(one fresh implementer with the whole list, never one per finding\)/);
  const gate1 = TAIL.split('### 1. Final code review')[1].split('\n### 2.')[0];
  assert.match(gate1, /\*\*ONE\*\* fixer carrying the complete list, never one per\s+finding/);
  assert.doesNotMatch(gate1, /For each \*\*Critical \/ Important\*\* finding, dispatch/);
  assert.match(RED, /uses one fresh implementer with the whole list\s+instead/);
});

test('the pre-flight table: written by sdd-start, flagged rows ruled before any dispatch, pointed to from SKILL.md', () => {
  const sec = LOOP.split('### Pre-flight table')[1].split('\n## ')[0];
  assert.match(sec, /`sdd-start\.cjs` writes a `## Pre-flight` table to the ledger once/);
  assert.match(sec, /`ledger\.preflight\.flagged`/);
  assert.match(sec, /append `Pre-flight <row>: Ruling: …`/);
  assert.match(SKILL, /rule on each `preflight\.flagged` row before any dispatch \(`\.\/references\/execution-loop\.md`, "Pre-flight table"\)/);
});
