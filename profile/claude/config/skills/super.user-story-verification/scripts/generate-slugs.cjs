#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
generate-slugs.cjs — Extract Portuguese user stories from a PRD.

Matches lines in "Como <persona>, eu quero <ação> para que <benefício>" form,
with or without a leading ID marker (e.g. "- **US-01**: Como ...", "US-02 — Como ...").
The canonical English prefix is US- ("User Story"). The legacy Portuguese prefix
HU- ("História de Usuário") is also accepted and normalized to US- so older PRDs
do not break — the prefix is an opaque ID, never translated in canonical output.
An optional bold title between the ID and "Como" is tolerated
(e.g. "US-01 — **Navegação estável** Como ...").
When a story carries an explicit ID, it is preserved (PRD traceability);
otherwise stories are numbered sequentially (US-001, US-002, ...).

Usage:
  node scripts/generate-slugs.cjs --prd <path>

Options:
  --prd <path>  Path to the PRD markdown file
  --help        Show usage and exit 0
`.trimStart();

function usage(message) {
	process.stderr.write(`Error: ${message}\n\nRun with --help for usage.\n`);
	process.exit(1);
}

function parseArgs(argv) {
	const args = argv.slice(2);
	if (args.includes("--help") || args.includes("-h")) {
		process.stdout.write(`${HELP}\n`);
		process.exit(0);
	}
	let prdPath = null;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--prd") {
			if (!args[index + 1]) usage("--prd <path> is required");
			prdPath = path.resolve(args[index + 1]);
			index += 1;
			continue;
		}
		usage(`Unknown argument: ${arg}`);
	}
	if (!prdPath) usage("--prd <path> is required");
	return { prdPath };
}

function deriveFeatureName(prdPath) {
	const basename = path.basename(prdPath, path.extname(prdPath));
	if (basename.startsWith("prd-")) {
		return basename.slice(4) || null;
	}
	return basename || null;
}

function normalizeWhitespace(value) {
	return value.replace(/\s+/gu, " ").trim();
}

function buildNotFoundResult() {
	return {
		found: false,
		featureName: null,
		userStories: [],
		count: 0,
		warnings: [],
	};
}

function main() {
	const { prdPath } = parseArgs(process.argv);
	if (!fs.existsSync(prdPath)) {
		process.stdout.write(`${JSON.stringify(buildNotFoundResult(), null, 2)}\n`);
		process.exit(0);
	}
	let content;
	try {
		content = fs.readFileSync(prdPath, "utf8");
	} catch (error) {
		process.stderr.write(`Error reading PRD: ${error.message}\n`);
		process.exit(1);
	}
	// Match a user story line, tolerating an optional leading ID marker before
	// "Como" — PRDs label stories in many shapes: `- **US-01**: Como ...`,
	// `**US-02:** Como ...`, `US-03 — Como ...`, `US-04 — **Título** Como ...`,
	// or a bare `Como ...`. The legacy `HU-NN` prefix is accepted too (normalized
	// to US- below). The marker (group 1) is captured so the PRD's own ID is
	// preserved for QA traceability.
	//   g1 = explicit ID (US-NN or legacy HU-NN) or undefined
	//   g2 = full story text from "Como" onward
	//   g3 = role, g4 = want, g5 = benefit
	// After the ID marker, an optional bold title (`**...**`) is consumed and
	// discarded so the captured story text always starts at "Como".
	const storyPattern =
		/^\s*(?:[-*]\s+)?(?:\**\s*((?:US|HU)-\d+)\b[*\s:.—–-]*(?:\*\*[^*\n]+\*\*[\s*:.—–-]*)?)?(Como\s+(.+?),\s*eu quero\s+(.+?)\s+para que\s+(.+?))\s*$/iu;
	const userStories = [];
	content.split(/\r?\n/u).forEach((line) => {
		const match = line.match(storyPattern);
		if (!match) return;
		// Normalize the legacy Portuguese prefix HU- to the canonical English US-.
		const explicitId = match[1]
			? match[1].toUpperCase().replace(/^HU-/u, "US-")
			: null;
		const role = normalizeWhitespace(match[3]);
		const want = normalizeWhitespace(match[4]);
		const benefit = normalizeWhitespace(match[5]);
		// Honor the PRD's explicit ID; otherwise number sequentially.
		const id = explicitId || `US-${String(userStories.length + 1).padStart(3, "0")}`;
		const slugWords = [role, want]
			.join(" ")
			.toLowerCase()
			.replace(/[^a-z0-9\s]/gu, "")
			.trim()
			.split(/\s+/u)
			.slice(0, 5)
			.join("-");
		userStories.push({
			id,
			text: normalizeWhitespace(match[2]),
			role,
			want,
			benefit,
			slug: `${id.toLowerCase()}-${slugWords}`,
		});
	});
	// Silent-failure guard: a PRD with a "## Histórias de Usuário" section but zero extractable
	// stories means every line drifted from the "Como ..., eu quero ... para que ..." shape — the
	// QA gate would then verify nothing while still looking like a success. Surface it.
	const warnings = [];
	const hasStorySection = /^##\s+Hist[óo]rias de Usu[áa]rio\s*$/imu.test(content);
	if (hasStorySection && userStories.length === 0) {
		const warning =
			'A "## Histórias de Usuário" section is present but no line matched the "Como ..., eu quero ... para que ..." shape — 0 user stories extracted. The QA gate would have nothing to verify. Check the user-story line format in the PRD.';
		warnings.push(warning);
		process.stderr.write(`Warning: ${warning}\n`);
	}
	const result = {
		found: true,
		featureName: deriveFeatureName(prdPath),
		userStories,
		count: userStories.length,
		warnings,
	};
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	process.exit(0);
}

main();
