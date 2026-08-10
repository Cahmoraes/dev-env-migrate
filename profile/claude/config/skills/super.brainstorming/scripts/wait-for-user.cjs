#!/usr/bin/env node
'use strict'

/**
 * wait-for-user.cjs — block until the user acts in the browser, then print one JSON line.
 *
 * Root cause this script exists for:
 *   The companion was bidirectional everywhere except the leg that matters. The agent
 *   pushed screens (file → fs.watch → WebSocket reload) and the browser pushed clicks
 *   back (WebSocket → `state/events`), but nothing carried a click to the AGENT. The
 *   click only surfaced on the agent's *next turn*, and a turn only starts when the user
 *   types in the terminal. So clicking a mockup did nothing until the user ALSO wrote
 *   "ok, escolhi a B" — the browser was a display, not an input.
 *
 * Why a long poll and not a socket: a CLI agent cannot hold a connection across turns.
 * Its only inbox is "a process exits and prints on stdout". Blocking here converts an
 * asynchronous browser click into a process exit, which every harness knows how to
 * notify on (background task in Claude Code, background terminal in Copilot/Cursor,
 * yielded foreground exec in Codex).
 *
 * Usage:
 *   node wait-for-user.cjs --project-dir <repo-root>
 *   node wait-for-user.cjs --session-dir <.superpowers/brainstorm/<session>>
 *   node wait-for-user.cjs --project-dir <root> --timeout-ms 600000 --settle-ms 1500
 *   node wait-for-user.cjs --project-dir <root> --since 4
 *   node wait-for-user.cjs --project-dir <root> --on any     # wake on any click, not just Send
 *
 * Output (stdout, always exactly one JSON line — exit code is 0 except on usage error):
 *   {"type":"selection","seq":3,"finalSelection":["b"],"path":["a","b","b"], ...}
 *   {"type":"timeout","seq":0,"waitedMs":600000,"pendingAnswer":false, ...}
 *   {"type":"no-server", ...}
 *   {"type":"server-stopped","seq":2, ...}
 *
 * Verdict lives in `type`, NEVER in the exit code (repo-wide script contract).
 *
 * Every answer carries the companion state (`url`, `screenDir`, `renderDebt`) and an
 * `_instructions` string. Both are token levers, not conveniences:
 *   - Consolidation removes the follow-up `check-visual-state` round trip. The agent
 *     wakes up already knowing where to write and whether it owes a render.
 *   - `_instructions` is the authoritative next step with the real seq/paths already
 *     substituted, so the prose reference can stay lean and cannot drift from what the
 *     script actually does.
 */

const fs = require('fs')
const http = require('http')
const path = require('path')

const {
  evaluate, findLiveSession, isLiveSession, readEvents, listScreens, consumedSubmitsFor, CONSUMED_FILE,
} = require('./check-visual-state.cjs')

// Matches the server's per-request cap, which sits below Node's 300s
// `server.requestTimeout` default so a parked poll is never aborted by the HTTP
// layer. Longer waits are synthesized by looping here.
const SLICE_MS = 240 * 1000
const DEFAULT_TIMEOUT_MS = 600 * 1000

// After the first click, keep absorbing clicks until the stream goes quiet. A user
// comparing options clicks a → b → b; without this the agent wakes three times and
// pays three turns to watch someone think. One wake carrying the settled state is
// cheaper AND kinder: taking your time to compare should cost the user nothing.
const DEFAULT_SETTLE_MS = 1500

// Stat-polling interval for the watch fallback. `fs.watchFile` is used instead of
// `fs.watch` on purpose: inotify/FSEvents/ReadDirectoryChangesW behave differently
// per OS and are unreliable on WSL mounts, network shares and some container
// filesystems. Stat polling is uniformly boring everywhere, which is the property
// that matters for a script that must work on every platform the skill supports.
const WATCH_INTERVAL_MS = 400

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n')
  process.exit(1)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return { help: true }
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[a.slice(2)] = true
    } else {
      args[a.slice(2)] = next
      i++
    }
  }
  return args
}

