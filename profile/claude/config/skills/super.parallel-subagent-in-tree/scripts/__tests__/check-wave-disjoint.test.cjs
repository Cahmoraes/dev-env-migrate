'use strict';

/**
 * Tests for check-wave-disjoint.cjs — the deterministic pre-flight gate for the
 * in-tree (no-worktree) parallel execution mode.
 *
 * Without worktree isolation, parallel implementers share one working tree, so
 * the ONLY thing that makes concurrency safe is that no two tasks in the wave
 * WRITE the same file. The orchestrator must not eyeball this. This script reads
 * each task's `## Arquivos` section from the plan, builds each task's write-set
 * (Create/Modify/Test paths), and reports any pairwise write overlap — purely
 * from the plan, before any subagent runs.
 *
 * Run with: node --test super.parallel-subagent-in-tree/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-wave-disjoint.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-wave-disjoint-'));
}

function run(indexPath, args) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/** A task file body with an arbitrary `## Arquivos` block. `arquivos` is an
 *  array of strings like 'Create: `src/a.ts`'. Omit for no Arquivos section. */
function taskFile({ depends = 'N/A', arquivos } = {}) {
  const head = [
    '# Task: thing',
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    `**Depends on:** ${depends}`,
    '',
  ];
  if (arquivos) {
    head.push('## Arquivos');
    for (const a of arquivos) head.push(`- ${a}`);
    head.push('');
  }
  head.push('## Passos');
  return head.join('\n');
}

function build(dir, tasks) {
  const lines = tasks.map((t) => `- [ ] ${t.n}. ${t.title || 'Task'} → \`task-0${t.n}.md\``);
  const index = ['# Tarefas: X', '', '## Tarefas', ...lines, ''].join('\n');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, index, 'utf8');
  for (const t of tasks) {
    fs.writeFileSync(path.join(dir, `task-0${t.n}.md`), t.body, 'utf8');
  }
  return indexPath;
}

