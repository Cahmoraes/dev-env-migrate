'use strict';

/**
 * retired-vocabulary.test.cjs — vocabulary that no shipped artifact may carry any more. One
 * walk, one floor, one planted-token proof, for every removal or rename whose leftovers would
 * send a consumer after something that no longer exists.
 *
 * 1. The vector-memory mechanism (2026-08-11). What was removed and why: recall used to mean a local SQLite store (`.memory/memory.db`),
 * a manifest of what had been ingested (`resync-manifest.json`), a `pmem` CLI over an
 * embedding model, and three consent gates to repair the three ways that store could go
 * stale. Measured against the artifacts it indexed, the store held zero exclusive
 * information — every note was derived from a versioned file still on disk — while costing
 * ~80s of critical path and ~30k tokens per brainstorming. Recall now derives from
 * `docs/superpowers/` at call time (`super.brainstorming/scripts/feature-index.cjs`), so
 * there is no store, no sync and no gate.
 *
 * 2. The `claude_code.code_review_final` / `code_review_effort` preference keys (2026-09-05),
 * renamed to `review_final` / `review_effort` so the section mirrors `copilot.review_final`.
 * There is no alias for the old names — consumers regenerate their preferences.yml, and the
 * loader drops the old key like any unknown one — so one onboarding line still saying "record
 * the answer as claude_code.code_review_final" would make the wizard write a key the reader no
 * longer knows, and the extra review pass would never run, in silence. The `session_*`
 * variables are NOT renamed (they name the /code-review skill, not the key): the pattern
 * excludes that prefix.
 *
 * Why a sweep and not a diff: a removal this wide fails by REMAINDER. One surviving line —
 * a `pmem search` in a prompt template, a `session_memory_enabled` branch in a gate, a
 * mention of `.memory/` in the preferences template — sends a controller after a script
 * that no longer exists, and the measured behaviour there is not an error message: it is a
 * silent skip (see cross-skill-base-dir.test.cjs for the transcript). Enumerating the
 * tokens is what turns "we think we got them all" into something a commit can prove.
 *
 * Scope: everything a consumer can be instructed by — SKILL.md, references/, template/,
 * assets/, agents/ and the runtime scripts. `__tests__/` is deliberately OUT: the retired
 * names legitimately survive there, as fixtures asserting a legacy `memory:` key is
 * ignored and as the recorded reason a guard changed shape.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/retired-vocabulary.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

/**
 * Anti-staleness floor. A sweep whose walk stops matching reports zero violations over zero
 * files and passes forever — the failure mode every registry in this suite guards against.
 * Set below the real count with room for normal churn; it exists to catch a walk that broke,
 * not to pin the file count.
 */
const MIN_FILES_SWEPT = 150;

const SWEPT_EXTENSIONS = new Set(['.md', '.mmd', '.cjs', '.js', '.mjs', '.py', '.sh', '.yaml', '.yml', '.html', '.txt']);
const SKIPPED_DIRS = new Set(['__tests__', '__pycache__', 'node_modules']);

/**
 * The retired vocabulary. A string entry matches as a substring; a RegExp entry matches the
 * line. Each token only ever meant the thing that was removed, so a match is a leftover
 * rather than a coincidence — `memory` on its own is NOT here, because human memory, session
 * memory and in-process caches are ordinary words this codebase uses correctly.
 */
