# Project capabilities — the four dispatch inputs

Settle these once, before any QA subagent is dispatched. `projectProfile` (`stack`, `manifest`) from the session state answers the first two on most repos; the rest is a probe.

## Test runner (`--test-runner`)

The repo's instructions file (`AGENTS.md`/`CLAUDE.md`) names it; else derive it from the manifest at `projectProfile.manifest` (`package.json` scripts, `pubspec.yaml`, `pyproject.toml`, `Cargo.toml`, `go.mod`). Neither → ask; never guess. Pass the **single-file** form (`npx vitest run <file>`, `flutter test <file>`): every story's run is scoped to its own files, because concurrent subagents in the same wave share resources.

## Browser automation (`--browser`)

Check in order; the first hit wins:
- `playwright-cli --version` succeeds → `playwright-cli` *(preferred — no new dependency)*
- `@playwright/test` in `devDependencies` → `Playwright`
- `puppeteer` in deps/devDeps → `Puppeteer`
- none → `not available` (screenshots unavailable: noted in the report, never a failure; never install a library to get them)

## Is the story UI-facing?

Not a judgment call. `generate-slugs.cjs` returns `uiFacing` per story — `true`/`false` when the PRD carried a `**UI:**` marker (`sim|não`, `yes|no`). `null` → decide **once for the whole feature**: UI-facing only if this feature's tasks wrote frontend files for this stack (`projectProfile.stack`: `.tsx`/`.vue`/`.svelte`, `src/components` on web; widgets under `lib/` on Flutter). PRD prose naming screens a *consumer* would build does not make a backend feature UI-facing. Say which input decided it.

## App base URL (`--app-base-url`)

Browser automation available **and** at least one UI-facing story → the orchestrator, never a subagent, boots or confirms the stack (`docker compose up`, `pnpm dev`) and passes the resulting base URL. Otherwise, or when the boot fails or the stack stays unreachable → `not applicable`, noted in the report; the gate never blocks on it (the story degrades to `PARTIAL`). Why the boot is decided once, upstream: `./gate-context.md`.

## Where acceptance tests live

Only `docs/superpowers/<feature-name>/qa/evidence/<us-slug>/`, never the project source tree (`apps/`, `src/`, `lib/`, any project test directory); filename, run command and the non-JS/TS case are Task 2 of `../agents/qa-story-verifier.md`. A test copied into the source tree to silence an editor warning is the wrong fix — the scaffold below is the right one.

**TypeScript path aliases (JS/TS only)** — once per repo, before dispatching, so tests in the evidence tree resolve `@/...` (`./qa-typescript-resolution.md`):

```bash
node <super.user-story-verification-base-dir>/scripts/setup-qa-tsconfig.cjs --ensure-templates --repo-root "$(git rev-parse --show-toplevel)"
```
