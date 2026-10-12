#!/usr/bin/env node
'use strict';

// sdd-finish.cjs — the final stage's bookkeeping in one call: the done-state gate (gate 3), the
// ledger's rulings and deferred lines for the user (gate 4), the deletion of the ledger and of the
// plan's workspace and, under auto_commit, the commit of the tracker edits the loop left in the
// plans directory.
//
// Why one script: in S11's E-O3 (2026-09-22) the controller spent eight Bash calls between the
// final fix round and the finishing skill's menu: the done-state gate twice, the ledger read, its
// `git rm`, then `git status`, `git diff` and `git commit` for the checkbox/Status edits that
// mark-task-status.cjs had written and nobody committed. The gate still runs parse-tasks.cjs, so
// the verdict is the one that script owns.
//
// The workspace (`.superpowers/sdd/<feature>/`: the ledger, rendered prompts, task-N-report.md,
// review packages, final-review findings) is the loop's scratch, as upstream 6.4.1's, which runs
// `rm -rf <workspace>` once the final review is clean. Nothing reads it after gate 3 — the final
// review and QA fix rounds all ran before — and it was left behind at ~15 files per feature.
//
// Usage: node sdd-finish.cjs --tasks-index <path> [--repo-root <path>]
// Output (stdout JSON, exit 0): { allDone, open, rulings, deferred, pending, summary, summaryFile,
//   ledgerRemoved, workspaceRemoved, trackerCommit, dirty, errors }. `summary` is the run's record
//   for the user, rendered from ledger lines and git alone — nothing in it is written by a model
//   after the fact. It is also written to `summaryFile` (`.superpowers/sdd/<feature>-summary.md`,
//   beside the deleted workspace): the finishing skill prints it in the turn the user's final
//   message is written. Handed over from this JSON instead, it reached the user several tool calls
//   later rewritten from memory — translated, merged, each ruling's cost dropped (2026-09-23). allDone:false, or no `Final review: dispatched` ledger line →
//   nothing was touched (ledger and workspace stay for the fix). Exit 1
//   only on a usage error.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { loadPreferences } = require('../../super.using-superpowers/scripts/read-preferences.cjs');
const ledger = require('./lib/ledger.cjs');
const { parseTasks, assertionReasons } = require('./parse-tasks.cjs');

const HELP = `sdd-finish.cjs — done-state gate + rulings + ledger and workspace deletion + tracker commit, in one call.

  --tasks-index <path>   Required.
  --repo-root <path>     Default: git toplevel of the index.
`;

