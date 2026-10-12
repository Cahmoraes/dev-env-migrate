#!/usr/bin/env node
/**
 * mark-task-status.cjs — Set a task's **Status:** field (and optionally its
 * index checkbox) on disk, deterministically and idempotently.
 *
 * Replaces the error-prone manual file edits the execution skills did before
 * each dispatch and on completion:
 *   - PENDING → IN_PROGRESS before dispatching the implementer
 *   - IN_PROGRESS → DONE after all gates pass (also flips `- [ ] N.` → `- [x] N.`)
 *   - DONE → IN_PROGRESS when the QA gate reopens a story's task for its fix round
 *     (flips `- [x] N.` back to `- [ ] N.`, so `parse-tasks.cjs --assert-all-done` goes red)
 *
 * Idempotent: re-running with the same target status is a no-op (statusChanged:
 * false), never an error. The status line is matched by an anchored regex, so
 * the script can never corrupt an adjacent line — if the field is absent it
 * fails loudly instead of guessing.
 *
 * Usage:
 *   node scripts/mark-task-status.cjs --task-file <path> --status <STATUS>
 *        [--tasks-index <path> --task-number <N>]
 *   node scripts/mark-task-status.cjs --tasks-index <path> --task-number <N> --status <STATUS>
 *
 * The task file is located either explicitly (--task-file) or derived from the
 * index entry for --task-number; supply one or the other (both is fine —
 * --task-file wins). This is why the second form above works without
 * --task-file.
 *
 * Verified DONE (the suite defines green, not the model's claim):
 *   node scripts/mark-task-status.cjs --task-file <path> --status DONE \
 *        [--tasks-index <path> --task-number <N>] --verify -- <test command...>
 *
 *   Runs the command (argv after `--`, no shell) with NODE_TEST_CONTEXT removed
 *   from its environment, and marks DONE ONLY when it exits 0. A non-zero exit
 *   leaves the task file and the index untouched (`marked: false`); the task is
 *   not complete. The JSON `verify` block (command, exitCode, verified, marked)
 *   is the record of what proved the task green; the task file only gains DONE.
 *
 * Ledger (automatic, no flag): the transition to IN_PROGRESS appends
 *   `Task N: started (base <HEAD7>)` and a written DONE appends
 *   `Task N: complete (commits <base7>..<HEAD7>[, <note>])` to `progress.md` in the plan's
 *   workspace, `.superpowers/sdd/<feature>/` (lib/ledger.cjs) — the recovery map a resume reads, never left to the
 *   controller's discipline. An idempotent re-run appends nothing.
 *
 * Options:
 *   --status <STATUS>     One of: PENDING | IN_PROGRESS | DONE                  [required]
 *   --note <text>         DONE only: suffix of the ledger's complete line
 *                         (`review clean`, `1 fix round`, `2 parked`)
 *   --verify -- <cmd...>  DONE only: run <cmd...> first; mark only on exit 0
 *   --task-file <path>    Path to the individual task file (task-NN.md);
 *                         optional when --tasks-index + --task-number can locate it
 *   --tasks-index <path>  Tasks index file; with --task-number it sets the
 *                         matching checkbox ([x] for DONE, [ ] else) AND, when
 *                         --task-file is absent, locates the task file
 *   --task-number <N[,N...]>  Task number(s) to flip in the index / locate the files. A
 *                         comma-separated list marks every listed task in ONE call, and
 *                         with --verify the command runs ONCE for all of them (a batch
 *                         shares one green run) — the JSON then carries `tasks: [...]`
 *                         instead of the flat single-task fields
 *   --help                Show this help text and exit 0
 *
 * Exit codes:
 *   0  success (including idempotent no-op)
 *   1  usage error, missing **Status:** field, or unreadable/unwritable file
 *
 * Output (stdout): JSON
 *   {
 *     "taskFile": string,
 *     "status": string,            // requested status
 *     "statusBefore": string|null, // previous status in the file
 *     "statusChanged": boolean,
 *     "indexUpdated": boolean,      // whether the index checkbox was rewritten
 *     "indexCheckboxBefore": "x"|" "|null,
 *     "indexCheckboxAfter": "x"|" "|null,
 *     "errors": string[],
 *     "verify": null | {         // present only with --verify
 *       "command": string[],
 *       "exitCode": number|null,  // null when the command could not be spawned
 *       "verified": boolean,      // exitCode === 0
 *       "marked": boolean,        // false when verification failed: nothing was written
 *       "outputTail": string      // last lines of stdout+stderr
 *     }
 *   }
 * Diagnostics (stderr): warnings/errors mirrored as text.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ledger = require('./lib/ledger.cjs');

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];
const OUTPUT_TAIL_LINES = 20;

const HELP = `
mark-task-status.cjs — Set a task's **Status:** field (and optionally its index checkbox).

Usage:
  node scripts/mark-task-status.cjs --task-file <path> --status <STATUS> \\
       [--tasks-index <path> --task-number <N>]
  node scripts/mark-task-status.cjs --tasks-index <path> --task-number <N> --status <STATUS>

Locate the task file with EITHER --task-file, OR --tasks-index + --task-number
(the file is read from the index entry for that number). Both is fine — --task-file wins.

Options:
  --status <STATUS>     One of: ${VALID_STATUSES.join(' | ')}            [required]
  --task-file <path>    Individual task file (task-NN.md); optional when the
                        index + number can locate it
  --tasks-index <path>  Tasks index file (flips the matching checkbox; also
                        locates the task file when --task-file is omitted)
  --task-number <N[,N...]>  Task number(s) to flip in the index / locate the files;
                        a comma-separated list marks them all in one call, with
                        --verify running ONCE for the whole list (JSON: tasks: [...])
  --verify -- <cmd...>  DONE only: run <cmd...> (no shell, NODE_TEST_CONTEXT
                        cleared) and mark only if it exits 0; the verdict is
                        the JSON verify block, the task file only gains DONE
  --note <text>         DONE only: suffix of the ledger's complete line
                        ("review clean", "1 fix round", "2 parked")

Ledger: IN_PROGRESS appends "Task N: started (base <HEAD7>)" and a written DONE
appends "Task N: complete (commits <base7>..<HEAD7>[, <note>])" to progress.md
in .superpowers/sdd/<feature>/ — automatic, idempotent; the JSON reports them under "ledger".
  --help                Show this help text and exit 0
`.trimStart();

function usage(message) {
  process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const options = { taskFile: null, status: null, tasksIndex: null, taskNumbers: [], verify: null, note: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--verify') {
      // Everything after the `--` separator is the command's own argv; it is
      // never parsed as our options, so a test command can carry any flags.
      if (args[i + 1] !== '--' || args.length <= i + 2) {
        usage('--verify requires `-- <command...>` (the test command, after a `--` separator)');
      }
      options.verify = args.slice(i + 2);
      break;
    }
    if (arg === '--task-file') {
      if (!args[i + 1]) usage('--task-file <path> is required');
      options.taskFile = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--status') {
      if (!args[i + 1]) usage('--status <STATUS> is required');
      options.status = args[i + 1].trim().toUpperCase();
      i += 1;
      continue;
    }
    if (arg === '--note') {
      if (args[i + 1] == null || args[i + 1] === '--verify') usage('--note <text> requires a value');
      options.note = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--tasks-index') {
      if (!args[i + 1]) usage('--tasks-index <path> is required');
      options.tasksIndex = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--task-number') {
      if (!args[i + 1]) usage('--task-number <N[,N...]> is required');
      options.taskNumbers = args[i + 1].split(',').map((n) => Number.parseInt(n.trim(), 10));
      if (options.taskNumbers.some((n) => !Number.isInteger(n))) usage(`--task-number must be an integer or a comma-separated list of integers. Got: ${args[i + 1]}`);
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  if (!options.status) usage('--status <STATUS> is required');
  if (!VALID_STATUSES.includes(options.status)) {
    usage(`--status must be one of: ${VALID_STATUSES.join(', ')}. Got: ${options.status}`);
  }
  if (options.note !== null && options.status !== 'DONE') {
    usage('--note only applies to --status DONE (it annotates the ledger\'s complete line)');
  }
  if (options.verify && options.status !== 'DONE') {
    usage('--verify only applies to --status DONE (verification is what earns DONE)');
  }
  if (options.tasksIndex && options.taskNumbers.length === 0) {
    usage('--tasks-index requires --task-number <N[,N...]>');
  }
  if (options.taskNumbers.length > 0 && !options.tasksIndex) {
    usage('--task-number requires --tasks-index <path>');
  }
  if (options.taskNumbers.length > 1 && options.taskFile) {
    usage('--task-file names one file; several --task-number values are located through the index only');
  }
  // The task file can be given explicitly OR derived from the index entry for
  // --task-number. Requiring both is the redundancy that made callers omit
  // --task-file and hit a usage error; either locator alone is enough.
  if (!options.taskFile && !(options.tasksIndex && options.taskNumbers.length > 0)) {
    usage('locate the task file with either --task-file <path>, or --tasks-index <path> together with --task-number <N[,N...]>');
  }
  return options;
}

// ─── Task file status ─────────────────────────────────────────────────────────

const STATUS_LINE = /^(\*\*Status:\*\*[ \t]*)(\S+)([^\n]*)$/m;

/**
 * Rewrite the **Status:** field. Returns { content, before } or throws if the
 * field is absent (we never invent one — that would mask a malformed task file).
 */
