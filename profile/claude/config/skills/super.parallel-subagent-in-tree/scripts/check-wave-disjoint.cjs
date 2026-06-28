#!/usr/bin/env node
/**
 * check-wave-disjoint.cjs — Deterministic pre-flight gate for the in-tree
 * (no-worktree) parallel execution mode of super.parallel-subagent-in-tree.
 *
 * The worktree-based parallel mode is safe by construction: every task gets its
 * own isolated working tree, so concurrent implementers physically cannot touch
 * each other's files. The in-tree mode trades that isolation for speed (no
 * per-worktree `pnpm install`, no N-way merge), so it needs a different
 * guarantee: no two tasks in the wave WRITE the same file. If their write-sets
 * are disjoint and the subagents are write-only/no-commit (enforced by the
 * skill, not this script), running them concurrently in one shared tree cannot
 * corrupt anyone's work.
 *
 * This script answers "is this wave safe to parallelize in-tree?" purely from
 * the plan — each task's `## Arquivos` section — so the orchestrator never
 * INFERS disjointness by eyeballing the task list (that inference is exactly
 * where an unnoticed shared file slips through and two implementers clobber it).
 *
 * It is READ-ONLY over the plan files; it never runs git, never executes code,
 * never mutates anything.
 *
 * Write-set vs read-set: a task's `## Arquivos` entries are classified by their
 * leading verb. Create / Modify / Test (and pt-BR Criar / Modificar / Teste)
 * are WRITES; anything else (e.g. Read / Reference / Ler) is a read. Only
 * write∩write between two tasks is a collision — sharing a file for reading is
 * fine.
 *
 * Usage:
 *   node scripts/check-wave-disjoint.cjs --tasks-index <path> --tasks <N,N,...>
 *   node scripts/check-wave-disjoint.cjs --tasks-index <path> --wave <N>
 *
 * Exit codes:
 *   0  ran successfully (inspect safeForInTreeParallel / writeOverlaps in JSON)
 *   1  usage error or unreadable index
 *
 * Output (stdout): JSON
 *   {
 *     "tasksIndex": string,
 *     "selection": { "mode": "tasks"|"wave", "value": string },
 *     "tasks": [{
 *       "number": number,
 *       "file": string,
 *       "arquivosPresent": boolean,
 *       "writeSet": string[],   // sorted; Create/Modify/Test paths
 *       "readSet": string[]     // sorted; other-verb paths
 *     }],
 *     "writeOverlaps": [{ "tasks": [a,b], "files": string[] }],
 *     "readWriteHazards": [{ "tasks": [a,b], "files": string[] }], // one reads what the other writes (stale-read risk)
 *     "unverifiable": number[], // tasks with no parseable write-set
 *     "safeForInTreeParallel": boolean,
 *     "reasons": string[]       // why it is not safe (empty when safe)
 *   }
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
check-wave-disjoint.cjs — Pre-flight write-set disjointness gate for in-tree parallel waves.

Usage:
  node scripts/check-wave-disjoint.cjs --tasks-index <path> --tasks <N,N,...>
  node scripts/check-wave-disjoint.cjs --tasks-index <path> --wave <N>

Options:
  --tasks-index <path>  Path to the tasks index file (tasks-<feature>.md) (required)
  --tasks <list>        Wave task numbers, comma/space separated, e.g. "1,2,3"
  --wave <N>            Resolve the wave's tasks from the ## Execution Waves section
  --help                Show this help text and exit 0

Provide exactly one of --tasks or --wave.
`.trimStart();

// ─── Parsing primitives (kept in sync with parse-waves.cjs conventions) ──────

const TASK_LINE = /^-\s+\[[ xX]\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+\.md)`/u;
const WAVE_LINE = /^-\s+\*\*Wave\s+(\d+)\*\*\s*\([^)]*\)\s*:\s*(.+?)\s*$/iu;
// Accept both the English heading (normative reference / older plans) and the Portuguese
// heading tasks-template.md emits — otherwise a template-conformant section is silently ignored.
const WAVES_HEADER = /^##\s+(?:Execution Waves|Ondas de Execução)\s*$/iu;
const FILES_SECTION = /^##\s+(?:Arquivos|Files)\s*$/imu;
// Leading verbs that denote a READ — a file listed under one of these is only
// inspected, never mutated, so two tasks may safely share it. en + pt-BR. Everything
// else (create/modify/test, an unknown verb, or no verb) is conservatively a WRITE:
// missing a write∩write or read-after-write hazard corrupts files in the shared tree,
// while an over-cautious write only forgoes a wave's parallelism.
const READ_VERB = /^(?:read|reference|inspect|view|consult|ler|referenciar|referencia|referência|inspecionar|consultar|ver)$/iu;

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
  const opts = { indexPath: null, tasks: null, wave: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--tasks-index") { opts.indexPath = args[++i]; continue; }
    if (a === "--tasks") { opts.tasks = args[++i]; continue; }
    if (a === "--wave") { opts.wave = args[++i]; continue; }
    usage(`Unknown argument: ${a}`);
  }
  if (!opts.indexPath) usage("--tasks-index <path> is required");
  if (opts.tasks == null && opts.wave == null) usage("provide --tasks <list> or --wave <N>");
  if (opts.tasks != null && opts.wave != null) usage("provide only one of --tasks or --wave");
  opts.indexPath = path.resolve(opts.indexPath);
  return opts;
}

/** Pull task numbers out of free text: handles `1, 2`, `task-01`, `task-1`. */
function extractTaskNumbers(text) {
  const nums = [];
  const re = /(?:task-)?0*(\d+)/giu;
  let m;
  while ((m = re.exec(text)) !== null) nums.push(Number.parseInt(m[1], 10));
  return nums;
}

