# Design Spec — React Modernization to Hooks + Module Federation

## Interview transcript (summary)

- **Q (interviewer):** Big app, can't stop shipping — incremental migration or a single cutover?
  **A (user):** Incremental. Old and new parts need to work together for a while.
- **Q:** How do you want the app split for deployment — keep one bundle for now, or Module Federation?
  **A:** Module Federation from the start; that's how squads deploy independently.
- **Q:** On the new hooks side, what state library do you want to standardize on?
  **A:** Whatever's modern and clean.
  **Interviewer note:** Recommending **Zustand** and standardizing new remotes on it.
- **Q:** And roughly where do old and new meet — same page, or per route?
  **A:** Per route. A whole route is old or new, not mixed inside the tree.

## Overview

Modernize a legacy React 16 app (class components, Redux, single Webpack bundle) to function components + hooks, and split it into independently deployable remotes via Module Federation. Migration is incremental — old and new coexist while the team keeps shipping.

## Architecture characteristics (prioritized)

1. **Deployability** — independent squad deploys (Module Federation).
2. **Availability** — no freeze; continuous shipping.
3. **Modifiability** — hooks and modular remotes lower long-term maintenance cost.

## Key decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Migration strategy | **Incremental / strangler** | App is revenue-critical; a freeze is off the table. |
| D5 | Build integration | **Module Federation (host + remotes)** | Directly delivers independent deploys. |
| D6 | New-side state library | **Zustand (standardize)** | Modern, minimal boilerplate; chosen as the go-forward store for new remotes. |
| D2 | Compatibility boundary | **Route-level** | A route is entirely old or new. |

## Components

- **Host shell** — Module Federation host that composes remotes.
- **Legacy monolith** — existing Redux/class-component app, kept behind route boundaries and shrunk over time.
- **Hooks remotes** — new function-component micro-frontends, each owning a set of routes, using Zustand for local state.

## Data flow

The host loads a remote (or the legacy app) per route. New remotes manage their own state via Zustand. Migration advances route by route as squads rebuild each area with hooks.

## Risks

- 🟡 **Shared-dependency duplication** — configure MF `shared` for React and common libs as singletons.
- 🟡 **Two state paradigms in flight** — Redux (legacy) and Zustand (new) coexist during the transition.

## Testing

- Per-remote unit/integration tests for hooks + Zustand stores.
- Shell-level tests that each route resolves to the correct remote or legacy area.

## Open Items

- **Redux ↔ new remotes state sharing** — how legacy Redux state reaches new remotes during coexistence was not worked out; needs a follow-up before the first shared-data route migrates.
- **Router ownership during coexistence** — which side owns the URL/history while both stacks are live is still open.
