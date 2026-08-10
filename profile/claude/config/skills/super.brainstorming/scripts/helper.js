(function() {
  const WS_URL = 'ws://' + window.location.host;
  let ws = null;
  let eventQueue = [];

  // Whether an agent long-poll is parked on /poll right now. Without this the user
  // cannot tell "my click was delivered and something is listening" from "I am
  // clicking into the void" — the single most confusing state of a companion that
  // only sometimes has an agent attached.
  let agentWaiting = false;

  // Whether the companion is reachable. After the design is written the skill CLOSES the
  // companion on purpose (it is an input surface), which leaves any open tab talking to
  // nothing. Without tracking this the page lies: a click still paints the panel green,
  // Send still reports "Sent ✓", and the header still says Connected — while the event
  // sits in a queue nobody will ever read. Silently doing nothing is worse than being
  // visibly closed, because the user believes they answered.
  let offline = false;

  // Whether this screen's answer has been COMMITTED. A submit is acted on the moment it
  // lands: the agent's wait ends, it starts writing the next screen. A second submit has
  // nothing left to answer, so it either duplicates the decision or contradicts one
  // already in flight — and either way it sits in the journal where the NEXT park can
  // consume it as the answer to a question the user has not been shown yet.
  //
  // So the Send button locks on commit and the screen stops emitting. The lock is
  // cleared by a page reload, which is exactly what the server broadcasts when a new
  // screen lands (`screen-added`/`screen-updated`): the button comes back precisely when
  // there is a new decision to make, and never on the strength of a click alone.
  let committed = false;

  let failedReconnects = 0;
  // ~3s of failures. One dropped socket is a blip (a screen push, a laptop waking);
  // several in a row is the session being over.
  const OFFLINE_AFTER_FAILURES = 3;

  function setOffline(value) {
    if (offline === value) return;
    offline = value;
    if (offline) {
      // These events belong to a decision that is already written. Replaying them into
      // a server that comes back later would inject stale intent.
      eventQueue = [];
      agentWaiting = false;
    }
    const status = document.querySelector('.status');
    if (status) status.textContent = offline ? 'Session closed' : 'Connected';
    renderIndicator();
  }

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      failedReconnects = 0;
      setOffline(false);
      eventQueue.forEach(e => ws.send(JSON.stringify(e)));
      eventQueue = [];
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'reload') {
        window.location.reload();
      } else if (data.type === 'agent-waiting') {
        agentWaiting = !!data.waiting;
        renderIndicator();
      }
    };

    ws.onclose = () => {
      failedReconnects += 1;
      if (failedReconnects >= OFFLINE_AFTER_FAILURES) setOffline(true);
      // Keep retrying: the user may relaunch the companion, and reconnecting flips the
      // page back to live. Being offline is a UI state, not a terminal one.
      setTimeout(connect, 1000);
    };
  }

  function sendEvent(event) {
    event.timestamp = Date.now();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      eventQueue.push(event);
    }
  }

  function findChoiceTarget(e) {
    const path = e.composedPath();
    return path.find(el => el instanceof Element && el.dataset && el.dataset.choice) || null;
  }

  // The peer set a choice element competes with, and whether multi-select is on.
  //
  // `.options`/`.cards` scope it naturally. A BESPOKE mockup has neither — and that is
  // the only markup the Layout gate permits for a positioning/layout question, so this
  // is not an edge case: it is the mandated path. Scoping to the container alone left
  // `selectedChoices` empty on every bespoke screen, producing events that claimed
  // `selected: true` and `selectedChoices: []` at the same time and telling the agent
  // "nothing is selected" when a panel was. Falling back to the document makes every
  // [data-choice] on the page the peer set, which is what a bespoke comparison is.
  //
  // `data-multiselect` is read from the nearest ancestor carrying it, so bespoke layouts
  // opt into multi-select exactly the way container-based ones do.
  //
  // The fallback is `el.getRootNode()`, NOT `document`. The frame template moves all
  // injected content into a Shadow DOM (`attachShadow`) so content <style> tags cannot
  // override the frame chrome — and `document.querySelectorAll` does not cross a shadow
  // boundary. Falling back to `document` therefore matched NOTHING on every bespoke
  // screen: `selectedChoices` came back empty on every click, so `finalSelection` was
  // always empty and the user's decision was silently lost. Single-select was broken the
  // same way (the peer-clearing pass in toggleSelect swept an empty set, so two panels
  // could stay selected at once).
  //
  // `getRootNode()` returns the ShadowRoot for shadow-mounted content and `document` for
  // a full document that bypasses the frame, so one expression covers both. `.options` /
  // `.cards` kept working throughout because `closest()` walks up to the shadow root,
  // which is why this only ever bit the bespoke path — the path the Layout gate MANDATES
  // for every visual question.
  function choiceRoot(el) {
    return (el && typeof el.getRootNode === 'function' && el.getRootNode()) || document;
  }

  function choiceScope(el) {
    const container = el.closest('.options') || el.closest('.cards');
    return { root: container || choiceRoot(el), multi: !!el.closest('[data-multiselect]') };
  }

  // Pre-click selection state, recorded in the capture phase (before any other
  // handler runs). Used to detect whether the screen's own handlers (inline
  // toggleSelect or bespoke scripts) changed the selection state for this click.
  const preClickSelected = new WeakMap();

  document.addEventListener('click', (e) => {
    const target = findChoiceTarget(e);
    if (target) preClickSelected.set(target, target.classList.contains('selected'));
  }, true);

  // Capture clicks on choice elements (works across Shadow DOM boundary)
  document.addEventListener('click', (e) => {
    const target = findChoiceTarget(e);
    if (!target) return;
    // The screen freezes on commit. Repainting a panel green after the answer was sent
    // would show a selection that is NOT what the agent received, and the click would
    // still reach the journal — where a `--on any` park would read it as a new answer.
    if (committed) return;

    // Defer so toggleSelect (inline onclick) runs first and the selection state is final
    setTimeout(() => {
      // Fallback toggle: if no handler on the screen changed the selection state,
      // the helper owns the toggle. This covers markup-only screens (data-choice
      // without any onclick) and bespoke screens whose own selection script only
      // ever ADDS the selected class — without this, clicking an already-selected
      // option could never deselect it.
      const before = preClickSelected.get(target);
      if (before !== undefined && before === target.classList.contains('selected')) {
        window.toggleSelect(target);
      }

      const { root } = choiceScope(target);
      const selected = Array.from(root.querySelectorAll('[data-choice].selected'));

      sendEvent({
        type: 'click',
        text: target.textContent.trim(),
        choice: target.dataset.choice,
        id: target.id || null,
        selected: target.classList.contains('selected'),
        selectedChoices: selected.map(el => el.dataset.choice).filter(Boolean)
      });

      renderIndicator(selected);
    }, 0);
  });

  // The indicator has two jobs now: report the selection, and report whether anyone
  // is on the other end. `agentWaiting` changes the CALL TO ACTION, not just the
  // wording: with a poll parked, clicking IS the answer and switching back to the
  // terminal is unnecessary; without one, the click is only recorded and the user
  // still has to say something for the agent to ever read it.
  //
  // `selected` is passed in from the click path so the scoped peer set (`.options` /
  // `.cards`) is preserved there; a push-driven repaint has no element to scope from
  // and falls back to the document, which is the same fallback `choiceScope` uses.
  function renderIndicator(selected) {
    // Same shadow-boundary trap as choiceScope: a push-driven repaint has no element to
    // scope from, so it reads the shadow root the frame template published. Querying
    // `document` here would report "nothing selected" on every bespoke screen.
    const items = selected || currentSelection();
    // Before the early return: a FULL document has no indicator bar, but it does get a
    // Send button created for it, and that button still has to track the selection.
    syncSubmit(items);
    const indicator = document.getElementById('indicator-text');
    if (!indicator) return;
    if (offline) {
      indicator.textContent =
        'Session closed — your answers were already recorded. Continue in the terminal.';
      return;
    }
    // Before the call-to-action: once committed there is nothing left to ask for on this
    // screen, and an `agent-waiting` push repainting "press Send to answer" over a locked
    // button would read as the companion having lost the answer.
    if (committed) {
      indicator.innerHTML = '<span class="selected-text">Sent to the agent</span>'
        + ' — locked until the next question arrives';
      return;
    }
    // The call to action names the CONFIRMATION, not the click: a selection sitting on
    // screen has not been sent yet, and saying otherwise is how a misclick turns into a
    // decision nobody made.
    const tail = agentWaiting
      ? ' — press Send to answer'
      : ' — press Send, or return to the terminal';

    if (items.length === 0) {
      indicator.textContent = agentWaiting
        ? 'The agent is waiting — pick an option, then press Send'
        : 'Click an option above, then return to the terminal';
    } else if (items.length === 1) {
      const label = items[0].querySelector('h3, .content h3, .card-body h3')?.textContent?.trim() || items[0].dataset.choice;
      indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span>' + tail;
    } else {
      indicator.innerHTML = '<span class="selected-text">' + items.length + ' selected</span>' + tail;
    }
  }

  // ===== Submit: the user COMMITS a decision =====
  //
  // A click is exploration, not an answer. The user may hit the wrong panel, compare
  // two, or need to pick several options on one screen. If the agent acts on the first
  // click it sees, a misclick becomes a decision nobody made. So the agent waits for an
  // explicit confirmation, and the click stream only survives as `path` — the record of
  // how they got there.
  //
  // The button lives in the frame's indicator bar. A FULL document bypasses the frame
  // but still gets this helper injected, so one is created on the fly there; otherwise
  // "confirm your choice" would be an instruction with no control to press.
  function submitButton() {
    var existing = document.getElementById('companion-submit');
    if (existing) return existing;
    if (!document.body || !document.createElement) return null;
    var btn = document.createElement('button');
    btn.id = 'companion-submit';
    btn.type = 'button';
    btn.textContent = 'Send to agent';
    btn.disabled = true;
    btn.setAttribute('style', [
      'position:fixed', 'right:1rem', 'bottom:1rem', 'z-index:2147483647',
      'font:600 .8rem system-ui,sans-serif', 'padding:.5rem 1rem', 'border-radius:8px',
      'border:1px solid #4c8dff', 'background:#4c8dff', 'color:#fff', 'cursor:pointer',
    ].join(';'));
    document.body.appendChild(btn);
    return btn;
  }

  function currentSelection() {
    var root = window.__brainstormShadow || document;
    return Array.from(root.querySelectorAll('[data-choice].selected'));
  }

  function syncSubmit(items) {
    var btn = submitButton();
    if (!btn) return;
    var selected = items || currentSelection();
    // Hidden until there is something to confirm: a permanently disabled button on a
    // presentational screen is noise, and reads as a broken control.
    if (offline) {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = 'Session closed';
      btn.classList.add('sent');
      return;
    }
    // Stays visible while locked: hiding it would read as the answer having been lost,
    // and the user needs to see that the thing they pressed is what is now spent.
    if (committed) {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = 'Sent ✓';
      btn.classList.add('sent');
      return;
    }
    btn.hidden = selected.length === 0;
    btn.disabled = selected.length === 0;
    if (selected.length > 0) {
      btn.classList.remove('sent');
      btn.textContent = selected.length > 1
        ? 'Send ' + selected.length + ' choices to agent'
        : 'Send to agent';
    }
  }

  function submitSelection() {
    if (offline) { renderIndicator(); return; }
    // Guarded here and not only on the button: `window.brainstormSubmit` is a public
    // entry point, and a disabled button still fires for keyboard and scripted paths in
    // some browsers. The lock has to live where the event is emitted.
    if (committed) return;
    var selected = currentSelection();
    if (selected.length === 0) return;
    committed = true;
    sendEvent({
      type: 'submit',
      choice: selected[0].dataset.choice,
      selectedChoices: selected.map(function (el) { return el.dataset.choice; }).filter(Boolean),
      texts: selected.map(function (el) { return (el.textContent || '').trim().slice(0, 120); }),
    });
    // One repaint, from the `committed` flag: button and indicator now have a single
    // source of truth, so a later `agent-waiting` push cannot resurrect either of them.
    renderIndicator();
  }

  // Delegated so it works whether the button came from the frame or was created here,
  // and survives the frame being re-rendered.
  document.addEventListener('click', function (e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    if (path.some(function (el) { return el && el.id === 'companion-submit'; })) submitSelection();
  });

  window.brainstormSubmit = submitSelection;

  // Frame UI: selection tracking
  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    // Screens carry `onclick="toggleSelect(this)"` inline, which runs before the
    // helper's own listener — so the freeze has to be enforced here too, or the panel
    // would repaint even though nothing was emitted.
    if (committed) return;
    const { root, multi } = choiceScope(el);
    const wasSelected = el.classList.contains('selected');
    if (!multi) {
      // Clear peers by data-choice, not by .option/.card: a bespoke panel is neither.
      root.querySelectorAll('[data-choice].selected').forEach(o => o.classList.remove('selected'));
    }
    // Clicking an already-selected element deselects it (both modes).
    if (wasSelected) {
      el.classList.remove('selected');
      window.selectedChoice = null;
    } else {
      el.classList.add('selected');
      window.selectedChoice = el.dataset.choice;
    }
  };

  // Expose API for explicit use
  window.brainstorm = {
    send: sendEvent,
    choice: (value, metadata = {}) => sendEvent({ type: 'choice', value, ...metadata })
  };

  connect();
  // Paint once at load so the Send button starts in the right state — hidden on a
  // presentational screen, visible when a screen arrives with something preselected.
  renderIndicator();
})();
