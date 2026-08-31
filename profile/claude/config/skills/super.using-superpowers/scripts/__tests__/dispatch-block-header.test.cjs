'use strict';
/*
 * dispatch-block-header.test.cjs — every declarative dispatch block is headed by the ROLE
 * (`Subagent (<type>):`), never by a harness tool name.
 *
 * Why this is a registry sweep and not a per-file assertion: the header is the first line a
 * controller reads when it opens an `agents/*.md` template, and it is the line that decides
 * whether the block is understood as "call this named tool" or "dispatch a subagent and map
 * it to whatever your harness calls the dispatch tool". A tool name in that slot couples the
 * template to one harness — and it was wrong on every harness, including the one it was
 * copied from: the templates said `Task tool`, while Claude Code's dispatch tool is `Agent`,
 * Copilot's is `task`, Codex's is `spawn_agent` and Gemini exposes the subagent's own name.
 *
 * The block is pseudo-YAML on purpose. No harness parses it — it is prose that a model reads
 * and translates into a real tool call, and the per-harness translation table lives in
 * `super.using-superpowers/references/*-tools.md`, which is the one layer allowed to name
 * tools. Keeping the abstract side spelled the same way everywhere is what lets that table
 * have a left column at all.
 *
 * The invariant is not "keep the word Subagent". It is:
 *
 *   a dispatch block names the ROLE and the agent TYPE; the harness tool name lives in
 *   the *-tools.md layer and nowhere else.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/dispatch-block-header.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const SKIPPED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules']);

/**
 * Anti-staleness floor. A walk whose block-detection stops matching would sweep nothing and
 * pass forever — which is the exact failure mode this file exists to catch in the templates.
 */
const MIN_DISPATCH_BLOCKS = 10;

function markdownFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(abs, relPath); continue; }
      if (path.extname(entry.name) === '.md') out.push({ abs, rel: relPath });
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return out;
}

/**
 * A dispatch block is a fenced block whose first line is a pseudo-YAML mapping key (it ends
 * in `:`) and whose body carries a dispatch field at 2-space indent.
 *
 * Both halves are load-bearing. Without the `:` on the header, TypeScript in a fenced block
 * (`async function waitFor<T>(` — its interface has an indented `description:`) and a sample
 * call (`task(` in copilot-tools.md) both read as dispatches. Without the field check, every
 * `preferences.yml` example qualifies. `model:` has to be one of the accepted fields rather
 * than requiring `prompt: |`: `code-quality-reviewer.md` delegates its prompt to another
 * template, so `model:` is the only dispatch field it carries.
 */
const DISPATCH_FIELD = /^ {2}(model:|prompt: \||description: )/;

function dispatchBlocks({ abs, rel }) {
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const blocks = [];
  let open = null;
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (open) {
        const header = open.body[0] || '';
        // A header may carry a trailing `# ...` note (feature-history-recall marks `explore`
        // as a type, not a tool, right on the line); the mapping-key test looks past it.
        const key = header.replace(/\s+#.*$/, '');
        if (/:\s*$/.test(key) && open.body.some((l) => DISPATCH_FIELD.test(l))) {
          blocks.push({ rel, header });
        }
        open = null;
      } else {
        open = { body: [] };
      }
      continue;
    }
    if (open) open.body.push(line);
  }
  return blocks;
}

const BLOCKS = markdownFiles().flatMap(dispatchBlocks);

test('the dispatch-block roster is not silently shrinking', () => {
  assert.ok(
    BLOCKS.length >= MIN_DISPATCH_BLOCKS,
    `found ${BLOCKS.length} dispatch blocks, expected >= ${MIN_DISPATCH_BLOCKS}. Either a `
    + 'template was deleted or the fence/field detection stopped matching — re-derive it '
    + 'before trusting a green from this file.',
  );
});

test('every dispatch block is headed by the role, never by a harness tool name', () => {
  const bad = BLOCKS.filter((b) => !/^Subagent \(/.test(b.header));
  assert.deepEqual(
    bad.map((b) => `${b.rel}: ${b.header}`),
    [],
    'a dispatch block must open with `Subagent (<agent type or bound>):`. Naming a tool here '
    + 'couples the template to one harness and misnames it on all of them: the dispatch tool '
    + 'is `Agent` on Claude Code, `task` on Copilot, `spawn_agent` on Codex. Per-harness names '
    + 'belong in super.using-superpowers/references/*-tools.md.',
  );
});

test('no dispatch block names a harness dispatch tool in its header', () => {
  // Belt and braces: `Subagent (Task tool):` would pass the shape check above while
  // reintroducing exactly the coupling.
  for (const b of BLOCKS) {
    assert.doesNotMatch(
      b.header,
      /\b(Task tool|spawn_agent|invoke_agent|subagent_type)\b/,
      `${b.rel}: the header names a harness dispatch mechanism — that belongs in the `
      + '*-tools.md translation layer, which is isolated per harness',
    );
  }
});

test('the header parenthetical carries an agent type or an explicit bound', () => {
  // `Subagent:` with nothing in it leaves the controller to guess the type, which is the
  // parameter the dispatch actually needs.
  for (const b of BLOCKS) {
    const m = b.header.match(/^Subagent \(([^)]+)\)/);
    assert.ok(m, `${b.rel}: header must carry a parenthetical: ${b.header}`);
    assert.ok(
      m[1].trim().length > 0,
      `${b.rel}: the parenthetical is empty — it must name the agent type (general-purpose, `
      + 'explore) or the bound that replaces it (read-only)',
    );
  }
});
