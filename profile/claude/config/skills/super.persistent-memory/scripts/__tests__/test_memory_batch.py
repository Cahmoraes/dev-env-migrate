"""Tests for memory.py batch + lazy-import optimizations.

Run with:  python3 -m unittest discover -s <scripts>/__tests__ -p 'test_*.py'
       or:  python3 <scripts>/__tests__/test_memory_batch.py

These use --no-embed throughout so they never load the (heavy) embedding model —
fast and dependency-light. The embedding path is exercised manually; here we lock
in the insert/dedup/JSON contract and the lazy-import speed guarantee.
"""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
MEMORY = str(SCRIPTS_DIR / "memory.py")


def run(args, root, stdin=None):
    env = dict(os.environ, PMEM_ROOT=root)
    return subprocess.run(
        [sys.executable, MEMORY, *args],
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
    )


class AddBatchTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="pmem-test-")
        run(["init"], self._tmp)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_add_batch_inserts_all_via_stdin(self):
        payload = json.dumps({"entries": [
            {"content": "decision A", "tags": "demo,x", "source": "assistant"},
            {"content": "scope B", "tags": ["demo", "x"], "source": "assistant"},
            {"content": "artifacts C", "tags": "demo,x", "source": "assistant"},
        ]})
        res = run(["add-batch", "--no-embed"], self._tmp, stdin=payload)
        self.assertEqual(res.returncode, 0, res.stderr)
        out = json.loads(res.stdout)
        self.assertEqual(out["total"], 3)
        self.assertEqual(out["added"], 3)
        self.assertEqual(out["skipped"], 0)
        self.assertEqual(out["embedded"], False)  # --no-embed
        self.assertEqual(len(out["results"]), 3)

    def test_add_batch_is_idempotent(self):
        payload = json.dumps([{"content": "same note", "tags": "x"}])
        run(["add-batch", "--no-embed"], self._tmp, stdin=payload)
        res = run(["add-batch", "--no-embed"], self._tmp, stdin=payload)
        out = json.loads(res.stdout)
        self.assertEqual(out["added"], 0)
        self.assertEqual(out["skipped"], 1)

    def test_add_batch_accepts_list_tags(self):
        payload = json.dumps([{"content": "tagged", "tags": ["alpha", "beta"]}])
        res = run(["add-batch", "--no-embed"], self._tmp, stdin=payload)
        self.assertEqual(res.returncode, 0, res.stderr)
        recent = run(["recent"], self._tmp)
        self.assertIn("alpha,beta", recent.stdout)

    def test_add_batch_flags_empty_content(self):
        payload = json.dumps([{"content": "ok"}, {"content": "   "}])
        out = json.loads(run(["add-batch", "--no-embed"], self._tmp, stdin=payload).stdout)
        self.assertEqual(out["added"], 1)
        self.assertEqual(out["failed"], 1)

    def test_add_no_embed_inserts_without_vector(self):
        run(["add", "lonely note", "--tags", "x", "--no-embed"], self._tmp)
        stats = run(["stats"], self._tmp).stdout
        self.assertIn("notes: 1", stats)
        self.assertIn("embedding_coverage: 0/1", stats)

    def test_empty_batch_input_errors(self):
        res = run(["add-batch", "--no-embed"], self._tmp, stdin="")
        self.assertNotEqual(res.returncode, 0)


