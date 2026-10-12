# Token Budget — context discipline for subagents

Every subagent dispatch carries a cost. Keep the context payload minimal without dropping the information needed for the role.

## Default budgets

| Role | Max context | What to include | What to omit |
|---|---|---|---|
| **Implementer** | spec + task file + relevant existing files (~2-4 files) | Done-when criteria, exact file paths, code patterns to follow | Full session history, unrelated features, planning artifacts |
| **Final reviewer (bounded path)** | step list + diff + tests + `Mutation:` line + checklist | `BASE_SHA..HEAD_SHA`, test command | Session transcript, task files |
| **Research/explore** | bounded question + 2-3 files | Specific question, paths to inspect | Broad "understand the codebase" prompts |
| **Task writer** | digest + decomposition + templates | Synthesized research, task list, templates | Raw codebase dumps |

## Rules

1. **Never send the full session transcript** to a subagent. The controller synthesizes only what the role needs.
2. **Use `file:line` snippets**, not whole files, when the role only needs a signature or pattern.
3. **Request compact output** explicitly in the prompt: "Return only the verdict + ranked gaps; do not echo code."
4. **Re-use green results** when clean (`git status --porcelain` empty, `HEAD` at verified SHA) instead of re-running full suites.
5. **One spec at a time.** Do not load PRD, design spec, and mockup docs simultaneously unless the role genuinely needs all three.

## Anti-patterns

- "Here is the full conversation so far..."
- "Read these 20 files to understand the repo..."
- A reviewer returns prose >500 tokens for an approval.
- Re-running `npm test` when the previous gate already proved green and the tree did not move.
