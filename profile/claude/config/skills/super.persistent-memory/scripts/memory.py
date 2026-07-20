#!/usr/bin/env python3
"""Lightweight persistent memory CLI for this workspace.

The system uses a local SQLite database (`.memory/memory.db`) as the single
source of truth. Search uses lexical retrieval plus semantic retrieval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np

try:
    import sqlite_vec  # type: ignore
except Exception:
    sqlite_vec = None

# NOTE: `sentence_transformers` (which pulls in torch, ~6-7s to import) is loaded
# LAZILY inside _load_embedder(), not at module top level. This keeps commands
# that never embed — init, prune, recent, stats, cleanup-legacy, and `add
# --no-embed` / `add-batch --no-embed` — fast (no torch import). Only commands
# that actually compute a vector (search, add, add-batch, backfill) pay the cost.


def _detect_workspace_root() -> Path:
    """Find the workspace root by walking upward from the current working directory.

    Resolution order:
      1. PMEM_ROOT environment variable (explicit override)
      2. Walk cwd upward looking for .git or AGENTS.md
      3. Fall back to cwd itself

    Using cwd (not __file__) ensures the database is always created in the
    project the agent is currently operating on, regardless of where the
    skill scripts are installed.
    """
    import os

    override = os.environ.get("PMEM_ROOT")
    if override:
        return Path(override).resolve()

    cwd = Path.cwd().resolve()
    for parent in [cwd] + list(cwd.parents):
        if (parent / ".git").exists() or (parent / "AGENTS.md").exists():
            return parent
    return cwd


ROOT = _detect_workspace_root()
DB_PATH = ROOT / ".memory" / "memory.db"
# Embeddings are tagged with this model name in `memory_embeddings.model` and
# searched via `WHERE model = ?`. INVARIANT: if a future swap changes the vector
# DIMENSION, it MUST also change this string — same model string with a different
# dim would let mixed-dim rows reach `vec_distance_cosine`/`np.dot` and break.
# Changing the model leaves existing vectors "stale"; `reembed` refreshes them.
# `all-mpnet-base-v2` is 768-d (prior `all-MiniLM-L6-v2` was 384-d).
EMBED_MODEL = "sentence-transformers/all-mpnet-base-v2"

WEIGHT_LEXICAL = 0.70
WEIGHT_SEMANTIC = 0.30
WEIGHT_RECENCY = 0.20
WEIGHT_TAG = 0.10

_EMBEDDER: Any = None
_SQLITE_VEC_STATUS: str | None = None
_SEMANTIC_BACKEND_NOTICE_SHOWN = False


def utc_now() -> str:
    """Return the current UTC timestamp in a compact ISO format."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect() -> sqlite3.Connection:
    """Open the SQLite database connection.

    timeout=30 causes Python's sqlite3 to retry acquiring the write lock for
    up to 30 seconds before raising OperationalError. This is essential when
    multiple background agents write to the same database concurrently (e.g.,
    parallel pmem add batches during artifact-sync).

    WAL (Write-Ahead Logging) mode further reduces contention: readers never
    block writers and writers never block readers. Combined with the timeout,
    concurrent writers simply queue instead of failing immediately.

    synchronous=NORMAL defers the fsync from every commit to the next WAL
    checkpoint. Since add_note() commits once per note, this makes batch writes
    (resync, parallel pmem add) ~10x faster and recall writes ~3x faster.
    It remains corruption-safe in WAL mode; the only residual risk is losing the
    last uncheckpointed transactions on a full OS crash / power loss (not on an
    application crash), which is acceptable for memory regenerable via artifact-sync.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    """Return True when a SQLite table or virtual table exists."""
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table','view')",
        (name,),
    ).fetchone()
    return row is not None


def _init_sqlite_vec(conn: sqlite3.Connection) -> bool:
    """Attempt to initialize sqlite-vec and return availability."""
    global _SQLITE_VEC_STATUS
    if _SQLITE_VEC_STATUS is not None:
        return _SQLITE_VEC_STATUS == "sqlite-vec"

    if sqlite_vec is None:
        _SQLITE_VEC_STATUS = "python-cosine-fallback"
        return False
    try:
        sqlite_vec.load(conn)
        _SQLITE_VEC_STATUS = "sqlite-vec"
        return True
    except Exception:
        _SQLITE_VEC_STATUS = "python-cosine-fallback"
        return False


def semantic_backend(conn: sqlite3.Connection) -> str:
    """Return active semantic backend label."""
    _init_sqlite_vec(conn)
    return _SQLITE_VEC_STATUS or "python-cosine-fallback"


def init_db(conn: sqlite3.Connection) -> bool:
    """Create schema and return whether FTS5 indexing is available."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL UNIQUE,
            hits INTEGER NOT NULL DEFAULT 0,
            last_seen_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_embeddings (
            note_id INTEGER PRIMARY KEY,
            model TEXT NOT NULL,
            dim INTEGER NOT NULL,
            embedding BLOB NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes(created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS notes_last_seen_at_idx ON notes(last_seen_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS memory_embeddings_updated_at_idx ON memory_embeddings(updated_at DESC)"
    )

    # Whether the FTS index already existed BEFORE this call — decides if the
    # one-time rebuild below is needed (see the rebuild guard).
    fts_existed = _table_exists(conn, "notes_fts")

    fts_available = True
    try:
        conn.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
            USING fts5(
                content,
                tags,
                source,
                content='notes',
                content_rowid='id',
                tokenize='porter unicode61'
            )
            """
        )
    except sqlite3.OperationalError:
        fts_available = False

    if fts_available:
        conn.executescript(
            """
            CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, content, tags, source)
                VALUES (new.id, new.content, new.tags, new.source);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, content, tags, source)
                VALUES ('delete', old.id, old.content, old.tags, old.source);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, content, tags, source)
                VALUES ('delete', old.id, old.content, old.tags, old.source);
                INSERT INTO notes_fts(rowid, content, tags, source)
                VALUES (new.id, new.content, new.tags, new.source);
            END;
            """
        )
        # Rebuild the FTS index ONLY when the virtual table was just created
        # (first init, or migrating a DB that had notes before FTS existed). On
        # every later call the notes_ai/ad/au triggers keep FTS in sync, so a
        # rebuild would be a pointless full-index write — and a write lock — on
        # every command, including read-only ones (search/stats/embedding-status)
        # the re-sync gate runs each session.
        if not fts_existed and _table_exists(conn, "notes_fts"):
            conn.execute("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')")

    conn.commit()
    return fts_available


def _normalize_tags(tags: str) -> str:
    """Normalize tags into a deduplicated comma-separated string."""
    parts = [p.strip().lower() for p in tags.split(",") if p.strip()]
    seen: set[str] = set()
    ordered: list[str] = []
    for part in parts:
        if part not in seen:
            seen.add(part)
            ordered.append(part)
    return ",".join(ordered)


def _content_hash(content: str) -> str:
    """Compute a stable hash for note deduplication."""
    normalized = " ".join(content.strip().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _load_embedder() -> Any:
    """Load and cache the sentence transformer model (lazy, heavy import)."""
    global _EMBEDDER
    if _EMBEDDER is not None:
        return _EMBEDDER
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except Exception as exc:  # not installed / broken install
        raise RuntimeError(
            "sentence-transformers is not installed. Install with: pip install sentence-transformers"
        ) from exc
    _EMBEDDER = SentenceTransformer(EMBED_MODEL)
    return _EMBEDDER


def _embed_text(text: str) -> np.ndarray:
    """Embed text and return a normalized float32 vector."""
    model = _load_embedder()
    vec = model.encode(text, normalize_embeddings=True)
    arr = np.asarray(vec, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    if norm > 0:
        arr = arr / norm
    return arr


def _upsert_embedding(conn: sqlite3.Connection, note_id: int, content: str) -> None:
    """Generate and upsert semantic embedding for a note."""
    vec = _embed_text(content)
    conn.execute(
        """
        INSERT INTO memory_embeddings(note_id, model, dim, embedding, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(note_id) DO UPDATE SET
            model = excluded.model,
            dim = excluded.dim,
            embedding = excluded.embedding,
            updated_at = excluded.updated_at
        """,
        (note_id, EMBED_MODEL, int(vec.shape[0]), vec.tobytes(), utc_now()),
    )


def add_note(
    conn: sqlite3.Connection,
    *,
    content: str,
    tags: str,
    source: str,
    embed: bool = True,
) -> tuple[int | None, bool]:
    """Insert a note into the memory database.

    When ``embed`` is False, the row is inserted but no embedding is generated —
    the heavy model is never loaded. The missing vector can be filled later with
    ``backfill-embeddings`` (semantic search just omits that note until then).
    """
    content = content.strip()
    if not content:
        raise ValueError("content cannot be empty")

    tags = _normalize_tags(tags)
    created_at = utc_now()
    digest = _content_hash(content)
    cursor = conn.execute(
        """
        INSERT OR IGNORE INTO notes(created_at, source, tags, content, content_hash)
        VALUES (?, ?, ?, ?, ?)
        """,
        (created_at, source.strip() or "manual", tags, content, digest),
    )

    inserted = cursor.rowcount > 0
    note_id: int | None = None
    if inserted:
        row = conn.execute("SELECT id FROM notes WHERE content_hash = ?", (digest,)).fetchone()
        note_id = int(row["id"]) if row else None
        if note_id is not None and embed:
            _upsert_embedding(conn, note_id, content)
    conn.commit()
    return note_id, inserted


def _coerce_tags(tags: Any) -> str:
    """Accept a comma string or a list of tags; return a comma string."""
    if isinstance(tags, list):
        return ",".join(str(t) for t in tags)
    return str(tags or "")


def _embed_notes(conn: sqlite3.Connection, note_ids: list[int]) -> int:
    """Generate embeddings for the given note ids in one model load. Returns count."""
    count = 0
    for note_id in note_ids:
        row = conn.execute("SELECT content FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None:
            continue
        _upsert_embedding(conn, note_id, str(row["content"]))
        count += 1
    conn.commit()
    return count


def _format_row(row: sqlite3.Row) -> str:
    """Format a row for CLI output."""
    tags = f" [{row['tags']}]" if row["tags"] else ""
    return f"{row['id']:>4} | {row['created_at']} | {row['source']}{tags}\n      {row['content']}"


def _format_search_row(row: sqlite3.Row, score: float) -> str:
    """Format a search row with diagnostics."""
    base = _format_row(row)
    last_seen = row["last_seen_at"] or "never"
    hits = int(row["hits"] or 0)
    return f"{base}\n      hits={hits} last_seen={last_seen} score={score:.3f}"


def _query_tokens(query: str) -> set[str]:
    """Tokenize query text into lowercase words."""
    return {token for token in re.findall(r"[a-z0-9]+", query.lower()) if token}


def _fts_query_from_text(query: str) -> str:
    """Build a safe FTS5 query."""
    tokens = sorted(_query_tokens(query))
    if not tokens:
        return ""
    escaped = [token.replace('"', '""') for token in tokens]
    return " OR ".join(f'"{token}"' for token in escaped)


def _build_like_predicate(query: str) -> tuple[str, list[str]]:
    """Build broad LIKE predicate from query tokens + raw query."""
    tokens = sorted(_query_tokens(query))
    terms: list[str] = []
    if query.strip():
        terms.append(query.strip())
    for token in tokens:
        if token not in terms:
            terms.append(token)
    if not terms:
        terms = [query]

    clauses: list[str] = []
    params: list[str] = []
    for term in terms:
        clauses.append("(content LIKE ? OR tags LIKE ? OR source LIKE ?)")
        pattern = f"%{term}%"
        params.extend([pattern, pattern, pattern])
    return " OR ".join(clauses), params


def _tags_set(tags: str) -> set[str]:
    """Split tag CSV into normalized set."""
    return {tag.strip().lower() for tag in tags.split(",") if tag.strip()}


def _iso_age_days(iso_value: str | None, now_ts: datetime) -> float:
    """Return age in days for ISO timestamp; very large when missing."""
    if not iso_value:
        return 3650.0
    try:
        past = datetime.fromisoformat(iso_value)
    except ValueError:
        return 3650.0
    delta = now_ts - past
    return max(0.0, delta.total_seconds() / 86400.0)


def _recency_component(row: sqlite3.Row, now_ts: datetime) -> float:
    """Compute recency score from creation and last_seen timestamps."""
    created_days = _iso_age_days(row["created_at"], now_ts)
    seen_days = _iso_age_days(row["last_seen_at"], now_ts)
    created_score = math.exp(-created_days / 14.0)
    seen_score = math.exp(-seen_days / 7.0)
    return max(created_score, seen_score)


def _tag_component(query: str, tags: str) -> float:
    """Compute tag overlap score."""
    q_tokens = _query_tokens(query)
    if not q_tokens:
        return 0.0
    t_tokens = _tags_set(tags)
    if not t_tokens:
        return 0.0
    overlap = len(q_tokens.intersection(t_tokens))
    return overlap / len(q_tokens)


def _relevance_component_from_bm25(bm25_score: float | None) -> float:
    """Map bm25 score to [0,1], where larger means more relevant."""
    if bm25_score is None:
        return 0.0
    return 1.0 / (1.0 + max(0.0, bm25_score))


def _relevance_component_like(query: str, row: sqlite3.Row) -> float:
    """Estimate lexical relevance in LIKE fallback."""
    text = f"{row['content']} {row['tags']} {row['source']}".lower()
    q_tokens = _query_tokens(query)
    if not q_tokens:
        return 0.0
    hits = sum(1 for token in q_tokens if token in text)
    return hits / len(q_tokens)


def _lexical_candidates(
    conn: sqlite3.Connection, query: str, limit: int, fts_available: bool
) -> dict[int, float]:
    """Return note_id -> lexical score map."""
    candidate_limit = max(limit * 5, 30)
    results: dict[int, float] = {}
    fts_query = _fts_query_from_text(query)

    if fts_available and fts_query:
        try:
            rows = conn.execute(
                """
                SELECT n.id, bm25(notes_fts) AS bm25_score
                FROM notes_fts
                JOIN notes n ON n.id = notes_fts.rowid
                WHERE notes_fts MATCH ?
                ORDER BY bm25_score
                LIMIT ?
                """,
                (fts_query, candidate_limit),
            ).fetchall()
            if rows:
                for row in rows:
                    results[int(row["id"])] = _relevance_component_from_bm25(
                        float(row["bm25_score"])
                    )
                return results
        except sqlite3.OperationalError:
            pass

    where_clause, where_params = _build_like_predicate(query)
    rows = conn.execute(
        f"""
        SELECT id, created_at, source, tags, content, hits, last_seen_at
        FROM notes
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ?
        """,
        [*where_params, candidate_limit],
    ).fetchall()
    for row in rows:
        results[int(row["id"])] = _relevance_component_like(query, row)
    return results


def _semantic_candidates_python(conn: sqlite3.Connection, query: str, limit: int) -> dict[int, float]:
    """Return note_id -> semantic score using Python cosine fallback."""
    q_vec = _embed_text(query)
    rows = conn.execute(
        """
        SELECT note_id, dim, embedding
        FROM memory_embeddings
        WHERE model = ?
        """,
        (EMBED_MODEL,),
    ).fetchall()
    scores: list[tuple[int, float]] = []
    for row in rows:
        note_id = int(row["note_id"])
        dim = int(row["dim"])
        emb = np.frombuffer(row["embedding"], dtype=np.float32, count=dim)
        score = float(np.dot(q_vec, emb))
        scores.append((note_id, score))
    scores.sort(key=lambda item: item[1], reverse=True)
    return {note_id: score for note_id, score in scores[: max(limit * 5, 30)]}


def _semantic_candidates_sqlite_vec(
    conn: sqlite3.Connection, query: str, limit: int
) -> dict[int, float]:
    """Return note_id -> semantic score using sqlite-vec SQL functions."""
    q_vec = _embed_text(query)
    q_blob = q_vec.astype(np.float32).tobytes()
    rows = conn.execute(
        """
        SELECT note_id, (1.0 - vec_distance_cosine(embedding, ?)) AS score
        FROM memory_embeddings
        WHERE model = ?
        ORDER BY vec_distance_cosine(embedding, ?) ASC
        LIMIT ?
        """,
        (q_blob, EMBED_MODEL, q_blob, max(limit * 5, 30)),
    ).fetchall()
    return {int(row["note_id"]): float(row["score"]) for row in rows}


def _semantic_candidates(conn: sqlite3.Connection, query: str, limit: int) -> tuple[dict[int, float], str]:
    """Return semantic candidates and active backend label."""
    global _SEMANTIC_BACKEND_NOTICE_SHOWN, _SQLITE_VEC_STATUS
    backend = semantic_backend(conn)
    if backend == "sqlite-vec":
        try:
            return _semantic_candidates_sqlite_vec(conn, query, limit), "sqlite-vec"
        except Exception:
            _SQLITE_VEC_STATUS = "python-cosine-fallback"
            backend = "python-cosine-fallback"

    if not _SEMANTIC_BACKEND_NOTICE_SHOWN and backend != "sqlite-vec":
        print("semantic_backend_notice=python-cosine-fallback (sqlite-vec unavailable)")
        _SEMANTIC_BACKEND_NOTICE_SHOWN = True
    return _semantic_candidates_python(conn, query, limit), "python-cosine-fallback"


def _mark_recalled(conn: sqlite3.Connection, note_ids: list[int]) -> None:
    """Increment hits and update last_seen_at for recalled notes."""
    if not note_ids:
        return
    seen_at = utc_now()
    conn.executemany(
        """
        UPDATE notes
        SET hits = hits + 1, last_seen_at = ?
        WHERE id = ?
        """,
        [(seen_at, note_id) for note_id in note_ids],
    )
    conn.commit()


def _combined_search(
    conn: sqlite3.Connection, query: str, limit: int, fts_available: bool
) -> tuple[list[tuple[sqlite3.Row, float]], str]:
    """Run hybrid lexical+semantic search and return scored rows + backend."""
    now_ts = datetime.now(timezone.utc)
    lexical = _lexical_candidates(conn, query, limit, fts_available)
    semantic, backend = _semantic_candidates(conn, query, limit)

    note_ids = set(lexical.keys()) | set(semantic.keys())
    if not note_ids:
        return [], backend

    rows = conn.execute(
        f"""
        SELECT id, created_at, source, tags, content, hits, last_seen_at
        FROM notes
        WHERE id IN ({",".join(["?"] * len(note_ids))})
        """,
        list(note_ids),
    ).fetchall()
    rows_by_id = {int(row["id"]): row for row in rows}

    scored: list[tuple[sqlite3.Row, float]] = []
    for note_id in note_ids:
        row = rows_by_id.get(note_id)
        if row is None:
            continue
        lexical_score = lexical.get(note_id, 0.0)
        semantic_score = max(0.0, semantic.get(note_id, 0.0))
        recency = _recency_component(row, now_ts)
        tag_match = _tag_component(query, row["tags"])
        score = (
            WEIGHT_LEXICAL * lexical_score
            + WEIGHT_SEMANTIC * semantic_score
            + WEIGHT_RECENCY * recency
            + WEIGHT_TAG * tag_match
        )
        scored.append((row, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit], backend


def _embedding_coverage(conn: sqlite3.Connection) -> tuple[int, int]:
    """Return (embedded_notes, total_notes)."""
    total_row = conn.execute("SELECT COUNT(*) AS c FROM notes").fetchone()
    embedded_row = conn.execute("SELECT COUNT(*) AS c FROM memory_embeddings").fetchone()
    total = int(total_row["c"]) if total_row else 0
    embedded = int(embedded_row["c"]) if embedded_row else 0
    return embedded, total


def _embedding_model_breakdown(
    conn: sqlite3.Connection,
) -> tuple[int, int, int, int, dict[str, int]]:
    """Return (total_notes, current_count, stale_count, missing_count, stale_models).

    ``current_count`` counts embeddings built with the active ``EMBED_MODEL``.
    ``stale_count`` counts embeddings built with ANY other model (model drift —
    semantic search filters these out via ``WHERE model = ?``). ``missing_count``
    counts notes with no embedding row at all. ``stale_models`` maps each
    outdated model name to how many notes still carry it. Pure SQL: no model load.
    """
    total_row = conn.execute("SELECT COUNT(*) AS c FROM notes").fetchone()
    total = int(total_row["c"]) if total_row else 0
    # Count embeddings that belong to a STILL-EXISTING note, grouped by model.
    # The JOIN (rather than COUNT over the raw embeddings table) keeps orphan
    # rows out of the counts: connect() does not enable PRAGMA foreign_keys, so
    # the ON DELETE CASCADE is unenforced and an orphan embedding could otherwise
    # inflate current/stale past total. With the JOIN, current_count <= total.
    rows = conn.execute(
        """
        SELECT e.model AS model, COUNT(*) AS c
        FROM memory_embeddings e
        JOIN notes n ON n.id = e.note_id
        GROUP BY e.model
        """
    ).fetchall()
    current = 0
    stale_models: dict[str, int] = {}
    for row in rows:
        model = str(row["model"])
        count = int(row["c"])
        if model == EMBED_MODEL:
            current += count
        else:
            stale_models[model] = stale_models.get(model, 0) + count
    stale = sum(stale_models.values())
    # Compute missing with the SAME predicate cmd_reembed selects on, so
    # embedding-status and reembed can never disagree about what is outstanding.
    missing_row = conn.execute(
        """
        SELECT COUNT(*) AS c
        FROM notes n
        LEFT JOIN memory_embeddings e ON e.note_id = n.id
        WHERE e.note_id IS NULL
        """
    ).fetchone()
    missing = int(missing_row["c"]) if missing_row else 0
    return total, current, stale, missing, stale_models


def cmd_init(conn: sqlite3.Connection, _: argparse.Namespace) -> None:
    """Handle the init command."""
    fts_available = init_db(conn)
    print(f"initialized: {DB_PATH}")
    print(f"fts5: {'enabled' if fts_available else 'unavailable (LIKE fallback)'}")
    print(f"semantic_backend: {semantic_backend(conn)}")


def cmd_add(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Handle the add command."""
    init_db(conn)
    note_id, inserted = add_note(
        conn,
        content=args.content,
        tags=args.tags or "",
        source=args.source or "manual",
        embed=not getattr(args, "no_embed", False),
    )
    if inserted:
        print(f"added note id={note_id}")
    else:
        print("skipped duplicate note")


def cmd_add_batch(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Add many notes in ONE process — model loaded once, not once per note.

    Reads a JSON payload (a list of entries, or {"entries": [...]}) from
    --input-file or stdin. Each entry: {content, tags, source}. Inserts every row
    first (pure SQLite, never blocked by embedding availability), then — unless
    --no-embed — embeds the newly-inserted rows in a single model load. If the
    model is unavailable, rows are still inserted (embedded:false) and can be
    backfilled later. Emits a JSON summary so callers can audit each entry.
    """
    init_db(conn)
    if getattr(args, "input_file", None):
        with open(args.input_file, "r", encoding="utf-8") as handle:
            raw = handle.read()
    else:
        raw = sys.stdin.read()
    if not raw or not raw.strip():
        raise ValueError("add-batch received empty input")
    payload = json.loads(raw)
    entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(entries, list) or not entries:
        raise ValueError("add-batch requires a non-empty list of entries")

    results: list[dict[str, Any]] = []
    inserted_ids: list[int] = []
    for index, entry in enumerate(entries):
        content = str((entry or {}).get("content") or "").strip()
        if not content:
            results.append({"index": index, "status": "failed", "note_id": None, "message": "empty content"})
            continue
        note_id, inserted = add_note(
            conn,
            content=content,
            tags=_coerce_tags(entry.get("tags")),
            source=str(entry.get("source") or "assistant"),
            embed=False,
        )
        results.append({
            "index": index,
            "status": "added" if inserted else "skipped",
            "note_id": note_id,
            "message": "",
        })
        if inserted and note_id is not None:
            inserted_ids.append(note_id)

    embedded = False
    embed_error = None
    if not getattr(args, "no_embed", False) and inserted_ids:
        try:
            _embed_notes(conn, inserted_ids)
            embedded = True
        except RuntimeError as exc:
            embed_error = str(exc)  # graceful: rows are in; backfill-embeddings can fix

    summary = {
        "total": len(entries),
        "added": sum(1 for r in results if r["status"] == "added"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "embedded": embedded,
        "embed_error": embed_error,
        "results": results,
    }
    print(json.dumps(summary))


def cmd_sync(conn: sqlite3.Connection, _: argparse.Namespace) -> None:
    """Handle sync in database-only mode."""
    init_db(conn)
    embedded, total = _embedding_coverage(conn)
    print("sync complete: database-only mode (no external files to index)")
    print(f"semantic_backend: {semantic_backend(conn)}")
    print(f"embedding_coverage: {embedded}/{total}")


def cmd_cleanup_legacy(conn: sqlite3.Connection, _: argparse.Namespace) -> None:
    """Delete legacy sync rows and related embeddings."""
    init_db(conn)
    rows = conn.execute("SELECT id FROM notes WHERE source LIKE 'sync:%'").fetchall()
    note_ids = [int(row["id"]) for row in rows]
    if note_ids:
        conn.execute(
            f"DELETE FROM memory_embeddings WHERE note_id IN ({','.join(['?'] * len(note_ids))})",
            note_ids,
        )
        conn.execute(
            f"DELETE FROM notes WHERE id IN ({','.join(['?'] * len(note_ids))})",
            note_ids,
        )
    conn.commit()
    print(f"deleted_legacy_notes: {len(note_ids)}")


def cmd_backfill_embeddings(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Generate embeddings for notes missing them."""
    init_db(conn)
    limit = max(1, int(args.batch))
    rows = conn.execute(
        """
        SELECT n.id, n.content
        FROM notes n
        LEFT JOIN memory_embeddings e ON e.note_id = n.id
        WHERE e.note_id IS NULL
        ORDER BY n.id ASC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    count = 0
    for row in rows:
        _upsert_embedding(conn, int(row["id"]), str(row["content"]))
        count += 1
    conn.commit()
    print(f"embedded_notes: {count}")


def cmd_reembed(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Regenerate embeddings for notes that are missing a vector OR carry a vector
    built with a different model than the active ``EMBED_MODEL``.

    When ``EMBED_MODEL`` is upgraded, existing notes keep embeddings tagged with
    the OLD model name. Semantic search filters by ``WHERE model = ?``, so those
    notes silently drop out of recall until re-embedded. ``backfill-embeddings``
    only fills MISSING vectors (``WHERE e.note_id IS NULL``) and never refreshes
    stale ones — this command is the model-migration path. ``_upsert_embedding``
    overwrites model/dim/embedding in place, so it is idempotent.

    Loads the model once for the whole batch (heavy torch import paid only here).
    Emits a JSON summary so the re-sync gate can confirm convergence.
    """
    init_db(conn)
    limit = max(1, int(args.batch))
    rows = conn.execute(
        """
        SELECT n.id, n.content
        FROM notes n
        LEFT JOIN memory_embeddings e ON e.note_id = n.id
        WHERE e.note_id IS NULL OR e.model != ?
        ORDER BY n.id ASC
        LIMIT ?
        """,
        (EMBED_MODEL, limit),
    ).fetchall()
    count = 0
    for row in rows:
        _upsert_embedding(conn, int(row["id"]), str(row["content"]))
        count += 1
        # Commit in chunks so the single SQLite writer lock is released
        # periodically — mpnet is slower than the old MiniLM, and a 500-note
        # batch held in one transaction would block concurrent background agents
        # past their 30s busy-timeout.
        if count % 50 == 0:
            conn.commit()
    conn.commit()
    total, current, stale, missing, stale_models = _embedding_model_breakdown(conn)
    print(
        json.dumps(
            {
                "reembedded": count,
                "model": EMBED_MODEL,
                "total_notes": total,
                "current_count": current,
                "stale_count": stale,
                "missing_count": missing,
                "stale_models": stale_models,
                "reembed_needed": (stale + missing) > 0,
            }
        )
    )


def cmd_embedding_status(conn: sqlite3.Connection, _: argparse.Namespace) -> None:
    """Report embedding-model drift as JSON WITHOUT loading the model.

    The re-sync gate calls this to decide whether to offer a re-embed. It only
    reads the ``memory_embeddings.model`` column (pure SQL — no torch import), so
    it is cheap enough to run on every session start. ``reembed_needed`` is true
    when any note is missing a vector or still carries one from a previous model.
    """
    init_db(conn)
    total, current, stale, missing, stale_models = _embedding_model_breakdown(conn)
    print(
        json.dumps(
            {
                "current_model": EMBED_MODEL,
                "total_notes": total,
                "current_count": current,
                "stale_count": stale,
                "missing_count": missing,
                "stale_models": stale_models,
                "reembed_needed": (stale + missing) > 0,
            }
        )
    )


def cmd_prune(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Delete notes by source, optionally narrowed by tags and/or age.

    When --tags is given, only notes whose tag set contains ALL of the requested
    tags are pruned. This enables selective, per-feature pruning during the
    artifact-sync re-sync (e.g. `--source artifact-sync --tags <slug>`), so the
    sync never needs a destructive global prune that would empty the namespace
    before the re-add completes.
    """
    init_db(conn)
    source = (args.source or "").strip()
    if not source:
        raise ValueError("--source is required")

    requested_tags = _tags_set(args.tags) if getattr(args, "tags", None) else set()

    params: list[Any] = [source]
    where = "source = ?"
    cutoff = None
    if args.older_than is not None:
        days = max(0, int(args.older_than))
        cutoff = (
            datetime.now(timezone.utc).replace(microsecond=0)
            - timedelta(days=days)
        ).isoformat()
        where += " AND created_at < ?"
        params.append(cutoff)

    rows = conn.execute(
        f"SELECT id, tags FROM notes WHERE {where}",
        params,
    ).fetchall()
    if requested_tags:
        note_ids = [
            int(row["id"])
            for row in rows
            if requested_tags.issubset(_tags_set(row["tags"]))
        ]
    else:
        note_ids = [int(row["id"]) for row in rows]
    if note_ids:
        conn.execute(
            f"DELETE FROM memory_embeddings WHERE note_id IN ({','.join(['?'] * len(note_ids))})",
            note_ids,
        )
        conn.execute(
            f"DELETE FROM notes WHERE id IN ({','.join(['?'] * len(note_ids))})",
            note_ids,
        )
    conn.commit()
    print(f"pruned_notes: {len(note_ids)}")
    print(f"source: {source}")
    if requested_tags:
        print(f"tags: {','.join(sorted(requested_tags))}")
    if cutoff is not None:
        print(f"older_than_days: {args.older_than}")
        print(f"cutoff: {cutoff}")


def cmd_search(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Handle the search command."""
    fts_available = init_db(conn)
    scored, backend = _combined_search(conn, args.query, args.limit, fts_available)
    if not scored:
        print("no matches")
        print(f"semantic_backend={backend}")
        return

    note_ids = [int(row["id"]) for row, _ in scored]
    _mark_recalled(conn, note_ids)
    refreshed = conn.execute(
        f"""
        SELECT id, created_at, source, tags, content, hits, last_seen_at
        FROM notes
        WHERE id IN ({",".join(["?"] * len(note_ids))})
        """,
        note_ids,
    ).fetchall()
    refreshed_by_id = {int(row["id"]): row for row in refreshed}
    print(f"semantic_backend={backend}")
    for row, score in scored:
        current = refreshed_by_id[int(row["id"])]
        print(_format_search_row(current, score))


def cmd_recent(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    """Handle the recent command."""
    init_db(conn)
    rows = conn.execute(
        """
        SELECT id, created_at, source, tags, content
        FROM notes
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (args.limit,),
    ).fetchall()
    if not rows:
        print("no notes yet")
        return
    for row in rows:
        print(_format_row(row))


def cmd_stats(conn: sqlite3.Connection, _: argparse.Namespace) -> None:
    """Handle the stats command."""
    fts_available = init_db(conn)
    row = conn.execute("SELECT COUNT(*) AS c FROM notes").fetchone()
    count = int(row["c"]) if row else 0
    recalled_row = conn.execute(
        """
        SELECT
            COUNT(*) AS recalled_count,
            COALESCE(AVG(hits), 0) AS avg_hits,
            MAX(last_seen_at) AS latest_seen
        FROM notes
        WHERE hits > 0
        """
    ).fetchone()
    recalled_count = int(recalled_row["recalled_count"]) if recalled_row else 0
    avg_hits = float(recalled_row["avg_hits"]) if recalled_row else 0.0
    latest_seen = recalled_row["latest_seen"] if recalled_row else None
    embedded, total = _embedding_coverage(conn)
    legacy_row = conn.execute(
        "SELECT COUNT(*) AS c FROM notes WHERE source LIKE 'sync:%'"
    ).fetchone()
    legacy_sync_rows = int(legacy_row["c"]) if legacy_row else 0

    print(f"notes: {count}")
    print(f"recalled_notes: {recalled_count}")
    print(f"avg_hits_recalled: {avg_hits:.2f}")
    print(f"latest_last_seen_at: {latest_seen or 'never'}")
    print(f"embedded_notes: {embedded}")
    print(f"embedding_model: {EMBED_MODEL}")
    breakdown = _embedding_model_breakdown(conn)
    stale_embeddings = breakdown[2]
    print(f"stale_embeddings: {stale_embeddings}")
    print(f"semantic_backend: {semantic_backend(conn)}")
    print(f"legacy_sync_rows: {legacy_sync_rows}")
    print(f"db: {DB_PATH}")
    print(f"fts5: {'enabled' if fts_available else 'unavailable (LIKE fallback)'}")
    if total == 0:
        print("embedding_coverage: 0/0")
    else:
        print(f"embedding_coverage: {embedded}/{total}")


def build_parser() -> argparse.ArgumentParser:
    """Build and return the CLI parser."""
    parser = argparse.ArgumentParser(description="Workspace memory CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="initialize memory database")
    init_parser.set_defaults(handler=cmd_init)

    add_parser = subparsers.add_parser("add", help="add a memory note")
    add_parser.add_argument("content", help="note content")
    add_parser.add_argument("--tags", default="", help="comma-separated tags")
    add_parser.add_argument("--source", default="manual", help="source label")
    add_parser.add_argument(
        "--no-embed",
        action="store_true",
        help="insert without generating an embedding (fast; backfill later)",
    )
    add_parser.set_defaults(handler=cmd_add)

    batch_parser = subparsers.add_parser(
        "add-batch",
        help="add many notes in one process (one model load); JSON in, JSON out",
    )
    batch_parser.add_argument(
        "--input-file",
        default=None,
        help="JSON file with a list of entries or {\"entries\": [...]}; reads stdin if omitted",
    )
    batch_parser.add_argument(
        "--no-embed",
        action="store_true",
        help="insert without embeddings (fast; backfill later)",
    )
    batch_parser.set_defaults(handler=cmd_add_batch)

    sync_parser = subparsers.add_parser("sync", help="database-only sync/health check")
    sync_parser.set_defaults(handler=cmd_sync)

    clean_parser = subparsers.add_parser(
        "cleanup-legacy",
        help="remove legacy sync:* rows and related embeddings",
    )
    clean_parser.set_defaults(handler=cmd_cleanup_legacy)

    backfill_parser = subparsers.add_parser(
        "backfill-embeddings",
        help="create embeddings for notes missing vectors",
    )
    backfill_parser.add_argument("--batch", type=int, default=500, help="max notes per run")
    backfill_parser.set_defaults(handler=cmd_backfill_embeddings)

    reembed_parser = subparsers.add_parser(
        "reembed",
        help="regenerate embeddings for notes missing a vector or built with another model",
    )
    reembed_parser.add_argument("--batch", type=int, default=500, help="max notes per run")
    reembed_parser.set_defaults(handler=cmd_reembed)

    embedding_status_parser = subparsers.add_parser(
        "embedding-status",
        help="report embedding-model drift as JSON (no model load)",
    )
    embedding_status_parser.set_defaults(handler=cmd_embedding_status)

    prune_parser = subparsers.add_parser(
        "prune",
        help="delete notes by source, optionally older than N days",
    )
    prune_parser.add_argument("--source", required=True, help="exact source label to delete")
    prune_parser.add_argument(
        "--tags",
        default=None,
        help="comma-separated tags; prune only notes whose tags contain ALL given tags",
    )
    prune_parser.add_argument(
        "--older-than",
        type=int,
        default=None,
        help="delete only notes older than this many days",
    )
    prune_parser.set_defaults(handler=cmd_prune)

    search_parser = subparsers.add_parser("search", help="search memory notes")
    search_parser.add_argument("query", help="search query")
    search_parser.add_argument("--limit", type=int, default=8, help="max results")
    search_parser.set_defaults(handler=cmd_search)

    recent_parser = subparsers.add_parser("recent", help="show recent notes")
    recent_parser.add_argument("--limit", type=int, default=10, help="max results")
    recent_parser.set_defaults(handler=cmd_recent)

    stats_parser = subparsers.add_parser("stats", help="show memory stats")
    stats_parser.set_defaults(handler=cmd_stats)
    return parser


def main() -> int:
    """Entry point for the memory CLI."""
    parser = build_parser()
    args = parser.parse_args()
    conn = connect()
    try:
        args.handler(conn, args)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
