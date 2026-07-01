# Memory Re-Sync from Committed Artifacts

Re-sync updates local persistent memory (`.memory/memory.db`) from artifacts committed to `docs/superpowers/` by other developers.

## When This Runs

The re-sync gate activates **after preferences are loaded** and **before Triagem**, only when `session_memory_enabled = true`. It is part of the superpowers entry flow, not the onboarding wizard (new-users only).

## Decision Flow

```
ChecandoPreferencias
  → session_memory_enabled = false → Triagem (skip entirely)
  → session_memory_enabled = true:
    → [artifact sync] check dirty state
        → no changes detected → skip silently
        → changes detected → ask about re-sync
            → accepts → SincronizandoMemoria
            → declines → skip
    → [embedding drift] check stale_count (ALWAYS, independent of dirty)
        → stale_count = 0 → skip silently
        → stale_count > 0 → ask about re-embed
            → accepts → reembed
            → declines → skip
    → Triagem
```

## Deterministic Scripts

The GateResync uses three shared scripts that collapse sequential tool calls into single bash invocations, following the `read-preferences.cjs` interface: JSON to stdout, warnings to stderr, exit codes 0/1, `--repo-root` flag.

Build absolute paths from the `super.using-superpowers` base directory in your skill context header:

```
<super.using-superpowers-base-dir>/scripts/check-resync.cjs
<super.using-superpowers-base-dir>/scripts/compute-inventory.cjs
<super.using-superpowers-base-dir>/scripts/update-manifest.cjs
```

> **Where these scripts live (do not go hunting).** All three ship **with `super.using-superpowers`** in its `scripts/` directory (same as `read-preferences.cjs`/`write-preferences.cjs`). They are **not** part of `super.persistent-memory` (whose scripts are `pmem`, `memory.py`, `verify-sync.cjs`, `persist-feature-memory.cjs`, `check-pmem-deps.cjs`). Resolve `check-resync.cjs` by its base-dir path — never `find` it under `.claude`, never declare it "missing" because it is absent from `super.persistent-memory`.

---

## Step 1 — Dirty Detection (Single Tool Call)

Run the dirty-check script before asking the user anything:

```bash
node <super.using-superpowers-base-dir>/scripts/check-resync.cjs \
  --repo-root "$(git rev-parse --show-toplevel)"
```

Inspect the output fields:

| Field | Action when true/false |
|-------|------------------------|
| `repoNotFound: true` | Skip silently — not a git repo |
| `docsExists: false` | Skip silently — nothing to sync |
| `dirty: false` | Skip silently — no changes since last sync |
| `memoryExists: false` | Run `pmem init` first, then continue |
| `dirty: true` | Proceed to ask the user |

The script reads the manifest and computes the artifact content fingerprint in one call.

> **`dirty` is content-based — never reconstruct it by hand.** The script hashes the *content* of the canonical artifacts (spec/prd/qa/adrs) on disk and compares it to the manifest, feature by feature — the same hashing `compute-inventory.cjs` uses (shared `lib/artifact-hash.cjs`). It is **not** a git tree object hash and **not** a commit sha. Do not "double-check" with `git rev-parse HEAD:docs/superpowers` or `git log -1 -- docs/superpowers`: those never match the fingerprint, and the commit sha also flips on non-artifact files like `plans/`. Trust `check-resync.cjs`'s `dirty` field, nothing else.

### Manifest Schema (`.memory/resync-manifest.json`)

The `last_synced_tree_hash` field stores the **artifact content fingerprint** (`sha256:<hex>` over the canonical artifact set); `last_synced_hash_method` is `"artifact-content"`. The names keep the historical `tree_hash` spelling for backward compatibility, but the value is content-addressed; dirty detection derives from the per-feature hashes in `synced_features`, so this top-level field is informational only.

> **Research artifacts are excluded by design.** The canonical artifact set is spec/prd/qa/adrs only. Research under `docs/superpowers/<feature>/research/` (from the optional `super.deep-research` step) does **not** enter the GateResync fingerprint/inventory and is **not** added to persistent memory — its decisions already live in the synced spec/prd, so tracking it would duplicate content and churn the fingerprint on notes that never reached a decision.

