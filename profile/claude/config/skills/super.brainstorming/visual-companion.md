# Visual Companion — Quick Start

Browser-based companion for showing mockups, diagrams, and visual options during
brainstorming. A zero-dependency local HTTP+WebSocket server: you write HTML files to a
watched directory, the server serves the newest one, the user clicks in the browser, and
selections come back to you on your next turn.

This Quick Start is everything you need to operate the companion. For the full CSS class
catalog, per-platform launch notes, remote/containerized binding, the browser-events JSON
format, and cleanup, see `visual-companion-reference.md` — load it only when a specific need arises.

## When browser, when terminal

Decide **per question**, not per session. The test: *would the user understand this
better by seeing it than reading it?*

- **Browser** — content that IS visual: UI mockups, wireframes, layout comparisons,
  architecture/flow diagrams, side-by-side visual designs, look-and-feel/spacing choices.
- **Terminal** — content that is text: requirements/scope questions, conceptual A/B/C
  choices, tradeoff lists, technical/API/data-model decisions, clarifying questions.

A question *about* a UI topic is not automatically a visual question. "What kind of wizard
do you want?" is conceptual → terminal. "Which of these wizard layouts feels right?" is
visual → browser.

**Two axes, not one — "browser" does not mean "render-screen.cjs".** Choosing the browser
is only the first decision (*where* to show). The second decision is *what to render*, and
it has two mutually exclusive answers:

- **Textual screen** (`render-screen.cjs` with `kind: options`/`cards`/`pros-cons`) — emits
  cards of *title + paragraph*. It is **incapable of drawing layout**: no positioning, no
  wireframe, no UI representation. Use it only for conceptual A/B/C choices that happen to
  read better as clean cards than as terminal text.
- **Visual mockup** (bespoke HTML with real design tokens — see § Project-aware mockups) —
  the **only** path that actually draws the UI: where a button sits, how a layout flows,
  how two designs compare side by side.

> **Layout gate (mandatory).** If the question is about *positioning, layout, spacing,
> visual hierarchy, component appearance, or "where does X go on the screen"*, you **must**
> write a bespoke visual mockup. `render-screen.cjs` is **forbidden** for these — a list of
> text cards cannot answer a visual question, and defaulting to it because it is cheaper in
> tokens is the single most common failure of this skill. When in doubt about whether a
> question is visual, render the mockup.

## Launch

Always launch via the **absolute path** built from your skill context header
(`Base directory for this skill: …`) — never a bare relative path, which depends on the
current working directory and will fail unpredictably:

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --reuse --project-dir "$(git rev-parse --show-toplevel)"
```

Pass `--reuse` on every launch: if a server is already running for this project it prints
that server's connection info and exits, so repeated turns don't spawn redundant servers
or session directories. This returns JSON with the connection info:

```json
{"type":"server-started","port":52341,"url":"http://localhost:52341",
 "screen_dir":".../.superpowers/brainstorm/<session>/content",
 "state_dir":".../.superpowers/brainstorm/<session>/state"}
```

Save `screen_dir` and `state_dir`. Tell the user to open the `url`. Passing
`--project-dir` keeps mockups under `.superpowers/brainstorm/` (persist across restarts);
remind the user to add `.superpowers/` to `.gitignore` if it isn't already.

If you backgrounded the launch and didn't capture stdout, read `<state_dir>/server-info`
to recover the URL and port. The server auto-exits after 30 minutes idle, or when the
owner process dies. **Platform differences** (Windows/Codex/Gemini foreground behavior,
remote `--host 0.0.0.0` binding) live in `visual-companion-reference.md § Launching by
platform`.

## The loop

1. **Check the server is alive, then write a fragment.** Before each write, confirm
   `<state_dir>/server-info` exists and `<state_dir>/server-stopped` does not. If the
   server is gone, relaunch it. Write a **new** file to `screen_dir` with the Write tool
   (never `cat`/heredoc — that dumps noise into the terminal). Use semantic, never-reused
   filenames: `layout.html`, `visual-style.html`; for iterations `layout-v2.html`. The
   server serves the newest file by mtime.

2. **Hand back to the user and end your turn.** Remind them of the URL (every step), give
   a one-line summary of what's on screen, and ask them to respond in the terminal:
   "Take a look and let me know what you think — click to select an option if you'd like."

3. **On your next turn**, read `<state_dir>/events` if it exists (one JSON object per
   line: clicks/selections) and merge it with the user's terminal reply. The terminal
   message is the primary signal; events add structured detail. If the file is absent, the
   user didn't interact in the browser — use their text only.

4. **Iterate or advance.** If feedback changes the current screen, write a new version.
   Move on only when the current step is validated.

5. **Unload when returning to the terminal.** When the next question doesn't need the
   browser, push a waiting screen so the user isn't staring at a resolved choice:

   ```html
   <!-- filename: waiting.html -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal…</p>
   </div>
   ```

## Writing content

**First, apply the layout gate (above).** If the question is visual (positioning, layout,
spacing, hierarchy, component appearance), write a bespoke mockup (*§ Project-aware
mockups*) — not `render-screen.cjs`. The spec generator below is only for
conceptual/textual choices.

**For textual screens — generate from a compact spec, don't write HTML inline.** For the
conceptual screen kinds (`options`, `cards`, `pros-cons`), pass a small JSON spec to
`render-screen.cjs` and it writes the fragment file for you. This keeps verbose,
repetitive markup out of your context and guarantees correct, escaped HTML — you never
have to memorize the CSS classes. These kinds render **text cards**, never a layout.

```bash
node <super.brainstorming-base-dir>/scripts/render-screen.cjs \
  --screen-dir "<screen_dir>" --name layout.html --spec '{
    "title": "Which layout works better?",
    "subtitle": "Consider readability and visual hierarchy",
    "kind": "options",
    "items": [
      {"choice": "a", "heading": "Single Column", "body": "Clean, focused reading"},
      {"choice": "b", "heading": "Two Column", "body": "Sidebar plus main content"}
    ]
  }'
