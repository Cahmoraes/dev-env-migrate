'use strict';
/*
 * harness-base-dir-resolution.test.cjs — a `*-tools.md` that hands the model a command
 * containing `<super.X-base-dir>` must also say how to turn it into a path.
 *
 * `cross-skill-base-dir.test.cjs` pins the same pairing on the SKILL.md side. This file
 * covers the other place the placeholder is handed over: the per-harness reference, which
 * is where a controller lands when it asks "how do I do this here?".
 *
 * The gap was real. `codex-tools.md` and `gemini-tools.md` both printed
 *
 *     node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs ...
 *
 * with no rule for resolving the placeholder — a command the controller cannot run and
 * nothing telling it what to do about that. Copilot and opencode carried the rule; the two
 * that did not were simply never noticed, because nothing swept them.
 *
 * Why the STOP half is asserted too: the measured failure was not "could not find the
 * script". It was Copilot CLI 1.0.77 answering "not found" three times to `glob` probes
 * about files that were present (glob skips dotdirs, and skill dirs live under one), then
 * continuing in silence — session state never derived, gates never run, nothing in the
 * transcript recording a skip. The resolution rule removes the reason to search; the STOP
 * removes the silence when a gate script still will not run. Either half alone leaves the
 * incident reproducible.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/harness-base-dir-resolution.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REFERENCES = path.resolve(__dirname, '..', '..', 'references');
const PLACEHOLDER = /<super\.[a-z0-9-]+-base-dir>/;

/**
 * Anti-staleness floor: five harness references ship today. A walk that matched none would
 * pass vacuously, which is the failure mode this file exists to close.
 */
const MIN_TOOLS_FILES = 5;

function toolsFiles() {
  return fs.readdirSync(REFERENCES)
    .filter((f) => f.endsWith('-tools.md'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(REFERENCES, f), 'utf8') }));
}

const ALL = toolsFiles();
const USING_PLACEHOLDER = ALL.filter((f) => PLACEHOLDER.test(f.text));

test('the harness reference roster is not silently shrinking', () => {
  assert.ok(
    ALL.length >= MIN_TOOLS_FILES,
    `found ${ALL.length} *-tools.md files, expected >= ${MIN_TOOLS_FILES}`,
  );
});

test('at least one harness reference actually uses the placeholder', () => {
  // Guards the guard: if the placeholder were renamed, every assertion below would pass by
  // matching nothing.
  assert.ok(
    USING_PLACEHOLDER.length > 0,
    'no *-tools.md matched <super.X-base-dir> — the placeholder was probably renamed. '
    + 'Update PLACEHOLDER here before trusting a green.',
  );
});

test('every harness reference that uses the placeholder says how to resolve it', () => {
  const missing = USING_PLACEHOLDER
    .filter((f) => !/skill context header/i.test(f.text))
    .map((f) => f.name);
  assert.deepEqual(
    missing, [],
    'this reference hands the model a command with an unresolvable placeholder and no rule '
    + 'for filling it in. The harness injects only the base directory of the skill it just '
    + 'invoked, so the rule has to be stated: the header shows it, and a sibling is the '
    + 'parent of that directory + /super.X.',
  );
});

test('every harness reference that uses the placeholder names the sibling rule', () => {
  const missing = USING_PLACEHOLDER
    .filter((f) => !/parent of your header's base directory \+ `\/super\.X`/.test(f.text))
    .map((f) => f.name);
  assert.deepEqual(
    missing, [],
    'the sibling case is the one that breaks: a skill entered directly has its own base '
    + 'directory injected and no way to reach a neighbour. State the derivation literally.',
  );
});

test('every harness reference that uses the placeholder marks a dead gate script as a STOP', () => {
  const missing = USING_PLACEHOLDER
    .filter((f) => !/\*\*STOP\*\*/.test(f.text))
    .map((f) => f.name);
  assert.deepEqual(
    missing, [],
    'resolution alone is not enough. The measured incident was a controller that searched, '
    + 'got a false "not found", and proceeded WITHOUT SAYING SO — gates skipped, nothing in '
    + 'the transcript. The STOP is what turns a silent skip into a reported one.',
  );
});
