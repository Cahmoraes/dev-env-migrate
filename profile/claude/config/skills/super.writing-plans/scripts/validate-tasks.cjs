#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HELP = `
validate-tasks.cjs — Validate a super.writing-plans tasks index AND its task files.

Usage:
  node scripts/validate-tasks.cjs --tasks-index <path> [--index-only] [--prd <path>] [--mockups <dir>]

Options:
  --tasks-index <path>  Path to tasks index markdown file
  --index-only          Validate only the index format (skip per-file checks)
  --prd <path>          PRD to cross-check FR coverage against. When given, every FR-NNN
                        declared in the PRD must be covered by at least one task, and a PRD
                        with FRs but tasks carrying no FR tags is flagged (closes the
                        silent "PRD exists but FR tags forgotten" gap). Omit for spec-only plans.
  --mockups <dir>       Curated-mockups directory (specs/mockups/) to cross-check visual
                        coverage against. When given and the directory holds at least one
                        curated artifact, at least one task must reference it via a
                        "### Fidelidade Visual" subsection — otherwise the durable visual
                        decision is silently dropped. Mirrors --prd; omit for non-visual plans.
  --help                Show usage and exit 0

Index checks: sequential numbering, line format, .md references, duplicates, titles.
Per-file checks (default, unless --index-only):
  - each referenced task-NN.md physically exists
  - each task file declares the required headers: **Status:** **PRD:** **Spec:** **Depends on:**
  - FR-XXX tags (or legacy RF-XXX) declared in the index line are traceable in the task file (title or body)
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
  let tasksIndexPath = null;
  let indexOnly = false;
  let prdPath = null;
  let mockupsPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--tasks-index') {
      if (!args[index + 1]) usage('--tasks-index <path> is required');
      tasksIndexPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--index-only') {
      indexOnly = true;
      continue;
    }
    if (arg === '--prd') {
      if (!args[index + 1]) usage('--prd <path> is required');
      prdPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mockups') {
      if (!args[index + 1]) usage('--mockups <dir> is required');
      mockupsPath = args[index + 1];
      index += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  if (!tasksIndexPath) usage('--tasks-index <path> is required');
  return {
    tasksIndexPath: path.resolve(tasksIndexPath),
    indexOnly,
    prdPath: prdPath ? path.resolve(prdPath) : null,
    mockupsPath: mockupsPath ? path.resolve(mockupsPath) : null,
  };
}

function buildNotFoundResult(tasksIndexPath) {
  return {
    found: false,
    valid: false,
    errors: [],
    warnings: [],
    taskCount: 0,
    taskNumbers: [],
    taskFiles: [],
    tasksIndexPath,
  };
}

function normalizeTitle(title) {
  return title.replace(/\s+\[[^\]]+\]\s*$/u, '').trim();
}

/**
 * Extract functional-requirement tokens (uppercased, deduped) from arbitrary
 * text. Canonical artifacts emit the English `FR-XXX`; legacy artifacts use the
 * Portuguese `RF-XXX`. Both are accepted (dual-accept) so older plans keep
 * validating — the token is preserved verbatim, never translated.
 */
