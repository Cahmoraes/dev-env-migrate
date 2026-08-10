# Visual Companion — Reference

Detailed reference for the brainstorming visual companion. The operational flow lives in
`visual-companion.md` (Quick Start) — read this file only when you need the full CSS
catalog, per-platform launch behavior, remote binding, the events format, or cleanup
details.

## Launching by platform

The canonical command is in `visual-companion.md`, "Launch" section. The server must keep running
in the background across conversation turns; platforms differ in how they treat
background processes.

**Claude Code / GitHub Copilot CLI / agent CLIs (macOS / Linux):** default mode works, no
flags needed. The background path puts the server in a **brand-new session** (its own
session leader), decoupled from the launching shell — so when the harness tears down the
per-call shell session, the server survives (a plain `nohup` server shares that session and
gets reaped the instant the call returns). Linux uses the `setsid` binary; macOS lacks it
and falls back to `perl -e 'use POSIX "setsid"; setsid()'`, which exposes the same syscall.

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --project-dir /path/to/project
```

**Claude Code / GitHub Copilot CLI (Windows):** Windows/Git Bash has no `setsid` and reaps
`nohup` background processes, so the script auto-detects (`OSTYPE=msys*/cygwin*/mingw*` or
`MSYSTEM` set) and switches to foreground — meaning the `node server.cjs` process blocks the
shell call. You must run the bash call itself as a background/detached process so the server
survives across turns:

- **Claude Code:** set `run_in_background: true` on the Bash tool call.
- **GitHub Copilot CLI:** use `mode="async"` with `detach: true` on the bash tool call.

In both cases, read `<state_dir>/server-info` on the next turn for the URL and port.

**Codex:** Codex reaps detached processes; the script auto-detects `CODEX_CI` and switches
to foreground. Run it normally — no extra flags.

**Gemini CLI:** use `--foreground` and set `is_background: true` on your shell tool call so
the process survives across turns.

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --project-dir /path/to/project --foreground
```

**Other environments:** try the default background path first — it survives session-based
reaping via setsid/perl. Only if the server still dies between turns (e.g. cgroup reaping,
or no `setsid`/`perl`) fall back to `--foreground` plus your platform's background
mechanism. `--background` / `--foreground` force-override the auto-detection.

### Remote / containerized hosts

If the URL is unreachable from your browser (common in remote/containerized setups), bind a
non-loopback host and control the displayed hostname separately:

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

`--host` is the bind interface (default `127.0.0.1`); `--url-host` is the hostname printed
in the returned URL JSON.

## Session directories and lifecycle

- Each launch creates a fresh session dir: `<project>/.superpowers/brainstorm/<pid>-<ts>/`
  with `content/` (screens you write) and `state/` (server-info, events, pid, log).
  Without `--project-dir`, the session goes to `/tmp/brainstorm-<pid>-<ts>/` and is removed
  on stop.
- The server auto-exits after 30 minutes of inactivity, or when the owner process dies.
  Owner-PID detection can fail on WSL, Tailscale SSH, and cross-user scenarios; when it
  does, PID monitoring is disabled and only the idle timeout applies.
- `state/server-info` exists while the server is up; `state/server-stopped` is written on
  shutdown. You do not check these by hand: `check-visual-state.cjs` reports the same
  liveness as `companionActive` (Quick Start, "The loop" step 1).
- `scripts/check-visual-state.cjs` reads that same liveness triple (the rule
  `start-server.sh --reuse` applies, so both agree on which session is "the" companion) and
  reports what `content/` is serving — the turn-end backstop against handing the user a URL
  with nothing behind it. See "The render debt" in `references/visual-companion-operation.md`.

## How serving works

- `GET /` serves the newest `*.html` in `content/` by mtime. A fragment (does not start
  with `<!doctype`/`<html>`) is wrapped in `frame-template.html` at the `<!-- CONTENT -->`
  marker; the client helper (`helper.js`) is injected before `</body>`.
