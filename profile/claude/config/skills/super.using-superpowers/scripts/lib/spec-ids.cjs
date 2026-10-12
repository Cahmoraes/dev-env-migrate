'use strict';

// spec-ids.cjs — the ONE parser of the IDs a design spec defines: acceptance criteria (`AC-NN`)
// and invariants (`INV-NN`).
//
// Three scripts read these IDs: check-spec (brainstorming, step 7), validate-tasks (writing-plans,
// coverage and text equality in the owning task) and sdd-start (execution, via lib/seeds.cjs). They key off this module, never off a copy of the regexes: a
// second parser that disagrees on a separator or an owner section turns a defined ID into an
// unseen one, and the gap only shows when a plan silently drops the criterion.
//
// Definition vs. mention. Only a definition line defines an ID:
//   - AC:  a bullet that starts with the ID, in `## Testes`
//          `- AC-03 · WHEN … THEN … (origem: D2)` (separator `·`, `:` or `-`)
//   - INV: a table row whose first cell is the ID, in `## Dados e Consistência`
//          `| INV-02 | enunciado | categoria | garantidor | rede |`
// The same shapes in any other section are reported as `misplaced`, never as definitions. Any
// other occurrence (a column of `## Falhas e Erros`, prose citing `INV-02`) is a mention.
//
// IDs are stable: gaps are allowed, duplicates and reuse are not. This module reports what is
// written; check-spec decides what is an error.

const OWNER_SECTIONS = Object.freeze({
  AC: Object.freeze(['Testes']),
  // Only Dados: a feature with no persisted state has no invariant table. The first version fell
  // back to Testes, and the stateless control scenario of E2 grew a table in 3/3 specs (YAGNI 0).
  INV: Object.freeze(['Dados e Consistência']),
});

const GUARANTORS = Object.freeze(['app', 'app-pure', 'app+lock', 'db']);
const CATEGORIES = Object.freeze(['limit', 'unique', 'preserve', 'idempotent', 'transition', 'roundtrip']);

