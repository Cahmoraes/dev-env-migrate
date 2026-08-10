#!/usr/bin/env node
'use strict';

// resolve-review-targets.cjs — deterministic discovery for a spec review.
//
// Given the spec path (the skill's entry argument), resolve everything the review
// must agree with: the PRD, the tasks index, EVERY individual task-NN.md, and the
// mockups directory. Reuses the same feature layout as super.writing-plans'
// find-feature-files.cjs, but keyed off the SPEC PATH (not a feature-name) and,
// crucially, enumerates the individual task files — Lens 3 needs to read the tasks
// against each other (a durable:true vs durable:false contradiction only shows up
// task-against-task), which the index alone cannot give.
//
// Usage:
//   node resolve-review-targets.cjs --spec <path/to/<feature>-design.md>
//   node resolve-review-targets.cjs --feature-name <slug> --base-dir <dir> [--repo-root <path>]
//
// Layout assumed (canonical superpowers):
//   <featureDir>/specs/<feature>-design.md      (the spec)
//   <featureDir>/prd/prd-<feature>.md
//   <featureDir>/plans/tasks-<feature>.md       (index)
//   <featureDir>/plans/task-NN.md               (individual tasks)
//   <featureDir>/specs/mockups/                 (curated visual artifacts, if any)
//
// Output (stdout): JSON. Exit code always 0 (verdict is the JSON; `spec.found`
// tells the caller whether to proceed). Usage errors exit 1.

const fs = require('fs');
const path = require('path');

