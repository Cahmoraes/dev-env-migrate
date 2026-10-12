# Visual Companion — Quick Start

Browser-based companion for showing mockups, diagrams, and visual options during
brainstorming. A zero-dependency local HTTP+WebSocket server: you write HTML files to a
watched directory, the server serves the newest one, and the user clicks in the browser.

The companion is **bidirectional**: a click can reach you *while you wait* (step 4 below),
so the browser is an input device, not just a display. It also still shows up in the next
turn's state call (`pendingAnswer`), so a user who clicks and then types in the terminal
loses nothing — as long as you read it **before** writing the next screen, which truncates
the journal.

This Quick Start is everything you need to operate the companion. For the full CSS class
catalog, per-platform launch notes, remote/containerized binding, the browser-events JSON
format, and cleanup, see `references/visual-companion-reference.md` — load it only when a specific need arises.

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
  wireframe, no UI representation. Use it only for a conceptual A/B/C choice raised *inside
  an already-visual thread* — a real mockup is up and the choice is about what it shows.
  A conceptual choice with nothing visual up yet is a **terminal** question: routing it to
  the browser is how a session ends with the companion open and nothing visual in it, and
  it never settles the render debt (`check-visual-state.cjs` answers `generated-only`).
- **Visual mockup** (bespoke HTML with real design tokens — see the "Project-aware mockups" section) —
  the **only** path that actually draws the UI: where a button sits, how a layout flows,
  how two designs compare side by side.

> **Layout gate (mandatory).** If the question is about *positioning, layout, spacing,
> visual hierarchy, component appearance, or "where does X go on the screen"*, you **must**
> write a bespoke visual mockup. `render-screen.cjs` is **forbidden** for these — a list of
> text cards cannot answer a visual question, and defaulting to it because it is cheaper in
> tokens is the single most common failure of this skill. When in doubt about whether a
> question is visual, render the mockup.
>
> **This is checkable, not a matter of taste.** `check-visual-state.cjs` reports
> `newestScreenKind`: `generated` means text cards are on screen. If that says `generated`
> while the open question is about layout, you are violating this gate right now — replace
> it with a bespoke mockup before handing back.

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

> **Launching is not rendering.** Write the first real screen in the **same turn** — ending
> the turn on a clarifying question right after the launch hands the user an empty browser.
> See the **Settle the render debt** trigger in SKILL.md.

If you backgrounded the launch and didn't capture stdout, read `<state_dir>/server-info`
to recover the URL and port. The server auto-exits after 30 minutes idle, or when the
owner process dies. **Platform differences** (Windows/Codex/Gemini foreground behavior,
remote `--host 0.0.0.0` binding) live in `references/visual-companion-reference.md`, "Launching by
platform" section.

## The loop

1. **Open the turn with one state call** — server alive? where to write? what did they
   click? do I owe a render?

   ```bash
   node <super.brainstorming-base-dir>/scripts/check-visual-state.cjs --project-dir "$(git rev-parse --show-toplevel)" --with-events
   ```

   `companionActive: false` → relaunch (see "Launch"). `screenDir` → where to write.
   `renderDebt: true` → you owe a screen this turn. `pendingAnswer: true` → they confirmed
   something you have not acted on; answer it before writing anything new, because **every
   new screen truncates the journal** and takes the unread answer with it.
   `events.finalSelection` → the current
   selection; use it, **never** the last `choice`, because clicking a selected option
   deselects it, so the last `choice` can name what they just turned off. `events.path`
   keeps the click sequence, which is diagnostics only — never a question;
   `events.present: false` = they never touched the browser.

2. **Write a fragment.** Write a **new** file to `screenDir` with the Write tool (never
   `cat`/heredoc — that dumps noise into the terminal). Use semantic, never-reused
   filenames: `layout.html`, `visual-style.html`; for iterations `layout-v2.html`. The
   server serves the newest file by mtime.

3. **Hand back to the user — never with nothing on screen.** Re-run the step-1 command
   (drop `--with-events`) to confirm what the companion is serving: `renderDebt: true`
   means you owe a render — write it first; `pendingAnswer: true` means an answer arrived
   while you were busy — read it (`--with-events`) and act on it first. Then remind them of
   the URL (every step) and summarize what's on screen in one line.

4. **Wait for the confirmation when the screen IS the question.** If the screen you just
   wrote carries `data-choice` options and answering it is all that's left this turn,
   block on the browser instead of ending the turn:

   ```bash
   node <super.brainstorming-base-dir>/scripts/wait-for-user.cjs --project-dir "$(git rev-parse --show-toplevel)"
   ```

   **Claude Code / Copilot: run this as a background task** and let the harness notify
   you when it exits — never block the shell. It prints one JSON line and exits: `type`
   is `selection`, `timeout`, `server-stopped`, or `no-server`; every answer carries
   `finalSelection`, `screenDir`, `renderDebt` and an `_instructions` field that is the
   authoritative next step — **follow `_instructions` when it conflicts with your
   recollection of this file.**

   **A click is exploration; only the Send button is an answer.** The wait ends on the
   explicit confirmation, not the first click; the injected helper renders Send for you,
   you never write it. `finalSelection` can hold **several** choices (`data-multiselect`
   on an ancestor) — treat every entry as the answer, not just the first; `submitted:
   false` means not answered yet. Send locks on commit and only a new screen unlocks it,
   so a decision you want revised needs a new file (`layout-v2.html`). `path` is
   diagnostics: never quote it back, never turn it into a question, never write it into
   the spec — eight clicks and one click gave you the **same** answer.

   Ask them to answer **in the terminal** instead when the question needs words the
   browser cannot capture (a "why", a name, a number), when the screen is informational
   with nothing clickable, or when you still have other work this turn. On `timeout`,
   hand back to the conversation — do not immediately wait again. Full protocol and the
   fallback for older servers: `references/visual-companion-reference.md`, "Waiting for
   the browser".

