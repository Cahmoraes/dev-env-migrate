# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
```

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

Most commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

**pnpm — partial hook coverage (know what's caught vs not):**
- Caught automatically: `pnpm list`, `pnpm install`, `pnpm run <cmd>`, `pnpm exec <bin>`, `pnpm dlx <bin>`
- NOT caught — prefix manually: `pnpm add <pkg>` and `pnpm --filter <app> <cmd>` (most common monorepo usage)
- Safe rule: always write `rtk pnpm ...` — RTK guards against double-rewrite, no harm prefixing already-caught commands

**pnpm --filter enforcement hook** (`~/.claude/hooks/rtk-pnpm-enforce.sh`):
A `PreToolUse` hook actively **blocks** any bare `pnpm --filter` command that lacks the `rtk` prefix (exit code 2 = tool call rejected). This is not a warning — the Bash call is cancelled and you must retry with `rtk pnpm --filter ...`. The hook is safe: it only triggers on `pnpm --filter` specifically and passes through everything else.

**Other gaps — prefix manually:**
- `npx playwright@<version> test` → version tag breaks hook pattern; use `npx playwright test` (sem versão) ou `pnpm exec playwright test` (ambos são capturados)

RTK has no filter for `node`, `playwright-cli`, `pmem`, or `claude mcp` — prefixing them adds zero savings (pass-through confirmed). Do NOT prefix those.

When RTK adds native `pnpm` support the manual prefix becomes redundant but harmless (RTK guards against double-rewrite).

Refer to CLAUDE.md for full command reference.