function extractRequirementTokens(text) {
  const out = [];
  const seen = new Set();
  const re = /(?:FR|RF)-\d+/giu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const token = m[0].toUpperCase();
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

// ─── Required task-file headers ────────────────────────────────────────────────

const REQUIRED_HEADERS = [
  { label: '**Status:**', pattern: /^\*\*Status:\*\*/mu },
  { label: '**PRD:**', pattern: /^\*\*PRD:\*\*/mu },
  { label: '**Spec:**', pattern: /^\*\*Spec:\*\*/mu },
  { label: '**Depends on:**', pattern: /^\*\*Depends on:\*\*/mu },
];

// A task references the curated mockup via the "### Fidelidade Visual" subsection
// (## or ### heading). This is the marker the writing-plans template emits.
const VISUAL_LINK_PATTERN = /^#{2,3}\s+Fidelidade Visual\b/imu;

function validateTasksIndex(content, tasksIndexPath) {
  const lines = content.split(/\r?\n/u);
  const errors = [];
  const warnings = [];
  const taskNumbers = [];
  const seenNumbers = new Set();
  const parsedTasks = [];
  const taskLinePattern = /^-\s+\[([ xX])\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+)`\s*$/u;
  let expectedNumber = 1;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const match = line.match(taskLinePattern);
    if (match) {
      const taskNumber = Number.parseInt(match[2], 10);
      const rawTitle = match[3].trim();
      const taskFile = match[4].trim();
      const normalizedTitle = normalizeTitle(rawTitle);
      parsedTasks.push({
        lineNumber,
        taskNumber,
        rawTitle,
        normalizedTitle,
        taskFile,
        rfInIndex: extractRequirementTokens(rawTitle),
      });
      taskNumbers.push(taskNumber);
      if (seenNumbers.has(taskNumber)) {
        errors.push({ line: lineNumber, message: `Task number ${taskNumber} is duplicated.` });
      } else {
        seenNumbers.add(taskNumber);
      }
      if (taskNumber !== expectedNumber) {
        errors.push({ line: lineNumber, message: `Task numbers must be sequential starting at 1. Expected ${expectedNumber}, found ${taskNumber}.` });
      } else {
        expectedNumber += 1;
      }
      if (!/\.md$/iu.test(taskFile)) {
        errors.push({ line: lineNumber, message: `Task reference must point to a .md file. Found: ${taskFile}` });
      }
      if (normalizedTitle.length < 5) {
        warnings.push({ line: lineNumber, message: 'Task title is too short (minimum 5 characters).' });
      }
      if (normalizedTitle.length > 120) {
        warnings.push({ line: lineNumber, message: 'Task title is too long (maximum 120 characters).' });
      }
      return;
    }
    if (/^-\s+\[[ xX]\]/u.test(line)) {
      errors.push({ line: lineNumber, message: 'Task line format is invalid.' });
    }
  });

  if (parsedTasks.length === 0) {
    errors.push({ line: 0, message: 'Tasks index must contain at least one task line.' });
  }

  return { errors, warnings, taskNumbers, parsedTasks };
}

/**
 * Validate each referenced task file on disk: existence, required headers, and
 * functional-requirement traceability (FR-XXX, or legacy RF-XXX) against the
 * index line. Mutates errors/warnings; returns the per-file detail records.
 */
function validateTaskFiles(parsedTasks, indexDir, errors, warnings) {
  return parsedTasks.map((task) => {
    const taskFilePath = path.join(indexDir, task.taskFile);
    const record = {
      taskNumber: task.taskNumber,
      file: task.taskFile,
      exists: false,
      missingHeaders: [],
      rfInIndex: task.rfInIndex,
      rfInFile: [],
      rfMissingInFile: [],
      visualLinked: false,
      mockupRefs: [],
    };

    if (!fs.existsSync(taskFilePath)) {
      errors.push({ line: task.lineNumber, message: `Referenced task file does not exist on disk: ${task.taskFile}` });
      return record;
    }
    record.exists = true;

    let body;
    try {
      body = fs.readFileSync(taskFilePath, 'utf8');
    } catch (err) {
      errors.push({ line: task.lineNumber, message: `Could not read task file ${task.taskFile}: ${err.message}` });
      return record;
    }

    for (const header of REQUIRED_HEADERS) {
      if (!header.pattern.test(body)) {
        record.missingHeaders.push(header.label);
        errors.push({ line: task.lineNumber, message: `Task file ${task.taskFile} is missing the required ${header.label} header.` });
      }
    }

    record.visualLinked = VISUAL_LINK_PATTERN.test(body);
    record.mockupRefs = [...body.matchAll(/specs\/mockups\/([^\s`)\]]+)/giu)].map((m) => m[1]);
    record.rfInFile = extractRequirementTokens(body);
    record.rfMissingInFile = task.rfInIndex.filter((rf) => !record.rfInFile.includes(rf));
    for (const rf of record.rfMissingInFile) {
      errors.push({ line: task.lineNumber, message: `${rf} is declared in the index for task ${task.taskNumber} but is not traceable in ${task.taskFile}.` });
    }
    // A requirement cited in the file but not declared in the index is a softer signal.
    for (const rf of record.rfInFile.filter((rf) => !task.rfInIndex.includes(rf))) {
      warnings.push({ line: task.lineNumber, message: `${rf} appears in ${task.taskFile} but is not declared in the index line for task ${task.taskNumber}.` });
    }

    return record;
  });
}

