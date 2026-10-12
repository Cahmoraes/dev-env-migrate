"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "parse-tasks.cjs");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkFeatureDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "parse-tasks-"));
}

function writeTaskFile(dir, name, status) {
	fs.writeFileSync(
		path.join(dir, name),
		`# Task\n\n**Status:** ${status}\n\n## Passos\n`,
	);
}

/** Build a tasks index from [{ number, done, file }] rows. */
function writeIndex(dir, rows) {
	const lines = rows.map(
		(r) => `- [${r.done ? "x" : " "}] ${r.number}. Task ${r.number} → \`${r.file}\``,
	);
	const indexPath = path.join(dir, "tasks-feature.md");
	fs.writeFileSync(indexPath, `# Tasks\n\n${lines.join("\n")}\n`);
	return indexPath;
}

/** Run the script; returns { status, stdout, json }. Never throws on exit!=0. */
function run(args) {
	try {
		const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" });
		return { status: 0, stdout, json: JSON.parse(stdout) };
	} catch (err) {
		const stdout = err.stdout ? err.stdout.toString() : "";
		let json = null;
		try {
			json = JSON.parse(stdout);
		} catch {
			/* not all failures print JSON */
		}
		return { status: err.status, stdout, json, stderr: err.stderr?.toString() };
	}
}

// ─── --assert-all-done gate ─────────────────────────────────────────────────────

test("--assert-all-done exits 0 when every task is [x] and Status: DONE", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "DONE");
	writeTaskFile(dir, "task-02.md", "DONE");
	const index = writeIndex(dir, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: true, file: "task-02.md" },
	]);

	const r = run(["--tasks-index", index, "--assert-all-done"]);
	assert.strictEqual(r.status, 0);
	assert.strictEqual(r.json.allDone, true);
});

test("--assert-all-done exits 2 when a task is still [ ]", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "DONE");
	writeTaskFile(dir, "task-02.md", "IN_PROGRESS");
	const index = writeIndex(dir, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: false, file: "task-02.md" },
	]);

	const r = run(["--tasks-index", index, "--assert-all-done"]);
	assert.strictEqual(r.status, 2);
	assert.match(r.stderr, /Assertion failed/);
	assert.match(r.stderr, /not all tasks are done/);
	// JSON is still emitted for diagnosis
	assert.strictEqual(r.json.allDone, false);
});

test("--assert-all-done exits 2 on an index/file status mismatch (index [x], file PENDING)", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "PENDING");
	const index = writeIndex(dir, [{ number: 1, done: true, file: "task-01.md" }]);

	const r = run(["--tasks-index", index, "--assert-all-done"]);
	assert.strictEqual(r.status, 2);
	assert.match(r.stderr, /mismatch/i);
});

test("--assert-all-done exits 2 when the tasks index is missing (fail-closed)", () => {
	const dir = mkFeatureDir();
	const missing = path.join(dir, "does-not-exist.md");

	const r = run(["--tasks-index", missing, "--assert-all-done"]);
	assert.strictEqual(r.status, 2);
	assert.match(r.stderr, /not found/i);
	assert.strictEqual(r.json.found, false);
});

test("without --assert-all-done, an incomplete tracker still exits 0 (backward compatible)", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "IN_PROGRESS");
	const index = writeIndex(dir, [{ number: 1, done: false, file: "task-01.md" }]);

	const r = run(["--tasks-index", index]);
	assert.strictEqual(r.status, 0);
	assert.strictEqual(r.json.allDone, false);
});

test("--assert-all-done exits 2 when a referenced task file is missing, even if the index marks it [x]", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "DONE");
	// task-02 is marked [x] in the index but its file was never written — without
	// the fileErrors gate this would pass as allDone and ship a phantom task.
	const index = writeIndex(dir, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: true, file: "task-02.md" },
	]);

	const r = run(["--tasks-index", index, "--assert-all-done"]);
	assert.strictEqual(r.status, 2);
	assert.match(r.stderr, /missing or unreadable/i);
	assert.match(r.stderr, /task-02\.md/);
	assert.strictEqual(r.json.fileErrors.length, 1);
	assert.strictEqual(r.json.fileErrors[0].number, 2);
});

test("fileErrors is empty when every referenced task file resolves", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "DONE");
	const index = writeIndex(dir, [{ number: 1, done: true, file: "task-01.md" }]);

	const r = run(["--tasks-index", index]);
	assert.strictEqual(r.status, 0);
	assert.deepStrictEqual(r.json.fileErrors, []);
});

test("--assert-all-done reports every open task in stderr", () => {
	const dir = mkFeatureDir();
	writeTaskFile(dir, "task-01.md", "DONE");
	writeTaskFile(dir, "task-02.md", "PENDING");
	writeTaskFile(dir, "task-03.md", "IN_PROGRESS");
	const index = writeIndex(dir, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: false, file: "task-02.md" },
		{ number: 3, done: false, file: "task-03.md" },
	]);

	const r = run(["--tasks-index", index, "--assert-all-done"]);
	assert.strictEqual(r.status, 2);
	assert.match(r.stderr, /#2/);
	assert.match(r.stderr, /#3/);
});

// ─── Dispatch pointers (task/spec/PRD by path) ────────────────────────────────