const RETIRED = [
  // 6. super.independent-verification (2026-10-11): the Verifier gate at the end of the flow, its
  //    report checker, its lessons store and its session variable. Mutation now runs per task, as
  //    the MUTATE step of super.test-driven-development. No shim survives either: an old
  //    preferences.yml carrying the key is dropped like any unknown key (deepMerge iterates
  //    the DEFAULTS), so nothing shipped needs to name it.
  { token: /independent[-_ ]verification|Independent Verification|[Vv]erificação independente/,
    what: 'the removed independent-verification gate and its preference' },
  { token: /check-verification-report|build-verifier-dispatch|verification-report\.md|validation-<feature>|\bIV report\b|\{IV_REPORT\}/,
    what: 'the removed Verifier dispatch and its report' },
  { token: /lessons\.py/, what: 'the removed lessons store' },
  // 5. the complexity-tier classifier (2026-09-24): assess-complexity.cjs, the complexity-interpreter
  //    subagent, checkpoints 0-3, consentGates and the Micro/Small/Medium/Large/Complex tiers,
  //    replaced by three paths (spike / bounded / architectural) announced in prose, with every
  //    size decision taken at the gate that holds the real data (the plan's task count, the
  //    interview tree). Mined sessions: the binding checkpoints never moved a feature off the
  //    planned pipeline, and the interpreter was skipped in half of them.
  { token: /assess-complexity|complexity-interpreter|complexity-checkpoints|tier-checkpoints|triage-sizing|complex-path\.md/,
    what: 'the removed complexity classifier and its references' },
  { token: /inline-path\.md/, what: 'the reference renamed to bounded-path.md' },
  { token: /--feature-tier|featureTier|feature tier|consentGates|--prior-tier|--allow-deescalation/, what: 'the removed tier flags and fields' },
  { token: /\b[Cc]heckpoint [0-3]\b/, what: 'the removed complexity checkpoints' },
  { token: /\bMicro\/Small\b|\bMedium\/Large\b|\bLarge\/Complex\b|\b(Micro|Small|Medium|Large|Complex) tier\b|\btier (Micro|Small|Medium|Large|Complex)\b/,
    what: 'the removed pipeline tiers' },
  // 4. the parallel execution modes and their wave machinery (2026-08 and 2026-09-21):
  //    super.parallel-subagent-development (one worktree per task) and
  //    super.parallel-subagent-in-tree (waves in one working tree), parse-waves.cjs,
  //    check-wave-disjoint.cjs, the `## Ondas` plan section, the 0/1/2 execution gate and the
  //    computed review shape. The gate is now 0/1/3 (deep review / subagent-driven / --single),
  //    the plan has no waves, and the only concurrency left is the fan-out of read-only
  //    research, review-lens and QA subagents — which keep their own vocabulary ("in waves of
  //    up to 3" for QA stories is a dispatch cadence, not an execution mode, and is not here).
  { token: /parallel-subagent-(development|in-tree)/, what: 'the removed parallel execution skills' },
  { token: 'parse-waves', what: 'the renamed parser (now parse-plan.cjs)' },
  { token: 'check-wave-disjoint', what: 'the removed wave pre-flight' },
  { token: '## Ondas', what: 'the removed plan section' },
  { token: /executionRecommendation|decisionRequired|safeForInTreeParallel/, what: 'the removed wave-election fields of the plan parser' },
  { token: /barrier\.cjs/, what: 'the removed in-tree integration barrier' },
  { token: /^##\s+Execution Waves/, what: 'the removed plan section (en)' },
  { token: /reviewShape|reviewSignals/, what: 'the removed computed review shape' },
  //    One task reviewer per task, always: the spec-then-quality pair and its templates are gone.
  //    super.reviewing-specs/agents/spec-reviewer.md is a different template (it reviews a spec
  //    DOCUMENT) and stays; inside the SDD a bare `./agents/spec-reviewer.md` can only mean the
  //    deleted one, hence the `only` scope.
  { token: /two-stage (review|shape)|combined-reviewer\.md/, what: 'the removed split task reviewer' },
  { token: /subagent-driven-development\/agents\/(spec|code-quality)-reviewer\.md/, what: 'the deleted SDD reviewer templates' },
  { token: /\.\/agents\/(spec|code-quality)-reviewer\.md/, only: 'super.subagent-driven-development/',
    what: 'the deleted SDD reviewer templates (relative)' },
  { token: /\b2 parallel\b|\b2 paralelo\b|0 ?\/ ?1 ?\/ ?2\b/, what: 'the pre-removal 0/1/2 execution gate' },
  { token: /wave planning|wave structure|with waves\b|before every wave|in-tree mode|parallel sibling|parallel execution modes?/i,
    what: 'wave / parallel-mode phrasing of the execution pipeline' },
  //    "fan-out" as a name for the EXECUTION is the same removal by another word: tasks are run
  //    one dispatch at a time, sequentially, so there is no fan. The patterns are deliberately
  //    narrow — they need the execution anchored on the same line (the skill's own name, "per
  //    task", "completo", "caro") — because the fan-outs that REMAIN are all read-only and keep
  //    the word: the brainstorming research tracks, the reviewing-specs lenses, the QA story
  //    verifiers and super.dispatching-parallel-agents. "full fan-out" is one of those (the
  //    interview's research pass) and is not here.
  { token: /subagent-driven-development['\u2019`]?s?[`\s]+fan-?out/i,
    what: 'the execution skill described as a fan-out' },
  { token: /per-task[^\n]{0,60}fan-?out|fan-?out (por|per) task/i,
    what: 'per-task fan-out phrasing of the sequential dispatch loop' },
  { token: /fan-?out (caro|completo)\b|expensive fan-?out|costly fan-?out/i,
    what: 'the "expensive fan-out" framing of the execution stage' },
  // 2. the renamed review keys — `session_code_review_*` is a different name and stays
  { token: /(?<!session_)code_review_(final|effort)/, what: 'the pre-rename claude_code.review_final / review_effort keys' },
  // 1. the vector-memory mechanism
  { token: 'pmem', what: 'the memory CLI' },
  { token: 'super.persistent-memory', what: 'the removed skill' },
  { token: 'persistent_memory', what: 'the removed preference key' },
  { token: 'session_memory_enabled', what: 'the removed session variable' },
  { token: 'session_resync_completed', what: 'the removed session latch' },
  { token: 'resync-manifest', what: 'the removed manifest file' },
  { token: 'memory.db', what: 'the removed database' },
  { token: 'check-resync.cjs', what: 'the removed dirty probe' },
  { token: 'compute-inventory.cjs', what: 'the removed inventory script' },
  { token: 'update-manifest.cjs', what: 'the removed manifest writer' },
  { token: 'verify-sync.cjs', what: 'the removed sync audit' },
  { token: 'artifact-sync', what: 'the removed pmem source namespace' },
  { token: 'GateResync', what: 'the removed state-diagram gate' },
  { token: 'Memory Re-Sync', what: 'the removed entry gate' },
];

function sweptFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(abs, relPath); continue; }
      if (SWEPT_EXTENSIONS.has(path.extname(entry.name))) out.push({ abs, rel: relPath });
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    walk(path.join(SKILLS, skill), skill);
  }
  return out;
}

