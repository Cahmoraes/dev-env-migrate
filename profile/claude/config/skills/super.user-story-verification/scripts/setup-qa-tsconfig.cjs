#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
setup-qa-tsconfig.cjs — Give QA evidence folders a TypeScript "owner" so the
editor (and tsserver) resolve path aliases (e.g. "@/lib/...") and plain
package imports (e.g. "vitest") the same way the real app does, without
copying acceptance tests into the project source tree.

Two problems, two fixes, one command per fix:

1. "@/*" and other tsconfig path aliases are broken in
   docs/superpowers/<feature>/qa/evidence/<slug>/ because no tsconfig
   "include"s that directory — fixed by a tsconfig.json there that extends
   a centralized template with the app's own "paths" rewritten to be
   relative to the QA root.
2. Plain package imports ("vitest", "react", ...) are broken because
   Node/TS module resolution walks up from the *file's disk location*
   looking for a node_modules folder — that is not controlled by tsconfig
   at all. Fixed by a node_modules symlink into the evidence folder,
   pointing at the real app's node_modules.

Usage:
  node scripts/setup-qa-tsconfig.cjs --ensure-templates --repo-root <path>
    [--qa-root <path>] [--frontend-app-root <path>] [--backend-app-root <path>] [--force]

  node scripts/setup-qa-tsconfig.cjs --scaffold-evidence --repo-root <path>
    --evidence-dir <path> --kind frontend|backend [--qa-root <path>] [--force]

Options:
  --ensure-templates     Run once per repo (or per new app). Auto-detects the
                          frontend/backend app roots (package.json + tsconfig.json,
                          classified by dependencies) and writes
                          <qa-root>/tsconfig.frontend-qa.json and/or
                          tsconfig.backend-qa.json plus a manifest recording
                          which app root each extends. Idempotent — re-running
                          without --force is a no-op if the templates already exist.
  --scaffold-evidence     Run once per evidence folder that gets a new JS/TS
                          acceptance test. Writes a 1-line tsconfig.json (extends
                          the centralized template) and a node_modules symlink
                          into the evidence folder. Requires --ensure-templates
                          to have run first for the given --kind.
  --repo-root <path>      Monorepo/project root. Required.
  --qa-root <path>        QA templates root, relative to --repo-root.
                          Default: docs/superpowers
  --evidence-dir <path>   Evidence folder to scaffold (absolute, or relative to
                          --repo-root). Required for --scaffold-evidence.
  --kind frontend|backend Which template/app to use. Required for --scaffold-evidence.
  --frontend-app-root <path>  Override auto-detection for the frontend app root
                          (relative to --repo-root).
  --backend-app-root <path>   Override auto-detection for the backend app root
                          (relative to --repo-root).
  --force                 Overwrite existing templates/tsconfig/symlink.
  --help                  Show usage and exit 0
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
	const flags = {
		mode: null,
		repoRoot: null,
		qaRoot: "docs/superpowers",
		evidenceDir: null,
		kind: null,
		frontendAppRoot: null,
		backendAppRoot: null,
		force: false,
	};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const next = () => {
			const value = args[index + 1];
			if (value === undefined) usage(`${arg} requires a value`);
			index += 1;
			return value;
		};
		switch (arg) {
			case "--ensure-templates":
				flags.mode = "ensure-templates";
				break;
			case "--scaffold-evidence":
				flags.mode = "scaffold-evidence";
				break;
			case "--repo-root":
				flags.repoRoot = path.resolve(next());
				break;
			case "--qa-root":
				flags.qaRoot = next();
				break;
			case "--evidence-dir":
				flags.evidenceDir = next();
				break;
			case "--kind":
				flags.kind = next();
				break;
			case "--frontend-app-root":
				flags.frontendAppRoot = next();
				break;
			case "--backend-app-root":
				flags.backendAppRoot = next();
				break;
			case "--force":
				flags.force = true;
				break;
			default:
				usage(`Unknown argument: ${arg}`);
		}
	}
	if (!flags.mode) usage("one of --ensure-templates or --scaffold-evidence is required");
	if (!flags.repoRoot) usage("--repo-root <path> is required");
	if (flags.mode === "scaffold-evidence") {
		if (!flags.evidenceDir) usage("--evidence-dir <path> is required for --scaffold-evidence");
		if (!flags.kind || !["frontend", "backend"].includes(flags.kind)) {
			usage('--kind frontend|backend is required for --scaffold-evidence');
		}
	}
	return flags;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"coverage",
	".next",
	".turbo",
	".cache",
	".vscode",
	".idea",
	"tmp",
	// QA evidence never contains an app (no package.json there), and skipping
	// it avoids uselessly re-walking every past evidence folder on each run.
	"docs",
	// A harness or super.using-git-worktrees run can leave git worktrees under
	// .claude/worktrees/<name>/ that mirror the repo's own app directories
	// (their own apps/frontend, apps/backend...) — a real run against a repo
	// with an active worktree misclassified as "ambiguous" because the
	// worktree's copy was picked up as a second candidate for the same kind.
	".claude",
]);

