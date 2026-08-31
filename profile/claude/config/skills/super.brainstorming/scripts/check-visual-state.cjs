#!/usr/bin/env node
'use strict'

/**
 * check-visual-state.cjs — report what the visual companion is currently showing.
 *
 * Root cause this script exists for:
 *   "Honor the acceptance" used to be a SESSION-scoped promise ("use the companion at
 *   least once"). A session-scoped obligation has no trigger point, so deferring it is
 *   never a violation in any individual turn — it only becomes one at the end, when it
 *   is too late. In a real run the model accepted the companion, launched the server,
 *   announced the URL, and then spent two full turns on the complexity checkpoint and
 *   the deep-research consent gate with an EMPTY browser open, until the user had to
 *   type "atualize o mockup visual".
 *
 * The fix is to make the obligation checkable NOW: this script turns "do I owe the user
 * a render?" from a memory task into a mechanical read of the session directory.
 *
 * Usage:
 *   node check-visual-state.cjs --project-dir <repo-root>
 *   node check-visual-state.cjs --session-dir <.superpowers/brainstorm/<session>>
 *   node check-visual-state.cjs --project-dir <repo-root> --max-age-seconds 600
 *   node check-visual-state.cjs --project-dir <repo-root> --with-events
 *
 * Output (stdout, always JSON — exit code is 0 except on usage/IO error):
 *   {
 *     "companionActive": true,
 *     "sessionDir": "...", "screenDir": "...", "stateDir": "...", "url": "http://localhost:52353",
 *     "screens": 0, "placeholders": 0,
 *     "newestScreen": null, "newestIsPlaceholder": false, "newestRealScreen": null,
 *     "newestScreenKind": "generated" | "bespoke" | null,
 *     "ageSeconds": null,
 *     "renderDebt": true,
 *     "pendingAnswer": false,
 *     "reason": "no-screen-rendered",
 *     "action": "...",
 *     // only with --with-events:
 *     "events": { "present": true, "count": 3, "path": ["a","b","b"],
 *                 "finalSelection": ["a"], "malformed": 0 },
 *     // only with --with-events, and only when an archived answer exists:
 *     "previousAnswer": { "screen": "layout.html", "finalSelection": ["b"], "submits": 1 }
 *   }
 *
 * Verdict lives in `renderDebt` + `reason`, NEVER in the exit code (repo-wide script
 * contract: exit code signals usage/IO failure only).
 *
 * Reasons:
 *   no-server          — no live companion for this project; nothing is owed.
 *   no-screen-rendered — server up, zero real screens ever written. HARD debt: the user
 *                        is staring at an empty browser you told them to open.
 *   generated-only     — real screens exist but EVERY one of them is generator text cards.
 *                        HARD debt: the offer promised an artifact worth seeing and the
 *                        browser only ever showed text a chat message could have carried.
 *   terminal-parked    — newest screen is a waiting/placeholder screen and real screens
 *                        exist. Legitimate: the documented state for a terminal question.
 *   stale-screen       — only with --max-age-seconds: newest real screen is older than
 *                        the threshold while the server is up.
 *   current            — a real screen is the newest thing on the server.
 *
 * newestScreenKind narrows the presence/correspondence boundary below by ONE mechanical
 * step: 'generated' means render-screen.cjs text cards are on screen, which the Layout gate
 * forbids for any positioning/layout/appearance question. Presence alone reported "current"
 * while a real session answered "bottom sheet vs centered dialog" with 927B of text cards.
 *
 * `generated-only` applies the same signal to the WHOLE history instead of the newest file,
 * and it is the debt axis rather than the layout one: a companion whose every screen is
 * generated never showed the artifact its offer promised. Measured on a session that opened
 * the browser for a scope question — five text cards, `renderDebt:false`, `reason:current`,
 * and a user who had left the terminal to read a numbered list. KNOWN false negative: with
 * `--reuse`, a bespoke screen left in the content dir by an EARLIER brainstorming on the
 * same live server counts as history, so it masks the violation. Never a false positive —
 * a brainstorming that rendered its own bespoke screen has that file in the same dir.
 *
 * pendingAnswer narrows it by a SECOND mechanical step, on the other leg of the loop: the
 * browser is an input device, so a turn can end with an answer sitting unread in the
 * journal. Writing any new screen truncates that journal (server.cjs), and step 6 of the
 * loop ends a terminal-bound turn by writing exactly that — a placeholder. Measured in
 * simulation: the user confirmed, the agent parked 0.5s later, and the next state call
 * reported `present:false` with `terminal-parked`, i.e. a confirmed decision destroyed
 * while every signal said the loop was healthy. `pendingAnswer` rides in the DEFAULT
 * payload (the events digest still needs --with-events) precisely because the turn-end
 * check documented in the loop is the one that runs without it.
 *
 * It is true when the current journal holds more submits than the wait client recorded
 * consuming for the screen on display (`state/consumed`). An agent that read the answer
 * with --with-events instead of waiting on it will therefore see a true `pendingAnswer`
 * until it renders the next screen: a redundant reminder to read what it just read, which
 * is the safe direction — the failure it replaces silently discards the user's decision.
 *
 * KNOWN BOUNDARY (deliberate, mirrors validate-tasks' --mockups linkage-vs-bijection
 * boundary): this script decides PRESENCE mechanically ("is there a real screen up?"),
 * not CORRESPONDENCE ("does that screen answer the question I am about to ask?").
 * Correspondence is semantic and stays with the prose rule in SKILL.md ("Keep the screen
 * current"). `ageSeconds` is reported on every call so the model can judge it; pass
 * --max-age-seconds to turn staleness into a hard debt too.
 */