function usage(message) {
  process.stderr.write(`Error: ${message}\n\n${HELP}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const flags = { '--tasks-index': 'tasksIndex', '--repo-root': 'repoRoot' };
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = flags[args[i]];
    if (!key) usage(`Unknown argument: ${args[i]}`);
    if (args[i + 1] == null) usage(`${args[i]} requires a value`);
    opts[key] = args[++i];
  }
  if (!opts.tasksIndex) usage('--tasks-index <path> is required');
  opts.tasksIndex = path.resolve(opts.tasksIndex);
  if (!opts.repoRoot) opts.repoRoot = git(path.dirname(opts.tasksIndex), 'rev-parse', '--show-toplevel') || process.cwd();
  return opts;
}

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  } catch {
    return null;
  }
}

/** parse-tasks.cjs --assert-all-done, in process: its result, plus the reasons on a failed gate. */
function doneState(opts) {
  let parsed;
  try {
    ({ result: parsed } = parseTasks({ indexPath: opts.tasksIndex, repoRoot: opts.repoRoot }));
  } catch (err) {
    return { error: String(err.message).trim().split('\n')[0] };
  }
  if (!parsed.found) return { allDone: false, open: [`Assertion failed (--assert-all-done): tasks index not found at ${parsed.indexPath}`] };
  const open = assertionReasons(parsed);
  if (open.length) return { allDone: false, open };
  return { allDone: true, open: [], tasks: [...parsed.completed, ...parsed.inProgress, ...parsed.pending] };
}

/** Paths `git status` reports, NUL-separated so no path is quoted; a rename's source is skipped. */
function changedPaths(repoRoot) {
  const tokens = (git(repoRoot, 'status', '--porcelain', '-z', '--untracked-files=all') || '').split('\0');
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!tokens[i]) continue;
    paths.push(tokens[i].slice(3));
    if (/^[RC]/.test(tokens[i])) i += 1;
  }
  return paths;
}

function main() {
  const opts = parseArgs(process.argv);
  const plansDir = path.dirname(opts.tasksIndex);
  const ledgerFile = ledger.ledgerPathFor(plansDir, opts.repoRoot);
  const out = { allDone: false, open: [], rulings: [], deferred: [], pending: [], summary: null, summaryFile: null, ledgerRemoved: false, workspaceRemoved: false, trackerCommit: null, dirty: [], errors: [] };

  const gate = doneState(opts);
  if (gate.error) {
    out.errors.push(`done-state gate did not run: ${gate.error}`);
    return print(out);
  }
  out.allDone = gate.allDone;
  out.open = gate.open;
  if (!out.allDone) return print(out);

  const lines = (ledger.readLedger(ledgerFile) || '').split(/\r?\n/u)
    .filter((l) => l.trim() && !l.startsWith('#'));
  out.rulings = lines.filter((l) => l.includes('Ruling:'));
  out.deferred = lines.filter((l) => isPending(l) && /^[^:]+: minor \(deferred\)/u.test(l));
  out.pending = lines.filter((l, i) => isPending(l) && !closedBy(lines, i));

  // Gate 1 is not optional: build-task-dispatch.cjs --role final ledgers its render, and without
  // that line nothing is deleted (a real run, 2026-09-22, skipped the final review entirely).
  if (!lines.some((l) => l.startsWith('Final review: dispatched'))) {
    const build = path.join(__dirname, 'build-task-dispatch.cjs');
    out.errors.push(`final code review never dispatched — run \`node ${build} --role final --tasks-index ${opts.tasksIndex} --platform <platform>\`, dispatch its prompt at the model it returns, fix its findings, then run sdd-finish.cjs again (final-stage.md, gate 1). Nothing was deleted.`);
    return print(out);
  }

  // A task's pending line is ledgered mid-loop; the work after it (later tasks, the final fix
  // rounds) often settles it. A real run (2026-09-24) listed 49 items as left to do, most of them
  // fixed later, because no ruling said so. So each one needs a ruling after it, closed or kept
  // open, before the summary can call it open — the script cannot tell a settled item from one
  // nobody checked.
  const unsettled = lines.filter((l, i) => pendingKey(l) && !settledBy(lines, i));
  if (unsettled.length) {
    out.errors.push(`${unsettled.length} ledger item(s) left open by a task and never checked against the finished branch — nothing was deleted. For each task and kind below, check its items against the branch as it stands now and append ONE ruling to ${ledgerFile}: \`Final review: Ruling: Task N <kind> closed — <evidence it is settled> — <cost if wrong>\` when all are settled, or \`Final review: Ruling: Task N <kind> open — <why> — <cost>\` when none is. Partly settled: the \`closed\` ruling, then only the still-open part as a new \`Task N: <minor (deferred)|unverified|parked>: …\` line, then an \`open\` ruling — a ruling covers the lines above it, so the summary lists only what is really open. Then run sdd-finish.cjs again. Unchecked:\n${unsettled.map((l) => `  ${l}`).join('\n')}`);
    return print(out);
  }

  // Unverified by decision (a plan criterion declared [unverified] with its check query): no
  // test proves it, so no ruling can close it — it reaches the summary as open, with the query.
  const forcedClosed = lines.filter((l, i) => /^Task \d+: unverified: .*conferência:/u.test(l) && closedBy(lines, i));
  if (forcedClosed.length) {
    out.errors.push(`${forcedClosed.length} item(s) unverified by decision were ruled closed — nothing was deleted. No test proves them, so the ruling is \`open\` and the summary carries the check query to the user; append \`Final review: Ruling: Task N unverified open — unverified by decision — <cost>\` after them and run sdd-finish.cjs again:\n${forcedClosed.map((l) => `  ${l}`).join('\n')}`);
    return print(out);
  }

  // The ledger lives in the workspace and goes with it.
  const hadLedger = fs.existsSync(ledgerFile);

  const workspace = ledger.workspacePathFor(opts.repoRoot, plansDir);
  fs.rmSync(workspace, { recursive: true, force: true });
  out.workspaceRemoved = !fs.existsSync(workspace);
  if (!out.workspaceRemoved) out.errors.push(`could not delete ${workspace}`);
  out.ledgerRemoved = hadLedger && !fs.existsSync(ledgerFile);
  if (hadLedger && !out.ledgerRemoved) out.errors.push(`could not delete the ledger ${ledgerFile}`);

  const { result } = loadPreferences(opts.repoRoot);
  const autoCommit = Boolean(result.preferences.workflow && result.preferences.workflow.auto_commit);
  const relPlans = path.relative(opts.repoRoot, plansDir) || '.';
  const dirty = changedPaths(opts.repoRoot);
  const inPlans = (p) => p === relPlans || p.startsWith(`${relPlans}/`);
  out.dirty = dirty.filter((p) => !inPlans(p));
  if (autoCommit && dirty.some(inPlans)) {
    const feature = ledger.featureNameFor(plansDir);
    git(opts.repoRoot, 'add', '-A', '--', relPlans);
    const committed = git(opts.repoRoot, 'commit', '-q', '-m', `chore(${feature}): marcar tasks como concluídas`, '--', relPlans);
    if (committed === null) out.errors.push('tracker commit failed — commit the plans directory before finishing');
    else out.trackerCommit = git(opts.repoRoot, 'rev-parse', '--short=7', 'HEAD');
  }
  out.summary = renderSummary(lines, out, gate.tasks, ledger.featureNameFor(plansDir), planInPortuguese(opts.tasksIndex));
  const summaryFile = `${workspace}-summary.md`;
  try {
    fs.writeFileSync(summaryFile, `${out.summary}\n`, 'utf8');
    out.summaryFile = summaryFile;
  } catch (e) {
    out.errors.push(`could not write ${summaryFile}: ${e.message}`);
  }
  return print(out);
}

