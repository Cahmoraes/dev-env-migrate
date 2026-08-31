# Why This Gate Exists, and Where It Sits in the Pipeline

Entry material: read once, when deciding whether to run the QA gate. Nothing here is needed mid-run, which is why it lives in this reference instead of in the skill body.

## Why This Gate Exists

Unit tests and code reviews verify *how* the code works; this gate verifies *what* the feature does for the user. Before merge there must be evidence each PRD user story was delivered — behaviors exist, flows work end-to-end, screenshots capture the real UI. Without it, branches that pass linting and unit tests still ship missing user-facing requirements.

**This gate is opt-in at every tier.** It boots a server and drives a browser (screenshots via `playwright-cli`), so it is never automatic — the controller offers it and runs it only on user consent, at any tier. It is **not** part of the mandatory verification gate (which is spec coverage + mutation + code-quality, always-on and blind). What varies by tier is only the mechanism when the user *does* opt in: in **Small/Medium** (`super.using-superpowers/references/medium-inline-path.md`) the boot-app / run-primary-flow / screenshot mechanism runs **once, inline**, not fanned out per story; in **Large/Complex** this skill's full mechanism applies unchanged — one QA subagent per story, dispatched in parallel waves. Declining QA (any tier) skips only this user-observable lens; the mandatory verification gate still runs.

## Why the stack boot is decided once, upstream

Step 3 makes the orchestrator — never an individual subagent — boot or confirm the app stack and hand every subagent the resulting base URL. That is deliberately a one-time decision for the whole wave, not a per-subagent judgment call repeated 3-8 times in parallel: the duplicated judgment is what previously produced inconsistent screenshot coverage across otherwise-equivalent UI stories.

Boot the stack with the working tree's own ports. QA runs after integration, so it is normally the main working tree and the canonical ports apply. When it runs inside a worktree instead, that worktree has an allocated block — load `<worktree>/.superpowers/ports.env` before booting and derive the base URL from it (`http://localhost:$<SERVICE>_PORT`), rather than assuming the canonical number. See `super.using-git-worktrees/references/port-isolation.md`.

A boot that is attempted and fails, or a stack that stays unreachable (port in use, no Docker, broken build, missing env), is not a gate failure. Set the dispatch field to "not applicable," note the boot failure in the report, and continue — a story that needed a screenshot degrades to `PARTIAL`, per the "never block on screenshots" rule.

## PRD discovery, priority 4 (embedded PRD)

Folding requirements straight into the spec instead of writing a separate PRD file is the same case `super.writing-plans`' FR-coverage gate already handles via `find-feature-files.cjs` — which is why Step 1 runs that script rather than guessing. A missing `prd.embeddedIn` therefore means there is genuinely nothing to verify, not that discovery was incomplete.

## Integration

**Invoked by:** the orchestrator — after all tasks complete and the final code reviewer approves, when a PRD exists **and the user opts into QA verification**, before `super.finishing-a-development-branch` is called. Tier mechanism (Large/Complex fan-out vs. Small/Medium inline) is covered above under "Why This Gate Exists."
**Artifacts saved to:** `docs/superpowers/<feature-name>/qa/`
**Required context:** PRD path, feature name, test runner command
**Optional context:** playwright-cli, Playwright, or Puppeteer availability
