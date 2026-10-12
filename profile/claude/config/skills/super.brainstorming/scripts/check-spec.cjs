#!/usr/bin/env node
'use strict';

// check-spec.cjs — mechanical checks on a written design spec, run by the brainstorming
// self-review (step 7) before the spec gate.
//
// The spec's acceptance criteria (`AC-NN`) and invariants (`INV-NN`) are the IDs the plan,
// the tests, the reviewers and the final summary carry. A criterion without WHEN/THEN, an
// invariant without a guarantor, or a migration without its mechanism reaches the plan as
// prose, and prose already failed there: in the AI-DLC comparison (docs/research/
// superpowers-vs-aidlc) the plan redefined a backfill the spec had fixed, while the
// self-review item that should have caught it was in force. So the checks run as code.
//
// IDs are parsed by super.using-superpowers/scripts/lib/spec-ids.cjs, the one parser the
// plan validator and the verification checker share.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  GUARANTORS,
  CATEGORIES,
  MIGRATION_LABELS,
  splitSections,
  parseSpecIds,
  parseMigrationLabels,
  normalizeText,
  routesIn,
  tableCells,
  parseSpecContract,
} = require('../../super.using-superpowers/scripts/lib/spec-ids.cjs');

const HELP = `
check-spec.cjs — Check a design spec's acceptance criteria, invariants, data model, contract, migration block and test database.

Usage:
  node scripts/check-spec.cjs <spec.md> [--no-git]

Prints JSON: { valid, errors[], warnings[], acceptance[], invariants[], migration }.
valid is false when errors is non-empty. Exit code is 0 whenever the spec was read.

  --no-git   Skip the "ID text changed since the previous committed version" warning and the
             check that a path cited by **Banco de teste:** exists in the repository.
`;

