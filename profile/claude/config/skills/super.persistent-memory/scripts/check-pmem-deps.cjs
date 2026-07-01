#!/usr/bin/env node
/**
 * check-pmem-deps.cjs — Deterministic availability + version check for pmem.
 *
 * pmem is a thin bash wrapper around `python3 memory.py`. memory.py hard-requires
 * numpy (module-level import — without it every pmem command crashes) and lazily
 * requires sentence-transformers for embedding commands (`add` without --no-embed,
 * `search`, `reembed`, `backfill-embeddings`). sqlite-vec is optional: semantic
 * search falls back to Python cosine when it is missing.
 *
 * This script answers two questions WITHOUT importing the heavy modules (it uses
 * importlib.util.find_spec + importlib.metadata.version — no torch load, ~0.1s):
 *   1. "Can pmem run on this machine?"  → missing required modules
 *   2. "Are the installed versions current?" → modules present but below the
 *      tested floors in requirements.txt (model/feature drift risk)
 * It emits JSON so the Availability Gate in SKILL.md can RECOMMEND an install or
 * upgrade. It never installs or upgrades anything itself.
 *
 * Usage:
 *   node scripts/check-pmem-deps.cjs [--python <bin>] [--requirements <path>]
 *
 * Options:
 *   --python <bin>         Python interpreter to probe (default: "python3")
 *   --requirements <path>  requirements.txt to read floors from
 *                          (default: ../requirements.txt next to this script)
 *
 * Exit codes:
 *   0  check completed (availability is reported in the JSON, NOT the exit code)
 *   1  usage error
 *
 * Output (stdout): JSON
 *   {
 *     "python": string,
 *     "pythonAvailable": boolean,
 *     "pythonVersion": string|null,
 *     "modules": { "numpy": boolean|null, ... },     // null = could not probe
 *     "versions": { "numpy": string|null, ... },     // installed dist version
 *     "floors": { "numpy": string|null, ... },       // tested minimum (requirements)
 *     "coreAvailable": boolean,
 *     "embeddingAvailable": boolean,
 *     "fullyAvailable": boolean,
 *     "missing": string[],                            // required modules absent
 *     "outdated": string[],                           // present but below floor
 *     "installCommand": string|null,                  // fixes missing/outdated; null if python missing
 *     "requirementsPath": string,
 *     "requirementsFound": boolean,
 *     "notes": string[]
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
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

const DEFAULT_REQUIREMENTS = path.resolve(__dirname, 'requirements.txt');

const HELP = `
check-pmem-deps.cjs — Check whether the pmem CLI can run, and whether its deps are current.

Usage:
  node scripts/check-pmem-deps.cjs [--python <bin>] [--requirements <path>]

Options:
  --python <bin>         Python interpreter to probe (default: python3)
  --requirements <path>  requirements.txt to read version floors from
                         (default: requirements.txt next to this script)
  --help                 Show this help text and exit 0
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
  let requirements = DEFAULT_REQUIREMENTS;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--python') {
      if (!args[i + 1]) usage('--python <bin> requires a value');
      python = args[i + 1];
      i += 1;
      continue;
    }
    if (args[i] === '--requirements') {
      if (!args[i + 1]) usage('--requirements <path> requires a value');
      requirements = args[i + 1];
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${args[i]}`);
  }
  return { python, requirements };
}

/**
 * Parse `pkg>=ver` floors from a requirements file, keyed by MODULE name (not pip
 * name). Ignores comments/blank lines and any spec that is not a `>=` bound.
 * Returns { module: floorString } and never throws — a missing/unreadable file
 * yields {} so the caller can degrade to a plain availability check.
 */
function parseFloors(requirementsPath) {
  const pipToModule = Object.fromEntries(
    Object.entries(PIP_PACKAGES).map(([mod, pip]) => [pip, mod]),
  );
  let text;
  try {
    text = fs.readFileSync(requirementsPath, 'utf8');
  } catch {
    return {};
  }
  const floors = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*>=\s*([0-9][0-9A-Za-z.+-]*)/);
    if (!match) continue;
    const mod = pipToModule[match[1].toLowerCase()];
    if (mod) floors[mod] = match[2];
  }
  return floors;
}

/**
 * Compare two dotted version strings numerically. Returns -1 if a < b, 0 if
 * equal (on the compared numeric prefix), 1 if a > b. Non-numeric trailing parts
 * (e.g. "+cu130", "rc1") are ignored on each segment via parseInt.
 */
