---
name: super.persistent-memory
description: ALWAYS USE THIS SKILL when handling persistent memory in this workspace, including task-start memory recall, explicit "remember" instructions, storing durable preferences/facts, and retrieving prior context. This skill owns the local memory workflow and CLI for init/sync/search/add/recent/stats.
---

# Persistent Memory

Single memory system for this repository.

## Commands

Use either command style:
- `python3 [.agents/.claude/.github]/skills/super.persistent-memory/scripts/memory.py <command>`
- `[.agents/.claude/.github]/skills/super.persistent-memory/scripts/pmem <command>`

Supported commands:
- `init`
- `sync` (database-only health check)
- `cleanup-legacy`
- `backfill-embeddings --batch 500`
- `prune --source "<label>" [--older-than <days>]`
- `search "<query>" --limit 8`
- `add "<memory text>" --tags "<comma,tags>" --source "assistant" [--no-embed]`
- `add-batch [--no-embed]` — add many notes in ONE process (JSON via stdin/`--input-file`, JSON out). Loads the embedding model once per batch, not per note — prefer when persisting 2+ entries.
- `recent --limit 10`
- `stats`

> **Performance — the model import is the cost, not SQLite.** Loading `sentence-transformers` (torch) takes ~6-7s per process. So: (1) non-embedding commands (`init`, `prune`, `recent`, `stats`, `cleanup-legacy`, `add --no-embed`) never import it (~0.2s); (2) `add-batch` pays it once, not N times; (3) `--no-embed` inserts immediately, deferring vectors to a single `backfill-embeddings` load (semantic search omits the note until then). Use `--no-embed` + backfill when latency beats instant semantic recall.

## Helper Scripts (deterministic)

Three Node helpers wrap `pmem` for the superpowers flow; all emit JSON + deterministic exit codes:

- `scripts/check-pmem-deps.cjs [--python <bin>]` — probe whether pmem can run (deps listed in the Availability Gate below) without importing the heavy modules. Emits `fullyAvailable`, `missing[]`, `installCommand`. Used by the gate.
- `scripts/persist-feature-memory.cjs --input-file <entries.json>` — write a feature's planning entries atomically/idempotently (one `add-batch`, model loaded once; classifies added/skipped/failed; exit 2 on any failure; falls back to per-entry `add` on older pmem). Used at the `super.writing-plans` Planejando exit. See `super.writing-plans/references/memory-persistence.md`.
- `scripts/verify-sync.cjs --repo-root <path>` — read-only audit that the re-sync manifest and DB agree (exit 2 on drift; degrades gracefully without `node:sqlite`). Used after the re-sync algorithm. See `super.using-superpowers/references/memory-resync.md`.

## Availability Gate (Ask-to-Install)

pmem is a local CLI (`python3` + `memory.py`), **not guaranteed on every machine**: it needs `python3` + `numpy` (else no command runs) plus `sentence-transformers` (for embeddings — `add`, `search`, `backfill-embeddings`); `sqlite-vec` is optional and never blocks anything.

**When:** before the **first** pmem command of a session — whatever triggers it first (re-sync gate, brainstorming-entry recall, planning-exit persistence, an explicit "remember" request).

**Procedure:**

1. Run the probe (no heavy imports):
   ```bash
   node <super.persistent-memory-base-dir>/scripts/check-pmem-deps.cjs
   ```

2. **If `fullyAvailable: true`:** set `session_pmem_available = true` and proceed. Do not re-probe this session.

3. **If `fullyAvailable: false`:** ask the user **once per session**, in the configured language:

   - **pt-BR:**
     > O **pmem** não está disponível nesta máquina. Faltando: `<missing>`.
     > Deseja instalar agora?
     > - **Sim** — executo `<installCommand>` e prossigo
     > - **Não** — sigo sem memória persistente nesta sessão

   - **en:**
     > **pmem** is not available on this machine. Missing: `<missing>`.
     > Do you want to install it now?
     > - **Yes** — I run `<installCommand>` and proceed
     > - **No** — I continue without persistent memory this session

4. **On accept:** run the probe's `installCommand`, then re-run the probe. If `fullyAvailable` is now `true`, set `session_pmem_available = true` and proceed with the original operation. Otherwise report the error, set `session_pmem_available = false`, and degrade gracefully.

5. **On decline:** set `session_pmem_available = false`. Do not ask again this session.

**Special cases:**

- **`installCommand: null` with `missing: ["python3"]`** — Python 3 is missing; pip cannot fix that. Tell the user to install it via the system package manager (message in the probe's `notes`), do **not** install it yourself; treat the session as `session_pmem_available = false`.
- **`notes` mentions sqlite-vec** — informational only; never ask. Semantic search uses the slower Python cosine fallback.

**Graceful degradation (`session_pmem_available = false`):** every memory operation follows the calling skill's degradation path — re-sync gate skips silently (`super.using-superpowers/references/memory-resync.md`), recall continues without context (`super.brainstorming`), persistence is skipped (`super.writing-plans/references/memory-persistence.md`). Never block the user's task.

**Session state:** `session_pmem_available` is session-only (never written to `.superpowers/preferences.yml`). After a compaction, if it is absent from the summary, just re-run the probe (cheap, idempotent); only re-ask the install question if the probe still reports `fullyAvailable: false` and there is no prior decline.

## Required Workflow

- Fresh workspace: `pmem init`
- Start of substantial tasks: `pmem sync`, then `pmem search "<topic keywords>" --limit 8`
- On `remember` or a learned durable preference/fact: `pmem add "<memory text>" --tags "<tags>" --source "assistant"`
- Before finalizing memory-sensitive work: `pmem stats`

## One-Time Migration (upgrading from older setup)

- Remove legacy imported rows: `pmem cleanup-legacy`
- Generate vectors for existing notes: `pmem backfill-embeddings`

## Storage Rules

- Store durable preferences, long-lived facts, stable workflows, and repeated constraints; not noisy one-off details unless requested.
- Keep entries concise and specific.
- Prefer tags that improve retrieval (`preferences`, `calendar`, `comms`, `product`).

## Retrieval Rules

- Use targeted queries, not broad terms; keep default `--limit` low unless deeper recall is needed.
- `search` reinforces recalled entries (updates `hits`, `last_seen_at`); `hits` are analytics-only, not a ranking boost.
- Hybrid retrieval (lexical + semantic); semantic tries `sqlite-vec` first, auto-falls back to Python cosine.

## Bootstrapping and Recovery

- If pmem cannot run, follow the **Availability Gate (Ask-to-Install)** above — never skip silently without offering the install.
- If `.memory/` is missing, run `pmem init`.
- `pmem sync` is a lightweight database-only check (no markdown import/export).
- If semantic mode degrades, run `pmem stats` to inspect `semantic_backend` and `embedding_coverage`.
- For command examples and quick troubleshooting, read `references/usage.md`.
