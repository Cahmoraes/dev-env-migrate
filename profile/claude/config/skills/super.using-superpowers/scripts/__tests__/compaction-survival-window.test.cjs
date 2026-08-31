#!/usr/bin/env node
'use strict';
/*
 * compaction-survival-window.test.cjs — after a compaction the harness re-injects each
 * invoked SKILL.md TRUNCATED to its first 20.000 characters, appending
 * "[... skill content truncated for compaction; use Read on the skill path if you need
 * the full text]". Everything past that offset is silently gone for the rest of the
 * session, and nothing warns.
 *
 * Measured on session 2408cc99 (2026-07-27, Claude Code 2.1.220, seven auto-compactions):
 * the re-injected `invoked_skills` attachment carried three skills at exactly 20.000 chars
 * each. `super.using-superpowers` was losing its ENTIRE gate block — Session State & Gates,
 * The Rule, Red Flags — because the Opening Triage (10.9 KB, and relevant only at session
 * start) sat ahead of them. The rule that tells the model not to hunt for tools was itself
 * past the cut, so it could not fire on the resume where it was needed most.
 *
 * Hence the invariant this sweep enforces: **a section may fall outside the window only if
 * losing it on resume is harmless**, and that claim has to be written down. Gates, STOPs
 * and routing must survive; once-per-session material (onboarding, triage) may not.
 *
 * The registry doubles as the tracked debt list: a NEW section cannot fall out quietly,
 * and shrinking a skill forces the entry to be updated rather than rotting.
 *
 * 2026-08-01: the list went from seven entries to one. Six skills were refactored under
 * the cap outright, on the observation that content past the cut earns nothing by being
 * inline — it is charged twice per invocation (message + `invoked_skills` attachment) and
 * dropped on resume, so moving it to `references/` with an in-window pointer is strictly
 * better on both axes. The survivor, super.subagent-driven-development, is deliberate and
 * argued in its own entry: everything it loses is recoverable, and closing the last 12 KB
 * would put mid-execution content behind a Read.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/compaction-survival-window.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

/** The harness's per-skill re-injection cap, in characters. */
const CAP = 20000;

/**
 * What each oversized skill loses to the window, and why that is acceptable — or not.
 *
 * `outside`    — sections whose heading is already past the cap.
 * `straddling` — sections that start inside and are cut mid-body. Registered separately
 *                because an offset-of-heading check cannot see this loss at all.
 * `reason`     — the claim being made. A reason starting with DEBT is the opposite of an
 *                approval: it records that load-bearing content IS being lost, with the
 *                specific work needed to close it. Deleting an entry is how a fix lands.
 */
const OUTSIDE_WINDOW = {
  'super.subagent-driven-development': {
    reason:
      'DEBT, down from 47 KB -> 42 -> 39 -> 34.4 KB across four refactors. (1) The finish '
      + 'tail was a second copy of references/finish-tail.md living past the cap; SKILL.md '
      + 'now carries a five-gate index pointing there. (2) "### Execution Loop" went 10.535 '
      + '-> 7.657 chars into references/execution-loop.md. (3) The third refactor closed the '
      + 'target the previous entry named: "### Session State Re-Entry Guard" and "#### '
      + 'Caveman State Check" moved their MECHANICS to references/session-state-and-caveman.md '
      + 'while keeping every command inline (moving a command would trade tokens for a round '
      + 'trip, which costs more), and the reverse tier guard — an entry-only decision, settled '
      + 'once execution starts — moved to references/entry-routing.md. (4) Prose compaction of '
      + 'the header, Branch Guard, Memory Gate and the parallelism check paid for the recovery '
      + 'pointer being restored inside the window. (5) Review cost control and Red Flags moved '
      + 'their PROSE to references/review-cost-control.md and references/red-flag-procedures.md, '
      + 'keeping the prohibitions list and the reviewShape table inline (a prohibition you have '
      + 'to open a file to read is a prohibition you skip). Net: 39.036 -> 33.048 chars, and '
      + '**the whole Execution Loop sits inside the window** (12.437 -> 19.976), so a resumed '
      + 'session keeps the spec and code-quality review steps, the full-suite checkpoint, and '
      + 'the five-gate index with its STOP — all cut before.\n\n'
      + 'The sections still listed below are OUT, and that is now safe by construction rather '
      + 'than by hope: an A/B run proved it. Two fresh agents were each given only the first '
      + '20.000 chars and asked five normative questions. Both could not answer "how many '
      + 'reviewers does this task get" or "may I override reviewShape downward" — the agent '
      + 'named the cause itself: "unlike the finish tail and model selection, no recovery '
      + 'reference is offered for it". So the in-window recovery block now points at all four '
      + 'references, not two. Anything moved out of this file from here on MUST be added to '
      + 'that block, or the resumed run silently guesses.\n\n'
      + '(6) 33.048 -> 32.242. This one deliberately did NOT chase the cap. A sweep of every '
      + 'norm in the sections below, probed against the window and against references/, found '
      + '12.431 of 13.072 outside chars already recoverable; the only orphan was "## Trade-offs" '
      + '(rationale, not a rule), which moved into review-cost-control.md — the file whose cost '
      + 'argument it was restating. The recovery block now names ALL SEVEN references, so '
      + 'POINTER_OUTSIDE_OK no longer carries an entry for this skill. Driving the remaining '
      + '12 KB under the cap would mean putting the tier->model table, the prompt templates and '
      + 'the prohibitions behind a Read — mid-execution content, consulted every dispatch. That '
      + 'trades a measured, fully-recoverable debt for a behaviour regression, so it was not '
      + 'done. The ideal point for THIS skill is "everything recoverable", not "under 20.000".',
    outside: [
      '## Handling Implementer Status',
      '## Handling Implementation Bugs',
      '## Prompt Templates',
      '## Suggesting Commit Messages',
      '## Review cost control',
      '## Red Flags',
      '## Integration',
    ],
    straddling: ['## Model Selection'],
  },
};

