#!/usr/bin/env node
/**
 * parse-waves.cjs — Derive and validate the parallel-execution waves of a
 * superpowers tasks index.
 *
 * Reads the tasks index (`tasks-<feature>.md`), each referenced task file's
 * `**Depends on:**` field, and the optional `## Execution Waves` section.
 * Produces the execution waves super.parallel-subagent-development consumes,
 * preferring an explicit `## Execution Waves` section when present and falling
 * back to deriving waves from the dependency edges otherwise.
 *
 * Usage:
 *   node scripts/parse-waves.cjs --tasks-index <path>
 *
 * Exit codes:
 *   0  success (including "file not found" — found:false, exit 0)
 *   1  usage error or unreadable index
 *
 * Output (stdout): JSON
 *   {
 *     "found": boolean,
 *     "source": "section" | "derived" | "none",
 *     "waves": number[][],        // execution order; each inner array MAY run in parallel
 *     "waveKinds": string[],      // per-wave kind, 1:1 with waves: "parallel" | "sequential"
 *     "parallelizable": boolean,  // any wave with 2+ tasks
 *     "maxParallelWave": number,  // size of the largest wave
 *     "waveCount": number,
 *     "executionRecommendation": { // which mode to tag (recommended) in the handoff
 *                                  //   mode, optionNumber, confidence,
 *                                  //   decisionRequired, signals[], alternatives[] }
 *     "tasks": Task[],            // { number, file, dependsOn, fanIn, specPresent,
 *                                 //   fileCount, explicitTier, suggestedTier, tierSignals }
 *     "errors": Issue[],          // cycles, dangling refs, ordering violations
 *     "warnings": Issue[],
 *     "indexPath": string
 *   }
 * Diagnostics (stderr): warnings/errors mirrored as text.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
parse-waves.cjs — Derive and validate parallel-execution waves for a tasks index.

Usage:
  node scripts/parse-waves.cjs --tasks-index <path>

Options:
  --tasks-index <path>  Path to the tasks index file (tasks-<feature>.md)
  --help                Show this help text and exit 0
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
  return path.resolve(indexPath);
}

// ─── Parsing ──────────────────────────────────────────────────────────────

const TASK_LINE = /^-\s+\[[ xX]\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+\.md)`/u;
const WAVE_LINE = /^-\s+\*\*Wave\s+(\d+)\*\*\s*\([^)]*\)\s*:\s*(.+?)\s*$/iu;
// Accept both the English heading (normative reference / older plans) and the Portuguese
// heading tasks-template.md emits — otherwise a template-conformant section is silently ignored.
const WAVES_HEADER = /^##\s+(?:Execution Waves|Ondas de Execução)\s*$/iu;
const DEPENDS_FIELD = /^\*\*Depends on:\*\*\s*(.+?)\s*$/imu;
const SPEC_FIELD = /^\*\*Spec:\*\*\s*(.+?)\s*$/imu;
const TIER_FIELD = /^\*\*Tier:\*\*\s*(.+?)\s*$/imu;
// The abstract execution tiers a task may declare, in capability order.
const VALID_TIERS = ["cheap", "standard", "capable"];
// Section headers that hold the task's file list (pt-BR "Arquivos" / en "Files").
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/imu;
// Title keywords that signal design/architecture judgment → most-capable model.
const CAPABLE_KEYWORDS = /\b(architect\w*|arquitet\w*|design|redesign|refactor\w*|refator\w*|migrat\w*|migra\w*|schema|data\s*model|modelo\s*de\s*dados|security|seguran\w*|infra\w*)\b/iu;

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

/** Parse the `## Execution Waves` section into number[][], or null if absent. */
function parseWavesSection(content) {
  const lines = content.split(/\r?\n/u);
  let inSection = false;
  const waves = [];
  for (const line of lines) {
    if (WAVES_HEADER.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/u.test(line)) break; // next heading ends the section
    if (!inSection) continue;
    const m = line.match(WAVE_LINE);
    if (!m) continue;
    const waveNumber = Number.parseInt(m[1], 10);
    const nums = extractTaskNumbers(m[2]);
    waves.push({ waveNumber, tasks: nums });
  }
  if (waves.length === 0) return null;
  waves.sort((a, b) => a.waveNumber - b.waveNumber);
  return waves;
}

