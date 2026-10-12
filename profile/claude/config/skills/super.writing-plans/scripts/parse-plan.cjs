#!/usr/bin/env node
/**
 * parse-plan.cjs — Read a superpowers tasks index and enrich each task with
 * its consumption and model-tier signals.
 *
 * Reads the tasks index (`tasks-<feature>.md`) and each referenced task file's
 * `- **Consome:**` line, `**Spec:**`, `**Tier:**` and `## Arquivos`. Emits, per task,
 * the tasks it consumes (the task ids its `Consome` line cites), the fan-in (how many
 * tasks consume it), the suggested execution tier, and validates the edges: the index
 * order is the execution order, so a task may only consume a lower-numbered task.
 *
 * Owned by super.writing-plans, which authors the plan this reads. The execution
 * skill (super.subagent-driven-development) and super.using-superpowers read the
 * same script rather than re-deriving tiers.
 *
 * Usage:
 *   node scripts/parse-plan.cjs --tasks-index <path>
 *
 * Exit codes:
 *   0  success (including "file not found" — found:false, exit 0)
 *   1  usage error or unreadable index
 *
 * Output (stdout): JSON
 *   {
 *     "found": boolean,
 *     "tasks": Task[],            // { number, title, file, consumes, fanIn, specPresent,
 *                                 //   fileCount, explicitTier, suggestedTier, tierSignals }
 *     "singleImplementer": {      // may option 3 (one implementer runs the whole plan) be
 *       "eligible": boolean,      //   offered at the execution gate? never the recommended
 *       "reasons": string[]       //   mode; the user opts in
 *     },
 *     "errors": Issue[],          // dangling refs, self refs, forward consumption
 *     "warnings": Issue[],
 *     "indexPath": string
 *   }
 * Diagnostics (stderr): warnings/errors mirrored as text.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
parse-plan.cjs — Enrich a tasks index with consumption and model-tier signals.

Usage:
  node scripts/parse-plan.cjs --tasks-index <path> [options]

Options:
  --tasks-index <path>    Path to the tasks index file (tasks-<feature>.md)
  --help                  Show this help text and exit 0
`.trimStart();

function usage(msg) {
  process.stderr.write(`Error: ${msg}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  let indexPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tasks-index") {
      if (!args[i + 1]) usage("--tasks-index <path> is required");
      indexPath = args[i + 1];
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${args[i]}`);
  }
  if (!indexPath) usage("--tasks-index <path> is required");
  return { indexPath: path.resolve(indexPath) };
}

// ─── Parsing ──────────────────────────────────────────────────────────────

const TASK_LINE = /^-\s+\[[ xX]\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+\.md)`/u;
// The `## Interfaces` line naming what this task takes from earlier tasks; each item
// cites its producer as `task-NN`. Continuation lines run until a blank line, the next
// list item or a heading.
const CONSUMES_FIELD = /^\s*-\s+\*\*(?:Consome|Consumes):\*\*\s*(.*)$/iu;
const SPEC_FIELD = /^\*\*Spec:\*\*\s*(.+?)\s*$/imu;
const TIER_FIELD = /^\*\*Tier:\*\*\s*(.+?)\s*$/imu;
// The abstract execution tiers a task may declare, in capability order.
const VALID_TIERS = ["cheap", "standard", "capable"];
// Section headers that hold the task's file list (pt-BR "Arquivos" / en "Files").
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/imu;
// Title keywords that signal design/architecture judgment → most-capable model.
const CAPABLE_KEYWORDS = /\b(architect\w*|arquitet\w*|design|redesign|refactor\w*|refator\w*|migrat\w*|migra\w*|backfill|schema|data\s*model|modelo\s*de\s*dados|security|seguran\w*|infra\w*)\b/iu;

/** Extract task numbers + titles + files from the `## Tarefas` list. */
function parseIndexTasks(content) {
  const tasks = [];
  for (const line of content.split(/\r?\n/u)) {
    const m = line.match(TASK_LINE);
    if (!m) continue;
    tasks.push({
      number: Number.parseInt(m[1], 10),
      title: m[2].trim(),
      file: m[3].trim(),
    });
  }
  return tasks;
}

/** The task ids a task file's `**Consome:**` line cites → number[] (empty = N/A / absent). */
function parseConsumes(content) {
  const lines = content.split(/\r?\n/u);
  const i = lines.findIndex((l) => CONSUMES_FIELD.test(l));
  if (i < 0) return [];
  const text = [lines[i].match(CONSUMES_FIELD)[1]];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim() || /^\s*-\s/u.test(l) || /^#/u.test(l)) break;
    text.push(l);
  }
  const nums = [...text.join(" ").matchAll(/\btask[-\s]?0*(\d+)\b/giu)].map((m) => Number(m[1]));
  return [...new Set(nums)];
}

