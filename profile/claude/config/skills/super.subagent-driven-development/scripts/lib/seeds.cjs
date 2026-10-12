'use strict';

// seeds.cjs — the pending lines the plan and the spec already know about, written to the ledger
// when execution starts (sdd-start.cjs), so they reach the final summary through the channel
// that already carries every open item (sdd-finish.cjs: a ruling per pending line).
//
//   - an `[unverified]` criterion of a task file   → `Task N: unverified: INV-02 · <reason> · conferência: <query>`
//   - a spec risk marked `(ação humana · <dono> · <prazo>)` → `Task <last>: parked — ação humana: <risk> · <dono> · <prazo>`
//
// In the AI-DLC comparison baseline (docs/research/superpowers-vs-aidlc) a score-9 risk ("confirm
// with the app team that the old client tolerates nulls") became a comment in a test, and a
// production signal never became a task: nothing carried them past the plan. A human action has
// no task of its own, so it is filed under the last task: the feature is not done without it.

const fs = require('fs');
const path = require('path');
const { splitSections } = require('../../../super.using-superpowers/scripts/lib/spec-ids.cjs');
const { resolveSpecPath } = require('../../../super.writing-plans/scripts/spec-trace.cjs');

const TASK_LINE = /^-\s+\[[ xX]\]\s+(\d+)\.\s+.+?\s*(?:→|->)\s*`([^`]+)`\s*$/u;
const CRITERIA_SECTIONS = new Set(['Critérios de Sucesso', 'Criterios de Sucesso', 'Success Criteria']);
const UNVERIFIED = /^\s*[-*+]\s+(?:\*\*)?((?:AC|INV)-\d+)(?:\*\*)?\s*\[unverified\]\s*[·:\-–—]\s*(.*)$/u;
const HUMAN_ACTION = /\(ação humana\s*·\s*([^·()]+?)\s*·\s*([^()]+?)\)/iu;

function tasksOf(indexContent) {
  return indexContent.split(/\r?\n/).map((l) => TASK_LINE.exec(l)).filter(Boolean)
    .map((m) => ({ number: Number(m[1]), file: m[2] }));
}

/** Seed lines for the ledger, in plan order; `[]` when there is nothing to carry. */
function pendingSeeds(tasksIndexPath, repoRoot) {
  const indexContent = fs.readFileSync(tasksIndexPath, 'utf8');
  const indexDir = path.dirname(tasksIndexPath);
  const tasks = tasksOf(indexContent);
  const lines = [];
  for (const task of tasks) {
    let body;
    try { body = fs.readFileSync(path.join(indexDir, task.file), 'utf8'); } catch { continue; }
    const criteria = splitSections(body).find((s) => CRITERIA_SECTIONS.has(s.name));
    for (const { text, inFence } of (criteria ? criteria.lines : [])) {
      const m = !inFence && UNVERIFIED.exec(text);
      if (m) lines.push(`Task ${task.number}: unverified: ${m[1]} · ${m[2].trim()}`);
    }
  }
  const last = tasks.length ? tasks[tasks.length - 1].number : null;
  const { resolved } = resolveSpecPath(indexContent, indexDir, repoRoot);
  if (resolved && last !== null) {
    const riscos = splitSections(fs.readFileSync(resolved, 'utf8')).find((s) => s.name === 'Riscos');
    for (const { text, inFence } of (riscos ? riscos.lines : [])) {
      const m = !inFence && /^\s*\|/.test(text) && HUMAN_ACTION.exec(text);
      if (!m) continue;
      const risk = text.split('|')[1].trim();
      lines.push(`Task ${last}: parked — ação humana: ${risk} · ${m[1].trim()} · ${m[2].trim()}`);
    }
  }
  return lines;
}

module.exports = { pendingSeeds, HUMAN_ACTION };
