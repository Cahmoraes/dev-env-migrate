#!/usr/bin/env node
'use strict';

// build-task-dispatch.cjs — render the implementer, task-reviewer and final-reviewer prompts
// from their templates, resolve the model from the task's tier, write the prompt to a file and
// hand the controller a one-line pointer to send.
//
// Why a script: a real Copilot run (2026-09-22, gpt-5.6-luna controller, 7 tasks) sent all 18
// dispatches as 950-1,800-character paraphrases of the ~11-13 KB templates. None carried the
// index's `## Restrições Globais` (7 bullets; every reviewer was told "none"), no task reviewer
// received the PRD, and the rubric sections that carry no data — severity calibration, error
// handling, tests that assert nothing — never reached a reviewer. Eight reviews approved a
// branch an independent review found 4 Important defects in. The same failure already has this
// fix for QA and spec review (`build-*-dispatch.cjs`): the template
// is rendered in code, nothing is left for the controller to condense, and the prompt travels
// as a file behind `dispatch-pointer.cjs`'s pointer.
//
// Usage:
//   node build-task-dispatch.cjs --role implementer --tasks-index <idx> --task-number <N[,M]>
//        [--start] [--context <text>] [--findings-file <path>] [--escalate-to <tier> --escalation-reason <t>]
//   node build-task-dispatch.cjs --role reviewer --tasks-index <idx> --task-number <N[,M]>
//        [--base <sha>] [--head <sha>] [--findings-file <path>]
//   node build-task-dispatch.cjs --role final --tasks-index <idx> [--base <merge-base>] [--head <sha>]
//        [--description <text>]
//   node build-task-dispatch.cjs --role final-fix --tasks-index <idx> --findings-file <path> [--context <text>]
//   common: [--platform <name>] [--repo-root <path>] [--prompt-dir <dir>]
//
// Workspace: <repo>/.superpowers/sdd/<feature>/ (self-ignoring .gitignore), as upstream's
// sdd-workspace: prompts, the implementer's report file (`task-N-report.md`, its TDD evidence)
// and the reviewer's review package (`review-<b7>..<h7>.diff`: commits, stat, diff -U10) —
// the reviewer reads one file instead of crawling, and the package never enters the controller.
//
// `--start` (implementer, first dispatch of a task) also moves the task(s) to IN_PROGRESS through
// mark-task-status.cjs, which writes the ledger's `started (base <sha7>)` line: one controller call
// instead of two. The reviewer role refuses a range the reviewer cannot be handed (HEAD not on
// BASE's line; an empty range with auto_commit on) — the check a separate range script made in
// a separate call. The final role runs the same check over the branch's merge-base, which it
// derives itself when no --base is given: in S11's E-O3 the controller spent three calls
// (merge-base, a git log, the range script) before the final dispatch.
//
// `final-fix` renders the implementer template for the ONE fixer of the final review's findings:
// every task file as background, the index's spec and PRD, the task tier floored at standard, its
// own report file, and the ledger's `Final review: fix round R` line written here. In E-O3 the
// controller ran --help to find the flags, borrowed task 3's number (its report overwrote task
// 3's) and wrote the fix-round line by heredoc. A task's re-review (`--role reviewer
// --findings-file`) writes that task's `Task N: fix round R (…)` line the same way: a real run
// (2026-09-22) ran two task fix rounds and ledgered neither, so a resume could not tell a task
// mid-loop from one never reviewed.
//
// Output (stdout JSON, exit 0): { role, tasks, tier, model, description, promptFile, prompt,
//   reportFile, diffFile, base, head, started, warnings }. `prompt` is what the controller sends, unchanged.
// Refuses (exit 1, nothing on stdout) when a template token is left unfilled.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { loadPreferences } = require('../../super.using-superpowers/scripts/read-preferences.cjs');
const { resolveDispatchModel, resolveModelTiers } = require('../../super.using-superpowers/scripts/lib/model-tiers.cjs');
const { pointerPrompt } = require('../../super.using-superpowers/scripts/lib/dispatch-pointer.cjs');
const ledger = require('./lib/ledger.cjs');
const { markTaskStatus } = require('./mark-task-status.cjs');
const { parsePlan } = require('../../super.writing-plans/scripts/parse-plan.cjs');