- `GET /files/<name>` serves a static asset from `content/` (basename only — path traversal
  is blocked). MIME types: html, css, js, json, png, jpg/jpeg, gif, svg.
- The server resolves its own static templates relative to the script directory
  (`__dirname`), so `frame-template.html` and `helper.js` are always found regardless of
  the caller's working directory.

## CSS classes

The frame template provides these classes for your content. For the common kinds
(`options`, `cards`, `pros-cons`) you normally don't write this markup by hand — generate
it from a spec with `render-screen.cjs` (see `visual-companion.md`, "Writing content" section).
This catalog is for the escape-hatch case (bespoke layouts) and for understanding what the
generator emits.

### Options (A/B/C choices)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Title</h3><p>Description</p></div>
  </div>
</div>
```

Add `data-multiselect` to the container for multi-select; each click toggles, and the
indicator bar shows the count. In both modes, clicking an already-selected element
deselects it.

### Selection in bespoke layouts

The injected helper (`helper.js`) owns selection for **any** element with a `data-choice`
attribute — even outside `.options`/`.cards` containers and even in full HTML documents.
The inline `onclick="toggleSelect(this)"` is optional: when no handler on the page changes
the selection state of the clicked element, the helper toggles it automatically. This means
a bespoke mockup only needs `data-choice` on its clickable panels and a CSS rule keyed on
`.selected` for the visual state. Do **not** write a custom selection `<script>` — add-only
handlers break deselection and fight with the helper.

### Cards (visual designs)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup --></div>
    <div class="card-body"><h3>Name</h3><p>Description</p></div>
  </div>
</div>
```

### Mockup container

```html
<div class="mockup">
  <div class="mockup-header">Preview: Dashboard Layout</div>
  <div class="mockup-body"><!-- your mockup HTML --></div>
</div>
```

### Split view (side-by-side)

```html
<div class="split">
  <div class="mockup"><!-- left --></div>
  <div class="mockup"><!-- right --></div>
</div>
```

### Pros / Cons

```html
<div class="pros-cons">
  <div class="pros"><h4>Pros</h4><ul><li>Benefit</li></ul></div>
  <div class="cons"><h4>Cons</h4><ul><li>Drawback</li></ul></div>
</div>
```

### Mock elements (wireframe building blocks)

```html
<div class="mock-nav">Logo | Home | About | Contact</div>
<div style="display: flex;">
  <div class="mock-sidebar">Navigation</div>
  <div class="mock-content">Main content area</div>
</div>
<button class="mock-button">Action Button</button>
<input class="mock-input" placeholder="Input field">
<div class="placeholder">Placeholder area</div>
```

### Typography and sections

- `h2` — page title · `h3` — section heading
- `.subtitle` — secondary text below title
- `.section` — content block with bottom margin
- `.label` — small uppercase label text

## Browser events format

User clicks are recorded to `<state_dir>/events`, one JSON object per line. The file is
cleared automatically when you push a new screen.

**You normally never read this file.** `check-visual-state.cjs --with-events` returns the
digest (`finalSelection`, `path`, `count`) in the same call that reports liveness — the
format below is for understanding what that digest is derived from.

```jsonl
{"type":"click","choice":"a","text":"Option A - Simple Layout","selected":true,"selectedChoices":["a"],"timestamp":1706000101}
{"type":"click","choice":"a","text":"Option A - Simple Layout","selected":false,"selectedChoices":[],"timestamp":1706000105}
{"type":"click","choice":"b","text":"Option B - Hybrid","selected":true,"selectedChoices":["b"],"timestamp":1706000115}
```

Each click records the resulting state: `selected` is `true` when the click selected the
element and `false` when it deselected it (clicking an already-selected option toggles it
off). `selectedChoices` is the full set of currently-selected choices after the click —
read the **last event's** `selectedChoices` to know the final selection, not just the last
`choice` value.

