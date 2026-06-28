'use strict';

/**
 * Regression test for the bilingual `## Ondas de Execução` / `## Execution Waves` heading.
 *
 * The tasks-template.md emits the Portuguese heading; before the fix the parser only matched
 * the English one and silently fell back to `source:"derived"`, discarding the explicit section.
 *
 * Run with: node --test super.parallel-subagent-development/scripts/__tests__/waves-heading-bilingual.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'parse-waves.cjs');

function buildFixture(wavesHeading) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waves-heading-'));
  const taskFile = (n) => [
    `# Task ${n}: Thing ${n}`,
    '',
    '**Status:** PENDING',
    '**PRD:** N/A',
    '**Spec:** `../specs/x-design.md`',
    '**Depends on:** N/A',
    '',
    '## Passos',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(1));
  fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile(2));
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

function run(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('Portuguese heading "## Ondas de Execução" is parsed as an explicit section (not derived)', () => {
  const result = run(buildFixture('## Ondas de Execução'));
  assert.equal(result.source, 'section');
  assert.deepEqual(result.waves, [[1, 2]]);
  assert.deepEqual(result.waveKinds, ['parallel']);
});

test('English heading "## Execution Waves" still works (backward compatibility)', () => {
  const result = run(buildFixture('## Execution Waves'));
  assert.equal(result.source, 'section');
  assert.deepEqual(result.waves, [[1, 2]]);
});