// "vite" is deliberately excluded: it is vitest's engine dependency, so any
// backend using vitest for tests carries "vite" in devDependencies too —
// including it here made real backend apps misclassify as ambiguous
// (matches both marker sets) and get silently skipped by resolveAppRootForKind.
const FRONTEND_MARKERS = ["react", "next", "vue", "svelte"];
const BACKEND_MARKERS = ["@nestjs/core", "express", "fastify", "koa"];
const MAX_WALK_DEPTH = 5;

// tsconfig.json commonly carries // and /* */ comments and trailing commas
// (JSONC), which JSON.parse rejects. Try strict JSON first; only fall back
// to stripping comments if that fails. Comment stripping is string-aware —
// tsconfig path/include values are full of "/*" and "*/"-shaped substrings
// ("@/*", "**/*.ts") that a naive regex would misread as comment delimiters
// and corrupt, so this walks the source character by character and only
// treats "//" or "/*" as a comment when it is outside a string literal.
function stripJsoncComments(content) {
	let out = "";
	let inString = false;
	for (let i = 0; i < content.length; i += 1) {
		const ch = content[i];
		const next = content[i + 1];
		if (inString) {
			out += ch;
			if (ch === "\\" && next !== undefined) {
				out += next;
				i += 1;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			continue;
		}
		if (ch === "/" && next === "/") {
			while (i < content.length && content[i] !== "\n") i += 1;
			out += "\n";
			continue;
		}
		if (ch === "/" && next === "*") {
			i += 2;
			while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i += 1;
			i += 1; // land on the closing "/"; the loop's i += 1 lands past it
			continue;
		}
		out += ch;
	}
	return out;
}

function parseJsonc(content) {
	try {
		return JSON.parse(content);
	} catch {
		const stripped = stripJsoncComments(content).replace(/,(\s*[}\]])/gu, "$1");
		return JSON.parse(stripped);
	}
}

// path.relative yields OS-native separators (backslashes on Windows); every
// path we emit into JSON (tsconfig "extends"/"paths", manifest, result) and
// every symlink target must be POSIX "/"-separated to stay portable.
function toPosixRelative(fromDir, toPath) {
	return path.relative(fromDir, toPath).split(path.sep).join("/");
}

function toRelativeSpecifier(fromDir, toPath) {
	const rel = toPosixRelative(fromDir, toPath);
	return rel.startsWith(".") ? rel : `./${rel}`;
}

function findAppCandidates(repoRoot) {
	const candidates = [];
	function walk(dir, depth) {
		if (depth > MAX_WALK_DEPTH) return;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		let hasPackageJson = false;
		let hasTsconfig = false;
		const subdirs = [];
		for (const e of entries) {
			if (e.isDirectory()) {
				if (!SKIP_DIRS.has(e.name)) subdirs.push(e.name);
			} else if (e.isFile()) {
				if (e.name === "package.json") hasPackageJson = true;
				else if (e.name === "tsconfig.json") hasTsconfig = true;
			}
		}
		if (hasPackageJson && hasTsconfig) candidates.push(dir);
		if (depth < MAX_WALK_DEPTH) for (const name of subdirs) walk(path.join(dir, name), depth + 1);
	}
	walk(repoRoot, 0);
	return candidates;
}

