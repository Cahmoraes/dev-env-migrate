# Memory Re-Sync from Committed Artifacts

Re-sync updates local persistent memory (`.memory/memory.db`) from artifacts committed to `docs/superpowers/` by other developers.

## When This Runs

Two moments, one algorithm, different scopes — both gated by `session_memory_enabled = true`:

| Gate | When | Scope | Consent |
|---|---|---|---|
| **Entry gate** (this document, Steps 1–5) | after preferences are loaded, **before Triagem** | every dirty feature in the repo | **asks** — the changes may be artifacts other developers committed |
| **End-of-flow gate** (see "End-of-Flow Re-Sync" below) | `super.finishing-a-development-branch`, after the integration option executed | **only the feature just finished** | **automatic** — the user's own feature, and `memory.persistent_memory` is already the consent |

The entry gate is part of the superpowers entry flow, not the onboarding wizard (new-users only). The end-of-flow gate exists so a finished feature reaches memory **in the session that produced it**, instead of every feature waiting for the next session that happens to open the repo.

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
| `dirty: false` | Skip the artifact re-sync — no changes since last sync (still run the **Embedding Model Drift** check below; it is independent of `dirty`) |
| `memoryExists: false` | Run `pmem init` first, then continue |
| `dirty: true` | Proceed to ask the user |
| `driftedSlugs: [ … ]` | Manifest slugs with NO note in `memory.db` — **presence drift**. `dirty` is already forced `true` for you; these slugs are re-synced like changed features |

The script reads the manifest and computes the artifact content fingerprint in one call.

> **`dirty` is content-based — never reconstruct it by hand.** The script hashes the *content* of the canonical artifacts (spec/prd/qa/iv/adrs) on disk and compares it to the manifest, feature by feature — the same hashing `compute-inventory.cjs` uses (shared `lib/artifact-hash.cjs`). It is **not** a git tree object hash and **not** a commit sha. Do not "double-check" with `git rev-parse HEAD:docs/superpowers` or `git log -1 -- docs/superpowers`: those never match the fingerprint, and the commit sha also flips on non-artifact files like `plans/`. Trust `check-resync.cjs`'s `dirty` field, nothing else.

> **Presence drift — the third staleness axis (content-independent).** Content dirty only knows what the manifest records; it never consults the DB. So a feature marked synced but with **no note in `memory.db`** (a silently-failed `pmem add`, a manifest seeded ahead of the inserts, a restored/pruned DB) hashes as unchanged and would stay invisible forever. To close that hole, `check-resync.cjs` also queries the DB read-only (shared `lib/db-presence.cjs`) and reports any absent manifest slug in `driftedSlugs`, forcing `dirty: true`; `compute-inventory.cjs` then reclassifies those slugs from `unchanged` to `changed` (field `dbPresent:false`) so Step 3 re-adds them. This is what makes the historical phantom-sync gap **self-healing**: the next session detects and repairs it through the normal flow. Both scripts degrade gracefully — when the DB can't be read, `driftedSlugs`/`dbPresent` are `null` and behaviour is exactly the prior content-only one. The parser tolerates legacy `feature:<slug>,type:<type>` tags, so old notes count as present.

### Manifest Schema (`.memory/resync-manifest.json`)

The `last_synced_tree_hash` field stores the **artifact content fingerprint** (`sha256:<hex>` over the canonical artifact set); `last_synced_hash_method` is `"artifact-content"`. The names keep the historical `tree_hash` spelling for backward compatibility, but the value is content-addressed; dirty detection derives from the per-feature hashes in `synced_features`, so this top-level field is informational only.

> **Research artifacts are excluded by design.** The canonical artifact set is spec/prd/qa/iv/adrs only. Research under `docs/superpowers/<feature>/research/` (from the optional `super.deep-research` step) does **not** enter the GateResync fingerprint/inventory and is **not** added to persistent memory — its decisions already live in the synced spec/prd, so tracking it would duplicate content and churn the fingerprint on notes that never reached a decision.

```json
{
  "last_synced_at": "2026-05-20T14:30:00Z",
  "last_synced_tree_hash": "sha256:abc123...",
  "last_synced_hash_method": "artifact-content",
  "synced_features": {
    "ticket-triage-actions": {
      "spec_hash": "sha256:...",
      "prd_hash": "sha256:...",
      "qa_hash": "sha256:...",
      "iv_hash": "sha256:...",
      "adr_hash": "sha256:..."
    },
    "logger-library-swap": {
      "spec_hash": "sha256:...",
      "iv_hash": "sha256:...",
      "prd_hash": null, "qa_hash": null, "adr_hash": null
    }
  }
}
```

