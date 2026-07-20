#!/usr/bin/env node
'use strict';

// build-review-dispatch.cjs — emit a validate-dispatch-ready manifest for the spec
// review, with every reviewer pinned to the `capable` tier.
//
// Why a script instead of hand-writing the JSON: the "always capable" invariant must
// be encoded in code, not prose. A hand-built dispatch is where the model drifts —
// omitting `model:` (inherits the controller's) or picking a different model "to be
// safe". This stamps tier:"capable" + an explicit model on every reviewer and sets
// modelTiers.capable to the same resolution, so super.dispatching-parallel-agents'
// validate-dispatch.cjs can mechanically catch any drift (tier_model_mismatch).
//
// Lens 3 (spec ↔ tasks) is only included when the targets actually have tasks — a
// pure spec review runs lenses 1, 2, 4. Lens 5 (spec/PRD ↔ corporate artifacts) is
// included only when .superpowers/corporate-artifacts.yml declared at least one artifact.
//
// Usage:
//   node build-review-dispatch.cjs --targets <targets.json> --capable-model <name|auto>
//   node build-review-dispatch.cjs --targets <targets.json> --capable-model auto --no-tasks --no-corporate
//
// --targets is the JSON produced by resolve-review-targets.cjs (path, or "-" for stdin).
// --capable-model is the resolved capable model (preferences.model_tiers.capable) or
//   "auto" (harness picks the most capable). "auto"/"" => the manifest carries model
//   "auto" and modelTiers.capable "auto", so validate-dispatch skips the equality gate
//   for that tier (a legitimate harness-picks) while still requiring a non-empty model.
//
// Output (stdout): the dispatch manifest JSON, ready for:
//   node <dispatching-parallel-agents>/scripts/validate-dispatch.cjs --dispatch <this>

const fs = require('fs');

const HELP = `
build-review-dispatch.cjs — emit a capable-tier dispatch manifest for a spec review.

Usage:
  node build-review-dispatch.cjs --targets <targets.json|-> --capable-model <name|auto> [--no-tasks] [--no-corporate]

Options:
  --targets <path|->      resolve-review-targets.cjs output (file path, or - for stdin).
  --capable-model <name>  Resolved capable model, or "auto" (harness picks). Required.
  --no-tasks              Force-skip Lens 3 even if tasks are present.
  --no-corporate          Force-skip Lens 5 even if corporate artifacts are present.
  --help                  Show this help and exit 0.
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
  const opts = { targets: null, capableModel: null, noTasks: false, noCorporate: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--targets') {
      if (!args[i + 1]) usage('--targets <path|-> requires a value');
      opts.targets = args[++i];
    } else if (arg === '--capable-model') {
      if (args[i + 1] == null) usage('--capable-model <name|auto> requires a value');
      opts.capableModel = args[++i];
    } else if (arg === '--no-tasks') {
      opts.noTasks = true;
    } else if (arg === '--no-corporate') {
      opts.noCorporate = true;
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.targets) usage('--targets <path|-> is required');
  if (opts.capableModel == null) usage('--capable-model <name|auto> is required');
  return opts;
}

function readTargets(source) {
  let raw;
  try {
    raw = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  } catch (err) {
    usage(`cannot read --targets: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    usage(`--targets is not valid JSON: ${err.message}`);
  }
  return null;
}

// The lenses. Lens 3 is conditional on tasks existing; Lens 5 on corporate artifacts.
const LENSES = [
  { id: 1, name: 'Coerência interna & completude', needsTasks: false, needsCorporate: false },
  { id: 2, name: 'Spec ↔ realidade do código', needsTasks: false, needsCorporate: false },
  { id: 3, name: 'Spec ↔ tasks / plano', needsTasks: true, needsCorporate: false },
  { id: 4, name: 'Operabilidade, ciclo de vida & testabilidade', needsTasks: false, needsCorporate: false },
  { id: 5, name: 'Spec/PRD ↔ artefatos corporativos', needsTasks: false, needsCorporate: true },
];

// Normalize the capable model: "" or "auto" (any case) => "auto" (harness picks).
function normalizeCapable(model) {
  const norm = typeof model === 'string' ? model.trim() : '';
  if (!norm || norm.toLowerCase() === 'auto') return 'auto';
  return norm;
}

function buildManifest(targets, capableModel, noTasks, noCorporate) {
  const indexFound = !!(targets.tasksIndex && targets.tasksIndex.found);
  const taskFilesPresent = Array.isArray(targets.taskFiles) && targets.taskFiles.length > 0;
  const hasTasks = !noTasks && (indexFound || taskFilesPresent);

  const corporate = targets.corporateArtifacts;
  const hasCorporate = !noCorporate && !!(corporate && corporate.found);

  const model = normalizeCapable(capableModel);

  // readFiles: every reviewer reads the spec; lens 3 additionally reads the tasks, lens 5
  // the LOCAL corporate artifacts (URLs can't be fetched by a read-only reviewer — the lens
  // reports those as not re-verified). Reviewers never write, so no writeFiles.
  const specPath = targets.spec && targets.spec.path ? targets.spec.path : null;
  const companionReads = [];
  if (specPath) companionReads.push(specPath);
  if (targets.prd && targets.prd.found) companionReads.push(targets.prd.path);

  const taskReads = [];
  if (targets.tasksIndex && targets.tasksIndex.found) taskReads.push(targets.tasksIndex.path);
  if (Array.isArray(targets.taskFiles)) {
    for (const t of targets.taskFiles) {
      if (typeof t === 'string') taskReads.push(t);
      else if (t && typeof t.path === 'string') taskReads.push(t.path);
    }
  }

  const corporateReads = [];
  if (corporate && Array.isArray(corporate.entries)) {
    for (const e of corporate.entries) {
      if (e && e.kind === 'path' && e.exists && typeof e.resolvedPath === 'string') {
        corporateReads.push(e.resolvedPath);
      }
    }
  }

  const included = LENSES.filter((lens) => {
    if (lens.needsTasks && !hasTasks) return false;
    if (lens.needsCorporate && !hasCorporate) return false;
    return true;
  });

  const agents = included.map((lens) => {
    let readFiles = companionReads.slice();
    if (lens.needsTasks) readFiles = readFiles.concat(taskReads);
    if (lens.needsCorporate) readFiles = readFiles.concat(corporateReads);
    return {
      label: `lens-${lens.id}-${lens.name}`,
      model,
      tier: 'capable',
      goal: `Review the spec through lens: ${lens.name}. Return findings (severity · section · what · why · fix) or "clean on this lens".`,
      readFiles,
    };
  });

  return {
    // modelTiers.capable mirrors the resolution so validate-dispatch enforces
    // tier↔model equality (skipped when "auto" — a legitimate harness-picks).
    modelTiers: { capable: model === 'auto' ? 'auto' : model },
    enforceWriteSets: false,
    reviewIncludesTasks: hasTasks,
    reviewIncludesCorporate: hasCorporate,
    agents,
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const targets = readTargets(opts.targets);
  if (targets === null || typeof targets !== 'object' || Array.isArray(targets)) {
    usage('--targets must be a JSON object (resolve-review-targets.cjs output)');
  }
  const manifest = buildManifest(targets, opts.capableModel, opts.noTasks, opts.noCorporate);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.exit(0);
}

main();
