# Feature History Recall Prompt Template

**Purpose:** the **Always** track of the research fan-out (`../references/research-fan-out.md`), dispatched in the same turn as the other tracks: find every past feature the new topic touches, read their artifacts, and return the decisions already closed. The index and the artifacts stay inside the subagent; only the report reaches the interview. **One subagent covers every relevant feature**, never one per slug — a single reader is the only one who can say where they agree and where they contradict each other; a later, narrower pass is a separate dispatch routed by `../references/research-fan-out.md`.

**Toolset:** read-only — file reading, searching, and the shell for the two index commands below and nothing else (a repo script that formats, builds or stages is out of bounds even though no rule about "editing" names it). **Resolve the placeholder before dispatching:** paste the absolute path from this skill's header in place of `<super.brainstorming-base-dir>` — a subagent receives plain text and gets no base-dir expansion from the harness.

**Names first, detail on a shortlist.** The two calls below are strong at different things — slugs alone are enough to *find* candidates, while the out-of-scope lines are what let you *reject* a look-alike. Scoping the second call with `--feature` costs O(candidates), not O(repo), so the index never reaches the budget ladder that degrades every entry at once.

```yaml
Subagent (explore):          # `explore` is an agent TYPE — a value for your platform's dispatch parameter, never a tool
  description: "Feature history recall"
  model: [REQUIRED. Tier `standard`. NOT `cheap`: this track reads like inventory
          ("list the past features") and is not — deciding which features a topic
          touches, and which closed decision still binds, is judgment. A cheap tier
          under-reports here and the failure is silent, because an empty report is
          indistinguishable from a repo with no history. NEVER omit: omitting
          inherits the controller's model and over-provisions.]
  prompt: |
    Topic of the new design: [one or two sentences, in the user's own words].

    Work in four steps, in order. Do not skip ahead to the artifacts.

    STEP 1 — every feature in the repo, names only (cheap at any repo size):

      node "<super.brainstorming-base-dir>/scripts/feature-index.cjs" --repo-root "$(git rev-parse --show-toplevel)" --detail slugs

    If it reports no features, reply "no feature history" and stop — that is a complete answer for a greenfield repo.

    STEP 2 — from those names alone, pick the CANDIDATES the topic might touch. **Do not stop at the best match.** A topic that touches an existing feature usually touches several: the one that first built the thing, and the one(s) that later redesigned, extended or narrowed it. Err toward including here — this step is about missing nothing, and step 3 is what rejects the false positives.

    STEP 3 — full detail for the candidates only, in ONE call:

      node "<super.brainstorming-base-dir>/scripts/feature-index.cjs" --repo-root "$(git rev-parse --show-toplevel)" --feature <slug-1>,<slug-2>,...

    This returns each candidate's objective and its out-of-scope lines. Now reject: a feature sharing a word but not the subject, screen, entity or user role is out, and you name it under "Considered and rejected". Keep the ones whose objective or out-of-scope text genuinely bears on the topic.

    STEP 4 — read the artifacts of the survivors only, under docs/superpowers/<slug>/: specs/<slug>-design.md, prd/prd-<slug>.md, plans/tasks-<slug>.md, qa/. Do not read the implementation source — a codebase-exploration subagent is running in parallel right now and owns that ground.

    Return at most 15 bullets, grouped under these five headings, and nothing else:
    - **Features found** — one line per selected slug: what it set out to do, what shipped, which artifacts exist. Order by how directly it touches the topic.
    - **Closed decisions** — choices already made and recorded, each with its artifact path. These are what the interview must NOT re-litigate.
    - **Out of scope, and why** — what a feature explicitly excluded, with the reason when the artifact gives one. Say when the same exclusion repeats across features: a boundary drawn twice is a product decision, not an oversight.
    - **Considered and rejected** — every near-miss slug you looked at and left out, one line each with the reason. On a repo with more than a handful of features this list is not empty; an empty one means you did not look.
    - **Where to look next** — paths worth opening only if a specific question comes up, one line each on what each answers.

    Quote a decision verbatim when the exact wording carries it, otherwise summarize. Never paste whole sections, and never paste the index. If two artifacts contradict each other, say so and name both paths — that contradiction is the highest-value thing you can return. If a selected slug has no artifacts, say so in one line and move on.
```
