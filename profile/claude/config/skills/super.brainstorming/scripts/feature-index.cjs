#!/usr/bin/env node
'use strict'

/**
 * feature-index.cjs — derive the feature-history index from `docs/superpowers/`.
 *
 * Root cause this script exists for:
 *   Recall used to mean a vector database: a local SQLite store of synthesized notes, a
 *   manifest recording what had been ingested, three orthogonal staleness axes (content
 *   dirty, embedding-model drift, presence drift) and a consent gate at session start to
 *   repair them. Measured against the artifacts it indexed, that store held ZERO exclusive
 *   information — every note was derived from a versioned file still sitting on disk — and
 *   cost ~80s of critical path plus ~30k tokens per brainstorming to reproduce.
 *
 *   The competitor was always present, always current and more complete: `docs/superpowers/`
 *   itself. This script reads it directly. There is no store, so there is nothing to sync,
 *   so there is no re-sync gate — staleness is impossible by construction, not repaired by
 *   machinery.
 *
 * Why the slug carries so much of the signal: superpowers feature slugs are descriptive
 * natural-language phrases (`login-rate-limiting`, `invoice-export-csv`). They are already
 * the semantic index an embedding tries to be, which is why `--detail slugs` is a real
 * operating point and not a degenerate one.
 *
 * Usage:
 *   node feature-index.cjs --repo-root <root>
 *   node feature-index.cjs --repo-root <root> --detail slugs|brief|full
 *   node feature-index.cjs --repo-root <root> --format md|json
 *   node feature-index.cjs --repo-root <root> --feature <slug>[,<slug>...]
 *   node feature-index.cjs --repo-root <root> --objective-chars 180 --scope-chars 110
 *                          --max-out-of-scope 6
 *
 * Detail levels (what each feature line carries):
 *   slugs — the slug alone.
 *   brief — slug + artifact flags + a one-line objective.
 *   full  — brief + the feature's "out of scope" items.              [default]
 *
 * `full` is the default because it was the best of the three on the retrieval benchmark
 * (micro F1 0.80 against 0.68 for brief and 0.67 for slugs, on 6 briefs / 22 gold
 * features). The separation is precision, not recall: on the brief whose topic had NO
 * history in the repo, slugs and brief each returned 8 false positives while full
 * returned 3 — the out-of-scope lines give a reader enough ground to reject a feature
 * that merely shares vocabulary.
 *
 * The index grows linearly with the feature count, so `--budget-chars` caps it: when the
 * rendered block would exceed the budget, the detail degrades one rung at a time
 * (fewer out-of-scope items, shorter objectives, then brief, then slugs) and the landing
 * rung is reported in `degraded`. Without the cap a large repo would reintroduce exactly
 * the context cost this mechanism exists to remove.
 *
 * Output (stdout). `--format json` always emits:
 *   {
 *     "repoRoot": "...", "docsDir": "docs/superpowers", "docsExists": true,
 *     "detail": "full", "featureCount": 57, "truncated": false,
 *     "degraded": null,
 *     "features": [
 *       { "slug": "...", "objective": "...", "outOfScope": ["..."],
 *         "artifacts": { "spec": true, "prd": true, "plan": true, "qa": false, "iv": true },
 *         "sources": { "objective": "prd:overview", "outOfScope": "prd" } }
 *     ],
 *     "warnings": []
 *   }
 *
 * `--format md` renders the same data as the block meant to enter an agent's context.
 * Its header carries the pointer to the artifacts themselves, so no skill's prose has to
 * restate it.
 *
 * Contract, repo-wide: JSON/markdown to stdout, warnings to stderr, and the verdict lives
 * in the payload — the exit code signals usage/IO failure only. A repo with no
 * `docs/superpowers/` is not a failure: it is `docsExists: false` and an empty list.
 *
 * Never prescribes a search procedure. It hands over data; selecting from it is the
 * reader's job. A measured A/B found that spelling out the search steps (`ls`, then
 * `grep`, then open) scored LAST — below giving no instruction at all — because it pulled
 * the reader into `docs/` and away from the code.
 */

