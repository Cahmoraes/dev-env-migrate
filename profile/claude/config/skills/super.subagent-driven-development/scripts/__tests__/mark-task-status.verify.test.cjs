'use strict';

/**
 * Tests for mark-task-status.cjs --verify: the suite defines green, not the
 * model's claim. DONE is written only when the verification command exits 0.
 *
 * Run with: node --test super.subagent-driven-development/scripts/__tests__/mark-task-status.verify.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'mark-task-status.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mark-task-verify-'));
}

function runJson(args, opts = {}) {
  return JSON.parse(execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }));
}

const TASK_BODY = [
  '# Task 03: Token refresh endpoint',
  '',
  '**Status:** IN_PROGRESS',
  '**PRD:** ../prd/prd-x.md',
  '**Spec:** ../specs/x-design.md',
  '',
  '## Steps',
  '- [ ] write the test',
].join('\n');

const INDEX_BODY = [
  '# Tasks — feature-x',
  '',
  '## Tarefas',
  '- [ ] 3. Token refresh endpoint [FR-003] → `task-03.md`',
].join('\n');

function fixture() {
  const dir = mkdir();
  const file = path.join(dir, 'task-03.md');
  const index = path.join(dir, 'tasks-feature-x.md');
  fs.writeFileSync(file, TASK_BODY, 'utf8');
  fs.writeFileSync(index, INDEX_BODY, 'utf8');
  return { dir, file, index };
}

test('a failing verification command does NOT mark DONE — file and index untouched', () => {
  const { dir, file, index } = fixture();
  try {
    const out = runJson([
      '--task-file', file, '--tasks-index', index, '--task-number', '3', '--status', 'DONE',
      '--verify', '--', 'node', '-e', 'console.log("1 failing"); process.exit(1)',
    ]);
    assert.equal(out.verify.verified, false);
    assert.equal(out.verify.exitCode, 1);
    assert.equal(out.verify.marked, false);
    assert.equal(out.statusChanged, false);
    assert.equal(out.indexUpdated, false);
    assert.match(out.verify.outputTail, /1 failing/);
    assert.equal(fs.readFileSync(file, 'utf8'), TASK_BODY, 'task file must be byte-identical');
    assert.equal(fs.readFileSync(index, 'utf8'), INDEX_BODY, 'index must be byte-identical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a passing verification command marks DONE and flips the checkbox; the task file gains no Verified line', () => {
  const { dir, file, index } = fixture();
  try {
    const out = runJson([
      '--task-file', file, '--tasks-index', index, '--task-number', '3', '--status', 'DONE',
      '--verify', '--', 'node', '-e', 'console.log("12 passing")',
    ]);
    assert.equal(out.verify.verified, true);
    assert.equal(out.verify.exitCode, 0);
    assert.equal(out.verify.marked, true);
    assert.equal(out.statusChanged, true);
    assert.equal(out.indexUpdated, true);
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /^\*\*Status:\*\* DONE$/m);
    assert.doesNotMatch(content, /\*\*Verified:\*\*/, 'the verdict lives in the JSON verify block, not in the task file');
    assert.match(fs.readFileSync(index, 'utf8'), /^- \[x\] 3\./m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('re-verifying is idempotent on the task file', () => {
  const { dir, file } = fixture();
  try {
    const args = ['--task-file', file, '--status', 'DONE', '--verify', '--', 'node', '-e', 'process.exit(0)'];
    runJson(args);
    runJson(args);
    const content = fs.readFileSync(file, 'utf8');
    assert.equal((content.match(/^\*\*Status:\*\*/gm) || []).length, 1);
    assert.doesNotMatch(content, /\*\*Verified:\*\*/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the child runs without NODE_TEST_CONTEXT, so a nested `node --test` cannot fake green', () => {
  const { dir, file } = fixture();
  try {
    const out = runJson(
      ['--task-file', file, '--status', 'DONE', '--verify', '--', 'node', '-e',
        'process.exit(process.env.NODE_TEST_CONTEXT === undefined ? 0 : 7)'],
      { env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' } },
    );
    assert.equal(out.verify.exitCode, 0, 'NODE_TEST_CONTEXT leaked into the verification child');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a command that cannot be spawned is a failed verification, not a crash', () => {
  const { dir, file } = fixture();
  try {
    const out = runJson(['--task-file', file, '--status', 'DONE', '--verify', '--', 'definitely-not-a-binary-xyz']);
    assert.equal(out.verify.verified, false);
    assert.equal(out.verify.exitCode, null);
    assert.equal(out.verify.marked, false);
    assert.equal(fs.readFileSync(file, 'utf8'), TASK_BODY);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--verify is DONE-only and needs the `--` separator; without --verify the JSON carries verify: null', () => {
  const { dir, file } = fixture();
  try {
    const notDone = spawnSync('node', [SCRIPT, '--task-file', file, '--status', 'IN_PROGRESS', '--verify', '--', 'true'], { encoding: 'utf8' });
    assert.equal(notDone.status, 1);
    assert.match(notDone.stderr, /--verify only applies to --status DONE/);

    const noSeparator = spawnSync('node', [SCRIPT, '--task-file', file, '--status', 'DONE', '--verify', 'true'], { encoding: 'utf8' });
    assert.equal(noSeparator.status, 1);
    assert.match(noSeparator.stderr, /--verify requires/);

    const plain = runJson(['--task-file', file, '--status', 'DONE']);
    assert.equal(plain.verify, null);
    assert.equal(plain.statusChanged, true);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\*\*Verified:\*\*/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── One green run marks a whole batch ──────────────────────────────────────
// A batched dispatch already ran the suite for the batch; asking --verify once per task
// re-ran a full backend suite four times in a real session (11 minutes, a 600 s timeout).
// A comma-separated --task-number runs the command ONCE and marks every listed task.

function batchFixture() {
  const dir = mkdir();
  const index = path.join(dir, 'tasks-feature-x.md');
  const files = {};
  const lines = ['# Tasks — feature-x', '', '## Tarefas'];
  for (const n of [1, 2, 3]) {
    const file = path.join(dir, `task-0${n}.md`);
    fs.writeFileSync(file, TASK_BODY.replace('Task 03', `Task 0${n}`), 'utf8');
    files[n] = file;
    lines.push(`- [ ] ${n}. Step ${n} [FR-00${n}] → \`task-0${n}.md\``);
  }
  fs.writeFileSync(index, lines.join('\n'), 'utf8');
  return { dir, index, files };
}

test('a comma-separated --task-number runs --verify ONCE and marks every task of the batch', () => {
  const { dir, index, files } = batchFixture();
  const counter = path.join(dir, 'runs.txt');
  try {
    const out = runJson([
      '--tasks-index', index, '--task-number', '1,2,3', '--status', 'DONE',
      '--verify', '--', 'node', '-e', `require('fs').appendFileSync(${JSON.stringify(counter)}, 'x')`,
    ]);
    assert.equal(fs.readFileSync(counter, 'utf8'), 'x', 'the verification command must run exactly once for the list');
    assert.equal(out.verify.verified, true);
    assert.equal(out.verify.marked, true);
    assert.equal(out.tasks.length, 3);
    for (const [n, file] of Object.entries(files)) {
      const entry = out.tasks.find((t) => t.taskNumber === Number(n));
      assert.equal(entry.statusChanged, true, `task ${n} status`);
      assert.equal(entry.indexUpdated, true, `task ${n} checkbox`);
      const body = fs.readFileSync(file, 'utf8');
      assert.match(body, /^\*\*Status:\*\* DONE$/m);
      assert.doesNotMatch(body, /\*\*Verified:\*\*/);
    }
    const idx = fs.readFileSync(index, 'utf8');
    assert.equal((idx.match(/- \[x\]/g) || []).length, 3, 'every checkbox flipped in one write');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing --verify over a list marks NONE of the tasks', () => {
  const { dir, index, files } = batchFixture();
  try {
    const out = runJson(['--tasks-index', index, '--task-number', '1,2,3', '--status', 'DONE', '--verify', '--', 'node', '-e', 'process.exit(3)']);
    assert.equal(out.verify.verified, false);
    assert.equal(out.tasks.length, 3);
    assert.ok(out.tasks.every((t) => t.statusChanged === false && t.indexUpdated === false));
    for (const file of Object.values(files)) assert.match(fs.readFileSync(file, 'utf8'), /^\*\*Status:\*\* IN_PROGRESS$/m);
    assert.doesNotMatch(fs.readFileSync(index, 'utf8'), /- \[x\]/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a single --task-number keeps the flat single-task JSON (callers of the old shape are unaffected)', () => {
  const { dir, index } = batchFixture();
  try {
    const out = runJson(['--tasks-index', index, '--task-number', '2', '--status', 'DONE']);
    assert.equal(out.tasks, undefined);
    assert.equal(out.statusChanged, true);
    assert.equal(out.indexUpdated, true);
    assert.match(out.taskFile, /task-02\.md$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a list with a number the index does not know fails before anything is written', () => {
  const { dir, index, files } = batchFixture();
  try {
    const res = spawnSync('node', [SCRIPT, '--tasks-index', index, '--task-number', '1,9', '--status', 'DONE'], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /task 9 not found/);
    assert.match(fs.readFileSync(files[1], 'utf8'), /^\*\*Status:\*\* IN_PROGRESS$/m, 'task 1 must not be marked when task 9 cannot be located');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
