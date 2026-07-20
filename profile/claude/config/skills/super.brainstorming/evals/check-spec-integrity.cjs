#!/usr/bin/env node
'use strict';

// check-spec-integrity.cjs — deterministic integrity gate for a produced eval spec.
//
// Why this exists: a grader subagent reads the spec through its Read tool, and that
// tool-result can be COMPRESSED inside the grader's own context. A grader that sees a
// compressed/truncated view can mis-report the artifact as "materially corrupted" — and,
// because closure assertions are phrase-keyed, still pass it. So "is the artifact intact"
// must be decided MECHANICALLY against the raw bytes on disk, not by a grader's eyeball.
// Run this on each produced spec BEFORE grading; a FAIL here means re-run the executor,
// not the grader. A subagent's self-reported corruption is not trustworthy — this is.
//
// Usage:
//   node check-spec-integrity.cjs --spec <path> [--min-bytes N] [--min-h2 N] [--require "Sec A" --require "Sec B"]
//
// Checks (all deterministic, over the raw file):
//   - file exists and is >= --min-bytes (default 2000): catches an empty/truncated write
//   - code fences (```) are balanced: catches a write cut off mid code block
//   - no U+FFFD replacement char: catches mojibake/encoding corruption
//   - at least --min-h2 (default 4) "## " sections: catches a spec missing whole sections
//   - every --require <heading> substring is present: catches a specific dropped section
//   - last non-empty line ends in sentence-final punctuation or a fence/table/list token:
//     a soft signal (warning, not failure) for a mid-sentence truncation
//
// Exit code is always 0; the verdict is the JSON on stdout (superpowers script convention).

const fs = require('fs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { spec: null, minBytes: 2000, minH2: 4, require: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') { process.stdout.write('See header comment for usage.\n'); process.exit(0); }
    else if (a === '--spec') { out.spec = args[++i]; }
    else if (a === '--min-bytes') { out.minBytes = Number.parseInt(args[++i], 10); }
    else if (a === '--min-h2') { out.minH2 = Number.parseInt(args[++i], 10); }
    else if (a === '--require') { out.require.push(args[++i]); }
    else { process.stderr.write(`Unknown arg: ${a}\n`); process.exit(1); }
  }
  if (!out.spec) { process.stderr.write('--spec <path> is required\n'); process.exit(1); }
  return out;
}

function main() {
  const { spec, minBytes, minH2, require: required } = parseArgs(process.argv);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(spec)) {
    process.stdout.write(`${JSON.stringify({ spec, intact: false, errors: ['file does not exist'], warnings: [] }, null, 2)}\n`);
    process.exit(0);
  }
  const s = fs.readFileSync(spec, 'utf8');
  const bytes = Buffer.byteLength(s, 'utf8');

  if (bytes < minBytes) errors.push(`spec is only ${bytes} bytes (< ${minBytes}) — likely truncated or empty`);

  const fenceCount = (s.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) errors.push(`unbalanced code fences (${fenceCount}) — a code block was cut off`);

  const repl = (s.match(/�/g) || []).length;
  if (repl > 0) errors.push(`${repl} U+FFFD replacement char(s) — encoding corruption / mojibake`);

  const h2 = (s.match(/^##\s/gmu) || []).length;
  if (h2 < minH2) errors.push(`only ${h2} '## ' section(s) (< ${minH2}) — whole sections may be missing`);

  for (const heading of required) {
    if (!s.includes(heading)) errors.push(`required section/marker not found: "${heading}"`);
  }

  const nonEmpty = s.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  const last = nonEmpty.length ? nonEmpty[nonEmpty.length - 1].trim() : '';
  // A complete doc's last line usually ends a sentence, a table row, a list item, or a fence.
  if (last && !/[.!?:)*_`"'\]|-]$/u.test(last)) {
    warnings.push(`last non-empty line does not end on a sentence/table/list boundary — possible mid-sentence truncation: "${last.slice(-60)}"`);
  }

  const result = { spec, intact: errors.length === 0, bytes, fenceCount, h2, replacementChars: repl, errors, warnings };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

main();
