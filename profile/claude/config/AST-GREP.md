# ast-grep (`sg`) — Structural Search for TypeScript/JavaScript

**Purpose**: Search code by *AST shape* (decorators, generic calls, object literals, throws) instead of raw text. Use `sg` whenever a regex would be fragile because the thing you want is defined by **structure**, not characters.

## Decision Rule

USE `sg` WHEN the pattern is **structural** in TS/JS:

| Use `sg` when… | Use `grep` when… |
|---|---|
| Decorators with/without a specific argument | Literal text in any file type |
| Function calls with a specific shape | Non-code files (YAML, JSON, Markdown) |
| Patterns with generics or object args | Simple regex with no code structure |
| Distribution analysis per module/bounded context | Quick string lookup in a few files |

Do NOT use `sg` WHEN:
- Searching **non-code** (YAML/JSON/MD) → use `Grep`.
- Looking for a **symbol definition or its references** → use Serena (`find_symbol` / `find_referencing_symbols`), see `SERENA.md`.
- A plain literal string is enough → use `Grep` (cheaper).

## Wildcards (the core idea)

- `$VAR` → matches **one** AST node (a single arg, identifier, type).
- `$$$` → matches a **sequence** of nodes (multi-arg, multi-prop, spread).

## Essential Syntax

```bash
sg --pattern '@inject($TOKEN)' --lang ts PATH           # decorator with one argument
sg --pattern '@injectable()'   --lang ts PATH           # decorator, no argument
sg --pattern 'useQuery<$T, $E>({ $$$ })' --lang ts PATH # generics + object shape
sg --pattern 'throw new $ERROR($$$)' --lang ts PATH     # any throw, any args
sg --pattern 'PATTERN' --lang ts PATH --json            # machine-readable output
```

## `--json` Output Handling

`--json` returns an array of objects with `file`, `range.start.line`, `range.start.column`, `text`.

**Always pipe `--json` results through `ctx_execute` (sandbox)** to filter/aggregate — never dump raw JSON bytes into the conversation. Print only the derived answer (counts, grouped paths, offending lines).

```text
"Count @injectable() per bounded context"
  → sg --pattern '@injectable()' --lang ts apps/backend/src --json
  → ctx_execute: group by path segment, print { context: count }
```

## Examples

```text
"Find every place that injects a token"
  → sg --pattern '@inject($TOKEN)' --lang ts apps/backend/src

"Find all React Query hooks with generics"
  → sg --pattern 'useQuery<$T, $E>({ $$$ })' --lang ts apps/frontend/src

"Audit all custom error throws"
  → sg --pattern 'throw new $ERROR($$$)' --lang ts apps/backend/src
```

## Verify `sg` Is Available

```bash
which sg && sg --version    # expect: ast-grep X.Y.Z
```
Name collision note: ensure `sg` resolves to **ast-grep**, not another `sg` binary.
