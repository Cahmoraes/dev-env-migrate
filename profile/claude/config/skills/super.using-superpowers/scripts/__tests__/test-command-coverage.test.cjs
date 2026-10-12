#!/usr/bin/env node
'use strict';
/*
 * test-command-coverage.test.cjs — o comando documentado roda TODOS os testes que existem.
 *
 * A checagem é de FORMA, não de arquivo: varre a árvore atrás de todo diretório `__tests__`
 * que guarda `*.test.cjs`, reduz cada um ao glob que o cobre a partir de `skills/`
 * (o curinga de skill seguido de `scripts/__tests__`) e afirma que cada glob aparece nos
 * comandos de suíte inteira. Assim uma árvore inventada amanhã falha aqui, em vez de ficar
 * invisível por anos.
 * (O curinga não é escrito por extenso neste bloco: `super.` + asterisco + barra fecharia o comentário.)
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/test-command-coverage.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SUPERPOWERS = path.resolve(SKILLS, '..');
const DEV_DOC = path.resolve(SUPERPOWERS, 'CLAUDE.md');

const IGNORED_DIRS = new Set(['node_modules', '__pycache__']);

/** Glob (a partir de `skills/`) de todo diretório __tests__ que realmente guarda `*.test.cjs`. */
function collectTestGlobs() {
  const globs = new Set();
  const walk = (dir, rel, toGlob) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (path.basename(dir) === '__tests__' &&
        entries.some((e) => e.isFile() && e.name.endsWith('.test.cjs'))) {
      globs.add(toGlob(rel.split(path.sep).join('/')));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), path.join(rel, entry.name), toGlob);
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), '', (rel) => `super.*/${rel}/*.test.cjs`);
  }
  return [...globs].sort();
}

/** Arquivos `*.test.cjs` em disco: total na árvore e quantos são cross-skill. */
function countTestFiles() {
  let total = 0;
  let crossSkill = 0;
  const walk = (dir, skill) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(abs, skill);
        continue;
      }
      if (!entry.name.endsWith('.test.cjs')) continue;
      total += 1;
      if (skill === 'super.using-superpowers') crossSkill += 1;
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return { total, crossSkill };
}

// Linhas de "suíte inteira" no CLAUDE.md: as que invocam `node --test` com o curinga de
// skill (`super.*/`). O comando de uma skill só nomeia a skill e não é varrido aqui.
// Comentário de linha de propósito: `super.*/` fecharia um bloco `/* */` no `*/`.
function fullSuiteCommands() {
  return fs.readFileSync(DEV_DOC, 'utf8')
    .split('\n')
    .filter((line) => line.includes('node --test') && line.includes('super.*/'));
}

test('a varredura ainda encontra diretórios de teste', () => {
  // Piso anti-staleness: varredura que para de casar reporta zero lacunas para sempre.
  const globs = collectTestGlobs();
  assert.ok(
    globs.length >= 1,
    `esperava ao menos uma árvore de teste (scripts/), achei ${globs.length}: ${globs.join(', ')}`,
  );
});

test('a varredura ainda encontra os comandos de suíte inteira no CLAUDE.md', () => {
  // Segundo piso: se o formato do doc mudar e nenhuma linha casar, o teste abaixo passaria
  // vacuamente sobre zero comandos.
  const commands = fullSuiteCommands();
  assert.ok(
    commands.length >= 2,
    `esperava ao menos dois comandos de suíte inteira (o normal e o SUPERPOWERS_SKIP_E2E), achei ${commands.length}`,
  );
});

test('todo comando de suíte inteira cobre toda árvore de teste que existe em disco', () => {
  const globs = collectTestGlobs();
  const gaps = [];

  for (const command of fullSuiteCommands()) {
    for (const glob of globs) {
      if (!command.includes(glob)) gaps.push(`${glob} — ausente de: ${command.trim()}`);
    }
  }

  assert.deepEqual(
    gaps,
    [],
    'Estes testes existem em disco mas o comando documentado não os roda:\n  ' +
    gaps.join('\n  ') +
    '\n  Acrescente o glob ao comando no artifacts/superpowers/CLAUDE.md.',
  );
});

test('a contagem de arquivos restatada no CLAUDE.md bate com o disco', () => {
  // O número já tinha drifado de 106/35 para 114/38 sem ninguém notar, porque
  // `restated-counts.test.cjs` varre `references/` e este arquivo não mora lá.
  // Contador restatado sem guard volta a drifar; é só questão de quantos commits.
  const doc = fs.readFileSync(DEV_DOC, 'utf8');
  const claim = doc.match(/\*\*(\d+) arquivos[^*]*\*\*[^.]*?(\d+) são cross-skill/);

  assert.ok(claim, 'não achei a linha "**N arquivos, ~M testes**, dos quais K são cross-skill" no CLAUDE.md');

  const disk = countTestFiles();
  assert.deepEqual(
    { total: Number(claim[1]), crossSkill: Number(claim[2]) },
    disk,
    `o CLAUDE.md afirma ${claim[1]} arquivos / ${claim[2]} cross-skill; ` +
    `o disco tem ${disk.total} / ${disk.crossSkill}. Atualize a linha.`,
  );
});