```json
{
  "last_synced_at": "2026-05-20T14:30:00Z",
  "last_synced_tree_hash": "sha256:abc123...",
  "last_synced_hash_method": "artifact-content",
  "synced_features": {
    "checkin-approve-reject": {
      "spec_hash": "sha256:...",
      "prd_hash": "sha256:...",
      "qa_hash": "sha256:...",
      "adr_hash": "sha256:..."
    },
    "winston-to-pino-migration": {
      "spec_hash": "sha256:...",
      "prd_hash": null, "qa_hash": null, "adr_hash": null
    }
  }
}
```

---

## The Re-Sync Question

Ask in the configured language (`preferences.communication.language`):

**en:**
> "I detected changes in `docs/superpowers/` since the last memory sync. This may include artifacts produced by other developers. Would you like to update persistent memory based on these artifacts?"
> - **Yes** — sync memory with current artifacts
> - **No** — skip and proceed normally

---

## Embedding Model Drift (independent of artifact sync)

The artifact-sync flow (Steps 1–5) keeps memory current with **committed artifacts**. A second, orthogonal staleness exists: when the **embedding model** is upgraded (the `EMBED_MODEL` constant in `super.persistent-memory/scripts/memory.py`), every stored vector was built by the previous model. Semantic search filters by `WHERE model = ?`, so those notes silently fall out of semantic recall even though their content is unchanged and `dirty` is `false`. Lexical (FTS5) search is unaffected, so the regression is quiet — which is exactly why the gate checks for it explicitly.

**Detect (silent, no model load):**

```bash
<super.persistent-memory-base-dir>/scripts/pmem embedding-status
```

JSON fields: `current_model`, `current_count`, `stale_count` (notes on an older model), `missing_count`, `stale_models` (old model → count), `reembed_needed`. Act only when `stale_count > 0` — a genuine model drift. (`missing_count > 0` with `stale_count == 0` is the normal new-note case, already covered by the artifact-sync add/backfill path — not here.)

**The Re-Embed Question** — ask in the configured language (`preferences.communication.language`):

**pt-BR:**
> "O modelo de embeddings foi atualizado. <N> nota(s) ainda usam o modelo anterior e ficam fora da busca semântica até serem reprocessadas. Deseja reprocessar os embeddings agora?"
> - **Sim** — reprocessa os vetores com o modelo atual (nada é perdido: só os vetores são regenerados, o conteúdo das notas é preservado)
> - **Não** — pula (busca léxica continua; recall semântico fica degradado até reprocessar)

**en:**
> "The embedding model was upgraded. <N> note(s) still use the previous model and are excluded from semantic search until reprocessed. Re-embed them now?"
> - **Yes** — regenerate vectors with the current model (nothing is lost: only the vectors are rebuilt, note content is preserved)
> - **No** — skip (lexical search keeps working; semantic recall stays degraded until re-embedded)

**On accept**, run until convergence (`reembed_needed: false`):

```bash
<super.persistent-memory-base-dir>/scripts/pmem reembed
```

`reembed` regenerates missing/stale vectors in place (idempotent, one model load). `backfill-embeddings` does NOT refresh stale vectors — it only fills missing ones — so `reembed` is the model-upgrade path. Re-run if the DB exceeds one `--batch` (default 500). This check is independent of `dirty`: it runs even when no artifacts changed, and re-embedding never deletes or rewrites note content (only the vectors), so nothing is lost.

---

## Step 2 — Inventory and Diff (Single Tool Call)

After the user accepts, get the full classified inventory:

```bash
node <super.using-superpowers-base-dir>/scripts/compute-inventory.cjs \
  --repo-root "$(git rev-parse --show-toplevel)"
```

The output contains a `features` array where each entry has:
- `slug`: directory name
- `status`: `"new"` | `"changed"` | `"unchanged"` | `"deleted"`
- `artifacts.spec`, `artifacts.prd`, `artifacts.qa`, `artifacts.adrs`: per-artifact `{ path, hash, exists, readable }`

Artifact paths follow `docs/superpowers/<slug>/{specs,prd,qa,adrs}/...` (exact filenames in the Content Synthesis templates below); `adrs` uses a combined hash of all `.md` files, sorted.

---

## Step 3 — Sync (selective, per feature)

> **No global prune.** `pmem prune --source "artifact-sync"` (without `--tags`) wipes the entire artifact-sync namespace before re-adding; if the re-add fails partway, every synced feature is lost until next session — even unchanged ones. Touch only changed/deleted features; use `pmem prune --tags "<slug>"` to scope a prune to one feature.

