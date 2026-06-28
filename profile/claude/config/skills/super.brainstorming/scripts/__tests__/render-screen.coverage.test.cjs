'use strict'

/**
 * Coverage top-up for render-screen.cjs — exercises the CLI input paths that the
 * existing render-screen.test.cjs does not reach.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/render-screen.coverage.test.cjs
 *
 * These are dedicated, additive cases (the existing suite is not edited). They close
 * the previously-uncovered lines:
 *   - 117  readSpec --input-file branch
 *   - 119  readSpec stdin fallback (fs.readFileSync(0, ...))
 *   - 125-127  main() --help short-circuit
 *
 * Note: the `catch (e) { return '' }` arm on line 119 is a defensive guard for
 * platforms where reading fd 0 throws; with a piped stdin (this test) the read
 * succeeds, so only the happy branch is reachable here. The throwing branch is a
 * platform-dependent fallback and is left as a documented branch gap.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCRIPT = path.resolve(__dirname, '..', 'render-screen.cjs')

function run(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts })
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-screen-cov-'))
}

test('CLI: --help prints usage and exits 0 (main short-circuit)', () => {
  // Covers main() lines 125-127 (the args.help branch + return).
  const out = run(['--help'])
  assert.match(out, /Usage: render-screen\.cjs/)
  assert.match(out, /--spec/)
})

test('CLI: -h is treated as --help', () => {
  const out = run(['-h'])
  assert.match(out, /Usage: render-screen\.cjs/)
})

test('CLI: --input-file reads the spec from a file', () => {
  // Covers readSpec line 117 (args['input-file'] branch).
  const dir = tmpDir()
  const specFile = path.join(dir, 'spec.json')
  fs.writeFileSync(specFile, JSON.stringify({ kind: 'options', title: 'FromFile', items: [{ heading: 'A' }] }))

  const out = JSON.parse(run(['--screen-dir', dir, '--name', 'layout.html', '--input-file', specFile]))
  assert.equal(out.written, true)
  assert.equal(out.kind, 'options')
  const written = fs.readFileSync(out.path, 'utf8')
  assert.match(written, /<h2>FromFile<\/h2>/)
})

test('CLI: spec read from stdin when neither --spec nor --input-file is given', () => {
  // Covers readSpec line 119 (fs.readFileSync(0, 'utf8') stdin fallback).
  const dir = tmpDir()
  const spec = JSON.stringify({ kind: 'pros-cons', pros: ['fast'], cons: ['rigid'] })
  const out = JSON.parse(run(['--screen-dir', dir, '--name', 'pc.html'], { input: spec }))
  assert.equal(out.written, true)
  assert.equal(out.kind, 'pros-cons')
  const written = fs.readFileSync(out.path, 'utf8')
  assert.match(written, /<li>fast<\/li>/)
  assert.match(written, /<li>rigid<\/li>/)
})

test('CLI: empty stdin reports the "no spec provided" failure', () => {
  // Drives readSpec via stdin (line 119) and then the empty-raw guard.
  const dir = tmpDir()
  assert.throws(
    () => run(['--screen-dir', dir, '--name', 'x.html'], { input: '', stdio: 'pipe' }),
    /Command failed/,
  )
})
