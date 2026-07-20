# Persistent Memory Usage

## Quick Start

```bash
<super.persistent-memory-base-dir>/scripts/pmem init
<super.persistent-memory-base-dir>/scripts/pmem sync
<super.persistent-memory-base-dir>/scripts/pmem backfill-embeddings
<super.persistent-memory-base-dir>/scripts/pmem search "investor update" --limit 8
```

## One-Time Legacy Cleanup

```bash
<super.persistent-memory-base-dir>/scripts/pmem cleanup-legacy
<super.persistent-memory-base-dir>/scripts/pmem backfill-embeddings
```

## Prune by Source

```bash
# prune all notes from a source
<super.persistent-memory-base-dir>/scripts/pmem prune --source "smoke-test"

# prune only old notes from a source
<super.persistent-memory-base-dir>/scripts/pmem prune --source "temp-import" --older-than 30

# prune only notes within a source that carry ALL of the given tags
# (used by artifact-sync to scope a prune to a single feature, avoiding a
#  destructive global prune of the whole source)
<super.persistent-memory-base-dir>/scripts/pmem prune --source "artifact-sync" --tags "login-security-lockout"
```

## Store Durable Memory

```bash
<super.persistent-memory-base-dir>/scripts/pmem add "Always convert times to CET" --tags "timezone,calendar" --source "assistant"
```

## Inspect and Verify

```bash
<super.persistent-memory-base-dir>/scripts/pmem recent --limit 10
<super.persistent-memory-base-dir>/scripts/pmem stats
```

## Re-embed After a Model Upgrade

```bash
# Detect model drift (JSON, no model load) — reembed_needed:true means act
<super.persistent-memory-base-dir>/scripts/pmem embedding-status

# Regenerate stale/missing vectors with the active model (idempotent)
<super.persistent-memory-base-dir>/scripts/pmem reembed

# Confirm convergence: reembed_needed must be false
<super.persistent-memory-base-dir>/scripts/pmem embedding-status
```

## Notes

- `search` updates `hits` and `last_seen_at` for returned rows.
- `hits` are analytics-oriented (not a direct ranking boost).
- `search` combines lexical + semantic retrieval.
- semantic backend prefers `sqlite-vec` and auto-falls back to Python cosine.
- `sync` is a database-only health check and prints embedding coverage.
- `.memory/memory.db` is the single source of truth.
- commands that load the embedding model (`search`, `add`, `backfill-embeddings`, `reembed`) print HuggingFace/loader noise — strip it: `pmem search "..." 2>/dev/null | grep -v "^semantic_backend"`.
