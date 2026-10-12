#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateReach } = require('./reach-checks.cjs');
const { validateSpecTrace } = require('./spec-trace.cjs');

const HELP = `
validate-tasks.cjs — Validate a super.writing-plans tasks index AND its task files.

Usage:
  node scripts/validate-tasks.cjs --tasks-index <path> [--index-only] [--prd <path>] [--mockups <dir>] [--repo-root <dir>] [--keep-briefing]

Options:
  --tasks-index <path>  Path to tasks index markdown file
  --index-only          Validate only the index format (skip per-file checks). Run it once the
                        index and the task-writer briefing are on disk, before dispatching the
                        writer: when plans/task-writer-briefing.md exists it also checks the
                        briefing's ## Runner de testes section (see below)
  --keep-briefing       Do NOT remove the transient plans/task-writer-briefing.md on a clean
                        full validation. By default a passing full run deletes it (it is a
                        writing-plans handoff artifact, not part of the plan); pass this to
                        keep it for debugging. No-op under --index-only or when validation fails.
  --prd <path>          PRD to cross-check FR coverage against. When given, every FR-NNN
                        declared in the PRD must be covered by at least one task-file title,
                        and a PRD with FRs but task titles carrying no FR tags is flagged (closes the
                        silent "PRD exists but FR tags forgotten" gap). Omit for spec-only plans.
                        No-op under --index-only (the titles live in the task files).
  --mockups <dir>       Curated-mockups directory (specs/mockups/) to cross-check visual
                        coverage against. When given and the directory holds at least one
                        curated artifact, at least one task must reference it via a
                        "### Fidelidade Visual" subsection — otherwise the durable visual
                        decision is silently dropped. Mirrors --prd; omit for non-visual plans.
  --repo-root <dir>     Repository root to cross-check the plan's *reach* against the real
                        codebase. Reach proves the plan covers what the change
                        touches. Enables three checks (see
                        reach-checks.cjs): importers of a modified file that are in no
                        write-set, enrollment/registry files that list the siblings of a
                        created file, and the repo's full test-suite inventory (ERROR when a
                        declared test file matches no runner config). Omit to keep the
                        plan-only behaviour.
  --help                Show usage and exit 0

Index checks: sequential numbering, line format, .md references, duplicates, titles, the
index SHAPE (ERROR on a heading other than the three sections, on a header line other than the
title / **Spec:** / **PRD:** / ---, on prose outside a bullet, or on an [FR-XXX] tag in a task
line — the index is a tracker, nothing in it has a reader beyond those).
Per-file checks (default, unless --index-only):
  - each referenced task-NN.md physically exists
  - each task file declares the required headers: **Status:** **PRD:** **Spec:**
  - the FR-XXX tags (or legacy RF-XXX) a task implements are declared in its task file's
    "# Task N: <title> [FR-XXX]" heading; one cited only in the body is a WARNING
  - consumption ordering (**Consome:** only cites earlier tasks) is parse-plan.cjs's check,
    run at self-review right after this one
Briefing runner (--index-only, only when plans/task-writer-briefing.md exists — the pre-dispatch
run; a plan of at most four tasks has no briefing): the briefing carries a "## Runner de testes" section, one
bullet per workspace and test kind, and every line that cites a backticked command (a span with a
space) has one with a per-file target placeholder (\`<arquivo>\`, \`<file>\`...). ERROR otherwise — the task writer copies its Run: lines from
here and nowhere else. Result under \`briefingRunner\`.
Spec trace (no flag; the spec is the index's **Spec:** line, resolved against the index dir,
then --repo-root): every AC-NN / INV-NN the spec defines is a line of some task's
## Critérios de Sucesso — "- AC-03 [unit|int|db|unverified]: <spec text>" — with the spec's
text (whitespace-normalized; AC without its origin); an ID the spec does not define, a missing
level token or a different text is an ERROR, and so is an AC/INV on an index line. When the spec
has a migration block, its **Mecanismo:** and **Critério de fim:** are copied the same way
("- **Mecanismo:** <spec text>") and a ## Foco de Revisão line names that task (ERROR). A spec
not found, or with no AC, is a WARNING that the trace is off. An INV the spec guarantees by db or
app+lock is [db]/[int] with " · Run: <cmd>" naming a test file of the task, or [unverified] with
"conferência: <query>" (ERROR otherwise; listed under specTrace.unverified); a [db]/[int] task whose
tests skip on a missing env var, and a spec risk scored 6+ no task cites and no
"(ação humana · <dono> · <prazo>)" marks, are WARNINGS. A traced ID that no test name in
its task carries is a WARNING. Result under \`specTrace\`.
Review Focus (WARNINGS, never errors — the list is the author's judgment, the script proves
its shape): the index carries a ## Foco de Revisão section; it lists at most 5 items; each
item names an owning task-NN that exists; and (full run only) that task's ## Passos carries
a "Review Focus:" step pinning the item with a test. Result under \`reviewFocus\`.
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
  let repoRoot = null;
  let keepBriefing = false;
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
    if (arg === '--keep-briefing') {
      keepBriefing = true;
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
    if (arg === '--repo-root') {
      if (!args[index + 1]) usage('--repo-root <dir> is required');
      repoRoot = args[index + 1];
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
    repoRoot: repoRoot ? path.resolve(repoRoot) : null,
    keepBriefing,
  };
}

const BRIEFING_FILENAME = 'task-writer-briefing.md';

/**
 * Remove the transient task-writer briefing once the plan it produced validates cleanly.
 *
 * `plans/task-writer-briefing.md` is a handoff artifact of the super.writing-plans "Task File
 * Writing" section: the orchestrator writes the research digest + full decomposition + per-task skill
 * list to it purely to hand the writer subagent a file pointer instead of a tens-of-KB dispatch
 * argument. It is NOT part of the plan — the validator never reads it, the tasks index never
 * references it, and execution skills never consume it. Once the task files it produced pass
 * full validation it has served its only purpose; left behind it just clutters plans/.
 *
 * This is the single deterministic "the tasks passed" moment, so cleanup belongs here — but only
 * on a clean FULL validation. It is skipped under --index-only (per-file validity was never
 * established) and when any error exists (a failing run means the writer will be handed the
 * briefing again to fix the files — deleting it mid-loop would strand the fix). Cleanup never
 * affects the validation verdict: a failed unlink degrades to a warning, never an error.
 */
function cleanupBriefing(indexDir, valid, indexOnly, keepBriefing, warnings) {
  const briefingPath = path.join(indexDir, BRIEFING_FILENAME);
  const cleanup = { path: briefingPath, existed: false, removed: false };
  if (indexOnly || !valid || keepBriefing) return cleanup;
  try {
    fs.unlinkSync(briefingPath);
    cleanup.existed = true;
    cleanup.removed = true;
  } catch (err) {
    if (err.code === 'ENOENT') return cleanup;
    cleanup.existed = true;
    warnings.push({ line: 0, message: `Could not remove transient ${BRIEFING_FILENAME}: ${err.message}` });
  }
  return cleanup;
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
];

/** Recommended, not required — see the warning where it is used. */
const TIER_FIELD = /^\*\*Tier:\*\*\s*(cheap|standard|capable)\s*$/imu;

// A task references the curated mockup via the "### Fidelidade Visual" subsection
// (## or ### heading). This is the marker the writing-plans template emits.
const VISUAL_LINK_PATTERN = /^#{2,3}\s+Fidelidade Visual\b/imu;

// ─── Briefing runner ─────────────────────────────────────────────────────────
// The task writer copies every `Run:` line's runner from the briefing (the index stopped carrying
// `**Tech Stack:**` on 2026-09-24). Measured over 12 real briefings: 4 had no per-file command at
// all — none, or only a form that runs the whole suite (`pnpm --filter <app> test -- --run`,
// `test:run`) — because the verified form lived in the index line. Checked before the writer is
// dispatched, so the gap is closed by the controller that holds the research, not guessed by the
// writer from the repo's instructions file (which, in one measured repo, documented a form that
// collects nothing).
const BRIEFING_RUNNER_HEADING = /^##\s+(?:Runner de testes|Test runner)\s*$/iu;
const RUNNER_TARGET = /<[^<>`]+>/u;