const fs = require('fs')
const path = require('path')

// A placeholder is the documented "Continuing in terminal…" unload screen. It parks the
// browser on purpose, so it must not count as having shown the user anything.
//
// Two detectors, because the corpus of 13 real sessions on disk showed both gaps: every
// historical placeholder predates the marker and is caught by filename alone, and every one
// of them is written in the session language (pt-BR "Continuando no terminal…"), so an
// English-only name list would miss a pt-BR session that names the file `aguardando.html`.
// New screens carry the marker (documented in references/visual-companion.md, "The loop" step 6).
const PLACEHOLDER_NAME = /^(waiting|placeholder|idle|continuing|aguardando|aguarde|pausa|espera|esperando|continuando)/i
const PLACEHOLDER_MARKER = 'data-companion-placeholder'

// A generator screen (render-screen.cjs) draws TEXT CARDS and cannot express layout, so
// the Layout gate forbids it for positioning/spacing/appearance questions. New output
// carries the marker; older files are recognized by the generator's shape — one of its
// three containers and no <style> block, which a bespoke mockup essentially always has.
const GENERATED_MARKER = '<!--companion:generated-->'
const GENERATED_CONTAINER = /<div class="(options|cards|pros-cons)"/

// The three files that make up the answer leg of the loop. `events` is the live journal
// for the screen on display; `events.prev` is the one a new screen displaced (kept so a
// discarded answer stays RECOVERABLE instead of vanishing); `consumed` is written by
// wait-for-user.cjs when it hands an answer to the agent, and is what separates "already
// delivered" from "still unread" without the sensor having to mutate anything.
//
// All three degrade gracefully against a companion started before they existed —
// `--reuse` deliberately keeps such servers alive across skill updates. An old server
// still unlinks instead of displacing, so `previousAnswer` is simply absent; the axis
// that matters (`pendingAnswer`) reads the live journal and the record, neither of which
// the server writes.
const EVENTS_FILE = 'events'
const PREV_EVENTS_FILE = 'events.prev'
const CONSUMED_FILE = 'consumed'

function fail(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n')
  process.exit(1)
}

/**
 * Flags with values (`--project-dir X`) and valueless boolean flags (`--with-events`).
 * A boolean flag must NOT swallow the next token: `--with-events --project-dir X` would
 * otherwise bind "--project-dir" as the flag's value and orphan X.
 */
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

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM means the process exists but belongs to another user — still alive.
    return e.code === 'EPERM'
  }
}

