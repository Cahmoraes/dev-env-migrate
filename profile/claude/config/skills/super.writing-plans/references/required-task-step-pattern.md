# Required Task Step Pattern

Every `## Passos` section in a task file MUST follow this TDD pattern exactly. Do not summarize or abbreviate — copy the structure below and fill it with real code, real commands, and real expected outputs.

## Pattern

The `## Passos` section contains **only the steps below**. Do **not** re-emit the `# Task N`
title or the `## Arquivos` list here — the task-file template already provides both, and
repeating them produces a duplicate heading plus a second, differently-formatted file list.

````markdown
- **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Visual-fidelity tasks (when a mockup exists)

For a UI task that has a `### Fidelidade Visual` subsection, the `## Passos` must, **before** the TDD loop, include one action that pins down fidelity inputs — and it stays tool-agnostic:

- **Step 0: Confirm design source & fidelity tools**

  Read the design source and fidelity tools already recorded in `### Fidelidade Visual` (the plan author discovered them once, at plan time). Confirm the original design source with the user — only this needs the user and so belongs at execution — and fill any gap the plan left open (re-run tool discovery only if the field was left blank, inspecting `chat.agentSkillsLocations` + connected MCP tools; match by capability, never hardcode a tool). If a source URL or a fidelity tool exists, use it; otherwise build to the curated mockup at `../specs/mockups/<file>` manually. The mockup is the *norte* — reuse its decided layout, spacing, and tokens; do not re-derive them.

This step never blocks: "no source / no tooling available" is a valid answer that routes to manual implementation against the mockup.

## Rules

- Every step is one action (2–5 minutes max).
- Steps that involve code **must** include the actual code block — never describe what the code should do without showing it.
- Run commands must include the exact command and the expected output.
- Never use "TBD", "TODO", "similar to Task N", or vague phrases like "add error handling."
- Repeat code across tasks if needed — engineers may read tasks out of order.
