'use strict';

/**
 * Tests for get-current-datetime.cjs — host-clock ISO 8601 with timezone offset.
 *
 * Runs the CLI under fixed TZ values so both branches of the offset sign are exercised.
 * Etc/GMT zones are always present in tzdata and have inverted signs:
 *   Etc/GMT-9 → UTC+09:00, Etc/GMT+3 → UTC-03:00.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/get-current-datetime.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'get-current-datetime.cjs');

function runWithTz(tz) {
  return execFileSync('node', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, TZ: tz },
  }).trim();
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u;

test('emits ISO 8601 with timezone offset (UTC → +00:00)', () => {
  const out = runWithTz('UTC');
  assert.match(out, ISO_WITH_OFFSET);
  assert.ok(out.endsWith('+00:00'), `expected +00:00 offset, got ${out}`);
});

test('positive offset branch (UTC+09:00)', () => {
  const out = runWithTz('Etc/GMT-9');
  assert.match(out, ISO_WITH_OFFSET);
  assert.ok(out.endsWith('+09:00'), `expected +09:00 offset, got ${out}`);
});

test('negative offset branch (UTC-03:00)', () => {
  const out = runWithTz('Etc/GMT+3');
  assert.match(out, ISO_WITH_OFFSET);
  assert.ok(out.endsWith('-03:00'), `expected -03:00 offset, got ${out}`);
});

test('all date/time components are zero-padded to two digits', () => {
  const out = runWithTz('UTC');
  const [datePart, timePart] = out.split('T');
  const [y, mo, d] = datePart.split('-');
  assert.equal(y.length, 4);
  assert.equal(mo.length, 2);
  assert.equal(d.length, 2);
  const [h, mi, s] = timePart.slice(0, 8).split(':');
  assert.equal(h.length, 2);
  assert.equal(mi.length, 2);
  assert.equal(s.length, 2);
});
