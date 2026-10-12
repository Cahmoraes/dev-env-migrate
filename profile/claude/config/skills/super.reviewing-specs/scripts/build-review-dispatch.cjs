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
// It also RENDERS the dispatches. The manifest alone was not enough: a cheap controller
// (haiku, measured 2026-09-10 over 15 eval runs) built the manifest, saw `valid: true`,
// then either applied the lenses inline or sent the subagents with `model:` omitted —
// it did not copy what the manifest already held. So `dispatches[]` carries, per lens,
// the complete `Subagent (read-only):` block from agents/spec-reviewer.md with every
// placeholder filled (model, lens probes, language, domain, artifact paths). A block that
// still contains a `{PLACEHOLDER}` is refused here, never emitted half-filled.
//
// File + pointer, not the rendered block inline (same shape as build-qa-dispatch.cjs and
// build-task-dispatch.cjs): a rendered block printed on the controller's stdout is
// instruction, not data, and a haiku controller narrated it, retyped it without `model:`,
// or ran it inline. So each lens's rendered prompt body is written to its own file under
// `--prompt-dir`, and the entry the controller sees carries three short fields:
// `description`, `model`, and a one-line `prompt` that names the file.
//
// Usage:
//   node build-review-dispatch.cjs --targets <targets.json> --capable-model <name|auto> --language <lang> [--domain-expertise <phrase>]
//   node build-review-dispatch.cjs --targets <targets.json> --capable-model auto --language pt-BR --no-tasks --no-corporate
//
// --targets is the JSON produced by resolve-review-targets.cjs (path, or "-" for stdin).
// --capable-model is the resolved capable model (preferences.model_tiers.capable) or
//   "auto" (harness picks the most capable). "auto"/"" => the manifest carries model
//   "auto" and modelTiers.capable "auto", so validate-dispatch skips the equality gate
//   for that tier (a legitimate harness-picks) while still requiring a non-empty model.
//
// --language is the session language the reports must come out in (e.g. pt-BR).
// --domain-expertise is a short phrase naming the spec's domain and stack (default
//   "generic": the reviewer infers it from the spec and the repo).
//
// --prompt-dir is where the rendered prompt files go (created if missing). Default: a
//   fresh unique directory under the OS temp dir (mkdtemp).
//
// Output (stdout): the dispatch manifest JSON (validate-dispatch-ready) plus `promptDir`
//   and `dispatches[]`: [{ label, description, model, promptFile, prompt }] — one entry
//   per agent, `promptFile` absolute.
//   node <dispatching-parallel-agents>/scripts/validate-dispatch.cjs --dispatch <this>

const fs = require('fs');
const os = require('os');
const path = require('path');

const { pointerPrompt } = require('../../super.using-superpowers/scripts/lib/dispatch-pointer.cjs');

const TEMPLATE = path.resolve(__dirname, '..', 'agents', 'spec-reviewer.md');
const LENS_CATALOG = path.resolve(__dirname, '..', 'references', 'review-lenses.md');

const HELP = `
build-review-dispatch.cjs — emit a capable-tier dispatch manifest for a spec review.

Usage:
  node build-review-dispatch.cjs --targets <targets.json|-> --capable-model <name|auto> --language <lang> [--domain-expertise <phrase>] [--no-tasks] [--no-corporate]

Options:
  --targets <path|->            resolve-review-targets.cjs output (file path, or - for stdin).
  --capable-model <name>        Resolved capable model, or "auto" (harness picks). Required.
  --language <lang>             Session language for the reports (e.g. pt-BR). Required.
  --domain-expertise <phrase>   The spec's domain and stack, one short phrase. Default "generic".
  --no-tasks                    Force-skip Lens 3 even if tasks are present.
  --no-corporate                Force-skip Lens 5 even if corporate artifacts are present.
  --prompt-dir <dir>            Directory for the rendered prompt files (created if missing).
                                Default: a fresh unique directory under the OS temp dir.
  --help                        Show this help and exit 0.
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
  const opts = { targets: null, capableModel: null, language: null, domainExpertise: 'generic', noTasks: false, noCorporate: false, promptDir: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--targets') {
      if (!args[i + 1]) usage('--targets <path|-> requires a value');
      opts.targets = args[++i];
    } else if (arg === '--capable-model') {
      if (args[i + 1] == null) usage('--capable-model <name|auto> requires a value');
      opts.capableModel = args[++i];
    } else if (arg === '--language') {
      if (!args[i + 1]) usage('--language <lang> requires a value');
      opts.language = args[++i];
    } else if (arg === '--domain-expertise') {
      if (!args[i + 1]) usage('--domain-expertise <phrase> requires a value');
      opts.domainExpertise = args[++i];
    } else if (arg === '--no-tasks') {
      opts.noTasks = true;
    } else if (arg === '--no-corporate') {
      opts.noCorporate = true;
    } else if (arg === '--prompt-dir') {
      if (!args[i + 1]) usage('--prompt-dir <dir> requires a value');
      opts.promptDir = args[++i];
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.targets) usage('--targets <path|-> is required');
  if (opts.capableModel == null) usage('--capable-model <name|auto> is required');
  if (!opts.language) usage('--language <lang> is required (the reports come out in it)');
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
    // Internal, stripped before output: what renderDispatches needs beyond the manifest.
    lensesIncluded: included, taskReads, corporateReads,
  };
}

/** The `Subagent (read-only):` block of agents/spec-reviewer.md, verbatim. */
function readTemplateBlock() {
  const md = fs.readFileSync(TEMPLATE, 'utf8');
  const m = md.match(/```\n(Subagent \(read-only\):\n[\s\S]*?)\n```/);
  if (!m) usage(`agents/spec-reviewer.md has no \`Subagent (read-only):\` fenced block`);
  return m[1];
}

