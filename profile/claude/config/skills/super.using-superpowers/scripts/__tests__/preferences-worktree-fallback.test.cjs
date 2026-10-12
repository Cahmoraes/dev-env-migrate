'use strict';
/*
 * preferences-worktree-fallback.test.cjs — preferences are found from inside a linked
 * worktree, where the file does not exist.
 *
 * `.superpowers/` is gitignored in consumer repos, so `git worktree add` produces a tree
 * without it. Root resolution followed `--show-toplevel` semantics deliberately — the
 * comment in repo-root.cjs says so — which in a linked worktree means the worktree. The
 * file is not there, `found` comes back false, and every preference falls back to its
 * default: `qa_gate` at its default, `auto_commit` at its default,
 * `model_tiers` gone.
 *
 * That is any session running inside a linked worktree — super.using-git-worktrees sets one
 * up, and the harness may hand you one. Nothing in the output separates "this repo configured
 * nothing" from "the file is one directory up" — `found:false` is what both look like,
 * which is the failure this repo already knows about from the other direction
 * (defaults masking absence).
 *
 * Reproduced against a real registered worktree before the fix:
 *   cd <worktree> && read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
 *   → found: false, preferencesPath: <worktree>/.superpowers/preferences.yml
 *
 * The fallback is one-directional on purpose: it only runs when the file is ABSENT at the
 * given root, so a worktree that carries its own preferences still wins. It can turn a
 * false `found:false` into a true `found:true`, never the reverse.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/preferences-worktree-fallback.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { execFileSync } = require('node:child_process');
const { mainRepoRoot } = require('../lib/repo-root.cjs');
const { loadPreferences } = require('../read-preferences.cjs');

/**
 * Builds the on-disk shape `git worktree add` leaves behind, without invoking git:
 *
 *   main/.git/                          (directory)
 *   main/.git/worktrees/wt/commondir    -> "../.."
 *   main/.superpowers/preferences.yml
 *   wt/.git                             (FILE: "gitdir: <main>/.git/worktrees/wt")
 *
 * Built by hand rather than shelled out to so the test states the layout it depends on.
 */
