#!/usr/bin/env python3
"""lessons.py - deterministic bookkeeping for the superpowers lessons layer.

The agent decides *what* was learned (which verification signal, how to phrase it).
This script owns the mechanical parts so they never rot in a prompt: stable IDs,
counting how many distinct features a lesson recurred in, promoting a corroborated
candidate to confirmed, pruning stale noise, quarantining lessons that failed when
applied, and rendering the human-readable playbook.

A lesson only exists if a real verification signal grounds it (a surviving mutant,
a spec-precision gap, a failed/uncovered acceptance criterion, a spec deviation, or
a gate failure). `add` without a --source is refused - an ungrounded lesson is an
opinion, and opinions do not belong here.

State lives under the project's `.superpowers/` directory:
  - .superpowers/lessons.json  canonical, machine-owned (do not hand-edit)
  - .superpowers/LESSONS.md     rendered view, rewritten on every mutating command

Standard library only. Run from the project root, or pass --root.

Exit codes: 0 success, 2 usage/validation error (e.g. missing grounding).
"""

import argparse
import contextlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

try:
    import fcntl
except ImportError:  # non-POSIX: the lock degrades to a no-op, writes stay atomic
    fcntl = None

STATE_DIRNAME = ".superpowers"
STORE_FILENAME = "lessons.json"
RENDER_FILENAME = "LESSONS.md"
LOCK_FILENAME = "lessons.lock"

VALID_SIGNALS = (
    "ac_gap",
    "surviving_mutant",
    "spec_precision_gap",
    "spec_deviation",
    "gate_fail",
)

# Lifecycle tuning. A lesson seen in >= PROMOTE_AFTER distinct features is trusted.
# An uncorroborated candidate older than STALE_AFTER_DAYS is dropped. A confirmed
# lesson that fails QUARANTINE_AFTER times when applied stops being served.
PROMOTE_AFTER = 2
STALE_AFTER_DAYS = 45
QUARANTINE_AFTER = 2

STATUS_CANDIDATE = "candidate"
STATUS_CONFIRMED = "confirmed"
STATUS_QUARANTINED = "quarantined"


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(text):
    try:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return _now()


def _state_dir(root):
    return os.path.join(root, STATE_DIRNAME)


def _store_path(root):
    return os.path.join(_state_dir(root), STORE_FILENAME)


def _render_path(root):
    return os.path.join(_state_dir(root), RENDER_FILENAME)


def _lock_path(root):
    return os.path.join(_state_dir(root), LOCK_FILENAME)


@contextlib.contextmanager
def store_lock(root):
    """Serialize the whole read-modify-write cycle, not just the write.

    The Verifier records one lesson per grounded signal, so several `add` calls are
    naturally issued at once. Without this, each process loads the store, appends to
    its own copy and writes it back: lost updates at best, a torn file at worst.
    Measured 2026-08-03: six concurrent `add` calls corrupted lessons.json in 5 of 5
    trials, and the session then spent ~2.5 minutes and 15 tool calls hand-repairing
    it. Locking the cycle is what makes concurrent `add` safe rather than forbidden.
    """
    os.makedirs(_state_dir(root), exist_ok=True)
    if fcntl is None:
        yield
        return
    handle = open(_lock_path(root), "a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def _write_atomic(path, text):
    """Write via temp file + rename. A reader never observes a half-written file:
    os.replace is atomic on POSIX, so the store is either the old one or the new one.
    """
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=directory, prefix=".tmp-", delete=False)
    try:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.replace(handle.name, path)
    except BaseException:
        handle.close()
        with contextlib.suppress(OSError):
            os.unlink(handle.name)
        raise


def _empty_store():
    return {"version": 1, "next_id": 1, "lessons": []}


def load_store(root):
    path = _store_path(root)
    if not os.path.exists(path):
        return _empty_store()
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    data.setdefault("version", 1)
    data.setdefault("next_id", 1)
    data.setdefault("lessons", [])
    return data


def save_store(root, store):
    os.makedirs(_state_dir(root), exist_ok=True)
    _write_atomic(_store_path(root), json.dumps(store, indent=2, ensure_ascii=False) + "\n")
    write_render(root, store)


def _fingerprint(signal, text):
    """Two lessons are the same when their signal and normalized text match."""
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    return signal + " " + normalized