/** A session is live when server-info exists, server-stopped does not, and the pid answers. */
function isLiveSession(sessionDir) {
  const stateDir = path.join(sessionDir, 'state')
  if (!fs.existsSync(path.join(stateDir, 'server-info'))) return false
  if (fs.existsSync(path.join(stateDir, 'server-stopped'))) return false
  let pid
  try {
    pid = parseInt(fs.readFileSync(path.join(stateDir, 'server.pid'), 'utf8').trim(), 10)
  } catch (e) {
    return false
  }
  return isAlive(pid)
}

/**
 * Newest live session under <project-dir>/.superpowers/brainstorm/.
 * Mirrors start-server.sh --reuse so both agree on which server is "the" companion.
 */
function findLiveSession(projectDir) {
  const root = path.join(projectDir, '.superpowers', 'brainstorm')
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch (e) {
    return null
  }
  const candidates = entries
    .map((e) => path.join(root, e.name))
    .map((dir) => {
      let mtime = 0
      try {
        mtime = fs.statSync(path.join(dir, 'state', 'server-info')).mtimeMs
      } catch (err) { /* no server-info — filtered out below */ }
      return { dir, mtime }
    })
    .filter((c) => c.mtime > 0)
    .sort((a, b) => b.mtime - a.mtime)

  for (const c of candidates) {
    if (isLiveSession(c.dir)) return c.dir
  }
  return null
}

/**
 * Digest of `<state_dir>/events` — the browser click stream — for `--with-events`.
 *
 * Two reasons this lives here instead of the model reading the file itself:
 *
 *  1. **It removes a tool call.** The loop already had to check liveness before writing a
 *     screen and read `events` at the start of the turn; both are answered by this one
 *     call. (Same lever as the router's "one call, three outputs" bootstrap: a round trip
 *     costs ~10s, the script costs milliseconds.)
 *  2. **It removes a documented footgun.** The final selection is the LAST event's
 *     `selectedChoices`, not the last `choice` — clicking a selected option deselects it,
 *     so the last `choice` can name something the user just turned OFF. Deriving it here
 *     makes that impossible to get wrong, and keeps the raw JSONL out of context.
 *
 * `path` preserves the click sequence, because the exploration pattern (a → a → b) is
 * itself signal worth asking about; only the verbose per-event JSON is dropped.
 */
function readEvents(stateDir, opts) {
  let raw
  try {
    raw = fs.readFileSync(path.join(stateDir, (opts && opts.file) || EVENTS_FILE), 'utf8')
  } catch (e) {
    // Absent file is the normal "user did not touch the browser" case, not an error.
    return { present: false, count: 0, path: [], finalSelection: [], submits: 0, submitted: false, malformed: 0 }
  }

  let lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  // `upTo` digests only the PREFIX a caller has already consumed. The long poll's cursor
  // is a line count, so "everything up to my cursor" is the only honest definition of
  // history — reading the whole file instead would file an answer the agent has not seen
  // yet under "already handled".
  if (opts && Number.isFinite(opts.upTo)) lines = lines.slice(0, Math.max(0, opts.upTo))
  const clicks = []
  let malformed = 0
  for (const line of lines) {
    try {
      clicks.push(JSON.parse(line))
    } catch (e) {
      malformed++
    }
  }

  // A `submit` is the user COMMITTING a decision; a click is exploration. When a submit
  // exists, it — not the last click — is the answer: the user may have kept clicking
  // around afterwards, and acting on that would answer a question they already settled.
  const submits = clicks.filter((c) => c && c.type === 'submit')
  const last = submits.length > 0 ? submits[submits.length - 1] : clicks[clicks.length - 1]
  return {
    present: true,
    count: clicks.length,
    // `path` is the exploration trail only, so a submit does not appear as a phantom
    // extra click on the option it confirmed.
    path: clicks.filter((c) => !(c && c.type === 'submit'))
      .map((c) => (c && c.choice != null ? c.choice : null)),
    finalSelection: last && Array.isArray(last.selectedChoices) ? last.selectedChoices : [],
    submits: submits.length,
    submitted: submits.length > 0,
    malformed,
  }
}

/**
 * What wait-for-user.cjs last handed to the agent: `{ screen, submits, seq }`.
 *
 * Keyed by SCREEN, not by seq alone: a new screen truncates the journal, so a submit
 * count carried over from the previous screen would silently mask the first answer on
 * the new one. A record whose screen is no longer the newest is history, and history
 * consumes nothing.
 */
