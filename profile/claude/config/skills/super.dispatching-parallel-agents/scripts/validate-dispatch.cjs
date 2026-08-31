#!/usr/bin/env node
/**
 * validate-dispatch.cjs — Pre-flight gate for parallel agent dispatches.
 *
 * Reads a dispatch manifest (JSON) and validates four invariants that prose
 * alone cannot enforce:
 *   1. Every agent has an explicit `model:` (non-empty string). Omitting it
 *      silently inherits the controller's model, burning expensive tokens on
 *      mechanical tasks.
 *   2. When an agent carries a written `tier`, its `model:` MUST equal that
 *      tier's resolution (via `modelTiers`). Passing a *different* (typically
 *      higher) model than the tier resolves to — with no recorded escalation —
 *      is the silent over-provisioning the prose "pre-dispatch gate" targets:
 *      omission inherits the controller's model, this catches an explicit wrong
 *      value (e.g. `model:"sonnet"` on a `cheap` task). A higher model is only
 *      legitimate via the escalation ladder, signalled by a non-empty
 *      `escalationReason` (downgraded to a warning that records the audit trail).
 *   3. Write-set safety across concurrent agents — mirrors the richer
 *      `check-wave-disjoint.cjs` so an *ad-hoc* parallel dispatch (which has no
 *      wave-disjointness pre-flight) gets the same guarantees, not just the
 *      write∩write subset:
 *        - write∩write: no two agents share a file in their write sets (corruption).
 *        - read∩write: no agent READS a file another agent WRITES — a stale-read
 *          risk. Only checked when agents declare `readFiles`, so manifests
 *          without reads are unaffected.
 *        - unverifiable: when top-level `enforceWriteSets` is true, every agent
 *          in a 2+ dispatch must declare a non-empty write set, else disjointness
 *          is unprovable. Off by default (backward compatible — `writeFiles`
 *          stays optional for callers that do not need write-set proof).
 *          An agent marked `readOnly: true` is exempt: it writes nothing, so it is
 *          trivially disjoint from every writer and has no write-set to prove. This
 *          is what makes a mixed wave (reviewer for task N + implementer for task M)
 *          declarable at all — previously the only way to declare one was to fail the
 *          gate, so the gate was skipped instead. `readOnly` exempts the write proof
 *          ONLY; the agent still participates in the read∩write hazard check above,
 *          which is the risk a concurrent reader actually runs. Declaring both
 *          `readOnly: true` and a non-empty `writeFiles` is a contradiction and fails
 *          with `readonly_with_writeset`.
 *   4. Runtime (port) isolation across a worktree fan-out. Worktrees isolate FILES,
 *      not the loopback interface: two implementers booting the same stack collide on
 *      EADDRINUSE, and the failure lands on whichever task started second, so it reads
 *      as that task's bug. The audit that catches this (`allocate-ports.cjs --check`)
 *      used to live in prose only — seventeen textual guards asserted the sentence was
 *      present, and none of them could observe whether the command ran. A measured run
 *      skipped it: the outcome happened to be correct (no ports.yml → nothing to audit)
 *      but "I ran it and it reported nothing to do" and "I never ran it" left the exact
 *      same trace, which is no trace. This gate closes that by making the verdict an
 *      input rather than a step to remember:
 *        - A worktree fan-out is 2+ agents carrying DISTINCT `workspace` paths.
 *        - When one is detected, this script RUNS the audit itself (zero trust, zero
 *          forgetting) via the sibling `super.using-git-worktrees` script, and records
 *          `port_audit_autorun`. A manifest-declared `portAudit` is used only when the
 *          sibling script cannot be resolved or executed — never in preference to a
 *          real run.
 *        - `conflicts` non-empty → `port_block_overlap` (the STOP, now mechanical).
 *        - `enabled: false` → `port_isolation_off` WARNING. This is the "that is a pass,
 *          not a skip" distinction turned into data: the pass now prints a named line
 *          instead of being indistinguishable from silence.
 *        - `leaseCount` below the number of distinct workspaces → `port_audit_scope_stale`:
 *          the audit ran before every worktree existed, so it proved less than it claims.
 *      Manifests with no `workspace` fields are wholly unaffected — an in-tree wave and an
 *      ad-hoc dispatch never enter this branch.
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
 *     "modelTiers": {            // optional — preferences `model_tiers` map; enables
 *       "cheap":    string,      //   the tier↔model equality gate. Absent → gate skipped.
 *       "standard": string,      //   A tier resolving to "" or "auto" means harness-picks:
 *       "capable":  string       //   no equality is enforced for that tier.
 *     },
 *     "enforceWriteSets": boolean, // optional — when true, every agent in a 2+ dispatch
 *                                  //   must declare a non-empty writeFiles (else unverifiable_writeset).
 *     "portAudit": object,         // optional — verbatim JSON from `allocate-ports.cjs --check`.
 *                                  //   Only consulted when this script cannot run that audit
 *                                  //   itself. Ignored entirely when there is no worktree fan-out.
 *     "agents": [
 *       {
 *         "label":           string,    // required — human ID, used in error messages
 *         "model":           string,    // required — must be non-empty
 *         "goal":            string,    // required — what this agent must accomplish
 *         "tier":            string,    // optional — the task's written **Tier:** (cheap|standard|capable)
 *         "expectedModel":   string,    // optional — tier resolution when no modelTiers map is passed
 *         "escalationReason":string,    // optional — non-empty = escalation ladder; downgrades a
 *                                       //   tier mismatch from error to a recorded warning
 *         "writeFiles":      string[],  // optional — files this agent will modify/create
 *         "readFiles":       string[],  // optional — files this agent reads; enables the read∩write gate
 *         "readOnly":        boolean,   // optional — true for an agent that writes nothing
 *                                       //   (reviewer, verifier). Exempts it from the write-set
 *                                       //   proof it cannot supply; it still counts as a reader.
 *         "workspace":       string     // optional — absolute path of the worktree this agent is
 *                                       //   pinned to. 2+ DISTINCT values = worktree fan-out, which
 *                                       //   arms the port-isolation gate above. Omit for in-tree.
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
 *   { type: "missing_field",       agent: string, field: string }
 *   { type: "empty_model",         agent: string }
 *   { type: "tier_model_mismatch", agent: string, tier: string, expected: string, actual: string }
 *   { type: "write_conflict",      agents: string[], file: string }
 *   { type: "read_write_hazard",   writer: string, reader: string, file: string }
 *   { type: "unverifiable_writeset", agent: string }
 *   { type: "readonly_with_writeset", agent: string }
 *   { type: "no_agents" }
 *   { type: "port_block_overlap",  worktrees: string[], message: string }
 *   { type: "missing_port_audit",  workspaces: string[], message: string }
 *   { type: "port_audit_scope_stale", leaseCount: number, workspaceCount: number }
 *
 * Warning shapes:
 *   { type: "single_agent",   message: string }
 *   { type: "tier_escalation", agent: string, tier: string, expected: string, actual: string, reason: string }
 *   { type: "port_audit_autorun",  source: string }
 *   { type: "port_isolation_off",  message: string }
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

Manifest skeleton (copy this, then substitute every <...> placeholder):
  {
    "modelTiers": {
      "cheap":    "<model_tiers.cheap verbatim>",
      "standard": "<model_tiers.standard verbatim>",
      "capable":  "<model_tiers.capable verbatim>"
    },
    "enforceWriteSets": true,
    "agents": [
      {
        "label": "task-01-implementer",
        "model": "<model_tiers.cheap verbatim>",
        "goal": "what this agent must accomplish",
        "tier": "cheap",
        "writeFiles": ["src/a.ts", "src/a.test.ts"],
        "readFiles": ["src/shared/types.ts"],
        "workspace": "<absolute worktree path, or omit for in-tree>"
      }
    ]
  }

  The three tiers are ABSTRACT. Copy the values of "modelTiers" verbatim out of
  the consuming repo's .superpowers/preferences.yml "model_tiers" — never a model
  name you assume or remember, because the mapping is per-harness and per-vendor.
  A tier whose value is empty or "auto" means the harness picks: no equality is
  enforced for it. Omit "modelTiers" entirely and the tier<->model gate is skipped.
  "enforceWriteSets": true makes a missing writeFiles an error
  (unverifiable_writeset) on a 2+ agent dispatch.

  Per agent: "label", "model" and "goal" are required. "tier" is the task's
  written **Tier:**, and "model" must equal what that tier resolves to above.
  "escalationReason" (non-empty) downgrades a tier mismatch to a recorded warning.
  "readOnly": true marks a reviewer and must come with no writeFiles.
  "expectedModel" substitutes for "modelTiers" when no map is passed.

  "workspace" is the absolute worktree path an agent is pinned to. Two or more
  DISTINCT values make this a worktree fan-out, and this script then audits port
  isolation itself (allocate-ports.cjs --check) before letting the dispatch pass.
  You do not run that audit by hand and you cannot forget it. A repo with no
  .superpowers/ports.yml comes back as the warning "port_isolation_off" — that is
  a pass with a receipt, not a skipped gate. Omit "workspace" for in-tree waves.

  The verdict is "valid" in the JSON on stdout, never the exit code.
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

// Resolve a written tier to the model it must dispatch as. Returns "" when the
// tier resolves to harness-picks ("auto"/empty) or cannot be resolved at all —
// in that case no equality is enforced (the harness legitimately chooses).
function resolveTierModel(tier, modelTiers, agent) {
  let expected = null;
  if (modelTiers && Object.prototype.hasOwnProperty.call(modelTiers, tier)) {
    expected = modelTiers[tier];
  } else if (typeof agent.expectedModel === "string") {
    expected = agent.expectedModel;
  }
  const norm = typeof expected === "string" ? expected.trim() : "";
  if (!norm || norm.toLowerCase() === "auto") return "";
  return norm;
}

// Where the sibling skill keeps the port allocator. The superpowers skills are siblings in
// one `skills/` directory, so this resolves without configuration — and when it does NOT
// resolve (this skill vendored standalone), the caller falls back to a declared audit
// rather than failing, because an absent sibling is not evidence of a port problem.
const ALLOCATE_PORTS = path.resolve(
  __dirname,
  "..",
  "..",
  "super.using-git-worktrees",
  "scripts",
  "allocate-ports.cjs"
);

// Distinct, non-empty workspace paths across the agents, in first-seen order.
// Two agents naming the SAME tree is not a fan-out (that is an in-tree wave).
function distinctWorkspaces(agents) {
  const seen = [];
  for (const agent of agents) {
    if (agent === null || typeof agent !== "object") continue;
    const raw = typeof agent.workspace === "string" ? agent.workspace.trim() : "";
    if (!raw) continue;
    const resolved = path.resolve(raw);
    if (!seen.includes(resolved)) seen.push(resolved);
  }
  return seen;
}

// Run the audit ourselves. Returning null (never throwing) is deliberate: every failure
// mode here — sibling missing, worktree path not created yet, allocator erroring — means
// "no audit available", and the caller turns that into a hard `missing_port_audit` unless
// the manifest carried one. A thrown exception would instead abort the whole gate, which
// is the one outcome worse than reporting the gap.
function runPortAudit(anchorPath) {
  if (!fs.existsSync(ALLOCATE_PORTS)) return null;
  // An anchor that does not exist on disk is NOT an audit we can trust: the allocator
  // falls back to git detection from the current directory and cheerfully reports on
  // whatever repo that happens to be — `enabled:false` about the wrong tree reads exactly
  // like a clean pass. Refusing here also catches the sequencing bug the prose names
  // ("once all exist, audit them together"): validating the dispatch before the worktrees
  // are created now fails loudly instead of auditing nothing.
  if (!fs.existsSync(anchorPath)) return null;
  let stdout;
  try {
    stdout = require("child_process").execFileSync(
      process.execPath,
      [ALLOCATE_PORTS, "--check", "--json-only", "--worktree", anchorPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }
    );
  } catch (err) {
    return null;
  }
  try {
    const parsed = JSON.parse(stdout);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Port-isolation lens. Only ever entered on a worktree fan-out, so an in-tree wave and an
 * ad-hoc dispatch pay nothing — not even the process spawn.
 */
