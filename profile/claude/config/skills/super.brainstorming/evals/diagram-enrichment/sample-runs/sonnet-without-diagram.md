## Webhook Delivery State Machine — Reconstruction

**1. States**

- `pending`
- `delivering`
- `retrying`
- `delivered` (terminal)
- `dead_letter` (terminal)
- `cancelled` (terminal)

**2. Transitions**

| Source | Target | Trigger/Condition |
|---|---|---|
| `pending` | `delivering` | Event is processed (delivery attempt begins) |
| `delivering` | `delivered` | Delivery attempt succeeds |
| `delivering` | `retrying` | Delivery fails AND attempts so far < 5 |
| `delivering` | `dead_letter` | Delivery fails on the 5th attempt |
| `retrying` | `delivering` | Backoff timer for the event expires (retry cycle) |
| `pending` | `cancelled` | User cancels manually |
| `delivering` | `cancelled` | User cancels manually |
| `retrying` | `cancelled` | User cancels manually |

**3. Terminal states**

- `delivered`
- `dead_letter`
- `cancelled`

(All three have no outgoing transitions.)

**4. Maximum retry attempts**

5 attempts total before dead-letter (exponential backoff: 1min, 2min, 4min, 8min, 16min). If the failure occurs on the 5th attempt, the event goes directly to `dead_letter`.

**5. Cancellable states**

The user can cancel from `pending`, `delivering`, or `retrying` — i.e., any non-terminal state, at any point before the event reaches a terminal state.