/**
 * Blank out fenced code blocks, preserving length so heading offsets stay true. A `#`
 * comment inside a bash block is not a heading, and counting it as one puts junk in the
 * registry.
 */
function withoutFences(md) {
  return md.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

/**
 * Splits headings into fully outside the window and STRADDLING it. A section that starts
 * inside and ends outside is truncated mid-body — the loss is invisible to an
 * offset-of-heading check, which is exactly how a half-cut Red Flags table hid here.
 */
function classifyHeadings(md) {
  const scanned = withoutFences(md);
  const found = [];
  const re = /^#{1,2} .+$/gm;
  let m;
  while ((m = re.exec(scanned))) found.push({ off: m.index, text: md.slice(m.index, m.index + m[0].length).trim() });

  const outside = [];
  const straddling = [];
  found.forEach((h, i) => {
    const end = i + 1 < found.length ? found[i + 1].off : md.length;
    if (h.off >= CAP) outside.push(h.text);
    else if (end > CAP) straddling.push(h.text);
  });
  return { outside, straddling };
}

function skillFiles() {
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('super.'))
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(SKILLS, name, 'SKILL.md')))
    .sort();
}

test('no SKILL.md loses a section to the compaction window without a registered reason', () => {
  const skills = skillFiles();

  // Anti-staleness floor: broken discovery would sweep nothing and pass forever.
  assert.ok(skills.length >= 18, `swept only ${skills.length} skills — discovery is broken`);
  const over = skills.filter((s) => fs.readFileSync(path.join(SKILLS, s, 'SKILL.md'), 'utf8').length > CAP);
  assert.ok(over.length >= 1, 'no skill exceeds the cap — the sweep would be vacuous; check CAP');

  const problems = [];
  for (const skill of skills) {
    const md = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
    const { outside, straddling } = classifyHeadings(md);
    const entry = OUTSIDE_WINDOW[skill];

    if (md.length <= CAP) {
      if (entry) problems.push(`${skill}: registered but now fits in ${CAP} chars — delete the entry`);
      continue;
    }
    if (!entry) {
      problems.push(
        `${skill}: ${md.length} chars, so a compaction drops content and nothing says that is safe:\n`
        + [...outside.map((h) => `      OUT       ${h}`), ...straddling.map((h) => `      STRADDLE  ${h}`)].join('\n')
        + '\n      Fix by shrinking/reordering, or register the loss with a written reason.',
      );
      continue;
    }
    for (const [kind, actual, registered] of [
      ['fully outside', outside, entry.outside || []],
      ['straddling', straddling, entry.straddling || []],
    ]) {
      const surprises = actual.filter((h) => !registered.includes(h));
      const stale = registered.filter((h) => !actual.includes(h));
      if (surprises.length) problems.push(`${skill}: NEW sections ${kind}:\n` + surprises.map((h) => `      ${h}`).join('\n'));
      if (stale.length) problems.push(`${skill}: no longer ${kind} — remove from the registry:\n` + stale.map((h) => `      ${h}`).join('\n'));
    }
  }

  assert.deepEqual(problems, [], `compaction-window violations:\n  ${problems.join('\n  ')}`);
});