/** True when the task file references a concrete spec (not absent / N/A). */
function hasSpec(content) {
  const m = content.match(SPEC_FIELD);
  if (!m) return false;
  const raw = m[1].trim().replace(/[`*]/gu, "");
  return raw !== "" && !/^n\/a$/iu.test(raw);
}

/**
 * Read an explicit `**Tier:**` field from a task file, if present and valid.
 * Returns the normalized tier (`cheap`|`standard`|`capable`) or null when the
 * field is absent, empty, N/A, or not one of the known tiers. An explicit tier
 * is the human's deliberate override and takes precedence over the computed one.
 */
function parseTier(content) {
  const m = content.match(TIER_FIELD);
  if (!m) return null;
  const raw = m[1].trim().replace(/[`*]/gu, "").toLowerCase();
  return VALID_TIERS.includes(raw) ? raw : null;
}

/**
 * Count the files a task touches by reading its `## Arquivos`/`## Files` section
 * and counting backtick-quoted paths. Returns 0 when the section is absent — an
 * unknown count, treated conservatively (never downgrades a task to "cheap").
 */
function countFiles(content) {
  const lines = content.split(/\r?\n/u);
  let inSection = false;
  const paths = new Set();
  for (const line of lines) {
    if (FILES_SECTION.test(line)) {
      inSection = true;
      continue;
    }
    // Stop at the next heading of ANY level (## sibling OR ### subsection): the manifest is
    // only the direct bullets under "## Arquivos". The "### Skills a invocar"/"### Fidelidade Visual"
    // subsections are prose; counting their backticked tokens (skill names, import aliases,
    // mockup paths) inflated fileCount and could bump a genuinely cheap task to a higher tier.
    if (inSection && /^#{2,}\s+/u.test(line)) break;
    if (!inSection) continue;
    const re = /`([^`]+)`/gu;
    let m;
    while ((m = re.exec(line)) !== null) {
      const token = m[1].trim();
      if (token.includes("/") || /\.[a-z0-9]+$/iu.test(token)) paths.add(token);
    }
  }
  return paths.size;
}

/**
 * Suggest the least-powerful model that can handle a task, from deterministic
 * syntactic signals. This is advisory — the orchestrator may override it, since
 * file count is an imperfect proxy for algorithmic difficulty (see the SKILL "Model
 * Selection" section). Precedence: capable > cheap > standard.
 *
 *   capable  — design/architecture keyword in the title, OR no spec reference,
 *              OR high fan-in (many tasks consume it: a structural node)
 *   cheap    — has a spec, consumes no task, and touches 1-2 files (mechanical)
 *   standard — everything else (multi-file integration, unknown file count)
 */
function deriveTier(task) {
  // An explicit `**Tier:**` field is the human's deliberate override and wins
  // over every computed signal. We still surface the field as the signal so the
  // executor can see the tier was declared, not inferred.
  if (task.explicitTier) {
    return {
      suggestedTier: task.explicitTier,
      tierSignals: [`explicit **Tier:** field (${task.explicitTier})`],
    };
  }

  const signals = [];
  let capable = false;
  if (CAPABLE_KEYWORDS.test(task.title || "")) {
    signals.push("design/architecture keyword in title");
    capable = true;
  }
  if (!task.specPresent) {
    signals.push("no spec reference — needs judgment");
    capable = true;
  }
  if (task.fanIn >= 3) {
    signals.push(`high fan-in (${task.fanIn} consumers)`);
    capable = true;
  }
  if (capable) return { suggestedTier: "capable", tierSignals: signals };

  if (task.specPresent && task.consumes.length === 0 && task.fileCount > 0 && task.fileCount <= 2) {
    return {
      suggestedTier: "cheap",
      tierSignals: ["spec present", "consumes no task", `${task.fileCount} file(s)`],
    };
  }

  const reasons = [];
  if (task.consumes.length > 0) reasons.push(`consumes ${task.consumes.length} task(s)`);
  if (task.fileCount === 0) reasons.push("file count unknown");
  if (task.fileCount > 2) reasons.push(`${task.fileCount} files`);
  return { suggestedTier: "standard", tierSignals: reasons.length ? reasons : ["integration task"] };
}

/**
 * Option 3 at the execution gate: one implementer subagent runs every task in
 * order with no per-task reviewer (final review unchanged). Opt-in, never
 * the recommended mode. One context carries the whole chain, so the plan must be
 * short and must not need the capable tier on any task.
 */
const SINGLE_IMPLEMENTER_MAX_TASKS = 6;

function deriveSingleImplementerEligibility(tasks) {
  const reasons = [];
  if (tasks.length === 0) reasons.push("no tasks to run");
  if (tasks.length > SINGLE_IMPLEMENTER_MAX_TASKS) {
    reasons.push(`${tasks.length} tasks — one context running more than ${SINGLE_IMPLEMENTER_MAX_TASKS} tasks in a row gets the last ones with the least of it`);
  }
  const capable = tasks.filter((t) => (t.explicitTier || t.suggestedTier) === "capable").map((t) => `#${t.number}`);
  if (capable.length > 0) reasons.push(`task(s) ${capable.join(", ")} need the capable tier — this mode runs the whole chain on standard`);
  return { eligible: reasons.length === 0, reasons };
}

