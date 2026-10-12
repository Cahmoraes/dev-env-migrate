#!/usr/bin/env node
/**
 * parse-tasks.cjs — Parse a superpowers tasks index and individual task files.
 *
 * Usage:
 *   node scripts/parse-tasks.cjs --tasks-index <path>
 *
 * Exit codes:
 *   0 — success (including "file not found" — that is not an error)
 *   1 — usage error or runtime failure (bad args, unreadable index)
 *
 * Output (stdout): JSON
 * Diagnostics (stderr): warnings only
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ledger = require("./lib/ledger.cjs");

// ─── CLI ─────────────────────────────────────────────────────────────────────

const HELP = `
parse-tasks.cjs — Parse a superpowers tasks index and individual task files.

Usage:
  node scripts/parse-tasks.cjs --tasks-index <path>

Options:
  --tasks-index <path>  Path to the tasks index file (tasks-<feature>.md)
  --assert-all-done     Turn the output into a deterministic gate: exit 2 unless
                        all tasks are [x], Status: DONE, index/file match, and every
                        file a DONE task declares under ## Arquivos exists on disk.
                        (JSON still printed to stdout for diagnosis.)
  --repo-root <path>    Root the task files' paths resolve against (default: the git
                        toplevel of the index's directory, else the cwd)
  --help                Show this help text and exit 0

Output (JSON to stdout):
  {
    "found": boolean,         // false if file does not exist
    "allDone": boolean,       // true when all tasks are [x] and Status: DONE
    "completed": Task[],      // tasks with [x] in index
    "pending": Task[],        // tasks with [ ] in index AND Status: PENDING
    "inProgress": Task[],     // tasks with [ ] in index AND Status: IN_PROGRESS, each with
                              //   "base" (sha7 of its ledger "started" line, or null) and
                              //   "fixRound" (last "fix round <R>" after that line, 0 if none)
    "mismatches": Mismatch[], // index and task-file status disagree
    "missingDeliverables": [{ number, file, path }], // DONE tasks whose declared files are absent
    "indexPath": string
  }

Task object:
  { "number": number, "title": string, "file": string,
    "indexDone": boolean, "fileStatus": string|null, "fileReadError": string|null,
    "taskPath": string,            // absolute path of task-NN.md
    "tier": string|null,           // **Tier:** header, lower-cased
    "specPath": string|null,       // **Spec:** resolved to an absolute path
    "specResolves": boolean,       // that file exists on disk
    "prdPath": string|null,        // **PRD:** resolved to an absolute path (null when N/A)
    "prdNA": boolean,              // header says N/A
    "prdResolves": boolean,        // that file exists on disk
    "requirements": string[] }     // FR-NNN ids from the task file's "# Task N:" title (plus any
                                   //   a legacy index line still carries), for the QA gate's
                                   //   story → task mapping

Mismatch object:
  { "file": string, "indexDone": boolean, "fileStatus": string, "description": string }

Exit codes:
  0  success (including "file not found", unless --assert-all-done)
  1  usage error or unrecoverable runtime failure
  2  --assert-all-done was set and not every task is done/consistent
`.trimStart();

function usage(msg) {
	process.stderr.write(`Error: ${msg}\n\nRun with --help for usage.\n`);
	process.exit(1);
}

function parseArgs(argv) {
	const args = argv.slice(2);
	if (args.includes("--help") || args.includes("-h")) {
		process.stdout.write(HELP);
		process.exit(0);
	}
	const opts = { indexPath: null, assertAllDone: false, repoRoot: null };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--tasks-index" && args[i + 1]) {
			opts.indexPath = args[++i];
		} else if (args[i] === "--assert-all-done") {
			opts.assertAllDone = true;
		} else if (args[i] === "--repo-root") {
			opts.repoRoot = args[i + 1] || null;
			if (!opts.repoRoot) usage("--repo-root requires a path");
			i += 1;
		}
	}
	if (!opts.indexPath) usage("--tasks-index <path> is required");
	return opts;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse task lines from the index.
 * Matches: `- [x] N. Title → \`file.md\`` (various formats)
 */
