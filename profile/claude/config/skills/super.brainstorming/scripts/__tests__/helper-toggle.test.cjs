'use strict'

/**
 * Regression tests for helper.js selection toggling (browser-side glue).
 *
 * Bug: clicking an already-selected option did not deselect it — single-select
 * mode used classList.add unconditionally, so the second click was a no-op.
 *
 * helper.js runs in a browser; here we evaluate it inside a vm sandbox with
 * minimal window/document/WebSocket stubs and exercise window.toggleSelect
 * against fake DOM elements.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const HELPER_SRC = fs.readFileSync(path.join(__dirname, '..', 'helper.js'), 'utf8')

// ---- Minimal DOM stubs ----

function makeClassList(el) {
  return {
    contains: (c) => el.classes.has(c),
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    toggle: (c) => (el.classes.has(c) ? el.classes.delete(c) : el.classes.add(c)),
  }
}

function makeContainer({ multiselect = false } = {}) {
  const container = {
    dataset: multiselect ? { multiselect: '' } : {},
    items: [],
    querySelectorAll: (selector) => {
      if (selector === '.selected') return container.items.filter((i) => i.classes.has('selected'))
      return container.items // '.option, .card'
    },
  }
  return container
}

// Fake Element base class so helper.js's `el instanceof Element` check passes.
class FakeElement {}

function makeOption(choice, container) {
  const el = new FakeElement()
  el.dataset = { choice }
  el.classes = new Set()
  el.closest = () => container
  el.textContent = 'Option ' + choice
  el.id = null
  el.querySelector = () => null
  el.classList = makeClassList(el)
  if (container) container.items.push(el)
  return el
}

// ---- Load helper.js in a sandbox ----

function loadHelper() {
  // Recorded document listeners: [ [capture...], [bubble...] ]
  const listeners = { capture: [], bubble: [] }
  const sandbox = {
    window: {},
    document: {
      addEventListener: (type, fn, capture) => {
        if (type === 'click') listeners[capture ? 'capture' : 'bubble'].push(fn)
      },
      getElementById: () => null,
    },
    Element: FakeElement,
    WeakMap,
    WebSocket: class {
      constructor() {}
      send() {}
    },
    setTimeout: (fn) => fn(),
    Date,
    JSON,
    Array,
  }
  sandbox.WebSocket.OPEN = 1
  sandbox.window.location = { host: 'localhost:0' }
  vm.createContext(sandbox)
  vm.runInContext(HELPER_SRC, sandbox)
  return { win: sandbox.window, listeners }
}

// Simulate a browser click dispatch: capture-phase document listeners run first,
// then the element's own handlers (inline onclick / bespoke scripts), then the
// bubble-phase document listeners.
function dispatchClick(listeners, el, elementHandlers = []) {
  const event = { composedPath: () => [el] }
  listeners.capture.forEach((fn) => fn(event))
  elementHandlers.forEach((fn) => fn(el))
  listeners.bubble.forEach((fn) => fn(event))
}

// ---- Tests ----

test('single-select: clicking selects, clicking again deselects', () => {
  const { win } = loadHelper()
  const container = makeContainer()
  const a = makeOption('a', container)

  win.toggleSelect(a)
  assert.ok(a.classes.has('selected'), 'first click selects')
  assert.strictEqual(win.selectedChoice, 'a')

  win.toggleSelect(a)
  assert.ok(!a.classes.has('selected'), 'second click deselects')
  assert.strictEqual(win.selectedChoice, null)
})

test('single-select: clicking another option moves the selection', () => {
  const { win } = loadHelper()
  const container = makeContainer()
  const a = makeOption('a', container)
  const b = makeOption('b', container)

  win.toggleSelect(a)
  win.toggleSelect(b)
  assert.ok(!a.classes.has('selected'), 'previous selection cleared')
  assert.ok(b.classes.has('selected'), 'new option selected')
  assert.strictEqual(win.selectedChoice, 'b')
})

test('multi-select: each click toggles independently', () => {
  const { win } = loadHelper()
  const container = makeContainer({ multiselect: true })
  const a = makeOption('a', container)
  const b = makeOption('b', container)

  win.toggleSelect(a)
  win.toggleSelect(b)
  assert.ok(a.classes.has('selected') && b.classes.has('selected'), 'both selected')

  win.toggleSelect(a)
  assert.ok(!a.classes.has('selected'), 'a deselected on second click')
  assert.ok(b.classes.has('selected'), 'b stays selected')
})

// ---- Delegated fallback toggle (bespoke screens) ----
//
// Bug: bespoke full-document screens written by the agent often ship their own
// selection script that only ever ADDS the selected class — clicking an
// already-selected option never deselected it. The helper's document-level
// listener now detects "the click changed nothing" and performs the toggle
// itself.

test('delegated: markup-only element (data-choice, no onclick) selects and deselects', () => {
  const { win, listeners } = loadHelper()
  const a = makeOption('a', null) // no container, no inline handler

  dispatchClick(listeners, a)
  assert.ok(a.classes.has('selected'), 'first click selects via delegated fallback')

  dispatchClick(listeners, a)
  assert.ok(!a.classes.has('selected'), 'second click deselects via delegated fallback')
})

test('delegated: does not double-toggle when inline toggleSelect already ran', () => {
  const { win, listeners } = loadHelper()
  const container = makeContainer()
  const a = makeOption('a', container)
  const inlineToggle = (el) => win.toggleSelect(el)

  dispatchClick(listeners, a, [inlineToggle])
  assert.ok(a.classes.has('selected'), 'inline handler selects; fallback must not undo it')

  dispatchClick(listeners, a, [inlineToggle])
  assert.ok(!a.classes.has('selected'), 'inline handler deselects; fallback must not re-select')
})

test('delegated: bespoke add-only selection script still allows deselection', () => {
  const { win, listeners } = loadHelper()
  const a = makeOption('a', null)
  // Typical agent-written bespoke handler: clears siblings, always re-adds.
  const addOnlyHandler = (el) => el.classList.add('selected')

  dispatchClick(listeners, a, [addOnlyHandler])
  assert.ok(a.classes.has('selected'), 'first click selects (bespoke handler changed state, fallback backs off)')

  dispatchClick(listeners, a, [addOnlyHandler])
  assert.ok(!a.classes.has('selected'), 'second click deselects (bespoke handler was a no-op, fallback toggles)')
})
