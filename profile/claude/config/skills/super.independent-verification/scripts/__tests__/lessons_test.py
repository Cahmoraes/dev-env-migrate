#!/usr/bin/env python3
"""Tests for lessons.py. Run: python3 -m unittest discover -s .. -p 'lessons_test.py'
or simply: python3 scripts/__tests__/lessons_test.py"""

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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


class TextGeneralityGateTest(unittest.TestCase):
    """A lesson only recurs if its text is a rule. Minting a feature-bound sentence is
    refused; corroborating an already-recorded one is never blocked."""

    GENERAL = "when a spec pins exact CSS classes, assert className, not only the rendered text"

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        run(self.dir, "init")

    def store(self):
        with open(os.path.join(self.dir, ".superpowers", "lessons.json"), encoding="utf-8") as f:
            return json.load(f)

    def add(self, feature, text, source="M07"):
        return run(self.dir, "add", "--feature", feature, "--signal", "surviving_mutant",
                   "--source", source, "--text", text)

    def test_general_rule_is_accepted(self):
        code, _ = self.add("f1", self.GENERAL)
        self.assertEqual(code, 0)

    def test_over_long_text_is_refused(self):
        code, _ = self.add("f1", "x" * (lessons.MAX_TEXT_CHARS + 1))
        self.assertEqual(code, 2)
        self.assertEqual(self.store()["lessons"], [])

    def test_text_naming_a_file_is_refused(self):
        code, _ = self.add("f1", "add a toHaveClass assertion to gym-results.test.tsx")
        self.assertEqual(code, 2)

    def test_text_naming_a_path_is_refused(self):
        code, _ = self.add("f1", "assert className in apps/frontend/src/features")
        self.assertEqual(code, 2)

    def test_text_naming_a_line_reference_is_refused(self):
        code, _ = self.add("f1", "the container at contact-section:63 needs a className assert")
        self.assertEqual(code, 2)

    def test_reuse_of_a_legacy_text_is_never_gated(self):
        """The store predates the gate. If corroborating an over-long lesson were refused,
        everything already recorded would be frozen at recurrence=1 and pruned unread."""
        legacy = "y" * (lessons.MAX_TEXT_CHARS + 50)
        store = self.store()
        store["lessons"].append({
            "id": "L-001", "signal": "surviving_mutant", "text": legacy, "scope": "",
            "features": ["f1"], "sources": ["M01"], "status": "candidate",
            "penalties": 0, "created": "2026-08-01T00:00:00Z", "updated": "2026-08-01T00:00:00Z",
        })
        store["next_id"] = 2
        lessons.save_store(self.dir, store)

        code, out = self.add("f2", legacy, source="M09")
        self.assertEqual(code, 0)
        self.assertIn("promoted", out)
        self.assertEqual(self.store()["lessons"][0]["status"], "confirmed")

    def test_same_rule_under_a_different_signal_corroborates(self):
        """The signal is how the rule was detected, not what it is. The same rule surfaces
        as a spec-precision gap in one feature and a surviving mutant in the next; keying
        identity on the signal made those mint two candidates that never corroborate."""
        run(self.dir, "add", "--feature", "f1", "--signal", "spec_precision_gap",
            "--source", "AC-3", "--text", self.GENERAL)
        code, out = run(self.dir, "add", "--feature", "f2", "--signal", "surviving_mutant",
                        "--source", "M25", "--text", self.GENERAL)
        self.assertEqual(code, 0)
        self.assertIn("promoted", out)
        lessons_ = self.store()["lessons"]
        self.assertEqual(len(lessons_), 1)
        self.assertEqual(lessons_[0]["status"], "confirmed")
        self.assertEqual(lessons_[0]["signals"], ["spec_precision_gap", "surviving_mutant"])

    def test_legacy_lesson_without_signals_key_still_corroborates(self):
        """Stores written before signals accumulated carry only `signal`."""
        store = self.store()
        store["lessons"].append({
            "id": "L-001", "signal": "ac_gap", "text": self.GENERAL, "scope": "",
            "features": ["f1"], "sources": ["AC-1"], "status": "candidate",
            "penalties": 0, "created": "2026-08-01T00:00:00Z", "updated": "2026-08-01T00:00:00Z",
        })
        store["next_id"] = 2
        lessons.save_store(self.dir, store)
        code, out = run(self.dir, "add", "--feature", "f2", "--signal", "surviving_mutant",
                        "--source", "M09", "--text", self.GENERAL)
        self.assertEqual(code, 0)
        self.assertIn("promoted", out)
        self.assertEqual(self.store()["lessons"][0]["signals"], ["ac_gap", "surviving_mutant"])

    def test_check_text_names_every_reason(self):
        reasons = lessons.check_text("z" * 210 + " see apps/a/b/c and gym.test.tsx at foo:12")
        self.assertEqual(len(reasons), 4)