test("each task carries absolute dispatch pointers resolved from its header (spec/PRD relative to plans/)", () => {
	const dir = mkFeatureDir();
	const plans = path.join(dir, "plans");
	fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
	fs.mkdirSync(path.join(dir, "prd"), { recursive: true });
	fs.mkdirSync(plans, { recursive: true });
	fs.writeFileSync(path.join(dir, "specs", "f-design.md"), "# spec\n");
	fs.writeFileSync(
		path.join(plans, "task-01.md"),
		"# Task 1\n\n**Status:** PENDING\n**PRD:** `../prd/prd-f.md`\n**Spec:** `../specs/f-design.md`\n**Tier:** Cheap\n\n## Passos\n",
	);
	fs.writeFileSync(
		path.join(plans, "task-02.md"),
		"# Task 2\n\n**Status:** PENDING\n**PRD:** N/A\n**Spec:** ../specs/missing.md\n\n## Passos\n",
	);
	const indexPath = writeIndex(plans, [
		{ number: 1, done: false, file: "task-01.md" },
		{ number: 2, done: false, file: "task-02.md" },
	]);
	const { json } = run(["--tasks-index", indexPath]);
	const [t1, t2] = json.pending;
	assert.strictEqual(t1.taskPath, path.join(plans, "task-01.md"));
	assert.strictEqual(t1.tier, "cheap");
	assert.strictEqual(t1.specPath, path.join(dir, "specs", "f-design.md"));
	assert.strictEqual(t1.specResolves, true);
	assert.strictEqual(t1.prdPath, path.join(dir, "prd", "prd-f.md"));
	assert.strictEqual(t1.prdResolves, false, "PRD path is resolved even when the file is missing");
	assert.strictEqual(t1.prdNA, false);
	assert.strictEqual(t2.prdNA, true, "N/A PRD is flagged, not resolved");
	assert.strictEqual(t2.prdPath, null);
	assert.strictEqual(t2.specResolves, false, "a spec path that does not exist reports specResolves:false");
	assert.strictEqual(t2.tier, null);
});

// ─── Deliverables of DONE tasks must exist ─────────────────────────────────────
// Two headless runs (S8.0) started from an index with every task [x]/DONE and no code
// in the tree; the controller stopped by judgment. This makes it a datum and a gate.

function writeTaskWithFiles(dir, name, status, files) {
	const lines = files.map((f) => `- ${f.kind}: \`${f.path}\``).join("\n");
	fs.writeFileSync(
		path.join(dir, name),
		`# Task\n\n**Status:** ${status}\n\n## Arquivos\n\n${lines}\n\n## Passos\n`,
	);
}

test("a DONE task whose declared files are missing is reported and fails --assert-all-done", () => {
	const root = mkFeatureDir();
	const plans = path.join(root, "docs", "plans");
	fs.mkdirSync(plans, { recursive: true });
	fs.mkdirSync(path.join(root, "src"), { recursive: true });
	fs.writeFileSync(path.join(root, "src", "count.js"), "");
	writeTaskWithFiles(plans, "task-01.md", "DONE", [{ kind: "Create", path: "src/tokenize.js" }, { kind: "Test", path: "test/tokenize.test.js" }]);
	writeTaskWithFiles(plans, "task-02.md", "DONE", [{ kind: "Create", path: "src/count.js" }]);
	const index = writeIndex(plans, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: true, file: "task-02.md" },
	]);
	const r = run(["--tasks-index", index, "--repo-root", root]);
	assert.strictEqual(r.status, 0);
	assert.strictEqual(r.json.allDone, true, "the tracker itself still reads as done");
	assert.deepStrictEqual(r.json.missingDeliverables.map((m) => `${m.number}:${m.path}`), ["1:src/tokenize.js", "1:test/tokenize.test.js"]);
	const g = run(["--tasks-index", index, "--repo-root", root, "--assert-all-done"]);
	assert.strictEqual(g.status, 2);
	assert.match(g.stderr, /a DONE task declares are not on disk/);
	assert.match(g.stderr, /#1 src\/tokenize\.js/);
});

test("--assert-all-done passes when every DONE task's declared files exist; a PENDING task's absent files are not counted", () => {
	const root = mkFeatureDir();
	const plans = path.join(root, "docs", "plans");
	fs.mkdirSync(plans, { recursive: true });
	fs.mkdirSync(path.join(root, "src"), { recursive: true });
	fs.writeFileSync(path.join(root, "src", "a.js"), "");
	writeTaskWithFiles(plans, "task-01.md", "DONE", [{ kind: "Modify", path: "src/a.js" }]);
	writeTaskWithFiles(plans, "task-02.md", "PENDING", [{ kind: "Create", path: "src/not-yet.js" }]);
	const index = writeIndex(plans, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: false, file: "task-02.md" },
	]);
	const r = run(["--tasks-index", index, "--repo-root", root]);
	assert.deepStrictEqual(r.json.missingDeliverables, []);
	fs.writeFileSync(path.join(plans, "task-02.md"), `# Task\n\n**Status:** DONE\n\n## Arquivos\n\n- Create: \`src/a.js\`\n`);
	const done = writeIndex(plans, [
		{ number: 1, done: true, file: "task-01.md" },
		{ number: 2, done: true, file: "task-02.md" },
	]);
	assert.strictEqual(run(["--tasks-index", done, "--repo-root", root, "--assert-all-done"]).status, 0);
});