function violationsIn(files) {
  const found = [];
  for (const file of files) {
    const body = fs.readFileSync(file.abs, 'utf8');
    body.split('\n').forEach((line, i) => {
      for (const { token, what, only } of RETIRED) {
        if (only && !file.rel.startsWith(only)) continue;
        const hit = token instanceof RegExp ? token.test(line) : line.includes(token);
        if (hit) found.push(`${file.rel}:${i + 1}: ${token instanceof RegExp ? token.source : token} (${what})`);
      }
    });
  }
  return found;
}

test('no shipped artifact still carries retired vocabulary', () => {
  const files = sweptFiles();
  assert.ok(
    files.length >= MIN_FILES_SWEPT,
    `the sweep only reached ${files.length} files (floor ${MIN_FILES_SWEPT}) — the walk is broken, `
    + 'and a sweep over nothing passes forever',
  );
  assert.deepEqual(
    violationsIn(files),
    [],
    'these lines still name something that was removed or renamed. Nothing is behind them, '
    + 'and a controller that follows one skips the step in silence rather than erroring. Recall '
    + 'is super.brainstorming/scripts/feature-index.cjs, run by a subagent, with nothing to sync; '
    + 'the review preference is claude_code.review_final / review_effort.',
  );
});

test('the sweep really reads the files — a planted token is caught', () => {
  // Without this, a walk that silently returned unreadable/empty bodies would pass the
  // check above while proving nothing. Plants in a temp file rather than the tree so a
  // crashed run cannot leave a mutation behind.
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'retired-sweep-'));
  const abs = path.join(dir, 'planted.md');
  try {
    fs.writeFileSync(abs,
      'Run `pmem search "<feature>"` before dispatching.\n'
      + 'Record it as `claude_code.code_review_final`.\n'
      + 'Then check `session_code_review_final_enabled`.\n'
      + 'QA stories go out in waves of up to 3.\n'
      + 'Open the gate (0 deep review / 1 sequential / 2 parallel).\n'
      + 'Large pays the per-task fan-out.\n'
      + 'The plan is a fan-out completo por task.\n'
      + 'Research runs the full fan-out of three tracks.\n');
    const found = violationsIn([{ abs, rel: 'planted.md' }]);
    assert.equal(found.length, 5, 'the pmem line, the old key line, the 0/1/2 gate and the two execution-fan-out lines are reported; the session_* line, the QA cadence and the research fan-out are not');
    assert.match(found[2], /planted\.md:5: .*2 parallel/);
    assert.match(found[0], /planted\.md:1: pmem/);
    assert.match(found[1], /planted\.md:2: .*code_review_/);
    assert.match(found[3], /planted\.md:6: .*per-task/);
    assert.match(found[4], /planted\.md:7: .*caro\|completo/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a scoped token only fires inside its skill — the spec-document reviewer stays legal', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'retired-sweep-'));
  const abs = path.join(dir, 'planted.md');
  try {
    fs.writeFileSync(abs,
      'Dispatch `./agents/spec-reviewer.md` for the spec document.\n'
      + 'See super.reviewing-specs/agents/spec-reviewer.md.\n');
    assert.deepEqual(violationsIn([{ abs, rel: 'super.reviewing-specs/SKILL.md' }]), [],
      'reviewing-specs owns a spec-reviewer.md of its own');
    const inSdd = violationsIn([{ abs, rel: 'super.subagent-driven-development/SKILL.md' }]);
    assert.equal(inSdd.length, 1, 'inside the SDD the relative pointer can only mean the deleted template');
    assert.match(inSdd[0], /SKILL\.md:1: /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the replacement is installed where the removed recall used to be dispatched', () => {
  // The sweep proves the old mechanism is gone; on its own that is also what deleting the
  // feature outright would look like. This is the other half: the recall step still exists,
  // in the skill that owns it, with a script behind it.
  const script = path.join(SKILLS, 'super.brainstorming', 'scripts', 'feature-index.cjs');
  assert.ok(fs.existsSync(script), 'feature-index.cjs must ship with super.brainstorming');

  const fanOut = fs.readFileSync(
    path.join(SKILLS, 'super.brainstorming', 'references', 'research-fan-out.md'), 'utf8',
  );
  assert.match(fanOut, /feature-index\.cjs/, 'the fan-out reference must still name the index script');

  // Where it runs is the part that moved. The first shape of the replacement read the index
  // inline "because it is already in hand"; a measured session then showed the inline index
  // is what invites the inline deep read that follows it. Recall — index, selection and
  // artifacts — is now one dispatched track. What must NOT come back is a store to sync;
  // that is what the sweep above covers, and it is orthogonal to where the read happens.
  const table = fanOut.slice(fanOut.indexOf('| Subagent | When | Agent type |'), fanOut.indexOf('**Project constitution'));
  assert.ok(table.length > 0, 'the fan-out must still carry its dispatch table');
  assert.match(table, /\*\*Feature history recall\*\*/,
    'recall must be a dispatched track — see super.brainstorming feature-history-recall.test.cjs');

  // The derived-on-demand property is the one the removal bought, and it is easy to lose
  // by re-introducing a cached index file. Pin the claim, not just the script name.
  assert.match(fanOut, /derives the index from `docs\/superpowers\/` at the moment of the call/,
    'the no-store property must stay written down — it is why there is no re-sync gate');
});
