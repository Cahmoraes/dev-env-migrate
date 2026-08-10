#!/usr/bin/env node
'use strict';

/*
 * run-mutation.cjs - drive one discrimination-sensor mutation cycle safely.
 *
 * Injects a single fault into ONE file (optionally scoped to one line), runs the
 * project's test command, and reports whether the tests KILLED the mutant (failed)
 * or the mutant SURVIVED (tests still passed). The original file is always restored
 * in a finally block - even if the test command throws - so the working tree ends
 * byte-identical to how it started.
 *
 * The real working tree is never left mutated. This is the enforcement of the
 * sensor's non-negotiable ("faults live only in a scratch state").
 *
 * Usage:
 *   node run-mutation.cjs --file <path> --find '<original>' --replace '<mutant>' \
 *        --test '<test command>' [--line <n>]
 *
 * Output (stdout, single line JSON):
 *   { "killed": bool, "survived": bool, "testExitCode": n, "file": path,
 *     "line": n|null, "applied": bool, "restored": bool }
 *
 * Exit codes: 0 ok (cycle ran, mutant killed or survived), 2 usage/validation
 * error (missing arg, --find not present, restore failed).
 */

const fs = require('fs');
const { execSync } = require('child_process');

// The project's test command must not inherit a test-runner context from whatever
// spawned this script. `node --test` reads NODE_TEST_CONTEXT and, when it is set,
// reports results to a parent runner over IPC instead of the terminal - and exits 0
// EVEN WHEN TESTS FAIL. Inherited, it makes every mutant look like it SURVIVED: the
// sensor would call a discriminating suite blind, which is the one verdict this
// script exists to get right. Verified: `NODE_TEST_CONTEXT=child-v8 node --test` on a
// failing test exits 0, the same command without it exits 1.
function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--find') args.find = argv[++i];
    else if (a === '--replace') args.replace = argv[++i];
    else if (a === '--test') args.test = argv[++i];
    else if (a === '--line') args.line = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return "run-mutation.cjs --file <path> --find '<original>' --replace '<mutant>' --test '<cmd>' [--line <n>]";
}

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(2);
}

/**
 * Apply the mutation to `content`. If `line` (1-indexed) is given, only that line
 * is eligible and it must contain `find`. Otherwise the FIRST occurrence in the
 * file is replaced. Returns { mutated, applied }.
 */
function mutate(content, find, replace, line) {
  if (Number.isInteger(line)) {
    const lines = content.split('\n');
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) return { mutated: content, applied: false };
    if (!lines[idx].includes(find)) return { mutated: content, applied: false };
    lines[idx] = lines[idx].replace(find, replace); // first occurrence on that line
    return { mutated: lines.join('\n'), applied: true };
  }
  const at = content.indexOf(find);
  if (at === -1) return { mutated: content, applied: false };
  const mutated = content.slice(0, at) + replace + content.slice(at + find.length);
  return { mutated, applied: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + '\n');
    process.exit(0);
  }
  if (!args.file || args.find === undefined || args.replace === undefined || !args.test) {
    fail('missing required arg. ' + usage());
  }
  if (!fs.existsSync(args.file)) fail('file not found: ' + args.file);

  const original = fs.readFileSync(args.file, 'utf8');
  const { mutated, applied } = mutate(original, args.find, args.replace, args.line);
  if (!applied) {
    fail('--find not present' + (Number.isInteger(args.line) ? ' on line ' + args.line : '') + ': ' + args.find);
  }

  let testExitCode = null;
  let restored = false;
  try {
    fs.writeFileSync(args.file, mutated);
    try {
      // `args.test` is intentionally run through a shell: it is the project's own
      // test command (e.g. `npm test -- retry`), supplied by the trusted Verifier
      // subagent, and needs shell features (`--`, `&&`, globs) to work. It is NOT
      // untrusted external input. The mutation inputs (--file/--find/--replace) never
      // reach the shell - they only feed fs.readFileSync/writeFileSync above.
      execSync(args.test, { stdio: 'ignore', env: childEnv() });
      testExitCode = 0;
    } catch (e) {
      testExitCode = typeof e.status === 'number' ? e.status : 1;
    }
  } finally {
    try {
      fs.writeFileSync(args.file, original);
      restored = fs.readFileSync(args.file, 'utf8') === original;
    } catch (e) {
      // Restoration failure is the worst case - surface it loudly.
      process.stdout.write(JSON.stringify({
        error: 'RESTORE FAILED - working tree may be dirty: ' + args.file,
        detail: String(e && e.message || e),
      }) + '\n');
      process.exit(2);
    }
  }

  const killed = testExitCode !== 0;
  process.stdout.write(JSON.stringify({
    killed,
    survived: !killed,
    testExitCode,
    file: args.file,
    line: Number.isInteger(args.line) ? args.line : null,
    applied: true,
    restored,
  }) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = { mutate, parseArgs };
