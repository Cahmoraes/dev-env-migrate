# Brief — legacy React class components → hooks + Module Federation

**Scenario shape:** migration (full). Strangler-vs-big-bang, compatibility boundary, and build integration are roots reshaping everything downstream.

## Persona (simulated user)

A frontend lead on a 5-year-old React 16 app: class components, Redux, a single Webpack bundle, a homegrown router. The team wants to modernize to function components + hooks and split the app via Module Federation so squads deploy independently. Risk-averse — the app is revenue-critical and cannot have a big-bang freeze.

## Surface intent (say unprompted)

> "We want to migrate our old React app to hooks and split it up with Module Federation so teams can ship independently. It's a big app and we can't stop shipping features while we do it."

Shallow follow-ups: "yeah incrementally", "the old and new parts need to work together for a while".

## Ground-truth decisions (reveal only when probed)

| id | fork | hidden | preferred answer | reveal trigger |
|---|---|---|---|---|
| D1 | **Migration strategy** — strangler-fig vs big-bang | no | strangler-fig (the "can't stop shipping" constraint eliminates big-bang) | interviewer asks incremental vs all-at-once, or ties to the no-freeze constraint |
| D2 | **Compatibility boundary** — where old and new coexist (route-level vs component-level) | no | route-level: a route is owned by old *or* new, never mixed mid-tree | interviewer asks where old/new meet (child of D1=strangler) |
| D3 | **Shared state across the boundary** — duplicate Redux vs bridge old store to new | **yes** | bridge: new islands read the existing Redux via a thin adapter; no duplicated source of truth | interviewer probes how state is shared old↔new (child of D2) |
| D4 | **Routing ownership during coexistence** — old router, new router, or a shell that delegates | **yes** | shell owns top-level routing and delegates into old/new; avoids two routers fighting over history | interviewer asks who owns the URL/history while both exist |
| D5 | **Build integration** — Module Federation host/remotes vs single bundle during transition | no | MF from the start: shell = host, squads = remotes; that *is* the independent-deploy requirement | interviewer asks how the split is built/deployed |
| D6 | **State lib on the new side** — Zustand vs Context vs keep Redux (leaf) | no | leaf — resolve with the reversible default (Context now) + a revisit trigger ("switch to Zustand if cross-tree state appears"); a premature hard commitment to a Zustand migration is the failure | interviewer raises it; specialist resolves it with the reversible default, not an early irreversible commitment |

## Leak test

D1=strangler must **delete the entire big-bang subtree** (no freeze-window questions). D3 and D4 are the hidden roots — a weak interview commits to "hooks + MF" and never resolves how state and routing survive the coexistence window, which is where the migration actually breaks. D6 is a leaf a good interview resolves with its **reversible default plus a revisit trigger** (Context now, revisit if D3 forces it), not one it prematurely hard-commits — forcing an early irreversible Zustand migration is the failure (leaf-first). Leaving D6 open is also wrong: the spec closes every end.
