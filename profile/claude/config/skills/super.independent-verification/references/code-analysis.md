# Code Analysis - Locate Assertions and Symbols Precisely

The spec-anchored check lives or dies on locating the **exact `file:line`** where each acceptance
criterion is asserted, and confirming the symbols under test actually exist. Use the most precise
tool available and degrade gracefully. Semantic (LSP) tools beat structural search, which beats
text search.

## Tool priority (graceful degradation)

1. **LSP / semantic** (best - understands the code, not just its text). When the platform exposes a
   language server or a semantic code tool, prefer it:
   - **Serena** (`mcp__serena__*`): `find_symbol` (locate a function/method/class definition),
     `find_referencing_symbols` (who calls it - proves a spec-required side effect is wired),
     `get_symbols_overview` (map a file), `find_referencing_symbols` for impact, and
     `get_diagnostics_for_file` / IDE `getDiagnostics` to confirm the file typechecks clean.
   - Any editor LSP ("go to definition", "find references", "hover type") serves the same purpose.
   - Use it to (a) confirm the symbol an AC talks about exists and is exported, (b) find every test
     that references it, (c) read hover types to check the asserted value's type matches the spec.
2. **ast-grep** (`sg`) - structural, pattern-based. Best for finding assertions by *shape*,
   independent of formatting:
   ```bash
   sg -p 'expect($X).toBe($V)' --lang ts <dir>      # every equality assertion
   sg -p 'expect($X).toEqual($V)' --lang ts <dir>
   sg -p 'it($DESC, $FN)' --lang ts <dir>           # enumerate test cases
   sg -p 'throw new $ERR($$$)' --lang ts <dir>      # error-path coverage
   ```
3. **ripgrep** (`rg`) - fast text search with line numbers (always give `-n`):
   ```bash
   rg -n 'expect\(.*\)\.toBe' test/                 # assertions with file:line
   rg -n 'describe\(|it\(' test/
   ```
4. **grep** - final fallback (`grep -rn 'expect(' test/`).

## Detection

Prefer whichever of `sg` (ast-grep) → `rg` (ripgrep) → `grep` is installed, checked via
`command -v`; for LSP/semantic tools, detect by whether the platform exposes them (Serena
`mcp__serena__*`, an IDE diagnostics tool) and fall through to ast-grep if none.

## How the Verifier uses this

- **Spec-anchored check:** `sg -p 'expect($X).toBe($V)'` (or LSP find-references from the symbol)
  locates the assertion; read that `file:line` to confirm the asserted value against the
  spec-defined outcome (evidence-or-zero rule: `SKILL.md`, `agents/verifier.md` Step 2).
- **Payload/conjunction rule:** `find_referencing_symbols` on a required side-effect method
  (`notify`, `persist`) proves the call is wired and lets you check the asserted payload.
- **Sensor targeting:** `find_symbol` locates the highest-risk new logic to mutate; diagnostics
  confirm the tree typechecks before and after the sensor.

## Scope

- Limit to relevant source extensions; exclude `node_modules`, `vendor`, `dist`, `build`, `.git`.
- Focus on `src`, `lib`, `app`, and the test directory.
- Prefer specific patterns over broad scans; use `--lang` (ast-grep) / type filters (ripgrep).

## Fallback notice (once per session)

```
⚠️ ast-grep not detected. Install for precise structural assertion search.
   https://ast-grep.github.io/guide/quick-start.html
```