// `- AC-03 · …`, `* **AC-03**: …`, `- AC-3 - …` (the last is captured so the caller can reject
// the malformed number instead of never seeing the line).
const AC_DEFINITION = /^\s*[-*+]\s+(?:\*\*)?AC-(\d+)(?:\*\*)?\s*[·:\-–—]\s*(.*)$/;
const INV_DEFINITION = /^\s*\|\s*(?:\*\*)?INV-(\d+)(?:\*\*)?\s*\|(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const SECTION = /^##\s+(.+?)\s*#*\s*$/;
const ORIGIN = /\((?:origem|origin)\s*:\s*([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\.?\s*$/i;

/** Level-2 sections of a markdown document, skipping headings inside fenced code. */
function splitSections(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const sections = [];
  let current = { name: null, startLine: 1, lines: [] };
  let inFence = false;
  lines.forEach((text, i) => {
    if (FENCE.test(text)) inFence = !inFence;
    const heading = !inFence && SECTION.exec(text);
    if (heading) {
      sections.push(current);
      current = { name: heading[1].trim(), startLine: i + 1, lines: [] };
      return;
    }
    current.lines.push({ text, line: i + 1, inFence });
  });
  sections.push(current);
  return sections;
}

function sectionNames(markdown) {
  return splitSections(markdown).map((s) => s.name).filter(Boolean);
}

/** The section that owns a kind of ID in this spec, or null when none of its candidates exists. */
function ownerSection(kind, names) {
  return OWNER_SECTIONS[kind].find((candidate) => names.includes(candidate)) || null;
}

function formatId(prefix, digits) {
  return `${prefix}-${digits}`;
}

/** First ASCII token of a table cell: `db (banco)` → `db`, `unique · unicidade` → `unique`. */
function leadingToken(cell) {
  const m = /^\s*(?:`)?([a-z][a-z+-]*)/.exec(cell || '');
  return m ? m[1] : null;
}

function parseOrigin(text) {
  const m = ORIGIN.exec(text);
  return m ? m[1].trim() : null;
}

function parseAcLine(match, line) {
  const digits = match[1];
  const text = match[2].trim();
  const when = text.search(/\bWHEN\b/);
  const then = text.search(/\bTHEN\b/);
  return {
    id: formatId('AC', digits),
    wellFormed: /^\d{2}$/.test(digits),
    line,
    text,
    hasWhenThen: when >= 0 && then > when,
    origin: parseOrigin(text),
  };
}

function parseInvRow(match, line) {
  const digits = match[1];
  // Drop the trailing pipe, then split the remaining cells.
  const cells = match[2].replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const [statement = '', category = '', guarantor = '', net = ''] = cells;
  return {
    id: formatId('INV', digits),
    wellFormed: /^\d{2}$/.test(digits),
    line,
    text: statement,
    category: leadingToken(category),
    categoryCell: category,
    guarantor: leadingToken(guarantor),
    guarantorCell: guarantor,
    net,
    cellCount: cells.length,
  };
}

/**
 * Every AC and INV definition line in a spec.
 * @returns {{ acceptance: object[], invariants: object[], misplaced: object[],
 *             owners: { AC: string|null, INV: string|null }, sections: string[] }}
 */
function parseSpecIds(markdown) {
  const sections = splitSections(markdown);
  const names = sections.map((s) => s.name).filter(Boolean);
  const owners = { AC: ownerSection('AC', names), INV: ownerSection('INV', names) };
  const acceptance = [];
  const invariants = [];
  const misplaced = [];
  for (const section of sections) {
    for (const { text, line, inFence } of section.lines) {
      if (inFence) continue;
      const ac = AC_DEFINITION.exec(text);
      if (ac) {
        const entry = parseAcLine(ac, line);
        if (section.name === owners.AC) acceptance.push(entry);
        else misplaced.push({ kind: 'AC', id: entry.id, line, section: section.name });
        continue;
      }
      const inv = INV_DEFINITION.exec(text);
      if (inv) {
        const entry = parseInvRow(inv, line);
        if (section.name === owners.INV) invariants.push(entry);
        else misplaced.push({ kind: 'INV', id: entry.id, line, section: section.name });
      }
    }
  }
  return { acceptance, invariants, misplaced, owners, sections: names };
}

const MIGRATION_LABELS = Object.freeze(['Mecanismo', 'Volume e orçamento', 'Critério de fim', 'Legado que viola']);
const MIGRATION_LABEL = /^\s*(?:[-*+]\s+)?\*\*(Mecanismo|Volume e orçamento|Critério de fim|Legado que viola):\*\*\s*(.*)$/;

/**
 * The migration labels of a list of section lines (`{ text, line, inFence }`), each with its
 * value; a wrapped line (not a bullet, label or table row) continues the label above it.
 */
function parseMigrationLabels(sectionLines) {
  const labels = {};
  let open = null;
  for (const { text, line, inFence } of sectionLines) {
    if (inFence) { open = null; continue; }
    const m = MIGRATION_LABEL.exec(text);
    if (m) {
      open = m[1];
      labels[open] = { line, text: m[2].trim() };
    } else if (open && text.trim() && !/^\s*(?:[-*+]\s|\*\*|\|)/.test(text)) {
      labels[open].text = `${labels[open].text} ${text.trim()}`.trim();
    } else {
      open = null;
    }
  }
  return labels;
}

/** The migration labels a spec declares in `## Dados e Consistência` ({} when none). */
function parseSpecMigration(markdown) {
  const dados = splitSections(markdown).find((s) => s.name === 'Dados e Consistência');
  return dados ? parseMigrationLabels(dados.lines) : {};
}

// An HTTP operation named in prose or a table: `GET /orders/:id`.
const HTTP_ROUTE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`|),;]*)/g;

/** `GET /orders/{id}.` and `get /orders/:id` are the same operation: `GET /orders/:id`. */
function normalizeRoute(method, routePath) {
  const clean = routePath.replace(/[.:]+$/, '').replace(/\{(\w+)\}/g, ':$1').replace(/\/+$/, '') || '/';
  return `${method.toUpperCase()} ${clean.toLowerCase()}`;
}

/** Every HTTP operation a text names, normalised. */
function routesIn(text) {
  return [...String(text).replace(/`/g, '').matchAll(HTTP_ROUTE)].map((m) => normalizeRoute(m[1], m[2]));
}

/** The cells of a markdown table row; null for a separator or a non-row line. */
function tableCells(text) {
  if (!/^\s*\|/.test(text) || /^\s*\|[\s:|-]+\|\s*$/.test(text)) return null;
  return text.split('|').slice(1, -1).map((c) => c.trim());
}

/** The contract rows of `## Fronteiras e Contratos`: table rows whose first cell names an HTTP operation. */
function parseSpecContract(markdown) {
  const fronteiras = splitSections(markdown).find((s) => s.name === 'Fronteiras e Contratos');
  const rows = [];
  for (const { text, line, inFence } of (fronteiras ? fronteiras.lines : [])) {
    if (inFence) continue;
    const cells = tableCells(text);
    if (!cells || routesIn(cells[0]).length === 0) continue;
    rows.push({ line, cells, routes: routesIn(cells[0]) });
  }
  return rows;
}

/** An AC's criterion without its trailing origin: the text a plan copies. */
function criterionText(acText) {
  return String(acText).replace(ORIGIN, '').trim();
}

/** Normalised text for equality checks across files: whitespace collapsed, trimmed. */
function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

module.exports = {
  routesIn,
  tableCells,
  parseSpecContract,
  OWNER_SECTIONS,
  GUARANTORS,
  CATEGORIES,
  MIGRATION_LABELS,
  AC_DEFINITION,
  INV_DEFINITION,
  splitSections,
  sectionNames,
  parseSpecIds,
  parseOrigin,
  leadingToken,
  normalizeText,
  criterionText,
  parseMigrationLabels,
  parseSpecMigration,
};
