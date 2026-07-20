#!/usr/bin/env node
"use strict";

/**
 * assess-complexity.cjs — Deterministic, checkpoint-based complexity-tier
 * classifier for the Opening Triage / super.brainstorming pipeline.
 *
 * Problem this replaces: the tier (Micro/Small/Medium/Large/Complex) used to
 * be judged once, in prose, from whatever the user's first message
 * contained, before super.brainstorming ever ran. A vague first message
 * could lock in the wrong tier — and the wrong ceremony — for the rest of
 * the session; a direct "opção 2" entry that skips the numbered triage never
 * ran the check at all. See `references/complexity-checkpoints.md` for the
 * full checkpoint model this script implements.
 *
 * This script is the single source of truth both entry points call:
 *   - super.using-superpowers' Opening Triage      -> checkpoint 0 (advisory)
 *   - super.brainstorming's own interview           -> checkpoint 1 (first Q&A)
 *   - super.brainstorming's design presentation      -> checkpoint 2 (design draft)
 *   - references/medium-inline-path.md's tripwire     -> checkpoint 3 (step list)
 *
 * Invariants (mirror prose rules already in SKILL.md /
 * large-known-domain-fast-path.md / medium-inline-path.md — this script
 * makes them mechanical instead of relying on the controller remembering
 * them):
 *
 *   1. When-in-doubt-go-heavier: an unresolved ("unknown") signal dimension
 *      is scored at Medium, never at Micro/Small — silence about a
 *      dimension is not evidence it's trivial.
 *   2. Critical-surface floor: TRI-STATE, interpreter-primary. The
 *      `complexity-interpreter` subagent's semantic verdict, signal
 *      `criticalSurface`, is the primary, context-aware source and — when
 *      present — AUTHORITATIVE: `true` floors the tier at Small; `false` is
 *      a semantic VETO that suppresses the keyword backstop below (e.g.
 *      "adds a request-logging middleware" is judged not-critical by the
 *      interpreter even though "middleware" matches the regex — the semantic
 *      read wins). It covers both security/safety surface (auth, secrets,
 *      sessions, crypto, abuse-prevention) AND high-consequence-of-failure
 *      surface (financial correctness, vital/medical, irreversible/
 *      destructive operations, legal/compliance) — telling *consuming* a
 *      read-only API (not critical) from *building* an auth/token issuer, a
 *      rate limiter, or a money/dosage calculation (critical), which a
 *      keyword list alone cannot. Only when `criticalSurface` is ABSENT (no
 *      semantic derivation ran) does the classifier defer to the
 *      `CRITICAL_SURFACE_KEYWORDS` regex — the same auth/security/middleware
 *      keyword set super.parallel-subagent-development uses for
 *      review-shape (never a lighter review) — as a cheap deterministic
 *      BACKSTOP, subordinate to the semantic verdict and not a peer
 *      OR-source, for the paths that run WITHOUT the subagent (checkpoint-0
 *      inline reasoning, hand-run CLI/tests, parse-waves reviewShape). The
 *      regex is deliberately NON-EXHAUSTIVE: growing the dictionary is not
 *      how context-dependent recall is meant to improve — that's the
 *      semantic layer's job. ("token bucket" stays out of the regex on
 *      purpose; the interpreter is expected to flag it semantically.) A
 *      floored verdict (true, or absent + regex match) floors the *delivery*
 *      tier at Small — Micro (zero brainstorming, zero confirmation) is
 *      never appropriate for a critical-surface change, no matter how small
 *      the diff looks.
 *   3. Checkpoint 0 is advisory, not binding: callers must NOT pass its
 *      tier as `--prior-tier` to checkpoint 1. It only decides how
 *      brainstorming *starts* (flat question pass vs full fan-out). Real
 *      commitment begins at checkpoint 1, once genuine interview signal
 *      exists.
 *   4. Escalate-only from checkpoint 1 onward: `finalTier =
 *      max(computedTier, priorTier)`. Checkpoint 2 can never lower what
 *      checkpoint 1 committed to, checkpoint 3 can never lower checkpoint 2
 *      — matches "only ever escalate up, never skip down to less"
 *      (`large-known-domain-fast-path.md`). ONE controlled exception:
 *      de-escalation is allowed only as a high-confidence correction at
 *      checkpoint 2, opt-in via `--allow-deescalation`, and still never below
 *      the critical-surface floor (invariant #2) — escalating is cheap,
 *      de-escalating requires proof.
 *   5. Micro requires proof, not silence: a tier of "micro" computed AT
 *      CHECKPOINT 0 always requires a confirming question before the
 *      zero-ceremony path is taken (`requiresConfirmation: true`) — a
 *      keyword-level read of an unclarified first message is not proof.
 *      This closes the one path with no yes/no gate today (Small already
 *      has one in `references/lightweight-path.md`; Large fast-path has one
 *      in `references/large-known-domain-fast-path.md`). Micro confirmed at
 *      checkpoint 1+ (real interview signal) does not need to ask again.
 *   6. Complex offers cost, under consent: a tier of "complex" emits an
 *      advisory `consentGates` array naming the token-costly stage to offer
 *      next — `["deep-research"]` at checkpoints 0/1 (before/at the start of
 *      brainstorming) and `["reviewing-specs"]` at checkpoint 2 (once the
 *      design exists). Every other tier emits `[]`. The array only names WHICH
 *      opt-in stage to present; the user's yes/no consent is the real decision,
 *      so each is skipped unless explicitly accepted (`references/complex-path.md`).
 *
 * Usage:
 *   node scripts/assess-complexity.cjs --signals '<json>' [--prior-tier <tier>] [--checkpoint <0-3>] [--allow-deescalation]
 *
 * --signals JSON shape (a field OMITTED entirely = "unknown"; see below):
 *   {
 *     "fileScope": "single-existing" | "few-existing" | "new-component" | "multi-component" | "cross-cutting",
 *     "abstraction": "none" | "small" | "yes" | "ambiguous",
 *     "prd": "none" | "optional" | "required",
 *     "decision": "none" | "may-exist" | "open-fork",
 *     "steps": number | null,
 *     "text": string,  // raw title/description, tested against CRITICAL_SURFACE_KEYWORDS
 *     "criticalSurface": boolean  // optional, TRI-STATE; critical-surface verdict
 *                                 // from the semantic interpreter — security/safety
 *                                 // OR high-consequence-of-failure (financial,
 *                                 // vital/medical, irreversible/destructive,
 *                                 // legal/compliance). true floors the tier; false
 *                                 // VETOES the keyword backstop below; ABSENT
 *                                 // defers to the keyword backstop
 *   }
 *
 * The signals object is the OUTPUT of the semantic derivation gate (a `capable`
 * subagent, `agents/complexity-interpreter.md`, at binding checkpoints; inline
 * controller reasoning at advisory checkpoint 0). This script does NOT interpret
 * free text — it only scores an already-derived signal object. See
 * `references/complexity-checkpoints.md`.
 *
 * Robustness (normalizeSignals): a mis-keyed or loosely-typed call no longer
 * silently defaults to Medium. Known key-typos are aliased (`files`->fileScope,
 * `decisions`->decision, `new_abstractions`->abstraction, `request`/`description`
 * ->text), booleans on the three yes/no dimensions are coerced (abstraction/prd/
 * decision `true`->"yes"/"required"/"may-exist", `false`->"none"), and any
 * key or enum value still unrecognized throws a self-documenting error listing
 * the valid keys/enums + a "did you mean" suggestion. A genuinely ABSENT key
 * still resolves to unknown -> Medium (invariant #1); only a PRESENT-but-wrong
 * key/value is rejected.
 *
 * Exit codes: 0 success, 1 usage error (bad --signals JSON, unknown key/value,
 * or --prior-tier).
 * Output (stdout): JSON — see `assess()` return shape below. Includes
 * `requiresSignalCompletion: true` when confidence is "low" at a binding
 * checkpoint (1/2/3), signalling the caller to gather more signal before
 * committing the tier.
 */

