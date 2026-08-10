const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Single source of truth for the click digest. The agent-facing shape
// (`finalSelection` vs "last choice") is a documented footgun; deriving it in two
// places would let the long-poll answer and `check-visual-state --with-events`
// disagree about what the user picked.
const { readEvents } = require('./check-visual-state.cjs');

// ========== WebSocket Protocol (RFC 6455) ==========

const OPCODES = { TEXT: 0x01, CLOSE: 0x08, PING: 0x09, PONG: 0x0A };
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function computeAcceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

function encodeFrame(opcode, payload) {
  const fin = 0x80;
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = fin | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = fin | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = fin | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
  if (buffer.length < 2) return null;

  const secondByte = buffer[1];
  const opcode = buffer[0] & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7F;
  let offset = 2;

  if (!masked) throw new Error('Client frames must be masked');

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const maskOffset = offset;
  const dataOffset = offset + 4;
  const totalLen = dataOffset + payloadLen;
  if (buffer.length < totalLen) return null;

  const mask = buffer.slice(maskOffset, dataOffset);
  const data = Buffer.alloc(payloadLen);
  for (let i = 0; i < payloadLen; i++) {
    data[i] = buffer[dataOffset + i] ^ mask[i % 4];
  }

  return { opcode, payload: data, bytesConsumed: totalLen };
}

// ========== Configuration ==========

const PORT = process.env.BRAINSTORM_PORT || (49152 + Math.floor(Math.random() * 16383));
const HOST = process.env.BRAINSTORM_HOST || '127.0.0.1';
const URL_HOST = process.env.BRAINSTORM_URL_HOST || (HOST === '127.0.0.1' ? 'localhost' : HOST);
const SESSION_DIR = process.env.BRAINSTORM_DIR || '/tmp/brainstorm';
const CONTENT_DIR = path.join(SESSION_DIR, 'content');
const STATE_DIR = path.join(SESSION_DIR, 'state');
let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;

const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
};

// ========== Templates and Constants ==========