function compareVersions(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = parseInt(pa[i], 10) || 0;
    const nb = parseInt(pb[i], 10) || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/** Probe the interpreter itself. Returns { available, version }. */
function checkPython(python) {
  const run = spawnSync(python, ['--version'], { encoding: 'utf8' });
  if (run.error || run.status !== 0) return { available: false, version: null };
  const version = `${run.stdout || ''}${run.stderr || ''}`.trim() || null;
  return { available: true, version };
}

/**
 * Probe module availability AND installed version in ONE python process using
 * find_spec (no import of the module itself, so no torch/model load) plus
 * importlib.metadata.version. Returns { module: { present, version } } or null
 * when the probe itself failed / emitted non-JSON.
 */
function checkModules(python) {
  const distMap = JSON.stringify(PIP_PACKAGES);
  const probe = [
    'import importlib.util, importlib.metadata, json',
    `dist = ${distMap}`,
    'out = {}',
    'for m, d in dist.items():',
    '    present = importlib.util.find_spec(m) is not None',
    '    try:',
    '        ver = importlib.metadata.version(d)',
    '    except Exception:',
    '        ver = None',
    '    out[m] = {"present": present, "version": ver}',
    'print(json.dumps(out))',
  ].join('\n');
  const run = spawnSync(python, ['-c', probe], { encoding: 'utf8' });
  if (run.error || run.status !== 0) return null;
  try {
    const parsed = JSON.parse(`${run.stdout || ''}`.trim());
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build the report object from probe results (pure — unit-testable). */
function buildReport(python, pythonProbe, probe, floors, requirementsPath) {
  const safeFloors = floors || {};
  const nullModules = Object.fromEntries(ALL_MODULES.map((m) => [m, null]));
  const nullVersions = Object.fromEntries(ALL_MODULES.map((m) => [m, null]));
  const floorMap = Object.fromEntries(ALL_MODULES.map((m) => [m, safeFloors[m] || null]));
  const requirementsFound = fs.existsSync(requirementsPath);

  const report = {
    python,
    pythonAvailable: pythonProbe.available,
    pythonVersion: pythonProbe.version,
    modules: nullModules,
    versions: nullVersions,
    floors: floorMap,
    coreAvailable: false,
    embeddingAvailable: false,
    fullyAvailable: false,
    missing: [],
    outdated: [],
    installCommand: null,
    requirementsPath,
    requirementsFound,
    notes: [],
  };

  if (!pythonProbe.available || probe === null) {
    report.missing = ['python3'];
    report.notes.push(
      `Python 3 ("${python}") was not found or is not functional. Install it via your system package manager (apt/brew/winget) — pip cannot install Python itself.`,
    );
    return report;
  }

  const present = Object.fromEntries(
    ALL_MODULES.map((m) => [m, probe[m] ? probe[m].present === true : false]),
  );
  report.modules = present;
  report.versions = Object.fromEntries(
    ALL_MODULES.map((m) => [m, (probe[m] && probe[m].version) || null]),
  );

  report.coreAvailable = present.numpy === true;
  report.embeddingAvailable = report.coreAvailable && present.sentence_transformers === true;
  report.fullyAvailable = report.coreAvailable && report.embeddingAvailable;

  report.missing = REQUIRED_MODULES.filter((m) => present[m] !== true);
  report.outdated = REQUIRED_MODULES.filter((m) => {
    const ver = report.versions[m];
    const floor = floorMap[m];
    return present[m] === true && ver && floor && compareVersions(ver, floor) < 0;
  });

  // A single `pip install -r requirements.txt` both installs the missing modules
  // and upgrades the below-floor ones (the >= bounds force the upgrade). Fall back
  // to targeted pip names only if requirements.txt is absent.
  if (report.missing.length > 0 || report.outdated.length > 0) {
    if (requirementsFound) {
      report.installCommand = `${python} -m pip install -r ${requirementsPath}`;
    } else {
      const packages = report.missing.map((m) => PIP_PACKAGES[m]).join(' ');
      report.installCommand = packages
        ? `${python} -m pip install ${packages}`
        : `${python} -m pip install -r ${requirementsPath}`;
    }
  }

  if (report.outdated.length > 0) {
    const detail = report.outdated
      .map((m) => `${PIP_PACKAGES[m]} ${report.versions[m]} < ${floorMap[m]}`)
      .join(', ');
    report.notes.push(
      `Some dependencies are below the tested minimum (${detail}). RECOMMEND running "${report.installCommand}" — but do not upgrade without the user's consent.`,
    );
  }

  if (present.sqlite_vec !== true) {
    report.notes.push(
      `sqlite-vec is not installed (optional) — semantic search falls back to the slower Python cosine path. To enable it: ${python} -m pip install sqlite-vec`,
    );
  }

  return report;
}

function main() {
  const { python, requirements } = parseArgs(process.argv);
  const pythonProbe = checkPython(python);
  const probe = pythonProbe.available ? checkModules(python) : null;
  const floors = parseFloors(requirements);
  const report = buildReport(python, pythonProbe, probe, floors, requirements);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseFloors,
  compareVersions,
  checkPython,
  checkModules,
  buildReport,
  PIP_PACKAGES,
  REQUIRED_MODULES,
  OPTIONAL_MODULES,
  DEFAULT_REQUIREMENTS,
};