### Skip `unchanged` features

Features classified `unchanged` already have current entries — do **not** prune or re-add them. This is the manifest-based skip: identical content is never reprocessed.

### Parallelization: Batch reads across features

Batch all `view` calls for `new` and `changed` features **in a single LLM turn** — do not wait for one feature before reading the next. Keep each feature's prune + re-add together (one agent owns one feature) so a failure stays isolated to that feature.

### For each `new` or `changed` feature

1. **Prune this feature's stale entries** (harmless no-op for `new`):
   ```bash
   pmem prune --source "artifact-sync" --tags "<feature-slug>"
   ```

2. **Read artifacts** — use the `path` from the inventory output. Skip any artifact where `readable: false` (warn in the summary), and skip `exists: false` artifacts entirely (not yet created).

3. **Synthesize and persist** — see Content Synthesis Rules below:
   ```bash
   pmem add "<synthesized content>" \
     --tags "artifact-sync,<feature-slug>,<artifact-type>" \
     --source "artifact-sync"
   ```
   > **Batch a feature's entries.** When a feature has several artifacts (spec + prd + qa + adrs), persist them in **one** `pmem add-batch` call, not several `pmem add` calls — the embedding model then loads once per feature, not per artifact. Pass `{"entries": [{content, tags, source}, ...]}` on stdin. (The per-feature `prune` above never loads the model.)

> **Failure isolation:** if a feature's re-add fails, do **not** include that slug in `syncedFeatures` (Step 4). Its manifest hash stays stale, so the next session re-detects it as `changed` and retries — only that one feature was ever affected.

### For each `deleted` feature

The feature directory was removed since the last sync. Prune its stale entries (no `pmem add` — it no longer exists):

```bash
pmem prune --source "artifact-sync" --tags "<feature-slug>"
```

---

## Step 4 — Update Manifest (Single Tool Call)

After all pmem operations complete, write the updated manifest in one call. Pass `treeHash` and `hashMethod` from the compute-inventory output, plus only the synced (new/changed) features and any deleted slugs:

```bash
node <super.using-superpowers-base-dir>/scripts/update-manifest.cjs \
  --repo-root "$(git rev-parse --show-toplevel)" << 'EOF'
{
  "treeHash": "<from compute-inventory output: treeHash>",
  "hashMethod": "<from compute-inventory output: hashMethod>",
  "syncedFeatures": {
    "<new-or-changed-slug>": {
      "spec_hash": "<from compute-inventory output: features[].artifacts.spec.hash>",
      "prd_hash":  "<from compute-inventory output: features[].artifacts.prd.hash>",
      "qa_hash":   "<from compute-inventory output: features[].artifacts.qa.hash>",
      "adr_hash":  "<from compute-inventory output: features[].artifacts.adrs.hash>"
    }
  },
  "deletedSlugs": ["<deleted-slug-1>", "<deleted-slug-2>"]
}
EOF
```

The script merges the update into the existing manifest, preserving unchanged features (no need to include them in `syncedFeatures`).

---

## Step 5 — Verify the Sync (audit, optional but recommended)

Close the loop: confirm the manifest and the database agree, so a silently-failed `pmem add` doesn't leave a feature marked synced but absent from memory (which the next session would wrongly skip).

```bash
node <super.persistent-memory-base-dir>/scripts/verify-sync.cjs \
  --repo-root "$(git rev-parse --show-toplevel)"
```

| Output | Meaning | Action |
|--------|---------|--------|
| `allPresent: true` (exit 0) | Every manifest slug has entries in the DB | Sync verified — done |
| `missing: [...]` (exit 2) | A manifest slug has no sync-namespace entries (drift) | Re-run the per-feature sync for those slugs, or omit them from the manifest |
| `verifiable: false` (exit 0) | Could not read the DB (e.g. `node:sqlite` unavailable on this runtime) | Non-blocking — skip the audit on this runtime |

Read-only; never mutates memory; degrades gracefully without `node:sqlite`.

---

## Content Synthesis Rules

When creating memory entries from artifacts, synthesize — don't dump raw content:

