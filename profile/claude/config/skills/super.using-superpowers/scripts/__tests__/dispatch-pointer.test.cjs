'use strict';

// Tests lib/dispatch-pointer.cjs — the single wording of the one-line prompt the dispatch
// scripts emit, and that every build-*-dispatch script actually uses it (a script with its own
// copy of the sentence is how the wording drifts back to the one the controller obeyed).
//
// Run: node --test super.using-superpowers/scripts/__tests__/dispatch-pointer.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pointerPrompt, promptFileOf, AGENT, DISPATCHER } = require('../lib/dispatch-pointer.cjs');

const SKILLS = path.resolve(__dirname, '..', '..', '..');

test('the pointer names both readers and gives each its own action, in one line', () => {
  const p = pointerPrompt('/tmp/superpowers-qa-dispatch-x/qa-a.md');
  assert.ok(!p.includes('\n'));
  assert.ok(p.includes('/tmp/superpowers-qa-dispatch-x/qa-a.md'));
  assert.ok(p.includes(AGENT) && p.includes(DISPATCHER));
  assert.match(DISPATCHER, /send this prompt unchanged and do not open the file/);
  assert.ok(!/Your complete instructions|Read that file in full/.test(p), 'the wording the controller obeyed is gone');
});

test('promptFileOf round-trips, and refuses anything that is not exactly a pointer', () => {
  const file = '/tmp/dir with space/review-lead.md';
  assert.equal(promptFileOf(pointerPrompt(file)), file);
  assert.equal(promptFileOf('Read /tmp/x.md and follow it'), null);
  assert.equal(promptFileOf(`${pointerPrompt('/tmp/x.md')}\nextra`), null);
  assert.equal(promptFileOf(pointerPrompt('/tmp/x.md').replace('/tmp/x.md', 'relative.md')), null);
  assert.throws(() => pointerPrompt('relative/qa.md'), /absolute/);
});

test('every build-*-dispatch script takes its pointer from the lib, never from a copy of the sentence', () => {
  const scripts = fs.readdirSync(SKILLS)
    .filter((d) => d.startsWith('super.'))
    .flatMap((d) => {
      const dir = path.join(SKILLS, d, 'scripts');
      return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^build-.*-dispatch\.cjs$/.test(f)).map((f) => path.join(dir, f)) : [];
    });
  assert.ok(scripts.length >= 4, `anti-staleness floor: expected >= 4 dispatch scripts, found ${scripts.length}`);
  for (const file of scripts) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SKILLS, file);
    assert.match(src, /require\([^)]*lib\/dispatch-pointer\.cjs['"]\)/, `${rel} must require lib/dispatch-pointer.cjs`);
    assert.ok(!/instructions for this dispatch are in|Read that file in full/i.test(src), `${rel} still carries its own pointer sentence`);
  }
});
