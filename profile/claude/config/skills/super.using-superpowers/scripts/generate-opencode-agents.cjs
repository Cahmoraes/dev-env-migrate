#!/usr/bin/env node
/**
 * generate-opencode-agents.cjs — Materialize the superpowers execution tiers as
 * opencode agent definitions, deterministically.
 *
 * WHY THIS EXISTS
 *   The execution skills require an explicit model on every dispatch: a task whose
 *   header says `**Tier:** cheap` must run on model_tiers.cheap, never on whatever
 *   the controller happens to be running (see super.subagent-driven-development,
 *   references/model-selection.md). On Claude Code and Copilot CLI that invariant is
 *   satisfied at dispatch time, because the dispatch call carries a `model:` field.
 *
 *   opencode's `task` tool has NO `model` parameter. Its arguments are description,
 *   prompt, subagent_type (required), plus optional task_id and command. A subagent's
 *   model is a property of the AGENT DEFINITION, resolved from its `model:` frontmatter.
 *   So on opencode the tier has to be carried by `subagent_type` — which means one
 *   agent per tier must exist before the first dispatch.
 *
 *   Leaving that to the model at runtime would put the tier invariant back under model
 *   judgment, which is exactly what this repo converts into deterministic scripts. This
 *   script is that conversion: preferences in, agent definitions out.
 *
 * WHAT IT EMITS
 *   Implementers (write access) — one per tier:
 *     sp-implementer-cheap / -standard / -capable
 *   Gates (read-only; the review floor is `standard`, so there is no cheap reviewer):
 *     sp-reviewer-standard / -capable
 *   Read-and-report exploration/research (read-only, not a gate, floors at cheap):
 *     sp-explorer
 *
 *   Read-only agents deny edit/write/task, matching the toolset rule that reviewers,
 *   exploration, research and sync-workers never write. Every agent denies `question`:
 *   a dispatched subagent must never prompt the user — the named consent gates belong
 *   to the orchestrator alone.
 *
 * AUTO TIERS
 *   A tier configured as null means "auto" — the harness picks. Those agents are
 *   emitted WITHOUT a `model:` line, so opencode resolves the model itself. That is the
 *   documented `auto` contract, not a failure; the JSON reports them as `auto: true`.
 *
 * SIDE EFFECTS ARE OPT-IN
 *   Default is a dry run: it reports what WOULD be written and touches nothing. Pass
 *   --write to actually create the files. Existing files are never silently clobbered
 *   unless --force is given; they are reported as `skipped` with reason `exists`.
 *
 * Usage:
 *   node scripts/generate-opencode-agents.cjs [--repo-root <path>] [--write] [--force]
 *                                             [--out-dir <path>]
 *
 * Options:
 *   --repo-root <path>  Explicit repo root (else git detection, via read-preferences).
 *   --out-dir <path>    Agent directory (default: <repo-root>/.opencode/agent).
 *   --write             Actually write the files (default: dry run).
 *   --force             Overwrite existing agent files.
 *   --help              Show this help and exit 0.
 *
 * Output (JSON to stdout):
 *   { outDir, wrote, modelTiers, agents: [ { name, path, tier, model, auto, readOnly,
 *                                            status } ] }
 *   status is "written" | "would-write" | "exists" | "overwritten".
 *
 * Exit codes:
 *   0  success (including a dry run, and including "everything already existed")
 *   1  usage error or unrecoverable IO failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadPreferences } = require('./read-preferences.cjs');

const HELP = `
generate-opencode-agents.cjs — Emit superpowers tier agents for opencode.

Usage:
  node scripts/generate-opencode-agents.cjs [--repo-root <path>] [--write] [--force]
                                            [--out-dir <path>]

Options:
  --repo-root <path>  Explicit repo root (else git detection).
  --out-dir <path>    Agent directory (default: <repo-root>/.opencode/agent).
  --write             Actually write the files (default: dry run, writes nothing).
  --force             Overwrite existing agent files.
  --help              Show this help and exit 0.

opencode's task tool has no model argument, so each execution tier must exist as its
own agent for the written **Tier:** to be honored. Output is JSON on stdout.
`.trimStart();

/**
 * The agent roster. `tier` names which model_tiers entry resolves the model;
 * `readOnly` drives the permission block (deny edit/write/task).
 */