function positiveInt(raw, fallback, label) {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) fail(`${label} must be a non-negative number`)
  return Math.round(n)
}

function readServerInfo(stateDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, 'server-info'), 'utf8').trim())
  } catch (e) {
    return null
  }
}

/**
 * Where to actually connect. A companion bound to 0.0.0.0 (the documented remote /
 * container setup) advertises that address in server-info, but it is a bind address,
 * not a destination — dialing it fails on Windows and on some Linux stacks.
 */
function connectHost(info) {
  const host = info && info.host
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') return '127.0.0.1'
  return host
}

function requestPoll({ host, port, since, timeoutMs }) {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, method: 'GET', path: `/poll?since=${since}&timeout=${timeoutMs}` },
      (res) => {
        // A server started before this feature shipped 404s here. `--reuse` keeps such
        // servers alive across skill updates, so this is a routine state, not an error.
        if (res.statusCode === 404) { res.resume(); resolve({ outcome: 'unsupported' }); return }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          try {
            resolve({ outcome: 'ok', payload: JSON.parse(body) })
          } catch (e) {
            resolve({ outcome: 'unsupported' })
          }
        })
      }
    )
    // Give the server room to answer its own timeout first; only a genuinely dead
    // socket should trip this.
    req.setTimeout(timeoutMs + 15000, () => req.destroy(new Error('poll socket timeout')))
    req.on('error', (err) => resolve({ outcome: 'error', error: err }))
    req.end()
  })
}

/**
 * Fallback path: watch the append-only journal directly. Used when the running server
 * predates `/poll`, or when the HTTP leg is refused. Slower to notice a click and it
 * cannot drive the browser's "agent is listening" indicator, but it needs nothing from
 * the server beyond the file that already exists.
 */
function watchJournal({ stateDir, since, timeoutMs }) {
  return new Promise((resolve) => {
    const eventsFile = path.join(stateDir, 'events')
    let done = false

    const finish = (payload) => {
      if (done) return
      done = true
      fs.unwatchFile(eventsFile, onChange)
      clearTimeout(timer)
      resolve(payload)
    }

    const check = () => {
      const digest = readEvents(stateDir)
      // A new screen truncates the journal; re-anchor instead of waiting for a count
      // that can never come back.
      if (digest.count < since) since = 0
      if (digest.count > since) finish({ type: 'selection', seq: digest.count, since, ...digest })
    }

    const onChange = () => check()
    const timer = setTimeout(
      () => finish({ type: 'timeout', seq: since, waitedMs: timeoutMs }),
      timeoutMs
    )
    fs.watchFile(eventsFile, { interval: WATCH_INTERVAL_MS }, onChange)
    check() // the click may have landed between resolving `since` and arming the watch
  })
}

/**
 * Has the user COMMITTED since we started waiting?
 *
 * A click is exploration: they may hit the wrong panel, compare two, or need several
 * options on one screen. Acting on the first click turns a misclick into a decision
 * nobody made, and makes multi-select impossible to express. So the default wake
 * condition is a `submit` — the Send button — and clicks only accumulate into `path`.
 */
function satisfies(result, { on, submitsAtStart }) {
  if (result.type !== 'selection') return true
  if (on !== 'submit') return true
  // `submits` missing means the payload came from a server whose in-memory digest
  // predates it. Treating that as "zero submits" deadlocks the wait: the user presses
  // Send, the UI says "Sent ✓", and the agent never wakes. Callers re-derive the digest
  // locally (see reconcile) precisely so this branch is unreachable in practice; it is
  // the last line of defence, and failing OPEN is the safe direction — a spurious wake
  // costs one turn, a deadlock costs the session.
  if (result.submits === undefined) return true
  // A truncated journal (new screen) resets the counter; anything at or below the
  // baseline is history, not an answer to the question currently on screen.
  const submits = result.submits || 0
  if (submits < submitsAtStart) return submits > 0
  return submits > submitsAtStart
}

/**
 * Wait out the tail of a click burst so one wake carries the whole decision.
 * Only meaningful for `--on any`: a submit is already the user saying "that's my answer",
 * so there is nothing left to settle.
 */
