#!/usr/bin/env node
'use strict'

/**
 * render-screen.cjs — generate a visual-companion screen fragment from a compact spec.
 *
 * The agent passes a small JSON spec instead of writing full HTML markup into its
 * context on every screen. The script renders a frame-template fragment (the server
 * wraps it with header/theme/helper automatically) and writes it directly to the
 * session's content dir. This keeps verbose, repetitive HTML out of the agent context
 * and guarantees correct, escaped markup.
 *
 * Usage:
 *   node render-screen.cjs --screen-dir <dir> --name <file.html> --spec '<json>'
 *   node render-screen.cjs --screen-dir <dir> --name <file.html> --input-file <spec.json>
 *   echo '<json>' | node render-screen.cjs --screen-dir <dir> --name <file.html>
 *
 * Spec shape (kind drives the layout):
 *   { "title": "...", "subtitle": "...", "kind": "options|cards|pros-cons",
 *     "multiselect": false,
 *     "items":  [ { "choice":"a", "heading":"...", "body":"..." }, ... ]   // options|cards
 *     "pros":   [ "...", ... ], "cons": [ "...", ... ]                     // pros-cons
 *   }
 *
 * Output (stdout): {"written":true,"path":"<abs>","kind":"options","bytes":N}
 *
 * Escape hatch: for one-off layouts the generator does not cover (split views, bespoke
 * mockups), write the HTML file directly with the Write tool — see visual-companion.md.
 */

const fs = require('fs')
const path = require('path')

const KINDS = new Set(['options', 'cards', 'pros-cons'])
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function fail(msg) {
  process.stdout.write(JSON.stringify({ written: false, error: msg }) + '\n')
  process.exit(1)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return { help: true }
    if (a.startsWith('--')) { args[a.slice(2)] = argv[++i] }
  }
  return args
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// choice attribute must be a safe slug (it round-trips through the DOM and the events file)
function safeChoice(raw, index) {
  const slug = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return slug || LETTERS[index].toLowerCase()
}

function renderOptionLike(spec, kind) {
  const items = Array.isArray(spec.items) ? spec.items : []
  if (items.length === 0) fail(`kind "${kind}" requires a non-empty "items" array`)
  const containerClass = kind === 'cards' ? 'cards' : 'options'
  const itemClass = kind === 'cards' ? 'card' : 'option'
  const multi = spec.multiselect ? ' data-multiselect' : ''

  const rows = items.map((it, i) => {
    const choice = safeChoice(it.choice, i)
    const heading = escapeHtml(it.heading)
    const body = it.body ? `<p>${escapeHtml(it.body)}</p>` : ''
    if (kind === 'cards') {
      const image = it.image ? `    <div class="card-image">${escapeHtml(it.image)}</div>\n` : ''
      return `  <div class="card" data-choice="${choice}" onclick="toggleSelect(this)">\n` +
        image +
        `    <div class="card-body"><h3>${heading}</h3>${body}</div>\n  </div>`
    }
    const letter = escapeHtml(it.letter || LETTERS[i])
    return `  <div class="option" data-choice="${choice}" onclick="toggleSelect(this)">\n` +
      `    <div class="letter">${letter}</div>\n` +
      `    <div class="content"><h3>${heading}</h3>${body}</div>\n  </div>`
  }).join('\n')

  return `<div class="${containerClass}"${multi}>\n${rows}\n</div>`
}

function renderProsCons(spec) {
  const pros = Array.isArray(spec.pros) ? spec.pros : []
  const cons = Array.isArray(spec.cons) ? spec.cons : []
  if (pros.length === 0 && cons.length === 0) fail('kind "pros-cons" requires "pros" and/or "cons" arrays')
  const li = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')
  return `<div class="pros-cons">\n` +
    `  <div class="pros"><h4>Pros</h4><ul>${li(pros)}</ul></div>\n` +
    `  <div class="cons"><h4>Cons</h4><ul>${li(cons)}</ul></div>\n</div>`
}

function renderFragment(spec) {
  if (!spec || typeof spec !== 'object') fail('spec must be a JSON object')
  const kind = spec.kind || 'options'
  if (!KINDS.has(kind)) fail(`unknown kind "${kind}" (expected one of: ${[...KINDS].join(', ')})`)

  const head = []
  if (spec.title) head.push(`<h2>${escapeHtml(spec.title)}</h2>`)
  if (spec.subtitle) head.push(`<p class="subtitle">${escapeHtml(spec.subtitle)}</p>`)

  const body = kind === 'pros-cons' ? renderProsCons(spec) : renderOptionLike(spec, kind)
  return head.concat('', body).join('\n') + '\n'
}

function readSpec(args) {
  if (args.spec != null) return args.spec
  if (args['input-file'] != null) return fs.readFileSync(args['input-file'], 'utf8')
  // stdin fallback
  try { return fs.readFileSync(0, 'utf8') } catch (e) { return '' }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write('Usage: render-screen.cjs --screen-dir <dir> --name <file.html> --spec <json>|--input-file <f>|stdin\n')
    return
  }
  if (!args['screen-dir']) fail('--screen-dir is required')
  if (!args.name) fail('--name is required (e.g. layout.html)')

  const name = path.basename(args.name)
  if (!name.endsWith('.html')) fail('--name must end with .html')

  const raw = readSpec(args)
  if (!raw || !raw.trim()) fail('no spec provided (use --spec, --input-file, or stdin)')

  let spec
  try { spec = JSON.parse(raw) } catch (e) { fail('spec is not valid JSON: ' + e.message) }

  const fragment = renderFragment(spec)
  const outPath = path.join(args['screen-dir'], name)
  fs.mkdirSync(args['screen-dir'], { recursive: true })
  fs.writeFileSync(outPath, fragment, 'utf8')

  process.stdout.write(JSON.stringify({
    written: true, path: outPath, kind: spec.kind || 'options', bytes: Buffer.byteLength(fragment),
  }) + '\n')
}

if (require.main === module) main()

module.exports = { renderFragment, escapeHtml, safeChoice }
