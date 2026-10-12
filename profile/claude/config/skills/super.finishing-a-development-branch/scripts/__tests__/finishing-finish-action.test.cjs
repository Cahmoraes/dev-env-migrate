'use strict';

/**
 * finishing-finish-action.test.cjs — the declared finish action replaces the menu.
 *
 * Measured across 54 real sessions (2026-08/09): the finishing menu ("Implementation
 * complete. What would you like to do? 1-4") was the single largest wait in the pipeline —
 * 247 minutes of the 7.6 h users spent answering the assistant, because the question lands
 * hours after the user walked away from a long execution. `workflow.finish_action` lets the
 * destination be declared before the work starts; this file pins the contract that makes the
 * preference matter: (1) Step 4 reads `session_finish_action` and skips the menu when it is
 * not `ask`; (2) the mapping to each environment's menu is explicit; (3) discard is never a
 * value — the loader, the writer and the prose all refuse it.
 *
 * Run: node --test super.finishing-a-development-branch/scripts/__tests__/finishing-finish-action.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');
const body = read('super.finishing-a-development-branch/SKILL.md');

test('Step 4 gates the menu on session_finish_action, before any menu is rendered', () => {
  const step4 = body.indexOf('### Step 4: Present Options');
  const menu = body.indexOf('present exactly these 4 options', step4);
  const gate = body.indexOf('session_finish_action', step4);
  assert.ok(step4 !== -1 && menu !== -1 && gate !== -1, 'Step 4, its menu and the gate must all exist');
  assert.ok(gate < menu, 'the declared finish action must be read BEFORE the first menu, or the menu is shown anyway');
  assert.match(body.slice(step4, menu), /do not present the menu/i,
    'a declared action must skip the menu, not merely pre-select an option in it');
});

test('every declared value maps to an option of every environment menu, and merge on detached HEAD falls back to ask', () => {
  const step4 = body.slice(body.indexOf('### Step 4: Present Options'), body.indexOf('### Step 5'));
  assert.match(step4, /standard menu `merge`→1, `pr`→2, `keep`→3/, 'standard menu mapping');
  assert.match(step4, /on-base-branch menu `merge`→1 \(push to base\), `pr`→2, `keep`→3/, 'on-base-branch mapping');
  assert.match(step4, /detached HEAD `pr`→1, `keep`→2/, 'detached-HEAD mapping');
  assert.match(step4, /`merge` has no safe equivalent there → fall back to `ask`/,
    'a value with no safe equivalent must degrade to the menu, never to an improvised action');
  assert.match(step4, /with every guard, test re-run and halt of that option unchanged/,
    'applying the preference must not weaken the option it applies');
});

test('discard is never a preference value — prose, loader and writer all refuse it', () => {
  assert.match(body, /`discard` is never a preference value and is never automatic/,
    'the prose must say discard cannot be declared');
  assert.match(body, /never because of a preference: `session_finish_action` has no discard value/,
    'the Red Flag must close the same door');
  const { DEFAULTS, VALID_FINISH_ACTIONS, normalizeFinishAction } = require(
    path.join(SKILLS, 'super.using-superpowers', 'scripts', 'read-preferences.cjs'),
  );
  assert.equal(DEFAULTS.workflow.finish_action, 'ask', 'the default must keep today\'s behaviour (the menu)');
  assert.ok(!VALID_FINISH_ACTIONS.includes('discard'), 'discard must not be a valid value');
  const prefs = { workflow: { finish_action: 'discard' } };
  const notes = normalizeFinishAction(prefs);
  assert.equal(prefs.workflow.finish_action, 'ask', 'a hand-edited discard must clamp to ask');
  assert.equal(notes.length, 1, 'the clamp must be reported, not silent');
});

test('the preferences view (option 0) prints the finish action as an outcome, so a declared merge/PR is never a surprise', () => {
  const { renderRows } = require(path.join(SKILLS, 'super.using-superpowers', 'scripts', 'render-preferences-view.cjs'));
  const row = (action) => renderRows({ platform: 'claude-code', sessionState: { session_finish_action: action } }, 'pt-BR')
    .find((r) => /Ao finalizar/.test(r));
  assert.match(row('ask'), /\*\*perguntar\*\*/);
  assert.match(row('merge'), /\*\*merge local\*\*/);
  assert.match(row('pr'), /\*\*push \+ PR\*\*/);
  assert.match(row('keep'), /\*\*manter branch\*\*/);
});

test('Step 2 reuses a green when nothing the suite reads moved, instead of re-running on every HEAD move', () => {
  const step2 = body.slice(body.indexOf('### Step 2:'), body.indexOf('### Step 3:'));
  assert.match(step2, /counts when `git status --porcelain` is empty and nothing the suite reads moved since it/,
    'the reuse condition must be stated with both halves — clean tree and no source change since the green');
  // Bookkeeping commits (tracker status, QA evidence, reports) land after the checkpoint on every
  // feature; keying the re-run on "HEAD moved" re-ran a 2-3 minute suite over docs-only commits.
  assert.match(step2, /git diff --stat <green-sha> HEAD -- \. ':\(exclude\)docs\/superpowers'/,
    'the "did source move" check must be a fenced command excluding the feature tree, not an eyeball');
  assert.match(step2, /Non-empty, no green named this turn, or a dirty tree → run the suite now/,
    'the fallback to a real run must be explicit, or the reuse reads as a licence to skip');
  assert.match(step2, /say in one line which one/i, 'the reused green must be named, not assumed');
});
