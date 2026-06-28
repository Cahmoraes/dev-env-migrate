(function() {
  const WS_URL = 'ws://' + window.location.host;
  let ws = null;
  let eventQueue = [];

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      eventQueue.forEach(e => ws.send(JSON.stringify(e)));
      eventQueue = [];
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'reload') {
        window.location.reload();
      }
    };

    ws.onclose = () => {
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

      const container = target.closest('.options') || target.closest('.cards');
      const selected = container ? Array.from(container.querySelectorAll('.selected')) : [];

      sendEvent({
        type: 'click',
        text: target.textContent.trim(),
        choice: target.dataset.choice,
        id: target.id || null,
        selected: target.classList.contains('selected'),
        selectedChoices: selected.map(el => el.dataset.choice).filter(Boolean)
      });

      // Update indicator bar
      const indicator = document.getElementById('indicator-text');
      if (!indicator) return;
      if (selected.length === 0) {
        indicator.textContent = 'Click an option above, then return to the terminal';
      } else if (selected.length === 1) {
        const label = selected[0].querySelector('h3, .content h3, .card-body h3')?.textContent?.trim() || selected[0].dataset.choice;
        indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span> — return to terminal to continue';
      } else {
        indicator.innerHTML = '<span class="selected-text">' + selected.length + ' selected</span> — return to terminal to continue';
      }
    }, 0);
  });

  // Frame UI: selection tracking
  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    const container = el.closest('.options') || el.closest('.cards');
    const multi = container && container.dataset.multiselect !== undefined;
    const wasSelected = el.classList.contains('selected');
    if (container && !multi) {
      container.querySelectorAll('.option, .card').forEach(o => o.classList.remove('selected'));
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
})();