async function settle({ mode, host, port, stateDir, result, settleMs }) {
  if (settleMs <= 0) return result
  let current = result
  for (;;) {
    const next = mode === 'http'
      ? await requestPoll({ host, port, since: current.seq, timeoutMs: settleMs })
        .then((r) => (r.outcome === 'ok' ? r.payload : { type: 'timeout' }))
      : await watchJournal({ stateDir, since: current.seq, timeoutMs: settleMs })
    if (next.type !== 'selection') return current
    current = { ...next, since: result.since }
  }
}

/**
 * A cursor past the end of the journal points at a screen that is already gone.
 *
 * `seq` is the journal's LINE COUNT, and a new screen deletes the journal — so the
 * number the agent carries over from the previous answer (via `_instructions`) sits
 * above a counter that just restarted at zero. Re-anchor at 0 instead of waiting for a
 * count that can never come back.
 */
function anchorCursor(cursor, count) {
  return cursor > count ? 0 : cursor
}

async function waitForEvent({ stateDir, timeoutMs, settleMs, since, on, submitsAtStart }) {
  const info = readServerInfo(stateDir)
  const host = connectHost(info)
  const port = info && info.port
  const deadline = Date.now() + timeoutMs
  let mode = port ? 'http' : 'watch'
  let cursor = since

  // Every click wakes the poll, but only a committed answer ends the wait. Re-parking
  // is free — it is one local HTTP round trip inside this process, and costs the agent
  // nothing, because no tool result is produced until the wait actually ends.
  const done = (result) => satisfies(result, { on, submitsAtStart })

  // THE SERVER NOTIFIES; THIS CLIENT INTERPRETS.
  //
  // `--reuse` deliberately keeps companion servers alive across skill updates, and a
  // server holds its digest code in memory (unlike helper.js and the frame template,
  // which it re-reads per request). So a running server can answer /poll with a payload
  // shaped by an OLDER version of the digest — the 404 fallback only catches a missing
  // route, never a stale payload. Measured live: the user pressed Send, the journal
  // recorded the submit, the browser said "Sent ✓", and the agent waited forever because
  // the server's payload had no `submits` field.
  //
  // Re-deriving from the journal on disk — which this process can read directly, with
  // its own code — makes the wake decision immune to the server's version entirely.
  const reconcile = (payload) => {
    const local = readEvents(stateDir)
    if (!local.present) return payload
    return { ...payload, ...local, seq: local.count }
  }

  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { type: 'timeout', seq: cursor, waitedMs: timeoutMs }

    // Re-anchor before every slice, for the same reason the watch fallback does. A cursor
    // above the journal's line count is a cursor from before a new screen truncated it;
    // polling on it waits for a count that can only be reached by the user clicking MORE
    // times than the previous screen had events, which silently eats the Send in between.
    // The server anchors too, but `--reuse` keeps older servers alive across skill
    // updates, so the client cannot delegate this.
    cursor = anchorCursor(cursor, readEvents(stateDir).count)

    if (mode === 'watch') {
      const result = await watchJournal({ stateDir, since: cursor, timeoutMs: remaining })
      if (result.type !== 'selection') return result
      if (!done(result)) { cursor = result.seq; continue }
      return on === 'submit' ? result : await settle({ mode, stateDir, result, settleMs })
    }

    const slice = Math.min(remaining, SLICE_MS)
    const { outcome, payload } = await requestPoll({ host, port, since: cursor, timeoutMs: slice })

    if (outcome === 'unsupported') { mode = 'watch'; continue }

    if (outcome === 'error') {
      // Distinguish "companion is gone" from "this one request failed". Only the
      // former is terminal; a transient socket error should not end the wait.
      if (!isLiveSession(path.dirname(stateDir))) return { type: 'server-stopped', seq: cursor }
      mode = 'watch'
      continue
    }

    if (payload.type === 'selection') {
      const result = reconcile(payload)
      if (!done(result)) { cursor = result.seq; continue }
      // A submit IS the settled answer; there is no burst left to absorb.
      return on === 'submit'
        ? result
        : await settle({ mode, host, port, stateDir, result, settleMs })
    }
    if (payload.type === 'server-stopped') return payload
    // `timeout` from one slice is not the caller's timeout: loop until the deadline.
  }
}

