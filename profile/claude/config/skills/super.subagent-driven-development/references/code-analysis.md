# Code Analysis - Locate Code Precisely Before You Change It

Implementation and review work lives or dies on finding the right existing code before touching
anything: the symbol you're about to edit, every call site a rename would break, the tests a
module already has, and whether a similar piece of logic already exists. Use the most precise
tool available and degrade gracefully. Semantic (LSP) tools beat structural search, which beats
text search.

## Tool priority (graceful degradation)

1. **LSP / semantic** (best - understands the code, not just its text). When the platform exposes a
   language server or a semantic code tool, prefer it:
   - **Serena** (`mcp__serena__*`): `find_symbol` (jump straight to a function/class definition
     instead of guessing its file), `find_referencing_symbols` (every call site of a symbol you're
     about to change or rename), `get_symbols_overview` (map an unfamiliar file before editing it),
     and `get_diagnostics_for_file` / IDE `getDiagnostics` to confirm the tree still typechecks
     after your edit.
   - Any editor LSP ("go to definition", "find references", "hover type") serves the same purpose.
   - Use it to (a) find the exact definition you're about to modify, (b) enumerate every caller
     before a signature change or rename, (c) check a type before reusing it.
2. **ast-grep** (`sg`) - structural, pattern-based. Best for finding code by *shape*, independent of
   formatting or variable names:
   ```bash
   sg -p 'function $NAME($$$) { $$$ }' --lang ts <dir>   # locate a function definition
   sg -p '$OBJ.$METHOD($$$)' --lang ts <dir>             # every call site of a method
   sg -p 'class $NAME { $$$ }' --lang ts <dir>           # locate a class body
   sg -p 'describe($DESC, $FN)' --lang ts <dir>          # existing test suites for a module
   sg -p 'export function $NAME($$$)' --lang ts <dir>    # exported functions (candidate reuse)
   ```
3. **ripgrep** (`rg`) - fast text search with line numbers (always give `-n`):
   ```bash
   rg -n 'function handleSubmit' src/                    # quick symbol lookup with file:line
   rg -n 'TODO|FIXME' src/
   ```
4. **grep** - final fallback (`grep -rn 'function handleSubmit' src/`).

## Detection (check before use)

```bash
if command -v sg >/dev/null 2>&1; then :        # ast-grep (structural)
elif command -v rg >/dev/null 2>&1; then :      # ripgrep (fast text)
else :                                          # grep (basic)
fi
```

For LSP/semantic tools, detect by whether the platform exposes them (Serena `mcp__serena__*`, an
IDE diagnostics tool); if none, fall through to ast-grep.

## How implementer and reviewer subagents use this

- **Locating the edit point:** before changing a function, class, or component, `find_symbol` (or
  `sg -p 'function $NAME($$$) { $$$ }'`) to land on the exact definition instead of skimming files
  by eye. Read the surrounding code once you're there, not before.
- **Finding every call site before a refactor or rename:** `find_referencing_symbols` (or
  `sg -p '$OBJ.$METHOD($$$)'` / `sg -p '$FN($$$)'`) to enumerate every caller. Missing one is how
  a rename silently breaks a distant module.
- **Finding existing tests before writing new ones:** `sg -p 'describe($DESC, $FN)'` or
  `get_symbols_overview` on the test file for the module under change, so new tests extend the
  existing suite instead of duplicating or fragmenting it.
- **YAGNI/DRY check before adding new code:** search for a similar or duplicate implementation
  already in the codebase (`sg` on the function/class shape you're about to write, or `rg` on a
  descriptive keyword) before writing something new. Reuse or extend what exists; don't add a
  second helper that does the same thing under a different name.
- **During review:** scan usages of a changed pattern across the codebase (`sg` on the old and new
  shape) to confirm a fix or convention change was applied everywhere it should be, not just in the
  file the diff touched.

## Scope

- Limit to relevant source extensions; exclude `node_modules`, `vendor`, `dist`, `build`, `.git`.
- Focus on `src`, `lib`, `app`, and the test directory.
- Prefer specific patterns over broad scans; use `--lang` (ast-grep) / type filters (ripgrep).

## Fallback notice (once per session)

```
⚠️ ast-grep not detected. Install for precise structural code search.
   https://ast-grep.github.io/guide/quick-start.html
```
