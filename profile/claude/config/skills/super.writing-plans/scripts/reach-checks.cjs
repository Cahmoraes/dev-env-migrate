'use strict';

/**
 * Plan reach: does the task set *reach* everything the change touches?
 *
 * A plan can be internally consistent and still be incomplete. Incompleteness of that
 * second kind comes from mapping dependencies by feature narrative instead of by
 * technical reach, and shows up in three recurring shapes:
 *
 *   R1 importer coverage  — a task tightens an exported type; the files that
 *                           construct or consume it belong to no write-set.
 *   R2 registry coverage  — a task creates a new module; the file that enrolls
 *                           its siblings belongs to no write-set, so the module
 *                           compiles, passes its unit tests, and does not exist
 *                           at runtime.
 *   R3 suite coverage     — the plan says "run the suite"; the repo has several
 *                           runner configs and the named command drives one.
 *
 * All three are warnings except an unrunnable test path (R3), which is an
 * error: a test the runner never selects is not a test.
 *
 * Detection deliberately does NOT rely on the import graph alone. A DI
 * container, a route table or a plugin manifest enrolls a module by
 * *identifier*, not by import — a bootstrap file may name a token like
 * `TOKENS.Handlers.Delta` while importing nothing from the handler's file. R2
 * therefore matches on identifiers derived from sibling filenames, which
 * survives that indirection.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SKIP_DIR = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'generated', '__snapshots__',
]);
const MAX_FILES = 20000;
/** Above this, a "modified" file is infrastructure everyone imports; list a count, not names. */
const IMPORTER_LIST_CAP = 8;
/** Only the highest-fan-in modified files get their own warning; the rest are summarised. */
const IMPORTER_WARNING_CAP = 5;
/** A registry must name at least this many distinct siblings to count as an enrollment point. */
const MIN_SIBLING_MENTIONS = 2;

const TEST_PATH_RE = /(?:^|\/)(?:__tests__|test|tests)\/|[.-](?:test|spec)[.-]|[.-](?:test|spec)\.[a-z]+$/iu;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function stripExt(p) {
  return p.replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/u, '');
}

function isTestPath(relPath) {
  return TEST_PATH_RE.test(relPath);
}

/** Recursively collect source files under `root`, skipping build output and vendor dirs. */
function walkSources(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0 && files.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Dot-directories are tooling state, never plan-owned source. Skipping them
        // also removes nested git worktrees (.claude/worktrees/<name>/), which are a
        // second full copy of the repo and would double every finding below.
        if (!SKIP_DIR.has(entry.name) && !entry.name.startsWith('.')) stack.push(full);
        continue;
      }
      if (SOURCE_EXT.has(path.extname(entry.name))) files.push(full);
    }
  }
  return files;
}

const FROM_RE = /from\s*['"]([^'"]+)['"]/gu;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/gu;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/gu;
const SIDE_EFFECT_RE = /^[ \t]*import\s*['"]([^'"]+)['"]/gmu;

function extractSpecifiers(text) {
  const specs = new Set();
  for (const re of [FROM_RE, REQUIRE_RE, DYNAMIC_RE, SIDE_EFFECT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) specs.add(match[1]);
  }
  return [...specs];
}

/**
 * Build the one-pass repo index every reach check reads: relative path, raw
 * text, and resolved import specifiers per source file.
 */
function buildRepoIndex(repoRoot) {
  const files = walkSources(repoRoot);
  const index = [];
  for (const abs of files) {
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const rel = toPosix(path.relative(repoRoot, abs));
    index.push({ abs, rel, text, specifiers: extractSpecifiers(text) });
  }
  return index;
}

/**
 * The key a specifier resolves to, independent of any target: a relative specifier
 * resolves exactly (`rel`), an alias/bare one can only be matched by path tail (`tail`).
 * Alias/bare specifiers cannot be resolved without reading every tsconfig `paths` map,
 * so they match on a path tail of at least two segments — `@/core/domain/model` matches
 * `apps/api/src/core/domain/model`. The two-segment floor is what keeps `../model` from
 * matching every `model.ts` in the repo; a missed importer is a quieter failure than a
 * false one here. Null when the specifier can never match a repo file.
 */
