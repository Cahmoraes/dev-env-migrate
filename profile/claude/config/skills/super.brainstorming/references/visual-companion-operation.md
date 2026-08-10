# Visual Companion — Operation

Read this once the user has accepted the companion (see SKILL.md, "Visual Companion" section, for the signals checklist and the offer).

## Per-question decision: browser vs terminal

Decide per question, not per session. The test, the browser/terminal split and the mandatory **layout gate** (a positioning/layout/spacing question must get a bespoke mockup — `render-screen.cjs` is forbidden for those) live in `visual-companion.md`, "When browser, when terminal". They are stated there once, on purpose: both files are read at the same moment, and the two copies this replaced had already drifted apart.

**Per-question routing is not a licence to render nothing.** The user accepted the companion because you named a concrete artifact worth showing (a mockup, or a current-vs-proposed flow diagram). You owe them that artifact. Routing a *particular* question to the terminal is fine; routing *every* question to the terminal means the acceptance was a misfire, and letting it lapse in silence is the one outcome to avoid.

## The render debt

Acceptance opens a **render debt**. The three rules are numbered below (`SKILL.md` carries only the trigger); this file carries the evidence behind them and the reason codes.

**The debt is settled only by a real screen being served.** None of these settle it:

| Not a settlement | Why |
|---|---|
| Launching the server | The user has a URL and nothing behind it |
| Announcing the URL | Announcing *creates* the expectation; it does not meet it |
| Dispatching the design-token subagent | Preparation, not delivery |
| Writing a waiting/placeholder screen | Explicitly says "nothing to see here" |

### The run these rules come from

Real session, 2026-07-27 — companion accepted 15:25:39 → server launched 15:26:04 → **URL announced alongside a clarifying question 15:26:22: turn ends, empty browser** → user asks outright *"apenas me apresente uma versão do sheet em modal"* 15:26:59 → **~45 exploration tool calls, zero writes to `content/`** → Checkpoint 1 dispatch 15:30:23 → **`deep-research` consent gate 15:31:19: turn ends, empty browser** → user: *"atualize o mockup visual"* 15:32:21 → first render 15:32:59.

Six and a half minutes and two turn boundaries. Every reference file — this one included — was already in context. The failure was not discovery; it was that a session-scoped obligation has no turn-level trigger, so deferring it never violates anything until the session is over.

### The three rules while the debt is open

1. **Launch and first render belong to the same turn.** If design-token discovery must run first, dispatch it and render the moment it returns — no other checklist step in between.
2. **An open debt pre-empts every turn-ending step** — clarifying questions, the Checkpoint 1 complexity dispatch, the `super.deep-research` consent gate, approach proposals. They wait; the render does not.
3. **An explicit render request is blocking** — "me mostre", "me apresente uma versão", "atualize o mockup", "quero ver": render in that same turn, ahead of research and checkpoints.

**Keep the screen current — the debt reopens.** A turn ending on a **visual** decision leaves that decision's screen up; a turn moving to a **textual** question parks the browser on a placeholder (`visual-companion.md`, "The loop" step 6). Having the user ask you to update the mockup is the same bug as never rendering it, one iteration later.

**Before ending any turn while the companion is live:**

```bash
node <super.brainstorming-base-dir>/scripts/check-visual-state.cjs --project-dir "$(git rev-parse --show-toplevel)"
```

### Reason codes from `check-visual-state.cjs`

| `reason` | `renderDebt` | What to do |
|---|---|---|
| `no-server` | `false` | No live companion — nothing owed |
| `no-screen-rendered` | **`true`** | The user is staring at an empty browser. Render before ending the turn |
| `terminal-parked` | `false` | You parked it deliberately for a textual question — fine |
| `stale-screen` | **`true`** | Only with `--max-age-seconds`; re-render against the current question |
| `current` | `false` | A real screen is up; check `ageSeconds` against how far the conversation has moved |

The script decides **presence** ("is a real screen up?"), not **correspondence** ("does that screen answer the question I am about to ask?") — same syntactic/semantic boundary as the `--mockups` linkage gate in `super.writing-plans`.

### When the debt truly cannot be settled

Say so in-thread and stop the server: "the flow ended up clearer in prose than a diagram would have been, so I'm leaving the companion unused." The upstream lesson for next time: a non-UI feature whose only signal was "a diagram would help", accepted but never rendered, should not have been offered — offer only when you are ready to deliver.

## Operating the companion

Read `visual-companion.md` in this skill's base directory before proceeding — its **Quick Start** is enough to operate the companion end to end. Consult `visual-companion-reference.md` only when you need the full CSS class catalog or per-platform launch notes (don't load it up front).

Launch the server with the cwd-independent path from your context header (`Base directory for this skill: …`), never a bare relative path:

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --reuse --project-dir "$(git rev-parse --show-toplevel)"
```

`--reuse` returns an already-running server for this project instead of launching a new one — pass it on every launch so repeated turns don't spawn redundant servers. **Conceptual** screens are rendered from a compact JSON spec with `scripts/render-screen.cjs`, which keeps their markup out of your context; **layout** questions are written as bespoke HTML, because the generator draws text cards and not a layout. The Quick Start covers both, and the choice between them is the Layout gate, not a token-cost preference.
