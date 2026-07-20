# Design Spec — Incremental Migration to Hooks + Module Federation

## Interview transcript (summary)

- **Q (interviewer):** You want this incremental with old and new working together — so a strangler approach rather than a big-bang rewrite?
  **A (user):** Yes, strangler. We can't freeze; the app is revenue-critical.
- **Q:** Where do old and new coexist — mixed within a page, or a clean route-level split?
  **A:** Route level — a route is old or new, never mixed mid-tree.
- **Q:** While both stacks are live, who owns routing/history — the old router, a new router, or a shell that delegates?
  **A:** A shell owns top-level routing and delegates into old or new, so two routers don't fight over history.
- **Q:** How is the split built and deployed?
  **A:** Module Federation from the start — shell is the host, squads are remotes.

## Overview

Incrementally migrate a legacy React 16 app (class components, Redux, homegrown router, single Webpack bundle) to function components + hooks, splitting it into independently deployable remotes with Module Federation. Old and new coexist during the transition; no freeze.

## Architecture characteristics (prioritized)

1. **Deployability** — squads ship independently.
2. **Availability** — continuous shipping; no big-bang freeze.
3. **Testability** — clean route-level seams make each side verifiable in isolation.

## Key decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Migration strategy | **Strangler-fig** | Revenue-critical app cannot freeze; new remotes strangle old routes incrementally. |
| D2 | Compatibility boundary | **Route-level** | A route is owned entirely by old or new — no mixed subtrees. |
| D4 | Routing ownership | **Shell delegates** | A shell owns top-level routing and hands off to old/new, avoiding two routers fighting over history. |
| D5 | Build integration | **Module Federation from the start** | Shell = host, squads = remotes; this is the independent-deploy requirement. |

## Components

- **Routing shell (host)** — owns the URL/history and delegates each route to the legacy app or a new remote; also the Module Federation host.
- **Legacy app** — existing Redux/class-component code behind route boundaries, replaced route by route.
- **New remotes** — hooks-based micro-frontends, one owner per set of routes, independently deployed.

## Data flow

The shell reads the URL and delegates to legacy or a remote. Each side owns its subtree. Migration flips routes from legacy to new remotes as squads are ready; the shell keeps history coherent throughout.

## Risks

- 🟡 **Shared singletons** — configure MF `shared` for React/router libs to avoid duplicate instances.
- 🟡 **History coordination** — the shell must be the single source of routing truth so back/forward behave across the seam.

## Testing

- Shell routing tests: each path delegates to the correct side; back/forward works across the seam.
- Per-remote unit tests for migrated hooks components.

## Open Items

- **Shared state across the boundary** — how new remotes read existing Redux state (duplicate vs bridge) was not resolved this session; flagged for follow-up.
- **State library on the new side** — Zustand vs Context vs keep Redux: deferred to implementation.
