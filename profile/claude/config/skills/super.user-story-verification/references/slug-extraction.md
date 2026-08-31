# Deterministic User Story Extraction

Run the slug generator instead of parsing the PRD by hand:

```bash
node scripts/generate-slugs.cjs --prd <prd-path>
```

Outputs JSON with `count`, `requirementsMapped`, `warnings[]`, and `userStories[]` — each story carrying `id`, `text`, `role`, `want`, `benefit`, `slug`, `requirements`, `uiFacing`.

- Use the `slug` from the JSON as the directory name in the evidence tree — it matches the `us-<N>-<first-5-words-kebab>` format.
- The parser tolerates a leading `US-NN` ID marker before "Como": `- **US-01**: Como ...`, `US-02 — Como ...`, `US-03 — **Título** Como ...`.
- It **preserves the PRD's explicit ID** when present, so `id`/`slug` trace back to the PRD; unlabeled stories fall back to sequential `US-001`.

## `requirements` — the US↔FR mapping, as a datum

`requirements` is the story's functional requirements, read from the annotation the PRD template asks for on each requirement line:

```markdown
- **FR-001** (US-01) — O sistema deve ...
- **FR-002** (US-01, US-02) — O sistema deve ...
```

Many-to-many: one FR may serve several stories, one story several FRs. The annotation lives on the **FR** line, not the story line, because requirements are written after the stories exist and because the story line's benefit clause is anchored to end-of-line.

`requirementsMapped: false` means no `FR-NNN` line named a story. The arrays come back empty and a warning says so. That is the legitimate state for every PRD written before the annotation existed — **do not treat an empty `requirements` as "this story has no requirements"**. Derive the mapping by reading the PRD, and record in the QA report that you derived it, so a later run that maps it differently is visible instead of surprising.

## `uiFacing` — which QA branch the story takes

`true`/`false` when the PRD carried a `**UI:** sim|não` marker at the end of the story line (stripped before parsing, so it never lands in `text` or `slug`). `null` when the PRD stayed silent — then the SKILL.md's "Step 3: Detect Project Capabilities" rule decides it once for the whole feature, from what the feature's tasks actually wrote.

## Two warnings that are not cosmetic

- **`No FR->US annotation found`** — see `requirementsMapped` above.
- **`N line(s) look like user stories but only M matched`** — partial extraction. Zero extraction has its own guard; a partial one returns a clean-looking success with most of the feature missing, and the QA gate then verifies only the subset. The usual cause is a benefit clause written `para <verbo> ...` rather than `para que ...`. Either fix the PRD lines or extract the missing stories by hand before dispatching — never dispatch on the subset silently.

**Fallback (script unavailable):** read the PRD and extract user stories manually, assigning each the slug `us-<N>-<first-5-words-kebab>` (e.g. `us-001-como-admin-eu-quero`).
