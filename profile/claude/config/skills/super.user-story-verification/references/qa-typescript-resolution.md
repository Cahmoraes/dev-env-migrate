# QA Evidence TypeScript Path-Alias Resolution

Acceptance tests saved under `qa/evidence/<us-slug>/` live outside every app's own directory tree, so the editor's TypeScript server treats each one as an orphan project: no `paths` aliases (`@/*` etc.), no `jsx`, no `types`. Imports like `@/lib/auth/auth-store` show a false "Cannot find module" error even though the test compiles and runs fine via its full path. Use `scripts/setup-qa-tsconfig.cjs` instead of hand-writing a `tsconfig.json` per story or copying test files into the project source tree to dodge the warning.

## Two-layer design

1. **Templates** (once per repo, or whenever an app's tsconfig changes) — `docs/superpowers/tsconfig.frontend-qa.json` / `tsconfig.backend-qa.json`. Each `extends` the real app's tsconfig and rewrites `compilerOptions.paths` to point at the QA root instead of the app root.
2. **Per-story config** (once per evidence directory) — a 1-line `tsconfig.json` that `extends` the matching template, plus a `node_modules` symlink to the app's real `node_modules`. Path-alias resolution and plain-package resolution (`vitest`, `react`) are separate mechanisms — the symlink covers the latter, which `paths` cannot.

## Commands

```bash
# Once per repo, before dispatching QA subagents (Step 3). Auto-detects each
# app's root from its package.json dependencies (react/next/vue/svelte →
# frontend; @nestjs/core/express/fastify/koa → backend) and writes/reuses
# the templates. Idempotent — re-running without --force is a no-op.
node scripts/setup-qa-tsconfig.cjs --ensure-templates --repo-root "$(git rev-parse --show-toplevel)"

# Once per evidence directory, before saving a new .ts/.tsx acceptance test (Task 2).
node scripts/setup-qa-tsconfig.cjs --scaffold-evidence \
  --repo-root "$(git rev-parse --show-toplevel)" \
  --evidence-dir docs/superpowers/<feature-name>/qa/evidence/<us-slug> \
  --kind frontend|backend
```

- If auto-detection reports an `ambiguous` warning (a directory's `package.json` matches both frontend and backend markers — e.g. a backend that also depends on `react` for server-rendered templates), re-run `--ensure-templates` with `--frontend-app-root <path>` / `--backend-app-root <path>` to disambiguate.
- `--kind` for `--scaffold-evidence` is whichever app the story's acceptance test imports from — the subagent already knows this from writing the test.
- Both commands are safe to call from every QA subagent in a parallel wave — `--scaffold-evidence` only touches its own evidence directory, never a shared one.
- Neither command touches the project source tree.

## Known residual limitation

A per-story `tsconfig.json`'s `include` fully replaces (never merges with) the app's own `include`, so ambient `.d.ts` augmentation files the app relies on outside its `paths` aliases (e.g. a Next.js `next-env.d.ts`, or a vitest setup file that augments global matchers like `toBeInTheDocument`) are not picked up. This surfaces as a narrower `TS2339` ("Property does not exist") rather than `TS2307` ("Cannot find module") — out of scope for this script, which targets path-alias resolution specifically. Not a regression: hand-written per-story tsconfigs had the same gap before this script existed.

**Fallback (script unavailable):** hand-write a per-story `tsconfig.json` with `extends` pointing at the real app's tsconfig and `compilerOptions.paths` rewritten with relative paths from the evidence directory to the app's `src/`. Never copy the acceptance test into the app's own source tree to sidestep this — a parallel QA wave mutating a shared source tree can race another subagent's test run.

## Verifying the fix actually resolved (don't trust a silent `tsc`)

Running `npx tsc --noEmit` from inside the evidence directory can print **nothing at all** even when the alias is broken — a `tsconfig.json` with its own `include` is self-excluded from any `include` it would otherwise inherit via `extends`, so `tsc` silently compiles **zero files** instead of erroring. Confirmed real (not story-specific) across two independent smoke tests. Empty output is not proof of success. Verify the acceptance test file was actually part of the compiled program before reading "no errors" as a pass:

```bash
npx tsc --noEmit --listFilesOnly | grep <us-slug>   # must list the test file
# or, to see the effective config tsc resolved:
npx tsc --showConfig
```

A positive/negative control is stronger evidence than either check alone: temporarily break the alias import, confirm `TS2307` appears on the right line, then restore it and confirm the error is gone.

**Running the test itself (vitest) is a separate mechanism from the tsc check above** — `compilerOptions.paths` is a TypeScript-only concept; Vite's own resolver (which vitest uses at runtime) does not read it automatically, so `npx vitest run <path-to-evidence-test>` from the repo root can fail to resolve the same alias that `tsc` accepts. If that happens, add a local `vitest.config.ts` inside the evidence directory setting `root` to the app directory and `include` scoped to just that test file (mirror any existing `qa/evidence/*/vitest.config.ts` already in the target repo, if present), and run it with the app's own local vitest binary (`<app-root>/node_modules/.bin/vitest`).
