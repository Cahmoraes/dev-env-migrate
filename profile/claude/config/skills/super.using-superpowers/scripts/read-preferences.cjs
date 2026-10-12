#!/usr/bin/env node
/**
 * read-preferences.js — Read .superpowers/preferences.yml from the repository root.
 *
 * Usage:
 *   node scripts/read-preferences.cjs [--repo-root <path>]
 *
 * Root resolution (in order):
 *   1. --repo-root flag
 *   2. working-tree root of cwd (in-process walk; same answer as --show-toplevel)
 *   3. If not in a git repo → return {found: false, repo_not_found: true}
 *
 * Then, ONLY if no preferences.yml exists at that root and the root is a LINKED
 * WORKTREE: retry in the main working tree. `.superpowers/` is gitignored, so
 * `git worktree add` leaves a tree without it, and `super.using-git-worktrees` runs a
 * session inside one. A worktree carrying its own file still wins.
 *
 * Exit codes:
 *   0 — success (including "file not found" or "not a git repo")
 *   1 — usage error or unrecoverable runtime failure
 *
 * Output (stdout): JSON
 * Diagnostics (stderr): warnings only
 *
 * Also usable as a module: `require('./read-preferences.cjs')` exports
 * { DEFAULTS, deepMerge, parseYaml, detectGitRoot } so write-preferences.cjs can
 * validate a rendered file against the exact same parser (round-trip safety).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { detectRepoRoot, mainRepoRoot } = require('./lib/repo-root.cjs');

const HELP = `
read-preferences.js — Read .superpowers/preferences.yml from the repository root.

Usage:
  node scripts/read-preferences.cjs [--repo-root <path>]

Options:
  --repo-root <path>  Explicit path to the repository root (overrides git detection)
  --help              Show this help text and exit 0

Output (JSON to stdout): { found, repo_not_found, malformed, preferencesPath, preferences, projectDeclared }
where projectDeclared says whether the file HAS a project: section (found:true with every
project.* null means an older file — run only the project step of the wizard), and
preferences merges file values over defaults:
  workflow.auto_commit (true),
    workflow.qa_gate (true; true/ask/false — true runs the end-of-implementation QA gate
      automatically when a PRD exists; ask asks once at the gate, only when a PRD exists;
      false skips it silently),
    workflow.visual_companion (true; when false super.brainstorming never offers the browser companion),
    workflow.finish_action ("ask"; ask/merge/pr/keep — what super.finishing-a-development-branch does
      once the branch is done: ask = the finishing menu, merge = merge locally, pr = push + PR,
      keep = leave the branch; discard is never automatic),
  copilot.review_final (false; native review skill as an extra bug pass at the final review),
  claude_code.review_final (false; /code-review as an extra bug pass at the final review),
  claude_code.review_effort ("medium"; low/medium/high/max — ultra unsupported),
  context.has_corporate_artifacts (false),
  model_tiers.cheap/standard/capable (null — harness decides when unset),
  project.stack/manifest (null — proposed by detect-project.cjs at onboarding, confirmed by
    the user; the commands themselves live in the repo's instructions file and manifest)

Exit codes:
  0  success
  1  usage error or unrecoverable failure
`.trimStart();

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  workflow: {
    auto_commit: true,
    // The end-of-implementation QA gate (super.user-story-verification). true (default) runs it
    // automatically whenever a PRD exists — the preference IS the consent, nothing is asked at
    // the final stage; 'ask' defers that consent to the gate itself (one question, only when a
    // PRD exists, answer valid for that feature); false skips it silently and QA is never mentioned.
    qa_gate: true,
    // The browser companion offered during super.brainstorming. false skips the offer entirely
    // (no consent question, no browser mention); true keeps the consent-gated offer.
    visual_companion: true,
    // What super.finishing-a-development-branch does once the branch is verified: "ask" shows
    // the finishing menu (default, unchanged behaviour); "merge" merges locally; "pr" pushes and
    // opens a pull request; "keep" leaves the branch as-is. Declared once so the pipeline can run
    // to completion without a menu the user answers hours later. Discard is never automatic.
    finish_action: 'ask',
  },
  copilot: {
    // Native `review` skill at the final review — an extra bug-focused pass ON TOP OF the default
    // final reviewer (which still runs). Additive; spec + quality gates always run too.
    review_final: false,
  },
  // Platform-specific. The claude_code: section is ignored by Copilot CLI, Codex,
  // and Gemini CLI. Off by default — the user opts in during onboarding.
  claude_code: {
    // /code-review at the final review — an extra bug-focused pass ON TOP OF the default final
    // reviewer (which still runs). Additive; spec + quality gates always run too. Named like
    // copilot.review_final on purpose — one name per concept on both platforms.
    review_final: false,
    // Effort for the final /code-review (low/medium/high/max; ultra clamped to medium).
    review_effort: 'medium',
  },
  context: {
    has_corporate_artifacts: false,
  },
  // Maps the abstract model tiers used by execution skills (see
  // super.subagent-driven-development, "Model Selection" section) to concrete model names
  // for THIS harness. null means "let the harness pick its cheap/standard/capable".
  model_tiers: {
    cheap: null,
    standard: null,
    capable: null,
  },
  // Project profile — WHAT this repo is, not HOW it is run. Two keys on purpose: the
  // ecosystem label and the repo-relative path of the manifest that describes it. Test,
  // setup and format commands are NOT preferences — the repo's instructions file
  // (AGENTS.md / CLAUDE.md) and the manifest carry them, and a skill reads those when it
  // needs one. Persisting commands here meant a new key per ecosystem shape and values
  // that drifted from the repo; a pointer to the manifest cannot drift. Retired keys
  // (test_command, test_file_command, setup_command, ui_file_globs, format_command) in an
  // older file are ignored in silence — deepMerge iterates DEFAULTS. null on both means
  // "not decided yet" when `projectDeclared` is true, "nobody was asked" when it is false.
  project: {
    stack: null,
    manifest: null,
  },
};

function deepMerge(defaults, overrides) {
  if (!overrides || typeof overrides !== 'object') return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(defaults[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}

// ─── Normalization ───────────────────────────────────────────────────────────
//
// Valid effort levels for the final /code-review. `ultra` is intentionally excluded:
// it runs in the cloud on a separate tier, so the flow must never select it
// automatically. An invalid or `ultra` value is clamped back to the default.
const VALID_CODE_REVIEW_EFFORTS = ['low', 'medium', 'high', 'max'];

/**
 * Clamp claude_code.review_effort to a valid level (in place), returning a
 * list of human-readable notes about anything changed. Shared by read AND write
 * so the write-side round-trip check stays consistent (both clamp identically,
 * so an `ultra`/invalid value can never be persisted — not even by a hand edit).
 */
