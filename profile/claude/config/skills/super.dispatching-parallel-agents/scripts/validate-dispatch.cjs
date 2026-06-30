#!/usr/bin/env node
/**
 * validate-dispatch.cjs — Pre-flight gate for parallel agent dispatches.
 *
 * Reads a dispatch manifest (JSON) and validates two invariants that prose
 * alone cannot enforce:
 *   1. Every agent has an explicit `model:` (non-empty string). Omitting it
 *      silently inherits the controller's model, burning expensive tokens on
 *      mechanical tasks.
 *   2. No two agents share a file in their write sets. Concurrent agents writing
 *      the same file corrupt each other's work.
 *
 * This script does NOT validate whether parallelism is appropriate for the
 * problem (that is a judgment call documented in the skill's "When to Use"
 * section), nor does it validate prompt quality (self-containedness,
 * specificity of goal/constraints). Those remain human judgment.
 *
 * Usage:
 *   node scripts/validate-dispatch.cjs --dispatch <path.json>
 *
 * Exit codes:
 *   0  ran successfully (inspect `valid` in JSON output — 0 even when valid=false)
 *   1  usage error, unreadable/unparseable manifest, or manifest is not a JSON object
 *
 * Manifest format (JSON):
 *   {
 *     "agents": [
 *       {
 *         "label":      string,    // required — human ID, used in error messages
 *         "model":      string,    // required — must be non-empty
 *         "goal":       string,    // required — what this agent must accomplish
 *         "writeFiles": string[]   // optional — files this agent will modify/create
 *       }
 *     ]
 *   }
 *
 * Output (stdout): JSON
 *   {
 *     "valid":      boolean,   // true = safe to dispatch
 *     "agentCount": number,
 *     "errors":     Error[],   // hard failures — dispatch MUST NOT proceed
 *     "warnings":   Warning[]  // soft concerns — dispatch may proceed
 *   }
 *
 * Error shapes:
 *   { type: "missing_field",  agent: string, field: string }
 *   { type: "empty_model",    agent: string }
 *   { type: "write_conflict", agents: string[], file: string }
 *   { type: "no_agents" }
 *
 * Warning shapes:
 *   { type: "single_agent", message: string }
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HELP = `
validate-dispatch.cjs — Pre-flight gate for parallel agent dispatches.

Usage:
  node scripts/validate-dispatch.cjs --dispatch <path.json>

Options:
  --dispatch <path>  Path to the dispatch manifest JSON file (required)
  --help             Show this help text and exit 0
`.trimStart();

function usage(msg) {
  process.stderr.write(`Error: ${msg}\n\nRun with --help for usage.\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  let dispatchPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--dispatch") {
      if (!args[i + 1]) usage("--dispatch <path> is required");
      dispatchPath = args[i + 1];
      i += 1;
      continue;
    }
    usage(`Unknown argument: ${args[i]}`);
  }
  if (!dispatchPath) usage("--dispatch <path> is required");
  return path.resolve(dispatchPath);
}

function readManifest(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    process.stderr.write(`Error: Cannot read manifest: ${err.message}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Error: Manifest is not valid JSON: ${err.message}\n`);
    process.exit(1);
  }
  // Shape guard at the IO boundary — null and arrays are valid JSON but not valid manifests.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    process.stderr.write("Error: Manifest must be a JSON object\n");
    process.exit(1);
  }
  return parsed;
}

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  const agents = manifest.agents;

  if (!Array.isArray(agents) || agents.length === 0) {
    errors.push({ type: "no_agents" });
    return { errors, warnings, agentCount: 0 };
  }

  if (agents.length === 1) {
    warnings.push({
      type: "single_agent",
      message: "Only 1 agent — parallel dispatch requires 2+. Use a single sequential dispatch instead.",
    });
  }

  const fileToAgents = new Map();

  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i];

    // Guard null/non-object elements — legal JSON array elements, not valid agents.
    if (agent === null || typeof agent !== "object") {
      const placeholder = `agent[${i}]`;
      errors.push({ type: "missing_field", agent: placeholder, field: "label" });
      errors.push({ type: "missing_field", agent: placeholder, field: "model" });
      errors.push({ type: "missing_field", agent: placeholder, field: "goal" });
      continue;
    }

    // Derive label and validate it in one pass — avoids splitting the same predicate
    // across a helper call and a separate missing_field check.
    const rawLabel = typeof agent.label === "string" ? agent.label.trim() : "";
    const label = rawLabel || `agent[${i}]`;
    if (!rawLabel) errors.push({ type: "missing_field", agent: label, field: "label" });

    if (agent.model == null) {
      errors.push({ type: "missing_field", agent: label, field: "model" });
    } else if (typeof agent.model !== "string" || !agent.model.trim()) {
      errors.push({ type: "empty_model", agent: label });
    }

    if (typeof agent.goal !== "string" || !agent.goal.trim()) {
      errors.push({ type: "missing_field", agent: label, field: "goal" });
    }

    const writeFiles = Array.isArray(agent.writeFiles) ? agent.writeFiles : [];
    for (const file of writeFiles) {
      const normalized = typeof file === "string" ? file.trim() : "";
      if (!normalized) continue;
      const list = fileToAgents.get(normalized);
      if (list) list.push(label);
      else fileToAgents.set(normalized, [label]);
    }
  }

  for (const [file, agentLabels] of fileToAgents) {
    if (agentLabels.length > 1) {
      errors.push({ type: "write_conflict", agents: agentLabels, file });
    }
  }

  return { errors, warnings, agentCount: agents.length };
}

function main() {
  const dispatchPath = parseArgs(process.argv);
  const manifest = readManifest(dispatchPath);
  const { errors, warnings, agentCount } = validateManifest(manifest);

  process.stdout.write(
    JSON.stringify({ valid: errors.length === 0, agentCount, errors, warnings }, null, 2) + "\n"
  );
}

main();