// A line of `## Dados e Consistência` that says existing data is migrated or backfilled.
const MIGRATION_SIGNAL = /\bbackfill\b|migra(?:ção|r)\s+(?:de\s+|os\s+)?dados|dados\s+existentes|existing\s+data|data\s+migration|migrate\s+existing/i;
const NEGATION = /(?<!\p{L})(?:sem|nenhum|nenhuma|não há|não existe|without|none|n\/a)(?!\p{L})[^.;:]*$/iu;
const QUANTIFIER = /(?<!\p{L})(no máximo|exatamente|nunca|únic[oa]s?|at most|exactly|never|unique)(?!\p{L})/iu;
// Sections whose "nunca"/"único" is a decision, a scope line or a risk, not a rule of the domain.
const QUANTIFIER_EXEMPT = new Set(['Escopo', 'Decisões Arquiteturais', 'Riscos', 'Rollout e Compatibilidade']);
const CLOSED_LENSES_LABEL = /\*\*Lentes fechadas:\*\*\s*(.*)$/;
// A volume the spec admits it does not have. In the AI-DLC comparison 8/12 specs wrote
// "volume não informado (premissa: …)" on the label instead of asking: the label was filled,
// the fact never was.
const UNKNOWN_VOLUME = /n[ãa]o\s+(?:foi\s+)?(?:informad|medid|conhecid|sabid)|desconhecid|suposi[çc][ãa]o|premissa|unknown|not\s+(?:yet\s+)?(?:known|measured|informed)|assum/i;
const TEST_DB_LABEL = /^\s*(?:[-*+]\s+)?\*\*Banco de teste:\*\*\s*(.*)$/;
const USER_FACT = /(?:fato do usuário|user fact)\s*\([^)]+\)/i;
const USER_FACT_LOOSE = /fato do usuário|user fact/i;
// A backticked repo path: has a slash or a file extension, no spaces (`TEST_DATABASE_URL` is not one).
const BACKTICKED_PATH = /`([^`\s]*(?:\/|\.[A-Za-z0-9]{1,8})[^`\s]*)`/g;

const CONTRACT_LABEL = /^\s*(?:[-*+]\s+)?\*\*(?:Contrato|Contract):\*\*\s*(.*)$/;
const NO_CONTRACT = /^(?:nenhum|nenhuma|none)\b/i;
const STATUS_CODE = /(?<!\d)[1-5]\d\d(?!\d)/;
const MODEL_LABEL = /^\s*(?:[-*+]\s+)?\*\*(?:Modelo|Model):\*\*/;
// A line of `## Dados e Consistência` that says the feature creates a table or a column.
const NEW_SCHEMA = /\bnovas?\s+(?:tabela|coluna)s?\b|\b(?:tabela|coluna)s?\s+novas?\b|\bcria(?:r|mos)?\s+(?:a\s+|uma\s+)?tabela|\badiciona(?:r|mos)?\s+(?:a\s+|uma\s+)?coluna|\bCREATE\s+TABLE\b|\bADD\s+COLUMN\b|\bnew\s+(?:table|column)s?\b/i;
const SCHEMA_NEGATION = /(?<!\p{L})(?:sem|nenhum|nenhuma|não|nao|without|no)(?!\p{L})[^.;:]*$/iu;

// Conditional section → the grilling lens that opens it (grilling.md, "Lenses").
const CONDITIONAL_SECTIONS = Object.freeze({
  'Características Arquiteturais': 'Atributos de qualidade',
  'Fronteiras e Contratos': 'Integração e acoplamento',
  'Dados e Consistência': 'Dados e consistência',
  'Falhas e Erros': 'Falhas',
  'Rollout e Compatibilidade': 'Evolução e rollout',
});

function issue(code, line, message, extra = {}) {
  return { code, line, message, ...extra };
}

/** Split on `,`/`;` outside parentheses: `D2, fato do usuário (Escopo, Dentro)` → 2 parts. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

const ORIGIN_FORMS = [
  /^D\d+$/,
  /^Falhas(?:\s+e\s+Erros)?\s*[:·-]\s*\S/i,
  /^fato do usuário\s*\([^)]+\)$/i,
  /^user fact\s*\([^)]+\)$/i,
  /^corp ref\s+\S+/i,
];

function isValidOriginPart(part) {
  return ORIGIN_FORMS.some((re) => re.test(part));
}

function checkIds(ids, errors) {
  const seen = new Map();
  for (const entry of [...ids.acceptance, ...ids.invariants]) {
    if (!entry.wellFormed) {
      errors.push(issue('id-format', entry.line, `${entry.id}: IDs have exactly two digits (AC-03, INV-12)`, { id: entry.id }));
    }
    if (seen.has(entry.id)) {
      errors.push(issue('id-duplicate', entry.line, `${entry.id} is already defined on line ${seen.get(entry.id)}; IDs are never reused`, { id: entry.id }));
    } else seen.set(entry.id, entry.line);
    if (/\b(?:FR|US)-\d/.test(entry.text)) {
      errors.push(issue('fr-in-definition', entry.line, `${entry.id}: FR-/US- IDs belong to the PRD, never to a spec definition line`, { id: entry.id }));
    }
  }
}

function checkAcceptance(ids, errors) {
  if (ids.owners.AC === null) {
    errors.push(issue('missing-section', null, 'The spec has no `## Testes` section; acceptance criteria live there'));
    return;
  }
  if (ids.acceptance.length === 0) {
    errors.push(issue('no-acceptance-criteria', null, 'No `- AC-NN · WHEN … THEN … (origem: …)` line in `## Testes`; an architectural spec declares its acceptance criteria'));
  }
  for (const ac of ids.acceptance) {
    if (!ac.hasWhenThen) {
      errors.push(issue('ac-missing-when-then', ac.line, `${ac.id}: write the criterion as WHEN <condition> THEN <observable result>`, { id: ac.id }));
    }
    if (ac.origin === null) {
      errors.push(issue('ac-missing-origin', ac.line, `${ac.id}: end the line with (origem: D<n> | Falhas: <falha> | fato do usuário (<o que o usuário disse>) | corp ref <id>)`, { id: ac.id }));
      continue;
    }
    const bad = splitTopLevel(ac.origin).filter((part) => !isValidOriginPart(part));
    if (bad.length > 0) {
      errors.push(issue('ac-invalid-origin', ac.line, `${ac.id}: origin "${bad.join(', ')}" is not D<n>, Falhas: <falha>, fato do usuário (<o que o usuário disse>) or corp ref <id>`, { id: ac.id }));
    }
  }
}

function checkInvariants(ids, errors) {
  for (const inv of ids.invariants) {
    if (inv.cellCount < 4) {
      errors.push(issue('inv-missing-columns', inv.line, `${inv.id}: the row is | INV-NN | enunciado | categoria | garantidor | rede |`, { id: inv.id }));
      continue;
    }
    if (!inv.text) errors.push(issue('inv-missing-statement', inv.line, `${inv.id}: the statement cell is empty`, { id: inv.id }));
    if (!CATEGORIES.includes(inv.category)) {
      errors.push(issue('inv-invalid-category', inv.line, `${inv.id}: category "${inv.categoryCell}" must start with one of ${CATEGORIES.join(', ')}`, { id: inv.id }));
    }
    if (!GUARANTORS.includes(inv.guarantor)) {
      errors.push(issue('inv-invalid-guarantor', inv.line, `${inv.id}: guarantor "${inv.guarantorCell}" must start with one of ${GUARANTORS.join(', ')}`, { id: inv.id }));
    }
    if (!inv.net) {
      errors.push(issue('inv-missing-net', inv.line, `${inv.id}: the net cell is empty; write \`-\` when there is no second layer`, { id: inv.id }));
    }
  }
}

function checkMisplaced(ids, errors, warnings) {
  for (const m of ids.misplaced) {
    if (m.kind === 'INV') {
      errors.push(issue('inv-outside-dados', m.line, `${m.id} is an invariant row outside \`## Dados e Consistência\`. Invariants belong to persisted state: move the table there, or drop it when the feature persists nothing`, { id: m.id }));
      continue;
    }
    const owner = ids.owners[m.kind] || (m.kind === 'AC' ? 'Testes' : 'Dados e Consistência');
    warnings.push(issue('definition-outside-owner', m.line, `${m.id} is shaped as a definition in \`## ${m.section || '(before the first section)'}\`; only \`## ${owner}\` defines ${m.kind} IDs, so this line defines nothing`, { id: m.id }));
  }
}

/** A migration signal not negated by the few words right before it ("sem backfill", "no data migration"). */
function signalsMigration(text) {
  const m = MIGRATION_SIGNAL.exec(text);
  if (!m) return false;
  const before = text.slice(Math.max(0, m.index - 20), m.index);
  return !NEGATION.test(before);
}

/** The migration labels of `## Dados e Consistência`, and the first line that signals a migration. */
function parseMigration(sections) {
  const dados = sections.find((s) => s.name === 'Dados e Consistência');
  if (!dados) return { labels: {}, signalLine: null, present: false };
  const labels = parseMigrationLabels(dados.lines);
  const signal = dados.lines.find(({ text, inFence }) => !inFence && signalsMigration(text));
  return { labels, signalLine: signal ? signal.line : null, present: Object.keys(labels).length > 0 };
}

function checkMigration(migration, errors) {
  const declared = Object.keys(migration.labels);
  if (declared.length === 0 && migration.signalLine === null) return;
  const missing = MIGRATION_LABELS.filter((l) => !declared.includes(l));
  if (missing.length > 0) {
    errors.push(issue('migration-incomplete', migration.signalLine || migration.labels[declared[0]].line,
      `Existing data is migrated but \`## Dados e Consistência\` lacks ${missing.map((l) => `**${l}:**`).join(', ')}`,
      { missing }));
  }
  for (const label of declared) {
    if (!migration.labels[label].text) {
      errors.push(issue('migration-empty-label', migration.labels[label].line, `**${label}:** has no value`));
    }
  }
}

/** A volume label with no number, or one that says the number is unknown or assumed. */
function checkVolume(migration, errors) {
  const volume = migration.labels['Volume e orçamento'];
  if (!volume || !volume.text) return;
  if (USER_FACT_LOOSE.test(volume.text)) return; // the user answered, even "não sei"
  if (/\d/.test(volume.text) && !UNKNOWN_VOLUME.test(volume.text)) return;
  errors.push(issue('migration-volume-unasked', volume.line,
    '**Volume e orçamento:** has no measured number. The volume is a fact only the user holds (or a count the repo can run): ask the user, with your recommended default, before the approval gate, and write the number they give'));
}

/** The `**Banco de teste:**` label of `## Testes`, with wrapped lines joined. */
function parseTestDb(sections) {
  const testes = sections.find((s) => s.name === 'Testes');
  if (!testes) return null;
  let found = null;
  for (const { text, line, inFence } of testes.lines) {
    if (inFence) continue;
    const m = TEST_DB_LABEL.exec(text);
    if (m) { found = { line, text: m[1].trim() }; continue; }
    // A wrapped value continues on the next plain line; an empty label continues nowhere.
    if (found && found.text && text.trim() && !/^\s*(?:[-*+]\s|\*\*|\|)/.test(text) && !found.closed) found.text = `${found.text} ${text.trim()}`;
    else if (found) found.closed = true;
  }
  return found;
}

/**
 * A `db`/`app+lock` invariant or a migration is tested against a real database, and which one
 * (the repo's, a new one, or a query run by hand) is the user's decision: in the AI-DLC
 * comparison 2/3 plans created a test database the user had said they did not want, without
 * asking. The label is sourced by a repo file that already provides it, or by the user's answer.
 */
function checkTestDb(ids, migration, sections, repoRoot, errors) {
  const needs = ids.invariants.filter((i) => i.guarantor === 'db' || i.guarantor === 'app+lock').map((i) => i.id);
  if (needs.length === 0 && !migration.present && migration.signalLine === null) return;
  const what = [...needs, ...(migration.present || migration.signalLine !== null ? ['the migration'] : [])].join(', ');
  if (!sections.some((s) => s.name === 'Testes')) return; // missing-section already says it
  const label = parseTestDb(sections);
  if (!label || !label.text) {
    errors.push(issue('test-db-missing', label ? label.line : null,
      `${what} need a real database to be tested, and \`## Testes\` has no \`**Banco de teste:**\` line. Which one (the repo's test database, a new one, or the query checked by hand) is the user's decision: cite the repo file that provides it, or ask the user and cite the answer as \`fato do usuário (<resposta>)\``, { needs }));
    return;
  }
  if (USER_FACT.test(label.text)) return;
  const paths = [...label.text.matchAll(BACKTICKED_PATH)].map((m) => m[1]);
  if (repoRoot === null) {
    if (paths.length > 0) return;
  } else {
    const existing = paths.filter((p) => fs.existsSync(path.join(repoRoot, p)));
    if (existing.length > 0) return;
  }
  errors.push(issue('test-db-unsourced', label.line,
    `**Banco de teste:** names no repo file that exists today and no \`fato do usuário (…)\`. A test database this spec adds, or none at all, is the user's decision: ask the user, then cite the answer as \`fato do usuário (<resposta>)\``, { needs, paths }));
}

/**
 * A high risk (score 6-9) reaches the plan only through an ID the plan traces (AC-NN, INV-NN) or as
 * a human action the final summary carries. In the AI-DLC comparison 59 of 73 🔴 rows had a prose
 * mitigation, and the plans dropped them.
 */
function checkRisks(sections, errors) {
  const riscos = sections.find((s) => s.name === 'Riscos');
  if (!riscos) return;
  let scoreAt = -1;
  for (const { text, line, inFence } of riscos.lines) {
    if (inFence || !/^\s*\|/.test(text) || /^\s*\|[\s:|-]+\|\s*$/.test(text)) continue;
    const cells = text.split('|').slice(1, -1).map((c) => c.trim());
    if (scoreAt < 0) { scoreAt = cells.findIndex((c) => /^score$/i.test(c)); continue; } // the header row
    const score = cells[scoreAt] || '';
    if (!/🔴/u.test(score) && !(Number((score.match(/\d/) || ['0'])[0]) >= 6)) continue;
    const mitigation = cells[cells.length - 1];
    if (/\b(?:AC|INV)-\d{2}\b/.test(mitigation) || /\((?:ação humana|human action)\s*·|aceito pelo usuário|accepted by the user/i.test(mitigation)) continue;
    errors.push(issue('risk-untraced', line,
      `High risk "${cells[0]}": the mitigation cites no AC-NN/INV-NN the plan will carry, no \`(ação humana · <dono> · <prazo>)\` and no \`aceito pelo usuário\`; name the criterion that tests it, or the human action`));
  }
}

/**
 * A `## Riscos` table with no risk scored 3+ and no mitigation the plan or a person carries is a
 * section nobody acts on. In the plugin-eval A/B of 2026-10-12 the blind judge listed it as
 * ceremony in 6/6 small-change specs.
 */
function checkLowRisks(sections, warnings) {
  const riscos = sections.find((s) => s.name === 'Riscos');
  if (!riscos) return;
  let scoreAt = -1;
  let rows = 0;
  for (const { text, inFence } of riscos.lines) {
    const cells = !inFence && tableCells(text);
    if (!cells) continue;
    if (scoreAt < 0) { scoreAt = cells.findIndex((c) => /^score$/i.test(c)); if (scoreAt < 0) return; continue; }
    rows += 1;
    const score = Number(((cells[scoreAt] || '').match(/\d/) || ['0'])[0]);
    const mitigation = cells[cells.length - 1];
    if (score >= 3 || /🟡|🔴/u.test(cells[scoreAt] || '') || /\b(?:AC|INV)-\d{2}\b|\((?:ação humana|human action)\s*·/i.test(mitigation)) return;
  }
  if (rows > 0) {
    warnings.push(issue('risks-all-low', null, 'Every risk in `## Riscos` scores below 3 and no mitigation is an AC/INV or a human action: drop the section'));
  }
}

function checkQuantifiers(sections, warnings) {
  const hits = [];
  for (const section of sections) {
    if (!section.name || QUANTIFIER_EXEMPT.has(section.name)) continue;
    for (const { text, line, inFence } of section.lines) {
      if (inFence || /^\s*\|\s*(?:\*\*)?INV-\d/.test(text) || /^\s*[-*+]\s+(?:\*\*)?AC-\d/.test(text)) continue;
      if (/\bINV-\d{2}\b/.test(text)) continue;
      const m = QUANTIFIER.exec(text);
      if (m) hits.push({ line, word: m[1], section: section.name });
    }
  }
  if (hits.length === 0) return;
  // One warning for all lines: the fix is the same for each, and a list per line buries the other warnings.
  warnings.push(issue('quantifier-outside-table', hits[0].line,
    `Universal rules stated outside the invariant table (${hits.map((h) => `${h.line} "${h.word}"`).join(', ')}); name each rule as INV-NN with its guarantor, or cite the INV that covers it on that line`,
    { lines: hits.map((h) => h.line) }));
}

function closedLenses(sections) {
  const escopo = sections.find((s) => s.name === 'Escopo');
  if (!escopo) return [];
  for (const { text, inFence } of escopo.lines) {
    const m = !inFence && CLOSED_LENSES_LABEL.exec(text);
    if (m) return splitTopLevel(m[1]).map((item) => item.replace(/\(.*$/, '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function checkClosedLenses(sections, names, warnings) {
  const closed = closedLenses(sections);
  for (const [section, lens] of Object.entries(CONDITIONAL_SECTIONS)) {
    if (names.includes(section)) continue;
    if (closed.includes(lens.toLowerCase()) || closed.includes(section.toLowerCase())) continue;
    warnings.push(issue('closed-lens-undeclared', null, `No \`## ${section}\` and the lens "${lens}" is not in the \`**Lentes fechadas:**\` line of \`## Escopo\`; declare it closed with its reason, or write the section`, { section, lens }));
  }
}

/**
 * The contract of the operations a feature adds or changes. In the AI-DLC comparison (E4) the
 * spec named the routes in 8/8 runs and wrote their payloads, statuses and error mapping in
 * none: the plan decided them per task. A route the spec names is either a row of the
 * `**Contrato:**` table in `## Fronteiras e Contratos` (operation | entrada | saída | erros),
 * or the spec says `**Contrato:** nenhuma operação nova ou alterada (<motivo>)`.
 */
function checkContract(markdown, sections, errors, warnings) {
  const fronteiras = sections.find((s) => s.name === 'Fronteiras e Contratos');
  const escaped = (fronteiras ? fronteiras.lines : []).some(({ text, inFence }) => {
    const label = !inFence && CONTRACT_LABEL.exec(text);
    return label && NO_CONTRACT.test(label[1].trim());
  });
  const rows = parseSpecContract(markdown);
  const contracted = new Set(rows.flatMap((r) => r.routes));
  const named = new Map();
  for (const section of sections) {
    for (const { text, line, inFence } of section.lines) {
      if (inFence) continue;
      for (const route of routesIn(text)) if (!named.has(route)) named.set(route, line);
    }
  }
  if (rows.length === 0) {
    if (named.size === 0 || escaped) return;
    const [first] = named.values();
    errors.push(issue('contract-missing', first,
      `The spec names ${[...named.keys()].join(', ')} and \`## Fronteiras e Contratos\` has no \`**Contrato:**\` table. Write one row per operation this feature adds or changes: | Operação | Entrada | Saída (status e corpo) | Erros (código → status) |. When it only calls or observes them unchanged: \`**Contrato:** nenhuma operação nova ou alterada (<motivo>)\``,
      { routes: [...named.keys()] }));
    return;
  }
  for (const { line, cells, routes } of rows) {
    const label = routes.join(', ');
    if (cells.length < 4) {
      errors.push(issue('contract-row-incomplete', line, `${label}: the row is | operação | entrada | saída | erros |`));
      continue;
    }
    if (!STATUS_CODE.test(cells[2]) && !/sem mudança|unchanged/i.test(cells[2])) {
      errors.push(issue('contract-row-incomplete', line, `${label}: the Saída cell names no success status (\`200 {…}\`, \`201\`, \`204\`)`));
    }
    const errs = cells[cells.length - 1];
    const unmapped = splitTopLevel(errs).filter((part) => part && !STATUS_CODE.test(part) && !/^(?:[—–-]|nenhum|nenhuma|none|sem mudança|unchanged)/i.test(part));
    if (!errs || unmapped.length > 0) {
      errors.push(issue('contract-row-incomplete', line, `${label}: every error in the Erros cell maps to its status (\`CODIGO\` → 409), or the cell says \`nenhum novo\`${unmapped.length ? `; unmapped: ${unmapped.join(', ')}` : ''}`));
    }
  }
  const outside = [...named.keys()].filter((r) => !contracted.has(r));
  if (outside.length > 0) {
    warnings.push(issue('route-outside-contract', named.get(outside[0]),
      `${outside.join(', ')} appear in the spec but not in the \`**Contrato:**\` table; add a row if this feature adds or changes the operation, ignore if it is only referenced`,
      { routes: outside }));
  }
}

/**
 * The persisted model of what the feature creates. In E4 3/6 specs with persistence had no
 * columns, types or constraints, and the database invariants named no constraint: the
 * implementer chose them. A `db` invariant is cited by the `**Modelo:**` row of the
 * constraint that guarantees it; a new table or column has its `**Modelo:**` block.
 */
function checkDataModel(ids, sections, errors) {
  const dados = sections.find((s) => s.name === 'Dados e Consistência');
  if (!dados) return;
  const plain = dados.lines.filter(({ inFence }) => !inFence);
  const hasModel = plain.some(({ text }) => MODEL_LABEL.test(text));
  const cited = new Set();
  for (const { text } of plain) {
    const cells = tableCells(text);
    if (!cells || /^(?:\*\*)?INV-\d/.test(cells[0])) continue;
    for (const m of text.matchAll(/\bINV-\d{2}\b/g)) cited.add(m[0]);
  }
  for (const inv of ids.invariants.filter((i) => i.guarantor === 'db')) {
    if (cited.has(inv.id)) continue;
    errors.push(issue('inv-db-unmodeled', inv.line,
      `${inv.id} is guaranteed by the database, and no \`**Modelo:**\` row names the constraint: write the column with its constraint and the ID (\`UNIQUE · ${inv.id}\`)`, { id: inv.id }));
  }
  if (hasModel) return;
  const signal = plain.find(({ text }) => {
    const m = NEW_SCHEMA.exec(text);
    return m && !SCHEMA_NEGATION.test(text.slice(Math.max(0, m.index - 25), m.index));
  });
  if (signal) {
    errors.push(issue('data-model-missing', signal.line,
      'The feature creates a table or column and `## Dados e Consistência` has no `**Modelo:**` block: | Coluna | Tipo | Nulo | Restrição | for each new table, only the new columns of an existing one'));
  }
}

function checkChangedTexts(ids, previousMarkdown, warnings) {
  if (!previousMarkdown) return;
  const before = parseSpecIds(previousMarkdown);
  const old = new Map([...before.acceptance, ...before.invariants].map((e) => [e.id, e.text]));
  for (const entry of [...ids.acceptance, ...ids.invariants]) {
    if (!old.has(entry.id)) continue;
    if (normalizeText(old.get(entry.id)) !== normalizeText(entry.text)) {
      warnings.push(issue('id-text-changed', entry.line, `${entry.id} changed since the previous committed version; a wording fix keeps the ID, a different rule takes a new ID`, { id: entry.id }));
    }
  }
}

/**
 * Check a spec's text. `previousMarkdown` is the prior committed version (or null).
 * @returns {{ valid: boolean, errors: object[], warnings: object[], acceptance: string[],
 *             invariants: object[], migration: object }}
 */
function checkSpec(markdown, { previousMarkdown = null, repoRoot = null } = {}) {
  const sections = splitSections(markdown);
  const ids = parseSpecIds(markdown);
  const errors = [];
  const warnings = [];
  checkIds(ids, errors);
  checkAcceptance(ids, errors);
  checkInvariants(ids, errors);
  const migration = parseMigration(sections);
  checkMigration(migration, errors);
  checkVolume(migration, errors);
  checkTestDb(ids, migration, sections, repoRoot, errors);
  checkRisks(sections, errors);
  checkContract(markdown, sections, errors, warnings);
  checkLowRisks(sections, warnings);
  checkDataModel(ids, sections, errors);
  checkMisplaced(ids, errors, warnings);
  checkQuantifiers(sections, warnings);
  checkClosedLenses(sections, ids.sections, warnings);
  checkChangedTexts(ids, previousMarkdown, warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    acceptance: ids.acceptance.map((a) => a.id),
    invariants: ids.invariants.map((i) => ({ id: i.id, category: i.category, guarantor: i.guarantor })),
    migration: {
      present: migration.present,
      labels: Object.fromEntries(Object.entries(migration.labels).map(([k, v]) => [k, v.text])),
    },
  };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * The version to compare IDs against: the last committed one when the working copy differs
 * from it, else the one before (step 7 runs right after the spec is committed). Null outside
 * git or when there is no earlier version.
 */
/** The repository root that holds the spec, or null outside git. */
function repoRootOf(specPath) {
  try {
    return git(['rev-parse', '--show-toplevel'], path.dirname(path.resolve(specPath))).trim();
  } catch {
    return null;
  }
}

function previousCommittedVersion(specPath) {
  try {
    const dir = path.dirname(path.resolve(specPath));
    const top = git(['rev-parse', '--show-toplevel'], dir).trim();
    const rel = path.relative(top, path.resolve(specPath)).split(path.sep).join('/');
    const commits = git(['log', '--format=%H', '-n', '2', '--', rel], top).split('\n').filter(Boolean);
    if (commits.length === 0) return null;
    const last = git(['show', `${commits[0]}:${rel}`], top);
    const current = fs.readFileSync(specPath, 'utf8');
    if (last !== current) return last;
    return commits[1] ? git(['show', `${commits[1]}:${rel}`], top) : null;
  } catch {
    return null;
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  const specPath = args.find((a) => !a.startsWith('--'));
  if (!specPath) {
    process.stderr.write(HELP);
    return 1;
  }
  let markdown;
  try {
    markdown = fs.readFileSync(specPath, 'utf8');
  } catch (err) {
    process.stderr.write(`check-spec: cannot read ${specPath}: ${err.message}\n`);
    return 1;
  }
  const previousMarkdown = args.includes('--no-git') ? null : previousCommittedVersion(specPath);
  const repoRoot = args.includes('--no-git') ? null : repoRootOf(specPath);
  const result = { spec: specPath, ...checkSpec(markdown, { previousMarkdown, repoRoot }) };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { checkSpec, previousCommittedVersion, splitTopLevel, MIGRATION_LABELS, CONDITIONAL_SECTIONS };
