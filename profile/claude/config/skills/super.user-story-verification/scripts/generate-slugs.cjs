#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
generate-slugs.cjs — Extract user stories from a PRD.

A story line opens with a persona and a want — "Como <persona>, eu quero <ação> ..."
("eu" optional) or "As a <persona>, I want <ação> ..." — with or without a
leading ID marker (e.g. "- **US-01**: Como ...", "US-02 — Como ...").
The benefit clause is optional and is split off the want by whatever connector
the author used: "para que", "a fim de (que)", "de modo/forma que", "so that",
"in order to" — or a bare "para <verbo>" ("para consultar", "para não confundir").
No connector => the whole remainder is the want and "benefit" is null; the story
still counts.
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
		!/\b(?:Como|As)\b/iu.test(line)
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

// Split "<want> <connector> <benefit>" without tying the connector to one
// phrasing or one language. Explicit connectors ("para que", "a fim de",
// "so that", "in order to") win at their FIRST occurrence — they are never
// part of a want. Failing those, a bare "para <verbo no infinitivo>" (optionally
// "para não <verbo>") is taken at its LAST occurrence, because "para" also
// introduces indirect objects inside the want ("enviar para o cliente").
// Nothing found => the remainder is the want and the benefit is null.
const EXPLICIT_BENEFIT =
	/\s+(?:para\s+que|a\s+fim\s+de(?:\s+que)?|de\s+(?:modo|forma)\s+que|so\s+that|in\s+order\s+(?:to|that))\s+/iu;
const BARE_BENEFIT = /\s+para\s+(?=(?:n[ãa]o\s+)?\p{L}+(?:ar|er|ir|or|ôr)\b)/giu;

