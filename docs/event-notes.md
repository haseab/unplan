# Persistent event notes

Google event notes save to IndexedDB while typing, then sync after a short debounce.
The editor and bottom notes tray show whether a draft is local, syncing, synced,
or needs attention. Drafts survive closing the sidebar and reloading the app.
The app shell itself still needs a network connection to load.

A changed Google description pauses that draft and offers Keep Google, Keep mine,
or a rich-text merge. Resolving a conflict preserves both versions in recovery
history. Deleted/inaccessible events retain copyable local notes and are never
recreated by the notes worker. Drafts and history live only in this browser;
clearing site data removes them.

Guest notification choices follow the existing organizer policy and are recorded
before uploading. Disconnected accounts retain their drafts until reconnected.
General event updates omit descriptions. Notes use their own read/compare/PATCH
path with Google ETags, sharing the event mutation queue and cross-tab Web Locks.
The worker retains attempted upload values to reconcile lost responses.

## Verification

- `npm run test:notes`: reconciliation and conditional-write protocol tests.
- `npm run test:notes:browser`: browser regression scenarios against a running
  `npm run dev` at `http://localhost:3004`. Every provider request is mocked;
  no real calendar credentials are used. Requires installed Google Chrome.
- Set `UNPLAN_TEST_URL` for another local server or `PLAYWRIGHT_CHANNEL` for
  another installed Playwright browser channel.
- `npm run test:mutation-queue` and `npm run test:google-failures`: existing
  scheduler/account regressions.

The browser suite covers offline edits, reload recovery, remote and cross-tab
conflicts, merge history, typing during upload, lost responses, storage failures,
notification choices, disconnected accounts, pending creation, calendar moves,
read-only calendars, and deleted-event recovery.