class LifecycleScenarioTest(unittest.TestCase):
    """Prune, quarantine and scope behaviour under the read/write split."""

    GENERAL = "when a spec pins exact CSS classes, assert className, not only the rendered text"

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        run(self.dir, "init")

    def store(self):
        with open(os.path.join(self.dir, ".superpowers", "lessons.json"), encoding="utf-8") as f:
            return json.load(f)

    def add(self, feature, text=None, signal="ac_gap", source="AC-1", scope=None):
        argv = ["add", "--feature", feature, "--signal", signal, "--source", source,
                "--text", text or self.GENERAL]
        if scope:
            argv += ["--scope", scope]
        return run(self.dir, *argv)

    def age(self, lesson_id, days):
        store = self.store()
        stamp = lessons._iso(datetime.now(timezone.utc) - timedelta(days=days))
        for lesson in store["lessons"]:
            if lesson["id"] == lesson_id:
                lesson["created"] = lesson["updated"] = stamp
        lessons.save_store(self.dir, store)

    def test_prune_drops_stale_uncorroborated_candidate(self):
        self.add("f1")
        self.age("L-001", lessons.STALE_AFTER_DAYS + 5)
        run(self.dir, "prune")
        self.assertEqual(self.store()["lessons"], [])

    def test_prune_keeps_confirmed_however_old(self):
        self.add("f1")
        self.add("f2", source="AC-2")
        self.age("L-001", 400)
        run(self.dir, "prune")
        self.assertEqual(self.store()["lessons"][0]["status"], "confirmed")

    def test_list_never_writes(self):
        """The planning-time load and the Verifier's read-before-write both go through
        `list`. If it pruned, reading the store could delete the very candidate the
        Verifier came to corroborate."""
        self.add("f1")
        self.age("L-001", lessons.STALE_AFTER_DAYS + 5)
        path = os.path.join(self.dir, ".superpowers", "lessons.json")
        before = os.stat(path).st_mtime_ns
        code, out = run(self.dir, "list", "--status", "all")
        self.assertEqual(code, 0)
        self.assertIn("L-001", out)
        self.assertEqual(len(self.store()["lessons"]), 1)
        self.assertEqual(os.stat(path).st_mtime_ns, before)

    def test_status_active_excludes_quarantined(self):
        """`active` is what the Verifier reads: reusing a quarantined text writes into a
        record that is never served again."""
        self.add("f1")
        self.add("f2", text="cover the cancel path, not only the confirm path", source="AC-2")
        run(self.dir, "penalize", "--id", "L-002")
        run(self.dir, "penalize", "--id", "L-002")
        code, out = run(self.dir, "list", "--status", "active")
        self.assertIn("L-001", out)
        self.assertNotIn("L-002", out)
        _, every = run(self.dir, "list", "--status", "all")
        self.assertIn("L-002", every)

    def test_stale_lesson_is_corroborated_not_pruned_out_from_under_the_reuse(self):
        """The Verifier reads the store, copies a text verbatim, and issues `add`. If that
        `add` prunes before matching, a lesson one day past the window is deleted mid-call,
        the reuse becomes a mint, and the generality gate refuses a text the Verifier
        copied in good faith - losing the lesson AND this feature's signal."""
        legacy = ("quando a spec lista um teste de fluxo completo, criar esse arquivo "
                  "business-flow-test.ts como uma task explicita do plano, porque a "
                  "composicao e o que quebra e os unitarios isolados nao a cobrem")
        self.assertTrue(lessons.check_text(legacy), "fixture must be gate-refusable")
        stale = lessons._iso(datetime.now(timezone.utc)
                             - timedelta(days=lessons.STALE_AFTER_DAYS + 5))
        store = self.store()
        store["lessons"].append({
            "id": "L-001", "signal": "ac_gap", "text": legacy, "scope": "",
            "features": ["f1"], "sources": ["AC-1"], "status": "candidate",
            "penalties": 0, "created": stale, "updated": stale,
        })
        store["next_id"] = 2
        lessons.save_store(self.dir, store)

        _, listing = run(self.dir, "list", "--status", "active")
        self.assertIn("L-001", listing, "Verifier must still see it")

        code, out = self.add("f2", text=legacy, source="AC-9")
        self.assertEqual(code, 0)
        self.assertIn("promoted", out)
        self.assertEqual(self.store()["lessons"][0]["status"], "confirmed")

    def test_add_still_sweeps_other_stale_candidates(self):
        """Moving prune after the match must not disable it for everything else."""
        self.add("f1", text="a rule that nobody ever corroborates again")
        self.age("L-001", lessons.STALE_AFTER_DAYS + 5)
        self.add("f2", text=self.GENERAL, source="AC-2")
        ids = [l["id"] for l in self.store()["lessons"]]
        self.assertEqual(ids, ["L-002"])

    def test_scope_accumulates_across_features(self):
        self.add("f1", scope="frontend")
        self.add("f2", source="AC-2", scope="backend")
        lesson = self.store()["lessons"][0]
        self.assertEqual(lesson["scopes"], ["frontend", "backend"])
        for area in ("frontend", "backend"):
            _, out = run(self.dir, "list", "--status", "confirmed", "--scope", area)
            self.assertIn("L-001", out, "lesson invisible under scope %s" % area)