The full stream shows the exploration path — the user may click several options before
settling. That is normal use of the screen, not a signal: read the final selection and
move on. If `events` doesn't exist, the user didn't interact in the browser — use only
their terminal text.

## Waiting for the browser

`wait-for-user.cjs` blocks until the user acts, then prints **one JSON line** and exits.
That exit is the whole point: a CLI agent cannot hold a connection open across turns, so
its only inbox is a process that terminates. Blocking here turns an asynchronous browser
click into a process exit every harness knows how to notify on.

```bash
node <super.brainstorming-base-dir>/scripts/wait-for-user.cjs \
  --project-dir "$(git rev-parse --show-toplevel)" \
  [--timeout-ms 600000] [--settle-ms 1500] [--since N]
```

| Flag | Default | What it does |
|---|---|---|
| `--timeout-ms` | 600000 | Total wait. Longer waits are stitched from ≤240s HTTP slices, so no single request risks Node's 300s request timeout. |
| `--on` | `submit` | `submit` ends the wait only on an explicit confirmation. `any` ends it on any click — for a screen with nothing to confirm. |
| `--settle-ms` | 1500 | `--on any` only: absorb further clicks until the stream goes quiet, so one wake carries the whole decision. A submit is already settled. |
| `--since N` | current journal size | Only report clicks past event N. Omitted means "from now on" — an already-consumed decision is never replayed. |
| `--session-dir` | — | Target one session explicitly instead of resolving the newest live one. |

### Reading the answer

`type` is the verdict; the exit code is **always** 0 except on a usage error.

| `type` | Meaning | What to do |
|---|---|---|
| `selection` | The user acted. `submitted` says whether they CONFIRMED. | Act on `finalSelection` (which may hold several choices). Pass `seq` as the next `--since`. |
| `timeout` | Nobody clicked within `--timeout-ms`. | Hand back to the conversation. Do **not** immediately wait again. |
| `server-stopped` | The companion shut down mid-wait. | Relaunch, re-render the screen they were looking at, then wait again. |
| `no-server` | No live companion for this project. | Launch it and render a real screen in the same turn. |

Every answer also carries `url`, `screenDir`, `newestScreen`, `renderDebt` — the same
fields `check-visual-state.cjs` reports — so waking up does not cost a second round trip
to ask where to write. And every answer carries `_instructions`: the authoritative next
step for that exact outcome, with the real `seq` and paths already substituted. When
`_instructions` conflicts with this document, `_instructions` wins; it is generated from
the script's actual behavior and therefore cannot drift from it.

### Confirmation, multi-select, and the exploration trail

The injected helper renders a **Send** button into the indicator bar — you never write
one, and a full document that bypasses the frame gets a floating one created for it. It
stays hidden until something is selected, so a presentational screen shows no dead
control.

A click is exploration, a submit is the answer. The user can hit the wrong panel,
compare two, or change their mind; ending the wait on the first click turns a misclick
into a decision nobody made. So the journal keeps both, and the digest separates them:

- `finalSelection` — the CONFIRMED set. Add `data-multiselect` to an ancestor and the
  user can answer several questions on one screen; every entry is part of the answer.
  A submit wins over any click that follows it, so continued exploration after
  confirming cannot overwrite the decision.
- `path` — the click trail, submits excluded. **Diagnostics, not an answer.** It is there
  so a human debugging the bridge can see what the browser sent; the decision is
  `finalSelection` alone. Quoting the trail back, or asking about it, punishes the user
  for using the screen the way it was built to be used.

**One answer per screen: Send spends itself.** On commit the button locks to `Sent ✓`
and the screen stops emitting — further clicks change nothing and reach no journal. This
is not politeness about double-clicks: a submit is consumed the instant it lands, so the
second one answers a question that is already closed, and it waits in the journal where
the *next* park can read it as the answer to a screen the user has not been shown yet.