const fs = require('node:fs')
const path = require('node:path')

const DOCS_DIR = path.join('docs', 'superpowers')
const DETAIL_LEVELS = ['slugs', 'brief', 'full']

const DEFAULTS = {
  detail: 'full',
  format: 'md',
  objectiveChars: 180,
  scopeChars: 110,
  maxOutOfScope: 6,
  // ~10k tokens. Chosen against what it replaced: the vector recall it supersedes cost
  // ~30k tokens per brainstorming, so the cap sits a clear factor below that no matter how
  // many features a repo accumulates. On a 57-feature repo full detail lands at ~6.9k
  // tokens, well inside the cap; the ladder only engages past roughly 80 features.
  budgetChars: 40000,
}

// The degradation ladder, richest first. Reaching for the next rung is what keeps a repo
// with hundreds of features from costing more context than the mechanism it replaced.
// Every rung is a measured operating point, not an improvisation: rung 3 is `brief` and
// rung 4 is `slugs`, the two arms the benchmark scored beside `full`.
const LADDER = [
  { detail: 'full', maxOutOfScope: 6, objectiveChars: 180 },
  { detail: 'full', maxOutOfScope: 3, objectiveChars: 140 },
  { detail: 'full', maxOutOfScope: 1, objectiveChars: 110 },
  { detail: 'brief', maxOutOfScope: 0, objectiveChars: 110 },
  { detail: 'slugs', maxOutOfScope: 0, objectiveChars: 0 },
]

// ─── Heading vocabulary ──────────────────────────────────────────────────────
//
// The artifact templates fix these headings in pt-BR and they are structural skeleton:
// `communication.language` governs prose, never the section names. The English aliases
// and the accent-insensitive matching are tolerance for hand-edited artifacts, not a
// second supported spelling — normalization is one-way, so `Visao Geral` and
// `Visão Geral` are the same key here.
const OVERVIEW_HEADINGS = [
  'visao geral', 'overview', 'contexto', 'context', 'problema', 'problem',
  'objetivo', 'objective', 'resumo', 'summary',
]
const OBJECTIVES_HEADINGS = ['objetivos', 'objectives', 'goals', 'metas']
const OUT_OF_SCOPE_HEADINGS = [
  'fora de escopo', 'out of scope', 'nao-objetivos', 'nao objetivos', 'non-goals', 'nongoals',
]

// ─── Small utilities ─────────────────────────────────────────────────────────