const ROSTER = [
  {
    name: 'sp-implementer-cheap',
    tier: 'cheap',
    readOnly: false,
    description:
      'Superpowers implementer, cheap tier. Dispatch target for a task whose plan header says **Tier:** cheap (mechanical, closed-scope, spec already written).',
    body:
      'You implement one superpowers task. Follow the task file exactly: it already carries the spec, the files to touch, and the commands to run.\n\n' +
      'Work test-first. Do not widen the scope beyond the task file. If you cannot proceed for lack of reasoning power rather than lack of information, stop and report `BLOCKED` with what defeated you — the orchestrator owns escalation, you do not escalate yourself.',
  },
  {
    name: 'sp-implementer-standard',
    tier: 'standard',
    readOnly: false,
    description:
      'Superpowers implementer, standard tier. Dispatch target for a task whose plan header says **Tier:** standard (integration, multi-file, debugging judgment).',
    body:
      'You implement one superpowers task involving integration or multi-file judgment. Follow the task file exactly.\n\n' +
      'Work test-first. Do not widen the scope beyond the task file. If you cannot proceed for lack of reasoning power, stop and report `BLOCKED` with what defeated you.',
  },
  {
    name: 'sp-implementer-capable',
    tier: 'capable',
    readOnly: false,
    description:
      'Superpowers implementer, capable tier. Dispatch target for a task whose plan header says **Tier:** capable (architecture, design, absent spec, high fan-in).',
    body:
      'You implement one superpowers task requiring genuine design judgment. Follow the task file exactly.\n\n' +
      'Work test-first. Do not widen the scope beyond the task file. Record any design decision you had to make so the reviewer can check it against the spec.',
  },
  {
    name: 'sp-reviewer-standard',
    tier: 'standard',
    readOnly: true,
    description:
      'Superpowers review gate at the standard floor. Read-only. Reviews cheap- and standard-tier work (spec compliance, code quality, final review).',
    body:
      'You are a review gate. You read and report; you never edit.\n\n' +
      'Report findings by severity, each one anchored to a concrete file and line. Say plainly when something is fine — inventing a finding to look useful is a failure mode, and so is staying silent about a real one. Do not recommend building anything the design deliberately does without.',
  },
  {
    name: 'sp-reviewer-capable',
    tier: 'capable',
    readOnly: true,
    description:
      'Superpowers review gate at the capable tier. Read-only. Reviews capable-tier work and architectural questions (including spec review).',
    body:
      'You are a review gate for work involving architectural judgment. You read and report; you never edit.\n\n' +
      'Report findings by severity, each one anchored to a concrete file and line. Say plainly when something is fine — inventing a finding to look useful is a failure mode, and so is staying silent about a real one. Do not recommend building anything the design deliberately does without.',
  },
  {
    name: 'sp-explorer',
    tier: 'cheap',
    readOnly: true,
    description:
      'Superpowers read-and-report exploration/research subagent. Read-only. Not a review gate — use for codebase discovery, research fan-out, and memory re-sync sync-workers.',
    body:
      'You explore and report. You never edit.\n\n' +
      'Return a compact report: what you found, where (file and line), and what you could NOT confirm. Do not dump file contents into your answer, and do not propose fixes — locating and reporting is the whole job.',
  },
];

const READ_ONLY_PERMISSION = [
  'permission:',
  '  read: allow',
  '  grep: allow',
  '  glob: allow',
  '  list: allow',
  '  bash: allow',
  '  webfetch: allow',
  '  edit: deny',
  '  write: deny',
  '  task: deny',
  '  question: deny',
].join('\n');

const WRITE_PERMISSION = [
  'permission:',
  '  read: allow',
  '  grep: allow',
  '  glob: allow',
  '  list: allow',
  '  bash: allow',
  '  edit: allow',
  '  write: allow',
  '  question: deny',
].join('\n');

/**
 * Render one agent definition. `model` null → emit no `model:` line, letting opencode
 * auto-select (the documented "auto" tier contract).
 */
function renderAgent(entry, model) {
  const lines = ['---'];
  lines.push(`description: ${entry.description}`);
  lines.push('mode: subagent');
  if (model) lines.push(`model: ${model}`);
  lines.push(entry.readOnly ? READ_ONLY_PERMISSION : WRITE_PERMISSION);
  lines.push('---');
  lines.push('');
  lines.push(entry.body);
  lines.push('');
  return lines.join('\n');
}

function buildPlan(modelTiers, outDir, { write, force }) {
  return ROSTER.map((entry) => {
    const model = modelTiers[entry.tier] ?? null;
    const filePath = path.join(outDir, `${entry.name}.md`);
    const exists = fs.existsSync(filePath);

    let status;
    if (exists && !force) status = 'exists';
    else if (!write) status = 'would-write';
    else status = exists ? 'overwritten' : 'written';

    return {
      name: entry.name,
      path: filePath,
      tier: entry.tier,
      model,
      auto: model === null,
      readOnly: entry.readOnly,
      status,
      _content: renderAgent(entry, model),
    };
  });
}

function main(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let repoRoot = null;
  let outDir = null;
  let write = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && args[i + 1]) repoRoot = path.resolve(args[++i]);
    else if (args[i] === '--out-dir' && args[i + 1]) outDir = path.resolve(args[++i]);
    else if (args[i] === '--write') write = true;
    else if (args[i] === '--force') force = true;
    else if (args[i].startsWith('--')) {
      process.stderr.write(`unknown flag "${args[i]}"\n`);
      process.exit(1);
    }
  }

  let prefs;
  try {
    prefs = loadPreferences(repoRoot).result;
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
    process.exit(1);
  }

  const root = repoRoot || (prefs.preferencesPath ? path.dirname(path.dirname(prefs.preferencesPath)) : process.cwd());
  const resolvedOutDir = outDir || path.join(root, '.opencode', 'agent');
  const modelTiers = prefs.preferences.model_tiers || {};

  const plan = buildPlan(modelTiers, resolvedOutDir, { write, force });

  if (write) {
    try {
      fs.mkdirSync(resolvedOutDir, { recursive: true });
      for (const a of plan) {
        if (a.status === 'written' || a.status === 'overwritten') {
          fs.writeFileSync(a.path, a._content, 'utf8');
        }
      }
    } catch (err) {
      process.stderr.write(`Failed to write agents: ${err.message}\n`);
      process.exit(1);
    }
  }

  const result = {
    outDir: resolvedOutDir,
    wrote: write,
    modelTiers: {
      cheap: modelTiers.cheap ?? null,
      standard: modelTiers.standard ?? null,
      capable: modelTiers.capable ?? null,
    },
    agents: plan.map(({ _content, ...rest }) => rest),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

module.exports = { ROSTER, renderAgent, buildPlan };

if (require.main === module) {
  main(process.argv);
}