The lock lifts on the `reload` the server broadcasts for `screen-added` and
`screen-updated` — a new screen, and nothing else. A click cannot forge it, and neither
can an `agent-waiting` push. **The operational consequence for you: a screen answers
exactly once.** If you need the user to revise a decision they already sent, write a new
screen (`layout-v2.html`); asking them to "press Send again" hands them a dead button.
- `submitted` / `submits` — whether they committed, and how many times.

Use `--on any` only when the screen genuinely has nothing to confirm.

**The client re-derives the digest from the journal on disk before deciding.** This is
not belt-and-braces: `--reuse` keeps servers alive across skill updates, and a running
server holds its digest code in memory (unlike `helper.js` and the frame template, which
it re-reads per request). A server older than the client answers `/poll` with an older
payload shape — the 404 fallback catches a missing route, never a stale field. Measured
live: the user pressed Send, the journal recorded it, the browser showed "Sent ✓", and
the agent waited forever. Reading the journal with the client's own code removes the
skew entirely.

### Transport, and why it degrades gracefully

The agent leg is an HTTP **long poll** (`GET /poll?since=N&timeout=M`), not a socket. The
server parks the request and answers it the moment the click journal grows past `since`.
`seq` is not server state — it is the line count of the append-only `events` journal, so
it survives a server restart and means the same thing to any reader. It is **not**
monotonic across screens: rendering a new screen truncates the journal back to zero, so
a `seq` carried over from the previous screen points past the end of the file. Both the
server and the client re-anchor such a cursor at 0 — without that, the first Send on the
new screen lands below the old high-water mark and is silently swallowed.

Two fallbacks matter in practice:

- **The running server predates `/poll`.** `start-server.sh --reuse` deliberately keeps
  servers alive across skill updates, so this is routine. The old server answers 404 and
  the client transparently switches to watching the journal file.
- **Any platform.** The fallback uses `fs.watchFile` (stat polling), not `fs.watch`.
  Native filesystem notification differs across Linux/macOS/Windows and is unreliable on
  WSL mounts, network shares, and some container filesystems; stat polling is uniformly
  boring everywhere.

While a poll is parked, the server pushes `{"type":"agent-waiting","waiting":true}` to the
browser and the indicator bar changes from *"return to the terminal"* to *"the agent is
waiting — click an option to answer"*. Without that signal the user cannot tell a
delivered click from clicking into the void, so the wording is part of the feature, not
decoration.

## Design tips

The Quick Start already covers stating the question on every page, 2–4 options per screen,
iterating before advancing, and matching the project's visual language (the "Project-aware
design tokens" section below). Beyond those:

- Scale fidelity to the question — wireframes for layout, polish for polish questions.
- Use real content when it matters (e.g. actual images for a portfolio); placeholders hide
  design issues. Otherwise keep mockups simple — layout and structure over pixel polish.

## Project-aware design tokens

Before writing any bespoke mockup HTML, the design system and target screen must be
discovered — but that discovery runs in a **dedicated read-only exploration subagent**, not on
the main orchestrator thread (theme configs, global CSS, and component sources are large; their
raw bytes only need to live long enough to derive a few tokens). The subagent follows the
playbook below and returns the **Return shape** further down — nothing else.

### Discovery playbook (the subagent runs this)

```bash
# 1. Identify the UI library
grep -E '"dependencies"|"devDependencies"' -A 100 <project-root>/package.json | \
  grep -E 'ui|design|theme|style|mistica|mui|tailwind|bootstrap|chakra|radix|antd|carbon'

# 2. Find where tokens live — a JS theme config OR a CSS token block
find <project-root>/src -name "theme.*" -o -name "*.theme.*" 2>/dev/null | head -5
# Tailwind v4+ keeps tokens in CSS, not a JS config — grep the @theme / :root token block
# (common file: src/**/globals.css); also check tailwind.config.* on older setups.
grep -rlE '@theme|:root|--color-|--radius-' <project-root>/src 2>/dev/null | head -5

# 3. Extract primary color and border-radius from whatever was found above:
#   - primary/brand color (hex value or CSS variable)
#   - button border-radius (pill 9999px vs rounded vs square)
#   - background color
#   - text colors (primary and secondary)
# Derive button/card SHAPE from the actual radius token / utility class (e.g. rounded-md →
# --radius-md), NOT from code comments — comments drift (a "pill" comment over a rounded-md class).
```

