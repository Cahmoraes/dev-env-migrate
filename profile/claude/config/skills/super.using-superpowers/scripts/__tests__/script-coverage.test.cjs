#!/usr/bin/env node
'use strict';
/*
 * script-coverage.test.cjs — no script ships untested without someone saying why.
 *
 * This exists because of how `detect-git-env.sh` stayed uncovered: it is the only script
 * in the tree that is not `.cjs`, and every sweep in this repo — including the one I ran
 * while auditing coverage — filtered on `.cjs`. The script was not skipped on purpose,
 * it was invisible. That is the worst shape for a gap: nobody decided to leave it, so
 * nobody was ever going to notice it.
 *
 * The guard is a registry, not a mandate. A script is fine if a test names it, and fine
 * if it is in ALLOWLIST with a reason. What is not fine is the third state — untested and
 * unmentioned — because that is indistinguishable from an oversight, which it usually is.
 *
 * "Covered" means the file's basename appears in some test file. That is coarse: it does
 * not check the test asserts anything useful. It is still the right check for this layer,
 * because the failure it targets is a script nobody wired up at all, and a coarse check
 * that runs on every commit beats a precise one nobody writes.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/script-coverage.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const CODE_EXTENSIONS = new Set(['.cjs', '.mjs', '.js', '.sh', '.py']);
const IGNORED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules']);

const SCRIPT_TREES = ['scripts'];

// Untested on purpose. Each entry costs one line and one sentence, which is the price of
// making the decision visible instead of implicit.
const ALLOWLIST = new Map([
  ['super.design-doc-mermaid/scripts/extract_mermaid.py',
    'renders diagrams through the mermaid CLI: needs Python plus a browser toolchain the Node suite has no way to provide'],
  ['super.design-doc-mermaid/scripts/mermaid_to_image.py',
    'same toolchain dependency as extract_mermaid.py'],
  ['super.design-doc-mermaid/scripts/resilient_diagram.py',
    'same toolchain dependency as extract_mermaid.py'],
]);

function collectScripts() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(abs, relPath); continue;
      }
      const ext = path.extname(entry.name);
      // Extensionless files count only when executable, so a shell CLI with no suffix is
      // swept while README fragments beside it are not.
      const isCode = CODE_EXTENSIONS.has(ext) ||
        (ext === '' && (fs.statSync(abs).mode & 0o111) !== 0);
      if (isCode) out.push(relPath);
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    for (const tree of SCRIPT_TREES) {
      const treeDir = path.join(SKILLS, skill, tree);
      if (fs.existsSync(treeDir)) walk(treeDir, `${skill}/${tree}`);
    }
  }
  return out;
}

function collectTestText() {
  let blob = '';
  const testDirs = [];
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    for (const tree of SCRIPT_TREES) testDirs.push(path.join(SKILLS, skill, tree, '__tests__'));
  }
  for (const testDir of testDirs) {
    {
      if (!fs.existsSync(testDir)) continue;
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(abs); continue; }
          // This file must not count as coverage for anything: it lists the allowlisted
          // paths verbatim, so including it would make every exempted script look tested
          // and would quietly disarm both checks below.
          if (abs === __filename) continue;
          if (/\.(test\.cjs|cjs|py)$/.test(entry.name)) blob += fs.readFileSync(abs, 'utf8');
        }
      };
      walk(testDir);
    }
  }
  return blob;
}

test('the script sweep still finds scripts', () => {
  // Anti-staleness: a sweep that matches nothing reports no gaps forever.
  const n = collectScripts().length;
  assert.ok(n >= 30, `expected the tree to still hold many scripts, found ${n}`);
});

test('every script is either exercised by a test or allowlisted with a reason', () => {
  const testText = collectTestText();
  const orphans = collectScripts().filter((rel) => {
    if (ALLOWLIST.has(rel)) return false;
    return !testText.includes(path.basename(rel));
  });

  assert.deepEqual(
    orphans,
    [],
    'These scripts ship with no test naming them and no allowlist entry:\n  ' +
    orphans.join('\n  ') +
    '\n  Write a test, or add the path to ALLOWLIST with the reason it cannot be tested here.',
  );
});

test('the allowlist has no stale entries', () => {
  // An allowlist that outlives its entries is how a covered script keeps looking exempt,
  // and how a deleted script keeps looking like a live exception.
  const present = new Set(collectScripts());
  const testText = collectTestText();
  const stale = [];
  for (const [rel, reason] of ALLOWLIST) {
    if (!present.has(rel)) { stale.push(`${rel} — allowlisted (${reason}) but no longer exists`); continue; }
    if (testText.includes(path.basename(rel))) stale.push(`${rel} — now has a test; drop it from ALLOWLIST`);
  }
  assert.deepEqual(stale, [], stale.join('\n  '));
});
