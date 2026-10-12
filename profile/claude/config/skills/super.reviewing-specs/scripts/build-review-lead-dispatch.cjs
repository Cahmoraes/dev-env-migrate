#!/usr/bin/env node
'use strict';

// build-review-lead-dispatch.cjs — emit the ONE dispatch the reviewing-specs controller
// sends: a `capable` review lead that fans the lenses out itself.
//
// Why a lead: the controller used to dispatch three to five lens reviewers itself. A haiku
// controller reviewed inline instead (1/6 runs dispatched) and, when it dispatched, dropped
// `model:`; a sonnet controller dispatched 6/6 but still dropped or upgraded `model:` in half
// of the runs (2026-09-11). A subagent can dispatch subagents of its own, so the fan-out moves
// into a capable lead and the controller's part shrinks to a single entry, sent as emitted.
//
// Same file + pointer shape as build-review-dispatch.cjs: the lead's rendered prompt is written
// to a file under --prompt-dir and the entry carries only `description`, `model` and a one-line
// `prompt`. The rendered prompt names every path the lead needs (targets, lens prompt dir,
// manifest, report) with <super.X-base-dir> tokens resolved to absolute paths, so the lead runs
// build-review-dispatch.cjs and validate-dispatch.cjs without resolving anything.
//
// Usage:
//   node build-review-lead-dispatch.cjs --targets <targets.json> --capable-model <name|auto>
//     --language <lang> [--domain-expertise <phrase>] [--prompt-dir <dir>]
//
// --targets must be a FILE (resolve-review-targets.cjs output): the lead re-reads it.
//
// Output (stdout): { tier: "capable", model, featureName, promptDir, reportPath,
//   dispatches: [{ label: "review-lead", description, model, promptFile, prompt }] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const { pointerPrompt } = require('../../super.using-superpowers/scripts/lib/dispatch-pointer.cjs');

const TEMPLATE = path.resolve(__dirname, '..', 'agents', 'review-lead.md');
const SKILLS_ROOT = path.resolve(__dirname, '..', '..');

const HELP = `
build-review-lead-dispatch.cjs — emit the single capable review-lead dispatch.

Usage:
  node build-review-lead-dispatch.cjs --targets <targets.json> --capable-model <name|auto> --language <lang> [--domain-expertise <phrase>] [--prompt-dir <dir>]

Options:
  --targets <path>              resolve-review-targets.cjs output saved to a file. Required.
  --capable-model <name>        Resolved capable model, or "auto" (harness picks). Required.
  --language <lang>             Session language for the report (e.g. pt-BR). Required.
  --domain-expertise <phrase>   The spec's domain and stack, one short phrase. Default "generic".
  --prompt-dir <dir>            Directory for the lead's prompt, the lens prompts, the manifest
                                and the report (created if missing). Default: a fresh unique
                                directory under the OS temp dir.
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
  const opts = { targets: null, capableModel: null, language: null, domainExpertise: 'generic', promptDir: null };
  const FLAGS = { '--targets': 'targets', '--capable-model': 'capableModel', '--language': 'language', '--domain-expertise': 'domainExpertise', '--prompt-dir': 'promptDir' };
  for (let i = 0; i < args.length; i += 1) {
    const key = FLAGS[args[i]];
    if (!key) usage(`Unknown argument: ${args[i]}`);
    if (args[i + 1] == null) usage(`${args[i]} requires a value`);
    opts[key] = args[i + 1];
    i += 1;
  }
  if (!opts.targets) usage('--targets <path> is required');
  if (opts.targets === '-') usage('--targets must be a file path: the lead re-reads it, so stdin cannot be forwarded');
  if (opts.capableModel == null) usage('--capable-model <name|auto> is required');
  if (!opts.language) usage('--language <lang> is required (the report comes out in it)');
  // These values land inside double-quoted shell arguments of the lead's commands.
  for (const [flag, value] of [['--language', opts.language], ['--domain-expertise', opts.domainExpertise], ['--capable-model', opts.capableModel]]) {
    if (/["`$\\]/.test(value)) usage(`${flag} must not contain " \` $ or \\ (it is rendered into a quoted shell argument)`);
  }
  return opts;
}

function normalizeCapable(model) {
  const norm = typeof model === 'string' ? model.trim() : '';
  if (!norm || norm.toLowerCase() === 'auto') return 'auto';
  return norm;
}

