'use strict';
/*
 * base-dir-collapse.test.cjs — a shell block that mixes base-dir placeholders from two
 * different skills must not let them be factored behind one shared variable.
 *
 * The measured defect (two real sessions, Claude Code, entry into super.brainstorming):
 * the fan-out reference ordered two commands in one block —
 *
 *     node    <super.brainstorming-base-dir>/scripts/feature-index.cjs --repo-root "$R"
 *     python3 <super.independent-verification-base-dir>/scripts/lessons.py list --status confirmed
 *
 * Both sessions collapsed the shared-looking prefix into a single `B=` and reused it for
 * lessons.py, which lives in a DIFFERENT skill. `python3 $B/scripts/lessons.py` pointed at
 * nothing; recovery cost 2-3 shell calls hunting the file (`find ... -iname "*lesson*"`)
 * plus a visible self-correction in the main thread ("It's em super.independent-verification,
 * não neste skill"). One session also copied the first command's `--repo-root` onto the
 * second, which does not accept it.
 *
 * Why the existing guard missed it: cross-skill-base-dir.test.cjs sweeps `SKILL.md` only,
 * and this call lives in a reference. It also governs a different failure (not knowing how
 * to resolve a sibling at all), while this one is about two placeholders SIDE BY SIDE
 * inviting the reader to factor them. Batching caused it: the same two commands in separate
 * blocks would never have shared a variable.
 *
 * The rule this pins: in any fenced shell block naming two or more distinct skills'
 * base-dirs, every command must name its own skill on the command line. A variable is fine
 * when it holds the SKILLS DIRECTORY (the shared parent) and each command appends its own
 * `super.<skill>/` — that spelling makes the collapse impossible instead of merely
 * discouraged.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/base-dir-collapse.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const SKIPPED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules', 'evals']);

/**
 * Anti-staleness floor: a walk that stops matching would sweep nothing and pass forever.
 * Set below the ~132 markdown files under `skills/` with room for normal churn — it exists
 * to catch a broken walk, not to pin the file count.
 */
const MIN_FILES_SWEPT = 110;

function sweptFiles() {
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

/** Every fenced shell block's body. */
function shellBlocks(md) {
  const out = [];
  const re = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

const PLACEHOLDER = /<(super\.[a-z-]+)-base-dir>/g;

/**
 * A block is safe when every line that runs a script names the skill it belongs to — either
 * inline in the placeholder, or as a `super.<skill>/` segment appended to a variable.
 * It is UNSAFE when a placeholder is captured into a variable and some other command then
 * uses that variable without naming its own skill.
 */
function collapseRisk(block) {
  const skills = new Set();
  let m;
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(block)) !== null) skills.add(m[1]);
  if (skills.size < 2) return null;

  // Lines that invoke an interpreter or a script path.
  const runLines = block.split('\n').filter((l) => /(^|\s)(node|python3?|bash|sh)\s|scripts\//.test(l));
  const offenders = runLines.filter((line) => {
    if (/<super\.[a-z-]+-base-dir>/.test(line)) return false; // names its skill inline
    if (/super\.[a-z-]+\//.test(line)) return false; // names its skill as a path segment
    return /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(line); // uses a bare variable: collapsible
  });
  return offenders.length ? offenders : null;
}

test('no shell block lets two skills\' base-dirs collapse into one shared variable', () => {
  const files = sweptFiles();
  assert.ok(
    files.length >= MIN_FILES_SWEPT,
    `the sweep only reached ${files.length} files (floor ${MIN_FILES_SWEPT}) — the walk is broken`,
  );

  const problems = [];
  for (const file of files) {
    for (const block of shellBlocks(fs.readFileSync(file.abs, 'utf8'))) {
      const offenders = collapseRisk(block);
      if (offenders) {
        problems.push(`${file.rel}: ${offenders.map((l) => l.trim()).join(' | ')}`);
      }
    }
  }
  assert.deepEqual(
    problems, [],
    'these commands sit in a block that names two skills\' base-dirs but run off a bare '
    + 'variable, so a reader can factor one prefix and point the other command at a path that '
    + 'does not exist. Give the variable the SKILLS DIRECTORY and append `super.<skill>/` to '
    + 'each command, or split the block.',
  );
});

test('the sweep really sees the pattern — a planted collapse is caught', () => {
  // Without this, a regex that stopped matching would report zero problems over zero blocks.
  const planted = [
    'B=<super.brainstorming-base-dir>',
    'node $B/scripts/feature-index.cjs',
    'python3 $B/scripts/lessons.py list --status confirmed',
    '# second skill named only here: <super.independent-verification-base-dir>',
  ].join('\n');
  const offenders = collapseRisk(planted);
  assert.ok(offenders, 'the exact shape of the measured defect must be reported');
  assert.equal(offenders.length, 2, `expected both bare-variable commands, got ${JSON.stringify(offenders)}`);
});

test('the safe spelling — one skills-dir variable, each command naming its skill — passes', () => {
  const safe = [
    'S="$(dirname "<super.brainstorming-base-dir>")"',
    'node    "$S/super.brainstorming/scripts/feature-index.cjs" --repo-root "$R"',
    'python3 "$S/super.independent-verification/scripts/lessons.py" list --status confirmed',
  ].join('\n');
  assert.equal(collapseRisk(safe), null, 'naming the skill on every command must be accepted');
});

test('the brainstorming lessons call reaches its sibling skill by name, alone in its block', () => {
  // The regression this file exists for, pinned at its own site — now with the cause
  // removed rather than spelled around. The index moved into the recall subagent
  // (feature-history-recall.test.cjs), which leaves lessons.py ALONE in the block. With one
  // command there is no shared-looking prefix to factor: the batching that caused the
  // collapse is gone, and the skill-segment spelling is the belt to that suspenders.
  const body = fs.readFileSync(
    path.join(SKILLS, 'super.brainstorming', 'references', 'research-fan-out.md'), 'utf8',
  );
  const block = shellBlocks(body).find((b) => b.includes('lessons.py'));
  assert.ok(block, 'the fan-out reference must still carry the lessons call');
  assert.equal(collapseRisk(block), null, 'the lessons call must not be collapsible');
  assert.match(block, /super\.independent-verification\/scripts\/lessons\.py/,
    'lessons.py must be reached through its own skill segment');

  const runLines = block.split('\n').filter((l) => /^\s*(node|python3?)\s/.test(l));
  assert.equal(runLines.length, 1,
    `the lessons call must stand alone — a second command here re-creates the shared prefix. Got: ${JSON.stringify(runLines)}`);

  // The flags are not interchangeable, and one session copied `--repo-root` onto lessons.py.
  const lessonsLine = runLines[0];
  assert.ok(!/--repo-root/.test(lessonsLine), 'lessons.py does not take --repo-root');
  assert.match(lessonsLine, /list --status confirmed/, 'lessons.py needs its subcommand');
  assert.match(body, /belongs to \*\*`super\.independent-verification`, not to this skill/,
    'the prose must say which skill owns the script, or the path reads as a typo to fix');
  assert.match(body, /no `--repo-root`/,
    'the prose must say the flag does not apply, since the neighbouring call used to take one');
});
