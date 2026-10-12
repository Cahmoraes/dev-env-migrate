/**
 * feature-index.test.cjs — the feature-history index derived from docs/superpowers/.
 *
 * What this file protects: the index IS the recall mechanism now. There is no store behind
 * it, so a parsing miss is not a stale entry that a later sync repairs — it is a feature
 * that is permanently invisible to every brainstorming session in that repo. The extraction
 * order, the heading vocabulary and the empty-repo behaviour are therefore contract, not
 * implementation detail.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/feature-index.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'feature-index.cjs');
const {
  buildIndex, buildIndexWithinBudget, renderMarkdown, parseArgs,
  sectionsOf, leadParagraph, listItems, normalizeHeading, truncate, DEFAULTS,
} = require(SCRIPT);

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feature-index-'));
}

function writeArtifact(root, slug, kind, name, body) {
  const dir = path.join(root, 'docs', 'superpowers', slug, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}

function opts(root, extra = {}) {
  return {
    repoRoot: root,
    detail: 'full',
    format: 'json',
    objectiveChars: DEFAULTS.objectiveChars,
    scopeChars: DEFAULTS.scopeChars,
    maxOutOfScope: DEFAULTS.maxOutOfScope,
    budgetChars: 0,
    featureFilter: null,
    ...extra,
  };
}

const PRD = (name) => `---
created_at: "2026-01-01T00:00:00Z"
---

# PRD: ${name}

## Visão Geral

O painel admin não registra quem alterou dados de um usuário. Esta feature entrega
uma trilha de auditoria consultável.

## Objetivos

- Admin consegue ver o histórico de alterações em menos de 5 segundos

## Fora de Escopo

- Exportação da trilha em CSV
- Retenção configurável de eventos
- Alertas por email em alterações sensíveis
`;

const SPEC = (name) => `# Design: ${name}

## Visão Geral

Camada de auditoria escrita por um decorator no repositório de usuários.

## Fora de Escopo

- Auditoria de leitura (apenas escrita é registrada)
`;

// ─── Extraction primitives ───────────────────────────────────────────────────

test('normalizeHeading folds accents, so `Visão Geral` and `Visao Geral` are one key', () => {
  assert.equal(normalizeHeading('## Visão Geral'), 'visao geral');
  assert.equal(normalizeHeading('Visao Geral'), 'visao geral');
  assert.equal(normalizeHeading('**Fora de Escopo:**'), 'fora de escopo');
});

test('sectionsOf ignores a `## ` that lives inside a fenced code block', () => {
  const sections = sectionsOf([
    '# Doc', '', '## Visão Geral', 'texto real', '', '```md', '## Fora de Escopo', '- fake', '```', '',
  ].join('\n'));
  assert.ok(sections.has('visao geral'));
  assert.ok(!sections.has('fora de escopo'), 'a fenced heading must not open a section');
});

test('a repeated heading answers with its FIRST occurrence, not its last', () => {
  const sections = sectionsOf('## Visão Geral\nprimeira\n\n## Visão Geral\nsegunda\n');
  assert.equal(leadParagraph(sections.get('visao geral')), 'primeira');
});

test('leadParagraph takes prose only — skipping lists, quotes, tables and frontmatter rules', () => {
  const body = ['---', '> nota', '| a | b |', '- item', '', 'a prosa que importa', 'segunda linha', '', 'outro parágrafo'];
  assert.equal(leadParagraph(body), 'a prosa que importa segunda linha');
});

test('listItems flattens dashes, asterisks and numbered items, and drops inline markdown', () => {
  const body = ['- **um** item', '* outro `com código`', '1. terceiro [link](http://x)', 'não é item'];
  assert.deepEqual(listItems(body), ['um item', 'outro com código', 'terceiro link']);
});

test('truncate cuts on a word boundary and marks the cut', () => {
  const out = truncate('palavra outra terceira quarta', 16);
  assert.ok(out.endsWith('…'), `expected an ellipsis marker, got ${out}`);
  assert.ok(out.length <= 17);
  assert.equal(truncate('curto', 40), 'curto');
});

// ─── Objective resolution order ──────────────────────────────────────────────

test('the objective comes from the PRD overview when a PRD exists', () => {
  const root = makeRepo();
  writeArtifact(root, 'audit-trail', 'prd', 'prd-audit-trail.md', PRD('Audit Trail'));
  writeArtifact(root, 'audit-trail', 'specs', 'audit-trail-design.md', SPEC('Audit Trail'));
  const [f] = buildIndex(opts(root)).features;
  assert.equal(f.sources.objective, 'prd:overview');
  assert.match(f.objective, /trilha de auditoria/);
});

test('with no PRD the objective falls back to the spec overview', () => {
  const root = makeRepo();
  writeArtifact(root, 'audit-trail', 'specs', 'audit-trail-design.md', SPEC('Audit Trail'));
  const [f] = buildIndex(opts(root)).features;
  assert.equal(f.sources.objective, 'spec:overview');
  assert.match(f.objective, /decorator/);
});

test('a PRD with no overview section falls through to its Objetivos list', () => {
  const root = makeRepo();
  writeArtifact(root, 'x', 'prd', 'prd-x.md', '# PRD: X\n\n## Objetivos\n\n- Meta única e clara\n');
  const [f] = buildIndex(opts(root)).features;
  assert.equal(f.sources.objective, 'prd:objectives');
  assert.equal(f.objective, 'Meta única e clara');
});

test('a spec with no `## ` sections at all still yields its opening prose', () => {
  const root = makeRepo();
  writeArtifact(root, 'x', 'specs', 'x-design.md', '# Design: X\n\nUma frase solta que descreve a feature.\n');
  const [f] = buildIndex(opts(root)).features;
  assert.equal(f.sources.objective, 'spec:lead');
  assert.match(f.objective, /frase solta/);
});

test('a feature carrying no readable artifact is listed with an empty objective, never dropped', () => {
  const root = makeRepo();
  fs.mkdirSync(path.join(root, 'docs', 'superpowers', 'empty-feature', 'plans'), { recursive: true });
  const index = buildIndex(opts(root));
  assert.equal(index.featureCount, 1);
  assert.equal(index.features[0].slug, 'empty-feature');
  assert.equal(index.features[0].objective, '');
  assert.equal(index.features[0].sources.objective, null);
});

// ─── Out of scope ────────────────────────────────────────────────────────────

test('out of scope comes from the PRD, and the spec is the fallback', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  writeArtifact(root, 'a', 'specs', 'a-design.md', SPEC('A'));
  writeArtifact(root, 'b', 'specs', 'b-design.md', SPEC('B'));
  const { features } = buildIndex(opts(root));
  const [a, b] = features;
  assert.equal(a.sources.outOfScope, 'prd');
  assert.deepEqual(a.outOfScope, [
    'Exportação da trilha em CSV', 'Retenção configurável de eventos', 'Alertas por email em alterações sensíveis',
  ]);
  assert.equal(b.sources.outOfScope, 'spec');
  assert.deepEqual(b.outOfScope, ['Auditoria de leitura (apenas escrita é registrada)']);
});

test('a PRD whose Fora de Escopo only cites the spec falls back to the spec list (prd-template rule)', () => {
  const root = makeRepo();
  const prd = PRD('C').replace(/## Fora de Escopo[\s\S]*$/, '## Fora de Escopo\nAs exclusões da spec valem (## Escopo).\n');
  writeArtifact(root, 'c', 'prd', 'prd-c.md', prd);
  writeArtifact(root, 'c', 'specs', 'c-design.md', SPEC('C'));
  const [c] = buildIndex(opts(root)).features;
  assert.equal(c.sources.outOfScope, 'spec');
  assert.deepEqual(c.outOfScope, ['Auditoria de leitura (apenas escrita é registrada)']);
});

test('an English "Out of Scope" heading is read the same as the pt-BR one', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', '# PRD\n\n## Overview\n\nAlgo.\n\n## Out of Scope\n\n- Nothing else\n');
  const [f] = buildIndex(opts(root)).features;
  assert.equal(f.sources.outOfScope, 'prd');
  assert.deepEqual(f.outOfScope, ['Nothing else']);
});

test('--max-out-of-scope caps the list and flags the payload as truncated', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  const index = buildIndex(opts(root, { maxOutOfScope: 2 }));
  assert.equal(index.features[0].outOfScope.length, 2);
  assert.equal(index.truncated, true);
  assert.equal(buildIndex(opts(root)).truncated, false);
});

// ─── Detail levels ───────────────────────────────────────────────────────────

test('detail levels are nested: slugs carries no objective, brief no out-of-scope', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  const slugs = buildIndex(opts(root, { detail: 'slugs' })).features[0];
  const brief = buildIndex(opts(root, { detail: 'brief' })).features[0];
  const full = buildIndex(opts(root, { detail: 'full' })).features[0];
  assert.equal(slugs.objective, '');
  assert.deepEqual(slugs.outOfScope, []);
  assert.ok(brief.objective.length > 0);
  assert.deepEqual(brief.outOfScope, []);
  assert.ok(full.objective.length > 0);
  assert.ok(full.outOfScope.length > 0);
});

test('`full` is the default detail — the arm that won the retrieval benchmark', () => {
  assert.equal(DEFAULTS.detail, 'full');
  assert.equal(parseArgs(['--repo-root', '/tmp']).detail, 'full');
});

// ─── Artifact flags ──────────────────────────────────────────────────────────

test('artifact flags mark the QA report, and only the QA report, under qa/', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'specs', 'a-design.md', SPEC('A'));
  writeArtifact(root, 'a', 'qa', 'notes.md', '# Notes\n');
  writeArtifact(root, 'b', 'specs', 'b-design.md', SPEC('B'));
  writeArtifact(root, 'b', 'qa', 'qa-report-b.md', '# QA\n');
  const { features } = buildIndex(opts(root));
  assert.deepEqual(features[0].artifacts, { spec: true, prd: false, plan: false, qa: false });
  assert.deepEqual(features[1].artifacts, { spec: true, prd: false, plan: false, qa: true });
});

test('a plans/ directory of task files without the index does not count as a plan', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'plans', 'task-01.md', '# Task 1\n');
  assert.equal(buildIndex(opts(root)).features[0].artifacts.plan, false);
  writeArtifact(root, 'a', 'plans', 'tasks-a.md', '# Index\n');
  assert.equal(buildIndex(opts(root)).features[0].artifacts.plan, true);
});

// ─── Repo-level behaviour ────────────────────────────────────────────────────

test('a repo with no docs/superpowers/ is not an error — it is an empty index', () => {
  const root = makeRepo();
  const index = buildIndex(opts(root));
  assert.equal(index.docsExists, false);
  assert.equal(index.featureCount, 0);
  assert.deepEqual(index.features, []);
  assert.deepEqual(index.warnings, []);
  assert.match(renderMarkdown(index), /no docs\/superpowers\//);
});

test('an existing but empty docs/superpowers/ renders as "none recorded yet"', () => {
  const root = makeRepo();
  fs.mkdirSync(path.join(root, 'docs', 'superpowers'), { recursive: true });
  const index = buildIndex(opts(root));
  assert.equal(index.docsExists, true);
  assert.equal(index.featureCount, 0);
  assert.match(renderMarkdown(index), /none recorded yet/);
});

test('features come out sorted, so the same repo always renders the same block', () => {
  const root = makeRepo();
  for (const slug of ['zebra', 'alpha', 'mid']) writeArtifact(root, slug, 'specs', `${slug}-design.md`, SPEC(slug));
  assert.deepEqual(buildIndex(opts(root)).features.map((f) => f.slug), ['alpha', 'mid', 'zebra']);
});

test('dot-directories under docs/superpowers/ are not features', () => {
  const root = makeRepo();
  writeArtifact(root, 'real', 'specs', 'real-design.md', SPEC('real'));
  fs.mkdirSync(path.join(root, 'docs', 'superpowers', '.cache'), { recursive: true });
  assert.deepEqual(buildIndex(opts(root)).features.map((f) => f.slug), ['real']);
});

test('--feature narrows the report and warns about a slug that is not on disk', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'specs', 'a-design.md', SPEC('A'));
  writeArtifact(root, 'b', 'specs', 'b-design.md', SPEC('B'));
  const index = buildIndex(opts(root, { featureFilter: ['b', 'ghost'] }));
  assert.deepEqual(index.features.map((f) => f.slug), ['b']);
  assert.deepEqual(index.warnings, ['no such feature: ghost']);
});

// ─── Budget ladder ───────────────────────────────────────────────────────────

test('the index degrades down the ladder rather than blowing the budget', () => {
  const root = makeRepo();
  for (let i = 0; i < 40; i += 1) writeArtifact(root, `feature-${String(i).padStart(2, '0')}`, 'prd', `prd-feature-${String(i).padStart(2, '0')}.md`, PRD(`F${i}`));

  const uncapped = buildIndexWithinBudget(opts(root, { budgetChars: 0 }));
  assert.equal(uncapped.degraded, null);
  const uncappedSize = renderMarkdown(uncapped).length;

  const capped = buildIndexWithinBudget(opts(root, { budgetChars: Math.floor(uncappedSize / 2) }));
  assert.ok(capped.degraded, 'a block over budget must report the rung it landed on');
  assert.equal(capped.degraded.from, 'full');
  assert.ok(renderMarkdown(capped).length <= Math.floor(uncappedSize / 2));
  assert.equal(capped.featureCount, 40, 'degrading drops detail, never features');
});

test('a budget nothing can satisfy still emits the slug list — never nothing', () => {
  const root = makeRepo();
  for (let i = 0; i < 30; i += 1) writeArtifact(root, `feature-${i}`, 'prd', `prd-feature-${i}.md`, PRD(`F${i}`));
  const index = buildIndexWithinBudget(opts(root, { budgetChars: 10 }));
  assert.equal(index.detail, 'slugs');
  assert.equal(index.featureCount, 30);
  assert.match(renderMarkdown(index), /feature-0/);
});

test('an explicit --detail slugs is never escalated by a generous budget', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  const index = buildIndexWithinBudget(opts(root, { detail: 'slugs', budgetChars: 999999 }));
  assert.equal(index.detail, 'slugs');
  assert.equal(index.degraded, null);
  assert.equal(index.features[0].objective, '');
});

// ─── CLI contract ────────────────────────────────────────────────────────────

test('a valueless flag does not swallow the next flag as its argument', () => {
  assert.throws(() => parseArgs(['--repo-root', '--detail', 'brief']), /--repo-root requires a value/);
});

test('an invalid --detail or --format is a usage error, not a silent default', () => {
  assert.throws(() => parseArgs(['--detail', 'verbose']), /--detail must be one of/);
  assert.throws(() => parseArgs(['--format', 'yaml']), /--format must be md or json/);
});

test('--budget-chars 0 is valid (disables the cap) while a negative value is not', () => {
  assert.equal(parseArgs(['--budget-chars', '0']).budgetChars, 0);
  assert.throws(() => parseArgs(['--budget-chars', '-1']), /--budget-chars/);
});

test('the CLI exits 0 and prints JSON on stdout even for a repo with nothing to index', () => {
  const root = makeRepo();
  const out = execFileSync('node', [SCRIPT, '--repo-root', root, '--format', 'json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.docsExists, false);
  assert.equal(parsed.featureCount, 0);
});

test('a bad argument exits non-zero — usage failure is the ONE thing the exit code carries', () => {
  const root = makeRepo();
  assert.throws(
    () => execFileSync('node', [SCRIPT, '--repo-root', root, '--detail', 'nope'], { stdio: 'pipe' }),
    (err) => err.status === 1,
  );
});

// ─── Rendered block ──────────────────────────────────────────────────────────

test('the rendered header names where the artifacts live — the passive pointer', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  const md = renderMarkdown(buildIndex(opts(root)));
  assert.match(md, /docs\/superpowers\/<slug>\//);
  assert.match(md, /specs\/, prd\/, plans\/, qa\//);
});

test('the rendered block never prescribes a search procedure', () => {
  const root = makeRepo();
  writeArtifact(root, 'a', 'prd', 'prd-a.md', PRD('A'));
  const md = renderMarkdown(buildIndex(opts(root)));
  for (const verb of [/\bgrep\b/i, /\bls\b/, /\bsearch\b/i, /\bopen the\b/i]) {
    assert.ok(!verb.test(md), `the index must hand over data, not a procedure (matched ${verb})`);
  }
});
