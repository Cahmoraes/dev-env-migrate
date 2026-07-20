## Webhook Delivery State Machine — Reconstruction

**States:**
1. pending
2. delivering
3. retrying
4. delivered
5. dead_letter
6. cancelled

**Transitions:**

| Source State | Target State | Trigger/Condition |
|---|---|---|
| (start) | pending | webhook event created |
| pending | delivering | attempt delivery |
| delivering | delivered | success |
| delivering | retrying | failure AND attempts < 5 |
| delivering | dead_letter | failure AND attempts == 5 |
| retrying | delivering | backoff elapsed, retry |
| pending | cancelled | user cancels |
| delivering | cancelled | user cancels |
| retrying | cancelled | user cancels |

**Terminal States:**
- delivered
- dead_letter
- cancelled

**Maximum Retry Attempts:**
5 attempts (exponential backoff: 1min, 2min, 4min, 8min, 16min)

**States Where User Can Cancel:**
- pending
- delivering
- retrying