```

It prints `{"written":true,"path":...}` and the server serves it on the next reload.
`kind` is `options` or `cards` (clickable, emit selection events) or `pros-cons`
(presentational). Add `"multiselect": true` to let the user pick several. `choice` and
`letter` are optional — they default to `a`, `b`, `c`… by position. Pass `--input-file
<spec.json>` or pipe the spec on stdin instead of `--spec` if you prefer.

**Write HTML directly** for anything visual the generator can't draw — every layout,
positioning, wireframe, mockup, or side-by-side comparison. Write **fragments**, not full
documents: if your HTML does not start with `<!DOCTYPE`/`<html>`, the server wraps it in
the frame template automatically (header, theme CSS, selection indicator, and the client
helper are all injected). The full building-block catalog — `.cards`, `.mockup`, `.split`,
`.pros-cons`, mock wireframe elements, typography — is in `visual-companion-reference.md §
CSS classes`. Keep 2–4 options per screen and state the question on every page.

**Never write your own selection JavaScript.** The injected helper handles the whole
selection lifecycle for any element carrying a `data-choice` attribute: click to select,
click again to deselect, single/multi-select, and recording every click to the events
file. A hand-written `<script>` that adds a CSS class on click misses deselection and
conflicts with the helper. To make something selectable — including in bespoke layouts and
full documents — just add `data-choice="a"` to the element and style its selected state via
the `.selected` class:

```css
.my-panel.selected { border-color: #34c759; }
```

## Project-aware mockups

**Every bespoke mockup must look like the real app — not a generic wireframe.** It needs the
project's design tokens (colors, radii, fonts, button/card shapes) and the target screen's
current structure. **Discover them with one dedicated read-only exploration subagent — do
not read theme configs, global CSS, or component sources yourself on the main thread.** Those
files (`tailwind.config.*`, `globals.css`, full page/component sources) flood the orchestrator
context with raw bytes you only need long enough to derive a handful of tokens; the subagent
reads them in its own context and hands back just the distilled report.

**Dispatch (read-only subagent — tools: `Read`, `Grep`, `Glob`, `Bash` read-only):**
> Discover this project's design system and the target screen so a faithful HTML mockup can be
> built. Follow `super.brainstorming/visual-companion-reference.md § Project-aware design
> tokens` (discovery playbook). Return **only** the distilled report shape defined there —
> tokens, button/card shape, spacing, font, and a short summary of the target screen's current
> layout and any reusable component names. Do **not** paste raw file contents, full configs, or
> whole component sources; return the derived values only.

Embed the report's tokens as CSS custom properties in the HTML fragment and match its layout /
component conventions. This step is **mandatory for any UI feature mockup** — a generic
wireframe leaves the user unable to judge layout against their real app. After the report
returns, **build the mockup from it — do not re-read those files inline** (that would refill
the orchestrator with the bytes the subagent was dispatched to keep out).

See `visual-companion-reference.md § Project-aware design tokens` for the discovery playbook,
the exact return shape, and a worked example.

## Distilling the approved mockup (curated visual artifact)

The session dir (`screen_dir`) stays exactly as it is — **do not change it, do not
copy it wholesale.** It holds throwaway material: iteration screens, A/B options,
and `waiting.html`-style "continue in the terminal" placeholders. None of that
belongs downstream.

What *does* belong downstream is a **curated artifact** distilling only the
mockup content that drove an approved decision, so `super.writing-plans` and the
implementer reuse decided layout/spacing/tokens instead of re-deriving them (wasted
tokens, dropped decisions). For a single-screen feature this is **one** file; for a
flow with several approved screens, write **one file per screen** (e.g.
`<feature>-visual.md`, `<feature>-confirmation-visual.md`) so each artifact maps to a
distinct screen that a UI task can reference by name — `super.writing-plans` discovers
and links them per file. If the user approved or selected a layout shown in a
mockup, that **is** a decision — distill it; do not dismiss it as "just exploration."
Skip distillation only when no mockup was ever shown, or every mockup was rejected
with nothing carried into the spec. When at least one mockup informed a decision that
made it into the spec, write that artifact to the feature's versioned directory:

```
docs/superpowers/<feature-name>/specs/mockups/<feature-name>-visual.md
```

It is **authored, not copied** — curate, don't dump. Include:

- **Prose instructions / design intent** — the core decisions: layout, hierarchy,
  spacing scale, component appearance, interaction notes.
- **The core HTML/JSX** — only the representative, meaningful markup (the actual
  layout), never the waiting/placeholder/option screens.
- **Design tokens applied** — colors, typography, radius, spacing taken from the
  project's theme (see § Project-aware mockups).
- **Original design source (if any)** — a design-tool URL, an export, or a
  screenshot. Tool-agnostic: record whatever this project used, or state "none".
- **Fidelity note** — the artifact is a *norte* (direction), not the pixel-final
  screen. Final fidelity is built at implementation time.

This step is driven by `super.brainstorming` at spec-write time (its "After the
Design" section) and committed alongside the spec. The ephemeral session is left
untouched and still cleaned up normally by Stop below.

## Stop

```bash
bash <super.brainstorming-base-dir>/scripts/stop-server.sh <session_dir>
```

`/tmp` sessions are deleted on stop; `--project-dir` sessions persist under
`.superpowers/brainstorm/` for later reference.
