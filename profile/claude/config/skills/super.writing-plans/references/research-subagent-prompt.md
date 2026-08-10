# Research Subagent Prompt

Use this prompt template for each read-only research subagent dispatched from the
super.writing-plans **Research Phase**. One subagent per independent domain or file
cluster; demand a report complete enough that you never reopen a file it covered.

**Dispatch as a read-only subagent** — give it file-reading, searching and shell, and withhold
edit/write/dispatch. It only reads the codebase (files, symbols, test config) and returns a report.
**The shell is the default search mechanism** (`rg`/`grep`/`find`/`git log`): it locates a definition,
reads whole-file context, scans many files for a pattern, and checks literal strings and non-code
files, and it needs no tool discovery. Name a dedicated search tool only if the platform is known to
expose one under that name — a miss costs a discovery call that returns nothing. If the platform's symbol-lookup tool (`LSP`, or Serena's `find_symbol` /
`get_symbols_overview`) is already loaded, one opportunistic attempt for a named symbol is fine —
but don't chase it with retries or extra tool-loading calls; fall back to `grep` immediately if it
doesn't resolve. Withholding write/dispatch tools keeps those schemas out of its context window.
Set an explicit `model:` too — research is read-and-report, so floor it at `cheap`/`standard`;
never inherit the controller's model by omission (see super.subagent-driven-development,
"Model Selection" section). If the platform can't scope tools per dispatch, fall back to the default
subagent — behavior unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

```
Research the [subsystem/cluster] for the [feature] implementation plan.

Return a structured markdown report covering:
1. Relevant existing files with their exact paths and key exports
2. For every component, function, hook, or type a task will reuse: its exact
   signature / prop contract, copied verbatim — enough to write a real call site
   without reopening the file
3. Test setup and config, not just test style: the test command, the config file
   path, the DOM/test environment (e.g. jsdom / happy-dom), global setupFiles,
   render/mount helpers, and mock conventions — with the real values, not a summary
4. Current test patterns in this cluster (one real example test from the codebase)
5. Import path conventions and aliases (e.g. `@/components/...`) and naming patterns
6. Existing types, interfaces, or schemas relevant to this feature
7. Integration points with other clusters (what they expose, what they expect)
8. Existence confirmation: explicitly confirm each file/symbol the plan will
   reference actually exists, or flag it as missing

Read-only. Do not create or edit any files.

Budget: **5.000 characters.** This report lands in a controller that may be holding
several of them from the same turn, so the budget is the deliverable, not a target
to exceed. Spend it in this order and let the tail absorb the squeeze:
  - items 1, 2 and 8 are what the plan cannot be written without — keep them complete
    and verbatim, always
  - item 3: real values only (command, paths, environment names). No prose about them
  - item 4: an excerpt of at most 15 lines, not a whole test file
  - items 5, 6, 7: one line each unless something is genuinely surprising
Verbatim where it says verbatim — a summary of a signature forces the re-read this
subagent exists to prevent. Everywhere else, compress.

Check the length before you return, and cut if you are over. Take it out of items 5,
6 and 7 (one line each) and item 4's excerpt — never out of 1, 2 or 8. Measured in a
real run: all five research reports came back 4-24% over, because a budget with no
closing check reads as a suggestion. It is not one.
```
