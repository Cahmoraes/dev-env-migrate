#!/usr/bin/env node
'use strict';
/*
 * memory-recall-budget.test.cjs — the memory-recall subagent is on the critical path of
 * the research fan-out, and its prompt is the only thing bounding it.
 *
 * Measured failure (session 83954df8, 2026-07-27): the template said "Run 2-3 targeted
 * searches". The dispatched `haiku` agent ran NINE `pmem search` calls and then went off
 * script into `find`/`grep`/`head` over the frontend — ground already owned by the
 * codebase-exploration subagent running in parallel beside it. It returned after 317
 * seconds; its parallel sibling returned after 70.
 *
 * Three things had to be true for that to happen, and this guard fixes all three:
 *
 *   1. NO COST SIGNAL. `pmem search` costs ~20s and the calls serialize (the embedding
 *      model loads per call), so nine searches is ~3 minutes of pure waiting. Nothing in
 *      the prompt said so, and "2-3" reads as a style preference next to an unstated cost.
 *   2. NO SCOPE FENCE. Nothing said the codebase belongs to another subagent, so thin
 *      memory results looked like a reason to go find the answer elsewhere.
 *   3. `pmem` LOOKED LIKE A TOOL. The template listed bare `pmem ...` lines with no word
 *      about the shell, so both the main thread and the subagent spent a tool-search
 *      hunting a "pmem tool" that does not exist. Each such search re-runs the whole
 *      prompt as another internal pass, and the harness SUMS those passes when deciding
 *      to auto-compact — see super.using-superpowers, "Tool discovery is charged against
 *      the context window".
 *
 * The asserted phrasings are load-bearing, not decorative: an empty result has to read as
 * a finished answer, or the model treats it as a reason to keep going.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/memory-recall-budget.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES = path.resolve(
  __dirname,
  '..',
  '..',
  'references',
  'research-subagent-templates.md',
);

function memoryRecallSection() {
  const body = fs.readFileSync(TEMPLATES, 'utf8');
  const start = body.indexOf('## Memory recall');
  const end = body.indexOf('## Codebase exploration');
  assert.ok(start !== -1, 'the Memory recall section is gone from the templates file');
  assert.ok(end > start, 'the Codebase exploration section no longer follows Memory recall');
  return body.slice(start, end);
}

// The prompt actually handed to the subagent — everything outside the fence is guidance
// for the dispatching controller and never reaches the agent.
function dispatchedPrompt(section) {
  const fenced = section.match(/```\n([\s\S]*?)\n```/);
  assert.ok(fenced, 'the Memory recall template no longer contains a fenced prompt block');
  return fenced[1];
}

test('the search budget is a hard cap, in the prompt the subagent actually receives', () => {
  const prompt = dispatchedPrompt(memoryRecallSection());

  assert.match(
    prompt,
    /AT MOST 3 pmem search calls/,
    'the cap must be stated as a maximum inside the fenced prompt. Guidance that lives ' +
      'only outside the fence never reaches the subagent.',
  );
  assert.doesNotMatch(
    prompt,
    /2-3 targeted searches/,
    'this is the exact soft phrasing that produced nine searches — a range reads as taste, not budget',
  );
  assert.match(
    prompt,
    /Three is the whole budget/,
    'the cap needs the follow-up that closes the "one more rewording" loop',
  );
  assert.match(
    prompt,
    /empty results are a finished answer/,
    'without this, thin results read as a reason to keep querying',
  );
});

test('the prompt fences the subagent to memory and names who owns the codebase', () => {
  const prompt = dispatchedPrompt(memoryRecallSection());

  assert.match(
    prompt,
    /Your scope is memory, and only memory/,
    'the scope fence is what stops the drift into find/grep over the repo',
  );
  assert.match(
    prompt,
    /codebase-exploration subagent is running in parallel/,
    'the fence has to say WHO owns the codebase — otherwise the gap looks unfilled',
  );
});

test('pmem is presented as a shell CLI, never as a tool to discover', () => {
  const section = memoryRecallSection();
  const prompt = dispatchedPrompt(section);

  // Both audiences need it: the controller reads the section, the subagent reads the fence.
  assert.match(
    section,
    /`pmem` is a shell CLI, not a tool in the toolset/,
    'the controller reads this section and went hunting for a pmem tool without it',
  );
  assert.match(
    prompt,
    /never search your toolset for a pmem tool/,
    'the subagent only ever sees the fenced prompt',
  );
});

test('the cost that makes the budget credible is stated', () => {
  const section = memoryRecallSection();

  assert.match(
    section,
    /~15-20 seconds/,
    'a budget without its cost is a style note; the number is what makes 3 vs 9 matter',
  );
  // Measured on the incident repo: 1 search ~17s; 3 sequential 51.1s; 3 concurrent 39.9s.
  // Batching buys ~22%, nowhere near the 3x a reader would assume — that gap is the
  // non-obvious half, and dropping it makes "issue them in one turn" sound like a fix.
  assert.match(
    section,
    /~40s of wall clock/,
    'the concurrent cost has to be stated, or batching reads as an escape from the budget',
  );
});
