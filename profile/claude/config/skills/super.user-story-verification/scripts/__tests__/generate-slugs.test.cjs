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

test('regression: ID and title sharing one bold span, story text on the next physical line', () => {
  // Reproduces the real admin-role-management PRD shape:
  // "**US-01 — Título**\nComo ..." — unlike "US-01 — **Título** Como ...",
  // the closing ** comes AFTER the title, not right after the ID, and the
  // story text is not on the same source line as the marker at all.
  const prd = [
    '**US-01 — Promover membro a administrador**',
    'Como administrador, eu quero promover um membro ativo a administrador para que ele passe a ter acesso ao painel administrativo sem precisar de suporte técnico.',
    '',
    '**US-02 — Remover privilégios de administrador**',
    'Como administrador, eu quero revogar os privilégios de outro administrador para que ele volte a ser membro comum quando não precisar mais de acesso elevado.',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 2);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].text.startsWith('Como administrador, eu quero promover'), true);
  assert.equal(r.userStories[1].id, 'US-02');
  assert.equal(r.userStories[1].text.startsWith('Como administrador, eu quero revogar'), true);
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

test('regression: hard-wrapped story (benefit clause on the next physical line) parses in full', () => {
  // Reproduces the real admin-edit-user-data PRD shape: the sentence wraps at
  // a fixed column, so "para que eu" ends line 1 and the rest of the benefit
  // continues, unmarked, on line 2.
  const prd = [
    '- **US-01** — Como administrador, eu quero editar o nome e o email de um membro para que eu',
    '  possa corrigir cadastros incorretos.',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].benefit, 'eu possa corrigir cadastros incorretos.');
  assert.equal(
    r.userStories[0].text,
    'Como administrador, eu quero editar o nome e o email de um membro para que eu possa corrigir cadastros incorretos.',
  );
});

test('regression: story whose "para que" clause starts entirely on the next physical line', () => {
  const prd = [
    '- **US-02** — Como administrador, eu quero ver o histórico de alterações de um membro',
    '  para que eu possa auditar mudanças feitas por outros administradores.',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-02');
  assert.match(r.userStories[0].text, /auditar mudanças feitas por outros administradores\.$/u);
});

test('wrapped stories separated by blank lines each parse independently, without bleeding into each other', () => {
  const prd = [
    '- **US-01** — Como admin, eu quero editar o nome para que eu',
    '  possa corrigir cadastros.',
    '',
    '- **US-02** — Como admin, eu quero editar o email para que eu',
    '  possa manter contato atualizado.',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 2);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].benefit, 'eu possa corrigir cadastros.');
  assert.equal(r.userStories[1].id, 'US-02');
  assert.equal(r.userStories[1].benefit, 'eu possa manter contato atualizado.');
});

test('a continuation line does not merge past the next list item', () => {
  const prd = [
    '- **US-01** — Como admin, eu quero editar o nome para que eu',
    '- **US-02** — Como admin, eu quero editar o email para que eu possa manter contato atualizado',
  ].join('\n');
  const r = runJson(prd);
  // US-01's line is left as-is (its own bullet is a block start, so US-02's
  // bullet — also a block start — is never merged into it). Its benefit is
  // whatever trailing words the line happens to have ("eu"), same as an
  // un-wrapped truncated line would have parsed before this fix; the point
  // under test is that it does NOT swallow US-02's line.
  assert.equal(r.count, 2);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].benefit, 'eu');
  assert.equal(r.userStories[1].id, 'US-02');
  assert.equal(r.userStories[1].benefit, 'eu possa manter contato atualizado');
});

test('regression: accented Portuguese words are transliterated in the slug, not dropped', () => {
  // Reproduces the real gym-cards-animation PRD: the slug builder used to
  // strip diacritics entirely instead of transliterating them, producing
  // "usurio"/"transio" instead of "usuario"/"transicao".
  const r = runJson('- **US-06** — Como usuário autenticado, eu quero que a transição entre resultados de busca seja suave, para que os cards antigos saiam\n');
  assert.equal(r.userStories[0].slug, 'us-06-usuario-autenticado-que-a-transicao');
});

