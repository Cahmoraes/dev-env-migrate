#!/usr/bin/env node
'use strict';
/*
 * detect-project.test.cjs — the ONE manifest→stack detector, and the project: section end to end.
 *
 * Why this file exists: the `project:` section records two facts — the ecosystem (`stack`)
 * and the file that describes it (`manifest`). The commands (test, setup, format) are NOT
 * preferences: the repo's instructions file and the manifest carry them, and the skills read
 * those when they need one. A first version persisted five commands per repo; every new
 * ecosystem or runner shape meant new keys, new template rows and prose edits in six skills,
 * and the values drifted from the repo as soon as a script changed. These tests pin that the
 * detector proposes ONLY stack + manifest, that the wizard can persist them, and that an older
 * file without the section still reads as "nobody was asked yet".
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/detect-project.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const DETECT = path.join(SCRIPTS, 'detect-project.cjs');
const WRITE = path.join(SCRIPTS, 'write-preferences.cjs');
const READ = path.join(SCRIPTS, 'read-preferences.cjs');
const DERIVE = path.join(SCRIPTS, 'derive-session-state.cjs');
const { detectProject, profileForStack, STACK_MANIFESTS } = require(DETECT);

const PROFILE_KEYS = ['manifest', 'stack']; // sorted, compared against Object.keys(...).sort()

function mkRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-project-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}
function rm(root) { fs.rmSync(root, { recursive: true, force: true }); }
function json(cmd, args, input) {
  const out = execFileSync('node', [cmd, ...args], { encoding: 'utf8', input });
  return JSON.parse(out);
}

// ─── The contract: two keys, nothing else ────────────────────────────────────

test('a candidate carries stack + manifest and NO command — commands are not preferences', () => {
  const root = mkRepo({ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '2' } }) });
  try {
    const r = detectProject(root);
    assert.equal(r.detected, true);
    assert.deepEqual(Object.keys(r.suggestion).sort(), PROFILE_KEYS);
    assert.deepEqual(r.suggestion, { stack: 'node', manifest: 'package.json' });
  } finally { rm(root); }
});

// ─── Brownfield probes ───────────────────────────────────────────────────────

test('Flutter: pubspec with sdk: flutter → flutter / pubspec.yaml', () => {
  const root = mkRepo({ 'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n' });
  try {
    assert.deepEqual(detectProject(root).suggestion, { stack: 'flutter', manifest: 'pubspec.yaml' });
  } finally { rm(root); }
});

test('Dart without flutter → dart / pubspec.yaml', () => {
  const root = mkRepo({ 'pubspec.yaml': 'name: lib\ndependencies:\n  http: ^1.0.0\n' });
  try {
    assert.deepEqual(detectProject(root).suggestion, { stack: 'dart', manifest: 'pubspec.yaml' });
  } finally { rm(root); }
});

test('python: the first manifest on the chain is the one reported', () => {
  const root = mkRepo({ 'requirements.txt': 'pytest\n', 'pyproject.toml': '[project]\nname = "x"\n' });
  try {
    assert.deepEqual(detectProject(root).suggestion, { stack: 'python', manifest: 'pyproject.toml' });
  } finally { rm(root); }
});

test('rust, go, dotnet, elixir, ruby, swift, kotlin are on the chain', () => {
  const cases = [
    [{ 'Cargo.toml': '[package]\n' }, 'rust', 'Cargo.toml'],
    [{ 'go.mod': 'module x\n' }, 'go', 'go.mod'],
    [{ 'App.csproj': '<Project/>' }, 'dotnet', 'App.csproj'],
    [{ 'mix.exs': 'defmodule X do end\n' }, 'elixir', 'mix.exs'],
    [{ Gemfile: 'source "https://rubygems.org"\n' }, 'ruby', 'Gemfile'],
    [{ 'Package.swift': '// swift-tools-version:5.9\n' }, 'swift', 'Package.swift'],
    [{ 'build.gradle.kts': 'plugins {}\n' }, 'kotlin', 'build.gradle.kts'],
  ];
  for (const [files, stack, manifest] of cases) {
    const root = mkRepo(files);
    try {
      assert.deepEqual(detectProject(root).suggestion, { stack, manifest }, stack);
    } finally { rm(root); }
  }
});

test('several manifests at the root: all are candidates, Flutter outranks node, and a note says how many', () => {
  const root = mkRepo({
    'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n',
    'package.json': JSON.stringify({ devDependencies: { prettier: '3' } }),
  });
  try {
    const r = detectProject(root);
    assert.deepEqual(r.candidates.map((c) => c.stack), ['flutter', 'node']);
    assert.equal(r.suggestion.stack, 'flutter');
    assert.match(r.notes[0], /2 ecosystems at the root/);
  } finally { rm(root); }
});

test('nothing at the root → detected:false, no suggestion, exit 0 (an answer, not an error)', () => {
  const root = mkRepo({ 'README.md': '# empty\n' });
  try {
    const r = json(DETECT, ['--repo-root', root]);
    assert.equal(r.detected, false);
    assert.equal(r.suggestion, null);
    assert.deepEqual(r.candidates, []);
  } finally { rm(root); }
});

test('nested manifest only (no root manifest) is NOT guessed — the wizard asks instead', () => {
  const root = mkRepo({ 'apps/web/package.json': JSON.stringify({ devDependencies: { vitest: '2' } }) });
  try {
    assert.equal(detectProject(root).detected, false);
  } finally { rm(root); }
});

// ─── Greenfield templates ────────────────────────────────────────────────────

test('--stack <name> emits stack + canonical manifest without touching the filesystem', () => {
  const r = json(DETECT, ['--stack', 'Flutter']);
  assert.equal(r.detected, false, 'template mode never claims a probe');
  assert.deepEqual(r.suggestion, { stack: 'flutter', manifest: 'pubspec.yaml' });
  assert.match(r.notes[0], /greenfield/);
  for (const name of Object.keys(STACK_MANIFESTS)) {
    const p = profileForStack(name);
    assert.deepEqual(Object.keys(p).sort(), PROFILE_KEYS, `${name} template shape`);
    assert.ok(p.manifest, `${name} must name a manifest`);
  }
});

test('unknown --stack is a usage error (exit 1) that lists the known names', () => {
  const r = spawnSync('node', [DETECT, '--stack', 'cobol'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown stack "cobol"/);
  assert.match(r.stderr, /flutter/);
});

test('--list-stacks agrees with the manifests table', () => {
  const r = json(DETECT, ['--list-stacks']);
  assert.deepEqual(r.stacks, Object.keys(STACK_MANIFESTS));
});

// ─── Persistence seam: detect → write-preferences → read → derive ────────────

test('the suggestion round-trips through write-preferences and comes back declared', () => {
  const root = mkRepo({
    'pubspec.yaml': 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n',
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    const { suggestion } = detectProject(root);
    const w = json(WRITE, ['--repo-root', root], JSON.stringify({ project: suggestion }));
    assert.equal(w.written, true);
    assert.equal(w.roundTripValid, true);
    assert.equal(w.projectDeclared, true);

    const r = json(READ, ['--repo-root', root]);
    assert.equal(r.projectDeclared, true);
    assert.deepEqual(r.preferences.project, suggestion);

    const d = json(DERIVE, ['--platform', 'claude-code', '--repo-root', root]);
    assert.deepEqual(d.projectProfile, { declared: true, stack: 'flutter', manifest: 'pubspec.yaml' });
    assert.ok(!('session_project_stack' in d.sessionState), 'the profile is not a session_* variable');
  } finally { rm(root); }
});

test('the writer never persists a command key under project: — the schema is closed', () => {
  const root = mkRepo({});
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    json(WRITE, ['--repo-root', root], JSON.stringify({ project: { stack: 'node', manifest: 'package.json', test_command: 'npm test' } }));
    const yaml = fs.readFileSync(path.join(root, '.superpowers', 'preferences.yml'), 'utf8');
    assert.ok(!/test_command/.test(yaml), 'an unknown project key is dropped, not rendered');
    const r = json(READ, ['--repo-root', root]);
    assert.deepEqual(r.preferences.project, { stack: 'node', manifest: 'package.json' });
  } finally { rm(root); }
});

test('a preferences.yml written before the section existed reads found:true but declared:false', () => {
  const root = mkRepo({});
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    json(WRITE, ['--repo-root', root], JSON.stringify({ workflow: { auto_commit: false } }));
    const yaml = fs.readFileSync(path.join(root, '.superpowers', 'preferences.yml'), 'utf8');
    assert.ok(!/^project:/m.test(yaml), 'a write that never mentioned project must not declare an empty one');
    const r = json(READ, ['--repo-root', root]);
    assert.equal(r.found, true);
    assert.equal(r.projectDeclared, false);
    assert.equal(r.preferences.project.stack, null);
    const d = json(DERIVE, ['--platform', 'copilot', '--repo-root', root]);
    assert.equal(d.preferencesFound, true);
    assert.equal(d.projectProfile.declared, false, 'the router must offer ONLY the project step here');
  } finally { rm(root); }
});

test('a later one-key edit keeps the declared profile intact', () => {
  const root = mkRepo({});
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    json(WRITE, ['--repo-root', root], JSON.stringify({ project: { stack: 'go', manifest: 'go.mod' } }));
    json(WRITE, ['--repo-root', root], JSON.stringify({ workflow: { auto_commit: false } }));
    const r = json(READ, ['--repo-root', root]);
    assert.equal(r.projectDeclared, true);
    assert.deepEqual(r.preferences.project, { stack: 'go', manifest: 'go.mod' });
    assert.equal(r.preferences.workflow.auto_commit, false);
  } finally { rm(root); }
});

test('"not decided yet" is a declared profile with both values empty', () => {
  const root = mkRepo({});
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    const w = json(WRITE, ['--repo-root', root], JSON.stringify({ project: { stack: '', manifest: '' } }));
    assert.equal(w.projectDeclared, true);
    const d = json(DERIVE, ['--platform', 'claude-code', '--repo-root', root]);
    assert.deepEqual(d.projectProfile, { declared: true, stack: null, manifest: null });
  } finally { rm(root); }
});

test('an old file carrying the retired command keys still reads: only stack + manifest survive', () => {
  const root = mkRepo({
    '.superpowers/preferences.yml': [
      'workflow:', '  auto_commit: true', '',
      'project:', '  stack: node', '  test_command: pnpm test', '  test_file_command: pnpm vitest run <file>',
      '  setup_command: pnpm install', '  ui_file_globs: src/**/*.tsx', '  format_command: npx biome check --write .', '',
    ].join('\n'),
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    const r = json(READ, ['--repo-root', root]);
    assert.equal(r.projectDeclared, true);
    assert.deepEqual(r.preferences.project, { stack: 'node', manifest: null }, 'retired keys are ignored in silence');
    const w = json(WRITE, ['--repo-root', root], JSON.stringify({ project: { manifest: 'package.json' } }));
    assert.equal(w.roundTripValid, true);
    const yaml = fs.readFileSync(path.join(root, '.superpowers', 'preferences.yml'), 'utf8');
    assert.ok(!/test_command|setup_command|ui_file_globs|format_command/.test(yaml), 'a rewrite drops the retired keys');
    assert.deepEqual(json(READ, ['--repo-root', root]).preferences.project, { stack: 'node', manifest: 'package.json' });
  } finally { rm(root); }
});

test('no preferences file at all → projectProfile.declared false alongside preferencesFound false', () => {
  const root = mkRepo({});
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    const d = json(DERIVE, ['--platform', 'claude-code', '--repo-root', root]);
    assert.equal(d.preferencesFound, false);
    assert.equal(d.projectProfile.declared, false);
  } finally { rm(root); }
});
