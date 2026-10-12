'use strict';

// spec-trace.cjs — the plan carries the spec's IDs (validate-tasks.cjs calls it; no flag).
//
// The spec defines acceptance criteria (`AC-NN`), invariants (`INV-NN`) and, when existing data
// moves, a migration block. Each one reaches the plan as a line in `## Critérios de Sucesso` of
// the task that owns it, with the spec's own text:
//
//   - AC-03 [unit]: WHEN … THEN …
//   - INV-02 [db]: <enunciado> · Run: <comando>
//   - **Mecanismo:** <texto da spec>
//   - **Critério de fim:** <texto da spec>
//
// Text equality is the point. In the AI-DLC comparison (docs/research/superpowers-vs-aidlc) the
// spec fixed a batched `INSERT … ON CONFLICT DO NOTHING` backfill and the plan's task ran one
// locked transaction per customer and redefined when it ends, while the self-review item on
// divergent mechanisms was in force. A copy the validator compares cannot drift in silence.
//
// The spec is found through the index's `**Spec:**` line. No spec, or a spec with no AC: a
// warning says the trace is off, never an error (the error for a spec without AC is check-spec's).

const fs = require('fs');
const path = require('path');
const {
  splitSections,
  parseSpecIds,
  parseSpecMigration,
  criterionText,
  normalizeText,
  routesIn,
  parseSpecContract,
} = require('../../super.using-superpowers/scripts/lib/spec-ids.cjs');

const LEVELS = Object.freeze(['unit', 'int', 'db', 'unverified']);
const CRITERIA_SECTIONS = new Set(['Critérios de Sucesso', 'Criterios de Sucesso', 'Success Criteria']);
const REVIEW_FOCUS_SECTIONS = new Set(['Foco de Revisão', 'Foco de Revisao', 'Review Focus']);
const TRACED_LABELS = Object.freeze(['Mecanismo', 'Critério de fim']);

const SPEC_FIELD = /^\*\*Spec:\*\*\s*`?([^`\s]+)`?/mu;
// `- AC-03 [unit]: texto` / `- INV-02 [db]: texto · Run: cmd`. The token is captured loosely so a
// wrong one is reported, not skipped.
const ID_LINE = /^\s*[-*+]\s+(?:\*\*)?((?:AC|INV)-\d+)(?:\*\*)?\s*(?:\[([^\]]*)\])?\s*[·:\-–—]\s*(.*)$/u;
const LABEL_LINE = /^\s*[-*+]\s+\*\*(Mecanismo|Critério de fim):\*\*\s*(.*)$/u;
const ID_IN_TITLE = /\b(?:AC|INV)-\d{2}\b/u;
// Level by guarantor: what the database or a lock guarantees is proven against a real database,
// or declared unverified with the query that checks it by hand. A fake that re-implements a
// unique index passed green in the AI-DLC comparison baseline (2/3 plans + 1 partial).
const DB_GUARANTORS = new Set(['db', 'app+lock']);
const DB_LEVELS = new Set(['db', 'int']);
// A suite that skips itself when an env var is missing is green on a machine with no database.
const ENV_SKIP = /(?:process\.env\.[A-Z_]+[^\n]{0,40}\?\s*(?:describe|it|test)\s*:\s*(?:describe|it|test)\.skip|(?:describe|it|test)\.skipIf|\.skip\(\s*!?\s*process\.env|skipif\([^)]*environ|t\.Skip\(|@EnabledIfEnvironmentVariable|@DisabledIfEnvironmentVariable)/u;

/** The spec path the index declares, resolved against the index dir, then the repo root. */
function resolveSpecPath(indexContent, indexDir, repoRoot) {
  const m = SPEC_FIELD.exec(indexContent);
  if (!m) return { declared: null, resolved: null };
  const declared = m[1];
  const candidates = path.isAbsolute(declared)
    ? [declared]
    : [path.resolve(indexDir, declared), repoRoot && path.resolve(repoRoot, declared)].filter(Boolean);
  return { declared, resolved: candidates.find((p) => fs.existsSync(p)) || null };
}

/** The lines of one task body's `## Critérios de Sucesso` (with line numbers). */
function criteriaLines(body) {
  const section = splitSections(body).find((s) => CRITERIA_SECTIONS.has(s.name));
  return section ? section.lines.filter((l) => !l.inFence) : [];
}

