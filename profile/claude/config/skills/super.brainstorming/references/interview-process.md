# The interview — from understanding the idea to presenting the design

Read this at the start of the Opening Phase, once research is dispatched. This is the conversation
guide: how to scope, how to ask, how to propose approaches, how to present the design, and how to
work inside an existing codebase. SKILL.md keeps the two interview rules that apply throughout
(one question per message; selectable multiple-choice when the answers are fixed).

---

## The Process (expanded)

**Understanding the idea:**

- Run Research via Parallel Subagents first — all tracks in one parallel turn before asking any questions.
- Assess scope before detailed questions: if the request describes multiple independent subsystems (e.g., "a platform with chat, file storage, billing, and analytics"), flag it immediately and don't refine details of a project that needs decomposing first. If it's too large for a single spec, help decompose into sub-projects (independent pieces, how they relate, build order); brainstorm the first one through the normal flow — each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, ask one question at a time. For interdependent decisions (migration, greenfield, brownfield with ripple), map a dependency tree and resolve roots before leaves per `./references/decision-tree-interviewing.md`; for trivial/reversible changes keep a flat one-or-two-question pass.
- Prefer multiple choice questions when possible, but open-ended is fine too. When a clarifying question has a small set of fixed answers, present them as a selectable multiple-choice prompt so the user can pick instead of typing (keep a free-text escape for open-ended replies). This is the **terminal** path; genuinely visual choices still go through the Visual Companion (below).
- Only one question per message — break a topic needing more exploration into multiple questions.
- Focus on purpose, constraints, success criteria — **and architecture characteristics**. Use `./references/architecture-characteristics.md` to translate domain concerns into characteristics ("milhões de usuários" → scalability), surface implicit ones, and get the user to prioritize a top 3 — these become the tiebreaker for every later trade-off.

**Exploring approaches:**

- Propose 2-3 approaches with trade-offs (follow `./references/tradeoff-analysis.md`). Every option must list what it costs, not only what it gains — the prioritized architecture characteristics are the tiebreaker.
- Present options conversationally, leading with your recommended option and the reasoning — referencing the trade-off, not just the benefits.

**Presenting the design:**

- Once you believe you understand what you're building, present the design. Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced. Ask after each section whether it looks right so far.
- Cover: architecture characteristics (prioritized top 3), components, data flow, key decisions with trade-offs, risks, error handling, testing.
- Derive components using `./references/logical-components.md` — name them by responsibility (not "Manager"/"Handler"/"Service"), and validate each with the responsibility-statement test.
- Be ready to go back and clarify if something doesn't make sense.

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently. For each, you should be able to answer: what does it do, how do you use it, what does it depend on?
- Can someone understand a unit without reading its internals, and can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are easier to work with — you reason better about code you can hold in context at once, and edits are more reliable when files are focused. A file growing large often signals it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes; follow existing patterns.
- Where existing code has problems that affect the work (a file grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design — the way a good developer improves code they're working in. Don't propose unrelated refactoring; stay focused on what serves the current goal.
