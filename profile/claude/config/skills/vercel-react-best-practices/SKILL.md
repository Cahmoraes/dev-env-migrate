---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

Comprehensive performance optimization guide for React and Next.js applications, maintained by Vercel. Contains 70 rules across 8 categories, prioritized by impact to guide automated refactoring and code generation.

## When to Apply

Reference these guidelines when:
- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/Next.js code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `references/async-cheap-condition-before-await.md` - Check cheap sync conditions before awaiting flags or remote values
- `references/async-defer-await.md` - Move await into branches where actually used
- `references/async-parallel.md` - Use Promise.all() for independent operations
- `references/async-dependencies.md` - Use better-all for partial dependencies
- `references/async-api-routes.md` - Start promises early, await late in API routes
- `references/async-suspense-boundaries.md` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `references/bundle-barrel-imports.md` - Import directly, avoid barrel files
- `references/bundle-analyzable-paths.md` - Prefer statically analyzable import and file-system paths to avoid broad bundles and traces
- `references/bundle-dynamic-imports.md` - Use next/dynamic for heavy components
- `references/bundle-defer-third-party.md` - Load analytics/logging after hydration
- `references/bundle-conditional.md` - Load modules only when feature is activated
- `references/bundle-preload.md` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `references/server-auth-actions.md` - Authenticate server actions like API routes
- `references/server-cache-react.md` - Use React.cache() for per-request deduplication
- `references/server-cache-lru.md` - Use LRU cache for cross-request caching
- `references/server-dedup-props.md` - Avoid duplicate serialization in RSC props
- `references/server-hoist-static-io.md` - Hoist static I/O (fonts, logos) to module level
- `references/server-no-shared-module-state.md` - Avoid module-level mutable request state in RSC/SSR
- `references/server-serialization.md` - Minimize data passed to client components
- `references/server-parallel-fetching.md` - Restructure components to parallelize fetches
- `references/server-parallel-nested-fetching.md` - Chain nested fetches per item in Promise.all
- `references/server-after-nonblocking.md` - Use after() for non-blocking operations

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `references/client-swr-dedup.md` - Use SWR for automatic request deduplication
- `references/client-event-listeners.md` - Deduplicate global event listeners
- `references/client-passive-event-listeners.md` - Use passive listeners for scroll
- `references/client-localstorage-schema.md` - Version and minimize localStorage data

### 5. Re-render Optimization (MEDIUM)

- `references/rerender-defer-reads.md` - Don't subscribe to state only used in callbacks
- `references/rerender-memo.md` - Extract expensive work into memoized components
- `references/rerender-memo-with-default-value.md` - Hoist default non-primitive props
- `references/rerender-dependencies.md` - Use primitive dependencies in effects
- `references/rerender-derived-state.md` - Subscribe to derived booleans, not raw values
- `references/rerender-derived-state-no-effect.md` - Derive state during render, not effects
- `references/rerender-functional-setstate.md` - Use functional setState for stable callbacks
- `references/rerender-lazy-state-init.md` - Pass function to useState for expensive values
- `references/rerender-simple-expression-in-memo.md` - Avoid memo for simple primitives
- `references/rerender-split-combined-hooks.md` - Split hooks with independent dependencies
- `references/rerender-move-effect-to-event.md` - Put interaction logic in event handlers
- `references/rerender-transitions.md` - Use startTransition for non-urgent updates
- `references/rerender-use-deferred-value.md` - Defer expensive renders to keep input responsive
- `references/rerender-use-ref-transient-values.md` - Use refs for transient frequent values
- `references/rerender-no-inline-components.md` - Don't define components inside components

### 6. Rendering Performance (MEDIUM)

- `references/rendering-animate-svg-wrapper.md` - Animate div wrapper, not SVG element
- `references/rendering-content-visibility.md` - Use content-visibility for long lists
- `references/rendering-hoist-jsx.md` - Extract static JSX outside components
- `references/rendering-svg-precision.md` - Reduce SVG coordinate precision
- `references/rendering-hydration-no-flicker.md` - Use inline script for client-only data
- `references/rendering-hydration-suppress-warning.md` - Suppress expected mismatches
- `references/rendering-activity.md` - Use Activity component for show/hide
- `references/rendering-conditional-render.md` - Use ternary, not && for conditionals
- `references/rendering-usetransition-loading.md` - Prefer useTransition for loading state
- `references/rendering-resource-hints.md` - Use React DOM resource hints for preloading
- `references/rendering-script-defer-async.md` - Use defer or async on script tags

### 7. JavaScript Performance (LOW-MEDIUM)

- `references/js-batch-dom-css.md` - Group CSS changes via classes or cssText
- `references/js-index-maps.md` - Build Map for repeated lookups
- `references/js-cache-property-access.md` - Cache object properties in loops
- `references/js-cache-function-results.md` - Cache function results in module-level Map
- `references/js-cache-storage.md` - Cache localStorage/sessionStorage reads
- `references/js-combine-iterations.md` - Combine multiple filter/map into one loop
- `references/js-length-check-first.md` - Check array length before expensive comparison
- `references/js-early-exit.md` - Return early from functions
- `references/js-hoist-regexp.md` - Hoist RegExp creation outside loops
- `references/js-min-max-loop.md` - Use loop for min/max instead of sort
- `references/js-set-map-lookups.md` - Use Set/Map for O(1) lookups
- `references/js-tosorted-immutable.md` - Use toSorted() for immutability
- `references/js-flatmap-filter.md` - Use flatMap to map and filter in one pass
- `references/js-request-idle-callback.md` - Defer non-critical work to browser idle time

### 8. Advanced Patterns (LOW)

- `references/advanced-effect-event-deps.md` - Don't put `useEffectEvent` results in effect deps
- `references/advanced-event-handler-refs.md` - Store event handlers in refs
- `references/advanced-init-once.md` - Initialize app once per app load
- `references/advanced-use-latest.md` - useLatest for stable callback refs

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