// ─── Consumption validation ──────────────────────────────────────────────────
//
// The index order is the execution order. A task may only consume a task that
// exists and runs before it; a forward reference is a plan error the executor
// cannot resolve at dispatch time.
function validateConsumes(tasks, errors) {
  const byNumber = new Map(tasks.map((t) => [t.number, t]));
  for (const t of tasks) {
    for (const d of t.consumes) {
      if (!byNumber.has(d)) {
        errors.push({ message: `Task ${t.number} **Consome:** cites task ${d}, which does not exist in the index.` });
      } else if (d === t.number) {
        errors.push({ message: `Task ${t.number} **Consome:** cites itself.` });
      } else if (d > t.number) {
        errors.push({ message: `Task ${t.number} **Consome:** cites task ${d}, which comes later in the index; a task may only consume an earlier task.` });
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function notFound(indexPath) {
  return {
    found: false,
    tasks: [],
    singleImplementer: deriveSingleImplementerEligibility([]),
    errors: [],
    warnings: [],
    indexPath,
  };
}

/**
 * The enriched plan for an absolute index path, in process (build-task-dispatch.cjs and
 * sdd-start.cjs call it instead of spawning a node). Throws only when the index exists but
 * cannot be read; errors and warnings are returned, never written.
 */
function parsePlan(indexPath) {
  if (!fs.existsSync(indexPath)) return notFound(indexPath);

  let indexContent;
  try {
    indexContent = fs.readFileSync(indexPath, "utf8");
  } catch (err) {
    throw new Error(`Error reading tasks index: ${err.message}`);
  }

  const indexDir = path.dirname(indexPath);
  const rawTasks = parseIndexTasks(indexContent);
  const errors = [];
  const warnings = [];

  // Enrich each task with the tasks it consumes + model-tier signals.
  const tasks = rawTasks.map((t) => {
    const taskPath = path.join(indexDir, t.file);
    let consumes = [];
    let specPresent = false;
    let fileCount = 0;
    let explicitTier = null;
    let body = null;
    try {
      body = fs.readFileSync(taskPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") {
        warnings.push({ message: `Referenced task file not found: ${t.file}; treating as N/A.` });
      } else {
        warnings.push({ message: `Could not read ${t.file}: ${err.message}; treating as N/A.` });
      }
    }
    if (body !== null) {
      consumes = parseConsumes(body);
      specPresent = hasSpec(body);
      fileCount = countFiles(body);
      explicitTier = parseTier(body);
    }
    return { number: t.number, title: t.title, file: t.file, consumes, specPresent, fileCount, explicitTier };
  });

  // Fan-in: how many tasks consume each task (a structural-node signal).
  const fanInOf = new Map(tasks.map((t) => [t.number, 0]));
  for (const t of tasks) {
    for (const d of t.consumes) {
      if (fanInOf.has(d)) fanInOf.set(d, fanInOf.get(d) + 1);
    }
  }
  for (const t of tasks) {
    t.fanIn = fanInOf.get(t.number) || 0;
    Object.assign(t, deriveTier(t));
  }

  validateConsumes(tasks, errors);

  return {
    found: true,
    tasks,
    singleImplementer: deriveSingleImplementerEligibility(tasks),
    errors,
    warnings,
    indexPath,
  };
}

function main() {
  const { indexPath } = parseArgs(process.argv);
  let result;
  try {
    result = parsePlan(indexPath);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  result.errors.forEach((e) => process.stderr.write(`Error: ${e.message}\n`));
  result.warnings.forEach((w) => process.stderr.write(`Warning: ${w.message}\n`));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

module.exports = { parsePlan };

if (require.main === module) main();