/** Lowercase, strip accents and surrounding punctuation, collapse whitespace. */
function normalizeHeading(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks: `Visão` and `Visao` become one key
    .toLowerCase()
    .replace(/[*_`#]/g, '')
    .replace(/^[\s\d.)-]+/, '')
    .replace(/[\s:.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Drop inline markdown so a line reads as plain prose. */
function stripInline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?)])/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Truncate on a word boundary, marking the cut so a reader knows it is not the whole line. */
function truncate(text, limit) {
  const s = String(text).trim()
  if (s.length <= limit) return s
  const cut = s.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  const kept = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${kept.replace(/[\s,;:.–—-]+$/, '')}…`
}

/**
 * Split a markdown document into `## `-level sections, honoring fenced code blocks so a
 * `## ` inside a fence never opens a phantom section.
 * Returns a Map from normalized heading to the section's body lines.
 */
function sectionsOf(markdown) {
  const sections = new Map()
  let current = null
  let inFence = false
  for (const raw of String(markdown).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      if (current) current.body.push(raw)
      continue
    }
    if (!inFence) {
      const heading = /^(#{1,6})\s+(.*)$/.exec(raw)
      if (heading) {
        const level = heading[1].length
        if (level <= 2) {
          const key = normalizeHeading(heading[2])
          current = { key, body: [] }
          // First occurrence wins: a document that repeats a heading is answering with
          // its first, canonical section, not with whatever came last.
          if (!sections.has(key)) sections.set(key, current.body)
          else current = { key, body: [] }
          continue
        }
      }
    }
    if (current) current.body.push(raw)
  }
  return sections
}

/** Look up the first section whose normalized heading is in `names`. */
function findSection(sections, names) {
  for (const name of names) {
    if (sections.has(name)) return sections.get(name)
  }
  return null
}

/** The section's opening prose paragraph, as one line. Skips lists, quotes and fences. */
function leadParagraph(bodyLines) {
  if (!bodyLines) return ''
  const buf = []
  let inFence = false
  for (const raw of bodyLines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      if (buf.length) break
      continue
    }
    if (inFence) continue
    const line = raw.trim()
    if (!line) {
      if (buf.length) break
      continue
    }
    const isProse = !/^(#{1,6}\s|>|\||[-*+]\s|\d+[.)]\s|-{3,}$|={3,}$|<)/.test(line)
    if (!isProse) {
      if (buf.length) break
      continue
    }
    buf.push(line)
  }
  return stripInline(buf.join(' '))
}

/** Every list item in the section, flattened, in document order. */
function listItems(bodyLines) {
  if (!bodyLines) return []
  const out = []
  let inFence = false
  for (const raw of bodyLines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw)
    if (!item) continue
    const text = stripInline(item[1])
    if (text) out.push(text)
  }
  return out
}

// ─── Artifact discovery ──────────────────────────────────────────────────────

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** Pick `<slug>`-named file first, then any file matching the pattern. */
function pickFile(dir, preferred, pattern) {
  const names = listFiles(dir)
  if (preferred && names.includes(preferred)) return path.join(dir, preferred)
  const match = names.find((n) => pattern.test(n))
  return match ? path.join(dir, match) : null
}

function readTextFile(file, warnings) {
  if (!file) return null
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    warnings.push(`unreadable: ${file} (${err.code || err.message})`)
    return null
  }
}

function locateArtifacts(featureDir, slug) {
  const specsDir = path.join(featureDir, 'specs')
  const prdDir = path.join(featureDir, 'prd')
  const plansDir = path.join(featureDir, 'plans')
  const qaDir = path.join(featureDir, 'qa')
  return {
    spec: pickFile(specsDir, `${slug}-design.md`, /-design\.md$/i) || pickFile(specsDir, null, /\.md$/i),
    prd: pickFile(prdDir, `prd-${slug}.md`, /^prd-.*\.md$/i) || pickFile(prdDir, null, /\.md$/i),
    plan: pickFile(plansDir, `tasks-${slug}.md`, /^tasks-.*\.md$/i),
    qa: pickFile(qaDir, `qa-report-${slug}.md`, /^qa-report-.*\.md$/i),
    iv: pickFile(qaDir, `validation-${slug}.md`, /^validation-.*\.md$/i),
  }
}

// ─── Extraction ──────────────────────────────────────────────────────────────

/**
 * The objective, resolved by falling through four sources. The PRD states the objective
 * in product terms and is the better retrieval surface; the spec is the fallback because
 * a PRD is optional in this pipeline while a spec is not.
 */
function extractObjective(prdSections, specSections) {
  const candidates = [
    ['prd:overview', () => leadParagraph(findSection(prdSections, OVERVIEW_HEADINGS))],
    ['prd:objectives', () => (listItems(findSection(prdSections, OBJECTIVES_HEADINGS))[0] || '')],
    ['spec:overview', () => leadParagraph(findSection(specSections, OVERVIEW_HEADINGS))],
    ['spec:lead', () => leadParagraph(specSections ? firstBody(specSections) : null)],
  ]
  for (const [source, get] of candidates) {
    const value = get()
    if (value) return { text: value, source }
  }
  return { text: '', source: null }
}

/** The body of whatever section opens the document — the last-resort objective source. */
function firstBody(sections) {
  for (const body of sections.values()) return body
  return null
}

function extractOutOfScope(prdSections, specSections) {
  const fromPrd = listItems(findSection(prdSections, OUT_OF_SCOPE_HEADINGS))
  if (fromPrd.length) return { items: fromPrd, source: 'prd' }
  const fromSpec = listItems(findSection(specSections, OUT_OF_SCOPE_HEADINGS))
  if (fromSpec.length) return { items: fromSpec, source: 'spec' }
  return { items: [], source: null }
}