---

## The Re-Sync Question

Ask it rendered in the configured language (`preferences.communication.language`) — the wording below is the content, not the output language:

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

**The Re-Embed Question** — the wording below is the canonical content; render it in the configured language (`preferences.communication.language`), never in the language it is written in here:

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
- `artifacts.spec`, `artifacts.prd`, `artifacts.qa`, `artifacts.iv`, `artifacts.adrs`: per-artifact `{ path, hash, exists, readable }`

Artifact paths follow `docs/superpowers/<slug>/{specs,prd,qa,adrs}/...` (exact filenames in the Content Synthesis templates below); `adrs` uses a combined hash of all `.md` files, sorted.

`qa` and `iv` both live under `qa/` and are **not** the same artifact. `qa` is the user-story report, which only exists when a PRD does. `iv` is the always-on verification report — the one `super.finishing-a-development-branch` requires a PASS in before merging — so for a spec-only feature it is the sole record that the work was ever finished. A feature whose `iv` is present and whose `qa` is absent is a normally delivered PRD-less feature, not an abandoned one.

---

## Step 3 — Sync (selective, per feature)

> **No global prune.** `pmem prune --source "artifact-sync"` (without `--tags`) wipes the entire artifact-sync namespace before re-adding; if the re-add fails partway, every synced feature is lost until next session — even unchanged ones. Touch only changed/deleted features; use `pmem prune --tags "<slug>"` to scope a prune to one feature.

### Skip `unchanged` features

Features classified `unchanged` already have current entries — do **not** prune or re-add them. This is the manifest-based skip: identical content is never reprocessed.

### Ingestion runs in parallel subagents — the orchestrator never reads artifacts

**The artifact bytes are the token cost.** A feature's spec/prd/qa/iv/adrs can be many KB each; reading and synthesizing them **inline in the orchestrator** pushes all that raw content into the main thread's context — exactly the ingestion-into-the-controller cost the pipeline avoids everywhere else (reviewers, exploration, research all run read-only off the main thread). So the orchestrator **must not read or synthesize artifacts itself.** Instead it dispatches **one sync-worker subagent per `new`/`changed` feature, all in a single turn** (they run in parallel). Each subagent reads only *its* feature, synthesizes, writes that feature's `pmem` entries, and returns a **compact receipt** — the raw artifact content stays in the subagent's context and never enters the orchestrator, regardless of how many features are dirty.

**Safe to parallelize.** `pmem` opens the DB in **WAL mode with a 30s busy timeout** (`memory.py`: `journal_mode=WAL`, `connect(timeout=30)`), so concurrent per-feature writes serialize on the SQLite write lock without `SQLITE_BUSY`, while the expensive part — the embedding-model load (torch, ~6–7s) — runs concurrently across subagents. Wall-clock drops and the orchestrator's context stays flat.

**Subagent toolset = file reading, searching and the shell, nothing else** (no editing, writing or dispatching) — name capabilities, not tool names: a search tool named in prose but absent from the harness costs a discovery call that returns nothing, and the shell (`rg`/`grep`/`find`) covers searching everywhere and costs no tool discovery: it reads files and drives the `pmem` CLI, nothing else — the same read-only economy as the review/exploration subagents. One agent owns one feature, so a failure stays isolated to that feature. (Platform tool-name mapping — `references/<platform>-tools.md`.)

**Dispatch prompt — one subagent per `new`/`changed` feature, emitted together in a single turn.** Fill the `<...>` paths from the `compute-inventory` output (do **not** paste artifact contents into the prompt — pass paths, the subagent reads them):

> You are a memory-sync worker for the feature `<feature-slug>`. Work only inside this feature. Do exactly this, then stop:
> 1. Prune stale entries (harmless no-op for a new feature): `pmem prune --source "artifact-sync" --tags "<feature-slug>"`
> 2. Read these artifacts using the given paths; skip any marked `readable:false` (note it), skip `exists:false` entirely: spec `<spec.path>`, prd `<prd.path>`, qa `<qa.path>`, iv `<iv.path>`, adrs `<adrs.path>`.
> 3. Synthesize each artifact per the Content Synthesis Rules below — **synthesize, never dump raw content** — and persist them all in **one** `pmem add-batch` call (one embedding-model load per feature, not per artifact): `{"entries":[{"content":"…","tags":"artifact-sync,<feature-slug>,<artifact-type>","source":"artifact-sync"}, …]}` on stdin.
> 4. Return **only** this JSON receipt, no artifact text: `{"slug":"<feature-slug>","ok":true|false,"entriesAdded":<N>,"skipped":["<artifact-type>:<reason>"],"error":"<message if ok:false>"}`
>
> [inline the Content Synthesis Rules block here so the subagent needs no follow-up reads]