function splitBenefit(rest) {
	const explicit = rest.match(EXPLICIT_BENEFIT);
	if (explicit) {
		return {
			want: rest.slice(0, explicit.index).trim(),
			benefit: rest.slice(explicit.index + explicit[0].length).trim() || null,
		};
	}
	let last = null;
	for (const m of rest.matchAll(BARE_BENEFIT)) last = m;
	if (last && last.index > 0) {
		return {
			want: rest.slice(0, last.index).trim(),
			benefit: rest.slice(last.index + last[0].length).trim() || null,
		};
	}
	return { want: rest.trim(), benefit: null };
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

/**
 * Story -> functional-requirement mapping, read from the PRD rather than inferred.
 *
 * The annotation lives on the REQUIREMENT line, not the story line: requirements are
 * written after the stories exist, so naming the stories there is the natural authoring
 * order -- and it keeps the "Como ..., eu quero ... para que ..." line untouched, whose
 * greedy benefit group would otherwise swallow a trailing FR list.
 *
 *   - **FR-001** (US-01, US-02) - O sistema deve ...
 *
 * Many-to-many by construction: one FR can serve several stories and one story several
 * FRs. A PRD with no annotations is valid and common (every PRD written before this
 * existed) -- it yields empty arrays plus a warning, never an invented mapping.
 */
function extractRequirementMap(content) {
	const byStory = new Map();
	let annotated = false;
	for (const line of content.split("\n")) {
		const requirement = line.match(/\bFR-\d+\b/u);
		if (!requirement) continue;
		const stories = line.match(/\b(?:US|HU)-\d+\b/gu);
		if (!stories) continue;
		annotated = true;
		for (const raw of stories) {
			// Same HU- -> US- normalization the story parser applies, so an annotation
			// written in the legacy Portuguese prefix still lands on its story.
			const id = raw.toUpperCase().replace(/^HU-/u, "US-");
			if (!byStory.has(id)) byStory.set(id, new Set());
			byStory.get(id).add(requirement[0].toUpperCase());
		}
	}
	return {
		annotated,
		requirementsOf: (id) => [...(byStory.get(id) || [])].sort(),
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
	// The entire story sentence may also be wrapped in bold, e.g.
	// `**Como usuário, eu quero X para que Y**`. Leading/trailing `**` are
	// consumed by the pattern and stripped from the captured text below.
	// The pattern anchors only on the persona + want opening (Portuguese or
	// English); the benefit is split off `rest` by splitBenefit below, so a story
	// is never dropped because its author wrote "para consultar" instead of
	// "para que" — that shape sent a real run into manual extraction.
	const storyPattern =
		/^\s*(?:[-*]\s+)?(?:\*\*\s*(?<idWholeBold>(?:US|HU)-\d+)\b[\s:.—–-]*[^*\n]+?\*\*\s*|\**\s*(?<id>(?:US|HU)-\d+)\b[*\s:.—–-]*(?:\*\*[^*\n]+\*\*[\s*:.—–-]*)?)?(?:\*\*\s*)?(?<full>(?:Como|As\s+an?)\s+(?<role>.+?),\s*(?:(?:eu\s+)?quero|I\s+(?:want|need)(?:\s+to)?)\s+(?<rest>.+?))(?:\s*\*\*)?\s*$/iu;
	const matches = [];
	// The optional `**UI:** sim|não` marker rides at the end of the story line, so it must
	// come off BEFORE storyPattern runs: the benefit group is anchored to end-of-line and
	// would otherwise swallow the marker into the story text and the slug.
	const uiMarker =
		/\s*[·|•—–-]?\s*\*{0,2}\s*UI\s*:?\s*\*{0,2}\s*[:\s]\s*\*{0,2}\s*(?<value>sim|s[ií]|yes|true|n[ãa]o|no|false)\s*\*{0,2}\s*$/iu;
	const UI_TRUE = /^(?:sim|s[ií]|yes|true)$/iu;
	mergeWrappedLines(content.split(/\r?\n/u)).forEach((line) => {
		const ui = line.match(uiMarker);
		const uiFacing = ui ? UI_TRUE.test(ui.groups.value) : null;
		const match = (ui ? line.slice(0, ui.index) : line).match(storyPattern);
		if (!match) return;
		const rawId = match.groups.idWholeBold || match.groups.id;
		// Normalize the legacy Portuguese prefix HU- to the canonical English US-.
		const explicitId = rawId ? rawId.toUpperCase().replace(/^HU-/u, "US-") : null;
		// Strip any residual bold markers from the captured story text. This handles
		// cases where the leading `**` was not consumed by the ID/title alternative
		// (e.g. a bare `**Como ...**` line) and any trailing `**` left by the non-
		// greedy benefit group.
		const full = normalizeWhitespace(match.groups.full).replace(/^\*\*|\*\*$/gu, "");
		const { want, benefit } = splitBenefit(
			normalizeWhitespace(match.groups.rest).replace(/^\*\*|\*\*$/gu, ""),
		);
		matches.push({
			uiFacing,
			explicitId,
			role: normalizeWhitespace(match.groups.role).replace(/^\*\*|\*\*$/gu, ""),
			want,
			benefit,
			full,
		});
	});
	// Auto-generated IDs must number from the highest explicit numeric ID seen
	// anywhere in the PRD, not from array position -- otherwise an explicit ID
	// (e.g. US-003) followed by an unlabeled story assigns the unlabeled one a
	// lower/colliding ID (US-002) than one already in use.
	const { requirementsOf, annotated } = extractRequirementMap(content);
	const maxExplicitNum = matches.reduce((max, m) => {
		if (!m.explicitId) return max;
		const num = Number.parseInt(m.explicitId.replace(/^US-/u, ""), 10);
		return Number.isNaN(num) ? max : Math.max(max, num);
	}, 0);
	let autoCounter = maxExplicitNum;
	const userStories = matches.map(({ explicitId, role, want, benefit, full, uiFacing }) => {
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
			requirements: requirementsOf(id),
			// true / false when the PRD declared it, null when it stayed silent. null is
			// what sends the QA gate to its deterministic fallback instead of a judgment
			// call that turned the same feature into PASSED on one run and PARTIAL on another.
			uiFacing,
		};
	});
	// Silent-failure guard: a PRD with a user-stories section but zero extractable
	// stories means every line drifted from the "Como <persona>, (eu) quero ..." /
	// "As a <persona>, I want ..." opening — the QA gate would then verify nothing
	// while still looking like a success. Surface it.
	const warnings = [];
	const hasStorySection = /^##\s+(?:Hist[óo]rias de Usu[áa]rio|User Stories)\s*$/imu.test(content);
	if (hasStorySection && userStories.length === 0) {
		const warning =
			'A user-stories section is present but no line opens with "Como <persona>, (eu) quero ..." or "As a <persona>, I want ..." — 0 user stories extracted. The QA gate would have nothing to verify. Check the user-story line format in the PRD.';
		warnings.push(warning);
		process.stderr.write(`Warning: ${warning}\n`);
	}
	// The QA gate needs each story's FRs at four points (subagent context, result.json
	// `requirements`, the test lookup, the re-run trace). When the PRD annotates
	// nothing, the controller reconstructs the mapping by reading intent -- which two
	// measured sessions did differently for the same PRD. Say so instead of returning a
	// confident empty array.
	if (userStories.length > 0 && !annotated) {
		const warning =
			'No FR->US annotation found: no line carrying an "FR-NNN" id also names a "US-NN". Every story\'s "requirements" is therefore empty, and the QA gate will fall back to deriving the mapping by reading the PRD -- a judgment call that varies run to run. Annotate the requirement lines as "- **FR-001** (US-01, US-02) - ..." to make it a datum.';
		warnings.push(warning);
		process.stderr.write(`Warning: ${warning}\n`);
	}
	// Partial extraction is worse than zero extraction: zero trips the guard above, while
	// "7 story lines in, 2 stories out" looks like a clean success and the QA gate silently
	// verifies a subset of the feature. A line that names a persona and a want but still
	// fails storyPattern (missing comma after the persona, a stray token before "Como") is
	// counted here so the drop is visible.
	const storyish = content
		.split("\n")
		.filter((l) => /^\s*(?:[-*]\s+|>\s*)?\**\s*(?:(?:US|HU)-\d+\b[^\n]*?)?\b(?:Como|As\s+an?)\b/iu.test(l) && /\b(?:quero|want|need)\b/iu.test(l))
		.length;
	if (userStories.length > 0 && storyish > userStories.length) {
		const warning =
			`${storyish} line(s) look like user stories but only ${userStories.length} matched the "<persona>, (eu) quero <ação>" / "<persona>, I want <ação>" opening — ${storyish - userStories.length} were dropped silently. Fix the PRD lines, or extract the missing stories by hand (references/slug-extraction.md) before dispatching: the QA gate verifies only what comes out of here.`;
		warnings.push(warning);
		process.stderr.write(`Warning: ${warning}\n`);
	}
	const result = {
		found: true,
		featureName: deriveFeatureName(prdPath),
		userStories,
		count: userStories.length,
		requirementsMapped: annotated,
		warnings,
	};
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	process.exit(0);
}

main();