// ─── Index build ─────────────────────────────────────────────────────────────

function buildIndex(options) {
  const warnings = []
  const docsPath = path.join(options.repoRoot, DOCS_DIR)
  const result = {
    repoRoot: options.repoRoot,
    docsDir: DOCS_DIR,
    docsExists: false,
    detail: options.detail,
    featureCount: 0,
    truncated: false,
    degraded: null,
    features: [],
    warnings,
  }

  let entries
  try {
    entries = fs.readdirSync(docsPath, { withFileTypes: true })
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      warnings.push(`unreadable: ${docsPath} (${err.code || err.message})`)
    }
    return result
  }
  result.docsExists = true

  let slugs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()

  if (options.featureFilter) {
    const wanted = new Set(options.featureFilter)
    const missing = options.featureFilter.filter((s) => !slugs.includes(s))
    for (const slug of missing) warnings.push(`no such feature: ${slug}`)
    slugs = slugs.filter((s) => wanted.has(s))
  }

  result.featureCount = slugs.length

  for (const slug of slugs) {
    const featureDir = path.join(docsPath, slug)
    const files = locateArtifacts(featureDir, slug)
    const entry = {
      slug,
      objective: '',
      outOfScope: [],
      artifacts: {
        spec: Boolean(files.spec),
        prd: Boolean(files.prd),
        plan: Boolean(files.plan),
        qa: Boolean(files.qa),
        iv: Boolean(files.iv),
      },
      sources: { objective: null, outOfScope: null },
    }

    if (options.detail !== 'slugs') {
      const prdSections = files.prd ? sectionsOf(readTextFile(files.prd, warnings) || '') : new Map()
      const specSections = files.spec ? sectionsOf(readTextFile(files.spec, warnings) || '') : new Map()

      const objective = extractObjective(prdSections, specSections)
      entry.objective = truncate(objective.text, options.objectiveChars)
      entry.sources.objective = objective.source

      if (options.detail === 'full') {
        const scope = extractOutOfScope(prdSections, specSections)
        const kept = scope.items.slice(0, options.maxOutOfScope)
        if (kept.length < scope.items.length) result.truncated = true
        entry.outOfScope = kept.map((item) => truncate(item, options.scopeChars))
        entry.sources.outOfScope = scope.source
      }
    }

    result.features.push(entry)
  }

  return result
}

/**
 * Build at the requested detail, then walk DOWN the ladder until the rendered block fits
 * the budget. Only rungs at or below the requested detail are considered — asking for
 * `slugs` never escalates, and `--budget-chars 0` disables the cap entirely.
 */