/** Left for the user: what no review round and no ruling closed. A `declined` line is not one:
 * the final review judges each and the controller's ruling on it is in `rulings`. */
function isPending(l) {
  return !l.includes('Ruling:') && /^[^:]+: (?:minor \(deferred\)|unverified\b|parked\b)/u.test(l);
}

/** A pending line's `Task N` and kind; null for any other line. */
function pendingKey(l) {
  const m = /^Task (\d+): (minor|unverified|parked)\b/u.exec(l);
  return m && { task: m[1], kind: m[2] };
}

/** A ruling's verdict on `Task N <kind>` lines: `{ task, kind, closed }`, or null when it names none.
 * Only the ruling's first clause is read, so a "closed" in the why closes nothing; a first clause
 * without "closed" ("stays deferred", "open") keeps the lines open, and says someone checked. */
function verdict(r) {
  if (!r.includes('Ruling:')) return null;
  const what = r.slice(r.indexOf('Ruling:') + 'Ruling:'.length).split(' — ')[0].trim();
  const m = /^Task (\d+) (minor|unverified|parked)\b/iu.exec(what);
  return m && { task: m[1], kind: m[2].toLowerCase(), closed: /\bclosed\b/iu.test(what) };
}

/** The rulings after line `i` of `lines` that name its task and kind. A ruling covers only the
 * lines above it, so the still-open part of a partly settled item, ledgered again after its
 * `closed` ruling, stays open. */
function rulingsOn(lines, i) {
  const key = pendingKey(lines[i]);
  if (!key) return [];
  return lines.slice(i + 1).map(verdict).filter((v) => v && v.task === key.task && v.kind === key.kind);
}

/** `Final review: Ruling: Task N <kind> … closed — why — cost` settles the `Task N: <kind>` lines
 * above it: a real run (2026-09-23) closed both Task 5 unverified items that way and the summary
 * still listed them as left to do. */