const TIERS = ["micro", "small", "medium", "large", "complex"];

// Deliberately duplicated from super.parallel-subagent-development's
// parse-waves.cjs (not imported): the two scripts belong to different
// skills and neither is a dependency of the other. Keep the pattern
// identical so a title matches both checks the same way.
const CRITICAL_SURFACE_KEYWORDS =
  /\b(security|seguran\w*|auth\w*|autentic\w*|autoriza\w*|(?:access|bearer|api|refresh)[\s-]*token|senha|password|credential\w*|credencial\w*|permission\w*|permiss\w*|middleware|cors|csrf|jwt|session\w*|sess[aã]o\w*|rate[\s-]?limit\w*|throttl\w*|(?:api|access|client)[\s-]*(?:key|secret)\w*)\b/iu;

function tierIndex(name) {
  const i = TIERS.indexOf(name);
  if (i === -1) throw new Error(`Unknown tier "${name}" — expected one of ${TIERS.join(", ")}`);
  return i;
}

function isKnown(v) {
  return v !== undefined && v !== null;
}

// --- Signal normalization & validation (safety net) ------------------------
// The controller — or a hand-run CLI call that bypasses the semantic
// derivation gate — can mistype keys or pass loose values. The previous
// failure mode was a call with `files`/`new_abstractions`/`decisions` keys and
// boolean values: the classifier read every canonical key as absent, defaulted
// all of them to Medium (invariant #1), and returned `tier: medium,
// confidence: low` — a silent misclassification. normalizeSignals closes that:
// known key-typos are aliased, booleans on the three yes/no dimensions are
// coerced, and anything still unrecognized throws a self-documenting error
// (valid keys + enums + "did you mean") instead of silently scoring Medium.
// A genuinely ABSENT key stays absent -> unknown -> Medium (invariant #1);
// only a key that is PRESENT-but-wrong is rejected.
const ALLOWED_SIGNAL_KEYS = ["fileScope", "abstraction", "prd", "decision", "steps", "text", "criticalSurface"];

