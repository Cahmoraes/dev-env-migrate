#!/usr/bin/env node
'use strict';
/*
 * optional-tool-discovery.test.cjs — naming a harness tool in an imperative makes the
 * model go FIND that tool, and tool discovery is charged against the context window.
 *
 * The incident this closes: `super.using-superpowers` told the router "if it has a
 * checklist, create a TodoWrite item per step". Claude Code 2.1.x had removed
 * `TodoWrite`; the replacements (`TaskCreate`/`TaskUpdate`) ship *deferred*, and in that
 * session the tool-search index did not return them at all. The model, following the
 * instruction literally, spent four `ToolSearch` calls in a single turn hunting for a
 * tool that could not be found — and two more after the first compaction.
 *
 * Why that is expensive out of all proportion: a server-side tool search does not append
 * a small result, it re-runs the whole prompt as another internal pass, and the harness
 * SUMS `input_tokens + cache_creation + cache_read` across those passes when it decides
 * whether to auto-compact. Four searches ≈ five passes. The session's real context was
 * ~61k tokens; the harness read 310,485 and compacted. Twice. Both compactions were
 * spurious — nothing had actually filled the window.
 *
 * So the invariant is NOT "keep the tool name current". Chasing the current name loses
 * the same way at the next rename. The invariant is:
 *
 *   step tracking is optional, gated on a tool ALREADY in the toolset, and worth zero
 *   tool-discovery calls.
 *
 * Two halves, matching the registry idiom used by the other cross-skill sweeps:
 *
 *   1. DEAD_TOOL_NAMES sweeps every SKILL.md and reference for harness tool names that
 *      no longer exist. A dead name is what turns a convenience into a hunt.
 *   2. CONTRACTS pins the positive phrasing at the two places that actually issue the
 *      instruction, so "fixing" the sweep by renaming the tool does not pass.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/optional-tool-discovery.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

// Tool names the skills used to spell out that no longer resolve in a current harness.
// `reason` is what a future editor needs in order to decide, not a changelog entry.
const DEAD_TOOL_NAMES = [
  {
    name: 'TodoWrite',
    reason:
      'removed in Claude Code 2.1.x. Successors ship deferred and were not tool-searchable in the ' +
      'session that triggered two spurious auto-compactions. Say "session task list" instead — ' +
      'the capability is what the prose means, and it never goes stale.',
  },
  {
    name: 'TodoRead',
    reason: 'removed alongside TodoWrite; same failure mode.',
  },
  {
    name: 'Grep',
    reason:
      'NOT guaranteed to exist. In the configuration measured here `^(Glob|Grep)$` returns ' +
      'nothing, and a bootstrap turn that went hunting for it died with "Prompt is too long" ' +
      'after eight discovery calls. Name the capability and the shell (`rg`/`grep`/`find`), ' +
      'which is always present and costs no discovery.',
  },
  {
    name: 'Glob',
    reason: 'same as Grep — absent in the measured configuration; the shell covers it.',
  },
];

// Positive phrasing at the two sites that issue the instruction. `mustMatch` is what
// makes tracking conditional; `mustNotMatch` is the unconditional imperative that sends
// the model looking.
const CONTRACTS = [
  {
    file: 'super.using-superpowers/SKILL.md',
    what: 'the routing Flow line — paid every session, so it governs every entry',
    mustMatch: [
      /track one item per step \*\*with a task tool already in the toolset\*\*/,
      /costs zero discovery calls/,
      // The rules that keep the discovery budget down, each load-bearing:
      /At most ONE discovery call per turn — never batch them/,
      // Measured in a live simulation: the flow re-searched `Skill` in a later turn after
      // already using it. Naming the exception (post-compaction) is what makes the rule
      // safe to state absolutely.
      /never search for it again/,
      /after a compaction\*\*, when the toolset really is empty again/,
      /A CLI is not a tool/,                 // node/python3/grep are shell, not toolset
      // The null probe, and why this is phrased as a procedure rather than a prohibition.
      //
      // First attempt was a prohibition ("an empty result costs what a full one costs —
      // do not issue a probe that cannot match"). It was in the window, it was demonstrably
      // loaded, and an execution run then spent `a^`, `^$`, `(?!x)x`, `select:…` and a
      // pattern-less call anyway: 4 of that run's 5 compactions landed on one of those
      // turns. Re-reading the sequence showed why. The model was not failing to restrain
      // itself — after a compaction it was trying to ENUMERATE a toolset it no longer knew,
      // guessing at a syntax for "list everything" that does not exist. That is a motive,
      // and the two fixes that have worked in this codebase both removed a motive while the
      // one that failed asked for restraint.
      //
      // So the pinned content is: the fact that enumeration is impossible (removes the
      // reason to guess) and the procedure that replaces it (resolve, do not survey).
      // A future edit that keeps only the cost warning re-creates the version that failed.
      /There is no way to list the toolset/,
      /resolve rather than survey/,
      /one anchored alternation naming what you need next/,
    ],
    mustNotMatch: [
      /create a \w+ item per step/,
      // Batching concentrates the multiplier into one turn: measured, every turn with
      // 2+ discovery calls compacted (3/3), against 4/16 for single-call turns.
      /ONE batched discovery call/,
    ],
  },
  {
    file: 'super.subagent-driven-development/SKILL.md',
    what: 'the execution-loop Setup line',
    mustMatch: [/only if a task tool is already in the toolset/],
    mustNotMatch: [/skip completed ones, create \w+\./],
  },
];