// A "solution-style" tsconfig (TS project-references root) declares
// "files": [] and no "include" — it owns zero source files itself and
// exists only to fan out to "references". Without this check it would be
// misread as a real (empty) app root during auto-detection.
function isSolutionStyleTsconfig(tsconfig) {
	const filesEmpty = Array.isArray(tsconfig.files) && tsconfig.files.length === 0;
	const noInclude = !tsconfig.include;
	return filesEmpty && noInclude;
}

function classifyAppRoot(appRoot) {
	const pkgPath = path.join(appRoot, "package.json");
	const tsconfigPath = path.join(appRoot, "tsconfig.json");
	let pkg;
	let tsconfig;
	try {
		pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		tsconfig = parseJsonc(fs.readFileSync(tsconfigPath, "utf8"));
	} catch {
		return { kind: null, reason: "unreadable package.json or tsconfig.json" };
	}
	if (isSolutionStyleTsconfig(tsconfig)) {
		return { kind: null, reason: "solution-style tsconfig (references only, no include)" };
	}
	const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
	const isFrontend = FRONTEND_MARKERS.some((marker) => deps[marker]);
	const isBackend = BACKEND_MARKERS.some((marker) => deps[marker]);
	// The parsed tsconfig rides along so ensureTemplates does not re-read it.
	if (isFrontend && !isBackend) return { kind: "frontend", reason: null, tsconfig };
	if (isBackend && !isFrontend) return { kind: "backend", reason: null, tsconfig };
	if (isFrontend && isBackend) return { kind: null, reason: "matches both frontend and backend markers" };
	return { kind: null, reason: "no recognized frontend/backend dependency markers" };
}

function rewritePathsForQaRoot(tsconfig, appRoot, qaRoot) {
	const compilerOptions = tsconfig.compilerOptions || {};
	const baseUrl = compilerOptions.baseUrl || ".";
	const paths = compilerOptions.paths || {};
	const rewritten = {};
	Object.keys(paths).forEach((alias) => {
		rewritten[alias] = paths[alias].map((target) => {
			const absoluteTarget = path.resolve(appRoot, baseUrl, target);
			return toRelativeSpecifier(qaRoot, absoluteTarget);
		});
	});
	return rewritten;
}

function readManifest(qaRoot) {
	const manifestPath = path.join(qaRoot, ".qa-tsconfig-manifest.json");
	if (!fs.existsSync(manifestPath)) return {};
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	} catch {
		return {};
	}
}

function writeManifest(qaRoot, manifest) {
	const manifestPath = path.join(qaRoot, ".qa-tsconfig-manifest.json");
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	return manifestPath;
}

// ---------------------------------------------------------------------------
// --ensure-templates
// ---------------------------------------------------------------------------

// Walk + classify every app candidate once. classifyAppRoot reads and parses
// each app's package.json and tsconfig.json, so this is the expensive part —
// callers share one result across the frontend and backend passes instead of
// re-walking and re-parsing the tree per kind.
function classifyCandidates(repoRoot) {
	return findAppCandidates(repoRoot).map((appRoot) => ({
		appRoot,
		classification: classifyAppRoot(appRoot),
	}));
}