function normalizeCodeReviewEffort(preferences) {
  const notes = [];
  const cc = preferences && preferences.claude_code;
  if (cc && !VALID_CODE_REVIEW_EFFORTS.includes(cc.review_effort)) {
    notes.push(`claude_code.review_effort "${cc.review_effort}" is not one of ${VALID_CODE_REVIEW_EFFORTS.join('/')} (ultra is unsupported) — using "medium"`);
    cc.review_effort = 'medium';
  }
  return notes;
}

// Valid finish actions. `discard` is deliberately absent: destroying work is never a standing
// preference, only a typed confirmation at the finishing menu.
const VALID_FINISH_ACTIONS = ['ask', 'merge', 'pr', 'keep'];

/**
 * Clamp workflow.finish_action to a valid value (in place), returning notes. Shared by read AND
 * write, like normalizeCodeReviewEffort, so a hand-edited `discard` (or any typo) falls back to
 * `ask` — the menu — at every layer and can never be persisted.
 */
function normalizeFinishAction(preferences) {
  const notes = [];
  const wf = preferences && preferences.workflow;
  if (wf && !VALID_FINISH_ACTIONS.includes(wf.finish_action)) {
    notes.push(`workflow.finish_action "${wf.finish_action}" is not one of ${VALID_FINISH_ACTIONS.join('/')} — using "ask"`);
    wf.finish_action = 'ask';
  }
  return notes;
}

// Valid QA-gate values. `true` runs the gate whenever a PRD exists (the preference is the
// consent), `ask` defers that consent to the gate itself, `false` removes the gate silently.
const VALID_QA_GATE_VALUES = [true, 'ask', false];

