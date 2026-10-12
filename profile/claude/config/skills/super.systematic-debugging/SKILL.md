---
name: super.systematic-debugging
description: Use on a bug, test failure or unexpected behavior, before proposing a fix.
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** find the root cause before attempting a fix — a fix aimed at the symptom leaves the cause in place to resurface.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for any technical issue: test failures, production bugs, unexpected behavior, performance problems, build failures, integration issues.

It applies most when skipping it is tempting: time pressure, an obvious-looking quick fix, a previous fix that did not work, an issue you do not fully understand. Systematic is faster than thrashing.

## The Four Phases

Work the phases in order — a fix proposed before Phase 1 is complete is a guess.

### Phase 1: Root Cause Investigation

**Before attempting a fix:**

1. **Read the error in full** — warnings, the whole stack trace, line numbers, file paths, error codes; the message often names the fix.

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example:** See `references/evidence-instrumentation-example.md` for a multi-layer bash instrumentation example that reveals which layer fails.

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `super.test-driven-development` skill for writing proper failing tests

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix** — the failing test passes, no other test broke (run the suite that covers the change), and the original symptom is gone; `super.verification-before-completion` before claiming it.

4. **Fix failed?** Return to Phase 1 with the new information — never stack a second fix on top of the first. **Cap: 3 failed fixes.** When each fix reveals new coupling or new symptoms somewhere else, the architecture is wrong, not the hypothesis: stop and question the pattern with the user before attempting a fourth fix. The user saying "stop guessing", "is that not happening?" or "we're stuck" is the same signal: back to Phase 1.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If investigation shows the issue is truly environmental, timing-dependent, or external, you've completed the process: document what you investigated, implement appropriate handling (retry, timeout, error message), and add monitoring/logging for future investigation. **But:** most "no root cause" cases are incomplete investigation.

## Supporting Techniques

Part of systematic debugging, available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **super.test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **super.verification-before-completion** - Verify fix worked before claiming success
