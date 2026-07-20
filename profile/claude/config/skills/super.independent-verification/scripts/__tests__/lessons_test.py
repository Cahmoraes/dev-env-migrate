#!/usr/bin/env python3
"""Tests for lessons.py. Run: python3 -m unittest discover -s .. -p 'lessons_test.py'
or simply: python3 scripts/__tests__/lessons_test.py"""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lessons  # noqa: E402


def run(root, *argv):
    """Invoke the CLI, capturing stdout and the exit code."""
    buf = io.StringIO()
    code = 0
    with redirect_stdout(buf):
        try:
            code = lessons.main(["--root", root, *argv])
        except SystemExit as exc:  # argparse errors
            code = exc.code
    return code, buf.getvalue()


class LessonsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        run(self.dir, "init")

    def store(self):
        with open(os.path.join(self.dir, ".superpowers", "lessons.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_init_creates_state(self):
        self.assertTrue(os.path.exists(os.path.join(self.dir, ".superpowers", "lessons.json")))
        self.assertTrue(os.path.exists(os.path.join(self.dir, ".superpowers", "LESSONS.md")))

    def test_add_creates_candidate(self):
        code, out = run(self.dir, "add", "--feature", "f1", "--signal", "surviving_mutant",
                        "--source", "src/a.ts:10", "--text", "assert the boundary")
        self.assertEqual(code, 0)
        self.assertIn("recurrence=1", out)
        self.assertEqual(self.store()["lessons"][0]["status"], "candidate")

    def test_promotion_needs_two_distinct_features(self):
        run(self.dir, "add", "--feature", "f1", "--signal", "ac_gap",
            "--source", "AC-1", "--text", "cover the error path")
        # same feature again -> still candidate
        run(self.dir, "add", "--feature", "f1", "--signal", "ac_gap",
            "--source", "AC-1b", "--text", "cover the error path")
        self.assertEqual(self.store()["lessons"][0]["status"], "candidate")
        # different feature -> promoted
        code, out = run(self.dir, "add", "--feature", "f2", "--signal", "ac_gap",
                        "--source", "AC-2", "--text", "cover the error path")
        self.assertIn("promoted", out)
        self.assertEqual(self.store()["lessons"][0]["status"], "confirmed")

    def test_add_without_source_is_refused(self):
        code, _ = run(self.dir, "add", "--feature", "f1", "--signal", "ac_gap", "--text", "x")
        self.assertEqual(code, 2)

    def test_invalid_signal_refused(self):
        code, _ = run(self.dir, "add", "--feature", "f1", "--signal", "made_up",
                      "--source", "s", "--text", "x")
        self.assertEqual(code, 2)

    def test_list_confirmed_only(self):
        run(self.dir, "add", "--feature", "f1", "--signal", "gate_fail", "--source", "s1", "--text", "keep gate green")
        code, out = run(self.dir, "list", "--status", "confirmed")
        self.assertIn("no confirmed", out.lower())
        run(self.dir, "add", "--feature", "f2", "--signal", "gate_fail", "--source", "s2", "--text", "keep gate green")
        code, out = run(self.dir, "list", "--status", "confirmed")
        self.assertIn("keep gate green", out)

    def test_penalize_quarantines_after_threshold(self):
        run(self.dir, "add", "--feature", "f1", "--signal", "spec_deviation", "--source", "s1", "--text", "no silent deviation")
        run(self.dir, "add", "--feature", "f2", "--signal", "spec_deviation", "--source", "s2", "--text", "no silent deviation")
        lid = self.store()["lessons"][0]["id"]
        run(self.dir, "penalize", "--id", lid)
        self.assertEqual(self.store()["lessons"][0]["status"], "confirmed")
        code, out = run(self.dir, "penalize", "--id", lid)
        self.assertIn("quarantined", out)
        self.assertEqual(self.store()["lessons"][0]["status"], "quarantined")

    def test_scope_filter(self):
        run(self.dir, "add", "--feature", "f1", "--signal", "ac_gap", "--source", "s1", "--text", "billing rule", "--scope", "billing")
        run(self.dir, "add", "--feature", "f2", "--signal", "ac_gap", "--source", "s2", "--text", "billing rule", "--scope", "billing")
        _, out = run(self.dir, "list", "--status", "confirmed", "--scope", "billing")
        self.assertIn("billing rule", out)
        _, out = run(self.dir, "list", "--status", "confirmed", "--scope", "auth")
        self.assertIn("no confirmed", out.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