function closedBy(lines, i) {
  return rulingsOn(lines, i).some((v) => v.closed);
}

/** Checked against the finished branch: a ruling after the line, closing it or keeping it open. */
function settledBy(lines, i) {
  return rulingsOn(lines, i).length > 0;
}

/** Loop bookkeeping the summary does not repeat: the pre-flight table, `started` markers,
 * `declined` lines and per-task fix rounds (each task's `complete` line already counts them).
 * `Final review: dispatched` stays — it is the one line that proves the final review ran. */
function isDone(l) {
  if (l.startsWith('|') || l.startsWith('Before Task 1') || l.includes('Ruling:') || isPending(l)) return false;
  return !/^Task \d+: (started|fix round|declined)\b/u.test(l);
}

function planInPortuguese(tasksIndex) {
  try { return /^##\s+Tarefas\b/mu.test(fs.readFileSync(tasksIndex, 'utf8')); } catch { return false; }
}

/** The user reads outcomes, not the loop's labels: "review clean" left them unsure what was
 * clean (2026-09-23), and a model translating "parked" wrote "adiado", another meaning. The note
 * vocabulary is SKILL.md's (`review clean | R fix rounds | K parked`), so the script words it; a
 * note outside it is kept as written. */
const WORDS = {
  pt: {
    title: (f) => `Resumo da execução: ${f}`, done: 'O que foi feito', tracker: 'Commit do tracker',
    rulings: 'Decisões que tomei', noRulings: 'Nenhuma decisão registrada.', todo: 'O que falta fazer', noTodo: 'Nada pendente.',
    finalReview: 'Revisão final', finalDone: 'Revisão final do branch inteiro: feita',
    finalClean: 'sem problemas que exigissem correção',
    approved: 'aprovada', firstReview: 'aprovada na 1ª revisão',
    afterRounds: (n) => `aprovada após ${n} ${n === 1 ? 'rodada' : 'rodadas'} de correção`,
    withRounds: (n) => `com ${n} ${n === 1 ? 'rodada' : 'rodadas'} de correção`,
    minorLater: (n) => `${n} ${n === 1 ? 'ajuste menor ficou' : 'ajustes menores ficaram'} para depois (ver "O que falta fazer")`,
    kept: (n) => `${n} ${n === 1 ? 'apontamento mantido' : 'apontamentos mantidos'} por decisão (ver "Decisões que tomei")`,
    unverified: (n) => `${n} ${n === 1 ? 'ponto não verificado foi' : 'pontos não verificados foram'} para a revisão final`,
    closedIn: (n, k) => `, que ${n === 1 ? 'o' : 'os'} encerrou (ver ${k.length === 1 ? 'decisão' : 'decisões'} ${k.join(', ')})`,
    minorClosed: (n, k) => `${n} ${n === 1 ? 'ajuste menor ficou' : 'ajustes menores ficaram'} para depois; a revisão final ${n === 1 ? 'o' : 'os'} encerrou (ver ${k.length === 1 ? 'decisão' : 'decisões'} ${k.join(', ')})`,
    kind: { minor: 'Ajuste menor', unverified: 'Não verificado', parked: 'Em aberto após o limite de revisões' },
  },
  en: {
    title: (f) => `Run summary: ${f}`, done: 'What was done', tracker: 'Tracker commit',
    rulings: 'Rulings I made', noRulings: 'No ruling recorded.', todo: 'What is left to do', noTodo: 'Nothing pending.',
    finalReview: 'Final review', finalDone: 'Final review of the whole branch: done',
    finalClean: 'nothing needed fixing',
    approved: 'approved', firstReview: 'approved on the first review',
    afterRounds: (n) => `approved after ${n} ${n === 1 ? 'fix round' : 'fix rounds'}`,
    withRounds: (n) => `with ${n} ${n === 1 ? 'fix round' : 'fix rounds'}`,
    minorLater: (n) => `${n} ${n === 1 ? 'minor fix' : 'minor fixes'} left for later (see "What is left to do")`,
    kept: (n) => `${n} ${n === 1 ? 'finding' : 'findings'} kept by a ruling (see "Rulings I made")`,
    unverified: (n) => `${n} unverified ${n === 1 ? 'item' : 'items'} handed to the final review`,
    closedIn: (n, k) => `, which closed ${n === 1 ? 'it' : 'them'} (see ${k.length === 1 ? 'ruling' : 'rulings'} ${k.join(', ')})`,
    minorClosed: (n, k) => `${n} ${n === 1 ? 'minor fix' : 'minor fixes'} left for later; the final review closed ${n === 1 ? 'it' : 'them'} (see ${k.length === 1 ? 'ruling' : 'rulings'} ${k.join(', ')})`,
    kind: { minor: 'Minor fix', unverified: 'Unverified', parked: 'Open after the review cap' },
  },
};

/** `Task N` stays; `Final review` is worded in the plan's language. */
function origin(o, w) {
  return o === 'Final review' ? w.finalReview : o;
}

/** `<origin>: Ruling: <text>` → `{ from, text, line }`, words unchanged. */
function ruling(l) {
  const at = l.indexOf('Ruling:');
  return { from: l.slice(0, at).replace(/[\s:—-]+$/u, ''), text: l.slice(at + 'Ruling:'.length).trim(), line: l };
}

/** Rulings grouped by origin, groups in order of first appearance, ledger order inside each: four
 * "Revisão final —" prefixes in a row read as noise (2026-09-23). Numbering runs across groups. */
function groupRulings(lines) {
  const groups = new Map();
  for (const r of lines.map(ruling)) {
    if (!groups.has(r.from)) groups.set(r.from, []);
    groups.get(r.from).push(r);
  }
  return [...groups.values()];
}

/** A group of one keeps its origin inline; a larger group gets the origin once, as a label. */
function renderRulings(groups, w) {
  const out = [];
  let n = 0;
  for (const g of groups) {
    const label = g[0].from ? `**${origin(g[0].from, w)}**` : '';
    if (g.length === 1) {
      if (out.length && out[out.length - 1] === '') out.pop();
      out.push(`${++n}. ${label ? `${label} — ` : ''}${g[0].text}`, '');
      continue;
    }
    if (label) out.push(label, '');
    for (const r of g) out.push(`${++n}. ${r.text}`);
    out.push('');
  }
  if (out[out.length - 1] === '') out.pop();
  return out;
}

/** `review clean, 1 minor parked` → `aprovada na 1ª revisão; 1 ajuste menor ficou para depois (…)`.
 * `closing(kind)`: the rulings that closed the task's items of that kind, so the line does not
 * point at "what is left" for items no longer there. */
function outcome(note, w, closing = () => []) {
  let head = null;
  const rest = [];
  for (const part of note.split(/,\s*/u).map((x) => x.trim()).filter(Boolean)) {
    let m;
    if (/^review clean$/iu.test(part)) head = w.firstReview;
    else if ((m = /^(\d+) fix rounds?$/iu.exec(part))) head = w.afterRounds(Number(m[1]));
    else if ((m = /^(\d+) minors? (?:parked|deferred)$/iu.exec(part))) {
      const k = closing('minor');
      rest.push(k.length ? w.minorClosed(Number(m[1]), k) : w.minorLater(Number(m[1])));
    }
    else if ((m = /^(\d+) parked$/iu.exec(part))) rest.push(w.kept(Number(m[1])));
    else if ((m = /^(\d+) unverified(?: ledgered)?$/iu.exec(part))) {
      const k = closing('unverified');
      rest.push(w.unverified(Number(m[1])) + (k.length ? w.closedIn(Number(m[1]), k) : ''));
    }
    else rest.push(part);
  }
  return [head || w.approved, ...rest].join('; ');
}

/** One done line as the user reads it. `Task N: complete (commits a..b, <note>, tests: <cmd> → <out>)`
 * → `Task N — <title>: <outcome>`: the per-task range and the test command are the loop's evidence,
 * not the user's (2026-09-23: 400-character lines). */
function taskLine(l, titles, w, rulings, pending) {
  const m = /^Task (\d+): complete \((.*)\)$/u.exec(l);
  const note = m[2].replace(/(?:^|, )tests: .*$/u, '').replace(/^(?:commits \S+|head \S+)(?:, )?/u, '').trim();
  const title = titles.get(Number(m[1]));
  // The rulings (1-based, as numbered below) that closed this task's items of a kind — none while
  // any of them is still left to do.
  const closing = (kind) => (pending.some((p) => { const k = pendingKey(p); return k && k.task === m[1] && k.kind === kind; })
    ? []
    : rulings.map((r, i) => (closedBy([`Task ${m[1]}: ${kind}: x`, r], 0) ? i + 1 : 0)).filter(Boolean));
  return `Task ${m[1]}${title ? ` — ${title}` : ''}: ${outcome(note, w, closing)}`;
}

/** The final review's ledger lines as one: dispatched, its fix rounds, its clean verdict. A
 * `(findings: <file>)` named a file in the workspace this script just deleted. */
function finalReviewLines(lines, w) {
  const fr = lines.filter((l) => l.startsWith('Final review:'));
  if (!fr.length) return [];
  const rounds = fr.filter((l) => /^Final review: fix round\b/u.test(l)).length;
  const clean = fr.some((l) => /^Final review: no Critical\/Important findings/u.test(l));
  const other = fr.filter((l) => !/^Final review: (dispatched|fix round|no Critical\/Important findings)\b/u.test(l))
    .map((l) => `${w.finalReview}: ${l.slice('Final review:'.length).trim()}`);
  const tail = rounds ? `, ${w.withRounds(rounds)}` : clean ? `, ${w.finalClean}` : '';
  return [`${w.finalDone}${tail}`, ...other];
}

/** `Task 2: minor (deferred): X` → `Task 2 — Ajuste menor: X`. */
function pendingLine(l, w) {
  const m = /^([^:]+): (minor \(deferred\)|unverified|parked)\s*[:—-]?\s*(.*)$/u.exec(l);
  if (!m) return l;
  return `${origin(m[1], w)} — ${w.kind[m[2].split(' ')[0]]}: ${m[3]}`;
}

/** No list of uncommitted paths: the summary is printed after the finishing skill's clean-tree
 * step, so any path listed here was committed by then (2026-09-23: 11 QA files shown as
 * "Não commitado" that were already in the merged branch). `dirty` stays in the JSON. */
function renderSummary(lines, out, tasks, feature, pt) {
  const w = pt ? WORDS.pt : WORDS.en;
  // A legacy index line's trailing `[FR-003, …]` is the plan's traceability, not the user's reading
  // (the FR ids now live in the task files' titles; a current index line has none to strip).
  const titles = new Map((tasks || []).map((x) => [x.number, x.title.replace(/\s*\[[^\]]*\]$/u, '')]));
  const groups = groupRulings(out.rulings);
  const ordered = groups.flat().map((r) => r.line);
  const done = lines.filter((l) => isDone(l) && /^Task \d+: complete \(/u.test(l)).map((l) => `- ${taskLine(l, titles, w, ordered, out.pending)}`);
  done.push(...lines.filter((l) => isDone(l) && !/^Task \d+: complete \(/u.test(l) && !l.startsWith('Final review:')).map((l) => `- ${l}`));
  done.push(...finalReviewLines(lines.filter(isDone), w).map((l) => `- ${l}`));
  if (out.trackerCommit) done.push(`- ${w.tracker}: ${out.trackerCommit}`);
  const rulings = renderRulings(groups, w);
  // Plain bullets: a `- [ ]` checkbox read as a to-do list the user was asked to tick (2026-09-24).
  const todo = out.pending.map((l) => `- ${pendingLine(l, w)}`);
  return [
    `## ${w.title(feature)}`, '',
    `### ${w.done}`, '', ...done, '',
    `### ${w.rulings} (${ordered.length})`, '', ...(rulings.length ? rulings : [w.noRulings]), '',
    `### ${w.todo} (${todo.length})`, '', ...(todo.length ? todo : [w.noTodo]),
  ].join('\n');
}

function print(out) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main();
