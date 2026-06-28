'use strict'

/**
 * Regression tests for render-screen.cjs — the visual-companion screen generator.
 *
 * Run with: node --test 'skills/**\/__tests__/*.test.cjs'
 *
 * Covers fragment rendering (options / cards / pros-cons), HTML escaping, choice-slug
 * safety, the kind/items validation errors, and the CLI write path (--spec, basename
 * sanitization, .html guard).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { renderFragment, escapeHtml, safeChoice } = require('../render-screen.cjs')
const SCRIPT = path.resolve(__dirname, '..', 'render-screen.cjs')

function run(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts })
}

test('renderFragment: options produce clickable .option rows with letters and choices', () => {
  const html = renderFragment({
    title: 'Which layout?',
    subtitle: 'Pick one',
    kind: 'options',
    items: [
      { choice: 'a', heading: 'Single', body: 'Clean' },
      { choice: 'b', heading: 'Two col', body: 'Sidebar' },
    ],
  })
  assert.match(html, /<h2>Which layout\?<\/h2>/)
  assert.match(html, /<p class="subtitle">Pick one<\/p>/)
  assert.match(html, /<div class="options">/)
  assert.match(html, /data-choice="a"[^>]*onclick="toggleSelect\(this\)"/)
  assert.match(html, /<div class="letter">A<\/div>/)
  assert.match(html, /<div class="letter">B<\/div>/)
  assert.match(html, /<h3>Single<\/h3><p>Clean<\/p>/)
})

test('renderFragment: multiselect adds the data-multiselect container flag', () => {
  const html = renderFragment({ kind: 'options', multiselect: true, items: [{ heading: 'X' }] })
  assert.match(html, /<div class="options" data-multiselect>/)
})

test('renderFragment: letters auto-derive from index when choice/letter omitted', () => {
  const html = renderFragment({ kind: 'options', items: [{ heading: 'First' }, { heading: 'Second' }] })
  assert.match(html, /data-choice="a"/)
  assert.match(html, /data-choice="b"/)
  assert.match(html, /<div class="letter">A<\/div>/)
})

test('renderFragment: cards render .card/.card-body and optional image', () => {
  const html = renderFragment({
    kind: 'cards',
    items: [{ choice: 'd1', heading: 'Design 1', body: 'desc', image: 'IMG' }],
  })
  assert.match(html, /<div class="cards">/)
  assert.match(html, /<div class="card" data-choice="d1"/)
  assert.match(html, /<div class="card-image">IMG<\/div>/)
  assert.match(html, /<div class="card-body"><h3>Design 1<\/h3><p>desc<\/p><\/div>/)
})

test('renderFragment: pros-cons render the two lists', () => {
  const html = renderFragment({ kind: 'pros-cons', pros: ['fast', 'simple'], cons: ['rigid'] })
  assert.match(html, /<div class="pros"><h4>Pros<\/h4><ul><li>fast<\/li><li>simple<\/li><\/ul><\/div>/)
  assert.match(html, /<div class="cons"><h4>Cons<\/h4><ul><li>rigid<\/li><\/ul><\/div>/)
})

test('escapeHtml: neutralizes markup-breaking characters', () => {
  assert.equal(escapeHtml('<script>"a"&b'), '&lt;script&gt;&quot;a&quot;&amp;b')
  assert.equal(escapeHtml(null), '')
})

test('renderFragment: user text is escaped so it cannot break the markup', () => {
  const html = renderFragment({ title: '<b>x</b>', kind: 'options', items: [{ heading: 'a & b' }] })
  assert.match(html, /<h2>&lt;b&gt;x&lt;\/b&gt;<\/h2>/)
  assert.match(html, /<h3>a &amp; b<\/h3>/)
  assert.doesNotMatch(html, /<h2><b>/)
})

test('safeChoice: sanitizes to a slug and falls back to the index letter', () => {
  assert.equal(safeChoice('Option A!', 0), 'optiona')
  assert.equal(safeChoice('', 2), 'c')
  assert.equal(safeChoice('keep-this_1', 0), 'keep-this_1')
})

test('CLI: --spec writes a fragment file and reports JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-screen-'))
  const spec = JSON.stringify({ kind: 'options', title: 'T', items: [{ heading: 'A' }] })
  const out = JSON.parse(run(['--screen-dir', dir, '--name', 'layout.html', '--spec', spec]))
  assert.equal(out.written, true)
  assert.equal(out.kind, 'options')
  assert.equal(path.basename(out.path), 'layout.html')
  const written = fs.readFileSync(out.path, 'utf8')
  assert.match(written, /<div class="options">/)
  assert.match(written, /<h2>T<\/h2>/)
})

test('CLI: --name is reduced to a basename (no path traversal)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-screen-'))
  const spec = JSON.stringify({ kind: 'options', items: [{ heading: 'A' }] })
  const out = JSON.parse(run(['--screen-dir', dir, '--name', '../../evil.html', '--spec', spec]))
  assert.equal(path.dirname(out.path), dir, 'file lands inside screen-dir, not above it')
  assert.equal(path.basename(out.path), 'evil.html')
})

test('CLI: rejects a non-.html name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-screen-'))
  assert.throws(
    () => run(['--screen-dir', dir, '--name', 'layout.txt', '--spec', '{}'], { stdio: 'pipe' }),
    /Command failed/,
  )
})

test('CLI: rejects an unknown kind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-screen-'))
  assert.throws(
    () => run(['--screen-dir', dir, '--name', 'x.html', '--spec', '{"kind":"carousel"}'], { stdio: 'pipe' }),
    /Command failed/,
  )
})
