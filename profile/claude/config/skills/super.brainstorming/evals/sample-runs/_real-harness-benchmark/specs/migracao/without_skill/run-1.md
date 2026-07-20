# Design Spec — Legacy React Migration (hooks + Module Federation)

## Interview transcript (summary)

- **Q (interviewer):** You mentioned migrating a big app "incrementally" and "can't stop shipping" — do you want an incremental/strangler approach where old and new run side by side, or an all-at-once rewrite with a freeze window?
  **A (user):** Incrementally. We can't freeze — it's revenue-critical.
- **Q:** When old and new coexist, where do they meet — do you mix old and new components inside the same page/tree, or keep the boundary at the route level (a whole route is old or new)?
  **A:** Route level. A route is owned by old or new, not mixed halfway down the tree.
- **Q:** How is the split built and deployed — a single bundle during the transition, or Module Federation host/remotes so squads deploy independently?
  **A:** Module Federation from the start — that independent-deploy story is the whole point.
- **Q:** For the new (hooks) side, what state approach do you want?
  **A:** Not sure yet, whatever's cleanest. (left open)

## Overview

Migrate a 5-year-old React 16 app (class components, Redux, single Webpack bundle, homegrown router) toward function components + hooks, and split it into independently deployable pieces via Module Federation. The migration must be incremental — the app is revenue-critical and cannot take a big-bang freeze.

## Architecture characteristics (prioritized)

1. **Deployability** — squads must ship independently (drives Module Federation).
2. **Availability / continuity** — no freeze; the app keeps shipping features during the migration.
3. **Maintainability** — hooks + smaller bounded remotes reduce long-term cost.

## Key decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Migration strategy | **Strangler-fig (incremental)** | "Can't stop shipping" eliminates a big-bang freeze. Old and new coexist; new remotes gradually replace old routes. |
| D2 | Compatibility boundary | **Route-level** | A route is owned entirely by old or new — never mixed mid-tree — which keeps the seam clean and testable. |
| D5 | Build integration | **Module Federation from the start** | Shell = host, squads = remotes. This is the independent-deploy requirement itself, not a later step. |

## Components

- **Shell (host)** — Module Federation host application; loads remotes.
- **Legacy app** — the existing React 16 / Redux / class-component code, wrapped as one unit behind route-level boundaries.
- **New remotes** — function-component + hooks micro-frontends, one per squad, deployed independently.

## Data flow

The shell routes a request to either the legacy app or a new remote based on the route. Each side renders its own subtree. Migration proceeds route by route: a route flips from legacy to a new remote when the squad is ready.

## Risks

- 🟡 **Bundle duplication** — React and shared libs may be bundled by multiple remotes; configure MF shared singletons.
- 🟡 **Migration drift** — routes may sit half-migrated for a long time; track progress per route.

## Testing

- Route-level smoke tests confirming both legacy and new remotes render under the shell.
- Per-remote unit tests for migrated hooks components.

## Open Items

- **State management on the new side** — Zustand vs Context vs keep Redux: not decided in this session; to be chosen during implementation.
- **How shared state is handled across the old/new boundary** — not explored in detail.
- **Routing ownership while both stacks coexist** — assumed the shell routes by path; details deferred.
