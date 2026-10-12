'use strict';

/**
 * Tests validate-tasks.cjs — cross-task shared-resource declaration consistency.
 *
 * A named infra resource (queue/table/topic) declared in two task files with contradictory
 * boolean flags (e.g. `durable`) is a runtime break (RabbitMQ PRECONDITION_FAILED). The check
 * flags it as a WARNING (author-blind class pulled one stage before the spec-review lens), and
 * must NOT fire on numeric/string arg divergence (legitimate per-task variation).
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/validate-tasks.shared-resource.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-shared-'));
}

function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function taskFile({ title, body }) {
  return [
    title,
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    '',
    '## Passos',
    '',
    body,
  ].join('\n');
}

function scaffold(taskBodies) {
  const dir = mkdir();
  const indexLines = taskBodies.map((_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `- [ ] ${i + 1}. thing ${i + 1} → \`task-${n}.md\``;
  });
  const index = ['# Tarefas: X', '', '## Tarefas', ...indexLines, ''].join('\n');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, index, 'utf8');
  taskBodies.forEach((body, i) => {
    const n = String(i + 1).padStart(2, '0');
    fs.writeFileSync(
      path.join(dir, `task-${n}.md`),
      taskFile({ title: `# Task ${i + 1}: thing ${i + 1}`, body }),
      'utf8',
    );
  });
  return { dir, indexPath };
}

test('divergent boolean flag on the same resource across tasks → warning, ok:false, still valid', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nawait channel.assertQueue('webhookOutbound', { durable: true });\n```",
    "```ts\nawait channel.assertQueue('webhookOutbound', { durable: false });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, false);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 1);
  assert.equal(r.sharedResourceConsistency.conflicts[0].resource, "assertQueue('webhookOutbound')");
  assert.equal(r.sharedResourceConsistency.conflicts[0].flag, 'durable');
  const warned = r.warnings.some((w) => /divergent durable/.test(w.message));
  assert.ok(warned, 'expected a divergent-durable warning');
  // Warning only — never flips the verdict.
  assert.equal(r.valid, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('same boolean flag value across tasks → no warning, ok:true', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nawait channel.assertQueue('webhookOutbound', { durable: true });\n```",
    "```ts\nawait channel.assertQueue('webhookOutbound', { durable: true });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('numeric-only arg divergence (i18n-like) → no warning (boolean-only heuristic)', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nt('error.count', { count: 1 });\n```",
    "```ts\nt('error.count', { count: 2 });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('distinct resources with divergent flags do not conflict (keyed by fn+name)', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nawait channel.assertQueue('queueA', { durable: true });\n```",
    "```ts\nawait channel.assertQueue('queueB', { durable: false });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('matching flag alongside a divergent one warns only on the divergent flag', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nawait channel.assertQueue('q', { durable: true, exclusive: false });\n```",
    "```ts\nawait channel.assertQueue('q', { durable: false, exclusive: false });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 1);
  assert.equal(r.sharedResourceConsistency.conflicts[0].flag, 'durable');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--index-only skips the shared-resource check', () => {
  const { dir, indexPath } = scaffold([
    "```ts\nawait channel.assertQueue('q', { durable: true });\n```",
    "```ts\nawait channel.assertQueue('q', { durable: false });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath, '--index-only']);
  assert.equal(r.sharedResourceConsistency, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── v2: bareword (const) resource names + omission divergence ──────────────────

test('bareword const resource name: divergent flag across tasks → warning', () => {
  // The resource name is a const identifier (WEBHOOK_QUEUE), not a quoted string. The v1 gate
  // was blind to this shape; v2 keys off the identifier token.
  const { dir, indexPath } = scaffold([
    '```ts\nawait channel.assertQueue(WEBHOOK_QUEUE, { durable: true });\n```',
    '```ts\nawait channel.assertQueue(WEBHOOK_QUEUE, { durable: false });\n```',
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, false);
  assert.equal(r.sharedResourceConsistency.conflicts[0].resource, 'assertQueue(WEBHOOK_QUEUE)');
  assert.equal(r.sharedResourceConsistency.conflicts[0].flag, 'durable');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('omission: infra flag set in one task, resource re-declared bare in another → warning', () => {
  // The exact latent clash the end-to-end sim surfaced: task 1 asserts durable:true, task 2 bare-
  // asserts the SAME queue (no opts → driver default durable:false → PRECONDITION_FAILED at runtime).
  const { dir, indexPath } = scaffold([
    '```ts\nawait channel.assertQueue(WEBHOOK_QUEUE, { durable: true });\n```',
    '```ts\nawait channel.assertQueue(WEBHOOK_QUEUE);\n```',
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, false);
  const c = r.sharedResourceConsistency.conflicts[0];
  assert.equal(c.resource, 'assertQueue(WEBHOOK_QUEUE)');
  assert.equal(c.flag, 'durable');
  assert.equal(c.kind, 'omission');
  const warned = r.warnings.some((w) => /re-declared bare|driver default/i.test(w.message) && /durable/.test(w.message));
  assert.ok(warned, 'expected an omission warning naming durable');
  assert.equal(r.valid, true); // warning only
  fs.rmSync(dir, { recursive: true, force: true });
});

test('omission FP guard: a bare call of a DIFFERENT fn does not trigger (keyed by fn+name)', () => {
  // assertQueue declares durable; consume just references the queue — different declaring fn, so no
  // omission clash. This is the legitimate producer-declares / consumer-references pattern.
  const { dir, indexPath } = scaffold([
    '```ts\nawait channel.assertQueue(WEBHOOK_QUEUE, { durable: true });\n```',
    '```ts\nawait channel.consume(WEBHOOK_QUEUE);\n```',
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('omission FP guard: a non-infra boolean flag omitted does NOT warn', () => {
  // `visible` is not an infra-declaration flag; omitting it is not a runtime hazard, so the curated
  // infra-flag allowlist keeps this quiet (avoids false-positive tyranny).
  const { dir, indexPath } = scaffold([
    "```ts\nrender('widget', { visible: true });\n```",
    "```ts\nrender('widget');\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  assert.equal(r.sharedResourceConsistency.conflicts.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('omission FP guard: a bare declaration with no flagged sibling is ignored', () => {
  // A lone single-arg call (logger.log, t(key)) with no infra-flag sibling of the same key must not
  // manufacture a conflict.
  const { dir, indexPath } = scaffold([
    "```ts\nlogger.log('starting');\n```",
    "```ts\nawait channel.assertQueue(WEBHOOK_QUEUE, { durable: true });\n```",
  ]);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.sharedResourceConsistency.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