function resolveAppRootForKind(repoRoot, kind, overridePath, classified) {
	if (overridePath) {
		const appRoot = path.resolve(repoRoot, overridePath);
		const classification = classifyAppRoot(appRoot);
		return { appRoot, classification, source: "override" };
	}
	const matching = classified.filter((c) => c.classification.kind === kind);
	if (matching.length === 1) {
		return { appRoot: matching[0].appRoot, classification: matching[0].classification, source: "auto-detected" };
	}
	if (matching.length > 1) {
		return {
			appRoot: null,
			classification: null,
			source: "ambiguous",
			ambiguousReason: "multiple-candidates",
			ambiguousCandidates: matching.map((c) => c.appRoot),
		};
	}
	// No directory classified cleanly as `kind`. A directory that matches BOTH
	// frontend and backend markers (e.g. a backend that also depends on react
	// for server-rendered templates) is a real repo shape, not "not found" —
	// surface it the same way as a same-kind ambiguity so the user knows to
	// disambiguate via --<kind>-app-root, instead of silently dropping it
	// (indistinguishable from a genuinely single-stack repo otherwise). It gets
	// its own `ambiguousReason` because the natural warning wording differs:
	// this is ONE directory whose kind is unclear, not several directories
	// competing for the same kind — "multiple candidates found: <one path>"
	// read as a lie when only one path is ever listed.
	const dualMatch = classified.filter((c) => c.classification.reason === "matches both frontend and backend markers");
	if (dualMatch.length > 0) {
		return {
			appRoot: null,
			classification: null,
			source: "ambiguous",
			ambiguousReason: "dual-kind-match",
			ambiguousCandidates: dualMatch.map((c) => c.appRoot),
		};
	}
	return { appRoot: null, classification: null, source: "not-found", ambiguousReason: null, ambiguousCandidates: [] };
}