function readConsumed(stateDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(stateDir, CONSUMED_FILE), 'utf8').trim())
    if (!parsed || typeof parsed !== 'object') return null
    return { screen: parsed.screen || null, submits: Number(parsed.submits) || 0, seq: Number(parsed.seq) || 0 }
  } catch (e) {
    return null
  }
}

/** Submits already delivered for `screen` — 0 whenever the record belongs elsewhere. */
function consumedSubmitsFor(stateDir, screen) {
  const consumed = readConsumed(stateDir)
  // `null === null` counts on purpose: "no screen on display" is a state a wait can be
  // delivered in (the watch fallback runs against the journal alone), and treating it as
  // a mismatch would re-serve an answer that was already handed over.
  if (!consumed || consumed.screen !== screen) return 0
  return consumed.submits
}

function readUrl(stateDir) {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(stateDir, 'server-info'), 'utf8').trim())
    return info.url || null
  } catch (e) {
    return null
  }
}

function isPlaceholder(screenDir, name) {
  if (PLACEHOLDER_NAME.test(name)) return true
  try {
    return fs.readFileSync(path.join(screenDir, name), 'utf8').includes(PLACEHOLDER_MARKER)
  } catch (e) {
    return false
  }
}

/** 'placeholder' | 'generated' | 'bespoke' — what kind of screen this file is. */
function classifyScreen(screenDir, name) {
  if (isPlaceholder(screenDir, name)) return 'placeholder'
  let html
  try {
    html = fs.readFileSync(path.join(screenDir, name), 'utf8')
  } catch (e) {
    return 'bespoke'
  }
  if (html.includes(GENERATED_MARKER)) return 'generated'
  if (GENERATED_CONTAINER.test(html) && !/<style[\s>]/i.test(html)) return 'generated'
  return 'bespoke'
}

