'use strict';
/*
 * agent-type-is-not-a-tool.test.cjs — an agent TYPE is an argument to a dispatch tool. Prose
 * that puts the type where a tool name goes gets called as a tool, and fails.
 *
 * Measured, Claude Code, 2026-08-11, real entry into super.brainstorming: the templates read
 * "dispatch via `task` (explore agent)". The controller called a tool named `Explore` —
 * twice, `Error: No such tool available: Explore` — then spent a tool-discovery pass to find
 * that the real call is `Agent` with `subagent_type: "Explore"`. Two dead calls plus a
 * discovery pass, and discovery is charged as a full context pass.
 *
 * Two causes, and this file pins the fix for each:
 *
 *   1. THE MAPPING WAS MISSING FOR ONE PLATFORM. Every `*-tools.md` opens with "Skills use
 *      Claude Code tool names. Use your platform equivalent" and a table — except
 *      claude-code-tools.md, which had none, on the assumption that the canonical vocabulary
 *      needs no translation. It does: the skills say `Task`/`task` and the tool is `Agent`.
 *      The one platform nobody wrote a mapping for is the one that broke.
 *
 *   2. THE PROSE CONFLATED THE TWO. `dispatch via <tool> (<type> agent)` puts a tool and a
 *      type in one phrase with no marker of which is which. A reader resolves the nearer
 *      noun. The fix is positional: name the type as a type, and say once, loudly, that it
 *      is an argument.
 *
 * Portability note: this guard does NOT require any particular tool name in skill prose. The
 * skills stay abstract ("dispatch a subagent"); the platform-specific names live in the
 * `*-tools.md` layer, which is where coupling belongs and is isolated per harness.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/agent-type-is-not-a-tool.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const REFS = path.join(SKILLS, 'super.using-superpowers', 'references');
const SKIPPED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules', 'evals']);

/** Anti-staleness floor: a walk that stops matching sweeps nothing and passes forever. */
const MIN_FILES_SWEPT = 110;

const platformRefs = () =>
  fs.readdirSync(REFS).filter((f) => f.endsWith('-tools.md')).sort();

function markdownFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(abs, relPath); continue; }
      if (path.extname(entry.name) === '.md') out.push({ abs, rel: relPath });
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return out;
}

