# Blind-executor eval — `workflow.visual_companion` gate

A/B of the preference gate. **Arm A** = `workflow.visual_companion: true`, **Arm B** = `false`.
Same skill directory on disk in both arms — the only difference is the `.superpowers/preferences.yml`
of the sandbox repo the executor is placed in. Executors were fresh `sonnet` runs (`claude -p`,
`Read`/`Grep`/`Glob`/`Bash`), told to carry out the turn for real; they were not told an A/B
existed, that a preference was under test, or that the companion was the subject. Arm state was
verified with `derive-session-state.cjs` before the runs.

Each executor answered with `{ next_actions[], offers_visual_companion,
mentions_browser_preview_to_user, turn_ends_with, why }`, so grading is mechanical.

## Probes and results

| Probe | Situation | Arm A (on) pass = offers | Arm B (off) pass = no offer, no browser mentioned |
|---|---|---|---|
| P1 ×3 | Opening turn, `"vamos redesenhar a tela de checkout do app, tenho um Figma pronto"` — an unambiguous visual request | **3/3** | **3/3** |
| P2 ×3 | Backend interview underway (shipping calculation), user turns to `"onde ficam os campos de frete no card do carrinho? queria comparar dois arranjos"` — the checklist **re-runs** | **3/3** | **3/3** |

Arm B never degraded into silence: every Arm B run ended the turn with the clarifying question
step 3 owed the user, in the session language. Arm A's offers still name the artifact, so the
readiness test survives the new gate.

## Two defects the runs found, both in the gate's FORM, not its content

**1. A gate written as prose is acknowledged, not executed.** The first version put the gate in
the Visual Companion section as a paragraph. An Arm B executor read it, listed *"run the
visual-companion preference gate (read-preferences.cjs) since this is a direct-entry session"*
as a **future action**, and offered the companion in the same turn — 0/1. Moving the gate to
checklist item 2, as its first step, with the command in a fence, is what made it run: 6/6
executors invoked the script afterwards.

**2. The script ran against the wrong repo.** One Arm B run located the script, `cd`'d into the
skill's own directory and ran it there. `read-preferences.cjs` resolves the repo from the cwd, so
it read the **skill repo's** preferences — `visual_companion` unset, therefore the default `true`
— and offered the companion while the user's repo said `false`. Silent: the script reported
`found: true`. Fixed by making the fence carry `--repo-root <project-repo-root>` plus one line
saying the skill's own repo is the wrong answer. After the fix, 6/6 runs passed the sandbox root.

## Limits

n=3 per arm per probe, single model tier (`sonnet`), executors placed at a decision point rather
than driving a full session. Re-run both probes before trusting any future edit to checklist
item 2 or to the Visual Companion section header.
