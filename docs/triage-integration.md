# Native BB task triage

The Sidebar plugin owns a BB page at `/plugins/sidebar/task-triage`. Its blue,
orange, and purple badges enter extraction, filing, and follow-up respectively.
The page vendors Unplan's existing triage views and domain rules; BB supplies
navigation, data loading, and mutation callbacks.

## Server API

`GET /api/integrations/triage` returns the visible bucket tasks, extraction queue,
folder hierarchy/order, writable Google calendars, and default task calendar.
Calendar connection errors are independent of task reads.

`POST /api/integrations/triage` accepts typed task decisions (extract, assign,
rename, follow-up, delete, schedule) or folder creation. Task decisions carry the
last reviewed content and project ID. Stale or out-of-scope tasks return 409.
Successful writes return `{ "ok": true }`; clients refresh separately so a read
failure cannot turn an acknowledged write into a failed decision.

Both routes require the configured `ATTENTION_API_KEY` as a bearer token. The key
now authorizes triage writes as well as integration reads. BB keeps it in its
server-only Sidebar secret setting. Todoist and Google credentials stay in
Unplan. Google accounts remain limited to the integration's existing configured
account selection. Authentication occurs before reads or writes; reads and
writes have separate rate limits. No CORS permission is added.

## Behavior

BB task decisions use Unplan's pending-action store and a five-second undo
window. Undo cancels an unsent operation. Save now submits pending operations.
Pending projections protect the page against polling races. Successful writes
invalidate the sidebar's counts. Failures restore the affected task.

Scheduling checks selected calendars for a free slot near the latest quarter
hour, using task duration or 30 minutes, and writes to the task's writable
calendar or the shared default. It checks up to 30 days ahead and fails closed
on incomplete calendar reads. It creates the Google event before completing the
Todoist task. A deterministic provider event ID prevents duplicate events if
Google succeeded but task completion or the response was interrupted.

Folder preferences extend the existing Todoist-backed refresh-settings record;
no new database is introduced. After deployment, open the updated Unplan client
once to migrate its browser-only folder order, empty custom folders, preferred
project, and default task calendar. Subsequent changes sync through that record.
Older settings writers that omit triage preferences preserve the existing ones.

## Verification and rollout

Run `npm run test:triage`, `npm run test:follow-ups`,
`npm run test:priority-review`, `npx tsc --noEmit`, and `npm run build`.
The BB plugin has separate bridge, session, component, and navigation tests.

Deploy the Unplan API before expecting the BB page to load live tasks. A missing
endpoint is shown as a deployment requirement, never as a successful empty
queue. This change does not deploy production or commit/publish either repository.