const SIGNAL_ALIASES = {
  files: "fileScope",
  file_scope: "fileScope",
  filescope: "fileScope",
  decisions: "decision",
  new_abstractions: "abstraction",
  newabstractions: "abstraction",
  abstractions: "abstraction",
  step: "steps",
  request: "text",
  description: "text",
  title: "text",
};

const ENUM_VALUES = {
  fileScope: ["single-existing", "few-existing", "new-component", "multi-component", "cross-cutting"],
  abstraction: ["none", "small", "yes", "ambiguous"],
  prd: ["none", "optional", "required"],
  decision: ["none", "may-exist", "open-fork"],
};

// A boolean on a yes/no-ish dimension is a common controller shorthand; map it
// to the enum value it clearly means rather than rejecting it.
const BOOLEAN_COERCION = {
  abstraction: { true: "yes", false: "none" },
  prd: { true: "required", false: "none" },
  decision: { true: "may-exist", false: "none" },
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) d[i][0] = i;
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

// Nearest candidate within an edit-distance budget — powers "did you mean".
function nearest(candidates, value, maxDistance = 3) {
  const s = String(value).toLowerCase();
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(s, c.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return bestDist <= maxDistance ? best : null;
}

function enumSummary() {
  return (
    `fileScope ${ENUM_VALUES.fileScope.join("|")}; abstraction ${ENUM_VALUES.abstraction.join("|")}; ` +
    `prd ${ENUM_VALUES.prd.join("|")}; decision ${ENUM_VALUES.decision.join("|")}; steps <number>; text <string>`
  );
}

/**
 * Alias-correct, coerce, and strictly validate a raw signals object. Returns a
 * clean object containing only canonical keys. Throws a rich, self-documenting
 * error on any present-but-unrecognized key or invalid enum value — never
 * silently drops a mis-keyed signal into the "unknown -> Medium" default.
 */
function normalizeSignals(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `--signals must be a JSON object; got ${Array.isArray(raw) ? "an array" : typeof raw}. ` +
        `Valid keys: ${ALLOWED_SIGNAL_KEYS.join(", ")}.`
    );
  }
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const key = SIGNAL_ALIASES[rawKey.toLowerCase()] || rawKey;
    if (!ALLOWED_SIGNAL_KEYS.includes(key)) {
      const suggestion = nearest(ALLOWED_SIGNAL_KEYS, key);
      throw new Error(
        `Unknown signal key "${rawKey}"${suggestion ? ` — did you mean "${suggestion}"?` : ""}. ` +
          `Valid keys: ${ALLOWED_SIGNAL_KEYS.join(", ")}. Enum values: ${enumSummary()}.`
      );
    }
    let val = rawVal;
    if (typeof val === "boolean" && BOOLEAN_COERCION[key]) {
      val = BOOLEAN_COERCION[key][String(val)];
    }
    if (ENUM_VALUES[key] && isKnown(val) && !ENUM_VALUES[key].includes(val)) {
      const suggestion = nearest(ENUM_VALUES[key], val);
      throw new Error(
        `Invalid ${key} value ${JSON.stringify(rawVal)}${suggestion ? ` — did you mean "${suggestion}"?` : ""}. ` +
          `Valid ${key}: ${ENUM_VALUES[key].join(" | ")}.`
      );
    }
    if (key === "steps" && isKnown(val) && typeof val !== "number") {
      throw new Error(`Invalid steps value ${JSON.stringify(rawVal)} — steps must be a number (got ${typeof val}).`);
    }
    if (key === "criticalSurface" && isKnown(val) && typeof val !== "boolean") {
      throw new Error(
        `Invalid criticalSurface value ${JSON.stringify(rawVal)} — criticalSurface must be a boolean (got ${typeof val}).`
      );
    }
    out[key] = val;
  }
  return out;
}

