'use strict';

/**
 * Cross-skill sweep: no artifact may name a consumer project, its features, or its files.
 *
 * WHY THIS EXISTS
 *
 * Skills are written while working on a real consuming repo, so the evidence that
 * justifies a guard arrives wearing that repo's vocabulary. The comment writes itself:
 * "Measured on feature <slug>", "the real <slug> PRD shape", "session in <project>".
 * Every one of those is correct AND wrong — the measurement is real, but the artifact
 * now documents its reason-to-exist in terms only one project can read. A different
 * consumer inherits a script whose rationale points at files it does not have.
 *
 * Found in one sweep: 9 narrative attributions (including one in PRODUCTION code, not
 * a comment) plus 13 consumer feature slugs used as fixture data. None changed behaviour;
 * all of them made the artifacts read as if they belonged to someone else's repo.
 *
 * The rule is about PROPER NOUNS, not about evidence. Keep the numbers, the dates, the
 * session ids, the measured wall-clock — those are what make a guard credible. Drop the
 * project name, the feature slug, and the npm script that only exists over there.
 * An INVENTED example slug (`my-feature`, `broker-fanout`) is fine: it names nothing.
 *
 * THE SELF-REFERENCE TRAP
 *
 * A denylist must contain the very strings it bans, so this file exempts itself. That
 * exemption is the sweep's weakest point — widen it by one directory and the guard goes
 * blind to a whole neighbourhood. `EXEMPT` is therefore an exact-path set of size 1, and
 * a test below asserts that size.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/no-consumer-coupling.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/** artifacts/ — every category, not just superpowers: the rule is repo-wide. */
const ARTIFACTS = path.resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * Identifiers belonging to a consuming repo. Two kinds, both proper nouns:
 * the project/feature slugs, and npm scripts that exist only in that project.
 *
 * This list is a quarantine, not an inventory — it holds what has already leaked once,
 * because a regression repeats the phrasing that produced it. Novel projects are caught
 * by ABSOLUTE_PATH below, and exhaustively by the opt-in cross-check at the bottom.
 */
const BANNED = [
  'clean-arch-solid-ddd',
  'gym-deactivation',
  'bulk-user-status-actions',
  'notification-broadcast-fanout',
  'admin-role-management',
  'admin-user-detail-panel',
  'admin-edit-user-data',
  'google-social-login',
  'gym-cards-animation',
  'login-security-lockout',
  'ui-pagination-select-polish',
  'sidebar-collapse-toggle',
  'home-planos-contato',
  'checkin-approve-reject',
  'winston-to-pino-migration',
  'openapi:generate-client',
];

/**
 * A path into someone's checkout. Structural, so it catches a project this list has
 * never heard of — which is the case the denylist cannot cover.
 */
const ABSOLUTE_PATH = /(?:\/home\/[a-z0-9_.-]+\/|\/Users\/[A-Za-z0-9_.-]+\/|[A-Z]:\\Users\\)/u;

/** Exactly one file may name the banned tokens: this one. Widening this set blinds the sweep. */
const EXEMPT = new Set([path.resolve(__filename)]);

/** Binary or generated payloads have no prose to couple. */
const SKIP_EXT = new Set(['.pyc', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.pdf']);
const SKIP_DIR = new Set(['.git', 'node_modules', '__pycache__']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/**
 * Pure: the classifier, so the rules can be exercised on synthetic text. A sweep that
 * only ever runs over a clean tree proves nothing — it would pass with every rule broken.
 */
function scanText(text, banned = BANNED) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    for (const token of banned) {
      if (line.toLowerCase().includes(token.toLowerCase())) {
        findings.push({ line: i + 1, token, rule: 'named-consumer-identifier' });
      }
    }
    if (ABSOLUTE_PATH.test(line)) {
      findings.push({ line: i + 1, token: line.trim().slice(0, 60), rule: 'absolute-checkout-path' });
    }
  });
  return findings;
}

/** Reads a file as text; returns null for anything that is not (null byte = binary). */
function readText(file) {
  const buf = fs.readFileSync(file);
  return buf.includes(0) ? null : buf.toString('utf8');
}

function sweep(banned = BANNED) {
  const violations = [];
  const files = walk(ARTIFACTS);
  let scanned = 0;
  for (const file of files) {
    if (EXEMPT.has(path.resolve(file))) continue;
    const text = readText(file);
    if (text === null) continue;
    scanned += 1;
    for (const f of scanText(text, banned)) {
      violations.push(`${path.relative(ARTIFACTS, file)}:${f.line}: ${f.rule} (${f.token})`);
    }
  }
  return { scanned, violations };
}

/**
 * The verdict, in one place. Both the sweep test and the planted-violation test go
 * through here — so gutting this assertion makes the planted test stop throwing, which
 * is what keeps the sweep's own `deepEqual` from being a mutant that survives.
 */
