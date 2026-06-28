'use strict';

/**
 * Golden-file guard: the shipped tasks-template.md must stay parseable by the wave parsers.
 *
 * Background: parse-waves.cjs / check-wave-disjoint.cjs originally matched only the English
 * `## Execution Waves` heading while the template emitted `## Ondas de Execução`, so the section
 * was silently ignored. These assertions mirror the script constants (WAVES_HEADER, WAVE_LINE)
 * and fail if the template's heading or wave-bullet shape drifts out of sync with them again
 * (e.g. localizing `**Wave N**` to `**Onda N**`).
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/template-waves-golden.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = path.resolve(__dirname, '..', '..', 'templates', 'tasks-template.md');

// Mirror of the constants in parse-waves.cjs and check-wave-disjoint.cjs. Keep in sync.
const WAVES_HEADER = /^##\s+(?:Execution Waves|Ondas de Execução)\s*$/iu;
const WAVE_LINE = /^-\s+\*\*Wave\s+(\d+)\*\*\s*\([^)]*\)\s*:\s*(.+?)\s*$/iu;

test('the tasks template heading is recognized by WAVES_HEADER', () => {
  const lines = fs.readFileSync(TEMPLATE, 'utf8').split('\n');
  const headingLines = lines.filter((l) => WAVES_HEADER.test(l));
  assert.equal(headingLines.length, 1, 'template must have exactly one waves heading the parser recognizes');
});

test('the tasks template wave bullets are recognized by WAVE_LINE', () => {
  const lines = fs.readFileSync(TEMPLATE, 'utf8').split('\n');
  const waveLines = lines.filter((l) => /^-\s+\*\*Wave/iu.test(l));
  assert.ok(waveLines.length >= 1, 'template should contain at least one example wave bullet');
  for (const line of waveLines) {
    assert.match(line, WAVE_LINE, `wave bullet must match the parser: ${line}`);
  }
});
