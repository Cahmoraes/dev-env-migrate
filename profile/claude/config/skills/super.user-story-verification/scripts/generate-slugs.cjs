#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
generate-slugs.cjs — Extract Portuguese user stories from a PRD.

Matches lines in "Como <persona>, eu quero <ação> para que <benefício>" form
("eu" before "quero" is optional — "Como X, quero Y" also matches), with or
without a leading ID marker (e.g. "- **US-01**: Como ...", "US-02 — Como ...").
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

// PRDs are frequently hard-wrapped at a fixed column (e.g. ~88 chars), so a
// single user-story sentence often spans two or more physical lines — the
// second line starting mid-sentence with no marker of its own (e.g. "para
// que eu\n  possa corrigir cadastros incorretos."). storyPattern matches one
// physical line at a time, so a wrapped story either fails to match at all
// (the "para que" clause lands entirely on the continuation line) or matches
// with a truncated benefit (matches up to the line break). Join continuation
// lines onto the logical line they belong to before matching: a physical
// line continues the previous one unless it is blank or starts a new
// Markdown block (heading, list item, table row, blockquote) — the same
// "lazy continuation" rule Markdown itself uses for paragraphs and list
// items, so unrelated content is never merged across block boundaries.
function isMarkdownBlockStart(line) {
	if (/^\s*$/u.test(line)) return true;
	if (/^\s{0,3}#{1,6}\s/u.test(line)) return true;
	if (/^\s*[-*+]\s+/u.test(line)) return true;
	if (/^\s*\d+[.)]\s+/u.test(line)) return true;
	if (/^\s*\|/u.test(line)) return true;
	if (/^\s*>/u.test(line)) return true;
	return false;
}

// A bold "**US-NN — Título**" header with no story text of its own puts the
// story on the very next physical line as a Markdown blockquote ("> Como ...")
// — a shape observed in real PRDs. isMarkdownBlockStart treats a
// blockquote as a fresh block for good reason (a genuine quote must never
// bleed into the preceding paragraph), but here the "> " is decorative
// indentation for the header's own story, not an unrelated quote — so this
// one case is merged explicitly, with the leading "> " stripped.
function isIdOnlyBoldHeader(line) {
	return (
		/^\s*(?:[-*]\s+)?\*\*\s*(?:US|HU)-\d+\b[^*\n]*\*\*\s*$/u.test(line) &&
		!/\bComo\b/iu.test(line)
	);
}

function mergeWrappedLines(rawLines) {
	const merged = [];
	for (const line of rawLines) {
		const trimmed = line.trim();
		const previous = merged.length > 0 ? merged[merged.length - 1] : null;
		const continuesIdOnlyHeader =
			previous !== null &&
			isIdOnlyBoldHeader(previous) &&
			/^\s*>\s*/u.test(line);
		const isContinuation =
			merged.length > 0 &&
			trimmed !== "" &&
			previous.trim() !== "" &&
			(continuesIdOnlyHeader || !isMarkdownBlockStart(line));
		if (isContinuation) {
			const content = continuesIdOnlyHeader
				? trimmed.replace(/^>\s*/u, "")
				: trimmed;
			merged[merged.length - 1] = `${merged[merged.length - 1]} ${content}`;
		} else {
			merged.push(line);
		}
	}
	return merged;
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
	// `**US-05 — Título**\nComo ...` (ID and title sharing ONE bold span, story
	// text on the next physical line — a real shape observed in the
	// field), `**US-006 — Título**\n> Como ...` (ID+title
	// on its own line, story on the next line as a blockquote — another real
	// observed shape; merged by mergeWrappedLines), or a
	// bare `Como ...`. The legacy `HU-NN` prefix is accepted too (normalized to
	// US- below). "eu" before "quero" is optional — "Como X, quero Y" (no "eu")
	// is valid Portuguese phrasing, found verbatim in real PRDs.
	// Named groups are used because the ID can be captured by either
	// alternative below.
	// The marker is captured so the PRD's own ID is preserved for QA traceability.
	// After the ID marker, the title (bold or not) is consumed and discarded so
	// the captured story text always starts at "Como".
	// NEW: the entire story sentence may also be wrapped in bold, e.g.
	// `**Como usuário, eu quero X para que Y**`. Leading/trailing `**` are
	// consumed by the pattern and stripped from the captured text below.
	const storyPattern =
		/^\s*(?:[-*]\s+)?(?:\*\*\s*(?<idWholeBold>(?:US|HU)-\d+)\b[\s:.—–-]*[^*\n]+?\*\*\s*|\**\s*(?<id>(?:US|HU)-\d+)\b[*\s:.—–-]*(?:\*\*[^*\n]+\*\*[\s*:.—–-]*)?)?(?:\*\*\s*)?(?<full>Como\s+(?<role>.+?),\s*(?:eu\s+)?quero\s+(?<want>.+?)\s+para que\s+(?<benefit>.+?))(?:\s*\*\*)?\s*$/iu;
	const matches = [];
	mergeWrappedLines(content.split(/\r?\n/u)).forEach((line) => {
		const match = line.match(storyPattern);
		if (!match) return;
		const rawId = match.groups.idWholeBold || match.groups.id;
		// Normalize the legacy Portuguese prefix HU- to the canonical English US-.
		const explicitId = rawId ? rawId.toUpperCase().replace(/^HU-/u, "US-") : null;
		// Strip any residual bold markers from the captured story text. This handles
		// cases where the leading `**` was not consumed by the ID/title alternative
		// (e.g. a bare `**Como ...**` line) and any trailing `**` left by the non-
		// greedy benefit group.
		const full = normalizeWhitespace(match.groups.full).replace(/^\*\*|\*\*$/gu, "");
		matches.push({
			explicitId,
			role: normalizeWhitespace(match.groups.role).replace(/^\*\*|\*\*$/gu, ""),
			want: normalizeWhitespace(match.groups.want).replace(/^\*\*|\*\*$/gu, ""),
			benefit: normalizeWhitespace(match.groups.benefit).replace(/^\*\*|\*\*$/gu, ""),
			full,
		});
	});
	// Auto-generated IDs must number from the highest explicit numeric ID seen
	// anywhere in the PRD, not from array position -- otherwise an explicit ID
	// (e.g. US-003) followed by an unlabeled story assigns the unlabeled one a
	// lower/colliding ID (US-002) than one already in use.
	const maxExplicitNum = matches.reduce((max, m) => {
		if (!m.explicitId) return max;
		const num = Number.parseInt(m.explicitId.replace(/^US-/u, ""), 10);
		return Number.isNaN(num) ? max : Math.max(max, num);
	}, 0);
	let autoCounter = maxExplicitNum;
	const userStories = matches.map(({ explicitId, role, want, benefit, full }) => {
		// Honor the PRD's explicit ID; otherwise number sequentially from
		// maxExplicitNum so auto-generated IDs never collide with explicit ones.
		const id = explicitId || `US-${String((autoCounter += 1)).padStart(3, "0")}`;
		const slugWords = [role, want]
			.join(" ")
			.toLowerCase()
			// Transliterate accented Portuguese letters (á, ç, ã, ...) to their
			// plain ASCII base before stripping non-alphanumerics below -- without
			// this, "usuário"/"transição" lose the accented letter entirely
			// ("usurio", "transio") instead of becoming "usuario"/"transicao".
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/gu, "")
			.replace(/[^a-z0-9\s]/gu, "")
			.trim()
			.split(/\s+/u)
			.slice(0, 5)
			.join("-");
		return {
			id,
			text: full,
			role,
			want,
			benefit,
			slug: `${id.toLowerCase()}-${slugWords}`,
		};
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
