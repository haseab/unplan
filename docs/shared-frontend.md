# One frontend, two hosts

`packages/frontend` is the source of truth for Unplan's calendar, task triage,
notes, search, follow-ups, keyboard behavior, optimistic changes, Undo, and styles.
The website uses an npm workspace dependency. The BB plugin installs a versioned
package artifact. Compatibility paths re-export the package and are guarded by
boundary tests; do not add implementations to them.

The website retains Next routes, authentication, backend services, marketing/legal
pages, page fonts, and its small `frontend-host` bootstrap. BB retains plugin SDK
registration, its direct Todoist triage session/transport, API bridge, retained
panels, sidebar navigation, saved conversation viewer, and task capture. These
hosts supply the library's `FrontendHost` contract without introducing host SDK
or framework imports into the shared source.

## Preserved and reconciled behavior

- Calendar movement and Undo retain focus when day segments remount.
- Existing preference keys remain in place through the BB host's mapping.
- Retained panel ownership and unsent saves stay with the host lifecycle.
- Embedded triage preserves shell navigation, native text editing, saved context,
  task capture, explicit empty queues, skip/history/Undo, and completion behavior.
- Website dialogs retain their modal navigation boundary.
- Hosts retain their established timeline/folder shortcut profile through explicit
  configuration. Both surfaces use canonical search/bulk-editing behavior and shared
  interval/date rules. Task review completion closes tasks; extraction keeps its
  separate Keep/Delete operations.
- BB task reads and writes still use its direct Todoist integration. Library
  adoption does not move credentials or change account ownership.

## Build, verify, and distribute

Run `npm install` with the declared package manager. The prepare step builds the
workspace library. `npm run build` also builds it before the website.
`npm run test:frontend` checks package boundaries, assets, compatibility imports,
keyboard scope, preference isolation, and request ownership. Existing domain tests
import the same package through compatibility paths.

For local cross-repository work, build and `npm pack --workspace @unplan/frontend
--pack-destination <output>`. In the BB plugin repository run its `frontend:update`
command with `--artifact <package.tgz>`, then test and build the plugin. Rebuild and
reinstall the package after source edits; consumers do not follow an unpinned branch.

For distribution without an npm registry, use a `frontend-vX.Y.Z` tag matching the
package version. The release workflow tests and packs the library, then attaches
its archive and SHA-256 checksums to that GitHub Release. The BB updater accepts
`--url <asset-url> --sha256 <digest>` and records the exact artifact identity.
Publishing, website deployment, and plugin reload are separate release steps;
creating the library does not itself publish or deploy it.

## Embedded calendar controls

The BB host disables task-review banners in the calendar task sidebar because its
dedicated triage page owns those queues. Calendar-event follow-ups remain visible.
The default website profile keeps the review banners.

Shared calendar event buttons and event details expose optional host capture
attributes. BB uses these to open its existing Create task and AI workflow with
calendar context on Command-T. The website supplies no capture adapter. Calendar
capture is a separate source from Todoist task capture and never completes or
removes the source event.

## Calendar priority triage

The calendar banner reviews current Priority Right Now folder membership and its
descendants. Command-E starts a session; Command-Shift-Left schedules the current
task, Tab skips it for the session, and Command-Backspace deletes it with Undo.
Option-Enter opens BB's existing Command-T capture dialog with the task context.
Cancel preserves the current task; a confirmed agent thread submission advances
the queue. The capture dialog is supplied by BB and is unavailable on the website.