class ConcurrentAddTest(unittest.TestCase):
    """The Verifier records one lesson per grounded signal, so several `add` calls
    are naturally issued at once. Before the lock, every trial silently lost lessons
    (measured: 4-5 of 6 written, 5/5 trials) and one run tripped over a half-written
    file. Silent loss is the bad failure here - lessons ARE the recurrence-prevention
    channel, so a dropped one fails open with no signal.
    """

    SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lessons.py")

    def _spawn_adds(self, root, n):
        procs = [
            subprocess.Popen(
                [sys.executable, self.SCRIPT, "--root", root, "add",
                 "--feature", "f%d" % i, "--signal", "surviving_mutant",
                 "--source", "src/f%d.js:%d" % (i, 10 + i),
                 "--text", "concurrent lesson number %d" % i],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            for i in range(n)
        ]
        errors = []
        for p in procs:
            _, err = p.communicate()
            if p.returncode != 0:
                errors.append(err.decode("utf-8", "replace"))
        return errors

    def test_concurrent_adds_lose_nothing(self):
        n = 6
        with tempfile.TemporaryDirectory() as root:
            errors = self._spawn_adds(root, n)
            self.assertEqual(errors, [], "no `add` may fail under concurrency")
            with open(os.path.join(root, ".superpowers", "lessons.json"), encoding="utf-8") as handle:
                store = json.load(handle)  # unparseable JSON fails here by design
            self.assertEqual(len(store["lessons"]), n,
                             "every concurrent add must survive: lost update means a lesson "
                             "vanished with no error anyone can see")
            self.assertEqual(len({l["id"] for l in store["lessons"]}), n, "ids must stay unique")

    def test_store_is_replaced_atomically(self):
        """A reader must never observe a partially written store."""
        with tempfile.TemporaryDirectory() as root:
            run(root, "add", "--feature", "f1", "--signal", "ac_gap", "--source", "s1", "--text", "first lesson")
            store_path = os.path.join(root, ".superpowers", "lessons.json")
            before_inode = os.stat(store_path).st_ino
            run(root, "add", "--feature", "f2", "--signal", "ac_gap", "--source", "s2", "--text", "second lesson")
            self.assertNotEqual(before_inode, os.stat(store_path).st_ino,
                                "an atomic replace swaps the inode; an in-place rewrite would not")
            leftovers = [f for f in os.listdir(os.path.dirname(store_path)) if f.startswith(".tmp-")]
            self.assertEqual(leftovers, [], "temp files must not be left behind")


if __name__ == "__main__":
    unittest.main(verbosity=2)
