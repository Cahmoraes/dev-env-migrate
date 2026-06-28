#!/usr/bin/env node
/**
 * check-pmem-deps.cjs — Deterministic availability check for the pmem CLI.
 *
 * pmem is a thin bash wrapper around `python3 memory.py`. memory.py hard-requires
 * numpy (module-level import — without it every pmem command crashes) and lazily
 * requires sentence-transformers for embedding commands (`add` without --no-embed,
 * `search`, `backfill-embeddings`). sqlite-vec is optional: semantic search falls
 * back to Python cosine when it is missing.
 *
 * This script answers "can pmem run on this machine?" WITHOUT importing the heavy
 * modules (it uses importlib.util.find_spec — no torch load, ~0.1s) and emits JSON
 * so the Availability Gate in SKILL.md can decide whether to ask the user to
 * install the missing pieces.
 *
 * Usage:
 *   node scripts/check-pmem-deps.cjs [--python <bin>]
 *
 * Options:
 *   --python <bin>   Python interpreter to probe (default: "python3")
 *
 * Exit codes:
 *   0  check completed (availability is reported in the JSON, NOT the exit code)
 *   1  usage error
 *
 * Output (stdout): JSON
 *   {
 *     "python": string,                    // interpreter that was probed
 *     "pythonAvailable": boolean,          // interpreter found on PATH
 *     "pythonVersion": string|null,
 *     "modules": {                         // null = could not check (python missing)
 *       "numpy": boolean|null,
 *       "sentence_transformers": boolean|null,
 *       "sqlite_vec": boolean|null
 *     },
 *     "coreAvailable": boolean,            // python + numpy → pmem runs at all
 *     "embeddingAvailable": boolean,       // + sentence_transformers → semantic add/search work
 *     "fullyAvailable": boolean,           // coreAvailable && embeddingAvailable
 *     "missing": string[],                 // required pieces that are absent (never includes sqlite_vec)
 *     "installCommand": string|null,       // command that fixes `missing`; null when python itself is missing
 *     "notes": string[]                    // human-readable hints (e.g. optional sqlite-vec fallback)
 *   }
 */

'use strict';

const { spawnSync } = require('child_process');

/** Python module name → pip package name. */
const PIP_PACKAGES = {
  numpy: 'numpy',
  sentence_transformers: 'sentence-transformers',
  sqlite_vec: 'sqlite-vec',
};

const REQUIRED_MODULES = ['numpy', 'sentence_transformers'];
const OPTIONAL_MODULES = ['sqlite_vec'];
const ALL_MODULES = [...REQUIRED_MODULES, ...OPTIONAL_MODULES];

const HELP = `
check-pmem-deps.cjs — Check whether the pmem CLI can run on this machine.

Usage:
  node scripts/check-pmem-deps.cjs [--python <bin>]

Options:
  --python <bin>  Python interpreter to probe (default: python3)
  --help          Show this help text and exit 0
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
  let python = 'python3';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--python') {
      if (!args[i + 1]) usage('--python <bin> requires a value');
      python = args[i + 1];
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${args[i]}`);
  }
  return { python };
}

/** Probe the interpreter itself. Returns { available, version }. */
function checkPython(python) {
  const run = spawnSync(python, ['--version'], { encoding: 'utf8' });
  if (run.error || run.status !== 0) return { available: false, version: null };
  const version = `${run.stdout || ''}${run.stderr || ''}`.trim() || null;
  return { available: true, version };
}

/**
 * Probe module availability in ONE python process using find_spec (no import of
 * the module itself, so no torch/model load). Returns { numpy: bool, ... } or
 * null when the probe itself failed.
 */
function checkModules(python) {
  const probe = [
    'import importlib.util, json',
    `mods = ${JSON.stringify(ALL_MODULES)}`,
    'print(json.dumps({m: importlib.util.find_spec(m) is not None for m in mods}))',
  ].join('; ');
  const run = spawnSync(python, ['-c', probe], { encoding: 'utf8' });
  if (run.error || run.status !== 0) return null;
  try {
    return JSON.parse(`${run.stdout || ''}`.trim());
  } catch {
    return null;
  }
}

/** Build the report object from probe results (pure — unit-testable). */
function buildReport(python, pythonProbe, modules) {
  const nullModules = Object.fromEntries(ALL_MODULES.map((m) => [m, null]));
  const report = {
    python,
    pythonAvailable: pythonProbe.available,
    pythonVersion: pythonProbe.version,
    modules: modules || nullModules,
    coreAvailable: false,
    embeddingAvailable: false,
    fullyAvailable: false,
    missing: [],
    installCommand: null,
    notes: [],
  };

  if (!pythonProbe.available || modules === null) {
    report.missing = ['python3'];
    report.notes.push(
      `Python 3 ("${python}") was not found or is not functional. Install it via your system package manager (apt/brew/winget) — pip cannot install Python itself.`,
    );
    return report;
  }

  report.coreAvailable = modules.numpy === true;
  report.embeddingAvailable = report.coreAvailable && modules.sentence_transformers === true;
  report.fullyAvailable = report.coreAvailable && report.embeddingAvailable;

  const missingRequired = REQUIRED_MODULES.filter((m) => modules[m] !== true);
  report.missing = missingRequired;
  if (missingRequired.length > 0) {
    const packages = missingRequired.map((m) => PIP_PACKAGES[m]).join(' ');
    report.installCommand = `${python} -m pip install ${packages}`;
  }

  if (modules.sqlite_vec !== true) {
    report.notes.push(
      `sqlite-vec is not installed (optional) — semantic search falls back to the slower Python cosine path. To enable it: ${python} -m pip install sqlite-vec`,
    );
  }

  return report;
}

function main() {
  const { python } = parseArgs(process.argv);
  const pythonProbe = checkPython(python);
  const modules = pythonProbe.available ? checkModules(python) : null;
  const report = buildReport(python, pythonProbe, modules);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, checkPython, checkModules, buildReport, PIP_PACKAGES, REQUIRED_MODULES, OPTIONAL_MODULES };
