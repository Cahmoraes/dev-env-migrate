'use strict';
/*
 * skill-frontmatter-keys.test.cjs — every SKILL.md frontmatter key is one the harness parses.
 *
 * Why an allowlist and not a blocklist of known typos: an unknown frontmatter key is
 * IGNORED IN SILENCE. There is no error, no warning, no degraded mode — the field simply
 * does nothing, and the author has no way to tell a working field from a dead one by
 * looking at the file. That failure mode is invisible by construction, so the only place
 * it can be caught is here.
 *
 * Two dead fields were found in the sweep that motivated this file:
 *
 *   argumentHint:  in super.deep-research and wcag-audit-patterns. The field is
 *                  `argument-hint` — the frontmatter is kebab-case. The camelCase spelling
 *                  had been applied deliberately, and the repo's own CLAUDE.md documented
 *                  it, so it was reproducing itself into every new skill.
 *   tools:         in webview-bridge, holding MCP/skill names. There is no `tools` field on
 *                  a skill; the pre-approval field is `allowed-tools`, and it takes tool
 *                  names. Moved to `metadata`, which is the documented free-form map.
 *
 * The allowlist is the full set of fields Claude Code accepts, not just the ones we use
 * today — a guard that fails when someone adopts a legitimate new field would be trained
 * away rather than fixed. When the harness adds a field, add it here.
 *
 * Note on portability: `name`, `description`, `license`, `compatibility`, `metadata` and
 * `allowed-tools` are the only six the agentskills.io spec allows. Everything else works in
 * Claude Code but hard-errors if a skill is ever packaged for claude.ai or the Skills API.
 * We distribute by filesystem, so that path is not exercised — SPEC_ONLY marks the boundary
 * so the cost is visible if it ever is.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/skill-frontmatter-keys.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// .../artifacts/superpowers/skills/super.using-superpowers/scripts/__tests__ -> .../artifacts
const ARTIFACTS = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SKIPPED_DIRS = new Set(['node_modules', '__pycache__', '.git']);

/**
 * Anti-staleness floor. A walk that stops finding SKILL.md files would sweep nothing and
 * pass forever. 60 is below the 66 present when this was written, with room for removals.
 */
const MIN_SKILLS = 60;

/** Fields Claude Code accepts on a SKILL.md. Source: code.claude.com/docs/en/skills */
const ALLOWED = new Set([
  'name', 'description', 'when_to_use', 'argument-hint', 'arguments',
  'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools',
  'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell',
  'metadata', 'license', 'compatibility',
]);

/** The six the agentskills.io spec allows. Kept for documentation, not enforced. */
const SPEC_ONLY = new Set([
  'name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools',
]);

function skillFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (entry.name === 'SKILL.md') out.push({ abs, rel: path.relative(ARTIFACTS, abs) });
    }
  };
  walk(ARTIFACTS);
  return out;
}

/**
 * Top-level keys only. A nested key under `metadata:` or `hooks:` is the field's own
 * payload and is not governed by the allowlist, so anything indented is skipped.
 */
function topLevelKeys({ abs }) {
  const text = fs.readFileSync(abs, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const keys = [];
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
    if (k) keys.push(k[1]);
  }
  return keys;
}

const SKILLS = skillFiles();

test('the SKILL.md roster is not silently shrinking', () => {
  assert.ok(
    SKILLS.length >= MIN_SKILLS,
    `found ${SKILLS.length} SKILL.md files, expected >= ${MIN_SKILLS}. Either skills were `
    + 'deleted or the walk stopped matching — re-derive it before trusting a green here.',
  );
});

test('every SKILL.md has parseable frontmatter', () => {
  const bad = SKILLS.filter((s) => topLevelKeys(s) === null).map((s) => s.rel);
  assert.deepEqual(
    bad, [],
    'a SKILL.md with no `---` frontmatter block has no name and no description, so the '
    + 'harness cannot route to it at all.',
  );
});

test('no SKILL.md carries a frontmatter key the harness does not parse', () => {
  const bad = [];
  for (const s of SKILLS) {
    for (const key of topLevelKeys(s) || []) {
      if (!ALLOWED.has(key)) bad.push(`${s.rel}: ${key}`);
    }
  }
  assert.deepEqual(
    bad, [],
    'an unknown frontmatter key is ignored in silence — the field looks applied and does '
    + 'nothing. Frontmatter is kebab-case: it is `argument-hint`, not `argumentHint`; and '
    + 'the tool pre-approval field is `allowed-tools`, not `tools`. If the harness gained a '
    + 'new field, add it to ALLOWED in this file rather than dropping the key.',
  );
});

test('every SKILL.md declares name and description', () => {
  const bad = [];
  for (const s of SKILLS) {
    const keys = topLevelKeys(s) || [];
    if (!keys.includes('name')) bad.push(`${s.rel}: missing name`);
    if (!keys.includes('description')) bad.push(`${s.rel}: missing description`);
  }
  assert.deepEqual(
    bad, [],
    '`description` is what the model matches a request against. Without it the skill is on '
    + 'disk but unreachable by routing.',
  );
});

test('the spec-portable subset is documented and non-empty', () => {
  // Not a behavioural assertion — it pins the boundary so that if we ever package for the
  // Skills API, the set of fields that would hard-error is already written down here.
  for (const key of SPEC_ONLY) {
    assert.ok(ALLOWED.has(key), `${key} is spec-portable but missing from ALLOWED`);
  }
  assert.ok(SPEC_ONLY.size === 6);
});