// Cross-check FR coverage against a PRD. Closes the silent "PRD exists but the author forgot
// the [FR-XXX] tags" gap: without this, FR traceability only runs for tags that happen to appear,
// so a tag-less plan passes vacuously. Only invoked when --prd is supplied (spec-only plans skip it).
function validatePrdCoverage(prdPath, parsedTasks, taskFiles, errors) {
  let prdContent;
  try {
    prdContent = fs.readFileSync(prdPath, 'utf8');
  } catch (err) {
    errors.push({ line: 0, message: `Could not read PRD at ${prdPath}: ${err.message}` });
    return { prdRequirements: [], coveredRequirements: [], uncoveredRequirements: [] };
  }
  const prdRequirements = [...new Set(extractRequirementTokens(prdContent))];
  // An FR is "covered" if it is cited in any task's index line or in any task file body.
  const covered = new Set();
  for (const task of parsedTasks) {
    for (const rf of task.rfInIndex) covered.add(rf);
  }
  for (const file of taskFiles) {
    for (const rf of file.rfInFile || []) covered.add(rf);
  }
  const uncoveredRequirements = prdRequirements.filter((fr) => !covered.has(fr));
  if (prdRequirements.length > 0 && covered.size === 0) {
    errors.push({
      line: 0,
      message: `PRD declares ${prdRequirements.length} functional requirement(s) (${prdRequirements.join(', ')}) but no task carries an [FR-XXX] tag — traceability is missing.`,
    });
  } else {
    for (const fr of uncoveredRequirements) {
      errors.push({ line: 0, message: `${fr} is declared in the PRD but is not covered by any task.` });
    }
  }
  return { prdRequirements, coveredRequirements: [...covered], uncoveredRequirements };
}