/** Extract `number → file` for every task line in the index. */
function parseIndexTasks(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/u)) {
    const m = line.match(TASK_LINE);
    if (m) map.set(Number.parseInt(m[1], 10), m[3].trim());
  }
  return map;
}

/** Resolve the task numbers of `## Execution Waves` wave N (1-based), or null. */
function waveTaskNumbers(content, waveN) {
  const lines = content.split(/\r?\n/u);
  let inSection = false;
  const waves = [];
  for (const line of lines) {
    if (WAVES_HEADER.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s+/u.test(line)) break;
    if (!inSection) continue;
    const m = line.match(WAVE_LINE);
    if (m) waves.push({ waveNumber: Number.parseInt(m[1], 10), tasks: extractTaskNumbers(m[2]) });
  }
  if (waves.length === 0) return null;
  const found = waves.find((w) => w.waveNumber === waveN);
  return found ? found.tasks : null;
}

/**
 * Read a task file's `## Arquivos`/`## Files` section and split the listed paths
 * into read-set (paths under an explicit read verb only) and write-set (everything
 * else — create/modify/test, an unknown verb, or a bare path). The bias toward write
 * is deliberate: a missed write∩write or read-after-write hazard corrupts the shared
 * tree, whereas an over-cautious write only forgoes a wave's parallelism. Every
 * backticked path on a line is captured, not just the first.
 * Returns { present, writeSet, readSet }. `present` is false when the section is
 * absent — an unverifiable task the caller must treat conservatively.
 */
