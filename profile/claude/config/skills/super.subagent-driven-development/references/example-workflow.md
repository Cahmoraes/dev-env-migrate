# Example Workflow

```
You: I'm using Subagent-Driven Development to execute this plan.

[sdd-start.cjs on docs/superpowers/toggle-light-dark-theme/plans/tasks-toggle-light-dark-theme.md]
[tasks: 1-2 already [x] — skipped (session resume); 3-5 pending · plan: suggestedTier per task]
[session → session_* restored · branch → action: proceed (feat/toggle-light-dark-theme) · errors: []]
[sdd-start.cjs → ledger .superpowers/sdd/toggle-light-dark-theme/progress.md — 1 minor deferred from task 2; preflight.flagged: []]

Task 3: Token refresh endpoint

[build-task-dispatch.cjs --role implementer --task-number 3 --start → IN_PROGRESS, ledger "started (base a1b2c3d)"]
[Dispatch implementer — model: <session_model_tier_cheap>; task file, spec and PRD as absolute paths; auto_commit: true]

Implementer: "Before I begin - should the token use sliding expiration?"
You: "Yes, 15 minute sliding window."
Implementer: Status DONE — refresh endpoint at src/auth/refresh.ts:12, 5/5 passing, Mutation: 3/3 killed (M1-M3); survivors: none, committed d4e5f6a.

[build-task-dispatch.cjs --role reviewer --task-number 3 → review package a1b2c3d..d4e5f6a (range checked)]
[Dispatch task reviewer — model: <session_model_tier_standard>; task file, spec, Restrições Globais, BASE/HEAD]
Task reviewer: ❌ Spec: missing progress reporting (spec says "report every 100 items").
  Important: magic number 100 at src/auth/refresh.ts:41. Ready to merge? No.

[Fix round 1: follow-up message to the same implementer with both findings under ## Review Findings to Address]
Implementer: Added progress reporting, extracted PROGRESS_INTERVAL; re-ran test/refresh.test.ts — 7/7.
[build-task-dispatch.cjs --role reviewer --base d4e5f6a --findings-file f.md → ledger, by the script: Task 3: fix round 1 (findings: f.md; commits d4e5f6a..e7f8a9b)]
[Dispatch scoped re-review with ## Findings under verification]
Re-reviewer: progress reporting — ADDRESSED (src/auth/refresh.ts:44). Magic number — ADDRESSED (:7).
  New breakage: none. ✅ Spec compliant and well-built.

[super.verification-before-completion on test/refresh.test.ts — 7/7, file count 1, exit 0]
[mark-task-status.cjs --task-file task-03.md --status DONE --tasks-index <index> --task-number 3 --verify -- npm test -- test/refresh.test.ts]
→ verify.exitCode 0, statusChanged: true, indexUpdated: true

Task 4 and Task 5: two cheap same-shape config edits, neither consumes the other → one batched dispatch
[IN_PROGRESS on both task files; one implementer listing task-04.md and task-05.md; one reviewer over the range]
Task reviewer: ✅ — Minor: unused import at src/config/theme.ts:3.
[Ledger: Task 4: minor (deferred): unused import src/config/theme.ts:3]
[mark-task-status.cjs --tasks-index <index> --task-number 4,5 --status DONE --verify -- npm test]

[Full-suite checkpoint: npm test → 132/132, exit 0]

[Final stage — read ./final-stage.md]
1. [build-task-dispatch.cjs --role final (derives the merge-base, checks the range); dispatch final code reviewer — model: <session_model_tier_capable>,
    with Foco de Revisão, Restrições Globais and the ledger's minor/unverified/parked lines as {DEFERRED_MINORS}]
   Final reviewer: Important: theme token leaks across sessions (src/theme/store.ts:58). Deferred minors: fix the unused import; rest stands.
   [build-task-dispatch.cjs --role final-fix --findings-file …: ONE fixer with the whole list → RED→GREEN test named in the report; suite green → no re-review needed]
2. [PRD found; session_qa_gate_enabled: true, ask: false → "Running the QA gate for the 3 user stories."]
   QA Gate: 3/3 PASSED → docs/superpowers/toggle-light-dark-theme/qa/qa-report-toggle-light-dark-theme.md
3. [sdd-finish.cjs → allDone: true, summary rendered from the ledger, ledger deleted, tracker committed]
4. [summary pasted as it is — "Resumo da execução" / "Run summary", following the plan's language:]
   What was done: each task's `complete` line, the final review's verdict, the tracker commit
   Rulings I made (1):
   1. **Task 3** — progress interval is a constant, not a config key — plan text said "configurable", spec says fixed at 100; costs one small edit if the spec changes.
   What is left to do (1):
   - [ ] Final review: minor (deferred): fix the unused import
   [Invoke super.finishing-a-development-branch with the tasks index path]
```