/**
 * Journal what this wait actually DELIVERED, keyed by the screen on display.
 *
 * This is the only writer of `state/consumed`, and it exists so two readers can tell an
 * unread answer from a delivered one without guessing: the default `--since` baseline
 * here, and `pendingAnswer` in check-visual-state.cjs. The sensor stays read-only — a
 * sensor that marked things read would answer differently on a second call, and the
 * turn-end check is run more than once per turn on purpose.
 *
 * Best effort by design: a companion whose state dir went away mid-wait must still print
 * the user's answer. Losing the record costs one redundant reminder, never the answer.
 * Same reason a missing `submits` floors at 0 instead of being re-derived from disk:
 * re-reading could bank a Send that arrived after this result was built, and a
 * consumption recorded for an answer never delivered is the one error that loses it.
 */
function recordConsumed(sessionDir, result) {
  try {
    const stateDir = path.join(sessionDir, 'state')
    const newest = listScreens(path.join(sessionDir, 'content'))[0]
    fs.writeFileSync(
      path.join(stateDir, CONSUMED_FILE),
      JSON.stringify({
        screen: newest ? newest.name : null,
        submits: Number(result.submits) || 0,
        seq: Number(result.seq) || 0,
        at: Date.now(),
      }) + '\n'
    )
  } catch (e) { /* best effort — see doc comment */ }
}