function parseIndexTasks(content) {
	const tasks = [];
	// Match lines like:  - [ ] 3. Title → `task-03.md`
	// or a legacy line:  - [x] 3. Title [FR-003] → `task-03.md`
	const lineRe =
		/^-\s+\[([ xX])\]\s+(\d+)\.\s+(.+?)\s*(?:→|->)\s*`([^`]+\.md)`/;
	for (const line of content.split("\n")) {
		const m = line.match(lineRe);
		if (!m) continue;
		const done = m[1].toLowerCase() === "x";
		tasks.push({
			number: parseInt(m[2], 10),
			title: m[3].trim(),
			file: m[4].trim(),
			indexDone: done,
		});
	}
	return tasks;
}

/**
 * Extract **Status:** value from a task file.
 * Returns one of: DONE | IN_PROGRESS | PENDING | null (not found)
 */
function parseTaskFileStatus(content) {
	const m = content.match(/^\*\*Status:\*\*\s*(\S+)/m);
	return m ? m[1].trim().toUpperCase() : null;
}

/**
 * Detect mismatches between the index [x]/[ ] and the task file **Status:**.
 *
 * A mismatch is:
 *   - index says [x]  but file Status is NOT DONE
 *   - index says [ ]  but file Status is DONE
 */
function detectMismatch(task) {
	const { indexDone, fileStatus } = task;
	if (fileStatus === null) return null; // can't detect — no status in file

	const fileDone = fileStatus === "DONE";
	if (indexDone && !fileDone) {
		return {
			file: task.file,
			indexDone: true,
			fileStatus,
			description: `Index marks [x] but task file has Status: ${fileStatus}`,
		};
	}
	if (!indexDone && fileDone) {
		return {
			file: task.file,
			indexDone: false,
			fileStatus,
			description: `Index marks [ ] but task file has Status: DONE`,
		};
	}
	return null;
}

// Resolve the dispatch pointers of a task file from its header: absolute task path,
// **Tier:**, and the **PRD:**/**Spec:** paths resolved relative to the task file
// (they are written relative to plans/, e.g. `../specs/<feature>-design.md`).
// `N/A` PRD → prdPath null + prdNA true. An unreadable file (content null) yields nulls.
// The controller passes these pointers to the implementer/reviewers instead of
// reading the documents into its own context.

function parseTaskHeaderPointers(taskFilePath, content) {
	const out = {
		taskPath: path.resolve(taskFilePath),
		tier: null,
		specPath: null,
		specResolves: false,
		prdPath: null,
		prdNA: false,
		prdResolves: false,
	};
	if (content === null) return out;
	const field = (name) => {
		const m = content.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+)$`, "m"));
		return m ? m[1].trim().replace(/^`|`$/g, "").trim() : null;
	};
	const tier = field("Tier");
	if (tier) out.tier = tier.toLowerCase();
	const dir = path.dirname(path.resolve(taskFilePath));
	const spec = field("Spec");
	if (spec && !/^n\/?a$/i.test(spec)) {
		out.specPath = path.resolve(dir, spec);
		out.specResolves = fs.existsSync(out.specPath);
	}
	const prd = field("PRD");
	if (prd && /^n\/?a$/i.test(prd)) {
		out.prdNA = true;
	} else if (prd) {
		out.prdPath = path.resolve(dir, prd);
		out.prdResolves = fs.existsSync(out.prdPath);
	}
	return out;
}

// The FR ids a task implements live in its task file's title (`# Task 3: Login [FR-003]`); the
// index line carries only the title a person tracks. A legacy index line may still end in
// `[FR-003]` — both sources are read, so a plan written either way maps a failed story to its task.
const REQUIREMENT_ID = /\b(?:FR|RF)-\d{3,}\b/gu;