const SDD = path.resolve(__dirname, '..');
const TEMPLATES = {
  implementer: path.join(SDD, 'agents', 'implementer.md'),
  reviewer: path.join(SDD, 'agents', 'task-reviewer.md'),
  final: path.resolve(SDD, '..', 'super.requesting-code-review', 'agents', 'code-reviewer.md'),
};
const TIER_RANK = { cheap: 0, standard: 1, capable: 2 };
const TIERS = Object.keys(TIER_RANK);

const HELP = `
build-task-dispatch.cjs — render an implementer / task-reviewer / final-reviewer / final-fixer dispatch.

  --role <implementer|reviewer|final|final-fix>   Required.
  --tasks-index <path>                  Required.
  --task-number <N[,M...]>              implementer/reviewer: the task, or a batch in index order.
  --start                               implementer: also mark the task(s) IN_PROGRESS (ledger
                                        "started" line) — the first dispatch of a task, never a fix round.
  --context <text>                      implementer: 1-3 lines the task file cannot know.
  --findings-file <path>                implementer: a fix round's findings; reviewer: a re-review's
                                        findings under verification; final-fix: required, the
                                        final review's Critical/Important findings, pooled.
  --base <sha>                          reviewer: default = the ledger's "started" base of the
                                        first task; final: default = merge-base of the default
                                        branch and HEAD.
  --head <sha>                          Default HEAD.
  --description <text>                  final: one paragraph on what was built.
  --escalate-to <standard|capable>      implementer: one tier above the task's tier...
  --escalation-reason <text>            ...with the reason (both or neither).
  --platform <name>                     Model-tier resolution. Default "other".
  --repo-root <path>                    Default: git toplevel of the index.
  --prompt-dir <dir>                    Default: a fresh temp dir.
`.trimStart();

function usage(message) {
  process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const flags = {
    '--role': 'role', '--tasks-index': 'tasksIndex', '--task-number': 'taskNumber',
    '--context': 'context', '--findings-file': 'findingsFile',
    '--base': 'base', '--head': 'head', '--description': 'description',
    '--escalate-to': 'escalateTo', '--escalation-reason': 'escalationReason',
    '--platform': 'platform', '--repo-root': 'repoRoot', '--prompt-dir': 'promptDir',
  };
  const opts = { platform: 'other' };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--start') { opts.start = true; continue; }
    const key = flags[args[i]];
    if (!key) usage(`Unknown argument: ${args[i]}`);
    if (args[i + 1] == null) usage(`${args[i]} requires a value`);
    opts[key] = args[++i];
  }
  if (!['implementer', 'reviewer', 'final', 'final-fix'].includes(opts.role)) usage('--role must be implementer, reviewer, final or final-fix');
  if (!opts.tasksIndex) usage('--tasks-index <path> is required');
  if (opts.role === 'implementer' || opts.role === 'reviewer') {
    if (!opts.taskNumber) usage(`--task-number is required for --role ${opts.role}`);
    opts.taskNumbers = opts.taskNumber.split(',').map((n) => Number.parseInt(n.trim(), 10));
    if (opts.taskNumbers.some((n) => !Number.isInteger(n))) usage('--task-number must be N or N,M,...');
  } else if (opts.taskNumber) {
    usage(`--role ${opts.role} covers the whole branch; it takes no --task-number`);
  }
  if (opts.role === 'final-fix' && !opts.findingsFile) usage('--role final-fix requires --findings-file (the final review\'s findings, pooled)');
  if (opts.start && opts.role !== 'implementer') usage('--start applies to --role implementer');
  if (opts.start && opts.findingsFile) usage('--start marks a task\'s first dispatch; a fix round (--findings-file) is already IN_PROGRESS');
  if (Boolean(opts.escalateTo) !== Boolean(opts.escalationReason)) usage('--escalate-to and --escalation-reason go together');
  if (opts.escalateTo && opts.role !== 'implementer') usage('--escalate-to applies to --role implementer (reviewers follow the task tier, the final review is always capable)');
  if (opts.escalateTo && !(opts.escalateTo in TIER_RANK)) usage('--escalate-to must be standard or capable');
  return opts;
}

function readOrUsage(file, what) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return usage(`cannot read ${what} ${file}: ${err.message}`);
  }
}