/**
 * Each dimension maps its raw signal to the LIGHTEST tier that dimension
 * alone would justify. "unknown" resolves to Medium (invariant #1) — never
 * to Micro/Small.
 */
function fileScopeTier(v) {
  switch (v) {
    case "single-existing": return 0; // Micro — 1 existing file
    case "few-existing": return 1;    // Small — ~1-3 existing files, no new component
    case "new-component": return 2;   // Medium — few files / 1 new
    case "multi-component": return 3; // Large
    case "cross-cutting": return 4;   // Complex
    default:
      if (!isKnown(v)) return 2;
      throw new Error(`Unknown fileScope "${v}"`);
  }
}
function abstractionTier(v) {
  switch (v) {
    case "none": return 0;
    case "small": return 2;     // Medium — "maybe 1 small" abstraction
    case "yes": return 3;       // Large
    case "ambiguous": return 4; // Complex
    default:
      if (!isKnown(v)) return 2;
      throw new Error(`Unknown abstraction "${v}"`);
  }
}
function prdTier(v) {
  switch (v) {
    case "none": return 0;
    case "optional": return 2;
    case "required": return 3;
    default:
      if (!isKnown(v)) return 2;
      throw new Error(`Unknown prd "${v}"`);
  }
}
function decisionTier(v) {
  switch (v) {
    case "none": return 0;
    case "may-exist": return 3;
    case "open-fork": return 4;
    default:
      if (!isKnown(v)) return 2;
      throw new Error(`Unknown decision "${v}"`);
  }
}
/**
 * Steps is the one dimension that legitimately has no opinion until a real
 * step list exists (checkpoints 0-2) — it does NOT participate in the max
 * until it's an actual number, so unlike the other four it never silently
 * pulls an early checkpoint up to Medium.
 */
function stepsTier(v) {
  if (!isKnown(v)) return null;
  if (v <= 1) return 0;
  if (v <= 3) return 1;
  if (v <= 8) return 2;
  return 3; // 8+ — Large vs Complex disambiguated by decision/abstraction, not step count alone
}

/**
 * Core classifier. Pure function: same inputs -> same output, no I/O — the
 * CLI wrapper below is the only thing that touches argv/stdout.
 */