const HELP = `
resolve-review-targets.cjs — locate a spec's companion artifacts for review.

Usage:
  node resolve-review-targets.cjs --spec <path/to/<feature>-design.md>
  node resolve-review-targets.cjs --feature-name <slug> --base-dir <dir> [--repo-root <path>]

Options:
  --spec <path>          Path to the design spec (primary entry).
  --feature-name <slug>  Feature slug (fallback entry, with --base-dir).
  --base-dir <dir>       Directory holding <slug>/ (e.g. docs/superpowers).
  --repo-root <path>     Repository root (default: git toplevel from the feature dir).
  --help                 Show this help and exit 0.
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
  const opts = { spec: null, featureName: null, baseDir: null, repoRoot: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--spec') {
      if (!args[i + 1]) usage('--spec <path> requires a value');
      opts.spec = args[++i];
    } else if (arg === '--feature-name') {
      if (!args[i + 1]) usage('--feature-name <slug> requires a value');
      opts.featureName = args[++i];
    } else if (arg === '--base-dir') {
      if (!args[i + 1]) usage('--base-dir <dir> requires a value');
      opts.baseDir = args[++i];
    } else if (arg === '--repo-root') {
      if (!args[i + 1]) usage('--repo-root <path> requires a value');
      opts.repoRoot = path.resolve(args[++i]);
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.spec && !opts.featureName) usage('--spec <path> (or --feature-name + --base-dir) is required');
  if (opts.featureName && !opts.spec && !opts.baseDir) usage('--feature-name requires --base-dir');
  return opts;
}

// Strip the spec suffix to recover the feature slug: "<slug>-design.md" -> "<slug>",
// falling back to the bare basename without extension for non-canonical names.
function featureNameFromSpec(specPath) {
  const base = path.basename(specPath);
  if (base.endsWith('-design.md')) return base.slice(0, -'-design.md'.length);
  return base.replace(/\.[^.]+$/, '');
}

// The feature dir is the parent of specs/. If the spec sits directly in a "specs"
// folder, climb one level; otherwise treat its own directory as the feature dir
// (tolerant of a flat layout).
function featureDirFromSpec(specPath) {
  const specDir = path.dirname(path.resolve(specPath));
  if (path.basename(specDir) === 'specs') return path.dirname(specDir);
  return specDir;
}

// Git working-tree root, resolved in-process (no `git` spawn): walk up from fromDir
// looking for a `.git` entry (a dir in a clone, a FILE in a linked worktree — both
// match). Same discovery `git rev-parse --show-toplevel` does; null when not a repo.
function gitToplevel(fromDir) {
  let dir = path.resolve(fromDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function fileEntry(candidate) {
  const exists = candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  return { found: !!exists, path: exists ? candidate : null };
}

// List plans/task-NN.md individually (NOT the tasks-<feature>.md index), sorted.
// These feed Lens 3's task-against-task consistency checks.
function taskFileEntries(plansDir) {
  if (!fs.existsSync(plansDir) || !fs.statSync(plansDir).isDirectory()) return [];
  return fs
    .readdirSync(plansDir)
    .filter((name) => /^task-\d+\.md$/.test(name))
    .sort()
    .map((name) => path.join(plansDir, name));
}

function mockupsEntry(mockupsDir) {
  if (fs.existsSync(mockupsDir) && fs.statSync(mockupsDir).isDirectory()) {
    const files = fs
      .readdirSync(mockupsDir)
      .filter((name) => !name.startsWith('.') && fs.statSync(path.join(mockupsDir, name)).isFile())
      .sort();
    if (files.length > 0) return { found: true, path: mockupsDir, files };
  }
  return { found: false, path: null, files: [] };
}

// Parse the flat `artifacts:` list in .superpowers/corporate-artifacts.yml. The file is
// simple by contract (a top-level `artifacts:` key with `- path:`/`- url:` items), so we
// hand-parse rather than pull in a YAML dep — and, crucially, we DON'T parse the corporate
// documents themselves: corporate artifacts have no fixed format and are validated only
// through OUR converted spec/PRD (convert-not-couple). We only surface WHERE they live so
// the corporate lens can read the local ones and cross-check the conversion.
function parseCorporateEntries(raw, repoRoot) {
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const noComment = line.replace(/(?:^|\s)#.*$/, ''); // strip only a real YAML comment (# at line start or after whitespace), so a path like /file#1.md survives
    const m = noComment.match(/^\s*-\s*(path|url)\s*:\s*(\S.*?)\s*$/);
    if (!m) continue;
    const kind = m[1];
    const value = m[2].replace(/^["']|["']$/g, '');
    if (kind === 'url') {
      // A read-only reviewer (Read/Grep/Glob/Bash) can't fetch a URL; flag it so the lens
      // reports it as "not re-verified here" instead of silently skipping it.
      entries.push({ kind: 'url', value, resolvedPath: null, exists: null, fetchable: false });
    } else {
      const resolvedPath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
      const exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
      entries.push({ kind: 'path', value, resolvedPath, exists });
    }
  }
  return entries;
}

// Read the owner's consent from <repoRoot>/.superpowers/preferences.yml: the
// `has_corporate_artifacts` key nested under the top-level `context:` block. Same hand-parse
// rationale as above (no YAML dep), but scoped: a top-level lookalike line does NOT count —
// the flag has one home, and accepting a stray line would reintroduce the very ambiguity
// this gate exists to remove. An absent or unreadable file means "not declared" (false).
function corporateConsent(repoRoot) {
  const prefsPath = path.join(repoRoot, '.superpowers', 'preferences.yml');
  if (!fs.existsSync(prefsPath) || !fs.statSync(prefsPath).isFile()) return false;
  let raw;
  try {
    raw = fs.readFileSync(prefsPath, 'utf8');
  } catch {
    return false;
  }
  let inContext = false;
  for (const line of raw.split(/\r?\n/)) {
    const noComment = line.replace(/(?:^|\s)#.*$/, '');
    if (/^\S/.test(noComment)) inContext = /^context\s*:/.test(noComment); // any unindented key closes the previous block
    if (!inContext) continue;
    const m = noComment.match(/^\s+has_corporate_artifacts\s*:\s*(\S+)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '') === 'true';
  }
  return false;
}

// Resolve corporate artifacts declared in <repoRoot>/.superpowers/corporate-artifacts.yml.
//
// PRESENCE IS NOT CONSENT. The file being on disk says a document was declared once; it does
// not say the repo owner wants it treated as the company's source of truth for THIS review —
// and Lens 5 gives a corporate artifact precedence over the spec, so running it on a stale or
// leftover declaration lets another feature's document outrank the spec under review. The gate
// is therefore the owner's own flag (`context.has_corporate_artifacts` in preferences.yml),
// the same "populated object != existence != consent" rule read-preferences.cjs already obeys.
//
// `found` (the Lens 5 switch) requires BOTH consent and at least one declared entry.
// `declaredButDisabled` reports the mismatch — entries exist while the flag is off — so the
// caller surfaces it as an out-of-scope CONFIG observation instead of silently ignoring it.
// Entries stay populated in that case: the caller needs them to name what it is disregarding.
function corporateArtifactsEntry(repoRoot) {
  if (!repoRoot) return { found: false, enabled: false, declaredButDisabled: false, configPath: null, entries: [] };
  const enabled = corporateConsent(repoRoot);
  const configPath = path.join(repoRoot, '.superpowers', 'corporate-artifacts.yml');
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    return { found: false, enabled, declaredButDisabled: false, configPath: null, entries: [] };
  }
  const entries = parseCorporateEntries(fs.readFileSync(configPath, 'utf8'), repoRoot);
  const declared = entries.length > 0;
  return {
    found: enabled && declared,
    enabled,
    declaredButDisabled: declared && !enabled,
    configPath,
    entries,
  };
}

function main() {
  const opts = parseArgs(process.argv);

  let featureName;
  let featureDir;
  let specPath;

  if (opts.spec) {
    specPath = path.resolve(opts.spec);
    featureName = featureNameFromSpec(specPath);
    featureDir = featureDirFromSpec(specPath);
  } else {
    featureName = opts.featureName;
    const baseDir = path.isAbsolute(opts.baseDir)
      ? opts.baseDir
      : path.resolve(opts.repoRoot || process.cwd(), opts.baseDir);
    featureDir = path.join(baseDir, featureName);
    specPath = path.join(featureDir, 'specs', `${featureName}-design.md`);
  }

  const repoRoot = opts.repoRoot || gitToplevel(featureDir) || null;
  const plansDir = path.join(featureDir, 'plans');

  const result = {
    featureName,
    featureDir,
    repoRoot,
    spec: fileEntry(specPath),
    prd: fileEntry(path.join(featureDir, 'prd', `prd-${featureName}.md`)),
    tasksIndex: fileEntry(path.join(featureDir, 'plans', `tasks-${featureName}.md`)),
    taskFiles: taskFileEntries(plansDir),
    mockups: mockupsEntry(path.join(featureDir, 'specs', 'mockups')),
    corporateArtifacts: corporateArtifactsEntry(repoRoot),
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
