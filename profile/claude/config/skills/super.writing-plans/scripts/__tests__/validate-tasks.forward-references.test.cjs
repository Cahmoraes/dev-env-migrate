'use strict';

/**
 * Forward references — a task that imports a symbol a LATER task creates cannot compile when it
 * runs. Mined 2026-09-22 (Copilot CLI, session c68535de → eaef5004): task 2's use cases imported
 * an IoC identifier that task 4 declared under `Create:`; the task-2 review flagged the write-set
 * leak and the controller had to rule on it mid-run. Warning-level: the check is a heuristic over
 * imported names only, and a symbol the repository already exports is a modification, not a
 * forward reference.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/validate-tasks.forward-references.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VALIDATE = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function task(n, code) {
  return [
    `# Task ${n}: Thing ${n}`, '', '**Status:** PENDING', '**PRD:** N/A', '**Spec:** N/A', '**Tier:** standard', '',
    '## Arquivos', '', `- Create: \`src/t${n}.ts\``, '',
    '## Passos', '', '- **Step 1: Write the failing test**', '', '```ts', code, '```', '',
  ].join('\n');
}

function plan(codes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-forward-refs-'));
  const lines = ['# Tarefas: X', '', '---', '', '## Tarefas', ''];
  codes.forEach((_, i) => lines.push(`- [ ] ${i + 1}. Thing ${i + 1} → \`task-0${i + 1}.md\``));
  lines.push('', '## Foco de Revisão', '');
  fs.writeFileSync(path.join(dir, 'tasks-x.md'), lines.join('\n'));
  codes.forEach((code, i) => fs.writeFileSync(path.join(dir, `task-0${i + 1}.md`), task(i + 1, code)));
  return dir;
}

const run = (dir, extra = []) => JSON.parse(execFileSync('node', [VALIDATE, '--tasks-index', path.join(dir, 'tasks-x.md'), ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

test('an import of a symbol first exported by a later task is reported, with both task numbers', () => {
  const dir = plan([
    'export class Thing {}',
    'import { Thing } from "./t1"\nimport { TYPES } from "@/ioc/types"\n@inject(TYPES.Repo) class UseCase {}',
    'x',
    'export const TYPES = { Repo: Symbol.for("Repo") }',
  ]);
  const r = run(dir);
  assert.deepEqual(r.forwardReferences.found, [{ task: 2, symbol: 'TYPES', definedIn: 4 }]);
  assert.ok(r.warnings.some((w) => /task-02 imports `TYPES`, which is first created by task-04/.test(w.message)));
  assert.equal(r.valid, true, 'a warning, never an error');
});

test('backward imports, self-defined symbols and symbols the repository already exports are not reported', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-forward-refs-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'types.ts'), 'export const SHARED = {}\n');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  const dir = plan([
    'import { SHARED } from "@/ioc/types"\nexport function a() {}',
    'import { a } from "./t1"\nimport { Own } from "./self"\nexport interface Own {}',
    'export const SHARED = { more: 1 }',
  ]);
  assert.deepEqual(run(dir).forwardReferences.found, [{ task: 1, symbol: 'SHARED', definedIn: 3 }], 'without the repo it looks forward');
  assert.deepEqual(run(dir, ['--repo-root', repo]).forwardReferences.found, [], 'the repo already exports it: task 3 modifies, not creates');
});
