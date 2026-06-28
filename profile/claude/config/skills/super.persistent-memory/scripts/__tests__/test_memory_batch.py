"""Tests for memory.py batch + lazy-import optimizations.

Run with:  python3 -m unittest discover -s <scripts>/__tests__ -p 'test_*.py'
       or:  python3 <scripts>/__tests__/test_memory_batch.py

These use --no-embed throughout so they never load the (heavy) embedding model —
fast and dependency-light. The embedding path is exercised manually; here we lock
in the insert/dedup/JSON contract and the lazy-import speed guarantee.
"""

import json
import os
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
        for args in (["prune", "--source", "artifact-sync"], ["recent"], ["stats"]):
            start = time.time()
            run(args, self._tmp)
            elapsed = time.time() - start
            self.assertLess(
                elapsed, 4.0,
                f"`{' '.join(args)}` took {elapsed:.1f}s — torch import likely no longer lazy",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