function setTaskStatus(content, nextStatus) {
  const match = content.match(STATUS_LINE);
  if (!match) {
    throw new Error('No **Status:** field found in task file — refusing to guess.');
  }
  const before = match[2].trim().toUpperCase();
  if (before === nextStatus) {
    return { content, before, changed: false };
  }
  const replaced = content.replace(STATUS_LINE, `$1${nextStatus}$3`);
  return { content: replaced, before, changed: true };
}

// ─── Verification (the suite defines green) ──────────────────────────────────

/**
 * Run the verification command as-is (argv, no shell). NODE_TEST_CONTEXT is
 * removed from the child's environment: with it set, `node --test` reports to
 * a parent that does not exist and exits 0 even when tests fail — a green that
 * proves nothing. The command's exit code is the verdict; nothing else is.
 */
function runVerification(command) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(command[0], command.slice(1), { env, encoding: 'utf8' });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  const lines = output.split('\n').filter((l) => l.trim() !== '');
  const outputTail = lines.slice(-OUTPUT_TAIL_LINES).join('\n');
  const exitCode = res.error ? null : res.status;
  return {
    command,
    exitCode,
    verified: exitCode === 0,
    marked: false,
    outputTail: res.error ? `${res.error.message}\n${outputTail}`.trim() : outputTail,
  };
}

