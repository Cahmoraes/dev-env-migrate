'use strict';

/**
 * A parallel wave's worktrees are NOT a session workspace, and picking the wrong
 * mechanism to create them fails in two different ways — one loud and wrong, one
 * silent and worse.
 *
 * `super.using-git-worktrees` prefers a native harness worktree tool, and it is right
 * to: for ONE workspace that YOU work in, the native tool handles placement, branch
 * creation and cleanup. A wave is the other shape — N trees, created by an orchestrator
 * that enters none of them, each on a branch name the pre-merge gate resolves literally
 * and each off the base branch that already carries earlier waves' merges. Native tools
 * are typically one-per-session, switch the CALLER's working directory, and choose the
 * base ref and branch name themselves.
 *
 * The two tests below are the consequences, measured against the real gate rather than
 * argued. They are what the prose in `references/integrating-worktrees.md` exists to
 * prevent, so if that prose is ever softened back to "defer to the native tool", these
 * still say what happens next.
 *
 * Run: node --test super.parallel-subagent-development/scripts/__tests__/worktree-mechanism-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const GATE = path.join(SKILLS, 'super.parallel-subagent-development', 'scripts', 'check-integration.cjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A repo mid-feature: `main`, a base branch `feat/x` carrying an integrated wave 1. */
function repoMidFeature() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-mech-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'initial']);
  git(dir, ['checkout', '-qb', 'feat/x']);
  fs.writeFileSync(path.join(dir, 'wave1.txt'), 'wave 1 landed here');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'wave 1 integrated']);
  return dir;
}

/** A task branch off `from`, with one commit — i.e. an implementer that DID its work. */
function taskBranch(dir, name, from, file) {
  git(dir, ['branch', name, from]);
  git(dir, ['checkout', '-q', name]);
  fs.writeFileSync(path.join(dir, file), 'implementer output');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', `work on ${name}`]);
  git(dir, ['checkout', '-q', 'feat/x']);
}

function gate(dir, tasks) {
  const out = execFileSync('node', [GATE, '--base', 'feat/x', '--feature', 'x', '--tasks', tasks, '--repo-root', dir],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('a branch the native tool named its own way reads as "never committed"', () => {
  const dir = repoMidFeature();
  try {
    // Committed work exists. It is just not on `wt/x-task-01`, because the tool chose
    // the name. The gate resolves task branches literally from `--feature` and has no
    // override, so real work is reported as an absent implementer.
    taskBranch(dir, 'parallel-x-task-01', 'feat/x', 'task1.txt');
    const r = gate(dir, '1');
    assert.equal(r.tasks[0].branch, 'wt/x-task-01');
    assert.equal(r.tasks[0].branchExists, false);
    assert.equal(r.readyToIntegrate, false);
    assert.match(r.blockers[0], /has not committed in an isolated worktree yet/);
    // The work is right there, one name away.
    assert.ok(git(dir, ['rev-parse', '--verify', 'parallel-x-task-01']).trim());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a branch off the WRONG base ref passes the gate and loses the earlier wave', () => {
  const dir = repoMidFeature();
  try {
    // Correct name, wrong base: branched from `main` instead of `feat/x` — the default
    // a native tool commonly applies ("branch fresh from the default branch").
    taskBranch(dir, 'wt/x-task-02', 'main', 'task2.txt');
    const r = gate(dir, '2');

    // Nothing objects. This is the failure mode the prose has to prevent, because the
    // gate structurally cannot: `commitsBehind` is also how a legitimate resume looks
    // after a sibling merged, so it cannot be read as an error here.
    assert.equal(r.readyToIntegrate, true, 'the pre-merge gate does NOT catch a wrong base ref');
    assert.deepEqual(r.blockers, []);
    assert.equal(r.tasks[0].commitsBehind, 1);

    // And the cost: the implementer worked in a tree that never contained wave 1.
    let sawWave1 = true;
    try {
      git(dir, ['cat-file', '-e', 'wt/x-task-02:wave1.txt']);
    } catch {
      sawWave1 = false;
    }
    assert.equal(sawWave1, false, 'the task branch is missing the already-integrated wave');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the gate offers no branch-name override, so the name is a contract', () => {
  const help = execFileSync('node', [GATE, '--help'], { encoding: 'utf8' });
  assert.match(help, /--feature <name>\s+Feature name used to build wt\/<feature>-task-NN/);
  assert.doesNotMatch(help, /--branch\b/,
    'if this ever gains a branch override, the naming contract below can be relaxed');
});

test('the wave prescribes git worktree add, and says why the native tool is wrong here', () => {
  const ref = fs.readFileSync(
    path.join(SKILLS, 'super.parallel-subagent-development', 'references', 'integrating-worktrees.md'), 'utf8');

  assert.match(ref, /\*\*Use `git worktree add` here, and do not reach for a native session worktree tool\.\*\*/,
    'the inversion must be stated, not implied — the sibling skill prefers the opposite');
  for (const [what, needle] of [
    ['cardinality', /one-per-session/],
    ['who moves', /switches \*your\* working directory/],
    ['base ref', /branch from `origin\/<default-branch>`/],
    ['branch name is a contract', /the branch name is a contract, not a label/],
  ]) {
    assert.match(ref, needle, `the reference no longer explains the "${what}" reason`);
  }

  const skill = fs.readFileSync(
    path.join(SKILLS, 'super.parallel-subagent-development', 'SKILL.md'), 'utf8');
  assert.match(skill, /Per-task worktrees are created with `git worktree add` off the base branch/,
    'the SKILL.md still has to name the mechanism — the reference is read once, before the first wave');
  assert.doesNotMatch(skill, /native tool first/,
    'the old deferral ordering sends the controller to the wrong mechanism');
});

test('the worktree skill scopes its native-tool preference instead of contradicting the wave', () => {
  const skill = fs.readFileSync(path.join(SKILLS, 'super.using-git-worktrees', 'SKILL.md'), 'utf8');

  assert.match(skill, /\*\*Scope of this preference: ONE workspace, that YOU work in\.\*\*/,
    'Step 1a must bound its own preference, or the wave reads it as universal');
  assert.match(skill, /several worktrees at once, none of which it enters/,
    'the excluded shape has to be named for the reader to recognise it');

  // The Red Flag is the sharpest sentence in the file ("the #1 mistake"). Unscoped, it
  // tells a wave orchestrator that doing the right thing is the worst thing.
  const redFlag = skill.split('\n').find((l) => l.includes('the #1 mistake'));
  assert.ok(redFlag, 'the #1-mistake Red Flag disappeared');
  assert.match(redFlag, /for \*\*your own\*\* workspace/,
    'the Red Flag must say whose workspace it is about');
});
