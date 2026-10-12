# Deterministic User Story Extraction

Run the slug generator instead of parsing the PRD by hand:

```bash
node scripts/generate-slugs.cjs --prd <prd-path>
```

Outputs JSON with `count`, `requirementsMapped`, `warnings[]`, and `userStories[]` — each story carrying `id`, `text`, `role`, `want`, `benefit`, `slug`, `requirements`, `uiFacing`.

- Use the `slug` from the JSON as the directory name in the evidence tree — it matches the `us-<N>-<first-5-words-kebab>` format.
- A story line has three parts in the user-story idiom of the PRD's language: a **persona** clause (“as a <role>”), a comma, a **want** clause (“I want <action>”), and an optional **benefit** clause introduced by a purpose connector (“so that <outcome>” or a bare “to <verb>”). The script anchors on persona + want and splits the benefit off by whatever purpose connector the author used; `benefit` is `null` when there is none.
- The parser tolerates a leading `US-NN` ID marker, with or without a bold title, before the persona clause: `- **US-01**: <story>`, `US-02 — <story>`, `US-03 — **Title** <story>`.
- It **preserves the PRD's explicit ID** when present, so `id`/`slug` trace back to the PRD; unlabeled stories fall back to sequential `US-001`.

## `requirements` — the US↔FR mapping, as a datum

`requirements` is the story's functional requirements, read from the annotation the PRD template asks for on each requirement line:

```markdown
- **FR-001** (US-01) — The system must ...
- **FR-002** (US-01, US-02) — The system must ...
```

Many-to-many: one FR may serve several stories, one story several FRs. The annotation lives on the **FR** line, not the story line, because requirements are written after the stories exist and because the story line's benefit clause is anchored to end-of-line.

`requirementsMapped: false` means no `FR-NNN` line named a story. The arrays come back empty and a warning says so. That is the legitimate state for every PRD written before the annotation existed — **do not treat an empty `requirements` as "this story has no requirements"**. Derive the mapping by reading the PRD, and record in the QA report that you derived it, so a later run that maps it differently is visible instead of surprising.

## `uiFacing` — which QA branch the story takes

`true`/`false` when the PRD carried a `**UI:**` marker (`sim|não`, `yes|no`) at the end of the story line (stripped before parsing, so it never lands in `text` or `slug`). `null` when the PRD stayed silent — then the "Is the story UI-facing?" rule in `./project-capabilities.md` decides it once for the whole feature, from what the feature's tasks actually wrote.

## Two warnings that are not cosmetic

- **`No FR->US annotation found`** — see `requirementsMapped` above.
- **`N line(s) look like user stories but only M matched`** — partial extraction. Zero extraction has its own guard; a partial one returns a clean-looking success with most of the feature missing, and the QA gate then verifies only the subset. The usual cause is a broken opening (no comma after the persona clause, text before it). Either fix the PRD lines or extract the missing stories by hand before dispatching — never dispatch on the subset silently.

**Fallback (script unavailable):** read the PRD and extract user stories manually, assigning each the slug `us-<N>-<first-5-words-kebab>` from the persona and want words (e.g. `us-001-operator-export-the-list-within`).