// Cross-check visual coverage against the curated-mockups directory. When at least one curated
// artifact exists, the durable visual decision must be carried into the plan: EVERY curated mockup
// must be referenced by some task via a "### Fidelidade Visual" subsection. Mirrors validatePrdCoverage
// and the FR gate per-item — closes the silent "a screen exists but no task references it, so its
// layout gets re-derived" gap, including the multi-screen case. Only invoked when --mockups is
// supplied (non-visual plans skip it).
function validateMockupCoverage(mockupsDir, taskFiles, errors) {
  let mockupFiles = [];
  try {
    if (fs.existsSync(mockupsDir) && fs.statSync(mockupsDir).isDirectory()) {
      mockupFiles = fs.readdirSync(mockupsDir).filter((name) => {
        // Ignore dotfiles (.DS_Store, .gitkeep): they are not curated artifacts, and
        // counting them would fire the gate with nothing real to reference.
        if (name.startsWith('.')) return false;
        try {
          return fs.statSync(path.join(mockupsDir, name)).isFile();
        } catch {
          return false;
        }
      });
    }
  } catch (err) {
    errors.push({ line: 0, message: `Could not read mockups directory ${mockupsDir}: ${err.message}` });
    return { mockupsDir, mockupFileCount: 0, visualLinkedTaskCount: 0, ok: true };
  }
  // A task counts as visually linked only when it BOTH carries the "### Fidelidade
  // Visual" heading AND references a real curated mockup file by name. The heading
  // alone is not enough: a task that ships the template heading with the unfilled
  // `<file>` placeholder (or one left over on a non-UI task) would satisfy a
  // heading-only check vacuously, defeating the gate's purpose — re-deriving the
  // layout the mockup already decided.
  const mockupNames = new Set(mockupFiles);
  // Tolerate trailing markdown/punctuation captured alongside the filename
  // (e.g. "x-visual.md." or "**x-visual.md**") so a genuine reference is not
  // rejected on a formatting nit — while the unfilled `<file>` placeholder and
  // typo'd names still fail (they do not match any real curated file). Returns the
  // matched curated filename (after stripping), or null when nothing matches.
  const matchMockup = (ref) => {
    if (mockupNames.has(ref)) return ref;
    const stripped = ref.replace(/[.,;:*'")\]]+$/u, '');
    return mockupNames.has(stripped) ? stripped : null;
  };
  // Build the set of curated mockups actually carried into at least one visually
  // linked task, and count those tasks for reporting.
  const referencedMockups = new Set();
  let visualLinkedTaskCount = 0;
  for (const t of taskFiles) {
    if (!t.visualLinked) continue;
    const matched = (t.mockupRefs || []).map(matchMockup).filter(Boolean);
    if (matched.length > 0) visualLinkedTaskCount += 1;
    for (const name of matched) referencedMockups.add(name);
  }
  // Per-mockup gate: EVERY curated mockup must be carried into a task. A single
  // referenced screen must NOT vacuously satisfy coverage for its siblings — the
  // multi-screen case brainstorming generates ("one curated file per approved
  // screen"). This genuinely mirrors validatePrdCoverage's per-FR gate, which flags
  // each uncovered requirement individually rather than passing on the first hit.
  // An empty/absent mockups directory yields no files, hence no orphans — gate no-ops.
  const orphanMockups = mockupFiles.filter((name) => !referencedMockups.has(name));
  const ok = orphanMockups.length === 0;
  if (!ok) {
    errors.push({
      line: 0,
      message: `Curated mockups exist in ${mockupsDir} but ${orphanMockups.length} of ${mockupFiles.length} file(s) are not referenced by any task: ${orphanMockups.join(', ')} — add a "### Fidelidade Visual" subsection to the matching UI task(s) pointing at ../specs/mockups/<file>.`,
    });
  }
  return { mockupsDir, mockupFileCount: mockupFiles.length, visualLinkedTaskCount, orphanMockups, ok };
}

function main() {
  const { tasksIndexPath, indexOnly, prdPath, mockupsPath } = parseArgs(process.argv);
  if (!fs.existsSync(tasksIndexPath)) {
    process.stdout.write(`${JSON.stringify(buildNotFoundResult(tasksIndexPath), null, 2)}\n`);
    process.exit(0);
  }
  let content;
  try {
    content = fs.readFileSync(tasksIndexPath, 'utf8');
  } catch (error) {
    process.stderr.write(`Error reading tasks index: ${error.message}\n`);
    process.exit(1);
  }

  const { errors, warnings, taskNumbers, parsedTasks } = validateTasksIndex(content, tasksIndexPath);

  let taskFiles = [];
  if (!indexOnly) {
    taskFiles = validateTaskFiles(parsedTasks, path.dirname(tasksIndexPath), errors, warnings);
  }

  let prdCoverage = null;
  if (prdPath) {
    prdCoverage = validatePrdCoverage(prdPath, parsedTasks, taskFiles, errors);
  }

  let mockupCoverage = null;
  if (mockupsPath && !indexOnly) {
    mockupCoverage = validateMockupCoverage(mockupsPath, taskFiles, errors);
  }

  warnings.forEach((warning) => {
    process.stderr.write(`Warning:${warning.line > 0 ? ` line ${warning.line}` : ''}: ${warning.message}\n`);
  });
  errors.forEach((error) => {
    process.stderr.write(`Error:${error.line > 0 ? ` line ${error.line}` : ''}: ${error.message}\n`);
  });

  const result = {
    found: true,
    valid: errors.length === 0,
    errors,
    warnings,
    taskCount: parsedTasks.length,
    taskNumbers,
    taskFiles,
    tasksIndexPath,
    prdCoverage,
    mockupCoverage,
  };
  // Intentional: exit 0 even when `valid` is false. The validation verdict is the
  // `valid`/`errors` JSON on stdout (the model consumes it, per the superpowers
  // script convention) — a failed validation is a normal result, not a process
  // error. Non-zero exits are reserved for usage errors (usage()) and unreadable
  // files. Do NOT switch this to exit on invalid: the test suite parses stdout and
  // asserts `valid:false` with exit 0 (validate-tasks.coverage / -prd), and a
  // consumer must read `valid`, never `$?`.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