/** Every .html in the content dir, newest first, tagged as placeholder or real. */
function listScreens(screenDir) {
  let names
  try {
    names = fs.readdirSync(screenDir).filter((n) => n.toLowerCase().endsWith('.html'))
  } catch (e) {
    return []
  }
  return names
    .map((name) => {
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(path.join(screenDir, name)).mtimeMs
      } catch (err) { /* vanished between readdir and stat — sorts last */ }
      const kind = classifyScreen(screenDir, name)
      return { name, mtimeMs, kind, placeholder: kind === 'placeholder' }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

const ACTIONS = {
  'no-server': 'No live companion — nothing owed. Launch it only when you are ready to render.',
  'no-screen-rendered':
    'RENDER DEBT: you told the user to open a URL that shows nothing. Write the screen that justified the companion BEFORE ending this turn — it pre-empts clarifying questions, complexity checkpoints, and consent gates.',
  'generated-only':
    'RENDER DEBT: every screen served so far is generator text cards, which a terminal message could have carried. Render the artifact you named when you offered the companion — a bespoke mockup or diagram — or say in-thread that the debt cannot be settled and stop the server.',
  'terminal-parked':
    'Browser is parked on a placeholder while the conversation runs in the terminal. Legitimate — re-render when the next visual decision comes up.',
  'stale-screen':
    'RENDER DEBT: the newest screen is older than the allowed age. Re-render it against the current question before ending this turn.',
  current: 'A real screen is up. Keep it current: re-render whenever the visual decision on screen moves on.',
}

// Appended to `action`, never substituted into it: the render debt and the unread answer
// are independent axes, and a turn can owe both.
const PENDING_ANSWER_ACTION =
  'UNREAD ANSWER: the user confirmed something in the browser that you have not acted on. Read it with --with-events and answer it BEFORE writing the next screen — any new file, including the step-6 placeholder, truncates the journal.'

function evaluate({ sessionDir, maxAgeSeconds, now, withEvents }) {
  if (!sessionDir) {
    return {
      companionActive: false,
      sessionDir: null, screenDir: null, stateDir: null, url: null,
      screens: 0, placeholders: 0,
      newestScreen: null, newestIsPlaceholder: false, newestRealScreen: null, newestScreenKind: null,
      ageSeconds: null,
      renderDebt: false, pendingAnswer: false, reason: 'no-server', action: ACTIONS['no-server'],
      ...(withEvents ? { events: { present: false, count: 0, path: [], finalSelection: [], submits: 0, submitted: false, malformed: 0 } } : {}),
    }
  }

  const stateDir = path.join(sessionDir, 'state')
  const screenDir = path.join(sessionDir, 'content')
  const all = listScreens(screenDir)
  const real = all.filter((s) => !s.placeholder)
  const newest = all[0] || null
  const newestReal = real[0] || null
  const ageSeconds = newestReal ? Math.max(0, Math.round((now - newestReal.mtimeMs) / 1000)) : null

  let reason
  if (real.length === 0) reason = 'no-screen-rendered'
  // Before terminal-parked on purpose: parking the browser on a placeholder without ever
  // having shown the promised artifact is the same unpaid debt, one turn later.
  else if (real.every((s) => s.kind === 'generated')) reason = 'generated-only'
  else if (newest && newest.placeholder) reason = 'terminal-parked'
  else if (maxAgeSeconds != null && ageSeconds != null && ageSeconds > maxAgeSeconds) reason = 'stale-screen'
  else reason = 'current'

  // Against the screen ON DISPLAY, not the newest real one: a parked browser still shows
  // the placeholder, and the answer that matters was given to whatever the journal
  // belongs to.
  const live = readEvents(stateDir)
  const pendingAnswer = live.submits > consumedSubmitsFor(stateDir, newest ? newest.name : null)
  const archived = withEvents ? readEvents(stateDir, { file: PREV_EVENTS_FILE }) : null

  return {
    companionActive: true,
    sessionDir, screenDir, stateDir, url: readUrl(stateDir),
    screens: real.length,
    placeholders: all.length - real.length,
    newestScreen: newest ? newest.name : null,
    newestIsPlaceholder: newest ? newest.placeholder : false,
    newestRealScreen: newestReal ? newestReal.name : null,
    newestScreenKind: newestReal ? newestReal.kind : null,
    ageSeconds,
    renderDebt: reason === 'no-screen-rendered' || reason === 'stale-screen' || reason === 'generated-only',
    pendingAnswer,
    reason,
    action: pendingAnswer ? `${ACTIONS[reason]} ${PENDING_ANSWER_ACTION}` : ACTIONS[reason],
    ...(withEvents ? { events: live } : {}),
    // Only when there is something to recover: a displaced journal with no submit in it
    // was pure exploration, and paying for it on every turn would be noise.
    ...(archived && archived.submitted
      ? {
          previousAnswer: {
            finalSelection: archived.finalSelection,
            submits: archived.submits,
            note: 'A confirmed answer was displaced by a newer screen. If you never acted on it, this is it.',
          },
        }
      : {}),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      'Usage: check-visual-state.cjs --project-dir <repo-root> | --session-dir <dir> [--max-age-seconds N] [--with-events]\n'
    )
    return
  }

  let maxAgeSeconds = null
  if (args['max-age-seconds'] != null) {
    maxAgeSeconds = Number(args['max-age-seconds'])
    if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) fail('--max-age-seconds must be a non-negative number')
  }

  let sessionDir = null
  if (args['session-dir']) {
    sessionDir = isLiveSession(args['session-dir']) ? args['session-dir'] : null
  } else if (args['project-dir']) {
    sessionDir = findLiveSession(args['project-dir'])
  } else {
    fail('one of --project-dir or --session-dir is required')
  }

  const withEvents = args['with-events'] !== undefined
  process.stdout.write(JSON.stringify(evaluate({ sessionDir, maxAgeSeconds, now: Date.now(), withEvents })) + '\n')
}

if (require.main === module) main()

module.exports = {
  evaluate, listScreens, isPlaceholder, classifyScreen, findLiveSession, isLiveSession, readEvents,
  readConsumed, consumedSubmitsFor,
  EVENTS_FILE, PREV_EVENTS_FILE, CONSUMED_FILE, PENDING_ANSWER_ACTION,
  // Exported so the prose guard derives the reason list instead of restating it: a new code
  // added here and documented nowhere is exactly the drift that guard exists to catch.
  ACTIONS,
}
