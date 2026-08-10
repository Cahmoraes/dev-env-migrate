'use strict';

/**
 * reference-pointers.test.cjs — every reference/agent/script pointer a SKILL.md tells the model
 * to read must actually resolve on disk.
 *
 * Why this is a cost problem and not just tidiness: skills work by progressive disclosure. The
 * SKILL.md is eager, the references are pay-on-read, and the model is told "read
 * `./references/x.md`" at the moment it needs x. A pointer that no longer resolves spends a tool
 * call that fails, and then the model either improvises the missing content or reports itself
 * blocked. Renames are the usual cause, and nothing guards them today.
 *
 * Two pointer idioms exist in this repo, and they need different checks:
 *
 * OWNED — the owner is written into the path, so the exact location is checkable:
 *   `./references/x.md`        → relative to the skill that wrote it
 *   `super.other/references/x` → relative to the skills root
 *   [text](./references/x.md)  → markdown link, relative to the skill
 *
 * BARE — `` `references/x.md` `` with no prefix. The owner is NOT inferable from the path: it is
 * often the mentioning skill (super.using-superpowers points at `references/copilot-tools.md`,
 * its own), but just as often another skill named in adjacent prose, outside the backticks —
 * "`references/model-selection.md` (in `super.subagent-driven-development`)" and
 * "(`super.independent-verification`, template `agents/verifier.md`)". Resolving bare pointers
 * self-relatively reports six broken pointers that are all fine, and a guard that cries wolf
 * gets deleted.
 *
 * So a bare pointer is checked for EXISTENCE ANYWHERE under the skills tree, not for ownership.
 * That is deliberately weaker — it would not catch a pointer aimed at the wrong skill — but it
 * is exact about the failure mode that actually happens: a file renamed or deleted resolves
 * nowhere. Skipping bare pointers entirely was the first design, and it left the platform tool
 * mappings unguarded — the pointers read at session entry on every non-Claude platform.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/reference-pointers.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const SUBDIR = '(?:references|agents|scripts|assets|evals)';
const PATH_CHARS = '[A-Za-z0-9._/-]+';

function skillDirs() {
  return fs
    .readdirSync(SKILLS)
    .filter((d) => d.startsWith('super.'))
    .filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')))
    .sort();
}

/** Collect the unambiguous pointers a skill's SKILL.md declares, deduped. */
function pointersOf(skill) {
  const dir = path.join(SKILLS, skill);
  const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const found = new Map(); // rel -> { base, form }

  const harvest = (re, base, form) => {
    for (const m of text.matchAll(re)) {
      if (!found.has(m[1])) found.set(m[1], { base, form });
    }
  };

  harvest(new RegExp('`(\\./' + SUBDIR + '/' + PATH_CHARS + ')`', 'g'), dir, 'self');
  harvest(new RegExp('`(super\\.[a-z.-]+/' + SUBDIR + '/' + PATH_CHARS + ')`', 'g'), SKILLS, 'cross-skill');
  harvest(new RegExp('\\]\\((\\./' + SUBDIR + '/' + PATH_CHARS + ')\\)', 'g'), dir, 'link');
  // Bare form: no owner in the path, so `base` is meaningless — resolved against every skill.
  harvest(new RegExp('`(' + SUBDIR + '/' + PATH_CHARS + '\\.md)`', 'g'), null, 'bare');

  return [...found.entries()].map(([rel, meta]) => ({ skill, rel, ...meta }));
}

function allPointers() {
  return skillDirs().flatMap(pointersOf);
}

/** Owned pointers must exist exactly where they say; bare ones must exist under some skill. */
function resolves(pointer) {
  if (pointer.form !== 'bare') return fs.existsSync(path.join(pointer.base, pointer.rel));
  return skillDirs().some((d) => fs.existsSync(path.join(SKILLS, d, pointer.rel)));
}

test('every pointer a SKILL.md tells the model to read resolves on disk', () => {
  const broken = allPointers()
    .filter((p) => !resolves(p))
    .map((p) => `${p.skill} -> ${p.rel} [${p.form}]`);

  assert.deepEqual(
    broken,
    [],
    'A SKILL.md points at a file that does not exist. The model will spend a failed tool call '
      + 'on it and then improvise or stall. Fix the path, or restore the file.',
  );
});

test('the sweep finds pointers of every form, so a regex rot cannot silently empty it', () => {
  const pointers = allPointers();

  // A regex that stops matching would make the test above vacuously green. Pin the shape of
  // what it collects rather than an exact count, which would churn on every edit.
  assert.ok(pointers.length >= 40, `expected the sweep to find pointers, saw ${pointers.length}`);

  const forms = new Set(pointers.map((p) => p.form));
  assert.ok(forms.has('self'), 'expected `./references/...` self-pointers to be collected');
  assert.ok(forms.has('cross-skill'), 'expected `super.x/references/...` pointers to be collected');
  assert.ok(forms.has('bare'), 'expected bare `references/...` pointers to be collected');
});

test('the platform tool mappings are covered', () => {
  // These are bare pointers read at session entry on every non-Claude platform, and the first
  // version of this test skipped the bare form entirely — leaving exactly these unguarded.
  const collected = new Set(allPointers().map((p) => p.rel));
  for (const platform of ['copilot', 'codex', 'gemini', 'opencode']) {
    assert.ok(
      collected.has(`references/${platform}-tools.md`) || collected.has(`./references/${platform}-tools.md`),
      `the ${platform} tool mapping must be a checked pointer`,
    );
  }
});

test('a pointer to a missing file is actually detected', () => {
  // Guards the guard: prove each resolution path can fail, so the greens above mean something.
  const owned = { base: SKILLS, rel: 'super.using-superpowers/references/does-not-exist.md', form: 'cross-skill' };
  assert.equal(resolves(owned), false, 'an owned pointer at a missing path must not resolve');

  const ownedReal = { base: SKILLS, rel: 'super.using-superpowers/references/opencode-tools.md', form: 'cross-skill' };
  assert.equal(resolves(ownedReal), true);

  assert.equal(resolves({ rel: 'references/no-such-mapping.md', form: 'bare' }), false,
    'a bare pointer that resolves under no skill must not resolve');
  assert.equal(resolves({ rel: 'references/opencode-tools.md', form: 'bare' }), true,
    'a bare pointer that resolves under some skill must resolve');
});
