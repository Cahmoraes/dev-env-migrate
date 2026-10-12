#!/usr/bin/env node
'use strict';
/*
 * runner-source-contract.test.cjs — the test runner is resolved once, at planning, never guessed.
 *
 * Measured on a greenfield repo: nothing on disk named a runner (no instructions file, the
 * manifest was created by Task 1), so the only source was the spec. The task-writer briefing is
 * the single write point (the index's `**Tech Stack:**` line was, until 2026-09-24; the task writer
 * was its only reader): the controller resolves it (instructions file → manifest → spec → ask), the
 * task writer copies it. A runner guessed here is pasted verbatim into every implementer prompt,
 * which is why the rule sits in SKILL.md and the reference defers to it.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/runner-source-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

test('SKILL.md resolves the runner in source order, asks when all are silent, and writes it to the briefing', () => {
  const md = read('SKILL.md');
  const at = md.indexOf('is resolved, never guessed');
  assert.ok(at > 0, 'the resolution rule must live in SKILL.md (the controller reads it, the writer does not)');
  const rule = md.slice(at, at + 1100);
  assert.match(rule, /stack from `projectProfile`/);
  assert.match(rule, /instructions file, else the manifest at `projectProfile\.manifest`/);
  assert.match(rule, /— else the spec's Testes section/);
  assert.match(rule, /all silent → ask the user now, before any task file exists/);
  assert.match(rule, /It goes in the task-writer briefing/);
  assert.match(rule, /never in the index/);
  assert.match(rule, /The task writer copies the runner from the briefing into every `Run:` line/);
});

test('a toolchain-owned runner is settled by the declared manifest kind, file present or not — but a universal launcher is not', () => {
  // Measured: flutter greenfield without pubspec.yaml asked the runner 2/2 although `flutter test` is the only one.
  const md = read('SKILL.md');
  const at = md.indexOf('is resolved, never guessed');
  const rule = md.slice(at, at + 900);
  assert.match(rule, /the manifest's declared kind settles it even before the file exists \(`pubspec\.yaml` → `flutter test`, `go\.mod` → `go test`, `Cargo\.toml` → `cargo test`, `mix\.exs` → `mix test`\)/);
  assert.match(rule, /a universal launcher never settles the framework it launches \(`dotnet test`, `npm test`\)/);
});

test('the task-step reference defers to the briefing instead of re-deriving the runner', () => {
  const ref = read('references/required-task-step-pattern.md');
  assert.match(ref, /Start from the runner the briefing's `## Runner de testes` records/);
  assert.match(ref, /never substitute one the briefing does not name/);
});

test('the briefing carries the runner, the writer reads it there, and the index template no longer has the line', () => {
  const entry = read('references/entry-phase.md');
  assert.match(entry, /\*\*`## Runner de testes` is the writer's only source for every `Run:` line\*\*/);
  assert.match(entry, /One bullet per workspace and test kind/);
  assert.match(entry, /a whole-suite, typecheck, lint or build command never goes here/);
  // the pre-dispatch check is a fenced command (a described one gets improvised) and gates the dispatch
  assert.match(entry, /```bash\n\s*node <super\.writing-plans-base-dir>\/scripts\/validate-tasks\.cjs --tasks-index [^\n]+ --index-only\n/);
  assert.match(entry, /the writer is dispatched only on `valid: true`/);
  assert.ok(entry.indexOf('**Check the index and the briefing before dispatching.**') < entry.indexOf('**Dispatch with the contract'), 'the check comes before the dispatch');
  const writer = read('agents/task-writer.md');
  assert.match(writer, /the runner the briefing's\n\s*`## Runner de testes` names/);
  assert.match(writer, /return `BLOCKED: briefing sem runner para <workspace · kind>`/);
  assert.match(writer, /never take the runner from\n\s*the repo's instructions file/);
  const tpl = read('templates/tasks-template.md');
  assert.doesNotMatch(tpl, /^\*\*Tech Stack:\*\*/m);
  assert.doesNotMatch(read('agents/task-writer.md'), /Tech Stack/);
});
