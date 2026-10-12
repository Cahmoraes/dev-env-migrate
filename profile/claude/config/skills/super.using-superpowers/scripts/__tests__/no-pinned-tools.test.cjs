'use strict';
/**
 * no-pinned-tools.test.cjs — skill prose names capabilities, never a specific tool.
 *
 * A skill that says "use Serena's find_symbol" or "grep first" pins one environment's
 * tooling onto every harness that loads it. The harness knows what it has; the skill says
 * what to find (read a file, search the code by text, locate a symbol, run a command).
 * Exceptions: commands inside fenced blocks that the skills' own scripts need, and the
 * per-harness maps `super.using-superpowers/references/*-tools.md`, which translate the
 * core tool names into that harness's own (there `grep` IS the harness's tool name). The
 * maps still name no symbol-lookup tool or MCP server.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/no-pinned-tools.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const ARTIFACT = path.dirname(SKILLS);

const SKIP_DIR = new Set(['.git', 'node_modules', '__pycache__', 'results']);
const SKIP_EXT = new Set(['.pyc', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.pdf', '.svg']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); }
    else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/** Text with fenced code blocks blanked out (line numbers preserved). */
function proseOnly(text) {
  let inFence = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return ''; }
    return inFence ? '' : line;
  }).join('\n');
}

function hits(text, re) {
  const out = [];
  text.split('\n').forEach((line, i) => { if (re.test(line)) out.push(i + 1); });
  return out;
}

const rel = (p) => path.relative(ARTIFACT, p);
const MD = walk(SKILLS).filter((p) => p.endsWith('.md'));
const isToolsMap = (p) => /super\.using-superpowers\/references\/[a-z-]+-tools\.md$/.test(p);

// Named anywhere, maps included: these are one environment's servers and tools.
const NAMED_TOOL = /\b(Serena|find_symbol|get_symbols_overview|find_referencing_symbols|ast-grep|ripgrep|codegraph)\b/i;
// Recommended in prose (outside fences), maps excepted: the generic search/lookup CLIs.
const PROSE_TOOL = /(`(grep|rg|sg)`|\bLSP\b|\bgrep\b|\bripgrep\b)/;

test('no skill prose names a symbol-lookup tool or MCP server', () => {
  const offenders = [];
  for (const p of MD) {
    const lines = hits(fs.readFileSync(p, 'utf8'), NAMED_TOOL);
    if (lines.length) offenders.push(`${rel(p)}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], 'name the capability (locate a symbol, search the code) and let the harness pick the tool');
});

test('no skill prose recommends grep / rg / sg / LSP outside a fenced command', () => {
  const offenders = [];
  for (const p of MD) {
    if (isToolsMap(p)) continue;
    const lines = hits(proseOnly(fs.readFileSync(p, 'utf8')), PROSE_TOOL);
    if (lines.length) offenders.push(`${rel(p)}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], 'name the capability (search the code by text) and let the harness pick the tool');
});

test('the sweeps really see the patterns — planted offenders are caught', () => {
  assert.ok(NAMED_TOOL.test('use Serena find_symbol first'));
  assert.ok(PROSE_TOOL.test('use `grep` first'));
  assert.equal(hits(proseOnly('```bash\ngrep -n x f\n```\n'), PROSE_TOOL).length, 0, 'fenced commands are exempt');
});