function specifierKey(importerRel, spec) {
  if (spec.startsWith('.')) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
    return { kind: 'rel', key: stripExt(resolved) };
  }
  const tail = stripExt(spec.replace(/^[~@]\//u, ''));
  if (tail.split('/').filter(Boolean).length < 2) return null;
  return { kind: 'tail', key: tail };
}

/**
 * Every key under which an importer of `targetRel` would be indexed: the exact
 * extensionless path (and its directory for an `index` file) for relative specifiers,
 * and every segment-boundary suffix of those for alias tails.
 */
function targetKeys(targetRel) {
  const targetNoExt = stripExt(targetRel);
  const exact = [targetNoExt];
  if (targetNoExt.endsWith('/index')) exact.push(targetNoExt.slice(0, -'/index'.length));
  const tails = new Set();
  for (const full of exact) {
    const parts = full.split('/');
    for (let i = 0; i < parts.length; i += 1) tails.add(parts.slice(i).join('/'));
  }
  return { rel: exact, tails };
}

/** Does `spec`, written inside `importerRel`, point at `targetRel`? */
function specifierResolvesTo(importerRel, spec, targetRel) {
  const resolved = specifierKey(importerRel, spec);
  if (!resolved) return false;
  const keys = targetKeys(targetRel);
  return resolved.kind === 'rel' ? keys.rel.includes(resolved.key) : keys.tails.has(resolved.key);
}

/**
 * The source file a test file exercises: `create-item.usecase.test.ts` →
 * `create-item.usecase.ts`. A test whose subject the plan already owns is in
 * scope by proxy, so counting it as an uncovered importer is pure noise.
 */
function subjectOfTest(relPath) {
  const ext = path.posix.extname(relPath);
  const withoutExt = relPath.slice(0, -ext.length);
  const stripped = withoutExt.replace(/\.(?:test|spec)$|[.-][\w-]*-(?:test|spec)$/u, '');
  return stripped === withoutExt ? null : `${stripped}${ext}`;
}

function isCovered(rel, coveredSet) {
  if (coveredSet.has(rel)) return true;
  const subject = subjectOfTest(rel);
  return subject !== null && coveredSet.has(subject);
}

/**
 * R1 — every repo file importing a file the plan modifies should belong to some
 * task's write-set, because a contract change reaches its callers whether or not
 * the plan says so.
 */
function checkImporterCoverage({ repoIndex, modified, coveredSet }) {
  // Invert the import graph once — key → importers — so each modified file is a few
  // map lookups instead of a scan of every specifier of every repo file.
  const byRel = new Map();
  const byTail = new Map();
  for (const file of repoIndex) {
    for (const spec of file.specifiers) {
      const resolved = specifierKey(file.rel, spec);
      if (!resolved) continue;
      const map = resolved.kind === 'rel' ? byRel : byTail;
      let set = map.get(resolved.key);
      if (!set) { set = new Set(); map.set(resolved.key, set); }
      set.add(file.rel);
    }
  }
  const findings = [];
  for (const target of modified) {
    const keys = targetKeys(target);
    const importers = new Set();
    for (const key of keys.rel) for (const rel of byRel.get(key) || []) importers.add(rel);
    for (const key of keys.tails) for (const rel of byTail.get(key) || []) importers.add(rel);
    importers.delete(target);
    const uncovered = [...importers].filter((rel) => !isCovered(rel, coveredSet)).sort();
    if (uncovered.length > 0) {
      findings.push({ file: target, importerCount: importers.size, uncovered });
    }
  }
  return findings.sort((a, b) => b.uncovered.length - a.uncovered.length);
}

/** The `.controller.ts`-style kind suffix of a filename, or its bare extension. */
function kindSuffix(relPath) {
  const base = path.posix.basename(relPath);
  const firstDot = base.indexOf('.');
  return firstDot === -1 ? path.posix.extname(base) : base.slice(firstDot);
}

/** Identifiers a registry would plausibly use to name `relPath`'s module. */
function identifiersFor(relPath) {
  const base = path.posix.basename(relPath).replace(/\.[^.]+$/u, '');
  const [stem, ...kindParts] = base.split('.');
  const pascal = stem
    .split(/[-_]/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  const ids = new Set();
  if (pascal.length >= 4) ids.add(pascal);
  const kind = kindParts.join('');
  if (kind && pascal.length >= 4) {
    ids.add(pascal + kind.charAt(0).toUpperCase() + kind.slice(1));
  }
  return ids;
}

/** Nearest ancestor directory holding a package.json — the deployable unit a file belongs to. */
function packageRootOf(rel, repoRoot, cache) {
  const visited = [];
  let dir = path.posix.dirname(rel);
  let root;
  for (;;) {
    if (cache.has(dir)) { root = cache.get(dir); break; }
    visited.push(dir);
    if (fs.existsSync(path.join(repoRoot, dir, 'package.json'))) { root = dir; break; }
    const parent = path.posix.dirname(dir);
    if (parent === dir || dir === '.') { root = '.'; break; }
    dir = parent;
  }
  for (const seen of visited) cache.set(seen, root);
  return root;
}

/**
 * R2 — a file the plan creates is a new member of a kind (`*.controller.ts`,
 * `*.usecase.ts`). Whatever file enumerates its existing siblings is an
 * enrollment point; if it is in no write-set, the new member is written but
 * never wired, which no type check and no unit test can see.
 *
 * Candidates are confined to the created file's own package: enrollment happens
 * inside a deployable unit, so a file in a sibling package naming the same
 * identifiers is shared domain vocabulary, not a registry.
 */
function checkRegistryCoverage({ repoIndex, created, coveredSet, repoRoot }) {
  const findings = [];
  const pkgCache = new Map();
  for (const target of created) {
    const dir = path.posix.dirname(target);
    const suffix = kindSuffix(target);
    const siblings = repoIndex.filter((file) => path.posix.dirname(file.rel) === dir
      && file.rel.endsWith(suffix)
      && !isTestPath(file.rel));
    // A bare-extension suffix (`model.ts`) is a weak kind signal; demand more siblings.
    const minSiblings = suffix.startsWith('.') && suffix.indexOf('.', 1) === -1 ? 3 : 1;
    if (siblings.length < minSiblings) continue;

    const siblingIds = siblings.map((file) => [...identifiersFor(file.rel)]);
    const siblingRels = new Set(siblings.map((file) => file.rel));

    const ownPackage = packageRootOf(target, repoRoot, pkgCache);
    const registries = [];
    for (const file of repoIndex) {
      if (siblingRels.has(file.rel) || isTestPath(file.rel)) continue;
      if (packageRootOf(file.rel, repoRoot, pkgCache) !== ownPackage) continue;
      const named = siblingIds.filter((ids) => ids.some((id) => file.text.includes(id)));
      if (named.length >= MIN_SIBLING_MENTIONS) {
        registries.push({ file: file.rel, siblingsNamed: named.length });
      }
    }
    const uncovered = registries
      .filter((entry) => !coveredSet.has(entry.file))
      .sort((a, b) => b.siblingsNamed - a.siblingsNamed);
    if (uncovered.length > 0) {
      findings.push({ file: target, siblingCount: siblings.length, registries: uncovered });
    }
  }
  return findings;
}

const CONFIG_NAME_RE = /^(?:vitest|vite|jest)\.config[.\w-]*\.(?:[cm]?[jt]s)$|^(?:vitest|vite|jest)\.config\.[\w-]+\.(?:[cm]?[jt]s)$/u;
const INCLUDE_ARRAY_RE = /\binclude\s*:\s*\[([^\]]*)\]/u;
const DEFAULT_INCLUDE = ['**/*.{test,spec}.?([cm])[jt]s?(x)'];

const globCache = new Map();

function globToRegExp(glob) {
  let re = globCache.get(glob);
  if (!re) {
    re = compileGlob(glob);
    globCache.set(glob, re);
  }
  return re;
}

function compileGlob(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') { out += '[^/]'; continue; }
    if (char === '{') { out += '(?:'; continue; }
    if (char === '}') { out += ')'; continue; }
    if (char === ',') { out += '|'; continue; }
    if (char === '(') { out += '(?:'; continue; }
    if (char === ')') { out += ')'; continue; }
    out += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${out}$`, 'u');
}

/** Which package.json script commands reference a given config file. */
function commandsForConfig(repoRoot, configRel) {
  const configBase = path.posix.basename(configRel);
  const commands = [];
  const pkgDirs = new Set(['.']);
  let cursor = path.posix.dirname(configRel);
  while (cursor && cursor !== '.') {
    pkgDirs.add(cursor);
    cursor = path.posix.dirname(cursor);
  }
  for (const dir of pkgDirs) {
    const pkgPath = path.join(repoRoot, dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    for (const [name, script] of Object.entries(pkg.scripts || {})) {
      if (typeof script === 'string' && script.includes(configBase)) {
        commands.push({ package: pkg.name || dir, script: name });
      }
    }
  }
  return commands;
}

/**
 * R3 — enumerate every test-runner config and its include globs. A repo with
 * more than one suite has no single "run the tests" command, and a plan that
 * names one command has silently scoped the checkpoint to a subset.
 */
function discoverTestSuites(repoRoot, repoIndex) {
  const suites = [];
  for (const file of repoIndex) {
    if (!CONFIG_NAME_RE.test(path.posix.basename(file.rel))) continue;
    const match = file.text.match(INCLUDE_ARRAY_RE);
    const include = match
      ? [...match[1].matchAll(/['"`]([^'"`]+)['"`]/gu)].map((entry) => entry[1])
      : [];
    const dir = path.posix.dirname(file.rel);
    const commands = commandsForConfig(repoRoot, file.rel);
    // A config is a *suite* only if something runs it: an npm script names it, or it
    // sits at a package root where the runner picks it up by convention. This drops
    // shared base configs (merged into others, never run) and one-off configs vendored
    // under docs/ as QA evidence, which are not part of the repo's verification surface.
    // A package root under docs/ (QA evidence with its own package.json) is documentation,
    // not the verification surface either — measured: it inflated a 8-suite repo to 9.
    if (/^docs\//u.test(file.rel)) continue;
    const atPackageRoot = fs.existsSync(path.join(repoRoot, dir, 'package.json'));
    if (commands.length === 0 && !atPackageRoot) continue;
    suites.push({
      config: file.rel,
      dir,
      include: include.length > 0 ? include : DEFAULT_INCLUDE,
      inferredInclude: include.length === 0,
      commands,
    });
  }
  return suites;
}

/**
 * Suite include globs are relative to the config's own directory *and*, in
 * practice, to its package root (`test/vite.config.x.ts` with `**b/*.test.ts`
 * selects from `apps/backend`, not `apps/backend/test`). Try both bases.
 */
function suiteMatches(suite, testRel) {
  const bases = new Set([suite.dir, path.posix.dirname(suite.dir), '.']);
  for (const base of bases) {
    const prefix = base === '.' ? '' : `${base}/`;
    if (!testRel.startsWith(prefix)) continue;
    const candidate = testRel.slice(prefix.length);
    for (const glob of suite.include) {
      const normalized = glob.replace(/^\.\//u, '');
      if (globToRegExp(normalized).test(candidate)) return true;
    }
  }
  return false;
}

/**
 * Full reach validation. `writeSetsByTask` maps task number to its declared
 * write paths; `testPathsByTask` maps task number to the test files it declares.
 * Pushes into `errors`/`warnings` and returns the structured result.
 */
function validateReach({ repoRoot, writeSetsByTask, testPathsByTask }, errors, warnings) {
  if (!repoRoot || !fs.existsSync(repoRoot)) return null;

  const repoIndex = buildRepoIndex(repoRoot);
  const covered = new Set();
  for (const paths of writeSetsByTask.values()) {
    for (const rel of paths) covered.add(toPosix(rel));
  }

  const allWrites = [...covered];
  const onDisk = new Set(repoIndex.map((file) => file.rel));
  const modified = allWrites.filter((rel) => onDisk.has(rel) && !isTestPath(rel));
  const created = allWrites.filter((rel) => !onDisk.has(rel) && !isTestPath(rel));

  const importerCoverage = checkImporterCoverage({ repoIndex, modified, coveredSet: covered });
  for (const finding of importerCoverage.slice(0, IMPORTER_WARNING_CAP)) {
    const listed = finding.uncovered.length > IMPORTER_LIST_CAP
      ? `${finding.uncovered.slice(0, IMPORTER_LIST_CAP).join(', ')} (+${finding.uncovered.length - IMPORTER_LIST_CAP} more)`
      : finding.uncovered.join(', ');
    warnings.push({
      line: 0,
      message: `Reach: ${finding.file} is modified by the plan but ${finding.uncovered.length} of its ${finding.importerCount} importers are in no task's write-set: ${listed}. If this task changes an exported signature, type or DTO, those files change with it — add them to that task's write-set. If the change is additive there is nothing to do: the confirmation is a reading, never a line in the plan.`,
    });
  }

  if (importerCoverage.length > IMPORTER_WARNING_CAP) {
    const rest = importerCoverage.slice(IMPORTER_WARNING_CAP);
    warnings.push({
      line: 0,
      message: `Reach: ${rest.length} further modified file(s) also have importers in no write-set (${rest.map((f) => `${f.file}:${f.uncovered.length}`).join(', ')}). Full lists are in the JSON result's reach.importerCoverage.`,
    });
  }

  const registryCoverage = checkRegistryCoverage({
    repoIndex, created, coveredSet: covered, repoRoot,
  });
  for (const finding of registryCoverage) {
    const listed = finding.registries
      .slice(0, 3)
      .map((entry) => `${entry.file} (names ${entry.siblingsNamed})`)
      .join(', ');
    warnings.push({
      line: 0,
      message: `Reach: ${finding.file} is a new member of a kind with ${finding.siblingCount} existing siblings, but the file(s) enrolling those siblings are in no write-set: ${listed}. A new module that nothing registers compiles, passes its unit tests, and does not exist at runtime — add the enrollment file to the write-set of the task that creates it.`,
    });
  }

  const testSuites = discoverTestSuites(repoRoot, repoIndex);
  const unrunnable = [];
  for (const [taskNumber, testPaths] of testPathsByTask.entries()) {
    for (const rel of testPaths) {
      const posixRel = toPosix(rel);
      const matching = testSuites.filter((suite) => suiteMatches(suite, posixRel));
      if (matching.length === 0 && testSuites.length > 0) {
        unrunnable.push({ task: taskNumber, file: posixRel });
      }
    }
  }
  for (const entry of unrunnable) {
    errors.push({
      line: 0,
      message: `Reach: task ${entry.task} declares test ${entry.file}, which matches the include globs of none of the ${testSuites.length} discovered runner configs (${testSuites.map((suite) => suite.config).join(', ')}). Rename it to a pattern a suite selects, or add it to a suite — a test no runner selects always passes.`,
    });
  }

  if (testSuites.length > 1) {
    const inventory = testSuites
      .map((suite) => {
        const cmds = suite.commands.map((command) => `${command.package}:${command.script}`).join('|') || 'no npm script';
        return `${suite.config} [${cmds}] include=${suite.include.join(',')}`;
      })
      .join('; ');
    warnings.push({
      line: 0,
      message: `Reach: the repo has ${testSuites.length} test-runner configs, so no single command is "the full suite" — the full-suite checkpoint and the final gate resolve each suite from the project's own scripts. Use the inventory only to check the runner the task-writer briefing records per test kind; do not copy it into the plan: ${inventory}.`,
    });
  }

  return {
    filesIndexed: repoIndex.length,
    modifiedCount: modified.length,
    createdCount: created.length,
    importerCoverage,
    registryCoverage,
    testSuites,
    unrunnableTests: unrunnable,
  };
}

module.exports = {
  buildRepoIndex,
  discoverTestSuites,
  identifiersFor,
  kindSuffix,
  specifierResolvesTo,
  suiteMatches,
  validateReach,
};
