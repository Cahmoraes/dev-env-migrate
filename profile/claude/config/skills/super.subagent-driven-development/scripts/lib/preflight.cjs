'use strict';

// preflight.cjs — the ledger's pre-flight table: the plan scanned for conflicts once, before
// Task 1, as upstream 6.4.1's controller does ("Write the table to the ledger … 'The scan is
// clean' without those rows is not a scan you ran").
//
// Upstream's controller reads the whole plan to build it. Ours never reads task files (SKILL.md,
// Execution Loop), so the rows a script can derive are derived here, from each task file's
// `## Arquivos` manifest and `## Interfaces` `**Consome:**` line:
//
//   - one row per file two or more tasks touch: `conflict` when two tasks Create it, or when a
//     task touches it before the task that Creates it; otherwise `in order` (sequential edits of
//     one file are the normal case in a sequential loop);
//   - one row per task: `conflict` when its `Consome:` names a later task — the implementer reads
//     only its own file and would build on names nothing guarantees exist yet. The index order is
//     the execution order, so an earlier task is always done first.
//
// Whether a task's own tests agree with its own code is semantic: the task reviewer judges it
// (`plan-mandated`), not this table. The controller rules on every `conflict` row before
// dispatching Task 1 and ledgers it as `Pre-flight <row>: Ruling: …`.

const fs = require('fs');
const path = require('path');

const HEADING = '## Pre-flight';
const INDEX_TASK = /^-\s+\[[ xX]\]\s+(\d+)\.\s+.+?\s*(?:→|->)\s*`([^`]+\.md)`/gmu;
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/iu;
const MANIFEST_LINE = /^\s*-\s+(?:\*\*)?([A-Za-zÀ-ú]+)(?:\*\*)?\s*:\s*`([^`]+)`/u;
const CONSUMES = /^\s*-\s+\*\*(?:Consome|Consumes):\*\*\s*(.*)$/iu;
const CREATE = /^(?:create|criar|cria)$/iu;

function readTasks(indexPath) {
  const content = fs.readFileSync(indexPath, 'utf8');
  const tasks = [...content.matchAll(INDEX_TASK)].map((m) => {
    let body = '';
    try { body = fs.readFileSync(path.resolve(path.dirname(indexPath), m[2]), 'utf8'); } catch { /* parse-tasks reports it */ }
    return { number: Number(m[1]), file: m[2], body };
  });
  return tasks.sort((a, b) => a.number - b.number);
}

/** `[{ verb, path }]` from the direct bullets of `## Arquivos` (stops at the next heading). */
function manifest(body) {
  const out = [];
  let inSection = false;
  for (const line of body.split(/\r?\n/u)) {
    if (FILES_SECTION.test(line)) { inSection = true; continue; }
    if (inSection && /^#{2,}\s+/u.test(line)) break;
    if (!inSection) continue;
    const m = line.match(MANIFEST_LINE);
    if (m) out.push({ verb: m[1], path: m[2].trim() });
  }
  return out;
}

const taskRefs = (text) => [...String(text || '').matchAll(/\btask[-\s]?0*(\d+)\b/giu)].map((m) => Number(m[1]));

/** The `**Consome:**` bullet with its wrapped continuation lines (up to the next bullet, heading or blank). */
function consumes(body) {
  const lines = body.split(/\r?\n/u);
  const i = lines.findIndex((l) => CONSUMES.test(l));
  if (i < 0) return '';
  const out = [lines[i].match(CONSUMES)[1]];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim() || /^\s*-\s/u.test(l) || /^#/u.test(l)) break;
    out.push(l.trim());
  }
  return out.join(' ');
}

/** Every row the plan yields, in file then task order. */
function scan(indexPath) {
  const tasks = readTasks(indexPath);
  const byPath = new Map();
  for (const t of tasks) {
    for (const { verb, path: p } of manifest(t.body)) {
      if (!byPath.has(p)) byPath.set(p, []);
      const uses = byPath.get(p);
      if (!uses.some((u) => u.task === t.number && u.verb === verb)) uses.push({ task: t.number, verb });
    }
  }
  const rows = [];
  for (const [p, uses] of byPath) {
    const owners = [...new Set(uses.map((u) => u.task))];
    if (owners.length < 2) continue;
    const creators = [...new Set(uses.filter((u) => CREATE.test(u.verb)).map((u) => u.task))];
    let finding = 'in order';
    if (creators.length > 1) finding = `conflict: created by tasks ${creators.join(' and ')}`;
    else if (creators.length === 1) {
      const early = owners.filter((n) => n < creators[0]);
      if (early.length) finding = `conflict: task ${early.join(', ')} touches it before task ${creators[0]} creates it`;
    }
    rows.push({ id: `F${rows.length + 1}`, subject: `\`${p}\``, tasks: uses.map((u) => `${u.task} ${u.verb}`).join(' · '), finding, involves: owners });
  }
  for (const t of tasks) {
    const consumed = [...new Set(taskRefs(consumes(t.body)))].filter((n) => n !== t.number);
    const later = consumed.filter((n) => n > t.number);
    const finding = later.length ? `conflict: consumes task ${later.join(', ')}, which runs later` : 'ok';
    rows.push({ id: `T${t.number}`, subject: t.file, tasks: 'Consome ↔ order', finding, involves: [t.number, ...consumed] });
  }
  return rows;
}

/** conflict rows; with `done`, only those touching a task not done yet (a resumed plan does not re-rule finished work). */
const flagged = (rows, done = new Set()) => rows.filter((r) => /^conflict:/u.test(r.finding) && (r.involves || []).some((n) => !done.has(n)));

function table(rows) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  return [
    HEADING,
    '',
    'Before Task 1, each `conflict` row gets its ruling line below (execution-loop.md, "Pre-flight table").',
    '',
    '| Row | Subject | Tasks | Finding |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${esc(r.subject)} | ${esc(r.tasks)} | ${esc(r.finding)} |`),
  ].join('\n');
}

/** True once the ledger holds `Pre-flight <id>: Ruling: …` for the row. */
const isRuled = (ledgerContent, id) => new RegExp(`^Pre-flight ${id}:.*\\bRuling:`, 'mu').test(ledgerContent || '');

const hasTable = (ledgerContent) => new RegExp(`^${HEADING}\\s*$`, 'mu').test(ledgerContent || '');

module.exports = { scan, flagged, table, hasTable, isRuled };
