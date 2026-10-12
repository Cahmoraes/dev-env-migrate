#!/usr/bin/env node
'use strict';

/*
 * run-mutation.cjs - drive one mutation cycle safely (the TDD MUTATE step, one mutant).
 *
 * Injects a single fault into ONE file (optionally scoped to one line), runs the
 * project's test command, and reports whether the tests KILLED the mutant (failed)
 * or the mutant SURVIVED (tests still passed). The original file is always restored
 * in a finally block - even if the test command throws, and on SIGINT/SIGTERM/SIGHUP -
 * so the working tree ends byte-identical to how it started.
 *
 * The real working tree is never left mutated: faults live only for the length of one
 * test run.
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
 * error (missing arg, --find not present, restore failed), 128+n when interrupted
 * by a signal (the original is restored before exiting).
 */

const fs = require('fs');
const { spawn } = require('child_process');

// The project's test command must not inherit a test-runner context from whatever
// spawned this script. `node --test` reads NODE_TEST_CONTEXT and, when it is set,
// reports results to a parent runner over IPC instead of the terminal - and exits 0
// EVEN WHEN TESTS FAIL. Inherited, it makes every mutant look like it SURVIVED: the
// runner would call a discriminating suite blind, which is the one verdict this
// script exists to get right. Verified: `NODE_TEST_CONTEXT=child-v8 node --test` on a
// failing test exits 0, the same command without it exits 1.
function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// Signals that must not leave a mutant behind. Default Node behaviour on these is to
// die on the spot, skipping every `finally` - the one path that dirtied the real tree.
const FATAL_SIGNALS = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

/**
 * Run `fn` with FATAL_SIGNALS routed to `onSignal(signal)` instead of killing the
 * process; the handlers are removed when `fn` settles. `onSignal` must be synchronous
 * and is expected to exit.
 */
async function withSignalGuard(onSignal, fn) {
  const handlers = Object.keys(FATAL_SIGNALS).map((sig) => {
    const h = () => onSignal(sig);
    process.on(sig, h);
    return [sig, h];
  });
  try {
    return await fn();
  } finally {
    for (const [sig, h] of handlers) process.removeListener(sig, h);
  }
}

/**
 * Run the project's test command. It is intentionally run through a shell: it is the
 * project's own test command (e.g. `npm test -- retry`), supplied by the trusted
 * implementer, and needs shell features (`--`, `&&`, globs) to work. It is NOT
 * untrusted external input; the mutation inputs never reach the shell.
 * Resolves { exit, ms, child } - exit is 1 when the command was killed or never spawned.
 * `onSpawn(child)` lets the caller kill it from a signal handler.
 */
function runTest(cmd, cwd, onSpawn) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ch = spawn(cmd, { shell: true, cwd, stdio: 'ignore', env: childEnv() });
    if (onSpawn) onSpawn(ch);
    ch.on('close', (code) => resolve({ exit: code === null ? 1 : code, ms: Date.now() - t0 }));
    ch.on('error', () => resolve({ exit: 1, ms: Date.now() - t0 }));
  });
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
 * file is replaced. Returns { mutated, applied }. `replace` is inserted literally:
 * `$&`, `$1`, `$$` in a mutant are code, not String#replace patterns.
 */
function mutate(content, find, replace, line) {
  if (Number.isInteger(line)) {
    const lines = content.split('\n');
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) return { mutated: content, applied: false };
    const at = lines[idx].indexOf(find);
    if (at === -1) return { mutated: content, applied: false };
    lines[idx] = lines[idx].slice(0, at) + replace + lines[idx].slice(at + find.length);
    return { mutated: lines.join('\n'), applied: true };
  }
  const at = content.indexOf(find);
  if (at === -1) return { mutated: content, applied: false };
  return { mutated: content.slice(0, at) + replace + content.slice(at + find.length), applied: true };
}

/**
 * Put `original` (the exact bytes read before mutating) back and prove it landed.
 * Bytes, not a decoded string: a file that is not valid UTF-8 would otherwise be
 * "restored" with U+FFFD in place of its original bytes.
 */
function restoreBytes(file, original) {
  fs.writeFileSync(file, original);
  return fs.readFileSync(file).equals(original);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + '\n');
    process.exit(0);
  }
  if (!args.file || args.find === undefined || args.replace === undefined || !args.test) {
    fail('missing required arg. ' + usage());
  }

  let original;
  try { original = fs.readFileSync(args.file); } catch (e) { fail('file not found: ' + args.file); }
  const { mutated, applied } = mutate(original.toString('utf8'), args.find, args.replace, args.line);
  if (!applied) {
    fail('--find not present' + (Number.isInteger(args.line) ? ' on line ' + args.line : '') + ': ' + args.find);
  }

  let child = null;
  const onSignal = (sig) => {
    // Restore FIRST, then stop the test run: the tree is what must survive the interrupt.
    let restored = false;
    try { restored = restoreBytes(args.file, original); } catch (e) { /* reported below */ }
    if (child && child.exitCode === null) { try { child.kill(sig); } catch (e) { /* already gone */ } }
    process.stdout.write(JSON.stringify(restored
      ? { error: 'interrupted by ' + sig + ' - original restored: ' + args.file, restored: true }
      : { error: 'RESTORE FAILED - working tree may be dirty: ' + args.file, restored: false }) + '\n');
    process.exit(FATAL_SIGNALS[sig]);
  };

  let testExitCode = null;
  let restored = false;
  await withSignalGuard(onSignal, async () => {
    try {
      fs.writeFileSync(args.file, mutated);
      testExitCode = (await runTest(args.test, undefined, (ch) => { child = ch; })).exit;
    } finally {
      try {
        restored = restoreBytes(args.file, original);
      } catch (e) {
        // Restoration failure is the worst case - surface it loudly.
        process.stdout.write(JSON.stringify({
          error: 'RESTORE FAILED - working tree may be dirty: ' + args.file,
          detail: String(e && e.message || e),
        }) + '\n');
        process.exit(2);
      }
    }
  });

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

module.exports = { mutate, parseArgs, childEnv, runTest, restoreBytes, withSignalGuard, FATAL_SIGNALS };