function gitIn(dir, ...args) {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ─── The plan on disk ────────────────────────────────────────────────────────

function indexTasks(indexContent) {
  const out = new Map();
  const re = /^-\s+\[[ xX]\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+\.md)`/gmu;
  let m;
  while ((m = re.exec(indexContent)) !== null) out.set(Number(m[1]), { title: m[2].trim(), file: m[3].trim() });
  return out;
}

/** Body of a `## <heading>` section (heading excluded), trimmed; null when absent. */
function sectionBody(content, headingRe) {
  const lines = content.split(/\r?\n/u);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/u.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').replace(/<!--[\s\S]*?-->/gu, '').trim();
  return body || null;
}

function headerField(content, name) {
  const m = content.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^`|`$/g, '').trim() : null;
}

function resolvePointer(taskFile, value) {
  if (!value || /^n\/?a$/i.test(value)) return 'N/A';
  return path.resolve(path.dirname(taskFile), value);
}

const DELIVERABLE_LINE = /^\s*[-*]\s+(?:Create|Modify|Test|Criar|Modificar|Teste|Testar)\s*(?:\([^)]*\))?\s*:\s*`([^`]+)`/iu;

function writeSet(content) {
  const body = sectionBody(content, /^##\s+(?:Arquivos|Files)\s*$/iu) || '';
  return body.split(/\r?\n/u).map((l) => l.match(DELIVERABLE_LINE)).filter(Boolean).map((m) => m[1].trim());
}

function loadTasks(indexPath, numbers) {
  const indexContent = readOrUsage(indexPath, 'tasks index');
  const entries = indexTasks(indexContent);
  const tasks = numbers.map((n) => {
    const entry = entries.get(n);
    if (!entry) usage(`task ${n} is not in ${indexPath}`);
    const file = path.resolve(path.dirname(indexPath), entry.file);
    const content = readOrUsage(file, 'task file');
    return {
      number: n,
      title: entry.title,
      file,
      tier: (headerField(content, 'Tier') || '').toLowerCase() || null,
      spec: resolvePointer(file, headerField(content, 'Spec')),
      prd: resolvePointer(file, headerField(content, 'PRD')),
      writeSet: writeSet(content),
    };
  });
  return { indexContent, tasks };
}

/** Absent `**Tier:**` → parse-plan.cjs's suggestedTier (the SKILL.md rule), else standard. */
function suggestedTiers(indexPath) {
  try {
    return new Map(parsePlan(indexPath).tasks.map((t) => [t.number, t.suggestedTier]));
  } catch {
    return new Map();
  }
}

function taskTier(tasks, indexPath) {
  let suggested = null;
  let best = null;
  for (const t of tasks) {
    let tier = TIERS.includes(t.tier) ? t.tier : null;
    if (!tier) {
      suggested = suggested || suggestedTiers(indexPath);
      tier = TIERS.includes(suggested.get(t.number)) ? suggested.get(t.number) : 'standard';
    }
    if (!best || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function templateBlock(file) {
  const md = readOrUsage(file, 'template');
  const m = md.match(/^```(?:yaml)?\n(Subagent[\s\S]*?)\n^```$/m);
  if (!m) usage(`${file} has no column-0 \`Subagent\` fenced block`);
  return m[1];
}

/** Replace a token; continuation lines of a multi-line value take the token's column. */
function fill(text, token, value) {
  return text.split('\n').map((line) => {
    if (!line.includes(token)) return line;
    const pad = ' '.repeat(line.indexOf(token));
    const indented = String(value).split('\n').map((l, i) => (i === 0 || !l ? l : pad + l)).join('\n');
    return line.split(token).join(indented);
  }).join('\n');
}