/** Task numbers the index's `## Foco de Revisão` lines name. */
function reviewFocusOwners(indexContent) {
  const section = splitSections(indexContent).find((s) => REVIEW_FOCUS_SECTIONS.has(s.name));
  const owners = new Set();
  if (!section) return owners;
  for (const { text } of section.lines) {
    for (const m of text.matchAll(/task-0*(\d+)/giu)) owners.add(Number.parseInt(m[1], 10));
  }
  return owners;
}

/** The plan line's criterion text: everything before the first ` · ` (Run:, reason, conferência). */
function planText(text) {
  return text.split(/\s+·\s+/u)[0].trim();
}

/** The Run: command's file targets appear elsewhere in the task (the test file its steps write). */
function runTargetInTask(body, rest) {
  const run = /·\s+Run:\s*(.*)$/u.exec(rest);
  if (!run) return false;
  const targets = run[1].replace(/`/g, '').split(/\s+/).filter((t) => /[\w-]\.[a-z]{1,5}$|\//u.test(t) && /[./]/.test(t));
  if (targets.length === 0) return false;
  const outside = splitSections(body).filter((s) => !CRITERIA_SECTIONS.has(s.name))
    .flatMap((s) => s.lines.map((l) => l.text)).join('\n');
  return targets.some((t) => outside.includes(t) || outside.includes(path.basename(t)));
}

function testNameCarriesId(body, id) {
  const [prefix, digits] = id.split('-');
  const outside = splitSections(body).filter((s) => !CRITERIA_SECTIONS.has(s.name))
    .flatMap((s) => s.lines.map((l) => l.text)).join('\n');
  return new RegExp(`${prefix}[-_]?${digits}(?!\\d)`, 'iu').test(outside);
}

/**
 * F5 (pilot, never an error): an INV on pure logic (`app-pure`) is where a property test pays, so
 * its owning task carries a `Property: INV-NN` step with a `Sabotage:` line the implementer
 * runs as a mutant in the TDD MUTATE step.
 */
function checkProperties(ids, owners, parsedTasks, bodies, warnings) {
  const byNumber = new Map(parsedTasks.map((t) => [t.taskNumber, t]));
  for (const inv of ids.invariants.filter((i) => i.guarantor === 'app-pure')) {
    for (const n of owners.get(inv.id) || []) {
      const entry = bodies.get(n);
      if (!entry || !entry.body || !byNumber.has(n)) continue;
      const file = path.basename(entry.filePath);
      const step = new RegExp(`Property:\\s*\\**\\s*${inv.id}\\b`, 'u');
      if (!step.test(entry.body)) {
        warnings.push({ line: 0, message: `${file}: ${inv.id} is guaranteed by pure logic (app-pure) and the task has no \`Property: ${inv.id}\` step — required-task-step-pattern.md, "Property tasks".` });
      } else if (!/\bSabotage:/u.test(entry.body)) {
        warnings.push({ line: 0, message: `${file}: the \`Property: ${inv.id}\` step has no \`Sabotage:\` line — the change that breaks the rule, which the implementer runs as a mutant in the TDD MUTATE step.` });
      }
    }
  }
}

/**
 * F4: a spec risk scored 6-9 is carried by a task that cites it (its text in the task file) or
 * marked `(ação humana · <dono> · <prazo>)` in its mitigation, which the SDD ledger then carries.
 */