test('every platform reference maps subagent dispatch to a native mechanism', () => {
  const refs = platformRefs();
  assert.ok(refs.length >= 5,
    `expected a *-tools.md per supported harness, found ${refs.length}: ${refs.join(', ')}`);

  const missing = refs.filter((f) => {
    const body = fs.readFileSync(path.join(REFS, f), 'utf8');
    // The mapping row names the abstract dispatch AND the native mechanism on one line.
    // The abstract side is the `Subagent (...):` block header the templates actually carry:
    // keying the row on a harness tool name (`Task`) was itself the coupling this file warns
    // about — Claude Code's tool is `Agent`, so the left column named a tool no harness had.
    return !body.split('\n').some((l) =>
      /^\|/.test(l) && /`Subagent \(|dispatch a subagent|dispatch subagent/i.test(l));
  });
  assert.deepEqual(missing, [],
    'these harnesses have no row telling a controller HOW to dispatch a subagent. The one '
    + 'platform without a mapping is the one that called an agent type as a tool and failed '
    + 'twice with "No such tool available".');
});

test('the Claude Code mapping names the dispatch tool and marks the type as a parameter', () => {
  const body = fs.readFileSync(path.join(REFS, 'claude-code-tools.md'), 'utf8');
  assert.match(body, /`Agent`/, 'the dispatch tool must be named');
  assert.match(body, /subagent_type/, 'the parameter carrying the agent type must be named');
  assert.match(body, /never a tool/i,
    'the type must be marked as a value — naming it alone is what got it called');
  // A hard-coded tool name can go stale; the recovery rule is what survives a rename.
  assert.match(body, /If the tool name differs in your build/i,
    'the mapping must survive a tool rename by describing the tool, not only naming it');
  assert.match(body, /No such tool available/,
    'quoting the real error is what lets a controller recognize this situation mid-failure');
});

test('no skill writes an agent type where a tool name goes', () => {
  const files = markdownFiles();
  assert.ok(files.length >= MIN_FILES_SWEPT,
    `the sweep only reached ${files.length} files (floor ${MIN_FILES_SWEPT}) — the walk is broken`);

  // The measured shape: a tool token, then a parenthetical whose head word is the agent
  // type. Both nouns, no marker of which is callable.
  const CONFLATING = /dispatch(?:ed)? (?:via|with|through) `[A-Za-z_]+`\s*\(\s*[a-z-]+ agent/i;
  const offenders = [];
  for (const file of files) {
    fs.readFileSync(file.abs, 'utf8').split('\n').forEach((line, i) => {
      if (CONFLATING.test(line)) offenders.push(`${file.rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(offenders, [],
    'these lines name a dispatch tool and an agent type in one phrase, so a reader resolves '
    + 'the nearer noun as the thing to call. Write the type as a type ("agent type `explore`") '
    + 'and leave the tool name to the platform references.');
});

test('runtime prose carries rules, not incident reports', () => {
  // Evidence belongs in this layer — a test header is dev-only and free. A dated incident in
  // a SKILL.md or reference is paid every session, tells the reader nothing they can act on,
  // and goes stale the moment the harness fixes the thing: "on 2026-08-11 the controller
  // called X and it failed twice" stops being true without stopping being written down.
  // The rule survives; the story does not. Keep quantities that CALIBRATE a decision
  // ("~485 chars per feature, so it degrades around 300") — drop narrative that RECOUNTS.
  const NARRATIVE = [
    [/\bMeasured (?:failure|on a real session)\b/i, 'an incident report'],
    [/\b(?:in|on|during) session [0-9a-f]{6,}\b/i, 'a session id'],
    [/\bmeasured[^.\n]{0,40}\b20\d\d-\d\d-\d\d\b/i, 'a dated measurement'],
  ];
  const offenders = [];
  for (const file of markdownFiles()) {
    fs.readFileSync(file.abs, 'utf8').split('\n').forEach((line, i) => {
      for (const [re, what] of NARRATIVE) {
        if (re.test(line)) offenders.push(`${file.rel}:${i + 1}: ${what} — ${line.trim().slice(0, 80)}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    'these lines record WHEN something was observed rather than WHAT the rule is. Move the '
    + 'evidence to the guard that pins the rule (test headers are dev-only and cost the user '
    + 'nothing) and leave the reference stating the rule in the present tense.');
});

test('the research templates say once, explicitly, that the type is not a tool', () => {
  const body = fs.readFileSync(
    path.join(SKILLS, 'super.brainstorming', 'references', 'research-subagent-templates.md'), 'utf8');
  assert.match(body, /`explore` is an agent TYPE, never a tool/,
    'the rule must be stated where the templates are read, not only in a platform reference');
  assert.match(body, /No such tool available/,
    'the observed error text anchors the rule to the failure it prevents');
});

test('the research prose defers to the mapping layer instead of listing harnesses', () => {
  // The first version of the fix above spelled out which parameter each harness uses. That
  // is the coupling the *-tools.md layer exists to absorb: a new harness would have meant
  // editing brainstorming's prose, and the enumeration silently rots as harnesses rename
  // things. The skill states the INVARIANT (a type is an argument) and points at the layer
  // that knows the names; only that layer enumerates.
  const HARNESSES = /\b(copilot|gemini|opencode|codex|claude[ -]code)\b/i;
  // The recall contract moved to agents/ and is the file most likely to grow a harness name:
  // it is the only research track with a declared dispatch block, which is exactly where a
  // "on platform X the parameter is called Y" note wants to land.
  const research = [
    'references/research-subagent-templates.md',
    'references/research-fan-out.md',
    'agents/feature-history-recall.md',
  ];
  const offenders = [];
  for (const name of research) {
    const abs = path.join(SKILLS, 'super.brainstorming', name);
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      if (HARNESSES.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, [],
    'these lines name specific harnesses inside a skill. Point at '
    + '`super.using-superpowers/references/*-tools.md` and let the per-platform layer carry '
    + 'the names — otherwise every new harness is a prose edit here.');

  // Deferring only works if the pointer is discoverable, and it must be a glob: naming the
  // files individually is the same enumeration wearing a path.
  const templates = fs.readFileSync(
    path.join(SKILLS, 'super.brainstorming', 'references', 'research-subagent-templates.md'), 'utf8');
  assert.match(templates, /references\/\*-tools\.md/,
    'the deferral needs a discoverable, harness-agnostic pointer to the mapping layer');
});
