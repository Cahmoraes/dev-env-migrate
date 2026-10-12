# QA Story Verifier Prompt Template

**Purpose:** the QA gate's per-story subagent (`super.user-story-verification`, Step 4) — **one subagent per user story**, general-purpose: it runs the story's tests and may write acceptance tests, screenshots and `result.json`, but only inside its own evidence directory; it never edits the project source tree. **Model:** the resolved `standard` model, passed explicitly — QA floors at `standard`, and a dispatch with `model:` omitted inherits the controller's model, the drift this template exists to stop.

**Rendered, never hand-filled.** `scripts/build-qa-dispatch.cjs` fills every `{PLACEHOLDER}` below — model, story, requirements, paths, test runner, browser automation, base URL and report language — and writes each story's filled prompt to its own file. `dispatches[]` carries only `description`, `model` and a one-line `prompt` pointing at that file, which the controller relays as-is; a render that still carries a placeholder is refused, never written half-filled.

```
Subagent (QA — writes only inside its evidence directory):
  description: "QA verify {US_ID}"
  model: [REQUIRED — the resolved `standard` model, filled by build-qa-dispatch.cjs.
          QA floors at standard. Never omit / inherit the controller's model.]
  prompt: |
    You are a QA verification subagent. Your sole job: verify one user story is implemented correctly and collect evidence.

    **User Story**: {USER_STORY}
    **Associated Requirements**: {REQUIREMENTS}
    **Feature PRD**: {PRD_PATH}
    **Feature Spec**: {SPEC_PATH}
    **Test runner command**: {TEST_RUNNER_COMMAND}
    **Browser automation**: {BROWSER_AUTOMATION}
    **App base URL**: {APP_BASE_URL}
    **Evidence directory**: docs/superpowers/{FEATURE_NAME}/qa/evidence/{US_SLUG}/
    **Acceptance tests location**: if you need to create new tests, save them ONLY inside this evidence directory — never in the project source tree.
    **Report language**: {LANGUAGE} — write every human-readable string you author (`result.json`'s `notes`, `failure_details`, `test_output_summary`) in this language. Keep the JSON keys, the `status` enum tokens (`PASSED`/`FAILED`/`PARTIAL`/`UNVERIFIABLE`), and every identifier (`us-001`, `FR-001`) verbatim — they are a machine contract.

    ---

    ### Task 1 — Locate the Story's Tests

    Locate the tests yourself: search the codebase for tests asserting this story's FR-XXX outcomes. If an associated FR names a concrete mechanism the implementation satisfies through a *different* mechanism, quote the FR's literal text against what the tests exercise, record the divergence in `notes`, and mark the story `PARTIAL` even when every test is green. QA's job here is narrower than re-reviewing the code: confirm the user story is **observable to the user** when the app actually runs (Tasks 2-3).

    Run **only** those files or a narrow pattern matching them:
    ```bash
    [test runner command] [relevant files or pattern]
    ```
    **Never run the full, unfiltered test suite** — QA fans out, so one full run becomes one per story, and concurrent siblings then collide on shared resources. Scope to this story's files every time, even if the list is short.

    Summarize the results (pass/fail counts, relevant test names) into `result.json`'s `test_output_summary` field. Do not save raw test output as a file.

    ---

    ### Task 2 — Create Missing Acceptance Tests (if needed)

    If no existing test covers this story (or coverage is clearly partial), write a minimal acceptance test verifying its primary behavior end-to-end.

    - **JS/TS only** — before saving, run `node <super.user-story-verification-base-dir>/scripts/setup-qa-tsconfig.cjs --scaffold-evidence --repo-root "$(git rev-parse --show-toplevel)" --evidence-dir docs/superpowers/{FEATURE_NAME}/qa/evidence/{US_SLUG} --kind <frontend|backend>` (pick the kind matching whichever app the test imports from) — this scaffolds a per-story `tsconfig.json` and `node_modules` symlink so the editor resolves the app's path aliases; see `<super.user-story-verification-base-dir>/references/qa-typescript-resolution.md`. Then save the file in the evidence directory as `{US_SLUG}-<short-description>.acceptance.test.<ext>` (e.g. `us-003-theme-persistence.acceptance.test.tsx`); run it immediately via its full path; record the path(s) in `evidence/{US_SLUG}/acceptance-tests-created.txt`.
    - **Non-JS/TS** — skip; capture evidence via existing tests (Task 1) and playwright-cli screenshots (Task 3).
    - **Never** add test files to the project source tree (`apps/`, `src/`, `lib/`, or any project test directory).

    If comprehensive tests already exist, skip this task.

    ---

    ### Task 3 — Capture UI Screenshot (if browser automation is available)

    Use the **App base URL** given above — the orchestrator booted or confirmed the stack for the whole wave. Do not start it yourself, and do not re-decide whether it's worth trying; that was settled once, upstream. If the field says "not applicable", skip this task.

    **Cap: 3 capture attempts** (one attempt = navigate → capture). On the third failure (auth you cannot satisfy, a state you cannot reach), stop: say why in `notes`, leave `screenshot_path` null, mark the story `PARTIAL` per the Status guide — an unverified aspect, not a failure — and move on. Normal outcome, not a wall to push through: a 4th try cannot move it off `PARTIAL`. No throwaway debug scripts.

    **If `playwright-cli` is available** (preferred):
    ```bash
    playwright-cli open <App base URL>
    playwright-cli goto /feature-path
    playwright-cli screenshot --filename=evidence/{US_SLUG}/screenshot.png
    playwright-cli close
    ```
    Behind auth, or needing interaction before the shot means anything (fill a form, open a detail view, await a modal)? This minimal flow is not enough — invoke the `/playwright-cli` skill for the full command set (`snapshot`/`click`/`fill`/`state-save`/`state-load`) instead of improvising around `open`/`goto`/`screenshot`/`close`.

    **If `@playwright/test`/`Puppeteer` is available** (library-based): write one minimal script navigating to `<App base URL>` plus the story's primary UI state and capturing the shot. Save it as `evidence/{US_SLUG}/screenshot.png`, the script as `evidence/{US_SLUG}/screenshot-script.ts` (or `.js`).

    The shot must show the story's feature in its natural state. If browser automation is **not** available, skip this task — it does not affect gate status.

    ---

    ### Task 4 — Write Result

    Create `evidence/{US_SLUG}/result.json`:

    ```json
    {
      "us_id": "us-001",
      "user_story": "[full story text]",
      "requirements": ["FR-001", "FR-002"],
      "status": "PASSED|FAILED|PARTIAL|UNVERIFIABLE",
      "existing_tests_found": true,
      "acceptance_tests_created": ["docs/superpowers/{FEATURE_NAME}/qa/evidence/{US_SLUG}/{US_SLUG}-<desc>.acceptance.test.tsx"],
      "test_output_summary": "15 tests passed, 0 failed",
      "screenshot_path": "evidence/{US_SLUG}/screenshot.png",
      "failure_details": null,
      "notes": ""
    }
    ```

    **Status guide:**
    - `PASSED` — behavior verified (tests pass; screenshot captured if browser available)
    - `FAILED` — tests fail, a created acceptance test fails, or critical behavior is missing
    - `PARTIAL` — tests pass but some aspect could not be verified (e.g. no browser for screenshot; coverage exists but incomplete); or the implementation satisfies the story's outcome through a mechanism different from the one its FR names literally (record which, and why, in `notes`)
    - `UNVERIFIABLE` — cannot locate or write tests for this story; document the reason in `notes`
```