function assertClean(banned = BANNED) {
  const { scanned, violations } = sweep(banned);
  // Anti-staleness: a walk whose root or filters break would scan ~nothing and pass.
  assert.ok(scanned >= 800, `sweep scanned only ${scanned} files — the walk is broken, not the tree clean`);
  assert.deepEqual(
    violations,
    [],
    'artifacts must not name a consuming project. Keep the measurement, drop the proper noun:\n' +
      '  "Measured on feature <slug>" -> "Measured on one <N>-task feature"\n' +
      '  "the real <slug> PRD shape"  -> "a real PRD shape observed in the field"\n' +
      `\n${violations.join('\n')}`,
  );
}

// ─── The sweep ───────────────────────────────────────────────────────────────

test('no artifact names a consumer project, its features, or its files', () => {
  assertClean();
});

// ─── The rules themselves ────────────────────────────────────────────────────

test('a named consumer identifier is flagged wherever it appears', () => {
  assert.ok(BANNED.length >= 15, 'the quarantine list shrank — re-derive it before trusting this sweep');
  for (const token of BANNED) {
    const found = scanText(`// Measured on feature ${token}: it was slow.`);
    assert.equal(found.length, 1, `${token}: must be flagged`);
    assert.equal(found[0].rule, 'named-consumer-identifier');
  }
});

test('matching is case-insensitive — a Title-Case slug is the same proper noun', () => {
  // This exact shape survived a case-sensitive sed and was caught only by a failing test.
  const found = scanText("driftedSlugs(['Home-Planos-Contato'], presence)");
  assert.equal(found.length, 1);
  assert.equal(found[0].token, 'home-planos-contato');
});

test('an absolute checkout path is flagged even for a project the list never heard of', () => {
  for (const line of ['see /home/someone/projects/unknown-repo/docs', 'C:\\Users\\dev\\repo', '/Users/dev/x/y']) {
    assert.equal(scanText(line).length, 1, `${line}: must be flagged`);
    assert.equal(scanText(line)[0].rule, 'absolute-checkout-path');
  }
});

test('invented example slugs and generic route names are NOT flagged', () => {
  // The rule bans proper nouns, not examples. Flagging these would train authors to
  // stop writing illustrations, which is the opposite of what the skills need.
  const clean = [
    'docs/superpowers/<feature-name>/specs/',
    'docs/superpowers/my-feature/plans/',
    "mkdir docs/superpowers/broker-fanout',",
    "@Post('forgot-password')",
    '// Measured on one 19-task feature: 16 barrier invocations.',
    '// Reproduces a real PRD shape observed in the field:',
    'node scripts/parse-waves.cjs --tasks-index docs/superpowers/<feature>/plans/',
  ];
  for (const line of clean) assert.deepEqual(scanText(line), [], `${line}: must not be flagged`);
});

test('the self-exemption covers exactly one file', () => {
  // The denylist forces this file to contain what it bans. If the exemption ever grows
  // to a directory or a glob, the sweep goes silently blind to everything inside it.
  assert.equal(EXEMPT.size, 1, 'only this file may be exempt');
  assert.equal([...EXEMPT][0], path.resolve(__filename));
});

test('the sweep actually reads its neighbours — a planted violation next door is caught', () => {
  // Proves the exemption is not accidentally swallowing the directory this file sits in.
  const planted = path.join(__dirname, 'no-consumer-coupling.fixture.tmp.md');
  try {
    fs.writeFileSync(planted, 'Measured on feature gym-deactivation.\n', 'utf8');
    assert.throws(
      () => assertClean(),
      /no-consumer-coupling\.fixture\.tmp\.md/u,
      "a violation in the exempt file's own directory must still be caught",
    );
  } finally {
    fs.rmSync(planted, { force: true });
  }
});

// ─── Opt-in: exhaustive cross-check against a real consuming repo ────────────

test('every feature slug in a real consuming repo is absent from artifacts (opt-in)', (t) => {
  // The denylist only knows what has already leaked. Point this at a consuming checkout
  // to check ALL of its feature slugs at once:
  //   SUPERPOWERS_CONSUMER_REPO=/path/to/repo node --test <this file>
  const repo = process.env.SUPERPOWERS_CONSUMER_REPO;
  const featuresDir = repo && path.join(repo, 'docs', 'superpowers');
  if (!repo || !fs.existsSync(featuresDir)) {
    t.skip('set SUPERPOWERS_CONSUMER_REPO to a checkout with docs/superpowers/ to run this');
    return;
  }
  const slugs = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // Slugs short enough to be ordinary English (`forgot-password`) are not proper nouns.
    .filter((s) => s.split('-').length >= 3);
  assert.ok(slugs.length > 0, `${featuresDir} has no feature directories — wrong repo?`);
  assertClean(slugs);
});
