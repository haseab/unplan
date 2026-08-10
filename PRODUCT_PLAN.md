# Product plan

## Product thesis

Google Calendar has the infrastructure and ubiquity. Cron's lasting insight was that a calendar can feel like a fast, crafted desktop tool. unplan brings that interaction model to the web: immediate actions, predictable keyboard behavior, low visual noise, and sync that never makes the interface wait.

The product does not include people-centric teammate overlays or team scheduling. It focuses on managing the calendars and events that belong to the connected user.

## Design principles

1. **Optimistic by default.** Movement, duplication, creation, deletion, and editing appear immediately. Network reconciliation happens quietly, with a clear rollback if Google rejects the change.
2. **Selection is a first-class object.** Events should behave like rows in a great desktop table: marquee selection, additive selection, range operations, copy, paste, duplicate, delete, and batch movement.
3. **The grid stays primary.** Details and commands orbit the week; they do not replace or obscure it with unnecessary pages and dialogs.
4. **Pleasantness is functional.** Subtle motion confirms cause and effect. Toasts explain completed work and offer recovery. Density, contrast, and hit targets are tuned for long sessions.
5. **Keyboard and pointer are peers.** Every frequent pointer operation should gain a shortcut, and keyboard actions should preserve spatial context.
6. **Google remains the source of truth.** The local interface can run ahead optimistically, but the server owns authentication and Google API calls.

## Phase 1 — foundation (implemented)

- Next.js, Tailwind, and TypeScript repository
- Seven-day calendar and multi-calendar sidebar
- Google OAuth, calendar list import, range-based event loading, token refresh, and disconnect
- Optimistic drag movement with 15-minute snapping, delayed commit, undo, and rollback
- Shift-drag marquee selection and Command/Ctrl-click multi-selection
- Duplicate, copy, and paste workflows with delayed Google submission
- Configurable undo-toast timing and keyboard undo/submit commands
- Today, previous/next week, current time, calendar visibility, shortcuts, toasts, and demo mode

## Phase 2 — complete the core editor

- Click-drag to create an event; resize from top and bottom edges
- Fast inline title editing and a compact right-side event inspector
- Optimistic deletion with undo and delayed server commit
- True clipboard serialization across browser tabs
- Multi-event drag constraints, collision clarity, and all-day conversion
- Recurring-event choices: this event, this and following, or the entire series
- Search and command palette
- Day and month views; configurable visible hours and weekend visibility

## Phase 3 — reliability and production auth

- Database-backed users, connected accounts, encrypted refresh tokens, and CSRF hardening
- Incremental Google sync tokens instead of refetching full ranges
- Request queue with mutation ordering, idempotency, retry, and offline recovery
- Conflict resolution for edits made simultaneously in Google Calendar
- Multiple Google accounts with cross-account calendar visibility
- Integration and interaction tests for selection, drag, duplication, rollback, and recurring events

## Phase 4 — Cron-level depth

- First-class multiple time-zone columns and temporary “travel to time zone” mode
- Natural-language quick create
- Availability painting and copyable plain-text time suggestions
- Focus-preserving upcoming-event panel and join-meeting actions
- Calendar sets, saved views, theme controls, and per-calendar defaults
- PWA installability, offline week cache, and background refresh

## Explicitly out of scope

- Coworker directory and teammate calendar overlays
- Organization-wide scheduling and resource management
- Notion database integration in the initial product
- A proprietary calendar backend
