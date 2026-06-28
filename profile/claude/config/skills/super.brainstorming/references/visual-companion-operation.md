# Visual Companion — Operation

Read this once the user has accepted the companion (see SKILL.md § Visual Companion for the signals checklist and the offer).

## Per-question decision: browser vs terminal

Even after the user accepts, decide FOR EACH QUESTION whether to use the browser or the terminal. The test: **would the user understand this better by seeing it than reading it?**

- **Use the browser** for content that IS visual — mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs.
- **Use the terminal** for content that is text — requirements questions, conceptual choices, tradeoff lists, A/B/C/D text options, scope decisions.

A question about a UI topic is not automatically a visual question. "What does personality mean in this context?" is conceptual — use the terminal. "Which wizard layout works better?" is visual — use the browser.

## Operating the companion

Read `visual-companion.md` in this skill's base directory before proceeding — its **Quick Start** is enough to operate the companion end to end. Consult `visual-companion-reference.md` only when you need the full CSS class catalog or per-platform launch notes (don't load it up front).

Launch the server with the cwd-independent path from your context header (`Base directory for this skill: …`), never a bare relative path:

```bash
bash <super.brainstorming-base-dir>/scripts/start-server.sh --reuse --project-dir "$(git rev-parse --show-toplevel)"
```

`--reuse` returns an already-running server for this project instead of launching a new one — pass it on every launch so repeated turns don't spawn redundant servers. To keep screen markup out of your context, render screens from a compact JSON spec with `scripts/render-screen.cjs` instead of writing HTML inline; the Quick Start covers it.
