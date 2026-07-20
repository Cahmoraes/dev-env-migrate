**Webhook Delivery State Machine — Reconstruction from Memory**

**States (6 total):**
- pending
- delivering
- retrying
- delivered (terminal)
- dead_letter (terminal)
- cancelled (terminal)

**Transitions:**
- pending → delivering (event processed)
- delivering → delivered (delivery succeeds) [TERMINAL]
- delivering → retrying (delivery fails AND attempts < 5)
- delivering → dead_letter (delivery fails on 5th attempt) [TERMINAL]
- retrying → delivering (backoff timeout expires)
- pending → cancelled (user cancels) [TERMINAL]
- delivering → cancelled (user cancels) [TERMINAL]
- retrying → cancelled (user cancels) [TERMINAL]

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
