'use strict';
/*
 * sibling-script-mentions.test.cjs — runtime prose that hands the model a SIBLING skill's
 * script in runnable form must, somewhere in the same file, spell the owner's base-dir path.
 *
 * Measured 2026-09-05, three harnesses, real resume in a consumer repo (Claude Code 2.1.261,
 * Copilot CLI 1.0.83, opencode 1.18.18). The own-skill base-dir resolved 3/3 on the first
 * call — the `${CLAUDE_SKILL_DIR}` sentence in the Resolving block does its job. What failed
 * was references/session-start.md, `cat`ed by the bootstrap every session, which said only
 * "(`superpowers-status.cjs --pending`) ... (`parse-plan.cjs`)". `parse-plan.cjs` lives in
 * super.writing-plans; nothing in the sentence said so, and the sibling rule
 * ("parent + /super.X") only fires when the prose SHOWS a `<super.X-base-dir>`. So:
 *   - opencode ran `$B/scripts/parse-plan.cjs` → MODULE_NOT_FOUND, then derived the tiers by
 *     hand and never said the script was skipped;
 *   - Claude Code ran `find $B -iname '*status*' -o -iname '*parse-plan*'` — `$B` is a
 *     symlink in every consumer that installs skills the documented way, and `find` without
 *     `-L` does not enter one — got nothing, and skipped BOTH scripts for four calls of
 *     manual `docs/` exploration.
 *
 * base-dir-collapse.test.cjs pins the neighbouring class (two placeholders side by side in
 * one shell block get factored into one variable). This one is the upstream case: no
 * placeholder at all, so there is nothing to factor and nothing to resolve.
 *
 * Rule: a mention of a sibling's `<script>.cjs` counts as RUNNABLE when it is followed by a
 * flag or argument, written as `node <script>.cjs`, preceded on the line by an execution verb
 * (run / re-run / invoke / execute / call / via), or sits inside a fenced shell block. A file
 * with a runnable mention must contain `<super.<owner>-base-dir>/scripts/<script>` (or
 * `super.<owner>/scripts/<script>`) at least once. Descriptive mentions ("`parse-plan.cjs`
 * marks a task") are free: the model is not being told to run them.
 *
 * File-level rather than line-level on purpose: the SKILL.md files sit within ~200 bytes of
 * the 20,000-byte compaction cap, and a descriptive mention re-qualified on every line would
 * spend that headroom on prose the model never executes. The measured sentence itself is
 * pinned line-level below, because it is the one that failed.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/sibling-script-mentions.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_DIRS = ['references', 'agents', 'templates', 'template'];

const skills = fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.')
  && fs.existsSync(path.join(SKILLS, d, 'SKILL.md')));

/** script file name → skills whose scripts/ holds it */
const OWNER = {};
for (const s of skills) {
  const dir = path.join(SKILLS, s, 'scripts');
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.cjs')) (OWNER[f] ||= []).push(s);
}

function runtimeFiles() {
  const out = [];
  for (const s of skills) {
    out.push({ skill: s, rel: `${s}/SKILL.md`, abs: path.join(SKILLS, s, 'SKILL.md') });
    for (const sub of RUNTIME_DIRS) {
      const dir = path.join(SKILLS, s, sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.md')) out.push({ skill: s, rel: `${s}/${sub}/${f}`, abs: path.join(dir, f) });
      }
    }
  }
  return out;
}

const SCRIPT = /([a-z0-9-]+\.cjs)/g;
const VERB_BEFORE = /\b(run|re-run|rerun|invoke|execute|call|via)\b[^`\n]{0,40}`[^`\n]*$/i;
const FENCE = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;

/** Every runnable mention of a sibling script in one file: [{script, owners, line}] */
function runnableSiblingMentions(text, skill) {
  const found = [];
  const fenced = new Set();
  for (const m of text.matchAll(FENCE)) {
    for (const s of m[1].matchAll(SCRIPT)) fenced.add(s[1]);
  }
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(SCRIPT)) {
      const script = m[1];
      const owners = OWNER[script];
      if (!owners || owners.includes(skill)) continue;
      const before = line.slice(0, m.index);
      const after = line.slice(m.index + script.length);
      const runnable = fenced.has(script)
        || /^`?\s+(--|<)/.test(after)
        || /\bnode\s+(\S*\/)?$/.test(before)
        || VERB_BEFORE.test(before);
      if (runnable) found.push({ script, owners, line: i + 1 });
    }
  });
  return found;
}

function fileSpellsOwnerPath(text, script, owners) {
  return owners.some((o) => text.includes(`<${o}-base-dir>/scripts/${script}`)
    || text.includes(`${o}/scripts/${script}`));
}

test('the sweep still finds runnable sibling-script mentions to govern', () => {
  let n = 0;
  for (const f of runtimeFiles()) n += runnableSiblingMentions(fs.readFileSync(f.abs, 'utf8'), f.skill).length;
  // Anti-staleness floor: 19 at the time of writing. A sweep whose heuristics stopped
  // matching would report zero violations over zero mentions and pass forever.
  assert.ok(n >= 12, `expected at least 12 runnable sibling-script mentions across skills/, found ${n}`);
});

test('every file that tells the model to run a sibling script spells the owner path once', () => {
  const offenders = [];
  for (const f of runtimeFiles()) {
    const text = fs.readFileSync(f.abs, 'utf8');
    const seen = new Set();
    for (const m of runnableSiblingMentions(text, f.skill)) {
      if (seen.has(m.script)) continue;
      seen.add(m.script);
      if (!fileSpellsOwnerPath(text, m.script, m.owners)) {
        offenders.push(`${f.rel}:${m.line} → ${m.script} (lives in ${m.owners.join(', ')})`);
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    'these files hand the model a sibling skill\'s script with no owner path anywhere in the '
    + 'file. The Resolving rule ("a sibling\'s is its parent + /super.X") only fires when the '
    + 'prose shows a <super.X-base-dir>; a bare name reads as the current skill\'s own, and '
    + 'the measured result is `$B/scripts/<script>` → MODULE_NOT_FOUND (opencode) or a `find` '
    + 'that returns nothing on a symlinked skill dir (Claude Code), both followed by a silent '
    + 'skip. Write `node <super.<owner>-base-dir>/scripts/<script> ...` at least once:\n    '
    + offenders.join('\n    '),
  );
});

test('the bootstrap resume sentence qualifies both scripts on the line (the measured failure)', () => {
  const text = fs.readFileSync(path.join(SKILLS, 'super.using-superpowers', 'references', 'session-start.md'), 'utf8');
  const i = text.indexOf('locate pending work');
  assert.ok(i !== -1, 'session-start.md must still carry the "locate pending work" resume sentence');
  const sentence = text.slice(i, i + 600);
  assert.match(
    sentence,
    /<super\.using-superpowers-base-dir>\/scripts\/superpowers-status\.cjs --pending/,
    'superpowers-status.cjs must be qualified with its base-dir in the resume sentence itself',
  );
  assert.match(
    sentence,
    /<super\.writing-plans-base-dir>\/scripts\/parse-plan\.cjs --tasks-index/,
    'parse-plan.cjs is a sibling\'s script — the resume sentence has to say whose, on the line, '
    + 'because this file is `cat`ed by the bootstrap and read without the owner in context',
  );
});