function checkPortIsolation(manifest, agents, errors, warnings) {
  const workspaces = distinctWorkspaces(agents);
  if (workspaces.length < 2) return;

  // Anchor on a workspace that exists. Every workspace missing means the fan-out has not
  // been created yet, and no audit of it can be honest.
  const anchor = workspaces.find((wt) => fs.existsSync(wt)) || workspaces[0];
  let audit = runPortAudit(anchor);
  let autorun = true;

  if (audit === null) {
    // Fall back to a declared verdict only when we could not produce one ourselves.
    const declared = manifest.portAudit;
    audit =
      declared !== null && typeof declared === "object" && !Array.isArray(declared) ? declared : null;
    autorun = false;
  }

  if (audit === null) {
    errors.push({
      type: "missing_port_audit",
      workspaces,
      message:
        "Worktree fan-out with no port audit. Run allocate-ports.cjs --check once every worktree exists and carry its JSON in the manifest's \"portAudit\".",
    });
    return;
  }

  if (autorun) warnings.push({ type: "port_audit_autorun", source: ALLOCATE_PORTS });

  const conflicts = Array.isArray(audit.conflicts) ? audit.conflicts : [];
  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      const worktrees = Array.isArray(conflict && conflict.worktrees) ? conflict.worktrees : [];
      const message =
        typeof (conflict && conflict.message) === "string" ? conflict.message : "Port blocks overlap.";
      errors.push({ type: "port_block_overlap", worktrees, message });
    }
    return;
  }

  // Port isolation switched off is a PASS, not a skip — and it now says so out loud, which
  // is the whole point: before this line, "audited, nothing to audit" and "never audited"
  // produced byte-identical output.
  if (audit.enabled === false) {
    warnings.push({
      type: "port_isolation_off",
      message:
        "No .superpowers/ports.yml — the wave audit has nothing to check. This is a pass, not a skipped gate.",
    });
    return;
  }

  // Auditing before every worktree exists proves less than it appears to: the leases that
  // would collide are the ones not on record yet.
  const leaseCount = Number.isInteger(audit.leaseCount) ? audit.leaseCount : null;
  if (leaseCount !== null && leaseCount < workspaces.length) {
    errors.push({
      type: "port_audit_scope_stale",
      leaseCount,
      workspaceCount: workspaces.length,
    });
  }
}

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  const modelTiers =
    manifest.modelTiers && typeof manifest.modelTiers === "object" && !Array.isArray(manifest.modelTiers)
      ? manifest.modelTiers
      : null;

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

  const enforceWriteSets = manifest.enforceWriteSets === true;
  const fileToAgents = new Map(); // file → [writer labels]
  const readsByFile = new Map(); // file → Set(reader labels)
  const writeSetSizes = []; // { label, writeCount } for each valid agent object

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
    } else {
      // Tier↔model equality gate — only when the model is a valid non-empty
      // string (a missing/empty model already errored above; do not double-report).
      const tier = typeof agent.tier === "string" ? agent.tier.trim() : "";
      if (tier) {
        const expected = resolveTierModel(tier, modelTiers, agent);
        const actual = agent.model.trim();
        // expected === "" means harness-picks (auto/unresolvable) → no equality to enforce.
        if (expected && actual !== expected) {
          const reason =
            typeof agent.escalationReason === "string" ? agent.escalationReason.trim() : "";
          if (reason) {
            warnings.push({ type: "tier_escalation", agent: label, tier, expected, actual, reason });
          } else {
            errors.push({ type: "tier_model_mismatch", agent: label, tier, expected, actual });
          }
        }
      }
    }

    if (typeof agent.goal !== "string" || !agent.goal.trim()) {
      errors.push({ type: "missing_field", agent: label, field: "goal" });
    }

    const readOnly = agent.readOnly === true;
    const writeFiles = Array.isArray(agent.writeFiles) ? agent.writeFiles : [];
    let writeCount = 0;
    for (const file of writeFiles) {
      const normalized = typeof file === "string" ? file.trim() : "";
      if (!normalized) continue;
      writeCount += 1;
      const list = fileToAgents.get(normalized);
      if (list) list.push(label);
      else fileToAgents.set(normalized, [label]);
    }

    // A read-only agent that also declares a write-set is self-contradictory: one of the
    // two claims is wrong, and guessing which would either hide a real conflict or drop a
    // real write. Fail loudly instead of silently honouring one side.
    if (readOnly && writeCount > 0) {
      errors.push({ type: "readonly_with_writeset", agent: label });
    }

    const readFiles = Array.isArray(agent.readFiles) ? agent.readFiles : [];
    for (const file of readFiles) {
      const normalized = typeof file === "string" ? file.trim() : "";
      if (!normalized) continue;
      const set = readsByFile.get(normalized);
      if (set) set.add(label);
      else readsByFile.set(normalized, new Set([label]));
    }

    writeSetSizes.push({ label, writeCount, readOnly });
  }

  for (const [file, agentLabels] of fileToAgents) {
    if (agentLabels.length > 1) {
      errors.push({ type: "write_conflict", agents: agentLabels, file });
    }
  }

  // read∩write hazard — an agent reads a file another agent writes (stale-read
  // risk; mirrors check-wave-disjoint's readWriteHazards). Only fires when
  // readFiles are declared, so read-free manifests are unaffected.
  for (const [file, writerLabels] of fileToAgents) {
    const readers = readsByFile.get(file);
    if (!readers) continue;
    for (const reader of readers) {
      for (const writer of writerLabels) {
        if (reader !== writer) {
          errors.push({ type: "read_write_hazard", writer, reader, file });
        }
      }
    }
  }

  // unverifiable write-set — opt-in via enforceWriteSets. In a 2+ agent dispatch,
  // an agent that declares no write file cannot be proven disjoint. Off by
  // default so existing manifests (writeFiles optional) stay valid.
  //
  // `readOnly: true` is the one principled exemption: an agent that writes nothing is
  // trivially disjoint from every writer, so there is no write-set to prove. Without it
  // a reviewer dispatched alongside an implementer (review task N while implementing
  // task M) could not be declared at all — the gate returned an error for a safe wave,
  // and the observed response was to skip the gate entirely rather than fix the manifest.
  // The exemption is opt-in and narrow: it covers the write proof only, never the
  // read∩write hazard above, which is the risk a concurrent reader actually runs.
  if (enforceWriteSets && agents.length >= 2) {
    for (const { label, writeCount, readOnly } of writeSetSizes) {
      if (writeCount === 0 && !readOnly) {
        errors.push({ type: "unverifiable_writeset", agent: label });
      }
    }
  }

  checkPortIsolation(manifest, agents, errors, warnings);

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