test('disjoint write-sets → safe for in-tree parallel, no overlaps', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`', 'Test: `src/a.test.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/b.ts`', 'Test: `src/b.test.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, true);
    assert.deepEqual(r.writeOverlaps, []);
    assert.deepEqual(r.unverifiable, []);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/a.test.ts', 'src/a.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('one task READS a file another task WRITES → read-after-write hazard, NOT safe', () => {
  const dir = mkdir();
  try {
    // Disjoint WRITE-sets (no write∩write), but task 2 reads what task 1 creates.
    // In a shared tree with no ordering, task 2 may read src/user.ts before task 1
    // writes it — a stale read the old write-only check missed.
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/user.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/profile.ts`', 'Read: `src/user.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, false);
    assert.deepEqual(r.writeOverlaps, []); // not a write∩write corruption
    assert.equal(r.readWriteHazards.length, 1);
    assert.deepEqual(r.readWriteHazards[0].tasks, [1, 2]);
    assert.deepEqual(r.readWriteHazards[0].files, ['src/user.ts']);
    assert.ok(r.reasons.some((s) => /stale read/i.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shared read-only mockup in a ### Fidelidade Visual subsection is NOT a write conflict', () => {
  const dir = mkdir();
  try {
    // Two UI tasks with DISJOINT real manifests that BOTH reference the same curated mockup
    // in a `### Fidelidade Visual` subsection (and import aliases in `### Conformidade`). The
    // file manifest is only the direct bullets under `## Arquivos`; the `###` subsections are
    // guidance prose. Scanning them once classified the shared read-only mockup as a write in
    // every UI task, producing a false write∩write conflict that wrongly serialized
    // otherwise-disjoint parallel tasks. This guards that regression.
    const visualBody = (file) => [
      '# Task: ui thing',
      '',
      '**Status:** PENDING',
      '**Spec:** `../specs/x-design.md`',
      '**Depends on:** N/A',
      '',
      '## Arquivos',
      `- Create: \`src/${file}.tsx\``,
      `- Test: \`src/${file}.test.tsx\``,
      '',
      '### Conformidade com as Skills Padrão',
      '- `shadcn`: importar `Button` de `@/components/ui/button`',
      '- `tailwindcss`: aplicar `bg-accent` no wrapper',
      '',
      '### Fidelidade Visual',
      '- **Mockup de referência:** `../specs/mockups/x-visual.md` (Section 1)',
      '',
      '## Passos',
    ].join('\n');
    const index = build(dir, [
      { n: 1, body: visualBody('container') },
      { n: 2, body: visualBody('more-actions-menu') },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, true);
    assert.deepEqual(r.writeOverlaps, []);
    assert.deepEqual(r.readWriteHazards, []);
    const t1 = r.tasks.find((t) => t.number === 1);
    const t2 = r.tasks.find((t) => t.number === 2);
    // The mockup path and the `@/components/ui/button` alias from the ### subsections must
    // NOT pollute the write-set: only the direct `## Arquivos` bullets count.
    assert.deepEqual(t1.writeSet, ['src/container.test.tsx', 'src/container.tsx']);
    assert.deepEqual(t2.writeSet, ['src/more-actions-menu.test.tsx', 'src/more-actions-menu.tsx']);
    assert.ok(!t1.writeSet.some((p) => p.includes('mockup') || p.includes('@/')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reading a file NO sibling writes is safe (no false hazard)', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`', 'Read: `src/config.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/b.ts`', 'Read: `src/config.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, true);
    assert.deepEqual(r.readWriteHazards, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('multiple backticked paths on one Arquivos line are all captured (no missed overlap)', () => {
  const dir = mkdir();
  try {
    // The OLD non-global regex captured only the FIRST path per line, so a collision on
    // the second file ("src/shared.ts") slipped through as "safe" → parallel corruption.
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Modify: `src/a.ts` and `src/shared.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Modify: `src/shared.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/a.ts', 'src/shared.ts']);
    assert.equal(r.safeForInTreeParallel, false);
    assert.equal(r.writeOverlaps.length, 1);
    assert.deepEqual(r.writeOverlaps[0].files, ['src/shared.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown verb is treated as a WRITE, not a READ (conservative classification)', () => {
  const dir = mkdir();
  try {
    // "Editar"/"Implementar" are not in the read-verb allowlist. The OLD policy defaulted
    // any non-write-allowlisted verb to a READ, so two tasks editing the same file looked
    // disjoint. The conservative policy treats an unknown verb as a write.
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Editar: `src/x.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Implementar: `src/x.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/x.ts']);
    assert.equal(r.safeForInTreeParallel, false);
    assert.equal(r.writeOverlaps.length, 1);
    assert.deepEqual(r.writeOverlaps[0].files, ['src/x.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two tasks Modify the same file → write overlap, NOT safe', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Modify: `src/shared.ts`', 'Create: `src/a.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Modify: `src/shared.ts`', 'Create: `src/b.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, false);
    assert.equal(r.writeOverlaps.length, 1);
    assert.deepEqual(r.writeOverlaps[0].tasks, [1, 2]);
    assert.deepEqual(r.writeOverlaps[0].files, ['src/shared.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a task with no ## Arquivos section is unverifiable → NOT safe', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`'] }) },
      { n: 2, body: taskFile() }, // no Arquivos section
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, false);
    assert.deepEqual(r.unverifiable, [2]);
    assert.ok(r.reasons.some((s) => /task 2/i.test(s) && /arquivos|write-set/i.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shared READ (different verb) is not a write collision → safe', () => {
  const dir = mkdir();
  try {
    // Both reference src/config.ts, but neither writes it (Read:). Their writes are disjoint.
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Read: `src/config.ts`', 'Create: `src/a.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Read: `src/config.ts`', 'Create: `src/b.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    assert.equal(r.safeForInTreeParallel, true);
    assert.deepEqual(r.writeOverlaps, []);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/a.ts']);
    assert.deepEqual(t1.readSet, ['src/config.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('single-task selection → trivially safe (nothing to collide with)', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`'] }) }]);
    const r = run(index, ['--tasks', '1']);
    assert.equal(r.safeForInTreeParallel, true);
    assert.deepEqual(r.writeOverlaps, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('three tasks, only one pair overlaps → that pair flagged, still NOT safe', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`', 'Modify: `src/shared.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/b.ts`'] }) },
      { n: 3, body: taskFile({ arquivos: ['Modify: `src/shared.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2,3']);
    assert.equal(r.safeForInTreeParallel, false);
    // Only the 1&3 pair collides on src/shared.ts; 2 is disjoint from both.
    assert.equal(r.writeOverlaps.length, 1);
    assert.deepEqual(r.writeOverlaps[0].tasks, [1, 3]);
    assert.deepEqual(r.writeOverlaps[0].files, ['src/shared.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pt-BR write verbs (Criar/Modificar) classify as writes and collide', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['Criar: `src/a.ts`', 'Modificar: `src/shared.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Modificar: `src/shared.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/a.ts', 'src/shared.ts']);
    assert.equal(r.writeOverlaps.length, 1);
    assert.deepEqual(r.writeOverlaps[0].files, ['src/shared.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bare path with no verb is treated conservatively as a write', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ arquivos: ['`src/shared.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/shared.ts`'] }) },
    ]);
    const r = run(index, ['--tasks', '1,2']);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.deepEqual(t1.writeSet, ['src/shared.ts'], 'bare path counts as a write');
    assert.equal(r.writeOverlaps.length, 1, 'so it collides with task 2');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--wave for a wave absent from the section exits with an error', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`'] }) }]);
    // No ## Execution Waves section at all → --wave cannot resolve.
    assert.throws(
      () => execFileSync('node', [SCRIPT, '--tasks-index', index, '--wave', '2'], { stdio: ['ignore', 'pipe', 'pipe'] }),
      /Wave 2 not found|Execution Waves/u,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('passing both --tasks and --wave is a usage error', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`'] }) }]);
    assert.throws(
      () => execFileSync('node', [SCRIPT, '--tasks-index', index, '--tasks', '1', '--wave', '1'], { stdio: ['ignore', 'pipe', 'pipe'] }),
      /only one of --tasks or --wave/u,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--wave N resolves the wave from the ## Execution Waves section', () => {
  const dir = mkdir();
  try {
    const tasks = [
      { n: 1, body: taskFile({ arquivos: ['Create: `src/a.ts`'] }) },
      { n: 2, body: taskFile({ arquivos: ['Create: `src/b.ts`'] }) },
      { n: 3, body: taskFile({ depends: '1, 2', arquivos: ['Modify: `src/a.ts`'] }) },
    ];
    const lines = tasks.map((t) => `- [ ] ${t.n}. Task → \`task-0${t.n}.md\``);
    const index = [
      '# Tarefas: X', '', '## Tarefas', ...lines, '',
      '## Execution Waves', '',
      '- **Wave 1** (parallel): task-01, task-02',
      '- **Wave 2** (sequential): task-03',
      '',
    ].join('\n');
    const indexPath = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(indexPath, index, 'utf8');
    for (const t of tasks) fs.writeFileSync(path.join(dir, `task-0${t.n}.md`), t.body, 'utf8');

    const r = run(indexPath, ['--wave', '1']);
    assert.deepEqual(r.tasks.map((t) => t.number), [1, 2]);
    assert.equal(r.safeForInTreeParallel, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
