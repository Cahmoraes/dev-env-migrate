#!/usr/bin/env node
'use strict';

// build-qa-dispatch.cjs — emit one ready-to-send QA subagent dispatch block per user
// story, with the model resolved from preferences and pinned to the `standard` tier.
//
// Why a script instead of hand-filling the template: a cheap controller model (haiku)
// omitted `model:` on 6/6 dispatches when the gate's prose just said "set an explicit
// model" — a dispatch with `model:` omitted inherits the controller's model,
// the exact drift the template exists to stop. The fix mirrors
// super.reviewing-specs/scripts/build-review-dispatch.cjs: render COMPLETE blocks from
// the template, model already resolved, so nothing is typed by hand. A block that still
// carries a `{PLACEHOLDER}` or a `<super.X-base-dir>` token is refused here, never
// emitted half-filled.
//
// File + pointer, not the rendered prompt inline: measured on a haiku controller, a
// ~7 KB rendered block sitting directly in the dispatch payload either got narrated as
// text instead of being sent to the dispatch tool, or got retyped by hand with `model:`
// dropped along the way. A large payload placed in the controller's own thread gets
// acted on or re-emitted there instead of relayed verbatim. So each story's fully
// rendered prompt body is written to its own file under `--prompt-dir`, and the
// dispatch entry the controller actually sees carries only three short fields:
// `description`, `model`, and a one-line `prompt` that names the file and tells the
// subagent to read it first. The file still gets every validation the block always
// got (placeholders, base-dir tokens, the `model:` line) before it is written.
//
// Usage:
//   node build-qa-dispatch.cjs --slugs <slugs.json|-> --feature-name <slug> --prd <path>
//     --test-runner <cmd> --browser <text> --language <lang> [--spec <path|none>]
//     [--app-base-url <url|not applicable>] [--repo-root <path>] [--platform <name>]
//     [--only <id[,id...]>] [--prompt-dir <dir>]
//
// --slugs is the JSON produced by generate-slugs.cjs (path, or "-" for stdin):
//   { count, requirementsMapped, warnings[], userStories[{ id, text, role, want,
//     benefit, slug, requirements[], uiFacing }] }
//
// Model resolution: QA always runs at the `standard` tier (never the task's own tier —
// QA floors at standard). model_tiers.standard is resolved for --platform via
// lib/model-tiers.cjs, which falls back to the platform's own `standard` rung alias when
// the tier is unset or names a vendor the running harness cannot serve (recorded in
// `unavailable`). Only a platform publishing no aliases emits "auto".
//
// Output (stdout): JSON — see README/spec for the exact shape. Zero stories is a
// normal, successful result (`dispatches: []`, exit 0); the QA gate decides
// UNVERIFIABLE from that, not this script. Exit code is reserved for usage/IO errors.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadPreferences } = require('../../super.using-superpowers/scripts/read-preferences.cjs');
const {
  resolveDispatchModel,
  resolveModelTiers,
} = require('../../super.using-superpowers/scripts/lib/model-tiers.cjs');
const { pointerPrompt } = require('../../super.using-superpowers/scripts/lib/dispatch-pointer.cjs');

const TEMPLATE = path.resolve(__dirname, '..', 'agents', 'qa-story-verifier.md');

