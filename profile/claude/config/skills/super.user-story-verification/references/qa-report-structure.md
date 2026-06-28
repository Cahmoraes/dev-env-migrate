# QA Report Structure

Save the report to `docs/superpowers/<feature-name>/qa/qa-report-<feature-name>.md` using the template at `../assets/qa-report-template.md` from this skill. That template file is the **canonical source** — if you change the structure here, keep both in sync.

Fill the template structure verbatim:

- Frontmatter: `created_at` / `updated_at`.
- Sections: `# QA Report — [Feature Name]`, `## Resumo`, `## Requisitos Verificados`, `## Testes E2E Executados`, `## Acessibilidade`, `## Bugs Encontrados`, `## Conclusão`.
- In the `Evidência` / `Screenshot` columns, reference the real evidence files (e.g. `evidence/us-001-.../result.json`, `evidence/.../screenshot.png`).

**Frontmatter dates:** for the date rules and the deterministic `frontmatter-utils.cjs` mechanics, read `../super.brainstorming/references/deterministic-scaffolding.md`. From this skill the scripts live at `<super.user-story-verification-base-dir>/../super.brainstorming/scripts/`.
