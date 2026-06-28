'use strict';

/**
 * Tests for generate-slugs.cjs — user-story extraction from a PRD.
 *
 * Regression target: PRDs label stories with an ID marker before "Como"
 * (`- **US-01**: Como ...`, `US-02 — Como ...`). The original regex anchored
 * "Como" right after an optional bullet, so every labeled story failed to parse
 * and the QA gate fell back to manual extraction. Stories must parse with the
 * marker, and the PRD's explicit ID must be preserved for traceability.
 *
 * Run with: node --test super.user-story-verification/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'generate-slugs.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gen-slugs-'));
}

function runJson(prd) {
  const dir = mkdir();
  const prdPath = path.join(dir, 'prd-feature.md');
  fs.writeFileSync(prdPath, prd, 'utf8');
  try {
    const out = execFileSync('node', [SCRIPT, '--prd', prdPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('bare story (no ID marker) parses with sequential id', () => {
  const r = runJson('- Como visitante, eu quero ver a home para que eu entenda o produto\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-001');
  assert.equal(r.userStories[0].role, 'visitante');
  assert.match(r.userStories[0].slug, /^us-001-/);
});

test('bold marker "**US-01**:" before Como parses and preserves the ID', () => {
  const r = runJson('- **US-01**: Como administrador, eu quero gerenciar usuários para que o sistema fique seguro\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.match(r.userStories[0].slug, /^us-01-/);
  // The ID marker is stripped from the story text.
  assert.equal(r.userStories[0].text.startsWith('Como administrador'), true);
});

test('colon-inside-bold "**US-02:**" marker parses', () => {
  const r = runJson('- **US-02:** Como gestor, eu quero exportar relatórios para que eu acompanhe métricas\n');
  assert.equal(r.userStories[0].id, 'US-02');
});

test('em-dash marker "US-03 —" without bullet or bold parses', () => {
  const r = runJson('US-03 — Como cliente, eu quero redefinir senha para que eu recupere acesso\n');
  assert.equal(r.userStories[0].id, 'US-03');
  assert.equal(r.userStories[0].role, 'cliente');
});

test('plain "US-04:" marker parses', () => {
  const r = runJson('US-04: Como suporte, eu quero abrir chamados para que o cliente seja atendido\n');
  assert.equal(r.userStories[0].id, 'US-04');
});

test('mixed labeled and unlabeled — all parse, sequential fallback advances', () => {
  const prd = [
    '## Histórias de Usuário',
    '',
    '- **US-01**: Como administrador, eu quero gerenciar usuários para que o sistema fique seguro',
    '- **US-02:** Como gestor, eu quero exportar relatórios para que eu acompanhe métricas',
    '- US-03 — Como cliente, eu quero redefinir senha para que eu recupere acesso',
    '- Como visitante, eu quero ver a home para que eu entenda o produto',
    '',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 4);
  assert.deepEqual(
    r.userStories.map((s) => s.id),
    ['US-01', 'US-02', 'US-03', 'US-004'],
  );
});

test('legacy HU- prefix is accepted and normalized to canonical US-', () => {
  const r = runJson('- **HU-01**: Como administrador, eu quero gerenciar usuários para que o sistema fique seguro\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01'); // HU-01 normalized → US-01
  assert.match(r.userStories[0].slug, /^us-01-/);
  assert.equal(r.userStories[0].text.startsWith('Como administrador'), true);
});

test('bold title between the ID and "Como" is tolerated (US- prefix)', () => {
  const r = runJson('US-01 — **Navegação visualmente estável** Como usuário autenticado, eu quero estabilidade para que a interface não salte\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].role, 'usuário autenticado');
  // The title is discarded — captured text starts at "Como".
  assert.equal(r.userStories[0].text.startsWith('Como usuário autenticado'), true);
});

test('regression: the exact legacy shape HU-NN — **Título** Como ... parses', () => {
  const r = runJson('HU-03 — **Formulários focados** Como usuário autenticado, eu quero telas reduzidas para que a leitura seja confortável\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-03'); // normalized
  assert.equal(r.userStories[0].text.startsWith('Como usuário autenticado'), true);
});

test('non-story lines (RF, headings) are ignored', () => {
  const prd = [
    '## Funcionalidades Principais',
    '- RF-001: O sistema deve validar o login',
    '### US-01 alguma seção',
    '- **US-01**: Como admin, eu quero entrar para que eu acesse o painel',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
});

test('missing PRD file → found:false, empty list', () => {
  const dir = mkdir();
  try {
    const out = execFileSync('node', [SCRIPT, '--prd', path.join(dir, 'nope.md')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const r = JSON.parse(out);
    assert.equal(r.found, false);
    assert.equal(r.count, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