def _find_by_fingerprint(store, signal, text):
    target = _fingerprint(signal, text)
    for lesson in store["lessons"]:
        if _fingerprint(lesson["signal"], lesson["text"]) == target:
            return lesson
    return None


def _find_by_id(store, lesson_id):
    for lesson in store["lessons"]:
        if lesson["id"] == lesson_id:
            return lesson
    return None


def _mint_id(store):
    lesson_id = "L-%03d" % store["next_id"]
    store["next_id"] += 1
    return lesson_id


def _recurrence(lesson):
    return len(lesson.get("features", []))


def prune(store):
    """Drop candidates that never corroborated and have gone stale. Returns count."""
    now = _now()
    kept = []
    dropped = 0
    for lesson in store["lessons"]:
        if lesson["status"] == STATUS_CANDIDATE and _recurrence(lesson) < PROMOTE_AFTER:
            age_days = (now - _parse_iso(lesson.get("updated", lesson.get("created")))).days
            if age_days > STALE_AFTER_DAYS:
                dropped += 1
                continue
        kept.append(lesson)
    store["lessons"] = kept
    return dropped


def cmd_init(root, _args):
    store = _empty_store()
    save_store(root, store)
    print("Initialized lessons store at %s" % _store_path(root))
    return 0


def cmd_add(root, args):
    if args.signal not in VALID_SIGNALS:
        print("error: --signal must be one of %s" % ", ".join(VALID_SIGNALS), file=sys.stderr)
        return 2
    if not args.source or not args.source.strip():
        print("error: --source is required (a lesson must be grounded in a real signal)", file=sys.stderr)
        return 2

    store = load_store(root)
    prune(store)
    stamp = _iso(_now())
    existing = _find_by_fingerprint(store, args.signal, args.text)

    if existing is None:
        lesson = {
            "id": _mint_id(store),
            "signal": args.signal,
            "text": args.text.strip(),
            "scope": (args.scope or "").strip(),
            "features": [args.feature],
            "sources": [args.source.strip()],
            "status": STATUS_CANDIDATE,
            "penalties": 0,
            "created": stamp,
            "updated": stamp,
        }
        store["lessons"].append(lesson)
        save_store(root, store)
        print("added %s (status=%s, recurrence=1)" % (lesson["id"], lesson["status"]))
        return 0

    # Same lesson resurfacing. Count distinct features; promote on corroboration.
    promoted = False
    if args.feature not in existing["features"]:
        existing["features"].append(args.feature)
    if args.source.strip() not in existing["sources"]:
        existing["sources"].append(args.source.strip())
    if args.scope and not existing.get("scope"):
        existing["scope"] = args.scope.strip()
    existing["updated"] = stamp
    if existing["status"] == STATUS_CANDIDATE and _recurrence(existing) >= PROMOTE_AFTER:
        existing["status"] = STATUS_CONFIRMED
        promoted = True

    save_store(root, store)
    suffix = " -> promoted to confirmed" if promoted else ""
    print("updated %s (recurrence=%d, status=%s)%s" % (
        existing["id"], _recurrence(existing), existing["status"], suffix))
    return 0


def cmd_penalize(root, args):
    store = load_store(root)
    lesson = _find_by_id(store, args.id)
    if lesson is None:
        print("error: no lesson with id %s" % args.id, file=sys.stderr)
        return 2
    lesson["penalties"] = lesson.get("penalties", 0) + 1
    lesson["updated"] = _iso(_now())
    quarantined = False
    if lesson["penalties"] >= QUARANTINE_AFTER and lesson["status"] != STATUS_QUARANTINED:
        lesson["status"] = STATUS_QUARANTINED
        quarantined = True
    save_store(root, store)
    tail = " -> quarantined" if quarantined else ""
    print("penalized %s (penalties=%d)%s" % (lesson["id"], lesson["penalties"], tail))
    return 0


def _matches_filters(lesson, scope, query):
    if scope and lesson.get("scope") != scope:
        return False
    if query and query.lower() not in lesson["text"].lower():
        return False
    return True


def cmd_list(root, args):
    store = load_store(root)
    prune(store)
    save_store(root, store)

    wanted = args.status
    selected = []
    for lesson in store["lessons"]:
        if wanted != "all" and lesson["status"] != wanted:
            continue
        if not _matches_filters(lesson, args.scope, args.query):
            continue
        selected.append(lesson)

    if not selected:
        label = "" if wanted == "all" else wanted + " "
        print("(no %slessons)" % label)
        return 0

    for lesson in selected:
        scope = " [scope:%s]" % lesson["scope"] if lesson.get("scope") else ""
        print("%s (%s, x%d)%s: %s" % (
            lesson["id"], lesson["status"], _recurrence(lesson), scope, lesson["text"]))
    return 0