test('regression: "quero" without a preceding "eu" parses (Como X, quero Y, para que Z)', () => {
  // Reproduces the real admin-user-detail-panel PRD shape — "eu quero" was
  // hard-coded, so this valid Portuguese phrasing (no "eu") matched 0 stories.
  const r = runJson('- **US-01** — Como administrador, quero clicar em um usuário na lista para ver seus detalhes completos, para que eu possa avaliar sua conta sem sair da página.\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].role, 'administrador');
  assert.match(r.userStories[0].want, /^clicar em um usuário/u);
});

test('regression: ID+title header on its own line, story on the next line as a blockquote', () => {
  // Reproduces the real google-social-login PRD shape: "**US-001 — Título**"
  // with nothing else on that line, followed immediately by "> Como ...".
  const prd = [
    '**US-001 — Novo usuário cadastrando-se via Google**',
    '> Como visitante sem conta, eu quero clicar em "Entrar com Google" e ter minha conta criada automaticamente para que eu não precise preencher um formulário de cadastro.',
    '',
    '**US-002 — Usuário existente (Google) fazendo login**',
    '> Como usuário que já me autentiquei com Google anteriormente, eu quero clicar em "Entrar com Google" e acessar minha conta imediatamente para que o login seja rápido e sem fricção.',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 2);
  assert.equal(r.userStories[0].id, 'US-001');
  assert.equal(r.userStories[0].role, 'visitante sem conta');
  assert.equal(r.userStories[1].id, 'US-002');
  assert.match(r.userStories[1].role, /^usuário que já me autentiquei/u);
});

test('a genuine blockquote NOT preceded by an ID-only bold header is left alone (no false merge)', () => {
  const prd = [
    '> Esta é uma citação qualquer, sem relação com histórias de usuário.',
    '- **US-01**: Como admin, eu quero entrar para que eu acesse o painel',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
});

test('regression: auto-generated ID numbers from the max explicit ID, not array position', () => {
  const prd = [
    '- **US-003**: Como admin, eu quero gerenciar usuários para que o sistema fique seguro',
    '- Como visitante, eu quero ver a home para que eu entenda o produto',
    '- **US-001**: Como gestor, eu quero exportar relatórios para que eu acompanhe métricas',
  ].join('\n');
  const r = runJson(prd);
  assert.equal(r.count, 3);
  assert.equal(r.userStories[0].id, 'US-003');
  assert.equal(r.userStories[1].id, 'US-004');
  assert.equal(r.userStories[2].id, 'US-001');
});

test('regression: entire story sentence wrapped in bold parses and strips the markers', () => {
  // Reproduces the real project-f PRD shape: the whole user story is bolded
  // (`**Como ..., eu quero ... para que ...**`). Before the fix this produced
  // 0 matches and forced manual fallback in the QA gate.
  const r = runJson('- **Como cliente, eu quero que meu pagamento seja processado uma única vez para que eu não seja cobrado duplicado.**\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-001');
  assert.equal(r.userStories[0].role, 'cliente');
  assert.equal(r.userStories[0].want, 'que meu pagamento seja processado uma única vez');
  assert.equal(r.userStories[0].benefit, 'eu não seja cobrado duplicado.');
  assert.equal(r.userStories[0].text, 'Como cliente, eu quero que meu pagamento seja processado uma única vez para que eu não seja cobrado duplicado.');
  assert.equal(r.userStories[0].text.includes('**'), false);
});

test('regression: labeled story with title and whole sentence in bold parses', () => {
  const r = runJson('- **US-01 — Processamento idempotente:** **Como cliente, eu quero que meu pagamento seja processado uma única vez para que eu não seja cobrado duplicado.**\n');
  assert.equal(r.count, 1);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.equal(r.userStories[0].role, 'cliente');
  assert.equal(r.userStories[0].text.includes('**'), false);
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