// ─── Locate the task file from the index ──────────────────────────────────────

/**
 * Match the index line for a specific task number and capture the `task-NN.md`
 * path it references: `- [ ] N. Title → \`task-NN.md\`` (a legacy line may still carry
 * `[FR-XXX]` before the arrow). Same shape as
 * parse-plan.cjs's TASK_LINE, anchored to the requested number.
 */
function taskFilePattern(taskNumber) {
  return new RegExp(`^-\\s+\\[[ xX]\\]\\s+${taskNumber}\\.\\s+.+?\\s*(?:→|->)\\s*\`([^\`]+\\.md)\``, 'm');
}

/**
 * Resolve the task file the index associates with a task number, relative to
 * the index's own directory. Returns null when the number is not in the index.
 */
function deriveTaskFileFromIndex(indexContent, indexPath, taskNumber) {
  const match = indexContent.match(taskFilePattern(taskNumber));
  if (!match) return null;
  return path.resolve(path.dirname(indexPath), match[1].trim());
}

// ─── Index checkbox ─────────────────────────────────────────────────────────

/** Match `- [ ] N. ...` capturing the checkbox char for a specific task number. */
function indexCheckboxPattern(taskNumber) {
  return new RegExp(`^(-\\s+\\[)([ xX])(\\]\\s+${taskNumber}\\.\\s)`, 'm');
}