const WAITING_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Brainstorm Companion</title>
<style>body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { color: #333; } p { color: #666; }</style>
</head>
<body><h1>Brainstorm Companion</h1>
<p>Waiting for the agent to push a screen...</p></body></html>`;

// Frame template and helper are read per request, NOT cached at startup.
// Companion servers are long-lived (--reuse keeps them across turns / sessions),
// so caching these at boot means a server started before a skill update keeps
// serving the old frame/helper until it dies — bug fixes in helper.js never
// reach the browser. The files are tiny and local; the re-read cost is negligible.
const FRAME_TEMPLATE_PATH = path.join(__dirname, 'frame-template.html');
const HELPER_PATH = path.join(__dirname, 'helper.js');

function loadHelperInjection() {
  return '<script>\n' + fs.readFileSync(HELPER_PATH, 'utf-8') + '\n</script>';
}

// ========== Helper Functions ==========

function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function wrapInFrame(content) {
  return fs.readFileSync(FRAME_TEMPLATE_PATH, 'utf-8').replace('<!-- CONTENT -->', content);
}

function getNewestScreen() {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const fp = path.join(CONTENT_DIR, f);
      return { path: fp, mtime: fs.statSync(fp).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].path : null;
}

// ========== HTTP Request Handler ==========

function handleRequest(req, res) {
  touchActivity();
  if (req.method === 'GET' && req.url === '/') {
    const screenFile = getNewestScreen();
    let html = screenFile
      ? (raw => isFullDocument(raw) ? raw : wrapInFrame(raw))(fs.readFileSync(screenFile, 'utf-8'))
      : WAITING_PAGE;

    const helperInjection = loadHelperInjection();
    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\n</body>');
    } else {
      html += helperInjection;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/poll') {
    // Exact pathname, not a prefix: `startsWith('/poll')` would also swallow
    // `/pollute` and, worse, `/poll-anything`, parking a request that was never a
    // poll. The client detects an old server by its 404 here, so a route that
    // answers too eagerly breaks the compatibility fallback.
    handlePoll(req, res, new URL(req.url, 'http://localhost').searchParams);
  } else if (req.method === 'GET' && req.url.startsWith('/files/')) {
    const fileName = req.url.slice(7);
    const filePath = path.join(CONTENT_DIR, path.basename(fileName));
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ========== WebSocket Connection Handling ==========

const clients = new Set();

function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = computeAcceptKey(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  let buffer = Buffer.alloc(0);
  clients.add(socket);

  // Sync the "agent is listening" indicator on connect. The broadcast only fires
  // on transitions, so a page opened (or reloaded) while a poll is already parked
  // would otherwise show the idle state and tell the user nobody is listening.
  try {
    socket.write(encodeFrame(
      OPCODES.TEXT,
      // Mirror the ANNOUNCED state, not the instantaneous one, so a page opened
      // during the leave-debounce window agrees with every other open tab.
      Buffer.from(JSON.stringify({ type: 'agent-waiting', waiting: announcedAgentWaiting }))
    ));
  } catch (e) { /* client vanished mid-handshake */ }

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      let result;
      try {
        result = decodeFrame(buffer);
      } catch (e) {
        socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
        clients.delete(socket);
        return;
      }
      if (!result) break;
      buffer = buffer.slice(result.bytesConsumed);

      switch (result.opcode) {
        case OPCODES.TEXT:
          handleMessage(result.payload.toString());
          break;
        case OPCODES.CLOSE:
          socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
          clients.delete(socket);
          return;
        case OPCODES.PING:
          socket.write(encodeFrame(OPCODES.PONG, result.payload));
          break;
        case OPCODES.PONG:
          break;
        default: {
          const closeBuf = Buffer.alloc(2);
          closeBuf.writeUInt16BE(1003);
          socket.end(encodeFrame(OPCODES.CLOSE, closeBuf));
          clients.delete(socket);
          return;
        }
      }
    }
  });

  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
}

function handleMessage(text) {
  let event;
  try {
    event = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse WebSocket message:', e.message);
    return;
  }
  touchActivity();
  console.log(JSON.stringify({ source: 'user-event', ...event }));
  // `submit` is the COMMITTED decision and must be journaled even if the payload shape
  // ever drifts; `choice` keeps journaling the exploration clicks that become `path`.
  if (event.choice || event.type === 'submit') {
    const eventsFile = path.join(STATE_DIR, 'events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
    // Append first, wake second: a parked poll re-reads the journal, so the write
    // must be durable before anyone is told the count moved.
    flushPolls();
  }
}

function broadcast(msg) {
  const frame = encodeFrame(OPCODES.TEXT, Buffer.from(JSON.stringify(msg)));
  for (const socket of clients) {
    try { socket.write(frame); } catch (e) { clients.delete(socket); }
  }
}

// ========== Agent Long-Poll (the server → agent bridge) ==========
//
// The browser → server leg already existed (WebSocket frames appended to
// `state/events`). What was missing is the leg that lets a browser click WAKE the
// agent: a CLI agent cannot hold a socket open across turns, so its only inbox is
// "a process exits and prints JSON". `GET /poll` blocks until the click stream
// grows past `since`, which converts an async browser event into a process exit
// the harness can notify on.
//
// `seq` is not server state: it is the LINE COUNT of the append-only events
// journal. That makes it survive a server restart and stay meaningful to any
// client that only has the file (see the watch fallback in wait-for-user.cjs).

// Capped well below Node's 300s `server.requestTimeout` default so a parked poll
// is never aborted mid-flight by the HTTP layer. Waits longer than one slice are
// synthesized by the client looping, exactly as impeccable's poll client does
// against undici's non-lowerable 300s headers timeout.
const POLL_SLICE_CAP_MS = 240 * 1000;
const POLL_SLICE_MIN_MS = 1000;
const DEFAULT_POLL_TIMEOUT_MS = 30 * 1000;

const pendingPolls = new Set();
let announcedAgentWaiting = false;

function countJournaledEvents() {
  try {
    return fs.readFileSync(path.join(STATE_DIR, 'events'), 'utf-8')
      .split('\n').filter((l) => l.trim()).length;
  } catch (e) {
    return 0;
  }
}

/**
 * Where a cursor actually points once the journal is allowed to shrink.
 *
 * A `since` ABOVE the current count is not "the future": it is a cursor from before a
 * new screen truncated the journal back to zero. The agent gets one of these on every
 * screen change, because it re-parks with the seq the previous answer handed it — and
 * only AFTER rendering the screen that did the truncating. Comparing against it strands
 * the wait below the old high-water mark: the click lands, the Send lands, the count is
 * still under the cursor, and nothing wakes until the user clicks enough extra times to
 * climb past it. Measured live: two screens in one session, each costing the user a
 * dead Send plus one or two re-clicks.
 */
function anchorSince(since, count) {
  return since > count ? 0 : since;
}

/** The digest for everything past `since`, or null when nothing new has landed. */
function pollSnapshot(since) {
  const digest = readEvents(STATE_DIR);
  const anchor = anchorSince(since, digest.count);
  if (digest.count <= anchor) return null;
  return { type: 'selection', seq: digest.count, since: anchor, ...digest };
}

function respondJson(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload) + '\n');
}

// The browser must know whether anyone is listening. Without it the user clicks
// into the void and cannot tell a resolved question from an abandoned one.
//
// Arrival is announced immediately; DEPARTURE is debounced. The agent's settle
// window resolves a poll and re-parks it within milliseconds on every click, so an
// undebounced announcement makes the indicator flip false → true under the user's
// cursor on each click — precisely the moment they are reading it. Found by
// simulating a hesitating user (a → b → a), not by any unit test: each transition
// was individually correct.
const AGENT_WAITING_LEAVE_MS = Number(process.env.BRAINSTORM_AGENT_LEAVE_MS) || 750;
let waitingLeaveTimer = null;

function announceAgentWaiting() {
  if (pendingPolls.size > 0) {
    if (waitingLeaveTimer) { clearTimeout(waitingLeaveTimer); waitingLeaveTimer = null; }
    if (announcedAgentWaiting) return;
    announcedAgentWaiting = true;
    broadcast({ type: 'agent-waiting', waiting: true });
    return;
  }
  if (!announcedAgentWaiting || waitingLeaveTimer) return;
  waitingLeaveTimer = setTimeout(() => {
    waitingLeaveTimer = null;
    if (pendingPolls.size > 0) return; // re-parked while the timer ran
    announcedAgentWaiting = false;
    broadcast({ type: 'agent-waiting', waiting: false });
  }, AGENT_WAITING_LEAVE_MS);
  // Never hold the event loop open on this: it is cosmetic, and the shutdown path
  // must not wait for it.
  if (waitingLeaveTimer.unref) waitingLeaveTimer.unref();
}

function clampPollTimeout(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_POLL_TIMEOUT_MS;
  return Math.min(Math.max(n, POLL_SLICE_MIN_MS), POLL_SLICE_CAP_MS);
}

/**
 * `since` omitted means "tell me about clicks from now on" — anchoring on the
 * current count instead of 0, so a poll opened mid-session does not instantly
 * replay a decision the agent already consumed.
 */
function resolvePollSince(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : countJournaledEvents();
}

function handlePoll(req, res, query) {
  // Anchor at park time too, not just inside `pollSnapshot`: a stranded cursor would
  // otherwise survive in `poll.since` and be reported back as the seq of a timeout.
  const since = anchorSince(resolvePollSince(query.get('since')), countJournaledEvents());
  const timeout = clampPollTimeout(query.get('timeout'));

  const ready = pollSnapshot(since);
  if (ready) { respondJson(res, ready); return; }

  const poll = { since, res, timer: null };
  poll.timer = setTimeout(() => {
    pendingPolls.delete(poll);
    announceAgentWaiting();
    respondJson(res, { type: 'timeout', seq: since, waitedMs: timeout });
  }, timeout);

  pendingPolls.add(poll);
  announceAgentWaiting();

  req.on('close', () => {
    if (!pendingPolls.delete(poll)) return;
    clearTimeout(poll.timer);
    announceAgentWaiting();
  });
}

function flushPolls() {
  if (pendingPolls.size === 0) return;
  for (const poll of [...pendingPolls]) {
    const snapshot = pollSnapshot(poll.since);
    if (!snapshot) continue;
    pendingPolls.delete(poll);
    clearTimeout(poll.timer);
    respondJson(poll.res, snapshot);
  }
  announceAgentWaiting();
}

/** Re-anchor parked polls at the start of a freshly truncated journal. */
function rebasePolls() {
  for (const poll of pendingPolls) poll.since = 0;
}

/** Release every parked poll so the agent learns the companion went away. */
function drainPolls(type) {
  for (const poll of [...pendingPolls]) {
    pendingPolls.delete(poll);
    clearTimeout(poll.timer);
    respondJson(poll.res, { type, seq: poll.since });
  }
  announceAgentWaiting();
}

// ========== Activity Tracking ==========

// Both intervals are env-overridable so the lifecycle regression tests can run
// on a fast clock instead of waiting real minutes. Defaults are the production
// values when the vars are unset.
const IDLE_TIMEOUT_MS = Number(process.env.BRAINSTORM_IDLE_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes
const LIFECYCLE_INTERVAL_MS = Number(process.env.BRAINSTORM_LIFECYCLE_MS) || 60 * 1000;
let lastActivity = Date.now();

function touchActivity() {
  lastActivity = Date.now();
}

// ========== File Watching ==========

const debounceTimers = new Map();

// ========== Server Startup ==========

function startServer() {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

  // Track known files to distinguish new screens from updates.
  // macOS fs.watch reports 'rename' for both new files and overwrites,
  // so we can't rely on eventType alone.
  const knownFiles = new Set(
    fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.html'))
  );

  const server = http.createServer(handleRequest);
  server.on('upgrade', handleUpgrade);

  const watcher = fs.watch(CONTENT_DIR, (eventType, filename) => {
    if (!filename || !filename.endsWith('.html')) return;

    if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));
    debounceTimers.set(filename, setTimeout(() => {
      debounceTimers.delete(filename);
      const filePath = path.join(CONTENT_DIR, filename);

      if (!fs.existsSync(filePath)) return; // file was deleted
      touchActivity();

      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(STATE_DIR, 'events');
        // Displace, don't destroy. Truncating is right — the journal describes ONE screen,
        // and `seq` restarting at zero is what the poll re-anchoring depends on. But the
        // agent can write the next screen while an answer sits unread (step 6 parks the
        // browser with a placeholder at the end of every terminal-bound turn), and an
        // unlink makes that answer unrecoverable: the next state call reports
        // `present:false`, indistinguishable from a user who never touched the browser.
        // Keeping one generation costs a rename and turns silent loss into recoverable
        // loss, which `check-visual-state --with-events` surfaces as `previousAnswer`.
        if (fs.existsSync(eventsFile)) fs.renameSync(eventsFile, path.join(STATE_DIR, 'events.prev'));
        // A new screen truncates the journal back to zero, which would strand any
        // poll parked at a higher `since` forever (count can never climb past it
        // again). Re-anchor them at 0 so the first click on the NEW screen wakes
        // them — that click is exactly what they are waiting for.
        rebasePolls();
        console.log(JSON.stringify({ type: 'screen-added', file: filePath }));
      } else {
        console.log(JSON.stringify({ type: 'screen-updated', file: filePath }));
      }

      broadcast({ type: 'reload' });
    }, 100));
  });
  watcher.on('error', (err) => console.error('fs.watch error:', err.message));

  function shutdown(reason) {
    console.log(JSON.stringify({ type: 'server-stopped', reason }));
    // Answer parked polls before closing: `server.close()` waits for in-flight
    // requests, so a parked long-poll would otherwise hang the shutdown until its
    // own timeout fires, and the agent would read a socket error instead of a
    // reason it can act on.
    drainPolls('server-stopped');
    const infoFile = path.join(STATE_DIR, 'server-info');
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);
    fs.writeFileSync(
      path.join(STATE_DIR, 'server-stopped'),
      JSON.stringify({ reason, timestamp: Date.now() }) + '\n'
    );
    watcher.close();
    clearInterval(lifecycleCheck);
    server.close(() => process.exit(0));
    // `server.close()` only fires once every connection drains, and the companion
    // holds long-lived WebSocket sockets that never end on their own. Without this
    // the process would ignore SIGTERM until stop-server.sh escalates to SIGKILL —
    // which is exactly the path that skips the poll drain above.
    setTimeout(() => process.exit(0), 500).unref();
  }

  // stop-server.sh sends SIGTERM (then SIGKILL after ~3s). Handling it is what makes
  // the shutdown path — the poll drain and the `server-stopped` marker — reachable at
  // all; before this, every stop was an abrupt kill and a parked agent poll died as a
  // socket reset instead of a reason it could act on.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => shutdown(signal.toLowerCase()));
  }

  function ownerAlive() {
    if (!ownerPid) return true;
    try { process.kill(ownerPid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  }

  // Periodic lifecycle check: handle owner death and idle timeout.
  //
  // Owner-PID monitoring is only a best-effort fast-path for prompt cleanup. In
  // agent harnesses (Claude Code / Copilot / Codex on WSL, SSH, containers) the
  // resolved owner is an EPHEMERAL per-tool-call process that the harness tears
  // down between turns — while the user is still actively using the server. So if
  // the owner disappears at runtime we must NOT shut down: that would throw away
  // an in-use server (the "modal froze / stopped updating" bug). Instead we
  // disable further owner monitoring and fall back to the idle timeout — the exact
  // decision the startup guard below already makes when the owner is dead at boot.
  const lifecycleCheck = setInterval(() => {
    if (ownerPid && !ownerAlive()) {
      console.log(JSON.stringify({
        type: 'owner-pid-invalid', pid: ownerPid,
        reason: 'died at runtime; falling back to idle timeout',
      }));
      ownerPid = null;
    }
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) shutdown('idle timeout');
  }, LIFECYCLE_INTERVAL_MS);
  lifecycleCheck.unref();

  // Validate owner PID at startup. If it's already dead, the PID resolution
  // was wrong (common on WSL, Tailscale SSH, and cross-user scenarios).
  // Disable monitoring and rely on the idle timeout instead.
  if (ownerPid) {
    try { process.kill(ownerPid, 0); }
    catch (e) {
      if (e.code !== 'EPERM') {
        console.log(JSON.stringify({ type: 'owner-pid-invalid', pid: ownerPid, reason: 'dead at startup' }));
        ownerPid = null;
      }
    }
  }

  server.listen(PORT, HOST, () => {
    // Write our own authoritative PID before announcing startup. The launcher
    // wrote a provisional PID from the shell's `$!`, but only the server knows
    // its real pid — and when it is detached with setsid the shell's `$!` can
    // point at the setsid wrapper, not the node process. Writing process.pid
    // here, *before* the server-started line the launcher greps for, guarantees
    // stop-server.sh and the --reuse check target the actual listener.
    try {
      fs.writeFileSync(path.join(STATE_DIR, 'server.pid'), String(process.pid) + '\n');
    } catch (e) {
      console.error('Failed to write server.pid:', e.message);
    }
    const info = JSON.stringify({
      type: 'server-started', port: Number(PORT), host: HOST,
      url_host: URL_HOST, url: 'http://' + URL_HOST + ':' + PORT,
      screen_dir: CONTENT_DIR, state_dir: STATE_DIR
    });
    console.log(info);
    fs.writeFileSync(path.join(STATE_DIR, 'server-info'), info + '\n');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  computeAcceptKey, encodeFrame, decodeFrame, OPCODES,
  isFullDocument, wrapInFrame, getNewestScreen,
  clampPollTimeout, resolvePollSince, anchorSince, pollSnapshot, countJournaledEvents,
  POLL_SLICE_CAP_MS, POLL_SLICE_MIN_MS, DEFAULT_POLL_TIMEOUT_MS,
};
