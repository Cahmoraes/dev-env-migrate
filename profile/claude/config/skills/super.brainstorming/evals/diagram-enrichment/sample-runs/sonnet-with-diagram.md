## Webhook Delivery State Machine — Reconstruction from Memory

**1. States**

- `pending`
- `delivering`
- `retrying`
- `delivered` (terminal)
- `dead_letter` (terminal)
- `cancelled` (terminal)

**2. Transitions**

| Source | Target | Trigger / Condition |
|---|---|---|
| `[*]` | `pending` | webhook event created |
| `pending` | `delivering` | attempt delivery |
| `delivering` | `delivered` | delivery success |
| `delivering` | `retrying` | delivery failure, attempts < 5 |
| `delivering` | `dead_letter` | delivery failure, attempts == 5 |
| `retrying` | `delivering` | backoff elapsed, retry |
| `pending` | `cancelled` | user cancels |
| `delivering` | `cancelled` | user cancels |
| `retrying` | `cancelled` | user cancels |

**3. Terminal states** (no outgoing transitions)

- `delivered`
- `dead_letter`
- `cancelled`

**4. Maximum retry attempts before dead-letter**

5 attempts (backoff schedule: 1min, 2min, 4min, 8min, 16min — exponential, capped at 5 tries).

**5. States from which a user can cancel**

`pending`, `delivering`, and `retrying` — i.e., any non-terminal state. Once an event reaches `delivered`, `dead_letter`, or `cancelled` it can no longer be cancelled.