function setIndexCheckbox(content, taskNumber, nextStatus) {
  const pattern = indexCheckboxPattern(taskNumber);
  const match = content.match(pattern);
  if (!match) {
    return { content, before: null, after: null, updated: false, missing: true };
  }
  const before = match[2].toLowerCase() === 'x' ? 'x' : ' ';
  const after = nextStatus === 'DONE' ? 'x' : ' ';
  if (before === after) {
    return { content, before, after, updated: false, missing: false };
  }
  const replaced = content.replace(pattern, `$1${after}$3`);
  return { content: replaced, before, after, updated: true, missing: false };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/** A failure that marks nothing: the CLI prints its message and exits 1. */
class MarkError extends Error {}

/** Resolve the task file the index names for `taskNumber`, or fail — a target that cannot be
 * located fails the whole call before anything runs or is written. */
function locateFromIndex(indexContent, tasksIndex, taskNumber) {
  const taskFile = deriveTaskFileFromIndex(indexContent, tasksIndex, taskNumber);
  if (!taskFile) {
    throw new MarkError(`Error: task ${taskNumber} not found in index ${tasksIndex}; cannot locate its task file. Pass --task-file <path> explicitly.`);
  }
  return taskFile;
}

/** Write via a sibling temp file + rename: a crash mid-write never leaves a truncated tracker. */
function writeAtomic(target, content) {
  const file = fs.realpathSync(target);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: fs.statSync(file).mode });
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function readOrFail(file, what) {
  if (!fs.existsSync(file)) throw new MarkError(`Error: ${what} not found: ${file}`);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new MarkError(`Error reading ${what}: ${err.message}`);
  }
}

/**
 * Mark the targets `options` names (parseArgs's shape), in process: build-task-dispatch.cjs
 * --start calls it instead of spawning a node. Returns `{ out, stderr }` — the JSON the CLI
 * prints and the lines it writes to stderr; throws MarkError when nothing may be marked.
 */
function markTaskStatus(options) {
  const { status, tasksIndex, taskNumbers } = options;
  const errors = [];
  const stderr = [];
  const multi = taskNumbers.length > 1;

  // Every target is resolved and read up front.
  let indexContent = null;
  if (tasksIndex) {
    if (fs.existsSync(tasksIndex)) {
      try {
        indexContent = fs.readFileSync(tasksIndex, 'utf8');
      } catch (err) {
        if (!options.taskFile) throw new MarkError(`Error reading tasks index: ${err.message}`);
        errors.push(`Could not update index: ${err.message}`);
      }
    } else if (!options.taskFile) {
      throw new MarkError(`Error: tasks index not found: ${tasksIndex}`);
    } else {
      errors.push(`Tasks index not found: ${tasksIndex}`);
    }
  }

  const targets = [];
  if (options.taskFile) {
    targets.push({ taskNumber: taskNumbers[0] ?? null, taskFile: options.taskFile });
  } else {
    for (const n of taskNumbers) targets.push({ taskNumber: n, taskFile: locateFromIndex(indexContent, tasksIndex, n) });
  }
  for (const t of targets) t.content = readOrFail(t.taskFile, 'task file');

  const ledgerOut = { path: null, appended: [] };
  const emit = (results, verify) => {
    const out = multi
      ? { status, tasks: results, errors, verify, ledger: ledgerOut }
      : { taskFile: results[0].taskFile, status, ...results[0], errors, verify, ledger: ledgerOut };
    if (!multi) delete out.taskNumber;
    return { out, stderr };
  };

  // --verify: ONE run decides for every target — a batch's tasks share one green run, so the
  // suite runs once for the batch, never once per task. A failing run writes nothing — not a
  // status, not a checkbox — and says so.
  let verify = null;
  if (options.verify) {
    verify = runVerification(options.verify);
    if (!verify.verified) {
      stderr.push(`Verification failed (exit ${verify.exitCode}): task${multi ? 's' : ''} NOT marked ${status}.\n${verify.outputTail}`);
      return emit(
        targets.map((t) => ({
          taskNumber: t.taskNumber,
          taskFile: t.taskFile,
          statusBefore: (t.content.match(STATUS_LINE) || [null, null, null])[2],
          statusChanged: false,
          indexUpdated: false,
          indexCheckboxBefore: null,
          indexCheckboxAfter: null,
        })),
        verify,
      );
    }
  }

  // Every status rewrite is computed before any is written: a target with no **Status:** field
  // fails the whole call with nothing on disk, never half a batch.
  let rewrites;
  try {
    rewrites = targets.map((t) => setTaskStatus(t.content, status));
  } catch (err) {
    throw new MarkError(`Error: ${err.message}`);
  }
  if (verify) verify.marked = true;
  const results = targets.map((t, i) => {
    if (rewrites[i].changed) {
      try {
        writeAtomic(t.taskFile, rewrites[i].content);
      } catch (err) {
        throw new MarkError(`Error: ${err.message}`);
      }
    }
    return {
      taskNumber: t.taskNumber,
      taskFile: t.taskFile,
      statusBefore: rewrites[i].before,
      statusChanged: rewrites[i].changed,
      indexUpdated: false,
      indexCheckboxBefore: null,
      indexCheckboxAfter: null,
    };
  });

  // Index checkboxes: one read, every flip, one write.
  if (tasksIndex && indexContent !== null) {
    let content = indexContent;
    let dirty = false;
    for (const r of results) {
      if (!Number.isInteger(r.taskNumber)) continue;
      const res = setIndexCheckbox(content, r.taskNumber, status);
      if (res.missing) {
        errors.push(`Task number ${r.taskNumber} not found in index ${tasksIndex}`);
        continue;
      }
      r.indexCheckboxBefore = res.before;
      r.indexCheckboxAfter = res.after;
      r.indexUpdated = res.updated;
      if (res.updated) {
        content = res.content;
        dirty = true;
      }
    }
    if (dirty) {
      try {
        writeAtomic(tasksIndex, content);
      } catch (err) {
        errors.push(`Could not update index: ${err.message}`);
      }
    }
  }

  writeLedger(results, targets, status, options.note, verify, ledgerOut, errors);

  errors.forEach((e) => stderr.push(`Error: ${e}`));
  return emit(results, verify);
}

