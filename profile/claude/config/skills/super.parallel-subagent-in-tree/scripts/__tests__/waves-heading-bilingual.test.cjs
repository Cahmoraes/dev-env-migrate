'use strict';

/**
 * Regression test for the bilingual `## Ondas de Execução` / `## Execution Waves` heading
 * in the `--wave N` section resolver. The tasks-template.md emits the Portuguese heading;
 * before the fix `--wave 1` could not resolve from it (section silently unmatched).
 *
 * Run with: node --test super.parallel-subagent-in-tree/scripts/__tests__/waves-heading-bilingual.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-wave-disjoint.cjs');

function buildFixture(wavesHeading) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waves-disjoint-heading-'));
  const taskFile = (n, file) => [
    `# Task ${n}: Thing ${n}`,
    '',
    '**Status:** PENDING',
    '**Depends on:** N/A',
    '',
    '## Arquivos',
    '',
    `- Criar: \`${file}\``,
    '',
    '## Passos',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(1, 'src/a.ts'));
  fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile(2, 'src/b.ts'));
  const index = [
    '# Tarefas: x',
    '',
    '## Tarefas',
    '',
    '- [ ] 1. Thing one → `task-01.md`',
    '- [ ] 2. Thing two → `task-02.md`',
    '',
    wavesHeading,
    '',
    '- **Wave 1** (parallel): 1, 2',
    '',
  ].join('\n');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, index);
  return indexPath;
}

function runWave(indexPath, wave) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath, '--wave', String(wave)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('--wave resolves from the Portuguese "## Ondas de Execução" heading', () => {
  const result = runWave(buildFixture('## Ondas de Execução'), 1);
  // disjoint write-sets (src/a.ts vs src/b.ts) → safe to parallelize in-tree
  assert.equal(result.safe ?? result.safeForInTreeParallel, true);
});

test('--wave still resolves from the English "## Execution Waves" heading (backward compat)', () => {
  const result = runWave(buildFixture('## Execution Waves'), 1);
  assert.equal(result.safe ?? result.safeForInTreeParallel, true);
});
