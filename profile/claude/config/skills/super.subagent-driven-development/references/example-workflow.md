# Example Workflow

```
You: I'm using Subagent-Driven Development to execute this plan.

[Read tasks index: docs/superpowers/toggle-light-dark-theme/plans/tasks-toggle-light-dark-theme.md]
[Tasks 1-2 already [x] — skipping (session resume)]
[Read task-03.md — PRD: ../prd/prd-toggle-light-dark-theme.md, Spec: ../specs/toggle-light-dark-theme-design.md]
[Read PRD and Spec for full feature context]
[Extract remaining tasks 3-5 with full text and context]
[Create TodoWrite with remaining tasks]

Task 3: Token refresh endpoint

[Read individual task file: feature-plan-tasks/task-03.md]
[Update task file Status: PENDING → IN_PROGRESS]
[Dispatch implementation subagent with full task text + context]

Implementer: "Before I begin - should the token use sliding expiration?"

You: "Yes, 15 minute sliding window."

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Implemented refresh endpoint
  - Added tests, 5/5 passing
  - Self-review: Found I missed rate limiting, added it
  - Committed

[Dispatch spec compliance reviewer]
Spec reviewer: ✅ Spec compliant - all requirements met, nothing extra

[Get git SHAs, dispatch code quality reviewer]
Code reviewer: Strengths: Good test coverage, clean. Issues: None. Approved.

[Run super.verification-before-completion: tests pass, evidence confirmed]
[Update task tracker: feature-plan-tasks.md line "- [ ] 3." → "- [x] 3."]
[Update task file: Status: IN_PROGRESS → DONE]
[Mark Task 3 complete]

Task 4: Session management
...

[After all tasks]
[Dispatch final code-reviewer]
Final reviewer: All requirements met, ready to merge

[PRD found: docs/superpowers/toggle-light-dark-theme/prd/prd-toggle-light-dark-theme.md]
[Ask user: "PRD found. Do you want to run the QA gate (super.user-story-verification)?"]
User: "Yes, run QA."
[Invoke super.user-story-verification]
QA Gate: 3/3 user stories verified. Status: PASSED.
QA report → docs/superpowers/toggle-light-dark-theme/qa/qa-report-toggle-light-dark-theme.md

[Pass tasks index path to super.finishing-a-development-branch]
Done!
```
