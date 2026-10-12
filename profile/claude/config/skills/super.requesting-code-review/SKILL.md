---
name: super.requesting-code-review
description: Use after completing a task or feature, or before merging, to review the work against its requirements.
user-invocable: false
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or: git merge-base origin/main HEAD
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Dispatch a subagent with your platform's dispatch tool, filling the template at `agents/code-reviewer.md`. Set an explicit `model:` on the dispatch — a code reviewer is a validation gate: a **scoped** review (one task's diff, with a brief) runs at the task's tier floored at `standard` (a cheap task is reviewed one family up, by the standard tier, not the most-expensive capable), while the **whole-branch final review** runs on `capable` whatever the tasks' tier — it has no task and no brief scoping what to look at; never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section).

**Placeholders:** the **Placeholders** section of `agents/code-reviewer.md` lists the eight the template takes and says when each one is required — four on every review, the rest only for a cumulative diff or for the whole-branch final pass. Fill them from there; a list restated here would be the one that goes stale.

**3. Act on feedback** — from a reviewer subagent, the user or a PR:
- Fix Critical issues immediately, Important ones before proceeding; note Minor ones for later
- Any item unclear → clarify it before implementing any of them (items interact)
- Verify each suggestion against the code before acting; a suggested "professional" addition gets a usage search first — nothing calls it → propose removing it (YAGNI)
- Wrong for this codebase, or against a decision the user already made → push back with the technical reason; no performative agreement ("great point!") — state the fix or just make it
- PR review comments get their reply in the comment's own thread

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: docs/superpowers/<feature>/plans/task-02.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

Critical and Important findings are fixed before moving on. A reviewer you believe is wrong gets technical reasoning and the code or test that proves it — never silence.
