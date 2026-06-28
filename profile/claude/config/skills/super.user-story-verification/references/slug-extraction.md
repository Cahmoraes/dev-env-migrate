# Deterministic User Story Extraction

Run the slug generator instead of parsing the PRD by hand:

```bash
node scripts/generate-slugs.cjs --prd <prd-path>
```

Outputs JSON with `userStories[]` (each with `id`, `text`, `role`, `want`, `benefit`, `slug`) and `count`.

- Use the `slug` from the JSON as the directory name in the evidence tree — it matches the `us-<N>-<first-5-words-kebab>` format.
- The parser tolerates a leading `US-NN` ID marker before "Como": `- **US-01**: Como ...`, `US-02 — Como ...`, `US-03 — **Título** Como ...`.
- It **preserves the PRD's explicit ID** when present, so `id`/`slug` trace back to the PRD; unlabeled stories fall back to sequential `US-001`.

**Fallback (script unavailable):** read the PRD and extract user stories manually, assigning each the slug `us-<N>-<first-5-words-kebab>` (e.g. `us-001-como-admin-eu-quero`).