function ensureTemplates(flags) {
	const repoRoot = flags.repoRoot;
	const qaRoot = path.resolve(repoRoot, flags.qaRoot);
	fs.mkdirSync(qaRoot, { recursive: true });
	const manifest = readManifest(qaRoot);
	const templates = [];
	const warnings = [];

	// Discover + classify candidates once, shared by both kinds. Skip the walk
	// entirely when both kinds are explicitly overridden (nothing to detect).
	const classified =
		flags.frontendAppRoot && flags.backendAppRoot ? [] : classifyCandidates(repoRoot);

	["frontend", "backend"].forEach((kind) => {
		const override = kind === "frontend" ? flags.frontendAppRoot : flags.backendAppRoot;
		const resolved = resolveAppRootForKind(repoRoot, kind, override, classified);
		if (!resolved.appRoot) {
			if (resolved.source === "ambiguous" && resolved.ambiguousReason === "dual-kind-match") {
				warnings.push(
					`Ambiguous ${kind} app root — ${resolved.ambiguousCandidates.join(", ")} matches both frontend and backend markers, so it can't be classified as ${kind} automatically. Re-run with --${kind}-app-root ${resolved.ambiguousCandidates[0]} to confirm it explicitly.`,
				);
			} else if (resolved.source === "ambiguous") {
				warnings.push(
					`Ambiguous ${kind} app root — multiple candidates found: ${resolved.ambiguousCandidates.join(", ")}. Re-run with --${kind}-app-root <path> to disambiguate.`,
				);
			}
			// "not-found" is not a warning — plenty of repos are single-stack
			// (e.g. backend-only), so no frontend candidate is expected.
			return;
		}
		// An explicit --<kind>-app-root override exists precisely to let the
		// user resolve what the automatic classifier can't (e.g. a backend
		// that also depends on react for server-rendered templates, which
		// legitimately matches both marker sets). Trust it unconditionally —
		// re-applying the same classification gate here would make the
		// override unable to do the one thing it's for.
		if (resolved.source !== "override" && resolved.classification.kind !== kind) {
			warnings.push(`${kind} app root ${resolved.appRoot} did not classify as ${kind} (${resolved.classification.reason}); skipped.`);
			return;
		}
		const appTsconfigPath = path.join(resolved.appRoot, "tsconfig.json");
		let tsconfig = resolved.classification.tsconfig;
		if (!tsconfig) try {
			tsconfig = parseJsonc(fs.readFileSync(appTsconfigPath, "utf8"));
		} catch (error) {
			warnings.push(`${kind} app root ${resolved.appRoot} has an unreadable tsconfig.json (${error.message}); skipped.`);
			return;
		}
		const templatePath = path.join(qaRoot, `tsconfig.${kind}-qa.json`);
		const alreadyExists = fs.existsSync(templatePath);
		let created = false;
		if (!alreadyExists || flags.force) {
			const templateContent = {
				extends: toRelativeSpecifier(qaRoot, appTsconfigPath),
				compilerOptions: {
					baseUrl: ".",
					paths: rewritePathsForQaRoot(tsconfig, resolved.appRoot, qaRoot),
				},
				include: [`**/qa/evidence/**/*.ts`, `**/qa/evidence/**/*.tsx`],
			};
			fs.writeFileSync(templatePath, `${JSON.stringify(templateContent, null, 2)}\n`, "utf8");
			created = true;
		}
		const relAppRoot = toPosixRelative(repoRoot, resolved.appRoot);
		const relTemplatePath = toPosixRelative(repoRoot, templatePath);
		manifest[kind] = { appRoot: relAppRoot, templatePath: relTemplatePath };
		templates.push({
			kind,
			path: relTemplatePath,
			appRoot: relAppRoot,
			created,
			source: resolved.source,
		});
	});

	writeManifest(qaRoot, manifest);

	return {
		qaRoot: toPosixRelative(repoRoot, qaRoot) || ".",
		templates,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// --scaffold-evidence
// ---------------------------------------------------------------------------

function scaffoldEvidence(flags) {
	const repoRoot = flags.repoRoot;
	const qaRoot = path.resolve(repoRoot, flags.qaRoot);
	const evidenceDir = path.resolve(repoRoot, flags.evidenceDir);
	const manifest = readManifest(qaRoot);
	const entry = manifest[flags.kind];
	if (!entry) {
		return {
			ok: false,
			reason: `No "${flags.kind}" template registered in ${path.relative(repoRoot, qaRoot)}/.qa-tsconfig-manifest.json — run --ensure-templates first.`,
		};
	}

	fs.mkdirSync(evidenceDir, { recursive: true });
	const warnings = [];

	const templatePath = path.resolve(repoRoot, entry.templatePath);
	const tsconfigPath = path.join(evidenceDir, "tsconfig.json");
	const tsconfigAlreadyExists = fs.existsSync(tsconfigPath);
	let tsconfigCreated = false;
	if (!tsconfigAlreadyExists || flags.force) {
		const content = { extends: toRelativeSpecifier(evidenceDir, templatePath) };
		fs.writeFileSync(tsconfigPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
		tsconfigCreated = true;
	}

	const appRoot = path.resolve(repoRoot, entry.appRoot);
	const nodeModulesTarget = path.join(appRoot, "node_modules");
	const symlinkPath = path.join(evidenceDir, "node_modules");
	let symlinkCreated = false;
	if (!fs.existsSync(nodeModulesTarget)) {
		warnings.push(`${nodeModulesTarget} does not exist — install dependencies for ${entry.appRoot} first; symlink skipped.`);
	} else {
		let existingStat;
		let statFailed = false;
		try {
			existingStat = fs.lstatSync(symlinkPath, { throwIfNoEntry: false });
		} catch (error) {
			statFailed = true;
			warnings.push(`Could not check ${symlinkPath} (${error.message}); symlink skipped.`);
		}
		if (!statFailed) {
			if (existingStat && !existingStat.isSymbolicLink()) {
				warnings.push(`${symlinkPath} already exists and is not a symlink — left untouched.`);
			} else if (existingStat && flags.force) {
				fs.rmSync(symlinkPath, { force: true });
			}
			if (!existingStat || (existingStat.isSymbolicLink() && flags.force)) {
				fs.symlinkSync(toPosixRelative(evidenceDir, nodeModulesTarget), symlinkPath, "dir");
				symlinkCreated = true;
			}
		}
	}

	return {
		ok: true,
		tsconfigPath: toPosixRelative(repoRoot, tsconfigPath),
		tsconfigCreated,
		symlinkPath: toPosixRelative(repoRoot, symlinkPath),
		symlinkCreated,
		symlinkTarget: toPosixRelative(repoRoot, nodeModulesTarget),
		warnings,
	};
}

// ---------------------------------------------------------------------------

function main() {
	const flags = parseArgs(process.argv);
	const result =
		flags.mode === "ensure-templates" ? ensureTemplates(flags) : scaffoldEvidence(flags);
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	process.exit(0);
}

main();