/** Pull task numbers out of free text: handles `1, 2`, `task-01`, `task-1`. */
function extractTaskNumbers(text) {
  const nums = [];
  const re = /(?:task-)?0*(\d+)/giu;
  let m;
  while ((m = re.exec(text)) !== null) {
    nums.push(Number.parseInt(m[1], 10));
  }
  return nums;
}

/** Read a task file's `**Depends on:**` field → number[] (empty = N/A / none). */
function parseDependsOn(content) {
  const m = content.match(DEPENDS_FIELD);
  if (!m) return null; // field absent entirely
  const raw = m[1].trim();
  if (/^n\/a$/iu.test(raw) || raw === "" || /^none$/iu.test(raw)) return [];
  return extractTaskNumbers(raw);
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
    // only the direct bullets under "## Arquivos". The "### Conformidade"/"### Fidelidade Visual"
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
 * file count is an imperfect proxy for algorithmic difficulty (see SKILL § Model
 * Selection). Precedence: capable > cheap > standard.
 *
 *   capable  — design/architecture keyword in the title, OR no spec reference,
 *              OR high fan-in (many tasks depend on it: a structural node)
 *   cheap    — has a spec, no dependencies, and touches 1-2 files (mechanical)
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
    signals.push(`high fan-in (${task.fanIn} dependents)`);
    capable = true;
  }
  if (capable) return { suggestedTier: "capable", tierSignals: signals };

  if (task.specPresent && task.dependsOn.length === 0 && task.fileCount > 0 && task.fileCount <= 2) {
    return {
      suggestedTier: "cheap",
      tierSignals: ["spec present", "no dependencies", `${task.fileCount} file(s)`],
    };
  }

  const reasons = [];
  if (task.dependsOn.length > 0) reasons.push(`${task.dependsOn.length} dependenc(y/ies)`);
  if (task.fileCount === 0) reasons.push("file count unknown");
  if (task.fileCount > 2) reasons.push(`${task.fileCount} files`);
  return { suggestedTier: "standard", tierSignals: reasons.length ? reasons : ["integration task"] };
}

/**
 * Recommend which execution mode to tag `(recommended)` in the handoff message,
 * derived deterministically from the plan's wave/dependency structure. The
 * recommendation always follows the computed shape — it never defaults to a
 * fixed option.
 *
 * The sequential-vs-parallel call is fully decidable from the waves alone:
 *   - No parallelizable wave → `subagent-driven` (option 1). The parallel modes
 *     would run everything in order anyway, so the per-task review checkpoint is
 *     strictly best. `decisionRequired` false, confidence high.
 *   - At least one parallel wave → a PARALLEL mode. Default to `parallel-subagent`
 *     (option 3, worktrees): it is the parallel mode that is safe regardless of
 *     write-set disjointness (hard isolation per task). Recommending option 1
 *     here would discard the wall-clock gain the structure offers.
 *
 * The ONE thing the waves cannot decide is in-tree (option 2) vs worktrees
 * (option 3): in-tree is only safe when the wave's tasks write disjoint files,
 * and disjointness lives in check-wave-disjoint.cjs, not here. So for parallel
 * plans `decisionRequired = true` flags that refinement — the planner may
 * downgrade to in-tree (disjoint writes + expensive isolation) or fall back to
 * subagent-driven (tightly coupled wave) — but the default tag already sits on a
 * parallel option, never on option 1.
 *
 *   mode             — the option to tag (recommended), derived from the structure
 *   optionNumber     — 1..3, the option's number in the handoff message
 *   confidence       — high (clear call) | medium (thin parallelism)
 *   decisionRequired — true → planner may refine the in-tree/worktrees pick
 *   signals          — why, in plain terms
 *   alternatives     — other viable modes with a one-line "when to pick instead"
 */
