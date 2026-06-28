# Visual & Design-Source Integration

Read this when `find-feature-files.cjs` reported `mockups.found`, or the spec carries
an **Especificação Visual** section. A mockup is a **norte** — a directional
approximation of the screen, not its pixel-final form. Final fidelity is built by the
implementation task itself, ideally against the **original design source** when one
exists. Superpowers stays **tool-agnostic**: never assume a specific design tool,
design-to-code skill, or MCP — each consuming environment brings its own (or none).

## Which tasks are "UI tasks"?

A task is a UI task when it creates or changes something a user sees on screen — a
component, view, page, layout, screen state, or styling. A task touching only a
gateway, repository, endpoint, schema, or pure logic is **not** a UI task even when
the feature as a whole has a screen. Apply the steps below **only to the UI task(s)**,
but be deliberate: misclassifying the screen-rendering task as non-UI is exactly how
the decided layout gets dropped.

## Which mockup maps to which task?

`mockups.files` is a flat list. One artifact → every UI task references it. Several
(e.g. `checkout-visual.md`, `checkout-confirmation-visual.md`) → match each task to
the artifact whose screen it builds, by filename and by the Especificação Visual
decisions that name each screen. A UI task with no matching artifact signals the
mockup set is incomplete; flag it rather than guessing.

## Per UI task (when mockups or a visual spec exist)

1. **Reference the curated artifact as the fidelity baseline.** Link the specific
   `specs/mockups/<file>` and the spec's visual decisions in the task, so the
   implementer reuses the decided layout, spacing, hierarchy, and tokens instead of
   re-deriving them (which wastes tokens and silently drops decisions already made
   with the user).
2. **Record the design source and fidelity tools once, at plan time.** Fill in (a)
   whether an **original design source** exists (a design-tool URL, an export, a
   screenshot — whatever this project used; the user may have named it during
   brainstorming), and (b) which **visual-fidelity capabilities** are available in
   *this* environment (design-to-code or visual-regression skills/MCPs). Discover them
   the same way you discover domain skills for "Conformidade com as Skills Padrão" —
   inspect the consuming repo's `chat.agentSkillsLocations` and connected MCP tools,
   match by capability/description, and **never hardcode a tool name**. This is the
   single discovery pass; the execution-time Step 0 only *confirms with the user and
   fills gaps* (see `./required-task-step-pattern.md`), it does not re-discover from
   scratch. If neither a source nor tools exist, the task builds to the curated mockup
   manually and does not block.
3. **Record this in the task's `### Fidelidade Visual` subsection** (see
   `../templates/task-file-template.md`). The deterministic gate
   (`validate-tasks.cjs --mockups`, see the skill's § Self-Review) verifies at least
   one task carries this subsection when a curated mockup exists.

If no mockups or visual spec exist, omit all of the above — most non-UI tasks have no
visual dimension. Enrichment, never a hard dependency.