function parseArquivos(content) {
  const lines = content.split(/\r?\n/u);
  let inSection = false;
  let present = false;
  const writes = new Set();
  const reads = new Set();
  for (const line of lines) {
    if (FILES_SECTION.test(line)) { inSection = true; present = true; continue; }
    // End the manifest at the NEXT heading of any level (## sibling OR ### subsection).
    // The file manifest is ONLY the direct bullets under "## Arquivos". The
    // "### Conformidade com as Skills Padrão" and "### Fidelidade Visual" subsections that
    // follow are guidance prose; their backticked tokens (skill names, Tailwind classes,
    // import aliases like `@/components/ui/x`, and the read-only curated-mockup path) are
    // NOT writes. Scanning them classified the shared mockup as a write in every UI task,
    // producing a false write∩write conflict that wrongly serialized otherwise-disjoint
    // parallel tasks. A genuine read declared in the manifest itself still uses a read verb.
    if (inSection && /^#{2,}\s+/u.test(line)) break;
    if (!inSection) continue;
    // Match "- Verb: `path` ... `path2`" (verb optional). Capture the verb and EVERY
    // backticked path on the line — a line like "- Modify: `a.ts` and `b.ts`" must
    // contribute both files, otherwise a collision on the second one goes undetected.
    const verbMatch = line.match(/^\s*[-*]\s*([A-Za-zÀ-ÿ]+)\s*:/u);
    const paths = [...line.matchAll(/`([^`]+)`/gu)].map((m) => m[1].trim());
    if (paths.length === 0) continue;
    const verb = verbMatch ? verbMatch[1] : "";
    // A path is a READ only under an explicit read verb; an unknown or absent verb is
    // conservatively a WRITE (see READ_VERB) so a hazard is never silently missed.
    const isRead = verb !== "" && READ_VERB.test(verb);
    for (const p of paths) {
      if (!(p.includes("/") || /\.[a-z0-9]+$/iu.test(p))) continue; // not a file path
      if (isRead) reads.add(p);
      else writes.add(p);
    }
  }
  return {
    present,
    writeSet: [...writes].sort(),
    readSet: [...reads].sort(),
  };
}

function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.indexPath)) usage(`Tasks index not found: ${opts.indexPath}`);

  let indexContent;
  try {
    indexContent = fs.readFileSync(opts.indexPath, "utf8");
  } catch (err) {
    process.stderr.write(`Error reading tasks index: ${err.message}\n`);
    process.exit(1);
  }

  const indexDir = path.dirname(opts.indexPath);
  const fileOf = parseIndexTasks(indexContent);

  // Resolve the selection into a deduped, ascending list of task numbers.
  let selection;
  let numbers;
  if (opts.wave != null) {
    const waveN = Number.parseInt(opts.wave, 10);
    if (!Number.isFinite(waveN)) usage("--wave must be a number");
    const nums = waveTaskNumbers(indexContent, waveN);
    if (nums == null) usage(`Wave ${waveN} not found in the ## Execution Waves section`);
    numbers = nums;
    selection = { mode: "wave", value: String(waveN) };
  } else {
    numbers = extractTaskNumbers(opts.tasks);
    selection = { mode: "tasks", value: opts.tasks };
  }
  numbers = [...new Set(numbers)].sort((a, b) => a - b);
  if (numbers.length === 0) usage("no task numbers resolved from the selection");

  const tasks = numbers.map((number) => {
    const file = fileOf.get(number) || `task-${String(number).padStart(2, "0")}.md`;
    const taskPath = path.join(indexDir, file);
    let parsed = { present: false, writeSet: [], readSet: [] };
    if (fs.existsSync(taskPath)) {
      try { parsed = parseArquivos(fs.readFileSync(taskPath, "utf8")); }
      catch (err) { /* leave as unverifiable */ }
    }
    return {
      number,
      file,
      arquivosPresent: parsed.present,
      writeSet: parsed.writeSet,
      readSet: parsed.readSet,
    };
  });

  // Pairwise write∩write between tasks in the selection.
  const writeOverlaps = [];
  // Pairwise read-after-write: one task READS a file another task WRITES. In a
  // shared tree with no ordering guarantee the reader may see the file before (or
  // while) the writer creates it — a stale/torn read. Not write∩write corruption,
  // but still unsafe for concurrent in-tree execution, so it downgrades the verdict.
  const readWriteHazards = [];
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const a = tasks[i];
      const b = tasks[j];
      const setBWrite = new Set(b.writeSet);
      const files = a.writeSet.filter((f) => setBWrite.has(f)).sort();
      if (files.length > 0) writeOverlaps.push({ tasks: [a.number, b.number], files });

      const bReads = new Set(b.readSet);
      const aReads = new Set(a.readSet);
      const hazardFiles = [
        ...a.writeSet.filter((f) => bReads.has(f)),
        ...b.writeSet.filter((f) => aReads.has(f)),
      ];
      const dedupedHazards = [...new Set(hazardFiles)].sort();
      if (dedupedHazards.length > 0) {
        readWriteHazards.push({ tasks: [a.number, b.number], files: dedupedHazards });
      }
    }
  }

  // A task without a parseable write-set cannot be confirmed disjoint.
  const unverifiable = tasks
    .filter((t) => !t.arquivosPresent || t.writeSet.length === 0)
    .map((t) => t.number);

  const reasons = [];
  for (const ov of writeOverlaps) {
    reasons.push(`Tasks ${ov.tasks[0]} & ${ov.tasks[1]} both write ${ov.files.join(", ")} — they cannot run in the shared tree concurrently.`);
  }
  for (const hz of readWriteHazards) {
    reasons.push(`Tasks ${hz.tasks[0]} & ${hz.tasks[1]}: one reads ${hz.files.join(", ")} that the other writes — a concurrent in-tree run risks a stale read; serialize them.`);
  }
  for (const n of unverifiable) {
    const t = tasks.find((x) => x.number === n);
    const why = t.arquivosPresent ? "its ## Arquivos section lists no write paths" : "it has no ## Arquivos section";
    reasons.push(`Task ${n}: cannot verify a write-set (${why}); disjointness is unprovable, so in-tree parallel is unsafe.`);
  }

  const safeForInTreeParallel =
    writeOverlaps.length === 0 && readWriteHazards.length === 0 && unverifiable.length === 0 && tasks.length >= 1;

  const result = {
    tasksIndex: opts.indexPath,
    selection,
    tasks,
    writeOverlaps,
    readWriteHazards,
    unverifiable,
    safeForInTreeParallel,
    reasons,
  };

  reasons.forEach((r) => process.stderr.write(`Blocker: ${r}\n`));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
