# Deterministic Scaffolding: dates & frontmatter

Shared mechanics for every skill that writes a dated artifact (design spec, PRD, research
report, QA report). **Single source of truth — edit here, not inline in each skill.**

## Date rules (`created_at` / `updated_at`)

- **File does not exist yet:** set BOTH `created_at` and `updated_at` to the current host
  datetime, ISO 8601 with timezone (e.g. `"2026-05-07T16:54:36-03:00"`).
- **File already exists (re-run):** PRESERVE `created_at`; update ONLY `updated_at`.
- Never write a literal placeholder (`YYYY-MM-DDTHH:MM:SS±HH:MM`) into the document.

The frontmatter block sits at the very top of the file:

```yaml
---
created_at: "2026-05-07T16:54:36-03:00"
updated_at: "2026-05-07T16:54:36-03:00"
---
```

## Deterministic frontmatter (preferred over manual editing)

The two scripts live in **`super.brainstorming/scripts/`**. Resolve them from your skill
context header's base directory:

- From **super.brainstorming** itself → `<super.brainstorming-base-dir>/scripts/`
- From **any other skill** → `<that-skill's-base-dir>/../super.brainstorming/scripts/` (substitute the
  *calling* skill's own base-dir token, e.g. `<super.generating-prd-base-dir>/../super.brainstorming/scripts/`)

Call that `frontmatter-utils.cjs` path `<FU>` and that `get-current-datetime.cjs` path `<NOW>`:

```bash
# Preserve created_at when the file already exists (returns found:false if absent):
node <FU> --file <artifact-path> --get-key created_at
# Set/refresh updated_at from the host clock:
node <FU> --file <artifact-path> --set-key updated_at --set-value "$(node <NOW>)"
```

**Fallback (scripts unavailable):** write the frontmatter manually, still following the date
rules above; use `node <NOW>` for the timestamp values.

> Timestamps MUST come from `get-current-datetime.cjs` (host clock), never from the model's
> context date — the context date ages during a long session.