function main() {
  let marked;
  try {
    marked = markTaskStatus(parseArgs(process.argv));
  } catch (err) {
    if (!(err instanceof MarkError)) throw err;
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  marked.stderr.forEach((line) => process.stderr.write(`${line}\n`));
  process.stdout.write(`${JSON.stringify(marked.out, null, 2)}\n`);
  process.exit(0);
}

/** Task number of a target: the explicit one, else `task-NN.md`, else the `# Task N:` heading. */
function taskNumberOf(target) {
  if (Number.isInteger(target.taskNumber)) return target.taskNumber;
  const byName = path.basename(target.taskFile).match(/task-0*(\d+)\.md$/i);
  if (byName) return Number.parseInt(byName[1], 10);
  const byHeading = (target.content || '').match(/^#\s+Task\s+(\d+)\b/m);
  return byHeading ? Number.parseInt(byHeading[1], 10) : null;
}

/**
 * The two bookkeeping lines of the ledger, written only on a real transition (statusChanged):
 * a resume that re-marks an IN_PROGRESS task keeps its original base. Outside git nothing is
 * written — there is no commit to name — and the JSON says why.
 */
function writeLedger(results, targets, status, note, verify, ledgerOut, errors) {
  if (status === 'PENDING') return;
  const plansDir = path.dirname(targets[0].taskFile);
  const { root, head } = ledger.gitFacts(plansDir);
  const file = ledger.ledgerPathFor(plansDir, ledger.repoRootOf(plansDir, root));
  ledgerOut.path = file;
  if (!head) {
    ledgerOut.skipped = 'not a git repository — no commit to record';
    return;
  }
  const content = ledger.readLedger(file);
  results.forEach((r, i) => {
    if (!r.statusChanged) return;
    const n = taskNumberOf({ ...targets[i], taskNumber: r.taskNumber });
    if (!Number.isInteger(n)) return;
    const line = status === 'IN_PROGRESS'
      ? ledger.startedLine(n, head)
      : ledger.completeLine(n, ledger.lastStartedBase(content, n), head, note, verify);
    try {
      const written = ledger.appendLine(file, line);
      if (written) ledgerOut.appended.push(written);
    } catch (err) {
      errors.push(`Could not append to ledger ${file}: ${err.message}`);
    }
  });
}

module.exports = { markTaskStatus, MarkError };

if (require.main === module) main();