/**
 * Clamp workflow.qa_gate to a valid value (in place), returning notes. Shared by read AND write
 * like the other normalizers: a hand-edited `yes`/`always`/typo falls back to the default `true`
 * at every layer and can never be persisted. A quoted or capitalised `"Ask"` is accepted as `ask`.
 */
function normalizeQaGate(preferences) {
  const notes = [];
  const wf = preferences && preferences.workflow;
  if (!wf) return notes;
  if (typeof wf.qa_gate === 'string' && wf.qa_gate.trim().toLowerCase() === 'ask') {
    wf.qa_gate = 'ask';
  }
  if (!VALID_QA_GATE_VALUES.includes(wf.qa_gate)) {
    notes.push(`workflow.qa_gate "${wf.qa_gate}" is not one of true/ask/false — using true`);
    wf.qa_gate = true;
  }
  return notes;
}

// ─── YAML Parser ─────────────────────────────────────────────────────────────
//
// Handles the specific subset of YAML used in preferences.yml:
//   - Comments (#)
//   - Nested mappings (key: / one level of indent)
//   - Scalar values: strings, booleans (true/false), null (empty / null / ~)
//   - No arrays, no multi-line strings
//
// Returns { parsed, malformed }.

// Scalar values: true/false, null (empty / null / ~), else a string with optional quotes stripped.
function parseScalar(rawValue) {
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  if (rawValue === '' || rawValue === 'null' || rawValue === '~') return null;
  return rawValue.replace(/^['"]|['"]$/g, '');
}

const TOP_SECTION_RE = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*$/;
const NESTED_KV_RE = /^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/;
const TOP_KV_RE = /^([a-zA-Z_][a-zA-Z0-9_]*):\s+(.+)$/;

function parseYaml(content) {
  const root = {};
  let currentSection = null;
  let malformed = false;

  for (const rawLine of content.split('\n')) {
    // Strip inline comments — but preserve #-in-values like language: pt-BR
    const line = rawLine.replace(/\s+#.*$/, '').trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Top-level section (no leading whitespace, ends with colon, no value)
    const topMatch = TOP_SECTION_RE.exec(line);
    if (topMatch) {
      currentSection = topMatch[1];
      root[currentSection] = {};
      continue;
    }

    // Nested key (leading whitespace)
    const nestedMatch = NESTED_KV_RE.exec(line);
    if (nestedMatch) {
      if (currentSection) root[currentSection][nestedMatch[1]] = parseScalar(nestedMatch[2].trim());
      continue;
    }

    // Top-level key-value pair (no indentation, has value)
    const topKvMatch = TOP_KV_RE.exec(line);
    if (topKvMatch) {
      root[topKvMatch[1]] = parseScalar(topKvMatch[2].trim());
      currentSection = null;
      continue;
    }

    // Anything else that looks structural is a sign of malformed YAML
    if (!trimmed.startsWith('#')
        && (/^[^a-zA-Z\s]/.test(trimmed) || line.includes('[') || line.includes('{')
            || /^\w+\s+\w+/.test(trimmed))) { // last one: key without colon
      malformed = true;
    }
  }

  return { parsed: root, malformed };
}

// ─── Git root detection ───────────────────────────────────────────────────────

// Git working-tree root, resolved in-process (no `git` spawn) — see lib/repo-root.cjs.
const detectGitRoot = () => detectRepoRoot();

// ─── Main (CLI) ─────────────────────────────────────────────────────────────────

/**
 * loadPreferences — the SINGLE in-process read path (no subprocess).
 *
 * The CLI main() below prints what this returns; sibling scripts
 * (derive-session-state.cjs, super.reviewing-specs/scripts/lite-reentry.cjs) `require`
 * this directly instead of spawning `node read-preferences.cjs`, so there is exactly
 * one parse/merge/normalize path — identical output, one fewer process per call.
 *
 * Returns { result, warnings, root }:
 *   - result   — the exact object the CLI emits on stdout
 *                ({ found, repo_not_found, malformed, preferencesPath, preferences }).
 *   - warnings — human-readable notes the CLI writes to stderr (malformed / clamped
 *                values). Callers that don't surface stderr just ignore the array,
 *                matching the previous `stdio: 'ignore'` behavior of the spawning callers.
 *   - root     — the resolved repo root (or null when there is no repo), so callers that
 *                need it don't re-derive it from preferencesPath. Not part of `result`,
 *                so the CLI's stdout contract is unchanged.
 * Throws ONLY when an existing file cannot be read — main() maps that to exit 1, exactly
 * as before. Absent repo / absent file are normal (found:false), never throws.
 */
function loadPreferences(repoRoot) {
  const warnings = [];
  const root = repoRoot ? path.resolve(repoRoot) : detectGitRoot();
  // Declared before `wrap` closes over it: the `!root` exit below calls wrap, and a `let`
  // declared further down would still be in its temporal dead zone there.
  let resolvedRoot = root;
  // wrap keeps the three exits DRY and exposes the already-resolved root alongside
  // `result`, so callers never re-derive it from preferencesPath. It reports
  // `resolvedRoot`, which the worktree fallback below may move to the main working tree —
  // callers that resolve sibling paths from it must follow the file, not the input.
  // `root` is a wrapper field, NOT part of `result` — `result` stays the exact frozen
  // JSON the CLI prints.
  const wrap = (result) => ({ result, warnings, root: resolvedRoot });
  // Absent repo / absent file: defaults, never an error.
  const notFound = (preferencesPath) => wrap({
    found: false,
    repo_not_found: preferencesPath === null,
    malformed: false,
    preferencesPath,
    preferences: deepMerge(DEFAULTS, {}),
    projectDeclared: false,
  });

  if (!root) return notFound(null);

  let prefsPath = path.join(resolvedRoot, '.superpowers', 'preferences.yml');

  // Absent here and `root` is a LINKED WORKTREE → look in the main working tree before
  // giving up. `.superpowers/` is gitignored, so `git worktree add` produces a tree
  // without it, and a worktree session (`super.using-git-worktrees`) runs inside one of
  // those. Resolving the way `--show-toplevel` does lands in the worktree, finds
  // nothing, and returns defaults for the whole preference set — indistinguishable, in
  // the output, from a repo that never configured any. The fallback is deliberately
  // one-directional: a worktree that DOES carry its own file still wins, so this can
  // only turn a false `found:false` into a true `found:true`.
  if (!fs.existsSync(prefsPath)) {
    const main = mainRepoRoot(resolvedRoot);
    const mainPath = main !== resolvedRoot && path.join(main, '.superpowers', 'preferences.yml');
    if (mainPath && fs.existsSync(mainPath)) {
      resolvedRoot = main;
      prefsPath = mainPath;
    } else {
      return notFound(prefsPath);
    }
  }

  const rawContent = fs.readFileSync(prefsPath, 'utf8'); // throws → main() turns into exit 1

  const { parsed, malformed } = parseYaml(rawContent);
  if (malformed) {
    warnings.push('preferences.yml appears malformed — using defaults for missing values');
  }

  const merged = deepMerge(DEFAULTS, parsed);
  warnings.push(...normalizeCodeReviewEffort(merged), ...normalizeFinishAction(merged), ...normalizeQaGate(merged));

  return wrap({
    found: true,
    repo_not_found: false,
    malformed,
    preferencesPath: prefsPath,
    preferences: merged,
    // The `project:` SECTION exists in the file (values may still be null on purpose).
    // Distinct from `found`: a file written before this section existed reads found:true
    // with every project.* null — the router must then run ONLY the project step of the
    // wizard, not treat the nulls as "this repo has no test command".
    projectDeclared: Object.prototype.hasOwnProperty.call(parsed, 'project'),
  });
}

function main(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let repoRoot = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && args[i + 1]) {
      repoRoot = args[++i];
    }
  }

  let loaded;
  try {
    loaded = loadPreferences(repoRoot);
  } catch (err) {
    process.stderr.write(`Error reading preferences file: ${err.message}\n`);
    process.exit(1);
  }

  for (const note of loaded.warnings) {
    process.stderr.write(`Warning: ${note}\n`);
  }

  process.stdout.write(JSON.stringify(loaded.result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { DEFAULTS, deepMerge, parseYaml, detectGitRoot, normalizeCodeReviewEffort, normalizeFinishAction, normalizeQaGate, VALID_FINISH_ACTIONS, loadPreferences };

if (require.main === module) {
  main(process.argv);
}
