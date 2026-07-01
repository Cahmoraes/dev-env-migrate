---
name: super.dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# Dispatching Parallel Agents

## Overview

You delegate tasks to specialized agents with isolated context. They never inherit your session's history — you construct exactly what each needs, which keeps them focused and preserves your own context for coordination. Investigating independent failures sequentially wastes time; each can run in parallel.

**Core principle:** one agent per independent problem domain, all running concurrently.

## When to Use

The chain is: multiple failures? → independent of each other? → can run without shared state? Only when all three hold do you dispatch in parallel.

**Use when:** 3+ test files (or subsystems) failing with different root causes, each understandable without context from the others, with no shared state between investigations.

**Do NOT use when:**
- **Related failures** — fixing one may fix others; investigate together first.
- **Need full context** — understanding requires seeing the whole system.
- **Exploratory debugging** — you don't yet know what's broken.
- **Shared state** — agents would interfere (same files, same resources). Use sequential agents instead.

## The Pattern

1. **Identify independent domains.** Group failures by what's broken (e.g. file A = tool approval flow, file B = batch completion, file C = abort). Confirm fixing one doesn't affect another.
2. **Create focused agent tasks.** Each gets: a specific scope (one file/subsystem), a clear goal, constraints ("don't change other code"), an expected output (summary of findings + fixes), and a **right-sized model** — apply `super.subagent-driven-development/SKILL.md § Model Selection`, set an explicit `model:` per agent and **never omit it** (omitting inherits your model). Cheap model for a mechanical localized fix; capable one for an open-ended subsystem investigation. Over-provisioning multiplies across many agents.
3. **Dispatch in parallel** — one `Task(...)` per domain, all in the same turn so they run concurrently.
4. **Review and integrate** — see § Verification below.

## Agent Prompt Structure

Good prompts are **focused** (one problem domain), **self-contained** (all context needed — paste the error messages and test names; never assume the agent shares your context), and **specific about output** (what to return). Constrain scope explicitly ("fix tests only" / "do NOT change production code") and the approach where it matters ("replace arbitrary timeouts with event-based waiting — do NOT just increase timeouts; find the real issue"). End with "Return: summary of root cause and changes."

Common failure modes: too broad ("fix all the tests" → agent gets lost), no context ("fix the race condition" → doesn't know where), no constraints (agent refactors everything), vague output ("fix it" → you don't know what changed).

## Verification

After agents return:
1. **Review each summary** — understand what changed.
2. **Check for conflicts** — did agents edit the same code?
3. **Run the full test suite** — verify all fixes work together.
4. **Spot check** — agents can make systematic errors.