function setModel(block, model) {
  if (/^  model: \[/m.test(block)) return block.replace(/^  model: \[[\s\S]*?\]$/m, `  model: ${model}`);
  return block.replace(/^(  description: .*)$/m, `$1\n  model: ${model}`);
}

/** The `prompt: |` scalar, dedented by its 4-space indent; blank lines runs collapsed to one. */
function promptBody(block) {
  const lines = block.split('\n');
  const at = lines.findIndex((l) => l === '  prompt: |');
  if (at === -1) usage('template block has no `  prompt: |` line');
  const body = lines.slice(at + 1).map((l) => (l.startsWith('    ') ? l.slice(4) : l.trim())).join('\n');
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

function descriptionOf(block) {
  const m = block.match(/^  description: "(.*)"$/m);
  return m ? m[1] : null;
}

function render(role, fills, model) {
  let block = templateBlock(TEMPLATES[role]);
  const tokens = new Set(block.match(/\{[A-Z_]+\}/g) || []);
  block = setModel(block, model);
  for (const [token, value] of Object.entries(fills)) block = fill(block, token, value);
  block = block.replace(/<(super\.[a-z-]+)-base-dir>/g, (_m, name) => path.resolve(SDD, '..', name));
  const values = Object.values(fills).join('\n');
  const left = [...tokens].filter((t) => block.includes(t) && !values.includes(t));
  if (left.length) usage(`rendered ${role} prompt still has unfilled placeholders: ${left.join(', ')}`);
  if (/<super\.[a-z-]+-base-dir>/.test(block)) usage('rendered prompt still has a <super.X-base-dir> token');
  return { description: descriptionOf(block), body: promptBody(block) };
}

function label(tasks) {
  if (tasks.length === 1) return `Task ${tasks[0].number}: ${tasks[0].title}`;
  return `Tasks ${tasks.map((t) => t.number).join(', ')}: ${tasks.map((t) => t.title).join(' · ')}`;
}

const list = (items) => items.join('\n');

// ─── Workspace and review package ────────────────────────────────────────────

function workspaceFor(repoRoot, plansDir) {
  return ledger.ensureWorkspace(ledger.workspacePathFor(repoRoot, plansDir));
}

function gitOrUsage(repoRoot, args, what) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    return usage(`${what}: ${String(err.stderr || err.message).trim()}`);
  }
}

/**
 * Commits, stat and the net diff with 10 lines of context, in one file the reviewer reads once.
 * BASE = HEAD (auto_commit: false) reviews the working tree against BASE, untracked files listed.
 * A range whose HEAD does not descend from BASE, or an empty range with commits expected, is a
 * STOP: the reviewer would approve work that is somewhere else.
 */
function checkRange(repoRoot, base, head, autoCommit) {
  // Both ends in one spawn; only a failure re-resolves them one by one, for the message naming the bad end.
  // Two full shas (the final review's merge-base and HEAD) skip it: rev-parse echoes a full sha unchecked.
  const isSha = (ref) => /^[0-9a-f]{40,64}$/.test(ref);
  const both = isSha(base) && isSha(head) ? [base, head] : (gitIn(repoRoot, 'rev-parse', base, head) || '').split('\n');
  const [b, h] = both.length === 2 && both.every(isSha) ? both
    : [gitOrUsage(repoRoot, ['rev-parse', base], `bad BASE ${base}`).trim(), gitOrUsage(repoRoot, ['rev-parse', head], `bad HEAD ${head}`).trim()];
  if (b === h && autoCommit) {
    usage(`BASE..HEAD is empty (${b.slice(0, 7)}) with auto_commit on — the implementer committed elsewhere or not at all; find the work before reviewing`);
  }
  if (b !== h) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', b, h], { cwd: repoRoot, stdio: 'ignore' });
    } catch {
      usage(`HEAD ${h.slice(0, 7)} does not descend from BASE ${b.slice(0, 7)} — find where the task's commits went before reviewing`);
    }
  }
  return { b, h };
}