test('a skill that loses binding content to the window says so INSIDE the window', () => {
  // Registering a loss makes it visible to us. It does nothing for the model at runtime.
  //
  // super.subagent-driven-development is 48 KB against a 20 KB cap, and what falls off the
  // end is not filler: the finish tail (final review -> independent verification -> QA gate
  // -> finishing) and the binding tier->model policy. The trap is that the POINTERS to
  // those references sat in the lost region too — so after a compaction the model had
  // neither the content nor any sentence telling it the content existed. It resumes
  // confident and quietly skips the terminal gates.
  //
  // So the recovery pointer has to live in the surviving half. This is not a token
  // optimisation; the 12 KB inline copy can stay until the loop decomposition happens.
  // It is the cheap half of that refactor, and it is what makes the DEBT survivable.
  const md = fs.readFileSync(path.join(SKILLS, 'super.subagent-driven-development', 'SKILL.md'), 'utf8');
  const head = md.slice(0, CAP);

  assert.ok(md.length > CAP, 'anti-staleness: this test is only meaningful while the skill is over the cap');

  for (const [what, needle] of [
    ['the finish tail', './references/finish-tail.md'],
    ['the binding tier->model policy', './references/model-selection.md'],
    // Added after an A/B run measured the gap: two fresh agents given only the first
    // 20.000 chars could not answer "how many reviewers does this task get" or "may I
    // override reviewShape downward", and one named the cause exactly — "unlike the
    // finish tail and model selection, no recovery reference is offered for it". Both
    // sections had been moved to references, but their pointers moved WITH them, past
    // the cut. A pointer is only a pointer if it survives; re-running the same probe
    // with these two lines in the window took the score from 3/5 to 5/5.
    ['the review-shape policy (how many reviewers, and the no-downgrade rule)', './references/review-cost-control.md'],
    ['the prohibitions and their procedures', './references/red-flag-procedures.md'],
    // Same shape, one refactor later: the execution loop's mechanics (status writes, the
    // two dispatch failure modes, the review-loop caps) moved out, and the pointer sits in
    // the loop preamble — inside the window, where the resumed session reads it.
    ['the execution loop mechanics', './references/execution-loop.md'],
  ]) {
    assert.ok(
      head.includes(needle),
      `the surviving first ${CAP} chars must point at ${needle} so a resumed session can recover `
        + `${what}. Without it the model does not know the section is missing.`,
    );
  }

  // The pointers need a reason attached or they read as optional reading. The reason is
  // stated as a CONDITION the model can observe ("you may not be able to see this section")
  // plus what to do about it — never as our character budget. The cap is our SLO: it is
  // measured by `skillmd-compaction-cap.test.cjs`, it is per-harness, and a skill that
  // recites it is carrying a number that is false everywhere else and actionable nowhere.
  assert.match(
    head,
    /Parts of this file may be missing from your context by the time you need them/,
    'the surviving half must name the condition, so a missing section reads as expected rather than as an absent rule',
  );
  assert.match(
    head,
    /\*\*Recover, never reconstruct\*\*/,
    'naming the condition without the imperative leaves the model free to infer the missing rule',
  );
  assert.doesNotMatch(
    head,
    /20\.000 characters|20k window|compaction cap/i,
    'the character budget is ours, not the skill\'s — state the condition and the action instead',
  );
});

// Our re-attach budget is an SLO of this repository, not a fact the skills act on. It is
// per-harness (false on any runtime with another window), it is unfalsifiable from inside a
// session, and a model that reads "this file is laid out to fit 20.000 characters" gains
// nothing it can do. What a skill legitimately says is the CONDITION ("this section may be
// missing") and the ACTION ("read the reference, do not infer"). The budget itself is
// measured next door, in skillmd-compaction-cap.test.cjs.
//
// The sweep is by vocabulary rather than by one phrase because the first removal pass left a
// remainder: eight files said the same thing eight ways.
const SLO_VOCABULARY = [
  /20\.000 characters/i,
  /20,000 characters/i,
  /20k window/i,
  /20 ?KB cap/i,
  /compaction cap/i,
  /compaction window/i,
  /re-injects only the first/i,
  /so it survives compaction/i,
  /must survive a compaction/i,
  /inside the 20k/i,
];