function assess({ signals = {}, priorTier = null, checkpoint = null, allowDeescalation = false }) {
  const norm = normalizeSignals(signals);
  const dims = [
    { name: "fileScope", value: norm.fileScope, tier: fileScopeTier(norm.fileScope) },
    { name: "abstraction", value: norm.abstraction, tier: abstractionTier(norm.abstraction) },
    { name: "prd", value: norm.prd, tier: prdTier(norm.prd) },
    { name: "decision", value: norm.decision, tier: decisionTier(norm.decision) },
    { name: "steps", value: isKnown(norm.steps) ? norm.steps : null, tier: stepsTier(norm.steps) },
  ];

  const unknownCount = dims.filter((d) => !isKnown(d.value)).length;
  const confidence = unknownCount === 0 ? "high" : unknownCount === 1 ? "medium" : "low";

  const scored = dims.filter((d) => d.tier !== null);
  let computedIndex = scored.reduce((max, d) => Math.max(max, d.tier), 0);
  const reasons = scored
    .filter((d) => d.tier === computedIndex)
    .map((d) => `${d.name}=${isKnown(d.value) ? d.value : "unknown"} -> ${TIERS[d.tier]}`);

  // Tri-state critical-surface: the interpreter's semantic verdict, when present,
  // is AUTHORITATIVE — true floors the tier, false is a semantic VETO that
  // suppresses the keyword regex below (e.g. "middleware" matching the regex is
  // overridden when the interpreter judged this specific middleware not critical).
  // Absent -> no interpreter verdict ran; defer to the deterministic keyword backstop.
  let criticalSurface;
  if (norm.criticalSurface === true) {
    criticalSurface = true;
  } else if (norm.criticalSurface === false) {
    criticalSurface = false;
  } else {
    criticalSurface = Boolean(norm.text && CRITICAL_SURFACE_KEYWORDS.test(norm.text));
  }
  if (criticalSurface && computedIndex < tierIndex("small")) {
    computedIndex = tierIndex("small");
    reasons.push("critical-surface (semantic verdict and/or keyword match) -> floored at small (never micro, regardless of file/step count)");
  }

  const checkpointStr = checkpoint === null || checkpoint === undefined ? null : String(checkpoint);

  const priorIndex = priorTier ? tierIndex(priorTier) : -1;
  // Default is escalate-only (finalIndex = max(computed, prior)). De-escalation
  // mirrors escalation but with a STRICTER evidence bar: coming DOWN requires
  // positive proof of simplicity — high confidence, at the design-binding
  // checkpoint (2) — and can never cross the critical-surface floor, which is
  // already baked into computedIndex above.
  let finalIndex;
  let deescalated = false;
  let deescalationBlocked = null;
  if (allowDeescalation && priorIndex > computedIndex) {
    if (confidence === "high" && checkpointStr === "2") {
      finalIndex = computedIndex; // already respects the critical-surface floor
      deescalated = true;
    } else {
      finalIndex = priorIndex; // requested but not earned -> stay escalate-only
      deescalationBlocked =
        confidence !== "high"
          ? `confidence ${confidence} — de-escalation requires high confidence (0 unknown signals)`
          : `checkpoint ${checkpointStr || "unknown"} — de-escalation is only honored post-design, at checkpoint 2`;
    }
  } else {
    finalIndex = Math.max(computedIndex, priorIndex);
  }
  const escalatedByPrior = priorIndex > computedIndex && finalIndex === priorIndex;

  const tier = TIERS[finalIndex];
  const requiresConfirmation = tier === "micro" && (checkpointStr === null || checkpointStr === "0");

  // Confidence gate. At a BINDING checkpoint (1/2/3), 2+ unknown dimensions
  // (confidence "low") means this tier is a cautious default, not a real read of
  // the request — the caller must gather more signal (re-run the semantic
  // derivation gate / ask a disambiguating question) before committing to it,
  // instead of treating a low-confidence Medium as a genuine decision. Advisory
  // at checkpoint 0. See references/complexity-checkpoints.md.
  const requiresSignalCompletion =
    confidence === "low" && (checkpointStr === "1" || checkpointStr === "2" || checkpointStr === "3");

  // Complex tier proactively surfaces two token-costly, consent-gated stages (each
  // opt-in, one at a time), stage-appropriate by checkpoint: a research gate before/
  // at the start of brainstorming, a spec-review gate once the design exists. Advisory
  // like requiresConfirmation — it names WHICH offer to present; the user's consent is
  // the actual decision. See references/complex-path.md and complexity-checkpoints.md.
  const consentGates =
    tier === "complex"
      ? checkpointStr === "2"
        ? ["reviewing-specs"]
        : ["deep-research"]
      : [];

  return {
    tier,
    tierIndex: finalIndex,
    confidence,
    criticalSurface,
    requiresConfirmation,
    requiresSignalCompletion,
    consentGates,
    escalatedByPrior,
    deescalated,
    deescalationBlocked,
    priorTier: priorTier || null,
    checkpoint: checkpointStr,
    signals: reasons,
  };
}

function parseArgs(argv) {
  const args = { signals: "{}", priorTier: null, checkpoint: null, allowDeescalation: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--signals") args.signals = argv[++i];
    else if (a === "--prior-tier") args.priorTier = argv[++i];
    else if (a === "--checkpoint") args.checkpoint = argv[++i];
    else if (a === "--allow-deescalation") args.allowDeescalation = true;
    else throw new Error(`Unknown argument "${a}"`);
  }
  return args;
}

function main() {
  let result;
  try {
    const args = parseArgs(process.argv.slice(2));
    const signals = JSON.parse(args.signals);
    result = assess({
      signals,
      priorTier: args.priorTier,
      checkpoint: args.checkpoint,
      allowDeescalation: args.allowDeescalation,
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

module.exports = { assess, normalizeSignals, TIERS, CRITICAL_SURFACE_KEYWORDS };

if (require.main === module) main();
