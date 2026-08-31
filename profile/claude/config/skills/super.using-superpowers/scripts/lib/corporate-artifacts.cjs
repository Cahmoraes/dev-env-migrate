'use strict';

/**
 * corporate-artifacts.cjs — the ONE definition of what
 * `.superpowers/corporate-artifacts.yml` looks like and what its presence means.
 *
 * WHY THIS EXISTS
 *   The file's shape (a top-level `artifacts:` key holding `- path:` / `- url:` items)
 *   used to be hand-parsed inline in super.reviewing-specs, described a third way in the
 *   onboarding wizard's reference, and about to be parsed a fourth time by the session
 *   bootstrap. Three copies of a format is two copies too many: the onboarding reference
 *   had ALREADY drifted to a shape (`items:` with bare scalars) that the only real parser
 *   reads as zero entries — a wizard-written file silently declaring nothing.
 *
 * WHY WE DON'T PARSE THE DOCUMENTS THEMSELVES
 *   Corporate artifacts have no fixed format, and the superpowers rule is convert-not-
 *   couple: they are recovered and converted into OUR spec/PRD templates, and validation
 *   happens on the converted artifact. This module only surfaces WHERE they live.
 *
 * PRESENCE IS NOT CONSENT
 *   The file being on disk says a document was declared once; it does not say the repo
 *   owner wants it treated as the company's source of truth for THIS session. Corporate
 *   artifacts WIN on conflict, so acting on an unconsented declaration is how a document
 *   the pipeline itself wrote for an unrelated feature outranks the current spec. The gate
 *   is the owner's own flag (`context.has_corporate_artifacts`), which callers pass in as
 *   `enabled` — this module never guesses it.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_RELATIVE_PATH = path.join('.superpowers', 'corporate-artifacts.yml');

/**
 * Parse the flat `artifacts:` list. Hand-parsed rather than pulling in a YAML dep: the
 * file is simple by contract, and the contract is enforced by the guard that runs the
 * onboarding reference's own example through this function.
 *
 * @param {string} raw file contents
 * @param {string} repoRoot absolute repo root, used to resolve relative paths
 * @returns {Array<{kind:'path'|'url', value:string, resolvedPath:string|null, exists:boolean|null, fetchable?:boolean}>}
 */
function parseCorporateEntries(raw, repoRoot) {
  const entries = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const noComment = line.replace(/(?:^|\s)#.*$/, ''); // strip only a real YAML comment (# at line start or after whitespace), so a path like /file#1.md survives
    const m = noComment.match(/^\s*-\s*(path|url)\s*:\s*(\S.*?)\s*$/);
    if (!m) continue;
    const kind = m[1];
    const value = m[2].replace(/^["']|["']$/g, '');
    if (kind === 'url') {
      // A read-only reader (Read/Grep/Glob/Bash) can't fetch a URL; flag it so the caller
      // reports it as "not re-verified here" instead of silently skipping it.
      entries.push({ kind: 'url', value, resolvedPath: null, exists: null, fetchable: false });
    } else {
      const resolvedPath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
      const exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
      entries.push({ kind: 'path', value, resolvedPath, exists });
    }
  }
  return entries;
}

/**
 * Resolve the declaration state of a repo's corporate artifacts.
 *
 * `found` (the "act on them" switch) requires BOTH consent and at least one declared
 * entry. `declaredButDisabled` reports the mismatch — entries exist while the flag is off
 * — so the caller surfaces it instead of silently ignoring the company's documents.
 * `entries` stays populated in that case: a caller that must NAME what it is disregarding
 * needs them. A caller that must not learn their VALUES (the session bootstrap) drops the
 * field; that choice belongs to the caller, not here.
 *
 * @param {string|null} repoRoot absolute repo root, or null when not in a repo
 * @param {{enabled: boolean}} options the owner's consent, read by the caller from its own source
 * @returns {{found:boolean, enabled:boolean, declared:boolean, declaredButDisabled:boolean, configPath:string|null, entries:Array, count:number}}
 */
function resolveCorporateArtifacts(repoRoot, { enabled } = {}) {
  const consented = Boolean(enabled);
  const empty = {
    found: false,
    enabled: consented,
    declared: false,
    declaredButDisabled: false,
    configPath: null,
    entries: [],
    count: 0,
  };
  if (!repoRoot) return { ...empty, enabled: consented };

  const configPath = path.join(repoRoot, CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return empty;

  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch {
    return empty;
  }

  const entries = parseCorporateEntries(raw, repoRoot);
  const declared = entries.length > 0;
  return {
    found: consented && declared,
    enabled: consented,
    declared,
    declaredButDisabled: declared && !consented,
    configPath,
    entries,
    count: entries.length,
  };
}

module.exports = { CONFIG_RELATIVE_PATH, parseCorporateEntries, resolveCorporateArtifacts };