Run only the relevant steps. Stop as soon as you have the primary color, button shape,
and background color — you don't need every token.

### Return shape (what the subagent reports back)

The subagent returns **only this distilled report** — never raw file contents, full configs,
or whole component sources. The orchestrator builds the mockup from it without re-reading.

```
UI library: <name + version, or "custom theme">
Tokens:
  primary: <hex/var>   text: <hex>   subtle: <hex>   bg: <hex>
  radius:  button <e.g. 8px>   card <e.g. 12px>
  font:    <stack>
  spacing: <base scale, e.g. 4px step / Tailwind default>
Component conventions: <1-3 lines — button variant, card elevation, chip/tag shape>
Reusable components: <names + file paths the implementer can reuse, e.g. Button, Card>
Changed component(s): <for the component(s) the mockup actually renders — its current
  appearance AND interaction states: shape/aspect/radius/bg/border + hover/active/focus/
  disabled treatment. This is the fidelity detail a layout-only summary misses; capture it
  whenever the feature changes how a specific component looks or behaves (overlays, hover
  feedback, toggles), so the mockup reproduces it instead of inventing a generic version.>
Target screen: <the screen being changed — current layout in 2-4 lines: regions, where
  the changed element sits today — so the mockup matches the real screen, not a blank canvas>
Dark theme: <tokens if the project has a dark variant, else "n/a">
```

Keep it compact — this whole report should be a few dozen lines, not file dumps.

### Token-to-CSS mapping

Once you have the tokens, embed them at the top of your HTML fragment:

```html
<style>
  :root {
    --color-primary: #000000;   /* replace with actual value from theme config */
    --color-text:    #1a1a1a;
    --color-subtle:  #6e6e6e;
    --color-bg:      #ffffff;
    --radius-btn:    8px;       /* match the project: 999px pill, 8px rounded, 4px square */
    --radius-card:   12px;
    --font:          system-ui, -apple-system, sans-serif;
  }
  /* ... rest of mockup CSS uses var(--color-primary) etc. */
</style>
```

### Worked example — generic discovery

```
Detected: a custom theme at src/theme/tokens.ts
Extracted:
  primary: #1a73e8 (brand blue)
  text:    #202124
  subtle:  #5f6368
  bg:      #ffffff
  button:  border-radius 4px, contained, white label
  card:    border-radius 8px, elevated shadow
Font: Roboto → fallback to system-ui
```

The mockup uses the exact brand blue, square-ish buttons, and card elevation pattern —
giving the user an accurate preview to approve or reject. If no theme file is found,
ask the user for the primary brand color before proceeding.

### Anti-pattern

**Never render a mockup with generic gray/blue placeholder styles** when the project has
a design system. A button that should be purple pill-shaped rendered as a square blue
button misrepresents the final result and invalidates the user's layout decision.

## File naming

- Semantic names: `platform.html`, `visual-style.html`, `layout.html`.
- Never reuse a filename — each screen is a new file.
- Iterations: append a version suffix (`layout-v2.html`, `layout-v3.html`).
- The server serves the newest file by modification time.

## Cleaning up

```bash
bash <super.brainstorming-base-dir>/scripts/stop-server.sh <session_dir>
```

`--project-dir` sessions persist under `.superpowers/brainstorm/`; only `/tmp` sessions are
deleted on stop.

## Internal references

- Frame template (CSS source): `scripts/frame-template.html`
- Client helper (injected): `scripts/helper.js`
- Screen generator: `scripts/render-screen.cjs`
- Server: `scripts/server.cjs` · Launch/stop: `scripts/start-server.sh`, `scripts/stop-server.sh`