const HELP = `
build-qa-dispatch.cjs — emit a standard-tier QA dispatch block per user story.

Usage:
  node build-qa-dispatch.cjs --slugs <path|-> --feature-name <slug> --prd <path>
    --test-runner <cmd> --browser <text> --language <lang>
    [--spec <path|none>] [--app-base-url <url|not applicable>] [--repo-root <path>]
    [--platform <name>] [--only <id[,id...]>] [--prompt-dir <dir>]

Options:
  --slugs <path|->        generate-slugs.cjs output (file path, or - for stdin). Required.
  --feature-name <slug>   Feature slug. Required.
  --prd <path>            PRD path. Required.
  --spec <path|none>      Spec path. Default "none".
  --test-runner <cmd>     Single-file test runner command (e.g. "npx vitest run <file>"). Required.
  --browser <text>        Browser automation description (any non-empty string). Required.
  --app-base-url <url>    App base URL, or "not applicable". Default "not applicable".
  --language <lang>       Report language (e.g. pt-BR). Required.
  --repo-root <path>      Repository root. Default: git detection.
  --platform <name>       Harness platform for model-tier resolution. Default "other".
  --only <id[,id...]>     Keep only these story ids (case-insensitive). Unknown id => error.
  --prompt-dir <dir>      Directory to write each story's rendered prompt file into.
                          Created (recursive) if missing. Default: a fresh unique
                          directory under the OS temp dir (mkdtemp).
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
  const opts = {
    slugs: null,
    featureName: null,
    prd: null,
    spec: 'none',
    testRunner: null,
    browser: null,
    appBaseUrl: 'not applicable',
    language: null,
    repoRoot: null,
    platform: 'other',
    only: null,
    promptDir: null,
  };
  const STRING_FLAGS = {
    '--slugs': 'slugs',
    '--feature-name': 'featureName',
    '--prd': 'prd',
    '--spec': 'spec',
    '--test-runner': 'testRunner',
    '--browser': 'browser',
    '--app-base-url': 'appBaseUrl',
    '--language': 'language',
    '--repo-root': 'repoRoot',
    '--platform': 'platform',
    '--prompt-dir': 'promptDir',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg in STRING_FLAGS) {
      const value = args[i + 1];
      if (value === undefined) usage(`${arg} requires a value`);
      opts[STRING_FLAGS[arg]] = value;
      i += 1;
      continue;
    }
    if (arg === '--only') {
      const value = args[i + 1];
      if (!value) usage('--only <id[,id...]> requires a value');
      opts.only = value.split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  if (!opts.slugs) usage('--slugs <path|-> is required');
  if (!opts.featureName) usage('--feature-name <slug> is required');
  if (!opts.prd) usage('--prd <path> is required');
  if (!opts.testRunner) usage('--test-runner <cmd> is required');
  if (!opts.browser) usage('--browser <text> is required');
  if (!opts.language) usage('--language <lang> is required');
  return opts;
}

function readSlugs(source) {
  let raw;
  try {
    raw = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  } catch (err) {
    usage(`cannot read --slugs: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    usage(`--slugs is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    usage('--slugs must be a JSON object (generate-slugs.cjs output)');
  }
  if (!Array.isArray(parsed.userStories)) {
    usage('--slugs JSON has no "userStories" array');
  }
  return parsed;
}

/** The `Subagent (QA ...):` fenced block of agents/qa-story-verifier.md, verbatim. */
function readTemplateBlock() {
  const md = fs.readFileSync(TEMPLATE, 'utf8');
  const m = md.match(/^```\n(Subagent \([\s\S]*?)\n```$/m);
  if (!m) usage('agents/qa-story-verifier.md has no column-0 `Subagent (` fenced block');
  const block = m[1];
  // Guards against a regex that silently stopped at an inner (4-space-indented) fence
  // instead of the real column-0 closing fence.
  if (!block.includes('### Task 4 — Write Result') || !block.includes('UNVERIFIABLE')) {
    usage('extracted template block looks truncated (missing Task 4 / UNVERIFIABLE) — template shape may have changed');
  }
  return block;
}

/** Indent continuation lines (everything after the first) so a multi-line value stays inside `prompt: |`. */
function indentContinuation(text, spaces) {
  if (!text.includes('\n')) return text;
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line, i) => (i === 0 ? line : pad + line)).join('\n');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requirementsText(story) {
  if (Array.isArray(story.requirements) && story.requirements.length > 0) {
    return story.requirements.join(', ');
  }
  return 'none mapped by the PRD — derive them from its Requisitos Funcionais and say in notes that you derived them';
}

/**
 * Split a fully rendered block into its `description` and the dedented `prompt: |`
 * body. Both are read straight off the rendered text, not re-derived from the
 * template, so they reflect exactly what validation above already accepted.
 */
function splitDescriptionAndBody(renderedBlock, storyId) {
  const lines = renderedBlock.split('\n');

  const descLine = lines.find((l) => /^ {2}description: "/.test(l));
  if (!descLine) usage(`rendered block for ${storyId} has no "  description:" line`);
  const descMatch = descLine.match(/^ {2}description: "(.*)"$/);
  if (!descMatch) usage(`rendered block for ${storyId} has a malformed "  description:" line`);
  const description = descMatch[1];

  const promptIdx = lines.indexOf('  prompt: |');
  if (promptIdx === -1) usage(`rendered block for ${storyId} has no "  prompt: |" line`);

  const bodyLines = lines.slice(promptIdx + 1).map((line) => {
    if (line === '') return '';
    if (!line.startsWith('    ')) {
      usage(`rendered block for ${storyId}: the template's prompt scalar changed shape — expected a 4-space indent on "${line}"`);
    }
    return line.slice(4);
  });

  return { description, body: bodyLines.join('\n') };
}