function checkHighRisks(spec, parsedTasks, bodies, warnings) {
  const riscos = splitSections(spec).find((s) => s.name === 'Riscos');
  if (!riscos) return;
  const allBodies = [...bodies.values()].map((e) => normalizeText(e.body || '').toLowerCase()).join('\n');
  for (const { text, line, inFence } of riscos.lines) {
    if (inFence || !/^\s*\|/.test(text) || /^\s*\|[\s-:|]+\|\s*$/.test(text)) continue;
    const cells = text.split('|').slice(1, -1).map((c) => c.trim());
    const score = cells.map((c) => /^(\d)\b/.exec(c)).filter(Boolean).map((m) => Number(m[1])).find((n) => n >= 6);
    if (!score || /\(ação humana\s*·/iu.test(text)) continue;
    const risk = cells[0];
    if (risk && !allBodies.includes(normalizeText(risk).toLowerCase())) {
      warnings.push({ line, message: `Spec risk "${risk}" (score ${score}) is in no task. Cite it in the task that carries its mitigation (\`Risco: ${risk}\`), or mark its mitigation \`(ação humana · <dono> · <prazo>)\` in the spec.` });
    }
  }
}

/**
 * The spec's contract reaches the task that builds each operation: the row (operation, payload,
 * success status, errors → status) is copied into that task file. In the AI-DLC comparison (E2)
 * route, payload and error decisions were taken inside the tasks, 4-6 per plan.
 */
function checkContractCarried(spec, bodies, warnings) {
  const carried = new Set([...bodies.values()].flatMap((e) => routesIn(e.body || '')));
  for (const { line, cells, routes } of parseSpecContract(spec)) {
    const missing = routes.filter((r) => !carried.has(r));
    if (missing.length === 0) continue;
    warnings.push({ line, message: `Spec contract operation ${missing.join(', ')} is in no task. Copy its row (\`| ${cells.join(' | ')} |\`) into the task that implements it.` });
  }
}

/** Index lines carry only the title and FR tags (in the task file); an AC/INV there is an error. */
function checkIndexTitles(parsedTasks, errors) {
  for (const task of parsedTasks) {
    if (ID_IN_TITLE.test(task.rawTitle)) {
      errors.push({
        line: task.lineNumber,
        message: `Task ${task.taskNumber}'s index line carries a spec ID (${task.rawTitle.match(ID_IN_TITLE)[0]}). AC/INV IDs go in the owning task file's \`## Critérios de Sucesso\` (\`- AC-NN [unit]: <texto da spec>\`); the index line is \`- [ ] N. <title> → \`task-NN.md\`\`.`,
      });
    }
  }
}

/**
 * Trace the spec's AC/INV and migration block into the plan's task files.
 * @param {{ indexContent: string, indexDir: string, parsedTasks: object[], bodies: Map|null, repoRoot?: string }} input
 */
function validateSpecTrace({ indexContent, indexDir, parsedTasks, bodies, repoRoot }, errors, warnings) {
  checkIndexTitles(parsedTasks, errors);
  const { declared, resolved } = resolveSpecPath(indexContent, indexDir, repoRoot);
  const result = { checked: false, spec: resolved || declared, acceptance: [], invariants: [], missing: [], unverified: [], migration: null };
  if (!bodies) return result; // --index-only: the task files are not read
  if (!resolved) {
    warnings.push({ line: 0, message: `Spec ${declared ? `\`${declared}\` not found` : 'not declared (no **Spec:** line)'}: the AC/INV trace is off for this plan.` });
    return result;
  }
  const spec = fs.readFileSync(resolved, 'utf8');
  checkContractCarried(spec, bodies, warnings);
  const ids = parseSpecIds(spec);
  const migration = parseSpecMigration(spec);
  const tracedLabels = TRACED_LABELS.filter((l) => migration[l]);
  if (ids.acceptance.length === 0) {
    warnings.push({ line: 0, message: `The spec declares no AC-NN: the acceptance-criteria trace is off for this plan${ids.invariants.length ? ' (its INV are still traced)' : ''}.` });
  }
  if (ids.acceptance.length === 0 && ids.invariants.length === 0 && tracedLabels.length === 0) return result;
  result.checked = true;

  const guarantorOf = new Map(ids.invariants.map((i) => [i.id, i.guarantor]));
  const specText = new Map([
    ...ids.acceptance.map((a) => [a.id, criterionText(a.text)]),
    ...ids.invariants.map((i) => [i.id, i.text]),
  ]);
  const owners = new Map(); // id → [taskNumber]
  const labelOwners = new Map(); // label → [taskNumber]

  for (const task of parsedTasks) {
    const entry = bodies.get(task.taskNumber);
    if (!entry || !entry.body) continue;
    const file = path.basename(entry.filePath);
    for (const { text, line } of criteriaLines(entry.body)) {
      const label = LABEL_LINE.exec(text);
      if (label) {
        const [, name, value] = label;
        if (!migration[name]) continue;
        if (normalizeText(value) !== normalizeText(migration[name].text)) {
          errors.push({ line, message: `${file}: **${name}:** differs from the spec (line ${migration[name].line}). Copy the spec's text verbatim; a different mechanism or end criterion is a spec change, not a plan choice.` });
        }
        labelOwners.set(name, [...(labelOwners.get(name) || []), task.taskNumber]);
        continue;
      }
      const m = ID_LINE.exec(text);
      if (!m) continue;
      const [, id, level, rest] = m;
      if (!specText.has(id)) {
        errors.push({ line, message: `${file}: ${id} is not defined in the spec. A plan never coins an AC/INV; cite the spec's IDs only.` });
        continue;
      }
      if (level === undefined || !LEVELS.includes(level.trim())) {
        errors.push({ line, message: `${file}: ${id} needs a level token right after the ID — one of ${LEVELS.map((l) => `[${l}]`).join(', ')} (\`- ${id} [unit]: <texto da spec>\`).` });
      }
      if (normalizeText(planText(rest)) !== normalizeText(specText.get(id))) {
        errors.push({ line, message: `${file}: ${id}'s text differs from the spec. Copy it verbatim (without the origin): "${specText.get(id)}".` });
      }
      owners.set(id, [...(owners.get(id) || []), task.taskNumber]);
      const lvl = level && level.trim();
      if (lvl === 'unverified') {
        result.unverified.push({ id, task: task.taskNumber, text: planText(rest) });
        if (!/conferência:|conferencia:|check:/iu.test(rest)) {
          errors.push({ line, message: `${file}: ${id} [unverified] needs its reason and \`conferência: <consulta>\` — the query a person runs to check it, which the ledger carries to the final summary.` });
        }
      } else if (DB_GUARANTORS.has(guarantorOf.get(id))) {
        if (!DB_LEVELS.has(lvl) || !/·\s+Run:\s*\S/u.test(rest)) {
          errors.push({ line, message: `${file}: ${id} is guaranteed by \`${guarantorOf.get(id)}\`; prove it with a test against a real database — \`[db]\` or \`[int]\` with \` · Run: <comando>\` — or declare \`[unverified]\` with the reason and \`conferência: <consulta>\`. A fake or a test of the SQL text never covers it.` });
        } else if (!runTargetInTask(entry.body, rest)) {
          errors.push({ line, message: `${file}: ${id}'s Run: names no test file this task writes; point it at the integration test the task's steps create.` });
        }
      }
      if (DB_LEVELS.has(lvl) && ENV_SKIP.test(entry.body)) {
        warnings.push({ line, message: `${file}: ${id} is [${lvl}] but the task's tests skip themselves when an env var is missing — on a machine without the database the suite is green without running. Fail instead of skipping, or declare [unverified].` });
      }
      if (level && level.trim() !== 'unverified' && !testNameCarriesId(entry.body, id)) {
        warnings.push({ line, message: `${file}: no test in the task names ${id}. Put the ID in the test case's name or description (e.g. \`${id} …\` or \`test_${id.toLowerCase().replace('-', '')}_…\`) so a failure points back to the spec.` });
      }
    }
  }

  for (const id of specText.keys()) {
    if (!owners.has(id)) {
      result.missing.push(id);
      errors.push({ line: 0, message: `Spec ${id} is in no task's \`## Critérios de Sucesso\`. Add \`- ${id} [<nível>]: <texto da spec>\` to the task that makes it true.` });
    }
  }

  if (tracedLabels.length > 0) {
    const focus = reviewFocusOwners(indexContent);
    const taskOwners = [...new Set(tracedLabels.flatMap((l) => labelOwners.get(l) || []))];
    for (const name of tracedLabels) {
      if (!labelOwners.has(name)) {
        errors.push({ line: 0, message: `The spec's migration **${name}:** is in no task's \`## Critérios de Sucesso\`. Copy \`- **${name}:** <texto da spec>\` into the task that runs the migration.` });
      }
    }
    if (taskOwners.length > 0 && !taskOwners.some((n) => focus.has(n))) {
      errors.push({ line: 0, message: `No \`## Foco de Revisão\` line names the migration's task (task-${String(taskOwners[0]).padStart(2, '0')}). Add one whose Review Focus test asserts the unit of work of **Mecanismo:** (e.g. one transaction per batch), not only the end state.` });
    }
    result.migration = { labels: tracedLabels, owners: taskOwners, reviewFocus: taskOwners.some((n) => focus.has(n)) };
  }

  checkHighRisks(spec, parsedTasks, bodies, warnings);
  checkProperties(ids, owners, parsedTasks, bodies, warnings);

  result.acceptance = ids.acceptance.map((a) => ({ id: a.id, owners: owners.get(a.id) || [] }));
  result.invariants = ids.invariants.map((i) => ({ id: i.id, guarantor: i.guarantor, owners: owners.get(i.id) || [] }));
  return result;
}

module.exports = { validateSpecTrace, resolveSpecPath, LEVELS };
