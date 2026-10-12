'use strict';

/**
 * lib/corporate-artifacts.cjs is the ONE definition of what
 * `.superpowers/corporate-artifacts.yml` looks like and what its presence means.
 *
 * Two things are locked here, and the second is the reason the file was created:
 *
 *   1. The parse itself — the `- path:` / `- url:` shape, and the edge cases a naive
 *      line reader gets wrong (a `#` inside a path, quoted values, relative resolution).
 *
 *   2. That the SHAPE THE ONBOARDING WIZARD DOCUMENTS is the shape this parser reads.
 *      It was not: the reference told the wizard to write `items:` with bare scalars,
 *      while the only parser in the repo matched `artifacts:` with tagged items. A file
 *      written exactly as documented parsed to ZERO entries — the wizard reporting
 *      success over a declaration that declared nothing, with no error anywhere. Prose
 *      and parser cannot be kept in agreement by reading them side by side; this runs
 *      the documented example through the real function.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/corporate-artifacts.lib.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CONFIG_RELATIVE_PATH,
  parseCorporateEntries,
  resolveCorporateArtifacts,
} = require('../lib/corporate-artifacts.cjs');

const SKILLS = path.resolve(__dirname, '..', '..', '..');

function mkRepo({ yml, files = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corp-artifacts-'));
  for (const rel of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '# corporate source\n', 'utf8');
  }
  if (yml !== undefined) {
    fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
    fs.writeFileSync(path.join(root, CONFIG_RELATIVE_PATH), yml, 'utf8');
  }
  return root;
}

// ─── 1. The parse ────────────────────────────────────────────────────────────

test('parses both item kinds and resolves a relative path against the repo root', () => {
  const entries = parseCorporateEntries(
    'artifacts:\n  - path: docs/prd.md\n  - url: https://wiki.example/spec\n',
    '/repo',
  );
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'path');
  assert.equal(entries[0].value, 'docs/prd.md');
  assert.equal(entries[0].resolvedPath, path.join('/repo', 'docs/prd.md'));
  assert.equal(entries[1].kind, 'url');
  assert.equal(entries[1].resolvedPath, null);
  assert.equal(entries[1].exists, null, 'a URL has no disk existence to report');
  assert.equal(entries[1].fetchable, false,
    'a read-only reader cannot fetch a URL — the caller must be able to say so instead of skipping it');
});

test('an absolute declared path is used as-is, not re-rooted', () => {
  const [entry] = parseCorporateEntries('artifacts:\n  - path: /abs/corp/prd.md\n', '/repo');
  assert.equal(entry.resolvedPath, '/abs/corp/prd.md');
});

test('quotes around a value are stripped', () => {
  const [entry] = parseCorporateEntries('artifacts:\n  - path: "docs/a b.md"\n', '/repo');
  assert.equal(entry.value, 'docs/a b.md');
});

test('a `#` inside a path survives; a real YAML comment does not', () => {
  // The comment strip only fires at line start or after whitespace, so `issue#12.md`
  // stays whole. Getting this backwards truncates a legitimate path in silence.
  const entries = parseCorporateEntries(
    'artifacts:\n  - path: docs/issue#12.md   # the ticket export\n  # - path: docs/disabled.md\n',
    '/repo',
  );
  assert.equal(entries.length, 1, 'the commented-out item must not count as a declaration');
  assert.equal(entries[0].value, 'docs/issue#12.md');
});

test('lines that are not tagged items are ignored, including the key itself', () => {
  const entries = parseCorporateEntries(
    '# Corporate Artifacts\nartifacts:\n  - path: docs/prd.md\n  - notes: ignore me\n  - plain-scalar\n',
    '/repo',
  );
  assert.equal(entries.length, 1);
});

test('exists reports the truth for a declared path, both ways', () => {
  const root = mkRepo({ files: ['docs/there.md'] });
  try {
    const entries = parseCorporateEntries(
      'artifacts:\n  - path: docs/there.md\n  - path: docs/gone.md\n',
      root,
    );
    assert.equal(entries[0].exists, true);
    assert.equal(entries[1].exists, false, 'a missing declared file is reported, never thrown');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ─── 2. Presence is not consent ──────────────────────────────────────────────

test('found requires BOTH consent and at least one declared entry', () => {
  const root = mkRepo({ yml: 'artifacts:\n  - path: docs/prd.md\n' });
  try {
    assert.equal(resolveCorporateArtifacts(root, { enabled: true }).found, true);
    assert.equal(resolveCorporateArtifacts(root, { enabled: false }).found, false,
      'a file on disk is not the user declaring anything');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('declaredButDisabled reports the mismatch, and keeps the entries visible', () => {
  const root = mkRepo({ yml: 'artifacts:\n  - path: docs/prd.md\n' });
  try {
    const r = resolveCorporateArtifacts(root, { enabled: false });
    assert.equal(r.declared, true);
    assert.equal(r.declaredButDisabled, true);
    assert.equal(r.count, 1);
    assert.ok(r.configPath, 'the caller needs the path to tell the user what to fix');
    assert.equal(r.entries.length, 1,
      'a caller that must NAME what it is disregarding needs the entries; dropping them is the caller\'s call');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a yml with no items is NOT a declaration', () => {
  const root = mkRepo({ yml: '# only comments\nartifacts:\n' });
  try {
    const r = resolveCorporateArtifacts(root, { enabled: true });
    assert.equal(r.declared, false, 'an empty list declares nothing, flag or no flag');
    assert.equal(r.found, false);
    assert.equal(r.declaredButDisabled, false);
    assert.equal(r.count, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no yml at all → declared false, configPath null, no throw', () => {
  const root = mkRepo();
  try {
    const r = resolveCorporateArtifacts(root, { enabled: true });
    assert.equal(r.declared, false);
    assert.equal(r.configPath, null);
    assert.deepEqual(r.entries, []);
    assert.equal(r.enabled, true, 'consent is reported back even with nothing declared');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no repo root → the empty shape, never a crash', () => {
  const r = resolveCorporateArtifacts(null, { enabled: true });
  assert.equal(r.declared, false);
  assert.equal(r.found, false);
  assert.equal(r.configPath, null);
});

// ─── 3. The documented shape must be the parsed shape ────────────────────────

test('every YAML example in the onboarding reference parses to at least one entry', () => {
  const ref = fs.readFileSync(
    path.join(SKILLS, 'super.using-superpowers/references/onboarding-preferences.md'),
    'utf8',
  );
  const section = ref.slice(ref.indexOf('### Step 3 — Corporate Artifacts'));
  assert.ok(section.length > 0, 'the wizard step that writes the file must exist');

  const blocks = [...section.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
  const corporate = blocks.filter((b) => /corporate-artifacts|artifacts\s*:/i.test(b));
  assert.ok(corporate.length >= 1,
    'the wizard step must show the file it tells the model to write');

  for (const block of corporate) {
    const entries = parseCorporateEntries(block, '/repo');
    assert.ok(entries.length >= 1,
      'a corporate-artifacts.yml written exactly as documented parses to ZERO entries — '
      + 'the wizard would report success over a declaration that declares nothing:\n' + block);
  }
});

test('the reference names the tagged-item shape, not a list of bare scalars', () => {
  const ref = fs.readFileSync(
    path.join(SKILLS, 'super.using-superpowers/references/onboarding-preferences.md'),
    'utf8',
  );
  const section = ref.slice(ref.indexOf('### Step 3 — Corporate Artifacts'));
  const block = section.slice(section.indexOf('```yaml'), section.indexOf('```', section.indexOf('```yaml') + 7));
  assert.match(block, /^artifacts:$/m, 'the top-level key is `artifacts:`');
  assert.doesNotMatch(block, /^items:$/m,
    '`items:` is the shape that parses to nothing — it must not come back');
  assert.match(block, /- path:/, 'path items must be tagged');
  assert.match(block, /- url:/, 'url items must be tagged');
});