**Await the receipts — never poll for them.** After emitting all the dispatches in one turn, just wait: the harness runs the workers in the background and re-invokes you with each receipt when it finishes. Do **not** `sleep`, and do **not** schedule a wakeup/timer to "check on" workers you just launched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically), and a malformed poll call can error out mid-sync. Only move on to collecting receipts once the workers have actually returned.

**Collect the receipts (orchestrator).** Only features whose receipt has `ok:true` go into `syncedFeatures` (Step 4). A receipt with `ok:false`, or a subagent that errored, leaves that slug's manifest hash stale — the next session re-detects it as `changed` and retries; only that one feature is affected. The write-side guard in `update-manifest.cjs` is the backstop: it refuses to record any slug the DB holds no note for, so even a lying `ok:true` receipt cannot mint a phantom sync.

### For each `deleted` feature (orchestrator, no subagent)

A `deleted` feature has no artifact to read, so there is nothing to ingest and no token cost — the orchestrator prunes it inline rather than dispatching a subagent to read nothing. The feature directory was removed since the last sync. Prune its stale entries (no `pmem add` — it no longer exists):

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

## Step 5 — Verify the Sync (audit — REQUIRED, not optional)

Close the loop: confirm the manifest and the database agree, so a silently-failed `pmem add` doesn't leave a feature marked synced but absent from memory (which the next session would wrongly skip). **Always run this after Step 4** — skipping it is exactly how the historical drift accumulated (dozens of features marked synced with no note in the DB).

```bash
node <super.persistent-memory-base-dir>/scripts/verify-sync.cjs \
  --repo-root "$(git rev-parse --show-toplevel)"
```

| Output | Meaning | Action |
|--------|---------|--------|
| `allPresent: true` (exit 0) | Every manifest slug has entries in the DB | Sync verified — done |
| `missing: [...]` (exit 2) | A manifest slug has no sync-namespace entries (drift) | Re-run the per-feature sync for those slugs, or omit them from the manifest |
| `verifiable: false` (exit 0) | Could not read the DB (e.g. `node:sqlite` unavailable on this runtime) | Non-blocking — skip the audit on this runtime |

Read-only; never mutates memory; degrades gracefully without `node:sqlite`. Recognizes both the current (`artifact-sync,<slug>,<type>`) and legacy (`feature:<slug>,type:<type>`) tag conventions, so an old-format note is never mis-reported as missing.

> **This audit is now enforced in code, not just prose — Step 5 is the human-readable view of two deterministic guards:**
> - **Write-side (`update-manifest.cjs`):** a slug is refused (`rejected[]` + a stderr warning) unless the DB already holds a note for it, so a phantom sync can no longer be minted in the first place. Field `validated:false` means the DB was unreadable and the check was skipped.
> - **Read-side (`check-resync.cjs` / `compute-inventory.cjs`):** presence drift is a third staleness axis (see below). Even if a phantom slips in, the next session detects it and heals it through the normal ask→sync flow.
> Both degrade gracefully when the DB can't be read — presence is additive signal, never a blocker.

---

## End-of-Flow Re-Sync (feature-scoped, automatic)

Owner: `super.finishing-a-development-branch`, **Step 8** — after the user's integration choice has been executed, so the feature is final (implementation, independent verification and, when the QA gate is enabled, the QA report). Everything below reuses the entry gate's machinery; only the scope and the consent model differ.

### Preconditions (all four, or skip silently)

1. `session_memory_enabled = true`. On direct entry into finishing the variable may never have been derived — get it from the SSOT rather than guessing: `derive-session-state.cjs --platform <platform> --repo-root <main repo root>` → `sessionState.session_memory_enabled`.
2. A feature tree exists (`docs/superpowers/<feature>/`). A standalone debug or ad-hoc branch has no feature to ingest — same exemption the independent-verification precondition uses.
3. The chosen option **kept** the work. **Discard skips this gate**: memory must not hold the spec/PRD/QA of work the user just threw away. Nothing is pruned either — the discard covers the branch, not memory the user may have synced earlier on purpose.
4. `pmem` is available (`check-pmem-deps.cjs`). If not, warn once and skip — never block finishing, and never run the Ask-to-Install prompt here: the user is at the end of a task, not starting memory setup.

