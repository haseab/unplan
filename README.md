# unplan

An open-source, keyboard-first calendar for the web. unplan starts with the interaction quality that made Cron and Notion Calendar special, while keeping Google Calendar as the source of truth.

The current MVP includes:

- A polished seven-day calendar with a compact imported-calendar sidebar
- Multiple Google accounts with account-grouped calendar imports
- Optimistic 15-minute event movement with delayed Google commits, undo, and automatic rollback on sync failure
- Shift-drag marquee selection and Command/Ctrl-click multi-selection
- Command/Ctrl-D duplication and Command/Ctrl-C / Command/Ctrl-V event copy/paste with an undo window before Google is changed
- Configurable undo-toast timing plus keyboard shortcuts to undo or submit pending changes
- Calendar visibility controls, week navigation, current-time indicator, shortcuts, toasts, and reduced-motion support
- A complete demo calendar when Google credentials are not configured

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3004](http://localhost:3004).

## Connect Google Calendar

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID with the **Web application** type.
5. Add `http://localhost:3004` as an authorized JavaScript origin.
6. Copy the client ID and client secret into `.env.local`.

For production on `unplan.io`, add `https://unplan.io` to the same OAuth Web
application's authorized JavaScript origins and configure:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Unplan uses Google Identity Services' authorization-code model. Configure
`DATABASE_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64-encoded 32 random bytes),
and `APP_ORIGIN` as shown in `.env.example`, then run `npm run db:migrate`.
The server verifies Google identity tokens, encrypts Google credentials in
PostgreSQL, and maintains an HttpOnly session cookie. Browser storage contains
account summaries, local work, and preferences; Google tokens stay on the server.
Refresh retries preserve the connection through temporary failures.

The requested scopes are `openid`, `email`, `calendar.events`, and
`calendar.calendarlist`. Use separate Google projects for development and
production. Testing grants expire after seven days; a public integration needs
production publishing and verification of its Calendar permissions. See
[Google OAuth production setup](docs/google-oauth-production.md) for deployment,
branding, scope justifications, and the verification video checklist.

Use the **+** beside Calendars or **Add another account** to connect additional
Google accounts. Each account has its own server-side credentials, so one expired
account does not prevent the others from loading. Disconnecting revokes Google
access and deletes the stored connection. Existing browser-only connections
need to be authorized once after upgrading.

## Interaction model

| Action | Shortcut / gesture |
| --- | --- |
| Go to today | `T` |
| Previous / next week | `K` / `J` |
| Select a range | Hold `Shift` and drag over events |
| Toggle an event in the selection | `Command/Ctrl` + click |
| Change the selected event's calendar | `C` |
| Review extracted tasks | `Command/Ctrl + E` |
| Duplicate selected events | `Command/Ctrl + D` |
| Open Limitless history for one selected past event | `Command/Ctrl + P` |
| Open Retrace at the selected past event's start | `Command/Ctrl + Shift + P` |
| Open Deeplog time entries for the selected past event's exact range | `Option/Alt + P` |
| Add selected events to a task folder | `Command/Ctrl + Option/Alt + Shift + P` |
| Copy / paste selected events | `Command/Ctrl + C` / `Command/Ctrl + V` |
| Undo the latest pending action | `Command/Ctrl + Z` |
| Submit the latest pending action immediately | `Command/Ctrl + Enter` |
| Open settings | `Command/Ctrl + Shift + ,` |
| Clear selection | `Escape` |
| Show shortcuts | `?` |

History shortcuts apply after the selected event has ended and stay inactive while
editing text or using a dialog. Limitless history and Deeplog open at deeplog.app
in a new browser tab (Chrome when using Unplan in Chrome). Retrace opens the local
app using the same `retracedev://timeline` link as Deeplog. No Limitless credentials
are needed in Unplan; Deeplog uses its own saved credentials.

## Stack

Node.js 22+, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, date-fns, Lucide, and Sonner.

See [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) for the product principles and staged roadmap.

## License

MIT

## Local development ports

- The development server for **unplan** uses **http://localhost:3004**.
- Run `npm run dev` in the normal checkout; its development script sets port **3004** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.

## Background task refresh

The Cloudflare Worker in `workers/task-refresh` posts to
`https://unplan.io/api/task-refresh` every minute. It stores no task state.
The Railway backend reads current Todoist tasks and checks assigned follow-up
dates, priority timers, and month-end refresh rules for active folders. It
rechecks each candidate before updating it; repeated runs are safe.

Set `TODOIST_API_KEY` and `TASK_REFRESH_SECRET` on Railway, then set the same
`TASK_REFRESH_SECRET` as a Worker secret. Leave `TASK_REFRESH_ENABLED=false`
until the schedule is installed, then set it to `true` on Railway to hand
remote refreshes over from older browser versions. Deploy with Wrangler using
`workers/task-refresh/wrangler.jsonc`. Keep the secret out of source control.
Folder activity, hierarchy, and browser time zone sync to a settings record in
Todoist when the connected app opens. This record is hidden in Unplan.
New tasks require a Todoist connection and use the normal pending-save/Undo flow.
Older browser-only tasks upload automatically when Todoist is connected; local
copies remain until the upload succeeds. Expiration runs only on the server.
The browser reads updated tasks every minute and when the app regains focus.