**From a spec (`*-design.md`):**
```
Feature: <feature-slug>. Architecture: <key decisions summary>. Stack: <technologies>. Constraints: <main constraints>. Patterns: <design patterns used>. Artifact: docs/superpowers/<slug>/specs/<slug>-design.md
```

**From a PRD (`prd-*.md`):**
```
Feature: <feature-slug>. Objective: <one-line goal>. User stories: <count> stories covering <main areas>. Requirements: FR-001 through FR-NNN. Out of scope: <excluded items>. Artifact: docs/superpowers/<slug>/prd/prd-<slug>.md
```

**From a QA report (`qa-report-*.md`):**
```
Feature: <feature-slug>. QA status: <PASSED|PARTIAL|FAILED>. Stories verified: <N>/<total>. Known issues: <summary or "none">. Artifact: docs/superpowers/<slug>/qa/qa-report-<slug>.md
```

**From ADR files (`adrs/*.md`):**
```
Feature: <feature-slug>. Architecture decisions: <count> ADRs. <ADR-001 title>: <one-line decision>. <ADR-002 title>: <one-line decision>. [...] Artifact: docs/superpowers/<slug>/adrs/
```

---

## Deduplication Guarantees

1. **Source-based isolation:** resync entries use `source="artifact-sync"`, planning entries `source="assistant"` — they never conflict.
2. **Content hash:** `pmem add` deduplicates by `content_hash` (SHA-256 of normalized content); identical entries are silently skipped.
3. **Prune-before-add + manifest skip:** per-feature pruning (`--tags "<slug>"`) prevents accumulation, and unchanged features are never pruned or re-processed (see Step 3).

---

## Graceful Degradation

The scripts handle all failure cases and surface them via the JSON output:

| Failure | Script behavior | LLM action |
|---------|----------------|------------|
| `check-resync.cjs` "seems missing" (a `find`/search didn't locate it) | Not a script output — you searched the wrong place | **Not a valid skip.** Ships in `super.using-superpowers/scripts/` — resolve by base-dir path and run. Only a runtime error from the *resolved* script is a failure (then warn once, skip sync, proceed) |
| `pmem` not installed or unavailable | `check-pmem-deps.cjs` (in `super.persistent-memory/scripts/`): `fullyAvailable: false` + `missing[]` + `installCommand` | Run the **Availability Gate (Ask-to-Install)** from `super.persistent-memory/SKILL.md`. If declined or install fails: warn once, skip sync, proceed |
| `.memory/` missing / `docs/superpowers/` missing / not a git repo | `check-resync`: `memoryExists: false` / `docsExists: false` / `repoNotFound: true` | `pmem init` if `memoryExists: false`, else skip silently (see Step 1 table) |
| Git not available | No effect — dirty detection reads artifact files directly (`hashMethod: "artifact-content"`), not git | No action needed |
| Individual artifact unreadable | `compute-inventory`: artifact `readable: false` + entry in `errors[]` | Skip that artifact, warn in summary |
| All artifacts for a feature unreadable | Feature still listed with error artifacts | Skip feature, warn in summary |
| Sync interrupted mid-way | Per-feature prune isolates failures — only the in-flight feature is affected | Omit failed slugs from the manifest; next session re-processes only those |
| Manifest corrupt/unparseable | Script warns to stderr, treats as missing → `dirty: true` | Re-sync proceeds cleanly |
| Feature removed from filesystem | `compute-inventory`: `status: "deleted"` | Prune pmem entries, include in `deletedSlugs` |

---

## Summary Report

After sync completes, report to the user:

**pt-BR:**
> "✅ Memória sincronizada: **X** features atualizadas, **Y** novas entries adicionadas, **Z** entries substituídas."

**en:**
> "✅ Memory synced: **X** features updated, **Y** new entries added, **Z** entries replaced."

Include a note for any artifacts that were skipped due to read errors.

---

## Session Variables

| Variable | Initial | Description |
|----------|---------|-------------|
| `session_resync_completed` | `false` | Whether re-sync was performed or skipped this session |

This variable is a **within-session cache only** — it prevents re-asking if the user returns to triage, not a correctness mechanism (`check-resync.cjs` is the cheap, idempotent source of truth). After a compaction, do not trust a restored value — re-run `check-resync.cjs` (its `dirty` field decides). A spurious re-run costs one prompt; trusting a stale `true` would skip a needed sync.
