# Shared Unplan frontend

This package owns the calendar, event editor, search, task triage, follow-up rules,
optimistic updates, Undo, notes, and their styles. The website and embedded hosts
import the same implementation. React, React DOM, Sonner, and the editor runtime
are peer dependencies so each host supplies one compatible instance.

Configure `configureFrontend` once at application bootstrap. Hosts supply API
transport, navigation, keyboard root, preference-key mapping, retained cleanup,
and optional task-context/capture rendering. No global browser APIs are replaced.
In-flight requests retain the transport that started them. Host configuration
must not be changed between mounted applications in the same bundle.

```tsx
import { CalendarApp } from "@unplan/frontend";
import { configureFrontend } from "@unplan/frontend/runtime";
import "@unplan/frontend/styles.css";

configureFrontend({ request: fetch });
```

Embedded hosts use `embedded.css` for container-scoped calendar styles and
`triage.css` for the `.unplan-triage` review surface. Configure a calendar
`rootSelector`; embedded task review has its own explicit focus boundary.
Server credentials belong in the host backend, never in this package.

Build with `npm run build:frontend` from the repository root. Run
`npm run test:frontend` for package-boundary and runtime contract checks.
`npm pack --workspace @unplan/frontend --pack-destination <output>` creates the
portable artifact, including declarations, styles, fonts, and branding assets.

No npm registry is required. The `frontend-v*` release workflow builds and tests a
versioned package and attaches it plus SHA-256 checksums to a GitHub Release.
Consumers install the exact artifact rather than copying source files or following
an unpinned branch. Local development can use the same `npm pack` artifact.
Compatibility files in `src/` and consuming apps re-export this package; edit the
implementation here.
