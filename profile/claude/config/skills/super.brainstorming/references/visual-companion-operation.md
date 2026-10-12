# Visual Companion — Operation

Read this once the user has accepted the companion (see SKILL.md, "Visual Companion" section, for the signals checklist and the offer).

## Per-question decision: browser vs terminal

Decide per question, not per session. The test, the browser/terminal split and the mandatory **layout gate** (a positioning/layout/spacing question must get a bespoke mockup — `render-screen.cjs` is forbidden for those) live in `references/visual-companion.md`, "When browser, when terminal". They are stated there once: both files are read at the same moment, so a second copy here would only drift.

**Per-question routing is not a licence to render nothing.** The user accepted the companion because you named a concrete artifact worth showing (a mockup, or a current-vs-proposed flow diagram). You owe them that artifact. Routing a *particular* question to the terminal is fine; routing *every* question to the terminal means the acceptance was a misfire, and letting it lapse in silence is the one outcome to avoid.

**The opposite misfire costs the user more: moving a terminal question into the browser.** A conceptual scope question ("which kind of new data do you want?") rendered as `render-screen.cjs` cards is a terminal message wearing a URL — the user leaves the chat, waits for a page to load, and reads text that a numbered list in the terminal would have carried, with the click round-trip on top. That is the shape a session takes when the debt is open and the only thing owed to the user is a question: the cheapest way to put *something* on screen is to migrate the question. It settles nothing. Ask it in the terminal and render the artifact you named.

## The render debt

Acceptance opens a **render debt**. The three rules are numbered below (`SKILL.md` carries only the trigger); this file carries the evidence behind them and the reason codes.

**The debt is settled only by a real screen being served.** None of these settle it:

| Not a settlement | Why |
|---|---|
| Launching the server | The user has a URL and nothing behind it |
| Announcing the URL | Announcing *creates* the expectation; it does not meet it |
| Dispatching the design-token subagent | Preparation, not delivery |
| Writing a waiting/placeholder screen | Explicitly says "nothing to see here" |
| A `render-screen.cjs` text-card screen | A terminal message behind a URL — it shows nothing the chat could not have said |

**What settles it is the artifact you named in the offer** — the mockup, the side-by-side, the current-vs-proposed diagram. Bespoke HTML, in other words; the generator cannot draw any of them.

### Why the debt needs a turn-level trigger

The browser stays empty whenever a turn ends with the render debt open — after a clarifying question, a consent gate, a long exploration. The failure is not discovery (every reference file is already in context); a session-scoped obligation has no turn-level trigger, so deferring it never violates anything until the session is over. The rules below give it one.

### The three rules while the debt is open

1. **Launch and first render belong to the same turn.** If design-token discovery must run first, dispatch it and render the moment it returns — no other checklist step in between.
2. **An open debt pre-empts every turn-ending step** — clarifying questions, the `super.deep-research` offer, approach proposals. They wait; the render does not.
3. **An explicit render request is blocking** — "me mostre", "me apresente uma versão", "atualize o mockup", "quero ver": render in that same turn, ahead of research and checkpoints.

**Keep the screen current — the debt reopens.** A turn ending on a **visual** decision leaves that decision's screen up; a turn moving to a **textual** question parks the browser on a placeholder (`references/visual-companion.md`, "The loop" step 6). Having the user ask you to update the mockup is the same bug as never rendering it, one iteration later.

**Before ending any turn while the companion is live:**

```bash
node <super.brainstorming-base-dir>/scripts/check-visual-state.cjs --project-dir "$(git rev-parse --show-toplevel)"
```

### Reason codes from `check-visual-state.cjs`

| `reason` | `renderDebt` | What to do |
|---|---|---|
| `no-server` | `false` | No live companion — nothing owed |
| `no-screen-rendered` | **`true`** | The user is staring at an empty browser. Render before ending the turn |
| `generated-only` | **`true`** | Every screen ever served is generator text cards. The offer promised an artifact and the browser never showed one — render it, or say the debt cannot be settled and stop the server |
| `terminal-parked` | `false` | You parked it deliberately for a textual question — fine |
| `stale-screen` | **`true`** | Only with `--max-age-seconds`; re-render against the current question |
| `current` | `false` | A real screen is up; check `ageSeconds` against how far the conversation has moved |

The script decides **presence** ("is a real screen up?"), not **correspondence** ("does that screen answer the question I am about to ask?") — same syntactic/semantic boundary as the `--mockups` linkage gate in `super.writing-plans`.

### When the debt truly cannot be settled

Say so in-thread and stop the server: "the flow ended up clearer in prose than a diagram would have been, so I'm leaving the companion unused." A non-UI feature whose only signal is "a diagram would help" gets no offer it cannot keep — offer only when you are ready to deliver.

## Operating the companion

Read `references/visual-companion.md` in this skill's base directory before proceeding — its **Quick Start** is enough to operate the companion end to end. Consult `references/visual-companion-reference.md` only when you need the full CSS class catalog or per-platform launch notes (don't load it up front).

Launch the server with the cwd-independent path from your context header (`Base directory for this skill: …`), never a bare relative path:

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --reuse --project-dir "$(git rev-parse --show-toplevel)"
```

`--reuse` returns an already-running server for this project instead of launching a new one — pass it on every launch so repeated turns don't spawn redundant servers. **Conceptual** screens are rendered from a compact JSON spec with `scripts/render-screen.cjs`, which keeps their markup out of your context; **layout** questions are written as bespoke HTML, because the generator draws text cards and not a layout. The Quick Start covers both, and the choice between them is the Layout gate, not a token-cost preference.