/** Render one story's dispatch block from the raw template text. */
function renderStoryBlock(templateBlock, story, opts, model, promptDir) {
  // The template's `model: [REQUIRED — ...]` bracket (multi-line) becomes the resolved model.
  let out = templateBlock.replace(/model: \[[\s\S]*?\]\n/, `model: ${model}\n`);

  const fills = {
    '{US_ID}': story.id,
    '{USER_STORY}': story.text,
    '{US_SLUG}': story.slug,
    '{REQUIREMENTS}': requirementsText(story),
    '{PRD_PATH}': opts.prd,
    '{SPEC_PATH}': opts.spec,
    '{TEST_RUNNER_COMMAND}': opts.testRunner,
    '{BROWSER_AUTOMATION}': opts.browser,
    '{APP_BASE_URL}': opts.appBaseUrl,
    '{FEATURE_NAME}': opts.featureName,
    '{LANGUAGE}': opts.language,
  };
  for (const [token, rawValue] of Object.entries(fills)) {
    out = out.split(token).join(indentContinuation(String(rawValue), 4));
  }

  // Every <super.X-base-dir> token -> absolute path (own skill and siblings alike).
  const baseDirTokens = new Set((out.match(/<super\.[a-z-]+-base-dir>/g) || []));
  for (const token of baseDirTokens) {
    const skillName = token.slice(1, -1).replace(/-base-dir$/, '');
    const abs = path.resolve(__dirname, '..', '..', skillName);
    out = out.split(token).join(abs);
  }

  // Only the template's OWN tokens count as leftovers: a story may legitimately quote an
  // API path like `/users/{USER_ID}`, and refusing that would block the gate on a PRD line.
  const templateTokens = new Set(templateBlock.match(/\{[A-Z_]+\}/g) || []);
  const leftPlaceholders = [...templateTokens].filter((token) => out.includes(token) && !String(story.text).includes(token));
  if (leftPlaceholders.length) {
    usage(`rendered block for ${story.id} still has placeholders: ${leftPlaceholders.join(', ')}`);
  }
  const leftBaseDirs = out.match(/<super\.[a-z-]+-base-dir>/g);
  if (leftBaseDirs) {
    usage(`rendered block for ${story.id} still has base-dir tokens: ${[...new Set(leftBaseDirs)].join(', ')}`);
  }
  if (!/^Subagent \(/.test(out)) {
    usage(`rendered block for ${story.id} lost its Subagent header`);
  }
  const modelLineRe = new RegExp(`^  model: ${escapeRegExp(model)}$`, 'm');
  if (!modelLineRe.test(out)) {
    usage(`rendered block for ${story.id} does not carry model ${model}`);
  }

  const { description, body } = splitDescriptionAndBody(out, story.id);
  const promptFile = path.resolve(promptDir, `qa-${story.slug}.md`);
  fs.writeFileSync(promptFile, `${body}\n`, 'utf8');
  const prompt = pointerPrompt(promptFile);

  return {
    usId: story.id,
    slug: story.slug,
    evidenceDir: `docs/superpowers/${opts.featureName}/qa/evidence/${story.slug}/`,
    description,
    model,
    promptFile,
    prompt,
  };
}

function selectStories(userStories, only) {
  if (!only) return userStories;
  const byId = new Map(userStories.map((s) => [String(s.id).toUpperCase(), s]));
  const selected = [];
  for (const wanted of only) {
    const story = byId.get(wanted.toUpperCase());
    if (!story) usage(`--only references unknown story id: ${wanted}`);
    selected.push(story);
  }
  return selected;
}

function main() {
  const opts = parseArgs(process.argv);
  const slugsData = readSlugs(opts.slugs);

  const { result: prefsResult } = loadPreferences(opts.repoRoot || undefined);
  const preferences = prefsResult.preferences;
  const { resolved, unavailable } = resolveModelTiers(preferences.model_tiers, opts.platform);
  const model = resolveDispatchModel(resolved.standard, 'standard', opts.platform);
  const unavailableStandard = unavailable.filter((u) => u.tier === 'standard');

  const stories = selectStories(slugsData.userStories, opts.only);

  let promptDir;
  if (opts.promptDir) {
    fs.mkdirSync(opts.promptDir, { recursive: true });
    promptDir = path.resolve(opts.promptDir);
  } else {
    promptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superpowers-qa-dispatch-'));
  }

  const templateBlock = readTemplateBlock();
  const dispatches = stories.map(
    (story) => renderStoryBlock(templateBlock, story, opts, model, promptDir),
  );

  const output = {
    feature: opts.featureName,
    tier: 'standard',
    model,
    platform: opts.platform,
    unavailable: unavailableStandard,
    // The PRD's total, not the --only selection: Step 5 reconciles result.json against it.
    storyCount: slugsData.userStories.length,
    requirementsMapped: slugsData.requirementsMapped === undefined ? true : slugsData.requirementsMapped,
    warnings: Array.isArray(slugsData.warnings) ? slugsData.warnings : [],
    promptDir,
    dispatches,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(0);
}

main();