/** The probe section of one lens from references/review-lenses.md, by lens number. */
let lensChunks = null;
function readLensProbes(lensId) {
  // Split on H2 headings, once per run (not once per lens); the section is the chunk
  // whose heading names this lens.
  if (!lensChunks) lensChunks = fs.readFileSync(LENS_CATALOG, 'utf8').split(/^(?=## )/m);
  const chunk = lensChunks.find((c) => new RegExp(`^## Lens ${lensId}\\b`).test(c));
  if (!chunk) usage(`references/review-lenses.md has no "## Lens ${lensId}" section`);
  return chunk.replace(/^## [^\n]*\n/, '').trim();
}

/** Indents a multi-line value so it stays inside the block's `prompt: |` scalar. */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line ? pad + line : line)).join('\n');
}

function orNone(list) { return list.length ? list.join(', ') : 'none'; }

/**
 * A validated rendered block -> its `description` value and its `prompt: |` body dedented by
 * the template's fixed 4 spaces. A non-empty body line with less indent means the template's
 * scalar changed shape under this script: refused, never written half-dedented.
 */
function splitBlock(block, label) {
  const lines = block.split('\n');
  const desc = block.match(/^ {2}description: "(.*)"$/m);
  if (!desc) usage(`rendered block for ${label} has no "  description:" line`);
  const promptIdx = lines.indexOf('  prompt: |');
  if (promptIdx === -1) usage(`rendered block for ${label} has no "  prompt: |" line`);
  const body = lines.slice(promptIdx + 1).map((line) => {
    if (line === '') return '';
    if (!line.startsWith('    ')) usage(`rendered block for ${label}: the template's prompt scalar changed shape — expected a 4-space indent on "${line}"`);
    return line.slice(4);
  });
  return { description: desc[1], body: body.join('\n') };
}

function renderDispatches(manifest, targets, lensesIncluded, { language, domainExpertise, taskReads, corporateReads, promptDir }) {
  const block = readTemplateBlock();
  const specPath = targets.spec && targets.spec.path ? targets.spec.path : 'none';
  const prd = targets.prd && targets.prd.found ? targets.prd.path : 'none';
  const tasksIndex = targets.tasksIndex && targets.tasksIndex.found ? targets.tasksIndex.path : 'none';
  const urlEntries = (targets.corporateArtifacts && targets.corporateArtifacts.entries || [])
    .filter((e) => e && e.kind === 'url').map((e) => `${e.url || e.source || 'url'} (URL: not fetchable by a read-only reviewer, report as not re-verified)`);
  const corporate = orNone(corporateReads.concat(urlEntries));
  const repoRoot = targets.repoRoot || 'none';

  return manifest.agents.map((agent, i) => {
    const lens = lensesIncluded[i];
    const fills = {
      '{LENS_NAME}': lens.name,
      '{LENS_PROBES}': indent(readLensProbes(lens.id), 4).trimStart(),
      '{LANGUAGE}': language,
      '{DOMAIN_EXPERTISE}': domainExpertise,
      '{SPEC_PATH}': specPath,
      '{PRD_PATH_OR_NONE}': prd,
      '{TASKS_INDEX_OR_NONE}': tasksIndex,
      '{TASK_FILES_OR_NONE}': orNone(taskReads.filter((t) => t !== tasksIndex)),
      '{CORPORATE_ARTIFACTS_OR_NONE}': corporate,
      '{REPO_ROOT}': repoRoot,
    };
    let out = block
      // The template's `model: [REQUIRED — ...]` bracket (multi-line) becomes the resolved model.
      .replace(/model: \[[\s\S]*?\]\n/, `model: ${agent.model}\n`);
    for (const [k, v] of Object.entries(fills)) out = out.split(k).join(v);
    const left = out.match(/\{[A-Z_]+\}/g);
    if (left) usage(`rendered block for ${agent.label} still has placeholders: ${[...new Set(left)].join(', ')}`);
    if (!/^Subagent \(read-only\):\n/.test(out)) usage('rendered block lost its Subagent header');
    if (!new RegExp(`^  model: ${agent.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(out)) usage(`rendered block for ${agent.label} does not carry model ${agent.model}`);
    const { description, body } = splitBlock(out, agent.label);
    const promptFile = path.resolve(promptDir, `review-lens-${lens.id}.md`);
    fs.writeFileSync(promptFile, `${body}\n`, 'utf8');
    const prompt = pointerPrompt(promptFile);
    return { label: agent.label, description, model: agent.model, promptFile, prompt };
  });
}

function main() {
  const opts = parseArgs(process.argv);
  const targets = readTargets(opts.targets);
  if (targets === null || typeof targets !== 'object' || Array.isArray(targets)) {
    usage('--targets must be a JSON object (resolve-review-targets.cjs output)');
  }
  const built = buildManifest(targets, opts.capableModel, opts.noTasks, opts.noCorporate);
  const { lensesIncluded, taskReads, corporateReads, ...manifest } = built;
  let promptDir;
  if (opts.promptDir) {
    fs.mkdirSync(opts.promptDir, { recursive: true });
    promptDir = path.resolve(opts.promptDir);
  } else {
    promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superpowers-review-dispatch-'));
  }
  manifest.promptDir = promptDir;
  manifest.dispatches = renderDispatches(manifest, targets, lensesIncluded, {
    language: opts.language, domainExpertise: opts.domainExpertise, taskReads, corporateReads, promptDir,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.exit(0);
}

main();
