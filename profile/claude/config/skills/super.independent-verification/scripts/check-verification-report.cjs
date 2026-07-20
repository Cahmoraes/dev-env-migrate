#!/usr/bin/env node
'use strict';

/*
 * check-verification-report.cjs - structural gate for a super.independent-verification
 * validation report.
 *
 * Replaces `super.finishing-a-development-branch`'s inline
 * `grep -Eiq 'verdict:?\s*PASS'` precondition check, which only confirms the
 * substring "PASS" appears somewhere in the file. That check cannot distinguish a
 * report written by a genuine fresh Verifier subagent from a thin, self-authored
 * file created only to satisfy the precondition (v16-large benchmark: the session
 * skipped the dedicated Verifier dispatch entirely and self-reviewed instead — a
 * `grep PASS` gate would not have caught that).
 *
 * This script cannot prove WHO wrote the report (no cross-platform, harness-
 * independent identity signal exists). Instead, mirroring validate-tasks.cjs's
 * wave-disjointness check, it verifies the report contains the STRUCTURAL EVIDENCE
 * that only running the real procedure produces: a populated discrimination-sensor
 * (mutation) table and a populated spec-anchored AC table, with no leftover template
 * placeholders. A report that fakes this is now an explicit, auditable false claim
 * instead of a silent omission.
 *
 * Usage:
 *   node check-verification-report.cjs --report <path> [--spec <path>]
 *
 * Options:
 *   --report <path>  Path to qa/validation-<feature>.md
 *   --spec <path>    Design spec to cross-check FR-XXX coverage in the AC table
 *                     (every FR-NNN in the spec must appear in the report's AC table).
 *                     Omit for spec-only features with no FR tags.
 *   --help           Show usage and exit 0
 *
 * Output: single-line JSON on stdout, { valid, errors, warnings }.
 * Exit code: 0 if valid, 1 if invalid.
 */

const fs = require('fs');

const HELP = `
check-verification-report.cjs — Validate a super.independent-verification report's
structural completeness (not just presence of the word PASS).

Usage:
  node check-verification-report.cjs --report <path> [--spec <path>]
`.trimStart();

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  let reportPath = null;
  let specPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--report') reportPath = args[++i];
    else if (args[i] === '--spec') specPath = args[++i];
  }
  if (!reportPath) {
    process.stderr.write('Error: --report <path> is required.\n\nRun with --help for usage.\n');
    process.exit(1);
  }
  return { reportPath, specPath };
}

const PLACEHOLDER_RE = /<(AC-\d|src\/|path\/|feature|N\/M|K\/K|lightweight|YYYY|BASE_SHA|HEAD_SHA)/i;

function extractSection(content, headingRe) {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((l) => headingRe.test(l));
  if (startIndex === -1) return null;
  const rest = lines.slice(startIndex + 1);
  const endOffset = rest.findIndex((l) => /^## /.test(l));
  const body = endOffset === -1 ? rest : rest.slice(0, endOffset);
  return body.join('\n');
}

function tableDataRows(sectionBody) {
  if (!sectionBody) return [];
  return sectionBody
    .split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .filter((l) => !/^\s*\|[\s-:|]+\|\s*$/.test(l)) // drop the |---|---| separator row
    .filter((l) => !/\|\s*(Criterion|#)\s*\|/.test(l)); // drop the header row
}

function main() {
  const { reportPath, specPath } = parseArgs(process.argv);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(reportPath)) {
    const result = { valid: false, errors: [{ message: `Report not found: ${reportPath}` }], warnings: [] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }

  const content = fs.readFileSync(reportPath, 'utf8');

  if (PLACEHOLDER_RE.test(content)) {
    errors.push({ message: 'Report still contains unfilled template placeholders (e.g. <AC-01, <src/..., <BASE_SHA> ...); the template was copied but never populated with real evidence.' });
  }

  const diffRangeMatch = content.match(/\*\*Diff range\*\*:\s*([0-9a-f]{6,40})\.\.([0-9a-f]{6,40})/i);
  if (!diffRangeMatch) {
    errors.push({ message: 'Missing or malformed **Diff range**: <BASE_SHA>..<HEAD_SHA> field.' });
  }

  const acSection = extractSection(content, /^## Spec-Anchored Acceptance Criteria/);
  const acRows = tableDataRows(acSection);
  if (acRows.length === 0) {
    errors.push({ message: 'Spec-Anchored Acceptance Criteria table has no data rows — coverage was not re-derived, only asserted.' });
  }

  const sensorSection = extractSection(content, /^## Discrimination Sensor/);
  const sensorRows = tableDataRows(sensorSection);
  if (sensorRows.length === 0) {
    errors.push({ message: 'Discrimination Sensor table has no data rows — no mutation was actually run, so tests were never proven to catch regressions.' });
  } else {
    const unresolved = sensorRows.filter((r) => !/killed|survived/i.test(r));
    if (unresolved.length > 0) {
      errors.push({ message: `${unresolved.length} Discrimination Sensor row(s) do not report Killed/Survived.` });
    }
  }

  const verdictSection = extractSection(content, /^## Verdict/);
  const verdictMatch = verdictSection && verdictSection.match(/\*\*(PASS ✅|FAIL ❌)\*\*/);
  if (!verdictMatch) {
    errors.push({ message: 'No ## Verdict section with a **PASS ✅** or **FAIL ❌** header line (bare "verdict: pass" text elsewhere in the file does not count).' });
  } else if (verdictMatch[1].startsWith('FAIL')) {
    errors.push({ message: 'Verdict is FAIL — gate must not pass until re-verified.' });
  } else if (sensorRows.some((r) => /survived/i.test(r)) || acRows.some((r) => /❌|⚠️/.test(r))) {
    errors.push({ message: 'Verdict header says PASS but the report itself lists a gap, spec-precision gap, or surviving mutant — self-contradictory report.' });
  }

  if (specPath && fs.existsSync(specPath)) {
    const specContent = fs.readFileSync(specPath, 'utf8');
    const specFrs = [...new Set((specContent.match(/FR-\d{3,}/g) || []))];
    const reportFrs = new Set((content.match(/FR-\d{3,}/g) || []));
    const missing = specFrs.filter((fr) => !reportFrs.has(fr));
    if (missing.length > 0) {
      errors.push({ message: `FR(s) in spec not referenced anywhere in the AC table: ${missing.join(', ')}.` });
    }
  } else if (specPath) {
    warnings.push({ message: `--spec path not found, skipped FR cross-check: ${specPath}` });
  }

  const result = { valid: errors.length === 0, errors, warnings };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.valid ? 0 : 1);
}

main();
