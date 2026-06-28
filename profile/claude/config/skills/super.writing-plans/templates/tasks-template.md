# Tarefas: [Feature Name]

> **For agentic workers:** REQUIRED SUB-SKILL: Use super.subagent-driven-development (recommended, sequential), super.parallel-subagent-in-tree (parallel waves in the shared tree, no worktrees), or super.parallel-subagent-development (parallel waves in isolated worktrees — see the `## Ondas de Execução` section below) to implement tasks. Progress is tracked at the task level via the checkbox (`- [ ]`) list below — each task file contains the full implementation steps for its task.

**Spec:** `../specs/<feature-name>-design.md`
**PRD:** `../prd/prd-<feature-name>.md`

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---

## Tarefas

- [ ] 1. [Task Title] [FR-XXX, FR-YYY] → `task-01.md`
- [ ] 2. [Task Title] [FR-XXX] → `task-02.md`
- [ ] 3. [Task Title] → `task-03.md`

<!-- Note: [FR-XXX] tags are included ONLY when a PRD exists. Omit them when planning from spec alone. -->

## Ondas de Execução

<!--
  Derived from each task's **Depends on:** field via topological grouping.
  Tasks in the same wave have NO dependency on one another and MAY run in parallel —
  super.parallel-subagent-development runs each parallel-wave task in its own isolated
  git worktree, then integrates them. Waves run strictly in order; a later wave starts
  only after every task in the previous wave is integrated and verified.

  Label a wave "(parallel)" when it holds 2+ tasks and "(sequential)" when it holds one.
  Every task in the list above must appear in exactly one wave. If the plan is a single
  dependent chain, emit one sequential wave per task — that is the correct, valid output
  for inherently sequential work and signals that the parallel option offers no speedup.
-->

- **Wave 1** (parallel): 1, 2
- **Wave 2** (sequential): 3