function validateBriefingRunner(briefingPath, errors) {
  const result = { checked: false, path: briefingPath, commands: [] };
  let content;
  try {
    content = fs.readFileSync(briefingPath, 'utf8');
  } catch {
    return result; // no briefing (a plan of at most four tasks, or not written yet): nothing to check
  }
  result.checked = true;
  const lines = content.split(/\r?\n/u);
  const start = lines.findIndex((line) => BRIEFING_RUNNER_HEADING.test(line));
  if (start < 0) {
    errors.push({
      line: 0,
      message: `${BRIEFING_FILENAME} has no \`## Runner de testes\` section. The task writer copies every \`Run:\` line from it and reads the runner nowhere else. Add it before dispatching the writer: one bullet per workspace and test kind (unit, integration, e2e) with the per-file command the research ran and the target as a placeholder — e.g. \`- <workspace> · <kind>: \\\`<command> <arquivo>\\\` (verificado: 1 arquivo coletado)\` — plus, when the repo's instructions file documents a form that does not narrow, that form marked as not to use.`,
    });
    return result;
  }
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/u.test(line)) break;
    section.push(line);
  }
  // A backticked span with whitespace is a command; a bare path, workspace or package name is
  // not, and neither is a `key: value` config entry (`globals: true`). Judged per line: a bullet
  // that cites commands needs one with a per-file target — the rest of it may explain (`o script
  // já é \`vitest run\``), but a bullet whose only command runs the whole suite is the gap.
  for (const line of section) {
    const commands = [...line.matchAll(/`([^`\n]+)`/gu)]
      .map((m) => m[1].trim())
      .filter((span) => /\s/u.test(span) && !/^[\w.-]+:\s/u.test(span));
    result.commands.push(...commands);
    if (commands.length > 0 && !commands.some((c) => RUNNER_TARGET.test(c))) {
      errors.push({ line: 0, message: `${BRIEFING_FILENAME}'s \`## Runner de testes\` has a command with no per-file target: \`${commands[0]}\`. A task's \`Run:\` line names the narrowest unit the runner accepts; write the form that takes one file, with the target as a placeholder (\`<arquivo>\`). A whole-suite command has no place here: the final gate resolves it from the project's own scripts.` });
    }
  }
  if (result.commands.length === 0) {
    errors.push({ line: 0, message: `${BRIEFING_FILENAME}'s \`## Runner de testes\` names no command. Write the per-file command per workspace and test kind, in backticks, with the target as a placeholder (\`<command> <arquivo>\`).` });
  }
  return result;
}

// ─── Index shape ─────────────────────────────────────────────────────────────
// The index is a tracker with a fixed shape: a header (title, **Spec:**, **PRD:**, `---`)
// and three sections, each a bullet list. Every consumer reads it by
// heading or by line pattern, so anything else — a verification-command inventory, the
// answer to a validator warning, a note to the executor — has no reader and only dilutes
// what the checkboxes say. ERROR, not warning: a planner that answered two
// reach warnings by writing the answers into the header is the measured failure mode.
const INDEX_SECTION_HEADERS = [
  /^##\s+(?:Tarefas|Tasks)\s*$/iu,
  /^##\s+(?:Restrições Globais|Restricoes Globais|Global Constraints)\s*$/iu,
  /^##\s+(?:Foco de Revisão|Foco de Revisao|Review Focus)\s*$/iu,
];
const INDEX_HEADER_FIELD = /^\*\*(?:Spec|PRD):\*\*/u;
const INDEX_SECTION_LIST = '`## Tarefas`, `## Restrições Globais`, `## Foco de Revisão`';
// **Tech Stack:** left the index on 2026-09-24: its one reader was the task writer, and the
// briefing the writer reads first already carries the verified per-file command (measured on
// the consumer plan `tasks-replaced-visual-redesign.md`: the same command, plus the form not to
// use). Past planning, the task files' `Run:` lines carry it to every implementer.
const TECH_STACK_FIELD = /^\*\*Tech Stack:\*\*/u;