def cmd_prune(root, _args):
    store = load_store(root)
    dropped = prune(store)
    save_store(root, store)
    print("pruned %d stale candidate(s)" % dropped)
    return 0


def cmd_status(root, _args):
    store = load_store(root)
    counts = {STATUS_CANDIDATE: 0, STATUS_CONFIRMED: 0, STATUS_QUARANTINED: 0}
    for lesson in store["lessons"]:
        counts[lesson["status"]] = counts.get(lesson["status"], 0) + 1
    print("total=%d confirmed=%d candidate=%d quarantined=%d" % (
        len(store["lessons"]),
        counts[STATUS_CONFIRMED],
        counts[STATUS_CANDIDATE],
        counts[STATUS_QUARANTINED],
    ))
    return 0


def write_render(root, store):
    lines = ["# Lessons Playbook", ""]
    lines.append("<!-- Rendered from .superpowers/lessons.json. Do not hand-edit; use lessons.py. -->")
    lines.append("")

    def section(title, status):
        rows = [l for l in store["lessons"] if l["status"] == status]
        lines.append("## %s (%d)" % (title, len(rows)))
        if not rows:
            lines.append("")
            lines.append("_none_")
            lines.append("")
            return
        lines.append("")
        for lesson in sorted(rows, key=lambda l: l["id"]):
            scope = " `%s`" % lesson["scope"] if lesson.get("scope") else ""
            lines.append("- **%s**%s (%s, seen in %d feature(s)): %s" % (
                lesson["id"], scope, lesson["signal"], _recurrence(lesson), lesson["text"]))
        lines.append("")

    section("Confirmed", STATUS_CONFIRMED)
    section("Candidates", STATUS_CANDIDATE)
    section("Quarantined", STATUS_QUARANTINED)

    _write_atomic(_render_path(root), "\n".join(lines).rstrip() + "\n")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="lessons.py",
        description="Deterministic lessons bookkeeping for the superpowers lessons layer.",
    )
    parser.add_argument("--root", default=".", help="Project root containing .superpowers/ (default: .)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create an empty store + rendered playbook")

    p_add = sub.add_parser("add", help="record a grounded lesson")
    p_add.add_argument("--feature", required=True, help="feature slug the signal came from")
    p_add.add_argument("--signal", required=True, help="one of: %s" % ", ".join(VALID_SIGNALS))
    p_add.add_argument("--source", required=True, help="grounding: file:line, AC id, or mutant id")
    p_add.add_argument("--text", required=True, help="one actionable sentence")
    p_add.add_argument("--scope", default="", help="optional path/layer/tag")

    p_pen = sub.add_parser("penalize", help="mark a confirmed lesson as failed-when-applied")
    p_pen.add_argument("--id", required=True, help="lesson id, e.g. L-001")

    p_list = sub.add_parser("list", help="print lessons for loading at planning time")
    p_list.add_argument("--status", default=STATUS_CONFIRMED,
                        choices=[STATUS_CONFIRMED, STATUS_CANDIDATE, STATUS_QUARANTINED, "all"],
                        help="filter by status (default: confirmed)")
    p_list.add_argument("--scope", default="", help="filter by scope")
    p_list.add_argument("--query", default="", help="substring filter on the lesson text")

    sub.add_parser("prune", help="drop stale uncorroborated candidates")
    sub.add_parser("status", help="print counts")
    return parser


DISPATCH = {
    "init": cmd_init,
    "add": cmd_add,
    "penalize": cmd_penalize,
    "list": cmd_list,
    "prune": cmd_prune,
    "status": cmd_status,
}


# Commands that read the store, change it, and write it back. Only these need the
# lock; `list`/`status` read a single atomically-replaced file and cannot tear.
MUTATING = ("init", "add", "penalize", "prune")


def main(argv=None):
    args = build_parser().parse_args(argv)
    root = args.root
    if args.command in MUTATING:
        with store_lock(root):
            return DISPATCH[args.command](root, args)
    return DISPATCH[args.command](root, args)


if __name__ == "__main__":
    sys.exit(main())