function readTargets(file) {
  let targets;
  try {
    targets = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    usage(`cannot read --targets as JSON: ${err.message}`);
  }
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) usage('--targets must be a JSON object (resolve-review-targets.cjs output)');
  if (!targets.spec || !targets.spec.path) usage('--targets has no spec.path: resolve the spec before building the lead dispatch');
  return targets;
}

/** The `Subagent (review lead):` fenced block of agents/review-lead.md, verbatim. */
function readTemplateBlock() {
  const md = fs.readFileSync(TEMPLATE, 'utf8');
  const m = md.match(/^```\n(Subagent \(review lead\):\n[\s\S]*?)\n```$/m);
  if (!m) usage('agents/review-lead.md has no column-0 `Subagent (review lead):` fenced block');
  if (!m[1].includes('## 5. Return')) usage('extracted review-lead block looks truncated (missing "## 5. Return")');
  return m[1];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function render(block, fills, model) {
  let out = block.replace(/model: \[[\s\S]*?\]\n/, `model: ${model}\n`);
  for (const [token, value] of Object.entries(fills)) out = out.split(token).join(value);
  for (const token of new Set(out.match(/<super\.[a-z-]+-base-dir>/g) || [])) {
    out = out.split(token).join(path.join(SKILLS_ROOT, token.slice(1, -1).replace(/-base-dir$/, '')));
  }
  const templateTokens = new Set(block.match(/\{[A-Z_]+\}/g) || []);
  const left = [...templateTokens].filter((t) => out.includes(t));
  if (left.length) usage(`rendered review-lead block still has placeholders: ${left.join(', ')}`);
  const leftBase = out.match(/<super\.[a-z-]+-base-dir>/g);
  if (leftBase) usage(`rendered review-lead block still has base-dir tokens: ${[...new Set(leftBase)].join(', ')}`);
  if (!/^Subagent \(review lead\):\n/.test(out)) usage('rendered review-lead block lost its Subagent header');
  if (!new RegExp(`^  model: ${escapeRegExp(model)}$`, 'm').test(out)) usage(`rendered review-lead block does not carry model ${model}`);
  return out;
}

/** description value + the `prompt: |` body dedented by the template's fixed 4 spaces. */
function splitBlock(block) {
  const lines = block.split('\n');
  const desc = block.match(/^ {2}description: "(.*)"$/m);
  if (!desc) usage('rendered review-lead block has no "  description:" line');
  const promptIdx = lines.indexOf('  prompt: |');
  if (promptIdx === -1) usage('rendered review-lead block has no "  prompt: |" line');
  const body = lines.slice(promptIdx + 1).map((line) => {
    if (line === '') return '';
    if (!line.startsWith('    ')) usage(`review-lead template's prompt scalar changed shape — expected a 4-space indent on "${line}"`);
    return line.slice(4);
  });
  return { description: desc[1], body: body.join('\n') };
}

function main() {
  const opts = parseArgs(process.argv);
  const targetsPath = path.resolve(opts.targets);
  const targets = readTargets(targetsPath);
  const model = normalizeCapable(opts.capableModel);

  let promptDir;
  if (opts.promptDir) {
    fs.mkdirSync(opts.promptDir, { recursive: true });
    promptDir = path.resolve(opts.promptDir);
  } else {
    promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superpowers-review-lead-dispatch-'));
  }
  const reportPath = path.join(promptDir, 'review-report.md');
  const featureName = targets.featureName || path.basename(targets.spec.path).replace(/-design\.md$|\.md$/, '');

  const out = render(readTemplateBlock(), {
    '{FEATURE_NAME}': featureName,
    '{SPEC_PATH}': targets.spec.path,
    '{TARGETS_PATH}': targetsPath,
    '{CAPABLE_MODEL}': model,
    '{LANGUAGE}': opts.language,
    '{DOMAIN_EXPERTISE}': opts.domainExpertise,
    '{REPORT_PATH}': reportPath,
    '{LENS_PROMPT_DIR}': path.join(promptDir, 'lenses'),
    '{MANIFEST_PATH}': path.join(promptDir, 'lens-manifest.json'),
  }, model);

  const { description, body } = splitBlock(out);
  const promptFile = path.join(promptDir, 'review-lead.md');
  fs.writeFileSync(promptFile, `${body}\n`, 'utf8');
  const prompt = pointerPrompt(promptFile);

  process.stdout.write(`${JSON.stringify({
    tier: 'capable', model, featureName, promptDir, reportPath,
    dispatches: [{ label: 'review-lead', description, model, promptFile, prompt }],
  }, null, 2)}\n`);
  process.exit(0);
}

main();