function deriveExecutionRecommendation(waves, waveKinds, tasks) {
  const parallelWaves = waveKinds.filter((k) => k === "parallel").length;
  const maxParallel = waves.reduce((m, w) => Math.max(m, w.length), 0);

  // Fully sequential: the only case decidable from the artifacts alone.
  if (parallelWaves === 0) {
    return {
      mode: "subagent-driven",
      optionNumber: 1,
      confidence: "high",
      decisionRequired: false,
      signals: [
        waves.length === 0
          ? "no tasks to schedule"
          : "no parallelizable wave (every wave holds a single task)",
        "parallel modes would run everything in order — no wall-clock gain",
      ],
      alternatives: [],
    };
  }

  // There IS parallelism. The sequential-vs-parallel call is decidable from the
  // wave/dependency structure alone, so recommend a PARALLEL mode — never fall
  // back to option 1, which would run the wave in order and throw away the
  // wall-clock gain the structure offers. Between the two parallel modes,
  // worktrees (option 3) is the safe deterministic pick: it works regardless of
  // write-set disjointness (hard isolation per task), whereas in-tree (option 2)
  // is only safe when the wave's tasks write disjoint files — a fact that lives
  // in check-wave-disjoint.cjs, not here. `decisionRequired` stays true ONLY for
  // that downgrade refinement (to in-tree when disjoint+expensive isolation, or
  // back to subagent-driven when the wave is tightly coupled).
  const signals = [`${parallelWaves} parallel wave(s); largest holds ${maxParallel} task(s)`];
  const highFanIn = tasks.filter((t) => (t.fanIn || 0) >= 2);
  if (highFanIn.length > 0) {
    signals.push(
      `${highFanIn.length} high-fan-in task(s) (${highFanIn
        .map((t) => `#${t.number}`)
        .join(", ")}) — tightly coupled; an early error propagates downstream`,
    );
  }
  const thin = parallelWaves === 1 && maxParallel <= 2;
  signals.push(
    thin
      ? "thin parallelism — wall-clock savings are modest, but parallel still beats running the wave in order"
      : "substantial parallelism is available — running the wave concurrently saves wall-clock",
  );

  return {
    mode: "parallel-subagent",
    optionNumber: 3,
    confidence: thin ? "medium" : "high",
    decisionRequired: true,
    signals,
    alternatives: [
      {
        mode: "parallel-subagent-in-tree",
        optionNumber: 2,
        when: "the parallel wave's tasks write disjoint files (confirm with check-wave-disjoint.cjs --tasks <task numbers> → safeForInTreeParallel:true) and per-worktree setup is expensive — e.g. a workspace monorepo where each worktree needs its own node_modules",
      },
      {
        mode: "subagent-driven",
        optionNumber: 1,
        when: "the parallel-wave tasks are tightly coupled (high fan-in) and the per-task review checkpoint is worth more than the wall-clock gain",
      },
    ],
  };
}

// ─── Wave derivation (Kahn by level) ────────────────────────────────────────

function deriveWaves(tasks, errors) {
  const byNumber = new Map(tasks.map((t) => [t.number, t]));
  const placed = new Set();
  const waves = [];
  let guard = 0;
  const maxRounds = tasks.length + 1;

  while (placed.size < tasks.length && guard <= maxRounds) {
    guard += 1;
    const wave = tasks
      .filter((t) => !placed.has(t.number))
      .filter((t) => t.dependsOn.every((d) => placed.has(d)))
      .map((t) => t.number)
      .sort((a, b) => a - b);
    if (wave.length === 0) break; // cycle or unresolved dependency
    wave.forEach((n) => placed.add(n));
    waves.push(wave);
  }

  if (placed.size < tasks.length) {
    const stuck = tasks
      .filter((t) => !placed.has(t.number))
      .map((t) => t.number);
    errors.push({
      message: `Cannot order tasks ${stuck.join(", ")} — dependency cycle or reference to a task that is never satisfiable.`,
    });
  }
  // Validate every referenced dependency exists.
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (!byNumber.has(d)) {
        errors.push({ message: `Task ${t.number} depends on task ${d}, which does not exist in the index.` });
      }
    }
  }
  return waves;
}

/** Verify an explicit section is consistent with the dependency edges. */
function validateSection(sectionWaves, tasks, errors, warnings) {
  const waveOf = new Map();
  const allTaskNums = new Set(tasks.map((t) => t.number));
  sectionWaves.forEach((w, idx) => {
    for (const n of w.tasks) {
      if (waveOf.has(n)) {
        errors.push({ message: `Task ${n} appears in more than one wave.` });
      }
      waveOf.set(n, idx + 1);
      if (!allTaskNums.has(n)) {
        errors.push({ message: `Execution Waves references task ${n}, which is not in the index task list.` });
      }
    }
  });
  // Every task must be placed exactly once.
  for (const t of tasks) {
    if (!waveOf.has(t.number)) {
      errors.push({ message: `Task ${t.number} is missing from the Execution Waves section.` });
    }
  }
  // A task must come strictly after all its dependencies.
  for (const t of tasks) {
    const tw = waveOf.get(t.number);
    if (tw == null) continue;
    for (const d of t.dependsOn) {
      const dw = waveOf.get(d);
      if (dw == null) continue;
      if (dw >= tw) {
        errors.push({ message: `Task ${t.number} (wave ${tw}) depends on task ${d} (wave ${dw}); a dependency must be in an earlier wave.` });
      }
    }
  }
  // Wave numbers should be sequential from 1.
  sectionWaves.forEach((w, idx) => {
    if (w.waveNumber !== idx + 1) {
      warnings.push({ message: `Wave numbers should be sequential from 1; found Wave ${w.waveNumber} at position ${idx + 1}.` });
    }
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

function notFound(indexPath) {
  return {
    found: false,
    source: "none",
    waves: [],
    waveKinds: [],
    parallelizable: false,
    maxParallelWave: 0,
    waveCount: 0,
    executionRecommendation: deriveExecutionRecommendation([], [], []),
    tasks: [],
    errors: [],
    warnings: [],
    indexPath,
  };
}

function main() {
  const indexPath = parseArgs(process.argv);
  if (!fs.existsSync(indexPath)) {
    process.stdout.write(`${JSON.stringify(notFound(indexPath), null, 2)}\n`);
    process.exit(0);
  }

  let indexContent;
  try {
    indexContent = fs.readFileSync(indexPath, "utf8");
  } catch (err) {
    process.stderr.write(`Error reading tasks index: ${err.message}\n`);
    process.exit(1);
  }

  const indexDir = path.dirname(indexPath);
  const rawTasks = parseIndexTasks(indexContent);
  const errors = [];
  const warnings = [];

  // Enrich each task with its declared dependencies + model-tier signals.
  const tasks = rawTasks.map((t) => {
    const taskPath = path.join(indexDir, t.file);
    let dependsOn = [];
    let specPresent = false;
    let fileCount = 0;
    let explicitTier = null;
    if (fs.existsSync(taskPath)) {
      try {
        const body = fs.readFileSync(taskPath, "utf8");
        const parsed = parseDependsOn(body);
        if (parsed === null) {
          warnings.push({ message: `Task ${t.number} (${t.file}) has no **Depends on:** field; treating as N/A.` });
        } else {
          dependsOn = parsed;
        }
        specPresent = hasSpec(body);
        fileCount = countFiles(body);
        explicitTier = parseTier(body);
      } catch (err) {
        warnings.push({ message: `Could not read ${t.file}: ${err.message}; treating as N/A.` });
      }
    } else {
      warnings.push({ message: `Referenced task file not found: ${t.file}; treating as N/A.` });
    }
    return { number: t.number, title: t.title, file: t.file, dependsOn, specPresent, fileCount, explicitTier };
  });

  // Fan-in: how many tasks depend on each task (a structural-node signal).
  const fanInOf = new Map(tasks.map((t) => [t.number, 0]));
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (fanInOf.has(d)) fanInOf.set(d, fanInOf.get(d) + 1);
    }
  }
  for (const t of tasks) {
    t.fanIn = fanInOf.get(t.number) || 0;
    Object.assign(t, deriveTier(t));
  }

  const sectionWaves = parseWavesSection(indexContent);
  let waves;
  let source;
  if (sectionWaves) {
    source = "section";
    validateSection(sectionWaves, tasks, errors, warnings);
    waves = sectionWaves.map((w) => [...w.tasks].sort((a, b) => a - b));
  } else if (tasks.length > 0) {
    source = "derived";
    waves = deriveWaves(tasks, errors);
  } else {
    source = "none";
    waves = [];
  }

  const maxParallelWave = waves.reduce((max, w) => Math.max(max, w.length), 0);
  // Per-wave execution kind, parallel 1:1 with `waves`. Emitted deterministically
  // so the orchestrator never INFERS "is this wave parallel?" from wave.length —
  // that inference is the surface where the worktree invariant gets bypassed.
  // "parallel" (2+ independent tasks) → one isolated worktree per task, mandatory
  // whenever worktrees are available. "sequential" (single task) → run in-tree.
  const waveKinds = waves.map((w) => (w.length > 1 ? "parallel" : "sequential"));
  const result = {
    found: true,
    source,
    waves,
    waveKinds,
    parallelizable: maxParallelWave > 1,
    maxParallelWave,
    waveCount: waves.length,
    executionRecommendation: deriveExecutionRecommendation(waves, waveKinds, tasks),
    tasks,
    errors,
    warnings,
    indexPath,
  };

  errors.forEach((e) => process.stderr.write(`Error: ${e.message}\n`));
  warnings.forEach((w) => process.stderr.write(`Warning: ${w.message}\n`));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
