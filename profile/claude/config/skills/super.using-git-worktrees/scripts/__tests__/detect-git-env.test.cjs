#!/usr/bin/env node
'use strict';
/*
 * detect-git-env.test.cjs — first tests for super.using-git-worktrees.
 *
 * `detect-git-env.sh` was the only script in the whole superpowers tree with no coverage
 * at all, and it got there by being the only one that is not `.cjs`: the repo's coverage
 * guards scan for `.cjs`, so a shell script is invisible to them. It is not a peripheral
 * helper — Step 0 of the skill runs it to decide whether the session is ALREADY isolated,
 * which is what stops the pipeline from creating a worktree inside a worktree, or from
 * treating a bare repo as a normal checkout.
 *
 * What makes it worth real tests rather than a smoke check: the JSON is hand-built with
 * `printf`, field by field. That is the classic place where a value with a quote or a
 * backslash in it silently produces output that no longer parses — and the caller is a
 * model that will read whatever comes out. So every case below parses the output, and
 * one case deliberately puts a `"` in a branch name.
 *
 * Run: node --test super.using-git-worktrees/scripts/__tests__/detect-git-env.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'detect-git-env.sh');

// Hermetic git: no user config, no inherited hooks, deterministic identity and branch.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test',
};

const gitDisponivel = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
const skipSemGit = gitDisponivel ? false : 'git unavailable on PATH';

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function detect(cwd, env) {
  const r = spawnSync('bash', [SCRIPT], {
    cwd, encoding: 'utf8', env: { ...GIT_ENV, ...(env || {}) },
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* deixa null: o teste reporta */ }
  return { ...r, json };
}

const tmpdirs = [];
function sandbox() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dge-'));
  tmpdirs.push(d);
  return fs.realpathSync(d); // macOS: /var -> /private/var, senao os paths nao batem
}

function repoSimples() {
  const dir = sandbox();
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main', '.']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'init']);
  return { dir, repo };
}

test.after(() => {
  for (const d of tmpdirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
});

test('outside any repository: valid JSON, everything empty', { skip: skipSemGit }, () => {
  const r = detect(sandbox());
  assert.ok(r.json, `output did not parse as JSON: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.json.isWorktree, false);
  assert.equal(r.json.isBareRepo, false);
  assert.equal(r.json.currentBranch, null);
  assert.equal(r.json.gitRoot, null);
  assert.deepEqual(r.json.worktrees, []);
});

test('plain checkout: not a worktree, and it lists itself as the current one', { skip: skipSemGit }, () => {
  const { repo } = repoSimples();
  const r = detect(repo);
  assert.ok(r.json, `output did not parse as JSON: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.json.isWorktree, false, 'a plain checkout is not a linked worktree');
  assert.equal(r.json.isBareRepo, false);
  assert.equal(r.json.currentBranch, 'main');
  assert.equal(r.json.gitRoot, repo);
  assert.equal(r.json.worktrees.length, 1);
  assert.equal(r.json.worktrees[0].isCurrentWorktree, true);
});

test('inside a linked worktree: isWorktree true and the CURRENT one is identified', { skip: skipSemGit }, () => {
  // This is the distinction Step 0 exists for. Getting isCurrentWorktree wrong is worse
  // than getting isWorktree wrong: the skill would isolate work into someone else's tree.
  const { dir, repo } = repoSimples();
  const wt = path.join(dir, 'wt');
  git(repo, ['worktree', 'add', '-q', wt, '-b', 'feat']);

  const r = detect(wt);
  assert.ok(r.json, `output did not parse as JSON: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.json.isWorktree, true);
  assert.equal(r.json.currentBranch, 'feat');
  assert.equal(r.json.worktreePath, wt);
  assert.equal(r.json.worktrees.length, 2);
  const atuais = r.json.worktrees.filter((w) => w.isCurrentWorktree);
  assert.equal(atuais.length, 1, 'exactly one worktree may be the current one');
  assert.equal(atuais[0].path, wt);
});

test('bare repository: flagged as bare, with no working tree path', { skip: skipSemGit }, () => {
  const { dir, repo } = repoSimples();
  const bare = path.join(dir, 'bare.git');
  git(dir, ['clone', '-q', '--bare', repo, bare]);
  const r = detect(bare);
  assert.ok(r.json, `output did not parse as JSON: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.json.isBareRepo, true);
  assert.equal(r.json.worktreePath, null, 'a bare repo has no working tree to report');
});

test('a branch name containing a quote does not break the hand-built JSON', { skip: skipSemGit }, () => {
  // The JSON is assembled with printf, so every string field depends on json_escape
  // being applied. Miss one and the output stops parsing for a value git accepts.
  // (A backslash is not testable here — git refuses it in a refname. It reaches the
  // emitter through the path instead, which is the next test.)
  const { repo } = repoSimples();
  const nome = 'fix/has"quote';
  git(repo, ['checkout', '-q', '-b', nome]);

  const r = detect(repo);
  assert.ok(
    r.json,
    `a branch named ${JSON.stringify(nome)} produced unparseable output: ${JSON.stringify(r.stdout)}`,
  );
  assert.equal(r.json.currentBranch, nome, 'the escaped value must round-trip to the original');
});

test('a repo path containing a backslash and a quote still emits parseable JSON', { skip: skipSemGit }, () => {
  // The other half of json_escape. Both characters are legal in a POSIX directory name,
  // and paths land in gitRoot, worktreePath and every worktrees[] entry, so a missing
  // escape here corrupts more fields than a branch name would.
  const dir = sandbox();
  const repo = path.join(dir, 'back\\slash-and"quote');
  fs.mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main', '.']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'init']);

  const r = detect(repo);
  assert.ok(
    r.json,
    `a repo at ${JSON.stringify(repo)} produced unparseable output: ${JSON.stringify(r.stdout)}`,
  );
  assert.equal(r.json.gitRoot, repo, 'the escaped path must round-trip to the original');
  assert.equal(r.json.worktrees[0].path, repo, 'paths inside worktrees[] need the same escaping');
});

test('an unknown argument is refused instead of being ignored', { skip: skipSemGit }, () => {
  const r = spawnSync('bash', [SCRIPT, '--worktree'], { cwd: sandbox(), encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 1, 'a mistyped flag must not look like a successful detection');
  assert.match(r.stderr + r.stdout, /unknown argument/i);
});

test('--help exits clean and does not emit a detection payload', { skip: skipSemGit }, () => {
  const r = spawnSync('bash', [SCRIPT, '--help'], { cwd: sandbox(), encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /"isWorktree"/, 'help output must not be mistaken for a result');
});

test('git missing from PATH fails loudly rather than reporting "no repo"', () => {
  // The dangerous degradation: a toolless environment answering isWorktree=false would
  // read as "plain checkout, go ahead and create a worktree here".
  const r = spawnSync('/bin/bash', [SCRIPT], {
    cwd: sandbox(), encoding: 'utf8', env: { ...GIT_ENV, PATH: '/nonexistent' },
  });
  assert.notEqual(r.status, 0, 'a missing git must be an error, not an empty detection');
  assert.match(r.stderr + r.stdout, /git command not found/i);
});
