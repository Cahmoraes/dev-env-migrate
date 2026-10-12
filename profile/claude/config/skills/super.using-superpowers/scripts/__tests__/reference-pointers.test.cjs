'use strict';

/**
 * reference-pointers.test.cjs — every reference/agent/script pointer the runtime prose tells the
 * model to read must actually resolve on disk.
 *
 * Why this is a cost problem and not just tidiness: skills work by progressive disclosure. The
 * SKILL.md is eager, the references are pay-on-read, and the model is told "read
 * `./references/x.md`" at the moment it needs x. A pointer that no longer resolves spends a tool
 * call that fails, and then the model either improvises the missing content or reports itself
 * blocked. Renames are the usual cause, and nothing guards them today.
 *
 * Scope: the SKILL.md plus every `.md` under `references/`, `agents/`, `templates/` and
 * `template/`. Sweeping only the SKILL.md was the first shape, and it missed the failure mode
 * that the deferred layer has and the eager one cannot have: a `./references/x.md` written
 * INSIDE `references/` is resolved against the directory of the file that carries it, so it
 * means `references/references/x.md` and resolves nowhere. The prose reads correct — the sibling
 * is right there — which is exactly why it survives review.
 *
 * Two pointer idioms exist in this repo, and they need different checks:
 *
 * OWNED — the owner is written into the path, so the exact location is checkable:
 *   `./references/x.md`        → relative to the DIRECTORY of the file that wrote it
 *   `super.other/references/x` → relative to the skills root
 *   [text](./references/x.md)  → markdown link, same directory rule
 *
 * BARE — `` `references/x.md` `` with no prefix. The owner is NOT inferable from the path: it is
 * often the mentioning skill (super.using-superpowers points at `references/copilot-tools.md`,
 * its own), but just as often another skill named in adjacent prose, outside the backticks —
 * "`references/model-selection.md` (in `super.subagent-driven-development`)" and
 * "(`super.requesting-code-review`, template `agents/code-reviewer.md`)". Resolving bare pointers
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

const SUBDIR = '(?:references|agents|scripts|assets)';
const PATH_CHARS = '[A-Za-z0-9._/-]+';

/** Runtime prose layers, besides the SKILL.md, that address the model with pointers. */
const POINTER_DIRS = ['references', 'agents', 'templates', 'template'];

function skillDirs() {
  return fs
    .readdirSync(SKILLS)
    .filter((d) => d.startsWith('super.'))
    .filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')))
    .sort();
}

/** Every runtime markdown file a pointer can be written in, with the skill that owns it. */
function proseFiles() {
  const out = [];
  for (const skill of skillDirs()) {
    out.push({ skill, rel: 'SKILL.md', abs: path.join(SKILLS, skill, 'SKILL.md') });
    for (const sub of POINTER_DIRS) {
      const dir = path.join(SKILLS, skill, sub);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir).sort()) {
        if (!name.endsWith('.md')) continue;
        out.push({ skill, rel: `${sub}/${name}`, abs: path.join(dir, name) });
      }
    }
  }
  return out;
}

/** Collect the unambiguous pointers one runtime file declares, deduped. */
function pointersOf(file) {
  const text = fs.readFileSync(file.abs, 'utf8');
  // `./x` is relative to the file that carries it, never to the skill root: that is the whole
  // point of sweeping the deferred layer.
  const dir = path.dirname(file.abs);
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

  return [...found.entries()].map(([rel, meta]) => ({ skill: file.skill, file: file.rel, rel, ...meta }));
}

function allPointers() {
  return proseFiles().flatMap(pointersOf);
}

/** Owned pointers must exist exactly where they say; bare ones must exist under some skill. */
function resolves(pointer) {
  if (pointer.form !== 'bare') return fs.existsSync(path.join(pointer.base, pointer.rel));
  return skillDirs().some((d) => fs.existsSync(path.join(SKILLS, d, pointer.rel)));
}

function brokenPointers() {
  return allPointers()
    .filter((p) => !resolves(p))
    .map((p) => `${p.skill}/${p.file} -> ${p.rel} [${p.form}]`);
}

test('every pointer the runtime prose tells the model to read resolves on disk', () => {
  assert.deepEqual(
    brokenPointers(),
    [],
    'a runtime file points at something that does not exist. The model will spend a failed tool '
      + 'call on it and then improvise or stall. A `./references/x.md` written inside '
      + '`references/` means `references/references/x.md` — drop the `./references/` prefix and '
      + 'name the sibling, or fix the path.',
  );
});

test('the sweep finds pointers of every form, in both layers, so a regex rot cannot empty it', () => {
  const pointers = allPointers();
  const deferred = pointers.filter((p) => p.file !== 'SKILL.md');

  // A regex that stops matching would make the test above vacuously green. Pin the shape of
  // what it collects rather than an exact count, which would churn on every edit.
  assert.ok(pointers.length >= 100, `expected the sweep to find pointers, saw ${pointers.length}`);
  // Separate floor for the layer this sweep was extended to reach: a walk that stopped
  // descending into references/agents/templates would keep the floor above green.
  assert.ok(
    deferred.length >= 35,
    `expected pointers from references/agents/templates too, saw ${deferred.length}`,
  );
  assert.ok(
    new Set(deferred.map((p) => p.skill)).size >= 5,
    'the deferred layer must be swept across skills, not just one',
  );

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

  // The extension's own failure mode: `./references/x.md` carried by a file that already lives
  // in references/ is resolved against that directory and therefore doubles the segment.
  const insideRefs = path.join(SKILLS, 'super.using-superpowers', 'references');
  assert.equal(
    resolves({ base: insideRefs, rel: './references/token-budget.md', form: 'self' }), false,
    'a ./references/ pointer written inside references/ must NOT resolve — that is the defect',
  );
  assert.equal(
    resolves({ base: insideRefs, rel: './token-budget.md', form: 'self' }), true,
    'the sibling form must resolve, or the check above would fail for the wrong reason',
  );
});

test('a broken pointer planted in the deferred layer is reported', () => {
  // The unit cases above exercise resolves(); this one proves the WALK reaches
  // references/agents/templates, by planting a pointer in a real skill file and taking it back.
  const victim = path.join(SKILLS, 'super.using-superpowers', 'references', 'token-budget.md');
  const original = fs.readFileSync(victim, 'utf8');
  const before = brokenPointers();
  try {
    fs.writeFileSync(victim, `${original}\n<!-- \`./references/planted-nowhere.md\` -->\n`);
    const after = brokenPointers();
    assert.ok(
      after.some((b) => b.includes('planted-nowhere.md')),
      'the sweep must reach references/ — a planted broken pointer there was not reported',
    );
    assert.equal(after.length, before.length + 1, 'exactly the planted pointer is added');
  } finally {
    fs.writeFileSync(victim, original);
  }
});
