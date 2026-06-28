#!/usr/bin/env node
/**
 * mark-task-status.cjs — Set a task's **Status:** field (and optionally its
 * index checkbox) on disk, deterministically and idempotently.
 *
 * Replaces the error-prone manual file edits the execution skills did before
 * each dispatch and on completion:
 *   - PENDING → IN_PROGRESS before dispatching the implementer
 *   - IN_PROGRESS → DONE after all gates pass (also flips `- [ ] N.` → `- [x] N.`)
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
 * Options:
 *   --status <STATUS>     One of: PENDING | IN_PROGRESS | DONE                  [required]
 *   --task-file <path>    Path to the individual task file (task-NN.md);
 *                         optional when --tasks-index + --task-number can locate it
 *   --tasks-index <path>  Tasks index file; with --task-number it sets the
 *                         matching checkbox ([x] for DONE, [ ] else) AND, when
 *                         --task-file is absent, locates the task file
 *   --task-number <N>     Task number to flip in the index / locate the file
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
 *     "errors": string[]
 *   }
 * Diagnostics (stderr): warnings/errors mirrored as text.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];

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
  --task-number <N>     Task number to flip in the index / locate the file
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
  const options = { taskFile: null, status: null, tasksIndex: null, taskNumber: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
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
    if (arg === '--tasks-index') {
      if (!args[i + 1]) usage('--tasks-index <path> is required');
      options.tasksIndex = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--task-number') {
      if (!args[i + 1]) usage('--task-number <N> is required');
      options.taskNumber = Number.parseInt(args[i + 1], 10);
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  if (!options.status) usage('--status <STATUS> is required');
  if (!VALID_STATUSES.includes(options.status)) {
    usage(`--status must be one of: ${VALID_STATUSES.join(', ')}. Got: ${options.status}`);
  }
  if (options.tasksIndex && !Number.isInteger(options.taskNumber)) {
    usage('--tasks-index requires --task-number <N>');
  }
  if (Number.isInteger(options.taskNumber) && !options.tasksIndex) {
    usage('--task-number requires --tasks-index <path>');
  }
  // The task file can be given explicitly OR derived from the index entry for
  // --task-number. Requiring both is the redundancy that made callers omit
  // --task-file and hit a usage error; either locator alone is enough.
  if (!options.taskFile && !(options.tasksIndex && Number.isInteger(options.taskNumber))) {
    usage('locate the task file with either --task-file <path>, or --tasks-index <path> together with --task-number <N>');
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

// ─── Locate the task file from the index ──────────────────────────────────────

/**
 * Match the index line for a specific task number and capture the `task-NN.md`
 * path it references: `- [ ] N. Title [FR-XXX] → \`task-NN.md\``. Same shape as
 * parse-waves.cjs's TASK_LINE, anchored to the requested number.
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

function main() {
  const options = parseArgs(process.argv);
  const { status, tasksIndex, taskNumber } = options;
  let taskFile = options.taskFile;
  const errors = [];

  // No explicit --task-file: derive it from the index entry for --task-number.
  if (!taskFile) {
    if (!fs.existsSync(tasksIndex)) {
      process.stderr.write(`Error: tasks index not found: ${tasksIndex}\n`);
      process.exit(1);
    }
    let indexContent;
    try {
      indexContent = fs.readFileSync(tasksIndex, 'utf8');
    } catch (err) {
      process.stderr.write(`Error reading tasks index: ${err.message}\n`);
      process.exit(1);
    }
    taskFile = deriveTaskFileFromIndex(indexContent, tasksIndex, taskNumber);
    if (!taskFile) {
      process.stderr.write(
        `Error: task ${taskNumber} not found in index ${tasksIndex}; cannot locate its task file. Pass --task-file <path> explicitly.\n`,
      );
      process.exit(1);
    }
  }

  if (!fs.existsSync(taskFile)) {
    process.stderr.write(`Error: task file not found: ${taskFile}\n`);
    process.exit(1);
  }

  let taskContent;
  try {
    taskContent = fs.readFileSync(taskFile, 'utf8');
  } catch (err) {
    process.stderr.write(`Error reading task file: ${err.message}\n`);
    process.exit(1);
  }

  let statusBefore = null;
  let statusChanged = false;
  try {
    const result = setTaskStatus(taskContent, status);
    statusBefore = result.before;
    statusChanged = result.changed;
    if (result.changed) {
      fs.writeFileSync(taskFile, result.content, 'utf8');
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let indexUpdated = false;
  let indexCheckboxBefore = null;
  let indexCheckboxAfter = null;
  if (tasksIndex) {
    if (!fs.existsSync(tasksIndex)) {
      errors.push(`Tasks index not found: ${tasksIndex}`);
    } else {
      try {
        const indexContent = fs.readFileSync(tasksIndex, 'utf8');
        const res = setIndexCheckbox(indexContent, taskNumber, status);
        if (res.missing) {
          errors.push(`Task number ${taskNumber} not found in index ${tasksIndex}`);
        } else {
          indexCheckboxBefore = res.before;
          indexCheckboxAfter = res.after;
          indexUpdated = res.updated;
          if (res.updated) {
            fs.writeFileSync(tasksIndex, res.content, 'utf8');
          }
        }
      } catch (err) {
        errors.push(`Could not update index: ${err.message}`);
      }
    }
  }

  errors.forEach((e) => process.stderr.write(`Error: ${e}\n`));

  const out = {
    taskFile,
    status,
    statusBefore,
    statusChanged,
    indexUpdated,
    indexCheckboxBefore,
    indexCheckboxAfter,
    errors,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(0);
}

main();
