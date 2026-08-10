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
  // A feature run with workflow.auto_commit:false (or on a platform without git) has no SHA range.
  // Declaring WORKING-TREE keeps the field honest instead of making the gate unsatisfiable, which
  // is what pushed runtimes to skip this script altogether.
  const workingTreeRange = /\*\*Diff range\*\*:\s*WORKING-TREE\b/i.test(content);
  if (!diffRangeMatch && !workingTreeRange) {
    errors.push({ message: 'Missing or malformed **Diff range**: <BASE_SHA>..<HEAD_SHA> field (use "WORKING-TREE — <reason>" when the feature was never committed, e.g. workflow.auto_commit: false).' });
  }

  const verifierMatch = content.match(/\*\*Verifier\*\*:\s*(INDEPENDENT|SELF-DEGRADED)\b/i);
  if (!verifierMatch) {
    errors.push({ message: 'Missing **Verifier**: INDEPENDENT | SELF-DEGRADED field — the report must state whether author != verifier actually held.' });
  }
  const selfDegraded = Boolean(verifierMatch) && /SELF-DEGRADED/i.test(verifierMatch[1]);

  const depthLineMatch = content.match(/^\*\*Sensor depth\*\*:.*$/m);
  const depthLine = depthLineMatch ? depthLineMatch[0] : '';
  const depthMatch = depthLine.match(/\*\*Sensor depth\*\*:\s*(\d+)\s+mutations?\s+across\s+(\d+)\s+logic files?/i);
  if (!depthMatch) {
    errors.push({ message: 'Missing **Sensor depth**: <N> mutations across <M> logic files — the sensor must declare its planned coverage of the diff.' });
  } else {
    const mutations = Number(depthMatch[1]);
    const logicFiles = Number(depthMatch[2]);
    if (mutations < 3) {
      errors.push({ message: `Sensor depth ${mutations} is below the floor of 3 mutations.` });
    }
    if (mutations < logicFiles && mutations < 10) {
      errors.push({ message: `Sensor depth ${mutations} covers fewer mutations than the ${logicFiles} logic files in the diff; every new logic file needs at least one mutation (cap 10).` });
    }

    // Per-file proportional depth: the floor above only proves every file got
    // SOME mutation, not that a dense file got enough of them. A file's own
    // branch/operator count sets its own minimum, so a 12-branch file can't
    // hide survivors behind the same single mutation a 1-branch file uses to
    // satisfy the floor (benchmark 2026-07-25: hash-to-bucket.ts and
    // lru-ttl-cache.ts each concentrated 5 survivors despite meeting the floor).
    const breakdownEntries = [...depthLine.matchAll(/([\w./-]+):\s*(\d+)\s*\/\s*(\d+)\s*branch(?:es)?/gi)];
    if (breakdownEntries.length === 0) {
      errors.push({ message: 'Sensor depth is missing the per-file branch/operator breakdown (e.g. "cache.ts: 3/6 branches") — depth must be proportional to each file\'s branches/operators, not just its existence in the diff.' });
    } else {
      if (breakdownEntries.length !== logicFiles) {
        errors.push({ message: `Sensor depth declares ${logicFiles} logic file(s) but the breakdown lists ${breakdownEntries.length} — every logic file counted in the total must appear in the breakdown.` });
      }
      const sumMutations = breakdownEntries.reduce((sum, [, , m]) => sum + Number(m), 0);
      if (sumMutations !== mutations) {
        errors.push({ message: `Sensor depth breakdown sums to ${sumMutations} mutations but the declared total is ${mutations} — they must match.` });
      }
      for (const [, file, mutationsStr, branchesStr] of breakdownEntries) {
        const fileMutations = Number(mutationsStr);
        const branches = Number(branchesStr);
        const required = Math.max(1, Math.min(5, Math.ceil(branches / 3)));
        if (fileMutations < required) {
          errors.push({ message: `${file} declares ${branches} branches/operators but only ${fileMutations} mutation(s) — proportional depth requires at least ${required} for a file this dense (~1 per 3 branches, capped at 5).` });
        }
      }
    }
  }

  const acSection = extractSection(content, /^## Spec-Anchored Acceptance Criteria/);
  const acRows = tableDataRows(acSection);
  if (acRows.length === 0) {
    errors.push({ message: 'Spec-Anchored Acceptance Criteria table has no data rows — coverage was not re-derived, only asserted.' });
  }

  const sensorSection = extractSection(content, /^## Discrimination Sensor/);
  const sensorRows = tableDataRows(sensorSection);
  // A row marked "Equivalent" is a documented exception, not a plain survivor: no
  // input can ever make the mutant observable (an invariant enforced elsewhere
  // guarantees it), so no test can kill it. Only rows that are neither killed nor
  // backed by such a proof count as bare survivors for the self-contradiction check
  // below - the escape hatch must stay effortful (see the Equivalent Mutants check).
  const equivalentRows = sensorRows.filter((r) => /equivalent/i.test(r));
  const bareSurvivedRows = sensorRows.filter((r) => /survived/i.test(r) && !/equivalent/i.test(r));
  if (sensorRows.length === 0) {
    errors.push({ message: 'Discrimination Sensor table has no data rows — no mutation was actually run, so tests were never proven to catch regressions.' });
  } else {
    const unresolved = sensorRows.filter((r) => !/killed|survived|equivalent/i.test(r));
    if (unresolved.length > 0) {
      errors.push({ message: `${unresolved.length} Discrimination Sensor row(s) do not report Killed/Survived.` });
    }
    // An executed mutation always has a concrete target. Rows without one were reasoned about
    // ("this mutation would break test X") rather than injected and run.
    const withoutLocation = sensorRows.filter((r) => !/[\w./-]+\.\w+:\d+/.test(r));
    if (withoutLocation.length > 0) {
      errors.push({ message: `${withoutLocation.length} Discrimination Sensor row(s) carry no file:line — a mutation that was actually executed always has one; a predicted result is not a sensor reading.` });
    }
  }

  // Equivalent-mutant escape hatch (2026-07-25 validation benchmark): every row marked
  // "Equivalent" needs its own ## Equivalent Mutants block proving WHY no test can ever
  // kill it (an invariant) AND that a kill was actually attempted, not assumed impossible.
  // This keeps the exception auditable instead of a label an agent can slap on any
  // inconvenient survivor to force a PASS.
  if (equivalentRows.length > 0) {
    const eqSection = extractSection(content, /^## Equivalent Mutants/);
    const eqBlocks = eqSection
      ? eqSection.split(/\n(?=### EQ-)/).filter((b) => /^### EQ-/.test(b.trim()))
      : [];
    if (eqBlocks.length < equivalentRows.length) {
      errors.push({ message: `${equivalentRows.length} sensor row(s) marked "Equivalent" but only ${eqBlocks.length} ## Equivalent Mutants block(s) found — every accepted-equivalent survivor needs its own EQ-NN justification block.` });
    }
    const isPlaceholder = (v) => !v || v.trim().length === 0 || /^<.*>$/.test(v.trim());
    for (const block of eqBlocks) {
      const locMatch = block.match(/[\w./-]+\.\w+:\d+/);
      const invariantMatch = block.match(/\*\*Invariant\*\*:\s*(.+)/);
      const attemptedMatch = block.match(/\*\*Attempted\*\*:\s*(.+)/);
      if (!locMatch) {
        errors.push({ message: 'An Equivalent Mutants block has no file:line — cannot cross-check it against a sensor row.' });
      } else if (!equivalentRows.some((r) => r.includes(locMatch[0]))) {
        errors.push({ message: `Equivalent Mutants block for ${locMatch[0]} does not match any sensor row marked "Equivalent" at that location.` });
      }
      if (!invariantMatch || isPlaceholder(invariantMatch[1])) {
        errors.push({ message: 'An Equivalent Mutants block is missing a real **Invariant** justification (why no test can ever kill this mutant).' });
      }
      if (!attemptedMatch || isPlaceholder(attemptedMatch[1])) {
        errors.push({ message: 'An Equivalent Mutants block is missing **Attempted** — proof that a kill was actually tried, not assumed impossible.' });
      }
    }
  }

  // ── Pre-existing failures must leave an actionable trace ───────────────────
  //
  // A red gate can legitimately still PASS: some failures genuinely predate the diff.
  // What cannot stand is accepting them in prose alone. Observed: a report justified
  // "2 failed - exit 1" as "exactly the pre-existing, unrelated ones" and passed. The
  // measurement had really been done, but nothing in the artifact was actionable, and a
  // second waved-through breakage (a code-generation script, waved through as
  // "pre-existing, out of scope") resurfaced as a post-merge fix the next morning.
  //
  // So the rule is not "no red gates" — it is "a red gate names every failure and the
  // baseline SHA it was measured on". That converts a disappearing sentence into a list
  // someone can act on, at the cost of one small table.
  const gateSection = extractSection(content, /^## Gate Check/);
  if (gateSection) {
    const failedMatch = gateSection.match(/(\d+)\s+failed/i);
    const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    if (failedCount > 0) {
      const preExisting = extractSection(content, /^## Pre-Existing Failures/);
      if (!preExisting) {
        errors.push({
          message:
            `Gate Check reports ${failedCount} failing test(s) but there is no ## Pre-Existing Failures `
            + 'section. A red gate may still PASS, but every failure must be registered with the baseline '
            + 'SHA it was measured on — accepting it in prose leaves nothing anyone can act on later.',
        });
      } else {
        const rows = preExisting
          .split('\n')
          .filter((l) => l.trim().startsWith('|') && !/^\|\s*-+/.test(l.trim()))
          .filter((l) => !/failing test/i.test(l));

        if (rows.length < failedCount) {
          errors.push({
            message:
              `Gate Check reports ${failedCount} failing test(s) but ## Pre-Existing Failures registers only `
              + `${rows.length}. Every failure needs its own row — an unlisted one is indistinguishable from `
              + 'a regression this diff introduced.',
          });
        }

        for (const row of rows) {
          const cells = row.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
          const sha = cells[1] || '';
          if (!/[0-9a-f]{7,40}/i.test(sha)) {
            errors.push({
              message:
                'A ## Pre-Existing Failures row carries no baseline SHA. "it was already broken" is an '
                + 'assertion; the SHA the failure was reproduced on is the evidence that makes it one.',
            });
          }
        }
      }
    }

    // Where the green came from. A blind Verifier is told it MAY reuse the previous
    // gate's full-suite green, but it can only reuse evidence it was actually handed -
    // so when the dispatch carries none, re-running is the correct branch and the cost
    // is invisible. Measured 2026-08-03: two Verifier dispatches ran the full suite
    // twice each, ~143s of it purely to re-establish a green that already existed at
    // the same SHA, repeated again on the re-verify round.
    //
    // Requiring the field does not force reuse - the tree may genuinely have moved.
    // It forces the choice to be VISIBLE and, when it claims inheritance, traceable:
    // an inherited green with no SHA is exactly the unevidenced claim this whole gate
    // exists to reject.
    const blMatch = gateSection.match(/^\s*[-*]?\s*\*\*Baseline\*\*\s*:\s*(.+)$/im);
    if (!blMatch) {
      errors.push({
        message:
          'Gate Check has no **Baseline** field. State whether the green was executed here ("ran") '
          + 'or inherited from the gate before you ("reused from <source> @ <sha>") — an unstated '
          + 'baseline hides both a re-run nobody needed and a reuse nobody can audit.',
      });
    } else {
      const bl = blMatch[1].trim();
      if (bl.startsWith('<')) {
        errors.push({ message: 'Gate Check\'s **Baseline** field is still the template placeholder — the line was copied but never answered.' });
      } else if (/reus|inherit|previous|anterior|reaproveit/i.test(bl) && !/[0-9a-f]{7,40}/i.test(bl)) {
        errors.push({
          message:
            'Gate Check claims a reused baseline but names no SHA. "already green" is an assertion; '
            + 'the SHA it was measured on is what makes it evidence — and what proves the tree had '
            + 'not moved since.',
        });
      }
    }

    // Typecheck/build is the one gate scoped tests structurally cannot cover: a type
    // error crosses module boundaries, so a suite scoped to the diff's own files stays
    // green while the consumer breaks. The template has always called "not run / out of
    // scope" unacceptable — but only in prose, so nothing enforced it. A real report
    // answered "não executado nesta verificação (fora do escopo do dispatch)" and waved
    // through a broken client generator; it came back as a post-merge fix the next morning.
    //
    // Two states are acceptable and they are not the same: an outcome (the command ran),
    // or the literal escape hatch (the project defines no such script). "I chose not to
    // run it" is neither.
    const tcMatch = gateSection.match(/^\s*[-*]?\s*\*\*Typecheck\/build\*\*\s*:\s*(.+)$/im);
    if (!tcMatch) {
      errors.push({
        message:
          'Gate Check has no **Typecheck/build** field. Scoped tests cannot see a cross-module type '
          + 'error, so its absence is not a neutral omission — it is the one breakage class the rest '
          + 'of this report structurally cannot rule out.',
      });
    } else if (tcMatch[1].trim().startsWith('<')) {
      // The template's own guidance text quotes the refusal phrasings it forbids, so an
      // unfilled placeholder would otherwise be reported as "you answered not run" —
      // true-ish, but it sends the verifier to fix the wrong thing.
      errors.push({
        message:
          'Gate Check\'s **Typecheck/build** field is still the template placeholder — the line was '
          + 'copied but never answered.',
      });
    } else if (/n[ãa]o\s+(?:foi\s+)?executad|not\s+run|fora\s+do\s+escopo|out\s+of\s+scope|\bskipped\b|\bn\/a\b/i.test(tcMatch[1])) {
      errors.push({
        message:
          'Gate Check answers **Typecheck/build** with "not run / out of scope". Out of scope is not a '
          + 'result: report the outcome of running it, or state that the project defines no such script. '
          + 'A type error is exactly the cross-cutting breakage the scoped tests above cannot see.',
      });
    }
  }

  const verdictSection = extractSection(content, /^## Verdict/);
  const verdictMatch = verdictSection && verdictSection.match(/\*\*(PASS ✅|FAIL ❌)\*\*/);
  if (!verdictMatch) {
    errors.push({ message: 'No ## Verdict section with a **PASS ✅** or **FAIL ❌** header line (bare "verdict: pass" text elsewhere in the file does not count).' });
  } else if (verdictMatch[1].startsWith('FAIL')) {
    errors.push({ message: 'Verdict is FAIL — gate must not pass until re-verified.' });
  } else if (bareSurvivedRows.length > 0 || acRows.some((r) => /❌|⚠️/.test(r))) {
    errors.push({ message: 'Verdict header says PASS but the report itself lists a gap, spec-precision gap, or surviving mutant — self-contradictory report.' });
  } else if (selfDegraded) {
    errors.push({ message: 'Verdict is PASS but **Verifier** is SELF-DEGRADED (author == verifier) — a self-verified run cannot satisfy the Iron Law. Report it as PASS (degraded) and re-run with a fresh verifier before finishing the branch.' });
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
