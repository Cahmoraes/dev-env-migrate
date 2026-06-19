# Serena — Symbol-Level Code Navigation (MCP)

**Purpose**: Navigate code by *symbol* (definitions, references, implementations) via the LSP-backed Serena MCP server. Replaces `Read`-the-whole-file and `grep`-for-a-name when the question is "where / who / what symbol", not "what text".

## Mandatory First Step

Call `mcp__serena__initial_instructions` **once, before starting any code task**. It loads the Serena operating manual. Skipping it = degraded results.

## Decision Rule

USE Serena WHEN the question is about a **named code entity** (class, function, method, interface, variable) and its relationships:

| Question | Tool |
|---|---|
| "Where is class/function `X` defined?" | `find_symbol` |
| "Where is `X` declared?" | `find_declaration` |
| "Which classes implement interface `Y`?" | `find_implementations` |
| "Who calls method/function `Z`?" | `find_referencing_symbols` |
| "What symbols exist in this file/dir?" | `get_symbols_overview` |
| "Rename symbol safely across the project" | `rename_symbol` |
| "Can this symbol be deleted safely?" | `safe_delete_symbol` |
| "Insert code before/after a symbol" | `insert_before_symbol` / `insert_after_symbol` |
| "Replace a symbol's body" | `replace_symbol_body` |

Do NOT use Serena WHEN:
- You need **literal text** (log strings, config keys, comments) → use `Grep`.
- You are searching **non-code** (YAML, JSON, Markdown) → use `Grep`/`Glob`.
- You need a **structural AST pattern** (decorators, generic calls, object shapes) → use ast-grep (`sg`), see `AST-GREP.md`.

## Hard Rules

- **NEVER read a whole file** just to discover what it contains → call `get_symbols_overview` first, then `find_symbol` on the target.
- **NEVER `grep` a class/function name** to find its definition → call `find_symbol`.
- Prefer `find_referencing_symbols` over `grep` for impact analysis before edits/renames — it returns true call sites, not text matches.

## Examples

```text
"Where is UserRepository defined?"
  → find_symbol(name_path_pattern: "UserRepository")

"Who uses CreateGymUseCase.execute?"
  → find_referencing_symbols(name_path: "CreateGymUseCase/execute")

"List the public surface of this controller without reading it"
  → get_symbols_overview(relative_path: ".../stripe-webhook.controller.ts")

"Rename PaymentGateway across the whole backend"
  → rename_symbol(...)   # never sed/grep-replace a symbol
```

## Verify Serena Is Active

Serena tools appear as deferred `mcp__serena__*` entries. If absent, the MCP server is down — fall back to `get_symbols_overview` via `Read`/`Grep` only as a last resort, and report it.