function instructionsFor(result, ctx) {
  const again = `node ${ctx.selfPath} --project-dir "${ctx.projectDir}" --since ${result.seq != null ? result.seq : 0}`

  if (result.type === 'no-server') {
    return 'No live companion. Launch it with start-server.sh --reuse and render a real screen in the SAME turn before waiting again.'
  }
  if (result.type === 'server-stopped') {
    return 'The companion stopped while you were waiting. Do not silently keep going: relaunch it, re-render the screen the user was looking at, then wait again.'
  }
  if (result.type === 'timeout') {
    // Never assert "nothing happened" without checking: this instruction used to fire on
    // a journal that already held a confirmed answer, sending the agent to ask in the
    // terminal for something the user had already said in the browser.
    return result.pendingAnswer
      ? 'The wait ended without delivering an answer that IS on disk — the user confirmed and you have not read it. Do not ask them to repeat it: run check-visual-state.cjs --with-events, act on `finalSelection`, and only then render the next screen.'
      : 'No click arrived. Do NOT immediately wait again — the user may be thinking, or answering in the terminal instead. Hand back to the conversation.'
  }

  const picks = result.finalSelection || []
  const selection = picks.join(', ') || '(nothing — they deselected everything)'
  const clicks = (result.path || []).filter(Boolean)
  const explored = clicks.length > picks.length
  return [
    result.submitted
      ? `The user CONFIRMED: ${selection}.`
      : `The user clicked (NOT confirmed): ${selection}.`,
    picks.length > 1 ? `They picked ${picks.length} options at once — treat all of them as the answer, not just the first.` : null,
    'Use `finalSelection`, never the last entry of `path` — clicking a selected option DESELECTS it, so the last click can name what they just turned off.',
    explored ? 'They compared options before confirming — that is the screen working as designed, not a signal. Act on the confirmed selection alone: do not quote the click trail back, ask about it, or record it anywhere.' : null,
    result.renderDebt
      ? 'You owe a render: write the next screen to `screenDir` before ending this turn.'
      : 'Acknowledge the choice in the conversation, and re-render if the decision on screen has moved on.',
    result.submitted
      ? null
      : 'They have not pressed Send yet, so this is exploration and not an answer — do not act on it as a decision.',
    `To wait for the next action: ${again}`,
  ].filter(Boolean).join(' ')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      'Usage: wait-for-user.cjs --project-dir <repo-root> | --session-dir <dir> ' +
      '[--timeout-ms N] [--settle-ms N] [--since N] [--on submit|any]\n'
    )
    return
  }

  const timeoutMs = positiveInt(args['timeout-ms'], DEFAULT_TIMEOUT_MS, '--timeout-ms')
  const settleMs = positiveInt(args['settle-ms'], DEFAULT_SETTLE_MS, '--settle-ms')
  const on = args.on === undefined ? 'submit' : String(args.on)
  if (on !== 'submit' && on !== 'any') fail("--on must be 'submit' or 'any'")

  let sessionDir = null
  let projectDir = args['project-dir']
  if (args['session-dir']) {
    sessionDir = isLiveSession(args['session-dir']) ? args['session-dir'] : null
    if (!projectDir) projectDir = path.resolve(args['session-dir'], '..', '..', '..')
  } else if (projectDir) {
    sessionDir = findLiveSession(projectDir)
  } else {
    fail('one of --project-dir or --session-dir is required')
  }

  const emit = (result) => {
    // Record the consumption BEFORE reporting state, so the very payload this call
    // produces already reflects that the answer has been delivered.
    if (result.type === 'selection') recordConsumed(sessionDir, result)
    // The companion state rides along so the agent does not spend a second round
    // trip asking "where do I write / do I owe a render" the moment it wakes up.
    const state = evaluate({ sessionDir, maxAgeSeconds: null, now: Date.now(), withEvents: false })
    const merged = {
      ...result,
      url: state.url,
      screenDir: state.screenDir,
      stateDir: state.stateDir,
      newestScreen: state.newestScreen,
      renderDebt: state.renderDebt,
      // A wait can end without delivering the answer that is already on disk (an explicit
      // --since above a submit, or `--on any` racing a commit). Reporting the axis on
      // every outcome is what stops a timeout from being read as "nothing happened".
      pendingAnswer: state.pendingAnswer,
    }
    merged._instructions = instructionsFor(merged, {
      selfPath: __filename,
      projectDir: projectDir || '<repo-root>',
    })
    process.stdout.write(JSON.stringify(merged) + '\n')
  }

  if (!sessionDir) { emit({ type: 'no-server', seq: null }); return }

  const stateDir = path.join(sessionDir, 'state')
  const journalCount = readEvents(stateDir).count

  // WITHOUT --since, the journal is not history: a new screen truncates it, so everything
  // in it belongs to the screen currently on display. Anchoring at `journalCount` — what
  // this defaulted to — files an answer the agent has never seen under "already handled"
  // and then waits 600s for a second Send that the client-side lock makes impossible.
  // Measured in simulation: user confirms, agent parks 0.5s later, `type:"timeout"` with
  // `_instructions` saying "No click arrived" while the answer sat on disk the whole time.
  //
  // WITH --since, the agent is quoting a cursor this script handed it, and that is a real
  // consumption claim — honour it, including the re-anchor for a cursor stranded above a
  // truncated journal.
  const explicitSince = args.since !== undefined
  const since = explicitSince
    ? anchorCursor(positiveInt(args.since, 0, '--since'), journalCount)
    : 0

  // Baseline for "did they commit AFTER I started waiting". Scoped to the prefix the
  // cursor declares consumed, never to the whole file — and when no cursor was quoted, to
  // what this script recorded actually DELIVERING for the screen on display. That record
  // is what keeps a defaulted wait from re-serving an answer the agent already acted on.
  const stateAtStart = evaluate({ sessionDir, maxAgeSeconds: null, now: Date.now(), withEvents: false })
  const submitsAtStart = explicitSince
    ? readEvents(stateDir, { upTo: since }).submits || 0
    : consumedSubmitsFor(stateDir, stateAtStart.newestScreen)

  emit(await waitForEvent({ stateDir, timeoutMs, settleMs, since, on, submitsAtStart }))
}

if (require.main === module) {
  main().catch((err) => fail(err && err.message ? err.message : String(err)))
}

module.exports = {
  parseArgs, connectHost, watchJournal, waitForEvent, instructionsFor, settle, satisfies, anchorCursor,
  recordConsumed,
  SLICE_MS, DEFAULT_TIMEOUT_MS, DEFAULT_SETTLE_MS,
}
