#!/usr/bin/env node
/**
 * detect-project.cjs — Propose the `project:` section for .superpowers/preferences.yml.
 *
 * WHY THIS EXISTS, AND WHY IT IS THIS SMALL
 *   The preferences file records TWO facts about the consuming repo: the ecosystem it runs
 *   (`stack`) and the file that describes it (`manifest`). Nothing else. The commands the
 *   execution skills need — run the suite, run one test file, install dependencies, format —
 *   are NOT preferences: they belong to the repo's own instructions file (AGENTS.md /
 *   CLAUDE.md) and to the manifest itself (package.json scripts, pubspec.yaml, pyproject.toml,
 *   Cargo.toml, go.mod), and the harness reads those when it needs a command. A first version
 *   persisted five commands per repo; every new ecosystem, runner or monorepo shape meant a
 *   new key, a new template row and a new prose edit in six skills, and the values drifted
 *   from the repo the moment someone changed a script. Two keys cannot drift: the manifest
 *   is the source, not a copy of it.
 *
 *   This script is the one place that knows which manifest names which stack. The wizard
 *   runs it once, the user confirms, write-preferences.cjs persists `project.stack` and
 *   `project.manifest`, and derive-session-state.cjs exposes them as `projectProfile`.
 *
 * TWO MODES
 *   --repo-root <dir>   brownfield: probe the manifests at the repo root and list every
 *                       ecosystem found (all candidates, the first is the suggestion)
 *   --stack <name>      greenfield: no filesystem probe; emit the canonical manifest for a
 *                       named stack so the wizard (or brainstorming, once the design fixes
 *                       the stack) can save it without inventing a file name
 *
 * OUTPUT (stdout, JSON)
 *   { detected, repoRoot, candidates: [{ stack, manifest }...], suggestion: {stack, manifest}|null, notes }
 *
 * EXIT CODES
 *   0 — success (including "nothing detected": detected:false is an answer, not an error)
 *   1 — usage error
 *
 * Only the repo root is probed, on purpose: nested manifests (apps/x/package.json) are the
 * workspace's business and the root manifest is the one that describes the whole repo.
 * When the root has nothing, the wizard asks — a guess from a nested manifest would be
 * confirmed by a user who has no way to tell it is a guess.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { detectRepoRoot } = require('./lib/repo-root.cjs');

const HELP = `
detect-project.cjs — Propose project.stack + project.manifest for preferences.yml.

Usage:
  node scripts/detect-project.cjs [--repo-root <path>]      # probe manifests (brownfield)
  node scripts/detect-project.cjs --stack <name>            # canonical manifest, no probe (greenfield)
  node scripts/detect-project.cjs --list-stacks

Known stacks: ${'%STACKS%'}

Output (JSON): { detected, repoRoot, candidates, suggestion, notes }
  candidates/suggestion are { stack, manifest } — manifest is repo-relative.
Exit 0 always on success (detected:false is a valid answer); 1 on usage error.
`.trimStart();

// ─── Stack → canonical manifest ──────────────────────────────────────────────
// Used by --stack (greenfield) and by --list-stacks. Order matters only for the listing.

const STACK_MANIFESTS = {
  flutter: 'pubspec.yaml',
  dart: 'pubspec.yaml',
  node: 'package.json',
  python: 'pyproject.toml',
  rust: 'Cargo.toml',
  go: 'go.mod',
  dotnet: '<project>.csproj',
  elixir: 'mix.exs',
  ruby: 'Gemfile',
  swift: 'Package.swift',
  kotlin: 'build.gradle.kts',
};

// ─── Manifest probes ─────────────────────────────────────────────────────────
// Probe order = suggestion priority. Flutter before node on purpose — a Flutter app that
// keeps a package.json for tooling is still a Flutter app; the reverse (a node app with a
// stray pubspec) is rare. Each probe returns the manifest it found (repo-relative) or null.

function firstExisting(root, names) {
  return names.find((f) => fs.existsSync(path.join(root, f))) || null;
}

function pubspecStack(root) {
  const file = path.join(root, 'pubspec.yaml');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return /^\s*sdk:\s*flutter\s*$/m.test(text) || /^\s*flutter:\s*$/m.test(text) ? 'flutter' : 'dart';
}

const PROBES = [
  { stack: (r) => pubspecStack(r), manifest: (r) => firstExisting(r, ['pubspec.yaml']) },
  { stack: () => 'node', manifest: (r) => firstExisting(r, ['package.json']) },
  { stack: () => 'python', manifest: (r) => firstExisting(r, ['pyproject.toml', 'setup.cfg', 'setup.py', 'requirements.txt', 'pytest.ini']) },
  { stack: () => 'rust', manifest: (r) => firstExisting(r, ['Cargo.toml']) },
  { stack: () => 'go', manifest: (r) => firstExisting(r, ['go.mod']) },
  { stack: () => 'dotnet', manifest: (r) => fs.readdirSync(r).find((f) => /\.(sln|csproj|fsproj)$/.test(f)) || null },
  { stack: () => 'elixir', manifest: (r) => firstExisting(r, ['mix.exs']) },
  { stack: () => 'ruby', manifest: (r) => firstExisting(r, ['Gemfile']) },
  { stack: () => 'swift', manifest: (r) => firstExisting(r, ['Package.swift']) },
  { stack: () => 'kotlin', manifest: (r) => firstExisting(r, ['build.gradle.kts', 'build.gradle']) },
];

function detectProject(repoRoot) {
  const root = path.resolve(repoRoot);
  const candidates = [];
  const notes = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { detected: false, repoRoot: root, candidates, suggestion: null, notes: [`repo root does not exist: ${root}`] };
  }
  for (const probe of PROBES) {
    let manifest = null;
    try { manifest = probe.manifest(root); } catch { manifest = null; }
    if (!manifest) continue;
    const stack = probe.stack(root);
    if (!stack) continue;
    candidates.push({ stack, manifest });
  }
  if (candidates.length > 1) {
    notes.push(`${candidates.length} ecosystems at the root (${candidates.map((c) => c.stack).join(', ')}) — the first is the suggestion; pick another if the primary stack differs.`);
  }
  return {
    detected: candidates.length > 0,
    repoRoot: root,
    candidates,
    suggestion: candidates[0] || null,
    notes,
  };
}

function profileForStack(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!STACK_MANIFESTS[key]) return null;
  return { stack: key, manifest: STACK_MANIFESTS[key] };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function usage(message) {
  process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP.replace('%STACKS%', Object.keys(STACK_MANIFESTS).join(', ')));
    process.exit(0);
  }
  if (args.includes('--list-stacks')) {
    process.stdout.write(JSON.stringify({ stacks: Object.keys(STACK_MANIFESTS) }, null, 2) + '\n');
    process.exit(0);
  }
  let repoRoot = null;
  let stack = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--repo-root') { repoRoot = args[++i] || usage('--repo-root needs a value'); continue; }
    if (args[i] === '--stack') { stack = args[++i] || usage('--stack needs a value'); continue; }
    usage(`Unknown argument: ${args[i]}`);
  }

  if (stack) {
    const profile = profileForStack(stack);
    if (!profile) usage(`unknown stack "${stack}" — known: ${Object.keys(STACK_MANIFESTS).join(', ')}`);
    process.stdout.write(JSON.stringify({
      detected: false, repoRoot: null, candidates: [profile], suggestion: profile,
      notes: ['greenfield template — no manifest probed; the manifest is the canonical file name for this stack, confirm it once the scaffold exists.'],
    }, null, 2) + '\n');
    process.exit(0);
  }

  const root = repoRoot || detectRepoRoot();
  if (!root) usage('not inside a git repository — pass --repo-root <path> or --stack <name>');
  process.stdout.write(JSON.stringify(detectProject(root), null, 2) + '\n');
  process.exit(0);
}

module.exports = { detectProject, profileForStack, STACK_MANIFESTS };

if (require.main === module) {
  main(process.argv);
}
