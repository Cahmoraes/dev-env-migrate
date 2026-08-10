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
  el.closest = (sel) => {
    if (sel === '.options' || sel === '.cards') return container
    if (sel === '[data-multiselect]') return container && container.dataset.multiselect !== undefined ? container : null
    return null
  }
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
  // Events the helper pushed over the socket, parsed.
  const sent = []
  // Stand-in for the live document: elements a test registers here live OUTSIDE any
  // shadow tree (a full document that bypasses the frame template).
  const docElements = []
  // The live socket instance, so a test can push a server message the way the server
  // does, and the indicator element the helper repaints.
  const socket = { instance: null, win: null }
  const indicator = { textContent: '', innerHTML: '' }
  const status = { textContent: 'Connected' }
  const submitBtn = {
    hidden: true, disabled: true, textContent: '', id: 'companion-submit',
    classList: { add: () => {}, remove: () => {} },
  }
  // The frame template moves all injected content into a Shadow DOM so content <style>
  // tags cannot override the frame chrome. Modelling that boundary is the whole point:
  // `document.querySelectorAll` does NOT cross it, and a stub where document reaches
  // everything is a stub of a world that does not exist — it passed while production
  // silently reported an empty selection on every bespoke click.
  const shadow = {
    elements: [],
    querySelectorAll: (sel) => {
      if (sel === '[data-choice].selected') {
        return shadow.elements.filter((el) => el.dataset && el.dataset.choice && el.classes.has('selected'))
      }
      return shadow.elements
    },
  }
  const sandbox = {
    window: {},
    document: {
      addEventListener: (type, fn, capture) => {
        if (type === 'click') listeners[capture ? 'capture' : 'bubble'].push(fn)
      },
      getElementById: (id) => (id === 'indicator-text' ? indicator : (id === 'companion-submit' ? submitBtn : null)),
      querySelector: (sel) => (sel === '.status' ? status : null),
      body: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } }),
      querySelectorAll: (sel) => {
        if (sel === '[data-choice].selected') {
          return docElements.filter((el) => el.dataset && el.dataset.choice && el.classes.has('selected'))
        }
        return docElements
      },
    },
    Element: FakeElement,
    WeakMap,
    WebSocket: class {
      constructor() {
        this.readyState = 1 // OPEN, so sendEvent writes through instead of queueing
        socket.instance = this
      }
      send(payload) {
        sent.push(JSON.parse(payload))
      }
    },
    setTimeout: (fn) => fn(),
    Date,
    JSON,
    Array,
  }
  sandbox.WebSocket.OPEN = 1
  // A real reload tears the helper down and builds a new one, which is precisely how a
  // new screen clears the commit lock. In-process we can only record that the helper
  // asked for it; the "fresh instance starts unlocked" half is covered by every other
  // test in this file starting from loadHelper().
  const reloads = { count: 0 }
  sandbox.window.location = { host: 'localhost:0', reload: () => { reloads.count += 1 } }
  sandbox.window.__brainstormShadow = shadow
  vm.createContext(sandbox)
  vm.runInContext(HELPER_SRC, sandbox)
  socket.win = sandbox.window
  return { win: sandbox.window, listeners, sent, docElements, shadow, socket, indicator, status, submitBtn, reloads }
}

/**
 * A clickable panel from a BESPOKE mockup: carries data-choice, but has no
 * .options/.cards ancestor — which is the only markup the Layout gate permits for a
 * positioning/layout question.
 *
 * It mounts inside the SHADOW ROOT, because that is where the frame template puts it.
 * Mounting it in the document instead is what made these tests green while the real
 * thing was broken.
 */