### Root: the main repo, never a worktree

`.memory/` lives in the main working tree and is not checked in, so a git worktree does not have one. Resolve the root once and pass it explicitly:

```bash
MEMORY_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
```

For a normal repo this is the tree you are already in. After a local merge (Option 1) the artifacts are merged into it, which is exactly the state to ingest. When finishing ran from a worktree whose branch was **not** merged (Options 2 and 3), the feature's artifacts are not visible from `MEMORY_ROOT` — the inventory reports no feature and this gate does nothing, which is correct: the entry gate picks it up in the session where the branch is integrated. That deferred path is still the fallback for everything this gate skips, and it stays as it is.

### Step A — Scoped inventory (single tool call)

```bash
node <super.using-superpowers-base-dir>/scripts/compute-inventory.cjs \
  --repo-root "$MEMORY_ROOT" --feature <feature-slug>
```

`--feature` narrows the **report**, not the computation: classification, presence drift and the whole-repo `treeHash` are identical to an unfiltered run, so the manifest this gate writes is the one the entry gate expects next session. It also keeps every other feature's artifact entry out of the controller's context.

| `features[0].status` | Action |
|---|---|
| `features: []` (slug not on disk and not in the manifest) | Nothing to sync — say nothing |
| `unchanged` | Already in memory at this exact content — say nothing |
| `deleted` | Skip. **This gate never prunes**: a slug missing from `MEMORY_ROOT` here usually means "on another branch", not "gone". Deletion is the entry gate's call, where the whole repo is in view |
| `new` \| `changed` | Sync it — Step B |

### Step B — Sync exactly one feature

Same procedure as the entry gate, with the feature list fixed at one:

1. **Dispatch one sync-worker subagent** for the slug — the dispatch prompt in "Step 3 — Sync (selective, per feature)" verbatim, including the inlined Content Synthesis Rules. The orchestrator does **not** read spec/prd/qa/iv/adrs: at the end of a long session, pulling a feature's artifacts into the controller is the most expensive moment in the whole run to do it.
2. On `ok:true`, update the manifest with **only this slug** (Step 4), passing `treeHash`/`hashMethod` from Step A. Omit `deletedSlugs` entirely.
3. Run the verify audit (Step 5, `verify-sync.cjs`) — required here for the same reason it is required there.

### Non-blocking by construction

The integration already happened. A failure in this gate — bad receipt, unwritable manifest, missing `node:sqlite` — is reported in one line and nothing is rolled back or retried in-session: the manifest simply keeps the stale hash for that slug, and the next entry gate re-detects it as `changed`. Report it rendered in the configured language:

> "🧠 Memory synced with the final state of `<feature-slug>`." — or, on failure: "🧠 Could not sync `<feature-slug>` to memory (<reason>). The next session's entry gate will detect it."

Silence is the correct output when there was nothing to sync — a "nothing to do" line at the end of every finished feature is noise the user did not ask for.

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

**From an independent-verification report (`validation-*.md`):**
```
Feature: <feature-slug>. Verification: <PASS|PASS (degraded)|FAIL> on <YYYY-MM-DD>. Acceptance criteria: <N>/<total> covered with evidence. Discrimination sensor: <killed>/<total> mutants killed. Diff range: <base>..<head>. Gaps: <summary or "none">. Artifact: docs/superpowers/<slug>/qa/validation-<slug>.md
```
Keep the verdict and the date verbatim from the report's header and `## Verdict` section — this entry is what tells a later session the feature reached the verification gate rather than stalling at its spec, and for a PRD-less feature it is the only entry that carries that signal.

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

After sync completes, report to the user — rendered in the configured language:

> "✅ Memory synced: **X** features updated, **Y** new entries added, **Z** entries replaced."

Include a note for any artifacts that were skipped due to read errors.

---

## Session Variables

| Variable | Initial | Description |
|----------|---------|-------------|
| `session_resync_completed` | `false` | Whether re-sync was performed or skipped this session |

This variable is a **within-session cache only** — it prevents re-asking if the user returns to triage, not a correctness mechanism (`check-resync.cjs` is the cheap, idempotent source of truth). After a compaction, do not trust a restored value — re-run `check-resync.cjs` (its `dirty` field decides). A spurious re-run costs one prompt; trusting a stale `true` would skip a needed sync.

It belongs to the **entry gate only**. The end-of-flow gate neither reads nor sets it: it runs once per finished feature, at a point the entry gate has long passed, and its own idempotency comes from the same place — a feature it already synced classifies `unchanged` on the next call.
