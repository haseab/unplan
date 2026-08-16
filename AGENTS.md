<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git commits

- Never create a Git commit unless the user explicitly asks you to commit the
  current changes. Completing a feature, preparing changes, deploying, or
  pushing does not implicitly authorize a commit.
- Leave completed changes uncommitted by default so the user can inspect them.
- When the user does explicitly request a commit, include only the files and
  hunks that belong to the requested work and preserve unrelated worktree
  changes.

# Code organization and refactoring

Bias toward extraction, reuse, and clear ownership. The codebase should become
more modular as features are added, not accumulate behavior in a few large
files.

## Before implementing a feature

- Inspect the affected area for logic that should be extracted before adding
  more branches or state.
- Reuse existing components, hooks, types, utilities, and API helpers when they
  express the same concept. Extend a shared abstraction when appropriate
  instead of creating a near-duplicate.
- If the feature would make an already-large component harder to understand,
  refactor the relevant subsystem first and build the feature on the extracted
  interface.

## Extraction boundaries

- Keep React components focused on rendering and composing behavior. Move
  calendar math, selection rules, optimistic mutations, synchronization, and
  serialization into pure utilities, hooks, or domain modules.
- Extract coherent UI regions into named components when they have their own
  behavior, state, or visual responsibility. Prefer components such as a
  calendar grid, event block, sidebar, toolbar, and shortcut dialog over one
  monolithic application component.
- Put reusable stateful behavior in narrowly scoped hooks. Hooks should expose
  intentional domain operations rather than leaking collections of unrelated
  setters.
- Centralize provider access and network behavior in service modules or route
  helpers. UI components should not repeatedly construct Google API payloads,
  implement token behavior, or duplicate error handling.
- Define shared domain types, constants, and time/grid calculations once. Avoid
  parallel representations of calendars, events, selections, or mutations.
- Prefer small pure functions for transforms and calculations. They should be
  easy to test without rendering React.

## Reuse without over-abstraction

- Extract when code is repeated, independently meaningful, difficult to test
  in place, or likely to evolve separately.
- Keep truly local, simple, single-use code close to its caller. Do not create
  generic wrappers that merely rename a native element or one-line operation.
- Favor domain-specific APIs over configurable “do everything” components.
- Prefer composition over large option objects, boolean-heavy components, and
  deeply conditional shared code.
- Avoid barrel files when direct imports make ownership and dependencies
  clearer.

## Refactoring standards

- Preserve behavior while refactoring, then add the new behavior in a separate
  conceptual step when practical.
- Keep modules cohesive, names explicit, and dependencies flowing in one
  direction: UI → hooks/domain services → provider/API helpers.
- Do not copy and slightly modify complex interaction logic. Extract the shared
  operation and make differences explicit through small inputs or adapters.
- Remove dead code and obsolete abstractions after migrating callers.
- Add or update focused tests when extracting interaction, date, selection, or
  synchronization logic.
- Keep refactors scoped to the touched feature area unless a broader change is
  required for a clean boundary.

## Current codebase direction

`src/components/calendar-app.tsx` is an initial integrated MVP. Treat it as a
source to progressively decompose, not as the permanent home for new features.
When working in it, opportunistically extract the affected calendar surface,
interaction hook, or mutation workflow into a reusable and testable module.

# Debug logging

- The shared local application log is `/Users/haseab/Desktop/unplan/debug.log`.
- All package-script output is mirrored there by
  `scripts/run-with-debug-log.mjs`. Browser `console.log`, `console.info`,
  `console.warn`, `console.error`, and `console.debug` calls are mirrored to the
  same file by `BrowserConsoleLogger` and `/api/debug-log`.
- Every log line must carry clear, stable flags. Captured lines use the shape
  `[timestamp] [SOURCE] [LEVEL] [FLAG] message`. Process output is flagged by
  the command wrapper. Browser logs without an explicit flag receive
  `[GENERAL]`, but application-owned diagnostic logs must use a meaningful flag
  rather than relying on that fallback.
- Keep new diagnostic output on the standard `console.*` methods so it reaches
  both the appropriate console and the shared log. Put a stable uppercase flag
  in the first argument, for example
  `console.debug("[CALENDAR:DRAG]", details)` or
  `console.error("[GOOGLE:OAUTH]", error)`. Flags may contain letters, numbers,
  colons, underscores, and hyphens. Do not introduce a second ad-hoc log file.
- When instrumenting a specific bug, give all entries relevant to that bug the
  same dedicated `[BUG:<SHORT-SLUG>]` flag, even when those entries cross UI,
  API, and provider boundaries. Keep subsystem flags in the message when useful
  so one search reconstructs the full bug path.
- Whenever the user says “check logs”, “check the logs”, or asks to diagnose a
  logged issue, search intelligently before drawing conclusions. Start with
  `rg -n -i -C 4 '\[BUG:<SHORT-SLUG>\]|relevant terms' /Users/haseab/Desktop/unplan/debug.log`,
  using the bug flag and concrete feature/error terms from the request. Then
  widen to the subsystem flag, adjacent timestamps, or the whole file only when
  needed. Show the user the relevant matching log lines and context; do not
  silently summarize unseen matches or dump an unrelated full log.