function makeBespokePanel(choice, mount) {
  const el = new FakeElement()
  el.dataset = { choice }
  el.classes = new Set()
  el.closest = () => null
  el.getRootNode = () => mount
  el.textContent = 'Panel ' + choice
  el.id = null
  el.querySelector = () => null
  el.classList = makeClassList(el)
  mount.elements.push(el)
  return el
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

// ---- Selection reporting in bespoke layouts ----
//
// Real session (.superpowers/brainstorm/6191-1785176348): the model rendered a bespoke
// side-by-side mockup — the ONLY markup the Layout gate allows for a layout question —
// and every event it produced said `selected: true` alongside `selectedChoices: []`.
// Root cause: selectedChoices was scoped to `target.closest('.options') || .closest('.cards')`,
// and a bespoke panel has neither, so the peer set was empty. The documented contract
// ("read the last event's selectedChoices to know the final selection") was therefore
// broken on exactly the path the gate mandates — and check-visual-state's finalSelection
// inherits it, so the model was told "nothing selected" when a panel WAS selected.

test('bespoke panel: a selected element is never reported with an empty selectedChoices', () => {
  const { listeners, sent, shadow } = loadHelper()
  const a = makeBespokePanel('centered-dialog', shadow)

  dispatchClick(listeners, a)

  assert.strictEqual(sent.length, 1, 'the click produced one event')
  assert.strictEqual(sent[0].selected, true, 'the panel is selected')
  assert.deepStrictEqual(
    sent[0].selectedChoices,
    ['centered-dialog'],
    'selectedChoices must agree with selected — an empty set here is the reported bug'
  )
})

test('bespoke panels are peers: selecting one clears the other (single-select)', () => {
  const { listeners, sent, shadow } = loadHelper()
  const a = makeBespokePanel('centered-dialog', shadow)
  const b = makeBespokePanel('bottom-sheet', shadow)

  dispatchClick(listeners, a)
  dispatchClick(listeners, b)

  assert.ok(!a.classes.has('selected'), 'the first panel was cleared')
  assert.ok(b.classes.has('selected'), 'the second panel is selected')
  assert.deepStrictEqual(sent[sent.length - 1].selectedChoices, ['bottom-sheet'])
})

test('bespoke panel: deselecting reports an empty selection honestly', () => {
  const { listeners, sent, shadow } = loadHelper()
  const a = makeBespokePanel('bottom-sheet', shadow)

  dispatchClick(listeners, a)
  dispatchClick(listeners, a)

  assert.strictEqual(sent[1].selected, false)
  assert.deepStrictEqual(sent[1].selectedChoices, [], 'genuinely nothing selected now')
})

test('bespoke multiselect: an ancestor carrying data-multiselect keeps both selected', () => {
  const { listeners, sent, shadow } = loadHelper()
  const wrapper = { dataset: { multiselect: '' } }
  const a = makeBespokePanel('a', shadow)
  const b = makeBespokePanel('b', shadow)
  for (const el of [a, b]) el.closest = (sel) => (sel === '[data-multiselect]' ? wrapper : null)

  dispatchClick(listeners, a)
  dispatchClick(listeners, b)

  assert.ok(a.classes.has('selected') && b.classes.has('selected'), 'both stay selected')
  assert.deepStrictEqual(sent[sent.length - 1].selectedChoices.sort(), ['a', 'b'])
})

test('container-scoped screens still report only their own container peers', () => {
  const { listeners, sent, shadow } = loadHelper()
  const container = makeContainer()
  const a = makeOption('a', container)
  // A stray selected panel elsewhere in the document must NOT leak into the report.
  const stray = makeBespokePanel('stray', shadow)
  stray.classes.add('selected')

  dispatchClick(listeners, a, [(el) => makeHelperToggle(el)])

  function makeHelperToggle(el) { el.classList.add('selected') }
  assert.deepStrictEqual(sent[sent.length - 1].selectedChoices, ['a'], 'container scope wins when present')
})

test('the server-pushed indicator repaint reads through the shadow boundary too', () => {
  // The click path passes its own scoped peer set, so it masks this. A repaint driven by
  // the server's `agent-waiting` message has NO element to scope from and must resolve
  // the shadow root on its own — querying `document` there reports "nothing selected"
  // on every bespoke screen, which is the same class of bug one layer over.
  const { listeners, shadow, socket, indicator } = loadHelper()
  const a = makeBespokePanel('bottom-sheet', shadow)
  dispatchClick(listeners, a)

  socket.instance.onmessage({ data: JSON.stringify({ type: 'agent-waiting', waiting: true }) })

  assert.match(indicator.innerHTML, /bottom-sheet selected/, 'the repaint still sees the selection')
  // The call to action names the CONFIRMATION, not the click. A selection sitting on
  // screen has NOT been sent yet, and saying otherwise is how a misclick becomes a
  // decision nobody made — the same reason the agent waits for submit.
  assert.match(indicator.innerHTML, /press Send to answer/, 'and asks for an explicit confirmation')
})

test('with nothing selected, the repaint tells the user an agent is waiting on them', () => {
  const { socket, indicator } = loadHelper()
  socket.instance.onmessage({ data: JSON.stringify({ type: 'agent-waiting', waiting: true }) })
  assert.match(indicator.textContent, /agent is waiting/)

  socket.instance.onmessage({ data: JSON.stringify({ type: 'agent-waiting', waiting: false }) })
  assert.match(indicator.textContent, /return to the terminal/, 'falls back when nobody listens')
})

// ---- After the companion is closed, the page must stop pretending ----------------

/**
 * The skill CLOSES the companion once the design is written, because it is an input
 * surface. That leaves any open tab talking to nothing. Measured in a live browser:
 * a late click still painted the panel green, the header still said "Connected", and
 * Send would have reported "Sent ✓" — while the event sat in a queue nobody reads.
 * Silently doing nothing is worse than being visibly closed: the user believes they
 * answered a question that was already decided and committed.
 */
function goOffline(socket) {
  for (let i = 0; i < 3; i++) socket.instance.onclose();
}

test('after the session closes, the page says so instead of looking live', () => {
  const { socket, indicator, status } = loadHelper();
  assert.equal(status.textContent, 'Connected');
  goOffline(socket);
  assert.equal(status.textContent, 'Session closed', 'the header stops lying');
  assert.match(indicator.textContent, /Session closed/);
  assert.match(indicator.textContent, /already recorded/, 'and reassures nothing was lost');
});

test('a single dropped socket is a blip, not a closed session', () => {
  // Pushing a new screen reloads the page and a laptop waking drops the socket. Calling
  // the session over on the first failure would flash "closed" during normal use.
  const { socket, status } = loadHelper();
  socket.instance.onclose();
  assert.equal(status.textContent, 'Connected');
});

test('reconnecting flips the page back to live', () => {
  // Offline is a UI state, not a terminal one: the user may relaunch the companion.
  const { socket, status } = loadHelper();
  goOffline(socket);
  assert.equal(status.textContent, 'Session closed');
  socket.instance.onopen();
  assert.equal(status.textContent, 'Connected');
});

test('Send cannot report success when there is nowhere to send', () => {
  const { listeners, shadow, socket, indicator } = loadHelper();
  const a = makeBespokePanel('bottom-sheet', shadow);
  dispatchClick(listeners, a);
  goOffline(socket);

  win_submit(socket);
  assert.doesNotMatch(indicator.innerHTML, /Sent/, 'no false confirmation');
  assert.match(indicator.textContent, /Session closed/);
});

function win_submit(socket) {
  // The submit path is exposed as window.brainstormSubmit for exactly this.
  socket.win.brainstormSubmit();
}

// ---- Commit lock: one answer per screen ---------------------------------------------
//
// A submit is consumed the instant it lands — the agent's wait ends and it starts
// writing the next screen. A second one answers nothing, and worse, it stays in the
// journal where the next park can read it as the answer to a question the user has not
// seen yet. So the screen spends itself on commit and only a new screen brings it back.

function submits(sent) {
  return sent.filter((e) => e.type === 'submit')
}

test('a second Send after committing emits nothing', () => {
  const { listeners, shadow, socket, sent } = loadHelper();
  const a = makeBespokePanel('sidebar', shadow);
  dispatchClick(listeners, a);

  win_submit(socket);
  win_submit(socket);
  win_submit(socket);

  assert.equal(submits(sent).length, 1, 'only the first Send reaches the agent');
});

test('the Send button stays spent after committing, even on a further click', () => {
  // The regression this locks: syncSubmit used to re-enable the button from the raw
  // selection count on every repaint, so any click after the answer re-armed Send.
  const { listeners, shadow, socket, submitBtn } = loadHelper();
  const a = makeBespokePanel('sidebar', shadow);
  const b = makeBespokePanel('topbar', shadow);
  dispatchClick(listeners, a);
  win_submit(socket);

  assert.equal(submitBtn.disabled, true, 'locked on commit');
  assert.equal(submitBtn.textContent, 'Sent ✓');
  assert.equal(submitBtn.hidden, false, 'stays visible — hiding reads as the answer being lost');

  dispatchClick(listeners, b);
  assert.equal(submitBtn.disabled, true, 'a later click does not re-arm it');
});

test('the screen freezes on commit, so it cannot show what was not sent', () => {
  const { listeners, shadow, socket, sent, win } = loadHelper();
  const a = makeBespokePanel('sidebar', shadow);
  const b = makeBespokePanel('topbar', shadow);
  dispatchClick(listeners, a);
  win_submit(socket);
  const afterCommit = sent.length;

  dispatchClick(listeners, b);
  win.toggleSelect(b); // the inline onclick path bespoke screens actually use

  assert.equal(sent.length, afterCommit, 'no further events reach the journal');
  assert.ok(a.classes.has('selected'), 'the answered option stays selected');
  assert.ok(!b.classes.has('selected'), 'a later click cannot repaint a different answer');
});

test('an agent-waiting push cannot resurrect a spent Send button', () => {
  // The agent parks a new wait the moment it wakes, and that push repaints the
  // indicator. Without the commit branch it would print "press Send to answer" over a
  // button that is locked — reading as the companion having dropped the answer.
  const { listeners, shadow, socket, submitBtn, indicator } = loadHelper();
  const a = makeBespokePanel('sidebar', shadow);
  dispatchClick(listeners, a);
  win_submit(socket);

  socket.instance.onmessage({ data: JSON.stringify({ type: 'agent-waiting', waiting: true }) });

  assert.equal(submitBtn.disabled, true, 'still spent');
  assert.match(indicator.innerHTML, /locked until the next question/, 'says why it is spent');
  assert.doesNotMatch(indicator.innerHTML, /press Send/, 'does not ask for an answer it already has');
});

test('a new screen is what lifts the lock — and only the server can declare one', () => {
  // `reload` is broadcast on screen-added AND screen-updated, so the unlock rides on the
  // one signal that means "there is something new to decide". A click cannot forge it.
  const { listeners, shadow, socket, reloads } = loadHelper();
  const a = makeBespokePanel('sidebar', shadow);
  dispatchClick(listeners, a);
  win_submit(socket);
  assert.equal(reloads.count, 0, 'committing alone does not reload');

  socket.instance.onmessage({ data: JSON.stringify({ type: 'reload' }) });
  assert.equal(reloads.count, 1, 'the new screen tears the locked helper down');
});

test('queued events are dropped when the session closes', () => {
  // They belong to a decision already written. Replaying them into a server that comes
  // back later would inject stale intent into a new question.
  const { listeners, shadow, socket, sent } = loadHelper();
  const a = makeBespokePanel('bottom-sheet', shadow);
  socket.instance.readyState = 0; // not OPEN, so sendEvent queues instead of writing
  dispatchClick(listeners, a);
  const queuedWrites = sent.length;

  goOffline(socket);
  socket.instance.readyState = 1;
  socket.instance.onopen(); // a later server accepts the connection

  assert.equal(sent.length, queuedWrites, 'nothing stale was replayed');
});