function skillDirs() {
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('super.'))
    .map((e) => e.name)
    .sort();
}

// Every file a model can be told to read at runtime: the always-paid SKILL.md and the
// pay-on-read references. Scripts and tests are excluded — a tool name there is code or
// documentation about code, not an instruction the model executes.
function proseFiles() {
  const out = [];
  for (const dir of skillDirs()) {
    const skillMd = path.join(SKILLS, dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) out.push(skillMd);

    // Skill-root .md (plan-document-reviewer-prompt.md, root-cause-tracing.md) and agents/
    // templates carry the dispatch allowlists — the exact place a tool name becomes an
    // instruction to go find that tool.
    for (const sub of ['.', 'references', 'agents']) {
      const d = path.join(SKILLS, dir, sub);
      if (!fs.existsSync(d)) continue;
      for (const entry of fs.readdirSync(d)) {
        if (!entry.endsWith('.md') || entry === 'SKILL.md') continue;
        out.push(path.join(d, entry));
      }
    }
  }
  return out;
}

const rel = (p) => path.relative(SKILLS, p);

test('no skill prose names a harness tool that no longer exists', () => {
  const files = proseFiles();

  // Anti-staleness floor: a sweep whose file discovery breaks would report zero
  // violations over zero files and pass forever.
  assert.ok(
    files.length >= 40,
    `sweep found only ${files.length} prose files — discovery is broken, not the codebase clean`,
  );

  const violations = [];
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    const lines = body.split('\n');
    for (const dead of DEAD_TOOL_NAMES) {
      const pattern = new RegExp(`\\b${dead.name}\\b`);
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          violations.push(`${rel(file)}:${i + 1} names \`${dead.name}\` — ${dead.reason}`);
        }
      });
    }
  }

  assert.deepEqual(violations, [], `dead harness tool names in skill prose:\n  ${violations.join('\n  ')}`);
});

test('the SKILL.md files that ARE swept include the ones that carry the instruction', () => {
  const swept = new Set(proseFiles().map(rel));
  for (const contract of CONTRACTS) {
    assert.ok(
      swept.has(contract.file),
      `${contract.file} is not in the sweep — the dead-name guard would not cover it`,
    );
  }
});

for (const contract of CONTRACTS) {
  test(`${contract.file} keeps step tracking conditional (${contract.what})`, () => {
    const body = fs.readFileSync(path.join(SKILLS, contract.file), 'utf8');

    for (const pattern of contract.mustMatch) {
      assert.match(
        body,
        pattern,
        `${contract.file} lost the phrasing that gates step tracking on an already-loaded tool. ` +
          'Without it the model treats tracking as a step it must satisfy, and goes looking.',
      );
    }

    for (const pattern of contract.mustNotMatch) {
      assert.doesNotMatch(
        body,
        pattern,
        `${contract.file} issues an unconditional "create a <tool> item" instruction again. ` +
          'Renaming the tool does not fix this — the imperative is the defect.',
      );
    }
  });
}