class LazyImportSpeedTests(unittest.TestCase):
    """Guard the lazy-import win: commands that never embed must not pay the
    ~6-7s torch import. A regression (top-level import sneaking back) would blow
    way past this generous threshold."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="pmem-speed-")
        run(["init"], self._tmp)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_non_embedding_commands_do_not_import_torch(self):
        for args in (
            ["prune", "--source", "artifact-sync"],
            ["recent"],
            ["stats"],
            ["embedding-status"],
        ):
            start = time.time()
            run(args, self._tmp)
            elapsed = time.time() - start
            self.assertLess(
                elapsed, 4.0,
                f"`{' '.join(args)}` took {elapsed:.1f}s — torch import likely no longer lazy",
            )


class EmbeddingDriftTests(unittest.TestCase):
    """Model-drift detection (`embedding-status`) and the `reembed` selection
    logic, exercised WITHOUT loading the model by writing fake embedding rows
    straight into SQLite. These lock in the contract the re-sync gate relies on
    to decide whether to offer a re-embed after the model is upgraded.
    """

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="pmem-drift-")
        run(["init"], self._tmp)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _db(self):
        return str(Path(self._tmp) / ".memory" / "memory.db")

    def _note_ids(self):
        conn = sqlite3.connect(self._db())
        try:
            return [int(r[0]) for r in conn.execute("SELECT id FROM notes ORDER BY id")]
        finally:
            conn.close()

    def _insert_embedding(self, note_id, model, dim=768):
        conn = sqlite3.connect(self._db())
        try:
            conn.execute(
                "INSERT OR REPLACE INTO memory_embeddings"
                "(note_id, model, dim, embedding, updated_at) VALUES (?, ?, ?, ?, ?)",
                (note_id, model, dim, b"\x00" * (dim * 4), "2026-01-01T00:00:00+00:00"),
            )
            conn.commit()
        finally:
            conn.close()

    def test_status_reports_missing_vectors(self):
        run(["add", "note one", "--no-embed"], self._tmp)
        run(["add", "note two", "--no-embed"], self._tmp)
        out = json.loads(run(["embedding-status"], self._tmp).stdout)
        self.assertEqual(out["total_notes"], 2)
        self.assertEqual(out["missing_count"], 2)
        self.assertEqual(out["stale_count"], 0)
        self.assertEqual(out["current_count"], 0)
        self.assertTrue(out["reembed_needed"])

    def test_status_detects_stale_model(self):
        run(["add", "drifting note", "--no-embed"], self._tmp)
        nid = self._note_ids()[0]
        self._insert_embedding(nid, "sentence-transformers/all-MiniLM-L6-v2", dim=384)
        out = json.loads(run(["embedding-status"], self._tmp).stdout)
        self.assertEqual(out["stale_count"], 1)
        self.assertEqual(out["missing_count"], 0)
        self.assertEqual(out["current_count"], 0)
        self.assertIn("sentence-transformers/all-MiniLM-L6-v2", out["stale_models"])
        self.assertTrue(out["reembed_needed"])

    def test_status_clean_when_all_current(self):
        run(["add", "fresh note", "--no-embed"], self._tmp)
        current_model = json.loads(run(["embedding-status"], self._tmp).stdout)["current_model"]
        self._insert_embedding(self._note_ids()[0], current_model, dim=768)
        out = json.loads(run(["embedding-status"], self._tmp).stdout)
        self.assertEqual(out["current_count"], 1)
        self.assertEqual(out["stale_count"], 0)
        self.assertEqual(out["missing_count"], 0)
        self.assertFalse(out["reembed_needed"])

    def test_status_ignores_orphan_embeddings(self):
        # An embedding row whose note no longer exists must NOT inflate the
        # counts (the ON DELETE CASCADE is unenforced — see connect()). With one
        # real note still missing its vector and one orphan on the current model,
        # current_count must stay <= total_notes and missing_count must reflect
        # the real outstanding note.
        run(["add", "real note", "--no-embed"], self._tmp)
        current_model = json.loads(run(["embedding-status"], self._tmp).stdout)["current_model"]
        self._insert_embedding(99999, current_model, dim=768)  # orphan: no such note
        out = json.loads(run(["embedding-status"], self._tmp).stdout)
        self.assertEqual(out["total_notes"], 1)
        self.assertEqual(out["current_count"], 0)  # orphan excluded
        self.assertEqual(out["missing_count"], 1)  # the real note still needs a vector
        self.assertTrue(out["reembed_needed"])

    def test_reembed_skips_current_without_loading_model(self):
        # Every note already carries a current-model vector → reembed selects
        # nothing and must NOT import torch (stays fast). Mirrors the lazy-import
        # guard the other commands honor.
        run(["add", "already current", "--no-embed"], self._tmp)
        current_model = json.loads(run(["embedding-status"], self._tmp).stdout)["current_model"]
        self._insert_embedding(self._note_ids()[0], current_model, dim=768)
        start = time.time()
        res = run(["reembed"], self._tmp)
        elapsed = time.time() - start
        out = json.loads(res.stdout)
        self.assertEqual(out["reembedded"], 0)
        self.assertFalse(out["reembed_needed"])
        self.assertLess(
            elapsed, 4.0,
            f"reembed with no eligible notes took {elapsed:.1f}s — model loaded unnecessarily",
        )


class FtsSyncTests(unittest.TestCase):
    """The FTS index is maintained by the notes_ai/ad/au triggers; init_db must
    NOT rebuild it on every call. These prove FTS stays correct after the
    per-call rebuild was removed (rebuild now happens only on first creation)."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="pmem-fts-")
        run(["init"], self._tmp)

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _db(self):
        return str(Path(self._tmp) / ".memory" / "memory.db")

    def test_fts_populated_by_trigger_after_add(self):
        # Add via the trigger path (no full rebuild), then confirm the FTS row is
        # matchable — verifying lexical search still works without per-call rebuild.
        run(["add", "alpha bravo charlie", "--no-embed"], self._tmp)
        conn = sqlite3.connect(self._db())
        try:
            rows = conn.execute(
                "SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?", ("bravo",)
            ).fetchall()
        finally:
            conn.close()
        self.assertEqual(len(rows), 1)

    def test_fts_tracks_delete_across_commands(self):
        # Two notes, prune one, and the remaining note must still match while the
        # pruned one must not — proving the triggers (not a per-call rebuild) keep
        # FTS consistent across separate process invocations.
        run(["add", "keepme token", "--source", "x", "--no-embed"], self._tmp)
        run(["add", "dropme token", "--source", "y", "--no-embed"], self._tmp)
        run(["prune", "--source", "y"], self._tmp)
        conn = sqlite3.connect(self._db())
        try:
            keep = conn.execute(
                "SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?", ("keepme",)
            ).fetchall()
            drop = conn.execute(
                "SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?", ("dropme",)
            ).fetchall()
        finally:
            conn.close()
        self.assertEqual(len(keep), 1)
        self.assertEqual(len(drop), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
