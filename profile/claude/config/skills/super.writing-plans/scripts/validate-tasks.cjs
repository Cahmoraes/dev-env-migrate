#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HELP = `
validate-tasks.cjs — Validate a super.writing-plans tasks index AND its task files.

Usage:
  node scripts/validate-tasks.cjs --tasks-index <path> [--index-only] [--prd <path>] [--mockups <dir>] [--keep-briefing]

Options:
  --tasks-index <path>  Path to tasks index markdown file
  --index-only          Validate only the index format (skip per-file checks)
  --keep-briefing       Do NOT remove the transient plans/task-writer-briefing.md on a clean
                        full validation. By default a passing full run deletes it (it is a
                        writing-plans handoff artifact, not part of the plan); pass this to
                        keep it for debugging. No-op under --index-only or when validation fails.
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
  - when a ## Execution Waves / ## Ondas de Execução section exists: every parallel (2+ task)
    wave's task files declare disjoint ## Arquivos write-sets (ERROR on overlap or on a
    parallel-wave task with no verifiable write-set) — same check as
    super.parallel-subagent-in-tree's check-wave-disjoint.cjs, run here at plan-validation
    time so an unsafe wave never reaches dispatch
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
    usage(`Unknown argument: ${arg}`);
  }
  if (!tasksIndexPath) usage('--tasks-index <path> is required');
  return {
    tasksIndexPath: path.resolve(tasksIndexPath),
    indexOnly,
    prdPath: prdPath ? path.resolve(prdPath) : null,
    mockupsPath: mockupsPath ? path.resolve(mockupsPath) : null,
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
  if (!fs.existsSync(briefingPath)) return cleanup;
  cleanup.existed = true;
  try {
    fs.unlinkSync(briefingPath);
    cleanup.removed = true;
  } catch (err) {
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
  { label: '**Depends on:**', pattern: /^\*\*Depends on:\*\*/mu },
];

// A task references the curated mockup via the "### Fidelidade Visual" subsection
// (## or ### heading). This is the marker the writing-plans template emits.
const VISUAL_LINK_PATTERN = /^#{2,3}\s+Fidelidade Visual\b/imu;

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
    const entry = { filePath, exists: fs.existsSync(filePath), body: null, readError: null };
    if (entry.exists) {
      try {
        entry.body = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        entry.readError = err;
      }
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
      rfInIndex: task.rfInIndex,
      rfInFile: [],
      rfMissingInFile: [],
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

// ─── Wave write-set disjointness (parallel waves only) ────────────────────────
//
// A parallel wave (2+ tasks) whose task files declare overlapping ## Arquivos
// write-sets is unsafe for ANY parallel execution mechanism, not just
// super.parallel-subagent-in-tree: even isolated worktrees produce a merge
// conflict on the same overlap when integrated back. The dedicated pre-flight
// gate for this already exists (super.parallel-subagent-in-tree's
// check-wave-disjoint.cjs), but it only runs at dispatch time, right before an
// execution skill starts a wave — nothing forces it to actually be invoked.
// Moving the same check here, into the mandatory plan self-review that runs
// before a plan is ever handed off for execution, closes that gap: a plan
// with an unproven-safe parallel wave now fails validation at the source,
// before any execution mode is chosen. This mirrors check-wave-disjoint.cjs's
// parsing conventions (kept in sync deliberately, not required cross-skill —
// each skill script stays runnable standalone).
const WAVES_HEADER = /^##\s+(?:Execution Waves|Ondas de Execução)\s*$/iu;
const WAVE_LINE = /^-\s+\*\*Wave\s+(\d+)\*\*\s*\(([^)]*)\)\s*:\s*(.+?)\s*$/iu;
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/imu;
const READ_VERB = /^(?:read|reference|inspect|view|consult|ler|referenciar|referencia|referência|inspecionar|consultar|ver)$/iu;

function extractTaskNumbersFromText(text) {
  const nums = [];
  const re = /(?:task-)?0*(\d+)/giu;
  let m;
  while ((m = re.exec(text)) !== null) nums.push(Number.parseInt(m[1], 10));
  return nums;
}

/** Parse the `## Execution Waves` / `## Ondas de Execução` section into `{ waveNumber, tasks }[]`. */
function parseExecutionWaves(content) {
  const lines = content.split(/\r?\n/u);
  let inSection = false;
  const waves = [];
  for (const line of lines) {
    if (WAVES_HEADER.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s+/u.test(line)) break;
    if (!inSection) continue;
    const m = line.match(WAVE_LINE);
    if (m) {
      waves.push({
        waveNumber: Number.parseInt(m[1], 10),
        tasks: extractTaskNumbersFromText(m[3]),
      });
    }
  }
  return waves;
}

/**
 * Read a task body's `## Arquivos`/`## Files` section write-set. Same
 * read/write classification as check-wave-disjoint.cjs: Create/Modify/Test
 * (and pt-BR equivalents) are writes; an explicit read verb is a read;
 * unknown/absent verb defaults to write (missing an overlap is worse than an
 * over-cautious one). Subsections after the manifest (### Fidelidade Visual,
 * ### Conformidade com as Skills Padrão) are excluded by breaking at the next
 * heading of any level.
 */
function parseArquivosWriteSet(body) {
  const lines = body.split(/\r?\n/u);
  let inSection = false;
  let present = false;
  const writes = new Set();
  for (const line of lines) {
    if (FILES_SECTION.test(line)) { inSection = true; present = true; continue; }
    if (inSection && /^#{2,}\s+/u.test(line)) break;
    if (!inSection) continue;
    const verbMatch = line.match(/^\s*[-*]\s*([A-Za-zÀ-ÿ]+)\s*:/u);
    const paths = [...line.matchAll(/`([^`]+)`/gu)].map((pm) => pm[1].trim());
    if (paths.length === 0) continue;
    const verb = verbMatch ? verbMatch[1] : '';
    const isRead = verb !== '' && READ_VERB.test(verb);
    if (isRead) continue;
    for (const p of paths) {
      if (!(p.includes('/') || /\.[a-z0-9]+$/iu.test(p))) continue;
      writes.add(p);
    }
  }
  return { present, writeSet: [...writes].sort() };
}

/**
 * Cross-check every declared parallel wave (2+ tasks) for write-set
 * disjointness. Pushes an ERROR (not a warning) for any overlap or
 * unverifiable task — this is the same "Never parallelize an unsafe wave"
 * rule super.parallel-subagent-in-tree/SKILL.md states in prose, now
 * enforced mechanically at plan-validation time instead of relying on the
 * execution-time agent to remember to run check-wave-disjoint.cjs. Returns
 * null when the plan has no ## Execution Waves section (nothing to check —
 * Small/Medium/no-parallelism plans are unaffected).
 */
function validateWaveDisjointness(content, bodies, errors) {
  const waves = parseExecutionWaves(content);
  if (waves.length === 0) return null;

  return waves.map((wave) => {
    if (wave.tasks.length < 2) {
      return { waveNumber: wave.waveNumber, tasks: wave.tasks, writeOverlaps: [], unverifiable: [], safeForInTreeParallel: true };
    }

    const taskInfos = wave.tasks.map((n) => {
      const entry = bodies.get(n);
      const parsed = entry && entry.body ? parseArquivosWriteSet(entry.body) : { present: false, writeSet: [] };
      return { number: n, present: parsed.present, writeSet: parsed.writeSet };
    });

    const writeOverlaps = [];
    for (let i = 0; i < taskInfos.length; i += 1) {
      for (let j = i + 1; j < taskInfos.length; j += 1) {
        const a = taskInfos[i];
        const b = taskInfos[j];
        const setB = new Set(b.writeSet);
        const files = a.writeSet.filter((f) => setB.has(f)).sort();
        if (files.length > 0) writeOverlaps.push({ tasks: [a.number, b.number], files });
      }
    }
    const unverifiable = taskInfos.filter((t) => !t.present || t.writeSet.length === 0).map((t) => t.number);
    const safeForInTreeParallel = writeOverlaps.length === 0 && unverifiable.length === 0;

    if (!safeForInTreeParallel) {
      for (const ov of writeOverlaps) {
        errors.push({
          line: 0,
          message: `Wave ${wave.waveNumber} declares tasks ${ov.tasks[0]} & ${ov.tasks[1]} as parallel but both write ${ov.files.join(', ')} — unsafe for in-tree parallel (shared-tree clobber) and for worktree parallel (merge conflict on integration). Apply the Large-tier consolidation judgment call (super.writing-plans SKILL.md, "Task Decomposition Granularity"): merge into one task with N tests if same file(s) + real implementation dependency + reviewable combined diff, otherwise resequence into different waves so they run sequentially. Cross-check: node <super.parallel-subagent-in-tree-base-dir>/scripts/check-wave-disjoint.cjs --tasks-index <this-index> --wave ${wave.waveNumber}`,
        });
      }
      for (const n of unverifiable) {
        errors.push({
          line: 0,
          message: `Wave ${wave.waveNumber} declares task ${n} as parallel but its ## Arquivos section is missing or declares no write paths — disjointness cannot be verified, so the wave cannot be proven safe to parallelize. Add a ## Arquivos section with Create/Modify entries, or move task ${n} to its own sequential wave.`,
        });
      }
    }

    return { waveNumber: wave.waveNumber, tasks: wave.tasks, writeOverlaps, unverifiable, safeForInTreeParallel };
  });
}

function main() {
  const { tasksIndexPath, indexOnly, prdPath, mockupsPath, keepBriefing } = parseArgs(process.argv);
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

  let prdCoverage = null;
  if (prdPath) {
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

  // Parallel-wave write-set disjointness (errors, not warnings — see function docstring).
  let waveDisjointness = null;
  if (!indexOnly) {
    waveDisjointness = validateWaveDisjointness(content, taskBodies, errors);
  }

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
    waveDisjointness,
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