function parseRequirements(indexTitle, content) {
	const heading = content === null ? null : content.match(/^#\s+Task\s+\d+\s*:\s*(.+)$/mu);
	const ids = [...(indexTitle.match(REQUIREMENT_ID) || []), ...((heading && heading[1].match(REQUIREMENT_ID)) || [])];
	return [...new Set(ids)];
}

// ─── Deliverables ────────────────────────────────────────────────────────────
// A DONE task whose `## Arquivos` files are not on disk is a tracker that lies: two
// headless runs started from an all-[x] index with no code in the tree, and only the
// controller's own judgment stopped them before re-dispatching task 1. The datum below
// makes that a gate, not a judgment call. Paths are repo-root-relative, as the
// task-file template writes them.

const FILES_HEADING = /^##\s+(?:Arquivos|Files)\s*$/imu;
const DELIVERABLE_LINE = /^\s*[-*]\s+(?:Create|Modify|Test|Criar|Modificar|Teste|Testar)\s*(?:\([^)]*\))?\s*:\s*`([^`]+)`/iu;

function parseDeliverables(content) {
	const out = [];
	let inSection = false;
	for (const line of content.split(/\r?\n/u)) {
		if (FILES_HEADING.test(line)) { inSection = true; continue; }
		if (inSection && /^#{1,6}\s/u.test(line)) break;
		if (!inSection) continue;
		const m = line.match(DELIVERABLE_LINE);
		if (m && !/[*<>]/u.test(m[1])) out.push(m[1].trim());
	}
	return out;
}

function resolveRepoRoot(fromDir, repoRootArg) {
	if (repoRootArg) return path.resolve(repoRootArg);
	try {
		const { execFileSync } = require("child_process");
		return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: fromDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return process.cwd();
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * The progress of a tasks index, in process (sdd-start.cjs and sdd-finish.cjs call it instead of
 * spawning a node). Returns `{ result, warnings }` — the warnings the CLI prints to stderr, never
 * written here. Throws only when the index exists but cannot be read.
 */
function parseTasks({ indexPath, repoRoot: repoRootArg = null }) {
	const absIndexPath = path.resolve(indexPath);
	const warnings = [];

	// File not found is NOT an error — return found: false
	// (exception: under --assert-all-done a missing index fails the gate)
	if (!fs.existsSync(absIndexPath)) {
		return {
			warnings,
			result: {
				found: false,
				allDone: false,
				completed: [],
				pending: [],
				inProgress: [],
				mismatches: [],
				indexPath: absIndexPath,
			},
		};
	}

	let indexContent;
	try {
		indexContent = fs.readFileSync(absIndexPath, "utf8");
	} catch (err) {
		throw new Error(`Error reading tasks index: ${err.message}`);
	}

	const indexDir = path.dirname(absIndexPath);
	const rawTasks = parseIndexTasks(indexContent);

	if (rawTasks.length === 0) {
		warnings.push(`Warning: no task lines found in ${absIndexPath}`);
	}

	// Enrich with task file data; each task file is read once, its content kept for the deliverables check.
	const contents = [];
	const enriched = rawTasks.map((task) => {
		const taskFilePath = path.join(indexDir, task.file);
		let fileStatus = null;
		let fileReadError = null;
		let content = null;

		try {
			content = fs.readFileSync(taskFilePath, "utf8");
			fileStatus = parseTaskFileStatus(content);
			if (fileStatus === null) {
				warnings.push(`Warning: no **Status:** field in ${task.file}`);
			}
		} catch (err) {
			if (err.code === "ENOENT") {
				fileReadError = `File not found: ${taskFilePath}`;
				warnings.push(`Warning: referenced task file not found: ${task.file}`);
			} else {
				fileReadError = err.message;
				warnings.push(`Warning: could not read ${task.file}: ${err.message}`);
			}
		}

		contents.push(content);
		return { ...task, fileStatus, fileReadError, ...parseTaskHeaderPointers(taskFilePath, content), requirements: parseRequirements(task.title, content) };
	});

	// Classify tasks
	const completed = enriched.filter((t) => t.indexDone);
	const incomplete = enriched.filter((t) => !t.indexDone);
	// A resumed IN_PROGRESS task needs the commit it started from (the review range's BASE) and the
	// fix round it reached — the ledger's "started" and "fix round" lines, never the controller's memory.
	const repoRoot = resolveRepoRoot(indexDir, repoRootArg);
	const ledgerFile = ledger.ledgerPathFor(indexDir, repoRoot);
	const ledgerContent = ledger.readLedger(ledgerFile);
	const inProgress = incomplete
		.filter((t) => t.fileStatus === "IN_PROGRESS")
		.map((t) => ({
			...t,
			base: ledger.lastStartedBase(ledgerContent, t.number),
			fixRound: ledger.lastFixRound(ledgerContent, t.number),
		}));
	const pending = incomplete.filter((t) => t.fileStatus !== "IN_PROGRESS");

	// Detect mismatches
	const mismatches = enriched.reduce((acc, task) => {
		const m = detectMismatch(task);
		if (m) acc.push(m);
		return acc;
	}, []);

	// A task whose file the index references but that is missing or unreadable would
	// otherwise fall silently into `pending` (no Status → no mismatch) and become
	// dispatchable on resume. Surface it explicitly so the caller stops to resolve it.
	const fileErrors = enriched
		.filter((t) => t.fileReadError !== null)
		.map((t) => ({ number: t.number, file: t.file, error: t.fileReadError }));

	const allDone =
		enriched.length > 0 &&
		enriched.every((t) => t.indexDone && t.fileStatus === "DONE");

	// Every file a DONE task declares must exist — otherwise DONE is a claim, not a state.
	const missingDeliverables = [];
	enriched.forEach((t, i) => {
		if (!(t.indexDone && t.fileStatus === "DONE") || t.fileReadError !== null) return;
		for (const rel of parseDeliverables(contents[i])) {
			if (!fs.existsSync(path.resolve(repoRoot, rel))) missingDeliverables.push({ number: t.number, file: t.file, path: rel });
		}
	});

	return {
		warnings,
		result: {
			found: true,
			allDone,
			completed,
			pending,
			inProgress,
			mismatches,
			fileErrors,
			missingDeliverables,
			indexPath: absIndexPath,
			ledgerPath: ledgerContent === null ? null : ledgerFile,
		},
	};
}

/**
 * Why `result` fails --assert-all-done: one reason per failed condition, empty when it passes.
 * A missing index is not listed here — the gate reports it with its own message.
 */
function assertionReasons(result) {
	const { allDone, pending, inProgress, mismatches, fileErrors, missingDeliverables } = result;
	const reasons = [];
	if (!allDone) {
		const open = [...pending, ...inProgress]
			.map((t) => `#${t.number} ${t.title} (${t.fileStatus || "no status"})`)
			.join(", ");
		reasons.push(`not all tasks are done — still open: ${open || "unknown"}`);
	}
	if (mismatches.length > 0) {
		reasons.push(
			`${mismatches.length} index/file status mismatch(es): ` +
				mismatches.map((m) => `${m.file} — ${m.description}`).join("; "),
		);
	}
	if (fileErrors.length > 0) {
		reasons.push(
			`${fileErrors.length} referenced task file(s) missing or unreadable: ` +
				fileErrors.map((e) => `${e.file} — ${e.error}`).join("; "),
		);
	}
	if (missingDeliverables.length > 0) {
		reasons.push(
			`${missingDeliverables.length} file(s) a DONE task declares are not on disk (the tracker says done, the tree does not): ` +
				missingDeliverables.map((m) => `#${m.number} ${m.path}`).join("; "),
		);
	}
	return reasons;
}

function main() {
	const opts = parseArgs(process.argv);
	let parsed;
	try {
		parsed = parseTasks(opts);
	} catch (err) {
		process.stderr.write(`${err.message}\n`);
		process.exit(1);
	}
	const { result, warnings } = parsed;
	warnings.forEach((w) => process.stderr.write(`${w}\n`));
	process.stdout.write(JSON.stringify(result, null, 2) + "\n");

	// --assert-all-done turns the result into a deterministic gate via exit code,
	// so a caller cannot "forget" to honor it the way a JSON-only check can be skipped.
	if (opts.assertAllDone) {
		if (!result.found) {
			process.stderr.write(
				`Assertion failed (--assert-all-done): tasks index not found at ${result.indexPath}\n`,
			);
			process.exit(2);
		}
		const reasons = assertionReasons(result);
		if (reasons.length > 0) {
			process.stderr.write(
				`Assertion failed (--assert-all-done):\n  - ${reasons.join("\n  - ")}\n`,
			);
			process.exit(2);
		}
	}

	process.exit(0);
}

module.exports = { parseTasks, assertionReasons };

if (require.main === module) main();