/** Runtime prose only: what a session can actually load. evals/ and __tests__/ are ours. */
function runtimeProse() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === 'evals' || e.name === '__tests__' || e.name === 'node_modules') continue;
        walk(abs, r);
      } else if (e.name.endsWith('.md')) {
        out.push({ rel: r, text: fs.readFileSync(abs, 'utf8') });
      }
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return out;
}

test('no skill recites our re-attach budget back to itself', () => {
  const files = runtimeProse();
  assert.ok(files.length >= 100,
    `anti-staleness: expected to scan 100+ runtime markdown files, scanned ${files.length}`);

  const hits = [];
  for (const { rel, text } of files) {
    text.split('\n').forEach((line, i) => {
      const pattern = SLO_VOCABULARY.find((re) => re.test(line));
      if (pattern) hits.push(`${rel}:${i + 1} matches ${pattern} — ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(hits, [],
    'the character budget is a repository SLO. A skill states the condition and the recovery action; '
      + 'the number belongs in CLAUDE.md and in skillmd-compaction-cap.test.cjs.');
});

test('the entry skill keeps every gate, the routing rule and the red flags inside the window', () => {
  // This one is not a registry: super.using-superpowers is loaded in EVERY session and is
  // the skill a resumed session re-reads first. Its gates are not negotiable.
  const md = fs.readFileSync(path.join(SKILLS, 'super.using-superpowers', 'SKILL.md'), 'utf8');
  const head = md.slice(0, CAP);

  const MUST_SURVIVE = [
    '## Session State & Gates',
    '## The Rule',
    '## Red Flags',
    '## Instruction Priority',
    '## Platform Adaptation',
    '### Tool discovery is charged against the context window',
  ];
  for (const section of MUST_SURVIVE) {
    assert.ok(
      head.includes(section),
      `"${section}" sits past char ${CAP} — a resumed session would not see it. `
        + 'Move once-per-session material below it instead.',
    );
  }
});

test('the once-per-session block stays ordered: bootstrap rule, then summary, then triage', () => {
  // The reorder that put the gates inside the window has to respect two invariants that
  // predate it, both with their own guards in onboarding-question-tools.test.cjs. Asserted
  // again here because THIS file is what would move those sections next time.
  const md = fs.readFileSync(path.join(SKILLS, 'super.using-superpowers', 'SKILL.md'), 'utf8');
  const bootstrap = md.indexOf('**Silent bootstrap');
  const gates = md.indexOf('## Session State & Gates');
  const summary = md.indexOf('## Session Summary');
  const triage = md.indexOf('## Opening Triage');

  assert.ok(bootstrap >= 0 && gates >= 0 && summary >= 0 && triage >= 0, 'all four anchors must exist');
  assert.ok(
    bootstrap < gates,
    'the Silent-bootstrap rule must precede the gates section — the first preamble is emitted '
      + 'during the preference load, before the gates are ever read',
  );
  assert.ok(summary < triage, 'the Session Summary must precede the Opening Triage');
});

// ─────────────────────────────────────────────────────────────────────────────
// The general form of the trap above: a reference is only reachable if the
// SENTENCE POINTING AT IT survives the cut.
//
// Moving a section out of an oversized SKILL.md feels like a pure win — the file
// shrinks and the content still exists. But if the only pointer to the new file sat
// inside the very section that was moved, the pointer leaves with it, and a resumed
// session has neither the content nor any hint that it exists. It does not error; it
// guesses, confidently. That is strictly worse than leaving the prose in place, where
// at least a full (uncompacted) read would find it.
//
// Measured, not theorised: with review-cost-control.md pointed at only from the moved
// section, a fresh agent answered "not found — I had to guess" on the review-shape
// questions. With the pointer lifted into the surviving half, the same agent read the
// reference and answered correctly.
/**
 * Pointers allowed to live past the cut, and why. Same contract as OUTSIDE_WINDOW: an
 * entry is a written claim that losing this pointer on resume is harmless, not a mute.
 *
 * Every current entry rests on one argument — the pointer sits in a section that runs
 * ONCE, at the start of a phase, before anything can be compacted (Opening Triage, Entry
 * Phase, The Process), or it feeds a subagent template rather than the controller. A new
 * entry that cannot make that argument should not be added; the pointer should be lifted
 * into the recovery block instead.
 */
const POINTER_OUTSIDE_OK = {
  'super.writing-plans': {
    'required-task-step-pattern.md': 'pointed at from "# Entry Phase" — plan-authoring time, before the first task file exists',
    'research-subagent-prompt.md': 'same — the research fan-out runs once, at plan-authoring time',
  },
};

test('every reference of an oversized skill is pointed at from inside the window', () => {
  const problems = [];

  for (const skill of skillFiles()) {
    const skillDir = path.join(SKILLS, skill);
    const md = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    if (md.length <= CAP) continue; // a skill that fits is reachable in full

    const refDir = path.join(skillDir, 'references');
    if (!fs.existsSync(refDir)) continue;

    const head = md.slice(0, CAP);
    for (const ref of fs.readdirSync(refDir).filter((f) => f.endsWith('.md'))) {
      const mentionedAnywhere = md.includes(ref);
      const mentionedInWindow = head.includes(ref);

      // Only flag references the SKILL.md actually routes to. A reference reached
      // exclusively from another reference (or from an agent template) is that
      // file's business, not the compaction window's.
      const registered = (POINTER_OUTSIDE_OK[skill] || {})[ref];

      if (mentionedAnywhere && !mentionedInWindow && !registered) {
        problems.push(
          `${skill}: references/${ref} is pointed at ONLY from past char ${CAP}. `
          + 'After a compaction the pointer is gone too, so the content is unreachable and '
          + 'the model fills the gap by guessing. Lift the pointer into the surviving half '
          + '(the recovery block), or register it in POINTER_OUTSIDE_OK with the argument '
          + 'for why losing it on resume is harmless.',
        );
      }

      // Anti-rot: a registered exception that is now reachable in the window (or gone
      // entirely) is a stale claim. Deleting the entry is how the fix gets recorded.
      if (registered && (!mentionedAnywhere || mentionedInWindow)) {
        problems.push(
          `${skill}: references/${ref} is registered in POINTER_OUTSIDE_OK but is no longer `
          + 'pointed at only from outside the window — delete the entry.',
        );
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

// ─────────────────────────────────────────────────────────────────────────────
// An ORPHANED reference — one no file points at — is dead weight, and the test
// above cannot see it.
//
// That test asks "is the pointer inside the window?", which silently passes when there
// is no pointer at all: `mentionedAnywhere && !mentionedInWindow` is false when nothing
// mentions the file. So a reference that nobody routes to looked exactly like a
// compliant one. This is how an unreferenced file got committed the same day the
// window test landed.
//
// Orphans are worse than clutter in a skill tree: they read as part of the flow to
// anyone browsing `references/`, they age without anything exercising them, and a future
// edit can "restore" guidance from a file that was never authoritative.
//
// Scope note: a reference may legitimately be pointed at from ANOTHER skill via a
// relative path (`../super.brainstorming/references/x.md`) — super.generating-prd and
// super.reviewing-specs both reach into super.brainstorming that way. So the search has
// to span the whole skills tree, not just the owning skill. Scoping it per-skill was the
// first draft of this test and it produced exactly one false positive.
test('no reference file is orphaned — every one is pointed at from somewhere', () => {
  // One corpus: every markdown/script in every skill, minus each candidate's own text.
  const corpus = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|cjs|js|json)$/.test(entry.name)) corpus.push({ full, text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(SKILLS);

  const problems = [];
  for (const skill of skillFiles()) {
    const refDir = path.join(SKILLS, skill, 'references');
    if (!fs.existsSync(refDir)) continue;

    for (const ref of fs.readdirSync(refDir).filter((f) => f.endsWith('.md'))) {
      const refPath = path.join(refDir, ref);
      const pointedAt = corpus.some((f) => f.full !== refPath && f.text.includes(ref));
      if (!pointedAt) {
        problems.push(
          `${skill}/references/${ref} is orphaned — no SKILL.md, reference, agent template or `
          + 'script anywhere in the skills tree points at it. Wire it into the flow or delete it; '
          + 'an unreferenced file in references/ reads as guidance without ever being reachable.',
        );
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});