function makeWorktreePair(t, { prefsInWorktree = false, withCommondir = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-wt-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const main = path.join(tmp, 'main');
  const wt = path.join(tmp, 'wt');
  const gitdir = path.join(main, '.git', 'worktrees', 'wt');
  fs.mkdirSync(gitdir, { recursive: true });
  fs.mkdirSync(path.join(main, '.superpowers'), { recursive: true });
  fs.mkdirSync(wt, { recursive: true });

  if (withCommondir) fs.writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitdir}\n`);
  fs.writeFileSync(
    path.join(main, '.superpowers', 'preferences.yml'),
    'workflow:\n  auto_commit: false\nclaude_code:\n  review_effort: high\n',
  );
  if (prefsInWorktree) {
    fs.mkdirSync(path.join(wt, '.superpowers'), { recursive: true });
    fs.writeFileSync(
      path.join(wt, '.superpowers', 'preferences.yml'),
      'claude_code:\n  review_effort: low\n',
    );
  }
  return { main, wt };
}

test('mainRepoRoot hops from a linked worktree to the main working tree', (t) => {
  const { main, wt } = makeWorktreePair(t);
  assert.equal(mainRepoRoot(wt), main);
});

test('mainRepoRoot leaves a normal clone alone', (t) => {
  const { main } = makeWorktreePair(t);
  assert.equal(mainRepoRoot(main), main,
    'in a normal clone `.git` is a directory — there is nothing to hop to, and rewriting '
    + 'the root there would break every non-worktree caller');
});

test('mainRepoRoot falls back to the gitdir layout when commondir is missing', (t) => {
  const { main, wt } = makeWorktreePair(t, { withCommondir: false });
  assert.equal(mainRepoRoot(wt), main,
    'older git layouts omit commondir; the gitdir is <main>/.git/worktrees/<name>');
});

test('mainRepoRoot returns the input unchanged for anything unrecognised', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-junk-'));
  try {
    fs.writeFileSync(path.join(tmp, '.git'), 'not a gitdir line\n');
    assert.equal(mainRepoRoot(tmp), tmp,
      'an unreadable or unexpected layout must never turn a working resolution into a '
      + 'failed one — degrade to the root we were given');
    assert.equal(mainRepoRoot(null), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('preferences are found from inside a linked worktree', (t) => {
  const { main, wt } = makeWorktreePair(t);
  const { result } = loadPreferences(wt);
  assert.equal(result.found, true,
    'this is the regression: every subagent dispatched inside a linked worktree read '
    + 'found:false and silently ran on defaults');
  assert.equal(result.preferencesPath, path.join(main, '.superpowers', 'preferences.yml'));
  assert.equal(result.preferences.workflow.auto_commit, false,
    'the values must be the main tree\'s, not the defaults');
  assert.equal(result.preferences.claude_code.review_effort, 'high');
});

test('a worktree carrying its own preferences still wins', (t) => {
  const { wt } = makeWorktreePair(t, { prefsInWorktree: true });
  const { result } = loadPreferences(wt);
  assert.equal(result.found, true);
  assert.equal(result.preferencesPath, path.join(wt, '.superpowers', 'preferences.yml'),
    'the fallback runs only when the file is ABSENT at the given root — a worktree with '
    + 'its own file must not be overridden by the main tree');
  assert.equal(result.preferences.claude_code.review_effort, 'low');
});

test('a repo with no preferences anywhere still reports found:false at the given root', (t) => {
  const { wt, main } = makeWorktreePair(t);
  fs.rmSync(path.join(main, '.superpowers'), { recursive: true, force: true });
  const { result } = loadPreferences(wt);
  assert.equal(result.found, false,
    'the fallback must not invent a file — genuine absence still has to be reportable');
  assert.equal(result.repo_not_found, false);
  // `preferencesPath` must stay the root we were asked about. It is what onboarding shows
  // the user as "create it here", and silently retargeting it to a directory the caller
  // never named turns a missing-file report into a confusing one. The redirect is earned
  // by a file actually being there, not by the hop being possible.
  assert.equal(result.preferencesPath, path.join(wt, '.superpowers', 'preferences.yml'),
    'with nothing found anywhere, report the path under the root that was passed in');
});

// ─── The corporate probe follows the same root ───────────────────────────────
//
// `.superpowers/corporate-artifacts.yml` is the SIBLING of the preferences.yml that
// granted consent, so the probe has to look wherever the loader actually found that
// file — not wherever it was pointed. Probing the input root inside a worktree reports
// "no corporate artifacts" for a repo that has them, and every subagent that session
// dispatches inherits the same blind spot. Same one-directional fallback: it can only turn
// a false "nothing declared" into a true one.

test('the corporate probe resolves against the tree where preferences were found', (t) => {
  const { main, wt } = makeWorktreePair(t);
  fs.writeFileSync(
    path.join(main, '.superpowers', 'preferences.yml'),
    'context:\n  has_corporate_artifacts: true\n',
  );
  fs.writeFileSync(
    path.join(main, '.superpowers', 'corporate-artifacts.yml'),
    'artifacts:\n  - path: docs/corp/prd.md\n',
  );

  const out = JSON.parse(execFileSync(
    'node',
    [path.resolve(__dirname, '..', 'derive-session-state.cjs'), '--platform', 'claude-code', '--repo-root', wt],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));

  assert.equal(out.preferencesFound, true, 'precondition: the loader hopped to the main tree');
  assert.equal(out.corporateArtifacts.declared, true,
    'the probe followed the input root instead of the resolved one — a worktree has no '
    + '.superpowers/, so it would report nothing declared');
  assert.equal(out.corporateArtifacts.count, 1);
  assert.equal(
    out.corporateArtifacts.configPath,
    path.join(main, '.superpowers', 'corporate-artifacts.yml'),
  );
});
