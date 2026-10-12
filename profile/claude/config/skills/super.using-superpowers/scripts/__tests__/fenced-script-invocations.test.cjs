'use strict';

/**
 * Cross-skill sweep: every fenced shell command that invokes one of our scripts
 * (`…/scripts/<name>.cjs` or `.py`) starts with its interpreter (`node`, `python3`).
 *
 * Why: a fenced command runs LITERALLY. `session-start.md` shipped the checkpoint-0
 * call as `<super.using-superpowers-base-dir>/scripts/assess-complexity.cjs --checkpoint 0 …`
 * — no `node` — and Claude Code executed exactly that: `exit 126: permission denied`,
 * then a second call with `node` in front. One wasted round-trip per session, on the
 * first tool call the router makes (measured 2/2 on 2026-09-06). Copilot's model added
 * `node` on its own, which is why the defect stayed invisible there.
 *
 * Scope: runtime prose only — SKILL.md, references/, agents/, templates/, assets/.
 * Fences: ```bash | ```sh | ```shell | ```zsh | unlabeled ```. Lines skipped: comments,
 * continuations of a pipeline (`|`, `&&`, `||`), assignments (`X=…`), and commands whose
 * first word is not the script path (`cat`, `sed`, `ls`, `test` … are reads, not runs).
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/fenced-script-invocations.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');

/** Anti-staleness floor: the tree carries far more fenced script calls than this. */
const MIN_INVOCATIONS = 60;

const SHELL_FENCE = /^\s*```(bash|sh|shell|zsh)?\s*$/;
const ANY_FENCE = /^\s*```/;
const SCRIPT_PATH = /(^|[\s/])(scripts\/[\w.-]+\.(cjs|py))(\s|$)/;
const INTERPRETER = /^\s*(node|python3?)\s/;
const SKIP = /^\s*(#|\||&&|\|\||\\|[A-Za-z_][A-Za-z0-9_]*=)/;
const READ_ONLY_FIRST_WORD = /^\s*(cat|sed|ls|test|source|head|tail|wc|grep|rg|find|cp|mv|chmod|echo|printf|diff|less|view|stat)\s/;

/**
 * Scan markdown text. Returns { invocations, offenders } where an offender is a fenced
 * shell line whose first token is a `scripts/*.cjs|py` path with no interpreter in front.
 */
function scan(text) {
  const lines = text.split('\n');
  let inShellFence = false;
  let inOtherFence = false;
  let invocations = 0;
  const offenders = [];
  lines.forEach((line, i) => {
    if (ANY_FENCE.test(line)) {
      if (inShellFence || inOtherFence) { inShellFence = false; inOtherFence = false; return; }
      if (SHELL_FENCE.test(line)) inShellFence = true; else inOtherFence = true;
      return;
    }
    if (!inShellFence) return;
    if (!SCRIPT_PATH.test(line) || SKIP.test(line) || READ_ONLY_FIRST_WORD.test(line)) return;
    invocations += 1;
    const firstToken = line.trim().split(/\s+/)[0] || '';
    const firstTokenIsScript = /scripts\/[\w.-]+\.(cjs|py)$/.test(firstToken);
    if (firstTokenIsScript && !INTERPRETER.test(line)) offenders.push({ line: i + 1, text: line.trim() });
  });
  return { invocations, offenders };
}

function runtimeProseFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/^(__tests__|node_modules|\.git|scripts)$/.test(e.name)) continue;
        walk(p);
      } else if (/\.md$/.test(e.name)) {
        const rel = path.relative(SKILLS, p);
        if (/(^|\/)SKILL\.md$|\/(references|agents|templates?|assets)\//.test(rel)) out.push(p);
      }
    }
  })(SKILLS);
  return out;
}

test('every fenced invocation of a scripts/*.cjs|py path starts with its interpreter', () => {
  let total = 0;
  const offenders = [];
  for (const file of runtimeProseFiles()) {
    const { invocations, offenders: bad } = scan(fs.readFileSync(file, 'utf8'));
    total += invocations;
    for (const b of bad) offenders.push(`${path.relative(SKILLS, file)}:${b.line}: ${b.text.slice(0, 100)}`);
  }
  assert.ok(total >= MIN_INVOCATIONS, `sweep went stale: only ${total} fenced script invocations found (floor ${MIN_INVOCATIONS})`);
  assert.deepEqual(offenders, [], 'a fenced command runs literally: without `node`/`python3` in front the model gets "permission denied" and burns a round-trip');
});

test('the scanner catches a bare path and accepts the interpreter, a read and a pipeline continuation', () => {
  const planted = [
    '```bash',
    '<super.x-base-dir>/scripts/run.cjs --flag',
    'node <super.x-base-dir>/scripts/run.cjs --flag',
    'python3 <super.x-base-dir>/scripts/helper.py list',
    'cat <super.x-base-dir>/scripts/run.cjs',
    '  | node scripts/other.cjs',
    'B=/some/dir/scripts/x.cjs',
    '```',
    '```json',
    'scripts/not-a-command.cjs',
    '```',
  ].join('\n');
  const { invocations, offenders } = scan(planted);
  assert.equal(offenders.length, 1, 'exactly the bare path is an offender');
  assert.match(offenders[0].text, /^<super\.x-base-dir>\/scripts\/run\.cjs/);
  assert.equal(invocations, 3, 'the bare path, the node call and the python call count; the read, the continuation, the assignment and the json fence do not');
});