/** The local default branch (origin/HEAD's name, else main/master) — never a bare remote ref. */
function defaultBranch(repoRoot) {
  const remote = gitIn(repoRoot, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  const candidates = [remote && remote.replace(/^origin\//, ''), remote, 'main', 'master'].filter(Boolean);
  const fullName = (ref) => (ref === remote ? `refs/remotes/${ref}` : `refs/heads/${ref}`);
  // Every candidate checked in one spawn; patterns also match refs below them, so names are exact-matched.
  const present = new Set((gitIn(repoRoot, 'for-each-ref', '--format=%(refname)', ...candidates.map(fullName)) || '').split('\n'));
  return candidates.find((ref) => present.has(fullName(ref))) || null;
}

/**
 * `git diff --stat` and `git diff -U10` of `range` in one spawn: `--stat -p` prints the stat, a
 * blank line, then the patch, whose first file opens with `diff --git`. Output that does not have
 * that shape (an external diff driver) falls back to the two spawns.
 */
function statAndDiff(repoRoot, range) {
  const both = gitOrUsage(repoRoot, ['diff', '--stat', '-p', '-U10', range], 'git diff');
  if (!both) return { stat: '', diff: '' };
  const at = both.indexOf('\ndiff --git ');
  if (at !== -1 && both[at - 1] === '\n') return { stat: both.slice(0, at), diff: both.slice(at + 1) };
  return { stat: gitOrUsage(repoRoot, ['diff', '--stat', range], 'git diff'), diff: gitOrUsage(repoRoot, ['diff', '-U10', range], 'git diff') };
}

function reviewPackage(repoRoot, base, head, dir, autoCommit) {
  const { b, h } = checkRange(repoRoot, base, head, autoCommit);
  let body;
  if (b === h) {
    const { stat, diff } = statAndDiff(repoRoot, b);
    body = ['# Review package: working tree vs ' + b.slice(0, 7), '', '## Files changed', stat,
      '## Untracked', gitOrUsage(repoRoot, ['ls-files', '--others', '--exclude-standard'], 'git ls-files'), '## Diff', diff].join('\n');
  } else {
    const { stat, diff } = statAndDiff(repoRoot, `${b}..${h}`);
    body = [`# Review package: ${b.slice(0, 7)}..${h.slice(0, 7)}`, '', '## Commits', gitOrUsage(repoRoot, ['log', '--oneline', `${b}..${h}`], 'git log'),
      '## Files changed', stat, '## Diff', diff].join('\n');
  }
  const file = path.join(dir, `review-${b.slice(0, 7)}..${h.slice(0, 7)}.diff`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  const indexPath = path.resolve(opts.tasksIndex);
  const plansDir = path.dirname(indexPath);
  const facts = opts.repoRoot && opts.head ? {} : ledger.gitFacts(opts.repoRoot ? path.resolve(opts.repoRoot) : plansDir);
  const repoRoot = opts.repoRoot ? path.resolve(opts.repoRoot) : facts.root || process.cwd();
  const { result } = loadPreferences(repoRoot);
  const preferences = result.preferences;
  const warnings = [];
  const ledgerFile = ledger.ledgerPathFor(plansDir, repoRoot);
  const ledgerContent = ledger.readLedger(ledgerFile);
  const head = opts.head || (facts.root ? facts.head : gitIn(repoRoot, 'rev-parse', 'HEAD'));

  let tasks = [];
  let indexContent;
  if (opts.role === 'final') {
    indexContent = readOrUsage(indexPath, 'tasks index');
  } else if (opts.role === 'final-fix') {
    ({ indexContent, tasks } = loadTasks(indexPath, [...indexTasks(readOrUsage(indexPath, 'tasks index')).keys()]));
  } else {
    ({ indexContent, tasks } = loadTasks(indexPath, opts.taskNumbers));
  }

  // Tier: implementer = the task's tier (escalated one rung with a reason); reviewer = the
  // task's tier floored at standard; final = capable, always; final-fix = the highest task tier,
  // floored at standard (its findings span tasks).
  let tier;
  if (opts.role === 'final') tier = 'capable';
  else {
    tier = taskTier(tasks, indexPath);
    if ((opts.role === 'reviewer' || opts.role === 'final-fix') && TIER_RANK[tier] < TIER_RANK.standard) tier = 'standard';
    if (opts.escalateTo) {
      if (TIER_RANK[opts.escalateTo] !== TIER_RANK[tier] + 1) usage(`--escalate-to ${opts.escalateTo} must be exactly one tier above ${tier}`);
      tier = opts.escalateTo;
    }
  }
  const { resolved } = resolveModelTiers(preferences.model_tiers, opts.platform);
  const model = resolveDispatchModel(resolved[tier], tier, opts.platform);
  if (tier === 'capable' && resolved.capable && resolved.capable === resolved.standard) {
    warnings.push(`model_tiers maps capable and standard to the same model (${resolved.capable}): the ${opts.role === 'final' ? 'final whole-branch review' : 'capable tier'} runs one rung lower than the policy intends.`);
  }

  const first = tasks[0] || {};
  const wholeBranch = opts.role === 'final' || opts.role === 'final-fix';
  const spec = wholeBranch ? resolvePointer(indexPath, headerField(indexContent, 'Spec')) : first.spec || 'N/A';
  const prd = wholeBranch ? resolvePointer(indexPath, headerField(indexContent, 'PRD')) : first.prd || 'N/A';
  const autoCommit = Boolean(preferences.workflow && preferences.workflow.auto_commit);
  const fixRound = opts.role === 'final-fix' ? 1 + Math.max(0, ...((ledgerContent || '').match(/^Final review: fix round (\d+)/gmu) || []).map((l) => Number(l.match(/\d+/)[0]))) : null;
  const globalConstraints = sectionBody(indexContent, /^##\s+Restri[çc][õo]es Globais\s*$/iu) || 'none';
  const findings = opts.findingsFile ? readOrUsage(opts.findingsFile, 'findings file').trim() : '';

  const workspace = workspaceFor(repoRoot, plansDir);
  let reportFile = null;
  if (opts.role === 'final-fix') reportFile = path.join(workspace, `final-fix-${fixRound}-report.md`);
  else if (tasks.length) reportFile = path.join(workspace, `task-${tasks.map((t) => t.number).join('-')}-report.md`);
  let diffFile = null;
  let rendered;
  let base = null;
  if (opts.role === 'implementer' || opts.role === 'final-fix') {
    const fixer = opts.role === 'final-fix';
    rendered = render('implementer', {
      '{TASK_LABEL}': fixer ? `the final review's fix round ${fixRound} (whole branch)` : label(tasks),
      '{TASK_FILES}': list(tasks.map((t) => t.file)),
      '{SPEC_PATH}': spec,
      '{PRD_PATH}': prd,
      '{CONTEXT}': [
        fixer ? 'Whole-branch fix round after the final code review: the findings below span tasks, and the task files above are background for them. Fix them on the integrated branch — one test per finding that fails first, then the full suite.' : '',
        (opts.context || '').trim(),
      ].filter(Boolean).join('\n') || 'None beyond the task file.',
      '{REVIEW_FINDINGS}': findings
        ? `## Review Findings to Address (fix re-dispatch only)\n\nFix every Critical/Important finding below and nothing else: do not broaden scope, do not re-architect. Re-read only the code the findings cite. If a finding is wrong or unclear, push back with reasoning instead of complying blindly.\n\n${findings}`
        : '',
      '{AUTO_COMMIT}': String(autoCommit),
      '{WORK_DIR}': repoRoot,
      '{REPORT_FILE}': reportFile,
    }, model);
  } else if (opts.role === 'reviewer') {
    base = opts.base || ledger.lastStartedBase(ledgerContent, tasks[0].number);
    if (!base) usage(`no --base and no "Task ${tasks[0].number}: started" line in the ledger — pass the commit the task started from`);
    diffFile = reviewPackage(repoRoot, base, head, workspace, autoCommit);
    rendered = render('reviewer', {
      '{TASK_LABEL}': label(tasks),
      '{TASK_FILES}': list(tasks.map((t) => t.file)),
      '{SPEC_PATH}': spec,
      '{PRD_PATH}': prd,
      '{GLOBAL_CONSTRAINTS}': globalConstraints,
      '{FINDINGS_UNDER_VERIFICATION}': findings
        ? `## Findings under verification\n\nThis is a scoped re-review of one fix round (BASE is the head the previous review saw). Verdict every finding below and inspect the fix diff for new breakage; do not re-review code the fix did not touch. Anything you notice outside the fix diff goes on an \`Out-of-scope:\` line — the controller ledgers it for the final review; it never extends this loop.\n\n${findings}`
        : '',
      '{REPORT_FILE}': reportFile,
      '{DIFF_FILE}': diffFile,
      '{BASE_SHA}': base,
      '{HEAD_SHA}': head,
      '{WRITE_SET}': list(tasks.flatMap((t) => t.writeSet)) || 'not declared',
    }, model);
  } else {
    base = opts.base;
    if (!base) {
      const branch = defaultBranch(repoRoot);
      base = branch && gitIn(repoRoot, 'merge-base', branch, head);
      if (!base) usage('no --base and no default branch (origin/HEAD, main, master) to take the merge-base from — pass the commit the branch started from');
    }
    checkRange(repoRoot, base, head, autoCommit);
    const deferred = (ledgerContent || '').split(/\r?\n/u).filter((l) => /^Task \d+: (?:minor \(deferred\):|unverified:|declined:|parked )/u.test(l));
    const focus = sectionBody(indexContent, /^##\s+(?:Foco de Revis[ãa]o|Review Focus)\s*$/iu);
    rendered = render('final', {
      '{DESCRIPTION}': (opts.description || '').trim() || `The whole branch implementing ${indexPath}.`,
      '{PLAN_OR_REQUIREMENTS}': [
        `- Tasks index: ${indexPath} (each task file it lists is one task's requirements)`,
        `- Design spec: ${spec}`,
        `- PRD: ${prd} — the user stories and FR-XXX requirements; where a task file contradicts the PRD or the spec, they win.`,
        spec !== 'N/A' ? '- Spec coverage: map every `AC-NN`/`INV-NN` of the spec to a test that asserts it with the spec\'s value (`file:line`). An AC/INV with no asserting test, or asserted with another value, is an Important finding.' : '',
      ].filter(Boolean).join('\n'),
      '{GLOBAL_CONSTRAINTS}': `## Global constraints\n\n${globalConstraints}`,
      '{REVIEW_FOCUS}': focus ? `## Review Focus — check each line deliberately; report it under Issues or Declined to judge\n\n${focus}` : '',
      '{DEFERRED_MINORS}': deferred.length ? `## Deferred by the per-task reviews — triage the minors, verify the unverified items, judge each declined behavior, see both sides of every parked finding\n\n${list(deferred)}` : '',
      '{BASE_SHA}': base,
      '{HEAD_SHA}': head,
      '{WRITE_SET}': 'none — this is the whole-branch review, so this attribution note does not apply',
    }, model);
  }

  const promptDir = opts.promptDir ? path.resolve(opts.promptDir) : workspace;
  fs.mkdirSync(promptDir, { recursive: true });
  let stem;
  if (opts.role === 'final') stem = 'final-review';
  else if (opts.role === 'final-fix') stem = `final-fix-${fixRound}`;
  else stem = `task-${tasks.map((t) => t.number).join('-')}-${opts.role}${findings ? '-fix' : ''}`;
  let promptFile = path.join(promptDir, `${stem}.md`);
  for (let i = 2; fs.existsSync(promptFile); i += 1) promptFile = path.join(promptDir, `${stem}-${i}.md`);
  fs.writeFileSync(promptFile, `${rendered.body}\n`, 'utf8');

  // The proof sdd-finish.cjs requires before it deletes the workspace: a real run (2026-09-22)
  // read `review_final: false` as "no final review" and went straight to the finish.
  if (opts.role === 'final') ledger.appendLine(ledgerFile, `Final review: dispatched (range ${base.slice(0, 7)}..${head.slice(0, 7)})`);
  if (opts.role === 'final-fix') {
    ledger.appendLine(ledgerFile, `Final review: fix round ${fixRound} (findings: ${path.basename(opts.findingsFile)})`);
    if (fixRound > 2) warnings.push(`final review fix round ${fixRound}: a finding that survived ~2 rounds is the cap — route it to super.systematic-debugging or escalate, never loop (final-stage.md, gate 1).`);
  }

  // A re-review closes a task's fix round: its line goes in now, when the fix commits exist.
  let taskRound = null;
  if (opts.role === 'reviewer' && findings) {
    for (const t of tasks) {
      taskRound = ledger.lastFixRound(ledgerContent, t.number) + 1;
      ledger.appendLine(ledgerFile, ledger.fixRoundLine(t.number, taskRound, opts.findingsFile, base, head));
    }
    if (taskRound >= 3) warnings.push(`task fix round ${taskRound}: a reviewer still rejecting after this re-review is the ~3-round bound — treat it as BLOCKED, never another identical round (execution-loop.md, "Review loop bounds").`);
  }

  // Marked after the prompt rendered: a refused render leaves the task PENDING, as it was.
  let started = null;
  if (opts.start) {
    try {
      ({ out: started } = markTaskStatus({ taskFile: null, status: 'IN_PROGRESS', tasksIndex: indexPath, taskNumbers: tasks.map((t) => t.number), verify: null, note: null }));
    } catch (err) {
      usage(`--start: mark-task-status failed: ${String(err.message).trim()}`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    role: opts.role,
    tasks: tasks.map((t) => t.number),
    round: fixRound ?? taskRound,
    tier,
    model,
    escalated: Boolean(opts.escalateTo),
    escalationReason: opts.escalationReason || null,
    description: rendered.description,
    promptFile,
    prompt: pointerPrompt(promptFile),
    reportFile,
    diffFile,
    base,
    head,
    started,
    warnings,
  }, null, 2)}\n`);
}

main();