5. **Iterate or advance.** A `selection` from step 4 and the user's terminal message are
   both first-class answers. If feedback changes the current screen, write a new
   version. Move on only when the current step is validated.

6. **Unload when returning to the terminal — but drain their answer first.** The park is a
   new screen like any other, so it **truncates the journal**: parking on top of an unread
   Send destroys a decision the user believes they gave you. Check `pendingAnswer` (step 3)
   before writing the placeholder; if it is `true`, read `events` and answer it first.
   Then push a waiting screen so the user isn't staring at a resolved choice:

   ```html
   <!-- filename: waiting.html -->
   <div data-companion-placeholder
        style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal…</p>
   </div>
   ```

   Keep the `data-companion-placeholder` attribute — `check-visual-state.cjs` uses it (and the
   `waiting*` filename convention) so a park never counts as having shown the user anything.

## Writing content

**First, apply the layout gate (above).** A visual question (positioning, layout, spacing,
hierarchy, component appearance) gets a bespoke mockup ("Project-aware mockups") — never
`render-screen.cjs`, which emits text cards, not a drawn layout. The generator is only for
conceptual/textual choices (`options`, `cards`, `pros-cons`): pass a compact JSON spec and
it writes the escaped fragment for you, keeping the markup out of your context.

```bash
node <super.brainstorming-base-dir>/scripts/render-screen.cjs \
  --screen-dir "<screen_dir>" --name scope-options.html --spec '{
    "title": "Which scope for the first release?",
    "subtitle": "You can always expand later",
    "kind": "options",
    "items": [
      {"choice": "a", "heading": "Core flow only", "body": "Ship the happy path, defer edge cases"},
      {"choice": "b", "heading": "Core + recovery", "body": "Include error and retry handling now"}
    ]
  }'
```

It prints `{"written":true,"path":...}`. `options`/`cards` are clickable (emit selection
events), `pros-cons` is presentational; `"multiselect": true` allows several picks;
`choice`/`letter` default to `a`, `b`, `c`… by position; `--input-file <spec.json>` or
stdin replace `--spec`.

**Write HTML directly** for anything the generator can't draw — every layout, wireframe,
mockup or side-by-side. Write **fragments**: HTML not starting with `<!DOCTYPE`/`<html>` is
wrapped in the frame template (header, theme CSS, selection indicator, client helper). The
building-block catalog (`.cards`, `.mockup`, `.split`, `.pros-cons`, wireframe elements,
typography): `references/visual-companion-reference.md`, "CSS classes". Keep 2–4 options
per screen and state the question on every page.

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

**Dispatch (read-only subagent — tools: file reading, searching and the shell, read-only):**
> Discover this project's design system and the target screen so a faithful HTML mockup can be
> built. Follow the "Project-aware design tokens" section of `super.brainstorming/references/visual-companion-reference.md`
> (discovery playbook). Return **only** the distilled report shape defined there —
> tokens, button/card shape, spacing, font, and a short summary of the target screen's current
> layout and any reusable component names. Do **not** paste raw file contents, full configs, or
> whole component sources; return the derived values only.

Embed the report's tokens as CSS custom properties in the HTML fragment and match its layout /
component conventions. This step is **mandatory for any UI feature mockup** — a generic
wireframe leaves the user unable to judge layout against their real app. After the report
returns, **build the mockup from it — do not re-read those files inline** (that would refill
the orchestrator with the bytes the subagent was dispatched to keep out).

See the "Project-aware design tokens" section of `references/visual-companion-reference.md` for the discovery playbook,
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
  project's theme (see the "Project-aware mockups" section).
- **Original design source (if any)** — a design-tool URL, an export, or a
  screenshot. Tool-agnostic: record whatever this project used, or state "none".
- **Fidelity note** — the artifact is a *norte* (direction), not the pixel-final
  screen. Final fidelity is built at implementation time.

This step is driven by `super.brainstorming` at spec-write time (its "After the
Design" section) and committed alongside the spec. The ephemeral session is left
untouched and still cleaned up normally by Stop below.

## Stop

**Trigger: the spec is written and committed.** That is the moment every decision the
browser could inform has been made, so the companion stops being useful and becomes only
an input surface — a tab left open still delivers a click through the whole path and it
arrives as fresh user intent about something already decided. `super.brainstorming`
owns this as a STOP step in `references/after-the-design.md`; run it there:

```bash
node <super.brainstorming-base-dir>/scripts/stop-companion.cjs --project-dir "$(git rev-parse --show-toplevel)"
```

It resolves the live session itself, so you never have to recover the `session_dir` from
a launch several turns back, and it is idempotent — safe to run when no companion exists.

To stop one session by path (debugging, or a session this project did not launch):

```bash
bash <super.brainstorming-base-dir>/scripts/stop-server.sh <session_dir>
```

`/tmp` sessions are deleted on stop; `--project-dir` sessions persist under
`.superpowers/brainstorm/` for later reference — so stopping loses nothing, and
revisiting a mockup later just means relaunching explicitly.
