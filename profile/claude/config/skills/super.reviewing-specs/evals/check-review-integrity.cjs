#!/usr/bin/env node
'use strict';

// check-review-integrity.cjs — deterministic integrity gate for a produced review REPORT.
//
// Why this exists (same lesson as super.brainstorming/evals/check-spec-integrity.cjs):
// a grader subagent reads the review report through its Read tool, and that tool-result
// can be COMPRESSED inside the grader's own context. A grader looking at a compressed
// view can mis-judge an intact report as "truncated/garbled", or — worse for THIS skill —
// mis-count findings. So decide "is this a real, well-formed review report" MECHANICALLY,
// over the raw bytes, before grading its content. A subagent's self-report is not trusted;
// this is. Exit code is always 0; the verdict is the JSON on stdout.
//
// A well-formed review report is EITHER a "needs-changes" report (has a findings section
// with at least one severity-tagged finding) OR an honest "clean" verdict (says, in the
// verdict, that no changes are needed / nothing was found). Both are valid — the whole
// point of this skill is that a clean verdict is a legitimate output, so the gate accepts
// it as intact rather than demanding findings.
//
// Usage:
//   node check-review-integrity.cjs --report <path> [--min-bytes N] [--expect clean|changes]
//
// Checks (deterministic, over the raw file):
//   - file exists and is >= --min-bytes (default 400): catches an empty/truncated write
//   - balanced code fences (```): catches a report cut off mid code block
//   - no U+FFFD replacement char: catches mojibake
//   - exactly one classifiable verdict: either a clean verdict OR >=1 severity tag
//   - when --expect is given, the detected shape matches (clean vs changes)

const fs = require('fs');

// A clean verdict, tolerant of pt-br/en phrasings and diacritics.
const CLEAN_RE = /(sem\s+mudan[çc]as?\s+necess[áa]ri|no\s+changes?\s+needed|nothing\s+(?:to\s+change|found)|nenhum\s+(?:ponto\s+)?(?:aberto|achado|defeito|problema))/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { report: null, minBytes: 400, expect: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') { process.stdout.write('See header comment for usage.\n'); process.exit(0); }
    else if (a === '--report') { out.report = args[++i]; }
    else if (a === '--min-bytes') { out.minBytes = Number.parseInt(args[++i], 10); }
    else if (a === '--expect') { out.expect = args[++i]; }
    else { process.stderr.write(`Unknown arg: ${a}\n`); process.exit(1); }
  }
  if (!out.report) { process.stderr.write('--report <path> is required\n'); process.exit(1); }
  if (out.expect && out.expect !== 'clean' && out.expect !== 'changes') {
    process.stderr.write('--expect must be "clean" or "changes"\n'); process.exit(1);
  }
  return out;
}

function main() {
  const { report, minBytes, expect } = parseArgs(process.argv);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(report)) {
    process.stdout.write(`${JSON.stringify({ report, intact: false, errors: ['file does not exist'], warnings: [] }, null, 2)}\n`);
    process.exit(0);
  }
  const s = fs.readFileSync(report, 'utf8');
  const bytes = Buffer.byteLength(s, 'utf8');

  if (bytes < minBytes) errors.push(`report is only ${bytes} bytes (< ${minBytes}) — likely truncated or empty`);

  const fenceCount = (s.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) errors.push(`unbalanced code fences (${fenceCount}) — a block was cut off`);

  const repl = (s.match(/�/g) || []).length;
  if (repl > 0) errors.push(`${repl} U+FFFD replacement char(s) — encoding corruption / mojibake`);

  const severityCount = (s.match(/(Critical|Important|Minor)\b/gi) || []).length +
    (s.match(/[🔴🟡🟢]/gu) || []).length;

  // The VERDICT is the authoritative clean-vs-changes signal. A raw doc-wide severity scan
  // is unreliable: severity words/emojis appear in NEGATIONS ("Nenhum 🔴 Crítico ou 🟡
  // Importante") and as empty template section headers even in a clean report. So when a
  // "Veredito"/"Verdict" section exists, classify by IT; only fall back to a doc-wide scan
  // when no verdict section is present.
  const lines = s.split(/\r?\n/u);
  let verdictText = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^#{1,6}\s.*\b(veredito|verdict)\b/i.test(lines[i])) {
      const chunk = [lines[i]];
      for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j]); j += 1) chunk.push(lines[j]);
      verdictText = chunk.join('\n');
      break;
    }
  }
  const hasCritImportant = /\b(Critical|Important)\b/i.test(s) || /[🔴🟡]/u.test(s);
  const hasMinor = /\bMinor\b/i.test(s) || /🟢/u.test(s);
  // A blocking finding (Critical/Important) makes a report "changes"; honest-reporting.md
  // allows a sound spec to carry "at most one genuinely-Minor note" and still read clean.
  const cleanVerdict = CLEAN_RE.test(verdictText != null ? verdictText : s);

  let shape = null;
  if (cleanVerdict) shape = 'clean';
  else if (hasCritImportant) shape = 'changes';
  else if (hasMinor) shape = 'clean';
  else errors.push('report has neither a severity-tagged finding nor a clean verdict — unclassifiable / likely incomplete');

  if (expect && shape && shape !== expect) {
    errors.push(`expected a "${expect}" report but detected "${shape}"`);
  }

  const result = {
    report,
    intact: errors.length === 0,
    bytes,
    fenceCount,
    replacementChars: repl,
    shape,
    severityMentions: severityCount,
    errors,
    warnings,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