function excerpt(line) {
  const text = line.trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function validateIndexShape(content, errors) {
  const lines = content.split(/\r?\n/u);
  let inComment = false;
  let section = null; // null = header block, before the first known section
  let skipUnknown = false;
  let prevAllowed = false; // previous non-blank line was a field or a bullet → a wrapped continuation is fine

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const lineNumber = index + 1;
    if (inComment) {
      if (/-->/u.test(line)) inComment = false;
      return;
    }
    if (/^\s*<!--/u.test(line)) {
      if (!/-->/u.test(line)) inComment = true;
      return;
    }
    if (line.trim() === '') {
      prevAllowed = false;
      return;
    }
    const heading = line.match(/^(#{1,6})\s+\S/u);
    if (heading) {
      prevAllowed = false;
      if (heading[1] === '#' && section === null) return; // the title
      if (heading[1] === '##' && INDEX_SECTION_HEADERS.some((re) => re.test(line))) {
        section = line;
        skipUnknown = false;
        return;
      }
      errors.push({
        line: lineNumber,
        message: `Unknown section \`${excerpt(line)}\` in the tasks index. The index has exactly three sections — ${INDEX_SECTION_LIST} — and no reader for any other. Delete it: context for an implementer belongs in its task file, context for a reviewer in \`## Restrições Globais\` or \`## Foco de Revisão\`.`,
      });
      section = line;
      skipUnknown = true;
      return;
    }
    if (skipUnknown) return;
    if (section === null) {
      if (INDEX_HEADER_FIELD.test(line) || /^---\s*$/u.test(line)) {
        prevAllowed = true;
        return;
      }
      if (prevAllowed && !/^\*\*/u.test(line)) return; // wrapped continuation of a field
      if (TECH_STACK_FIELD.test(line)) {
        errors.push({
          line: lineNumber,
          message: '**Tech Stack:** has no reader in the tasks index. The per-file test command the research verified goes in the task-writer briefing, and the task files\' `Run:` lines carry it to the implementer. Delete the line (and any continuation) from the index.',
        });
        prevAllowed = false;
        return;
      }
      errors.push({
        line: lineNumber,
        message: `Index header line has no reader: \`${excerpt(line)}\`. Before \`## Tarefas\` only the title, **Spec:**, **PRD:** and \`---\` belong. Delete it — a validator warning is answered by changing the plan, never by writing the answer here; the executor resolves the project's verification commands itself.`,
      });
      prevAllowed = false;
      return;
    }
    if (/^\s*[-*]\s+/u.test(line)) {
      prevAllowed = true;
      return;
    }
    if (prevAllowed && /^\s+\S/u.test(line)) return; // indented continuation of a bullet
    errors.push({
      line: lineNumber,
      message: `Prose outside a bullet in \`${excerpt(section)}\`: \`${excerpt(line)}\`. Each section of the index is one bullet per item and nothing else. Delete it — context for an implementer belongs in its task file.`,
    });
    prevAllowed = false;
  });
}

function validateTasksIndex(content) {
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
      if (extractRequirementTokens(rawTitle).length > 0) {
        errors.push({
          line: lineNumber,
          message: `Task ${taskNumber}'s index line carries FR tags (${extractRequirementTokens(rawTitle).join(', ')}). The FR ids a task implements live in its task file's title (\`# Task ${taskNumber}: <title> [FR-XXX]\`), where coverage and the QA gate read them; the index line is \`- [ ] N. <title> → \`task-NN.md\`\`. Move them to the task file's title and drop them here.`,
        });
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
  validateIndexShape(content, errors);

  return { errors, warnings, taskNumbers, parsedTasks };
}

/**
 * Read every referenced task file body from disk ONCE, keyed by task number. Both the per-file
 * validation and the shared-resource consistency check consume these bodies — reading here and
 * threading the result halves the file I/O the two checks used to do independently. Each entry
 * records existence and any read error so consumers reproduce the same error/skip behavior they
 * had when they read the file themselves.
 */
function readTaskBodies(parsedTasks, indexDir) {
  const bodies = new Map();
  for (const task of parsedTasks) {
    const filePath = path.join(indexDir, task.taskFile);
    const entry = { filePath, exists: true, body: null, readError: null };
    try {
      entry.body = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') entry.exists = false;
      else entry.readError = err;
    }
    bodies.set(task.taskNumber, entry);
  }
  return bodies;
}

/**
 * Validate each referenced task file on disk: existence, required headers, and
 * functional-requirement traceability (FR-XXX, or legacy RF-XXX) against the
 * index line. Mutates errors/warnings; returns the per-file detail records.
 * Consumes the pre-read `bodies` map (see readTaskBodies) — no file I/O of its own.
 */
function validateTaskFiles(parsedTasks, bodies, errors, warnings) {
  return parsedTasks.map((task) => {
    const record = {
      taskNumber: task.taskNumber,
      file: task.taskFile,
      exists: false,
      missingHeaders: [],
      rfInTitle: [],
      rfInFile: [],
      visualLinked: false,
      mockupRefs: [],
    };

    const entry = bodies.get(task.taskNumber);
    if (!entry.exists) {
      errors.push({ line: task.lineNumber, message: `Referenced task file does not exist on disk: ${task.taskFile}` });
      return record;
    }
    record.exists = true;

    if (entry.readError) {
      errors.push({ line: task.lineNumber, message: `Could not read task file ${task.taskFile}: ${entry.readError.message}` });
      return record;
    }
    const body = entry.body;

    for (const header of REQUIRED_HEADERS) {
      if (!header.pattern.test(body)) {
        record.missingHeaders.push(header.label);
        errors.push({ line: task.lineNumber, message: `Task file ${task.taskFile} is missing the required ${header.label} header.` });
      }
    }

    // `**Tier:**` is RECOMMENDED, not required: writing-plans allows omitting it, and the
    // executor falls back to parse-plan's `suggestedTier`. But nothing used to say so at
    // plan time, so plans shipped without it and the execution skill went on claiming
    // "each task carries a **Tier:**". A warning names the gap where it is cheap to fix —
    // in the plan — instead of leaving the executor to discover it per dispatch.
    record.tierPresent = TIER_FIELD.test(body);
    if (!record.tierPresent) {
      warnings.push({
        line: task.lineNumber,
        message: `Task file ${task.taskFile} has no **Tier:** header — the executor will fall back to parse-plan's suggestedTier. Write it explicitly (cheap | standard | capable) so the tier is auditable in the plan rather than recomputed at dispatch.`,
      });
    }

    record.visualLinked = VISUAL_LINK_PATTERN.test(body);
    record.mockupRefs = [...body.matchAll(/specs\/mockups\/([^\s`)\]]+)/giu)].map((m) => m[1]);
    // The task file's `# Task N: <title> [FR-XXX]` heading declares the FRs the task implements:
    // PRD coverage counts them, and the QA gate maps a failed story to its task through them
    // (parse-tasks.cjs → `requirements`). One cited only in the body is a softer signal.
    const heading = body.match(/^#\s+Task\s+\d+\s*:\s*(.+)$/mu);
    record.rfInTitle = heading ? extractRequirementTokens(heading[1]) : [];
    record.rfInFile = extractRequirementTokens(body);
    for (const rf of record.rfInFile.filter((rf) => !record.rfInTitle.includes(rf))) {
      warnings.push({ line: task.lineNumber, message: `${rf} appears in ${task.taskFile} but is not declared in its title (\`# Task ${task.taskNumber}: <title> [FR-XXX]\`), so neither PRD coverage nor the QA gate counts it for task ${task.taskNumber}.` });
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
  // An FR is "covered" when a task file's title declares it — the one place the QA gate reads.
  const covered = new Set();
  for (const file of taskFiles) {
    for (const rf of file.rfInTitle || []) covered.add(rf);
  }
  const uncoveredRequirements = prdRequirements.filter((fr) => !covered.has(fr));
  if (prdRequirements.length > 0 && covered.size === 0) {
    errors.push({
      line: 0,
      message: `PRD declares ${prdRequirements.length} functional requirement(s) (${prdRequirements.join(', ')}) but no task file's title carries an [FR-XXX] tag — traceability is missing.`,
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

// ─── Shared-resource declaration consistency (cross-task) ──────────────────────

// Match a resource-declaration call shaped `fn(<name>, { ...opts })`: an identifier called with a
// resource-name first argument and a flat object-literal second argument. The name may be a
// string literal ('webhook.delivery') OR a bareword const (WEBHOOK_QUEUE) — real task snippets use
// both, and keying only off quoted strings (as v1 did) went blind to the const form. `[^{}]*` keeps
// it to flat config objects — the shape infra declarations take.
const RESOURCE_DECL_RE = /([A-Za-z_$][\w$]*)\s*\(\s*(?:(['"`])([^'"`]+)\2|([A-Za-z_$][\w$]*))\s*,\s*\{([^{}]*)\}\s*\)/gu;
// A *bare* declaration — same fn + resource name, but no options object at all: `fn(<name>)`. This is
// how an omission clash hides (amqplib `assertQueue(q)` re-applies the default `durable:false`).
const BARE_DECL_RE = /([A-Za-z_$][\w$]*)\s*\(\s*(?:(['"`])([^'"`]+)\2|([A-Za-z_$][\w$]*))\s*\)/gu;
// Within the opts, only boolean flags are compared (see validateSharedResourceConsistency rationale).
const BOOL_FLAG_RE = /([A-Za-z_$][\w$]*)\s*:\s*(true|false)\b/gu;
// Curated infra-declaration flags whose *omission* on a re-declaration is a genuine runtime hazard,
// because the driver/ORM applies a default that can clash with an explicit value elsewhere (amqplib
// assertQueue → durable:false; unique/nullable on a column; exclusive on a queue). Restricting the
// omission check to this allowlist keeps false positives low: omitting a non-infra boolean (a UI
// `visible`, a feature toggle) is not a cross-task hazard, so it stays quiet.
const INFRA_FLAGS = new Set(['durable', 'exclusive', 'autoDelete', 'persistent', 'unique', 'nullable', 'primary', 'cascade']);

function declKey(fn, strName, identName) {
  return strName != null ? `${fn}('${strName}')` : `${fn}(${identName})`;
}

// Get map[key], creating it with make() on first miss. Collapses the repeated
// get-or-create idiom used while building the nested resource→flag→value→tasks maps.
function getOrSet(map, key, make) {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

function extractResourceDecls(body) {
  const flagged = [];
  const bare = [];
  let m;
  RESOURCE_DECL_RE.lastIndex = 0;
  while ((m = RESOURCE_DECL_RE.exec(body)) !== null) {
    const fn = m[1];
    const key = declKey(fn, m[3], m[4]);
    const optsBody = m[5];
    const flags = {};
    let f;
    BOOL_FLAG_RE.lastIndex = 0;
    while ((f = BOOL_FLAG_RE.exec(optsBody)) !== null) {
      flags[f[1]] = f[2];
    }
    // Only declarations carrying at least one boolean flag are considered — a call with purely
    // numeric/string args (i18n counts, ids) is exactly the legitimate-divergence case we skip.
    if (Object.keys(flags).length === 0) continue;
    flagged.push({ key, fn, flags });
  }
  BARE_DECL_RE.lastIndex = 0;
  while ((m = BARE_DECL_RE.exec(body)) !== null) {
    bare.push({ key: declKey(m[1], m[3], m[4]) });
  }
  return { flagged, bare };
}

/**
 * Cross-check shared-resource declaration consistency across task files. A named infrastructure
 * resource (queue, table, topic, cache) declared in two tasks with contradictory BOOLEAN
 * configuration flags is a runtime break waiting to happen — RabbitMQ drops the channel with
 * PRECONDITION_FAILED when the same queue is re-asserted with a divergent `durable`; an ORM/DDL
 * migration diverges on `unique`/`nullable`; and so on. A single sequential author loses track of
 * the first declaration by the time they write the second — this is the author-blind class that the
 * review's spec↔tasks lens exists to catch, pulled one stage earlier where a script (which has no
 * blind spot) flags it deterministically, so the later review comes back clean.
 *
 * Heuristic, boolean-only by design: it compares only flags whose value is a boolean literal. Infra
 * declaration flags (durable, persistent, autoDelete, exclusive, unique, nullable, primary, cascade)
 * are overwhelmingly boolean, while the numeric/string args that legitimately differ across tasks are
 * ignored — keeping false positives low. Emitted as a WARNING, never an error: the author may have a
 * genuine reason for divergent flags (two truly distinct resources that share a call shape), so the
 * verdict stays theirs; the gate's job is only to make the conflict impossible to miss.
 */
function validateSharedResourceConsistency(parsedTasks, bodies, warnings) {
  // resourceKey -> flag -> (value -> Set(taskNumber))
  const byKey = new Map();
  // resourceKey -> Set(taskNumber) that re-declare it *bare* (no options object at all)
  const bareByKey = new Map();
  for (const task of parsedTasks) {
    const entry = bodies.get(task.taskNumber);
    if (!entry || !entry.exists || entry.readError) continue;
    const { flagged, bare } = extractResourceDecls(entry.body);
    for (const decl of flagged) {
      const flagMap = getOrSet(byKey, decl.key, () => new Map());
      for (const [flag, value] of Object.entries(decl.flags)) {
        const valueMap = getOrSet(flagMap, flag, () => new Map());
        getOrSet(valueMap, value, () => new Set()).add(task.taskNumber);
      }
    }
    for (const decl of bare) {
      getOrSet(bareByKey, decl.key, () => new Set()).add(task.taskNumber);
    }
  }
  const conflicts = [];
  const tasksOf = (valueMap) => {
    const all = new Set();
    for (const set of valueMap.values()) for (const t of set) all.add(t);
    return all;
  };
  for (const [key, flagMap] of byKey) {
    for (const [flag, valueMap] of flagMap) {
      // (1) Literal divergence: the same flag carries ≥2 distinct literal values across tasks.
      if (valueMap.size >= 2) {
        const detail = [...valueMap.entries()].map(
          ([value, taskSet]) => `${flag}:${value} in task(s) ${[...taskSet].sort((a, b) => a - b).join(', ')}`,
        );
        conflicts.push({ resource: key, flag, kind: 'divergent', detail });
        warnings.push({
          line: 0,
          message: `Shared resource ${key} is declared with a divergent ${flag} across tasks (${detail.join(' vs ')}). Re-declaring the same resource with contradictory flags breaks at runtime (e.g. RabbitMQ PRECONDITION_FAILED). Unify the declaration or split into genuinely distinct resources.`,
        });
        continue; // the literal warning already covers this flag; skip the omission check for it
      }
      // (2) Omission divergence: an infra flag is set in one task but the same resource is
      // re-declared *bare* (no opts) in another — the driver then applies its default, which can
      // clash with the explicit value. Restricted to the curated infra-flag allowlist to stay quiet
      // on harmless UI/toggle booleans.
      if (!INFRA_FLAGS.has(flag)) continue;
      const bareTasks = bareByKey.get(key);
      if (!bareTasks || bareTasks.size === 0) continue;
      const setTasks = tasksOf(valueMap);
      const omitTasks = [...bareTasks].filter((t) => !setTasks.has(t));
      if (omitTasks.length === 0) continue;
      const setList = [...setTasks].sort((a, b) => a - b).join(', ');
      const omitList = omitTasks.sort((a, b) => a - b).join(', ');
      const detail = [`${flag} set in task(s) ${setList}`, `omitted (bare re-declaration) in task(s) ${omitList}`];
      conflicts.push({ resource: key, flag, kind: 'omission', detail });
      warnings.push({
        line: 0,
        message: `Shared resource ${key} declares ${flag} in task(s) ${setList} but is re-declared bare (no options) in task(s) ${omitList}, which falls back to the driver default for ${flag}. A default that differs from the explicit value breaks at runtime (e.g. RabbitMQ assertQueue defaults durable:false → PRECONDITION_FAILED). Declare ${flag} consistently on every re-declaration, or reference the resource without re-declaring it.`,
      });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

// ─── Task step scope: no checkpoint-owned commands, no de-scoping test command ───
//
// A task file's `## Passos` is pasted VERBATIM into the implementer's prompt, and
// the same text reaches the reviewer as `{PLAN_OR_REQUIREMENTS}`. So a step that
// says "run the full suite" is not advice the execution skill can override — it is
// an instruction competing with the skill's prohibition, and it usually wins,
// because it arrives labelled as a Critério de Sucesso.
//
// Measured on a real 12-task plan: 12/12 task files carried a "run the whole
// backend suite + typecheck" step, and the session hand-rolled 40 unscoped test
// runs, 17 typechecks and 10 formatter-in-fix-mode runs — the full-suite
// checkpoint exists to do all four ONCE per batch.
//
// The prose rule lives in references/required-task-step-pattern.md. This is the
// mechanism, because a prohibition in prose loses to an instruction in prose.
//
// Deliberately stack-neutral: matched by ROLE (test runner, typecheck/compile,
// build, formatter in fix mode) with per-ecosystem spellings as alternatives, so
// the check still has a referent in a Python, Go or Rust repo.
const STEPS_SECTION = /^##\s+(?:Passos|Steps)\s*$/imu;
const CRITERIA_SECTION = /^##\s+(?:Critérios de Sucesso|Criterios de Sucesso|Success Criteria)\s*$/imu;

const PKG_MANAGER = String.raw`(?:pnpm|npm|yarn|bun|npx|turbo)`;
// The closing boundary is `(?![\w-])`, not `\b`: a hyphen is a word boundary, so `\b` made the
// plugin names an ecosystem spells with the runner as prefix (`pytest-playwright`, `pytest-cov`,
// `jest-dom`) read as the bare runner — a dependency named in an "Expected:" line was flagged as
// the whole suite and the task writer rewrote a correct step to satisfy the check.
const TEST_RUNNER = /\b(?:pytest|vitest|jest|mocha|rspec|phpunit|go test|cargo test|mix test|dotnet test|gradle test|mvn test)(?![\w-])/u;
const TEST_SCRIPT = new RegExp(String.raw`\b${PKG_MANAGER}\b[^|;&]*?\btest(?::[\w-]+)?\b`, 'u');
/** A file/node-id argument — the narrowest target most runners accept. */
const FILE_TOKEN = /(?:\S+\.(?:py|ts|tsx|js|jsx|mjs|cjs|rb|go|rs|java|kt|php|ex|exs|cs|swift|scala)\b|::\S+)/u;
/**
 * Not every ecosystem narrows by FILE. Go's scoped form is a package path
 * (`go test ./internal/user`), and requiring a file extension would flag the only
 * correct spelling it has. So the real signal is "names a target at all" — with
 * two exclusions, or the check would pass commands that are the whole suite:
 *   - the whole-tree wildcard (`./...`), which is Go's spelling for every package;
 *   - the value of a WORKSPACE selector, which picks a project, not a test target
 *     (`pnpm --filter ./apps/frontend test` runs that workspace's entire suite).
 */
const WHOLE_TREE = /(?:^|\s)\.{0,2}\/?\.\.\.(?:\s|$)/u;
const WORKSPACE_FLAG = /\s(?:--filter|-F|--project|--prefix|--cwd|--dir|-C)(?:=|\s+)\S+/gu;
const PATH_TOKEN = /(?:^|\s)[.\w@-]*\/\S*/u;
const NAME_ONLY_FILTER = /(?:\s-t\s|--testNamePattern\b|\s-k\s|--test-name-pattern\b)/u;
/** `<pm> test -- <path>`: the package script can drop the path before the runner sees it. */
const DASH_DASH_WRAPPER = /\s--\s/u;

const FIX_MODE = /(?:--write\b|--fix\b|\b[\w:-]*:fix\b|\bgofmt\s+-w\b|\bcargo\s+fmt\b|\bmix\s+format\b|\bruff\s+format\b|\brubocop\s+-a\b|\bblack\s+\S)/u;
const TYPECHECK = /(?:\btsc\b[^|;&]*--noEmit\b|\b[\w-]*tsc:check\b|\btype-?check\b|\bmypy\b|\bpyright\b|\bcargo\s+check\b|\bgo\s+vet\b|\bgo\s+build\b)/u;
const BUILD = new RegExp(String.raw`(?:\b${PKG_MANAGER}\b[^|;&]*?\bbuild\b|\btsup\b|\bnext\s+build\b|\bcargo\s+build\b|\bgradle\s+build\b|\bmvn\s+package\b)`, 'u');

/** The text of one `## <Header>` section, up to the next `##` at the same level. */
function sectionText(body, headerPattern) {
  const m = body.match(headerPattern);
  if (!m) return '';
  const start = m.index + m[0].length;
  const rest = body.slice(start);
  const next = rest.search(/^##\s+/mu);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Command-looking spans: lines of fenced shell blocks plus inline backtick spans.
 * Scanning only Passos/Critérios keeps prose that merely *mentions* a command (a
 * Visão Geral naming a generated-artifact prerequisite, say) out of the check.
 */
function extractCommandCandidates(text) {
  const out = [];
  const fence = /```(?:bash|sh|shell|console|zsh)\n([\s\S]*?)```/giu;
  let m;
  while ((m = fence.exec(text)) !== null) {
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) out.push(t);
    }
  }
  for (const inline of text.matchAll(/`([^`\n]+)`/gu)) out.push(inline[1].trim());
  return out;
}

function classifyCommand(cmd) {
  if (FIX_MODE.test(cmd)) return 'formatter/linter in fix mode';
  if (BUILD.test(cmd)) return 'build';
  if (TYPECHECK.test(cmd)) return 'typecheck/compile step';
  const isTest = TEST_RUNNER.test(cmd) || TEST_SCRIPT.test(cmd);
  if (!isTest) return null;
  const selectable = cmd.replace(WORKSPACE_FLAG, ' ');
  const narrows = FILE_TOKEN.test(selectable) || (PATH_TOKEN.test(selectable) && !WHOLE_TREE.test(selectable));
  if (narrows) {
    // Names a target AND routes it through a package script's `--`: looks scoped,
    // measured at 130 collected files against 1 for the direct runner form.
    return DASH_DASH_WRAPPER.test(cmd) ? 'test command whose path is swallowed by `--`' : null;
  }
  if (NAME_ONLY_FILTER.test(cmd)) return 'test command filtered by name with no test target';
  return 'full test suite';
}

/**
 * Flags checkpoint-owned commands and de-scoping test commands inside task steps and
 * success criteria. Errors, not warnings: every one of these reaches an implementer
 * as an instruction, and the cost is paid on every task of the plan.
 */
function validateTaskStepScope(parsedTasks, bodies, errors) {
  const findings = [];
  for (const task of parsedTasks) {
    const entry = bodies.get(task.taskNumber);
    if (!entry || !entry.exists || entry.readError) continue;
    const scanned = `${sectionText(entry.body, STEPS_SECTION)}\n${sectionText(entry.body, CRITERIA_SECTION)}`;
    const seen = new Set();
    for (const cmd of extractCommandCandidates(scanned)) {
      const kind = classifyCommand(cmd);
      if (!kind || seen.has(kind)) continue;
      seen.add(kind);
      findings.push({ taskNumber: task.taskNumber, file: task.taskFile, kind, command: cmd });
      errors.push({
        line: task.lineNumber,
        message: `${task.taskFile} prescribes the ${kind} (\`${cmd}\`). `
          + 'Task steps are pasted verbatim into the implementer prompt, so this becomes an instruction '
          + 'that outranks the execution skill. The full-suite checkpoint runs lint/typecheck/test/build '
          + 'once per batch — see references/required-task-step-pattern.md, "Steps you must never write".',
      });
    }
  }
  return { checked: parsedTasks.length, findings, clean: findings.length === 0 };
}

// ─── ## Arquivos manifests (write-set for reach, test-set for the runner check) ─
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/imu;
const READ_VERB = /^(?:read|reference|inspect|view|consult|ler|referenciar|referencia|referência|inspecionar|consultar|ver)$/iu;

const TEST_VERB = /^(?:test|tests|teste|testes)$/iu;
const MANIFEST_VERB = /^\s*[-*]\s*([A-Za-zÀ-ÿ]+)\s*:/u;
const BACKTICK_SPAN = /`([^`]+)`/gu;

/**
 * Read a task body's `## Arquivos`/`## Files` manifest in one pass.
 *
 * `writeSet`: Create/Modify/Test (and pt-BR equivalents) are writes; an explicit read verb
 * is a read; unknown/absent verb defaults to write (a missed write is worse than an
 * over-cautious one). `testSet`: the `Test:`/`Teste:` entries, kept separate because
 * reach's suite check asks a different question of them — not "who else writes this
 * file" but "which runner would ever select it". Subsections after the manifest
 * (### Fidelidade Visual, ### Skills a invocar) are excluded by
 * breaking at the next heading of any level.
 */
function parseArquivosManifest(body) {
  let inSection = false;
  const writes = new Set();
  const tests = new Set();
  for (const line of body.split(/\r?\n/u)) {
    if (FILES_SECTION.test(line)) { inSection = true; continue; }
    if (!inSection) continue;
    if (/^#{2,}\s+/u.test(line)) break;
    const verbMatch = line.match(MANIFEST_VERB);
    const verb = verbMatch ? verbMatch[1] : '';
    if (verb !== '' && READ_VERB.test(verb)) continue;
    const isTest = verb !== '' && TEST_VERB.test(verb);
    for (const m of line.matchAll(BACKTICK_SPAN)) {
      const p = m[1].trim();
      if (!(p.includes('/') || /\.[a-z0-9]+$/iu.test(p))) continue;
      writes.add(p);
      if (isTest) tests.add(p);
    }
  }
  return { writeSet: [...writes].sort(), testSet: [...tests].sort() };
}

// ─── Forward references across tasks (warning-level) ─────────────────────────
//
// Tasks run in index order and each implementer reads only its own task file. A code block in
// task N that imports a symbol whose first `export` appears in a LATER task M cannot compile at
// N: the implementer either stubs the symbol inside N's review (a write-set conflict with M) or
// stops. A real plan shipped this — task 2's use cases imported an IoC identifier task 4 created;
// the task review flagged the write-set leak and the controller had to rule on it mid-run. The
// sequential writer loses sight of it because it never re-reads task N after writing task M.
// Heuristic, so a warning: only imported names are checked, and with --repo-root a symbol the
// repository already exports is not a forward reference (task M is modifying it).

const EXPORT_DECL = /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gu;
const IMPORT_NAMED = /\bimport\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gu;

function codeBlocks(body) {
  const out = [];
  const re = /^\s*```[^\n]*\n([\s\S]*?)^\s*```/gmu;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out.join('\n');
}

function importedNames(code) {
  const names = new Set();
  let m;
  IMPORT_NAMED.lastIndex = 0;
  while ((m = IMPORT_NAMED.exec(code)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^type\s+/u, '').split(/\s+as\s+/u)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/u.test(name)) names.add(name);
    }
  }
  return names;
}

function exportedNames(code) {
  const names = new Set();
  let m;
  EXPORT_DECL.lastIndex = 0;
  while ((m = EXPORT_DECL.exec(code)) !== null) names.add(m[1]);
  return names;
}

/**
 * Which of `names` the repository already exports, in ONE `git grep` (tracked files only).
 * Empty when there is no repo root, no candidate, or the root is not a git repository.
 */
function repoExports(repoRoot, names) {
  const exported = new Set();
  if (!repoRoot || names.size === 0) return exported;
  let out;
  try {
    out = execFileSync(
      'git',
      ['-C', repoRoot, 'grep', '-h', '-o', '-E', `export[[:space:]]+([a-z]+[[:space:]]+)*(${[...names].map((n) => n.replace(/\$/gu, '\\$')).join('|')})\\b`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return exported; // exit 1 = no match; anything else = not a git repo
  }
  for (const match of out.split('\n')) {
    const name = match.trim().split(/\s+/u).pop();
    if (names.has(name)) exported.add(name);
  }
  return exported;
}

function validateForwardReferences(parsedTasks, bodies, repoRoot, warnings) {
  const ordered = [...parsedTasks].sort((a, b) => a.taskNumber - b.taskNumber);
  const perTask = [];
  const firstExport = new Map();
  for (const task of ordered) {
    const entry = bodies.get(task.taskNumber);
    const blocks = entry && entry.body ? codeBlocks(entry.body) : '';
    const exports = exportedNames(blocks);
    perTask.push({ task, exports, imports: importedNames(blocks) });
    for (const name of exports) if (!firstExport.has(name)) firstExport.set(name, task.taskNumber);
  }
  const candidates = [];
  for (const { task, exports, imports } of perTask) {
    for (const name of imports) {
      const definer = firstExport.get(name);
      if (definer === undefined || definer <= task.taskNumber || exports.has(name)) continue;
      candidates.push({ task: task.taskNumber, symbol: name, definedIn: definer });
    }
  }
  const inRepo = repoExports(repoRoot, new Set(candidates.map((c) => c.symbol)));
  const found = candidates.filter((c) => !inRepo.has(c.symbol));
  for (const { task, symbol, definedIn } of found) {
    warnings.push({
      line: 0,
      message: `task-${String(task).padStart(2, '0')} imports \`${symbol}\`, which is first created by task-${String(definedIn).padStart(2, '0')} — it runs later, so task ${task} cannot compile as written. Move the symbol's creation (and its file in ## Arquivos) into task ${task}, or reorder the tasks.`,
    });
  }
  return { checked: true, repoChecked: Boolean(repoRoot), found };
}

// ─── Review Focus (warning-level) ─────────────────────────────────────────────
//
// The spec is a vision document: it says what the software must do, not every
// input it will meet. Upstream measured 21/21 implementers shipping the same
// crash on an input the spec implied but never named, and no task's tests
// exercised. The index's `## Foco de Revisão` section names the (at most) five
// such inputs, each pinned by a test step in the owning task, and is handed
// verbatim to the final reviewer. Every check here is a WARNING: the section
// is judgment the plan author exercises, and the validator only proves the
// shape — present, bounded, each line owned by a real task, each pin written.
const REVIEW_FOCUS_HEADER = /^##\s+(?:Foco de Revisão|Foco de Revisao|Review Focus)\s*$/imu;
const REVIEW_FOCUS_CAP = 5;
const REVIEW_FOCUS_PIN = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Step\s+\d+:\s*)?Review Focus:/imu;
const STEP_MARKER = /^\s*[-*]\s+\*\*Step\b/mu;

/**
 * A pin is a `Review Focus:` label whose own step carries test code: a fenced block between the
 * label and the next `**Step` marker. A bare label dropped between two steps — or beside a test
 * that exercises something else — names the item without pinning it; a real plan passed the
 * presence check with five such labels added after the fact.
 */
function hasPinnedTest(steps) {
  const re = new RegExp(REVIEW_FOCUS_PIN.source, 'gimu');
  let m;
  while ((m = re.exec(steps)) !== null) {
    const lineEnd = steps.indexOf('\n', m.index + m[0].length);
    const after = lineEnd === -1 ? '' : steps.slice(lineEnd + 1);
    const next = after.search(STEP_MARKER);
    const own = next === -1 ? after : after.slice(0, next);
    if (/^\s*```/mu.test(own)) return true;
  }
  return false;
}

/** Bullet lines of the section, HTML comments stripped, with their 1-based index line. */
function parseReviewFocusLines(content) {
  const stripped = content.replace(/<!--[\s\S]*?-->/gu, (c) => c.replace(/[^\n]/gu, ''));
  const lines = stripped.split(/\r?\n/u);
  let inSection = false;
  const items = [];
  lines.forEach((line, index) => {
    if (REVIEW_FOCUS_HEADER.test(line)) { inSection = true; return; }
    if (inSection && /^##\s+/u.test(line)) { inSection = false; return; }
    if (!inSection) return;
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/u);
    if (!m) return;
    const text = m[1];
    const owners = [];
    const re = /task-0*(\d+)/giu;
    let t;
    while ((t = re.exec(text)) !== null) owners.push(Number.parseInt(t[1], 10));
    items.push({ line: index + 1, text, owners: [...new Set(owners)] });
  });
  return items;
}

/**
 * Validate the `## Foco de Revisão` section. Presence and shape need only the
 * index; the per-task pin needs the bodies, so under `--index-only` it reports
 * `pinsChecked: false` rather than a silent pass. Never pushes an error.
 */
function validateReviewFocus(content, taskNumbers, bodies, warnings) {
  const present = REVIEW_FOCUS_HEADER.test(content);
  if (!present) {
    warnings.push({
      line: 0,
      message: 'Tasks index has no ## Foco de Revisão section — the inputs the spec implies but no task tests are unlisted, so the final reviewer has nothing to check deliberately. Add the section (empty means "checked, none found").',
    });
    return { present: false, lines: [], overCap: false, unowned: [], unknownTasks: [], unpinned: [], pinsChecked: false };
  }
  const lines = parseReviewFocusLines(content);
  const known = new Set(taskNumbers);
  const overCap = lines.length > REVIEW_FOCUS_CAP;
  if (overCap) {
    warnings.push({
      line: 0,
      message: `## Foco de Revisão lists ${lines.length} items; the ceiling is ${REVIEW_FOCUS_CAP}. Keep the ${REVIEW_FOCUS_CAP} most likely to bite a person using the software — a longer list dilutes the reviewer's attention instead of directing it.`,
    });
  }
  const unowned = [];
  const unknownTasks = [];
  const unpinned = [];
  for (const item of lines) {
    if (item.owners.length === 0) {
      unowned.push(item.line);
      warnings.push({ line: item.line, message: 'Foco de Revisão line names no owning task (`task-NN`) — a line no task owns gets no test.' });
      continue;
    }
    for (const n of item.owners) {
      if (!known.has(n)) {
        unknownTasks.push({ line: item.line, task: n });
        warnings.push({ line: item.line, message: `Foco de Revisão line names task-${String(n).padStart(2, '0')}, which is not in the index task list.` });
        continue;
      }
      if (!bodies) continue;
      const entry = bodies.get(n);
      if (!entry || !entry.body) continue;
      const steps = sectionText(entry.body, STEPS_SECTION);
      if (!REVIEW_FOCUS_PIN.test(steps)) {
        unpinned.push({ line: item.line, task: n });
        warnings.push({
          line: item.line,
          message: `Foco de Revisão line is owned by task ${n}, but ${path.basename(entry.filePath)} has no "Review Focus:" step in its ## Passos — the implied input is named but not pinned by a test.`,
        });
      } else if (!hasPinnedTest(steps)) {
        unpinned.push({ line: item.line, task: n });
        warnings.push({
          line: item.line,
          message: `Foco de Revisão line is owned by task ${n}, but the "Review Focus:" label in ${path.basename(entry.filePath)} carries no test code in its own step — write it as the step title (\`- **Step N: Review Focus: <item> — Write the failing test**\`) above the test that exercises exactly that item.`,
        });
      }
    }
  }
  return {
    present: true,
    lines: lines.map((l) => ({ line: l.line, text: l.text, owners: l.owners })),
    overCap,
    unowned,
    unknownTasks,
    unpinned,
    pinsChecked: Boolean(bodies),
  };
}

function main() {
  const {
    tasksIndexPath, indexOnly, prdPath, mockupsPath, repoRoot, keepBriefing,
  } = parseArgs(process.argv);
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

  const { errors, warnings, taskNumbers, parsedTasks } = validateTasksIndex(content);

  // Read every task body once and share it across the per-file and shared-resource checks.
  let taskBodies = null;
  let taskFiles = [];
  if (!indexOnly) {
    taskBodies = readTaskBodies(parsedTasks, path.dirname(tasksIndexPath));
    taskFiles = validateTaskFiles(parsedTasks, taskBodies, errors, warnings);
  }

  // Coverage reads the task files' titles, so --index-only (no task bodies) cannot establish it.
  let prdCoverage = null;
  if (prdPath && !indexOnly) {
    prdCoverage = validatePrdCoverage(prdPath, parsedTasks, taskFiles, errors);
  }

  let mockupCoverage = null;
  if (mockupsPath && !indexOnly) {
    mockupCoverage = validateMockupCoverage(mockupsPath, taskFiles, errors);
  }

  // Cross-task shared-resource consistency (warning-level, boolean-flag heuristic). Runs on the
  // per-file bodies, so it is a full-run-only check like the ones above.
  let sharedResourceConsistency = null;
  if (!indexOnly) {
    sharedResourceConsistency = validateSharedResourceConsistency(parsedTasks, taskBodies, warnings);
  }

  // Checkpoint-owned commands and de-scoping test commands inside task steps. Needs the
  // task bodies, so it is a full-run-only check.
  let stepScope = null;
  if (!indexOnly) {
    stepScope = validateTaskStepScope(parsedTasks, taskBodies, errors);
  }

  // Symbols a task imports before the task that creates them has run (warning-level).
  let forwardReferences = null;
  if (!indexOnly) {
    forwardReferences = validateForwardReferences(parsedTasks, taskBodies, repoRoot, warnings);
  }

  // Review Focus shape (warnings only). Presence and ownership need only the index;
  // the per-task pin degrades explicitly via pinsChecked under --index-only.
  const reviewFocus = validateReviewFocus(content, taskNumbers, taskBodies, warnings);

  // The spec's AC/INV and migration block, carried into the owning tasks with the spec's text.
  // The spec comes from the index's **Spec:** line; the index-line check runs even --index-only.
  const specTrace = validateSpecTrace({
    indexContent: content,
    indexDir: path.dirname(tasksIndexPath),
    parsedTasks,
    bodies: taskBodies,
    repoRoot,
  }, errors, warnings);

  // Plan reach against the real codebase: every declared write and test path is
  // reachable from the repo the plan will run in.
  let reach = null;
  if (!indexOnly && repoRoot) {
    const writeSetsByTask = new Map();
    const testPathsByTask = new Map();
    for (const task of parsedTasks) {
      const entry = taskBodies.get(task.taskNumber);
      if (!entry || !entry.body) continue;
      const manifest = parseArquivosManifest(entry.body);
      writeSetsByTask.set(task.taskNumber, manifest.writeSet);
      testPathsByTask.set(task.taskNumber, manifest.testSet);
    }
    reach = validateReach({ repoRoot, writeSetsByTask, testPathsByTask }, errors, warnings);
  }

  // Pre-dispatch run: the briefing must hand the writer a per-file runner.
  const briefingRunner = indexOnly
    ? validateBriefingRunner(path.join(path.dirname(tasksIndexPath), BRIEFING_FILENAME), errors)
    : null;

  // Verdict must be settled before cleanup: the briefing is removed only on a clean full run.
  const valid = errors.length === 0;
  const briefingCleanup = cleanupBriefing(
    path.dirname(tasksIndexPath), valid, indexOnly, keepBriefing, warnings,
  );

  warnings.forEach((warning) => {
    process.stderr.write(`Warning:${warning.line > 0 ? ` line ${warning.line}` : ''}: ${warning.message}\n`);
  });
  errors.forEach((error) => {
    process.stderr.write(`Error:${error.line > 0 ? ` line ${error.line}` : ''}: ${error.message}\n`);
  });

  const result = {
    found: true,
    valid,
    errors,
    warnings,
    taskCount: parsedTasks.length,
    taskNumbers,
    taskFiles,
    tasksIndexPath,
    prdCoverage,
    mockupCoverage,
    sharedResourceConsistency,
    stepScope,
    reviewFocus,
    specTrace,
    forwardReferences,
    reach,
    briefingRunner,
    briefingCleanup,
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
