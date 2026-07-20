# Research Subagent Prompt

Use this prompt template for each read-only research subagent dispatched from the
super.writing-plans **Research Phase**. One subagent per independent domain or file
cluster; demand a report complete enough that you never reopen a file it covered.

**Dispatch as a read-only subagent** — allowed tools `Read`, `Grep`, `Glob`, `Bash` (no
`Edit`/`Write`/`Task`). It only reads the codebase (files, symbols, test config) and returns a
report. `Bash` (`rg`/`find`/`git log`) and `Grep` are the default way to locate a definition, read
whole-file context, scan many files for a pattern, and check literal strings and non-code files;
never mutation. If the platform's symbol-lookup tool (`LSP`, or Serena's `find_symbol` /
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

Read-only. Do not create or edit any files. Return verbatim signatures and config
values, not summaries that would force a re-read.
```