function buildIndexWithinBudget(options) {
  const requested = DETAIL_LEVELS.indexOf(options.detail)
  const rungs = LADDER.filter((r) => DETAIL_LEVELS.indexOf(r.detail) <= requested)
  let index = buildIndex(options)
  if (!options.budgetChars || !index.featureCount) return index
  if (renderMarkdown(index).length <= options.budgetChars) return index

  for (let i = 1; i < rungs.length; i += 1) {
    const rung = rungs[i]
    index = buildIndex({ ...options, ...rung })
    index.degraded = {
      from: options.detail,
      to: rung.detail,
      rung: i,
      maxOutOfScope: rung.maxOutOfScope,
      reason: `over --budget-chars ${options.budgetChars}`,
    }
    if (renderMarkdown(index).length <= options.budgetChars) return index
  }
  // Even the last rung (slugs) can exceed the budget on a very large repo. Emitting it
  // over budget beats emitting nothing: the slug list is the irreducible index.
  return index
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function artifactFlags(artifacts) {
  return ['spec', 'prd', 'plan', 'qa', 'iv'].filter((k) => artifacts[k]).join(' ')
}

function renderMarkdown(index) {
  const lines = []
  if (!index.docsExists) {
    lines.push(`# Feature history — none (no ${index.docsDir}/ in this repository)`)
    return lines.join('\n')
  }
  if (index.featureCount === 0) {
    lines.push(`# Feature history — none recorded yet in ${index.docsDir}/`)
    return lines.join('\n')
  }

  // The header is where the passive pointer lives: it names where the full artifacts sit,
  // so no skill's prose has to restate it and drift from it.
  lines.push(
    `# Feature history — ${index.featureCount} in ${index.docsDir}/<slug>/ ` +
    '(specs/, prd/, plans/, qa/)',
  )
  if (index.degraded) {
    lines.push('')
    lines.push(
      `> Detail reduced to \`${index.degraded.to}\` (${index.degraded.reason}) — ` +
      'entries below are shorter than the artifacts they summarize.',
    )
  }
  lines.push('')

  if (index.detail === 'slugs') {
    for (const f of index.features) lines.push(f.slug)
    return lines.join('\n')
  }

  for (const f of index.features) {
    const flags = artifactFlags(f.artifacts)
    const head = flags ? `- **${f.slug}** [${flags}]` : `- **${f.slug}**`
    lines.push(f.objective ? `${head} — ${f.objective}` : head)
    if (index.detail === 'full' && f.outOfScope.length) {
      lines.push(`  - Out of scope: ${f.outOfScope.join('; ')}`)
    }
  }
  return lines.join('\n')
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    repoRoot: process.cwd(),
    detail: DEFAULTS.detail,
    format: DEFAULTS.format,
    objectiveChars: DEFAULTS.objectiveChars,
    scopeChars: DEFAULTS.scopeChars,
    maxOutOfScope: DEFAULTS.maxOutOfScope,
    budgetChars: DEFAULTS.budgetChars,
    featureFilter: null,
  }
  const numeric = {
    '--objective-chars': 'objectiveChars',
    '--scope-chars': 'scopeChars',
    '--max-out-of-scope': 'maxOutOfScope',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      // A valueless flag must not swallow the next flag as its argument.
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      i += 1
      return value
    }
    if (arg === '--repo-root') opts.repoRoot = path.resolve(next())
    else if (arg === '--detail') opts.detail = next()
    else if (arg === '--format') opts.format = next()
    else if (arg === '--feature') {
      opts.featureFilter = next().split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg === '--budget-chars') {
      const value = Number.parseInt(next(), 10)
      // 0 is meaningful here — it disables the cap — so this one is not in `numeric`.
      if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be 0 or a positive integer`)
      opts.budgetChars = value
    } else if (numeric[arg]) {
      const value = Number.parseInt(next(), 10)
      if (!Number.isFinite(value) || value < 1) throw new Error(`${arg} must be a positive integer`)
      opts[numeric[arg]] = value
    } else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!DETAIL_LEVELS.includes(opts.detail)) {
    throw new Error(`--detail must be one of ${DETAIL_LEVELS.join('|')}`)
  }
  if (opts.format !== 'md' && opts.format !== 'json') {
    throw new Error('--format must be md or json')
  }
  return opts
}

function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`feature-index: ${err.message}\n`)
    process.exit(1)
  }
  if (opts.help) {
    process.stdout.write(
      'Usage: feature-index.cjs --repo-root <root> [--detail slugs|brief|full] ' +
      '[--format md|json] [--feature <slug>[,<slug>]]\n',
    )
    return
  }
  const index = buildIndexWithinBudget(opts)
  for (const warning of index.warnings) process.stderr.write(`feature-index: ${warning}\n`)
  if (opts.format === 'json') process.stdout.write(`${JSON.stringify(index, null, 2)}\n`)
  else process.stdout.write(`${renderMarkdown(index)}\n`)
}

if (require.main === module) main()

module.exports = {
  buildIndex,
  buildIndexWithinBudget,
  renderMarkdown,
  parseArgs,
  sectionsOf,
  leadParagraph,
  listItems,
  normalizeHeading,
  stripInline,
  truncate,
  DEFAULTS,
  DETAIL_LEVELS,
}
