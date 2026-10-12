'use strict';

// ledger.cjs — the execution ledger's deterministic lines.
//
// The ledger (`<repo>/.superpowers/sdd/<feature>/progress.md`, in the plan's git-ignored
// workspace beside the prompts, reports and review packages, as upstream 6.4.1's) is the loop's
// recovery map: it must say, after a compaction, where each task started, which fix round it
// reached and which commits closed it. A real Copilot run (2026-09-22, session eaef5004) wrote
// only the header, two deferred minors and one ruling: no task's BASE, no completion range, not
// even the fix round it ran — every line the prose asked for that carried no decision was
// skipped; a second run (2026-09-22) ran two fix rounds and ledgered neither. So the lines that
// are pure bookkeeping are written by the scripts that already hold the fact, never by the
// controller: `Task N: started (base <sha7>)` on the transition to IN_PROGRESS and
// `Task N: complete (commits <base7>..<head7>[, <note>])` when DONE is written
// (mark-task-status.cjs), `Task N: fix round <R> (…)` when a re-review is rendered
// (build-task-dispatch.cjs) and the pre-flight table (sdd-start.cjs, ./preflight.cjs).
// Decisions (rulings, parked, minors, declined) stay the controller's lines.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LEDGER_FILE = 'progress.md';

/** `docs/superpowers/<feature>/plans` → `<feature>`; any other layout → the plans dir's parent name. */
function featureNameFor(plansDir) {
  return path.basename(path.dirname(path.resolve(plansDir)));
}

/**
 * `{ root, head }` of the repo holding `dir` in ONE git spawn: the toplevel and the full HEAD sha.
 * `--verify -q HEAD` still prints the toplevel on an unborn branch (head null); outside git or
 * without git, both are null.
 */
function gitFacts(dir) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel', '--verify', '-q', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.error || typeof r.stdout !== 'string') return { root: null, head: null };
  const [root, head] = r.stdout.split('\n');
  return { root: root || null, head: r.status === 0 && head ? head : null };
}

/** The git toplevel holding `dir`; outside git, the repo the `docs/superpowers/<feature>/plans` layout implies. */
function repoRootOf(dir, root = gitFacts(dir).root) {
  return root || path.resolve(dir, '..', '..', '..', '..');
}

/**
 * The plan's scratch workspace, `<repo>/.superpowers/sdd/<feature>/` (git-ignored): the ledger,
 * rendered prompts, implementer reports, review packages. build-task-dispatch.cjs creates it and
 * sdd-finish.cjs deletes it, so both resolve it here.
 */
function workspacePathFor(repoRoot, plansDir) {
  return path.join(repoRoot, '.superpowers', 'sdd', featureNameFor(plansDir));
}

/** Create the workspace and the self-ignoring `.superpowers/sdd/.gitignore`; returns the workspace. */
function ensureWorkspace(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(path.dirname(dir), '.gitignore'), '*\n');
  return dir;
}

/** The ledger path for a plans directory (where the index and the task files live). */
function ledgerPathFor(plansDir, repoRoot = repoRootOf(plansDir)) {
  return path.join(workspacePathFor(repoRoot, plansDir), LEDGER_FILE);
}

/** Full HEAD sha of the repo holding `dir`, or null outside git. */
function headSha(dir) {
  return gitFacts(dir).head;
}

const short = (sha) => (sha ? sha.slice(0, 7) : sha);

function readLedger(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Append one line; create the file (and the workspace) with its header first. Idempotent on the
 * exact line, so a re-run of the same transition never duplicates it. Returns the line when
 * written, else null. Entries are separated by a blank line: a Markdown preview joins adjacent
 * lines into one paragraph, and every reader splits on newlines and skips blanks.
 */
function appendLine(file, line) {
  const current = readLedger(file);
  if (current !== null && current.split(/\r?\n/).includes(line)) return null;
  return appendEntry(file, current, line) && line;
}

/** Append a multi-line block (the pre-flight table) under the same header and separator rules. */
function appendBlock(file, block) {
  return appendEntry(file, readLedger(file), block.replace(/\n+$/, ''));
}

function appendEntry(file, current, text) {
  let head = '';
  if (current === null) {
    ensureWorkspace(path.dirname(file));
    head = `# Ledger — ${path.basename(path.dirname(file))}\n`;
  }
  const body = current === null ? head : current;
  const prefix = body === '' || /\n\s*\n$/.test(body) ? '' : body.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(file, `${head}${prefix}${text}\n`, 'utf8');
  return true;
}

const STARTED = /^Task (\d+): started \(base ([0-9a-f]{7,40})\)\s*$/;
const FIX_ROUND = /^Task (\d+): fix round (\d+)\b/;

/** The base of the LAST `started` line for task `n` (a QA reopen starts it again), or null. */
function lastStartedBase(content, n) {
  if (!content) return null;
  let base = null;
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(STARTED);
    if (m && Number(m[1]) === n) base = m[2];
  }
  return base;
}

/** The highest fix round recorded for task `n` after its last `started` line, or 0. */
function lastFixRound(content, n) {
  if (!content) return 0;
  let round = 0;
  for (const line of content.split(/\r?\n/)) {
    const s = line.match(STARTED);
    if (s && Number(s[1]) === n) round = 0;
    const m = line.match(FIX_ROUND);
    if (m && Number(m[1]) === n) round = Math.max(round, Number(m[2]));
  }
  return round;
}

/**
 * `Task N: fix round <R> (findings: <file>; commits <fixbase7>..<head7>)`, written when round R's
 * re-review is rendered: the fix commits exist by then, and the round's outcome is the next line —
 * another fix round (findings still open) or `complete` (all addressed).
 */
function fixRoundLine(n, round, findingsFile, base, head) {
  const range = base && head ? `; commits ${short(base)}..${short(head)}` : '';
  return `Task ${n}: fix round ${round} (findings: ${path.basename(findingsFile)}${range})`;
}

function startedLine(n, base) {
  return `Task ${n}: started (base ${short(base)})`;
}

/** The command as typed, and the last non-blank line it printed — the record of what proved DONE. */
function testsEvidence(verify) {
  if (!verify || !Array.isArray(verify.command)) return '';
  const cmd = verify.command.map((a) => (/[\s"';|&]/.test(a) ? `'${a}'` : a)).join(' ');
  const lines = String(verify.outputTail || '').split(/\r?\n/).filter((l) => l.trim());
  const summary = lines.filter((l) => /\b(?:pass(?:ed|ing|es)?|fail(?:ed|ing|ures?)?|tests?)\b/i.test(l) && !/duration/i.test(l));
  const last = summary.length ? summary.slice(-2).join(' ') : lines.pop() || '';
  return `tests: ${cmd} → ${last.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
}

function completeLine(n, base, head, note, verify) {
  const range = base ? `commits ${short(base)}..${short(head)}` : `head ${short(head)}`;
  const parts = [note && note.trim(), testsEvidence(verify)].filter(Boolean);
  return `Task ${n}: complete (${range}${parts.length ? `, ${parts.join(', ')}` : ''})`;
}

module.exports = {
  ledgerPathFor,
  featureNameFor,
  repoRootOf,
  gitFacts,
  workspacePathFor,
  ensureWorkspace,
  headSha,
  readLedger,
  appendLine,
  appendBlock,
  lastStartedBase,
  lastFixRound,
  startedLine,
  fixRoundLine,
  completeLine,
};
