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

Unplan uses Google Identity Services' authorization-code model. Access tokens,
refresh tokens, and expiry times are stored in this browser's local storage and
sent only to same-origin API routes. Unplan has no user database. The matching
Google client secret remains server-side and is used only to exchange and
refresh tokens. Access tokens refresh automatically before Google API calls.

Refresh tokens in local storage are convenient for a local-first app but are
vulnerable to browser extensions and cross-site scripting. Do not use this
storage design for a multi-user hosted deployment.

OAuth clients in Google testing mode remain limited to accounts listed as test
users. A public integration requires publishing the consent screen and may
require Google verification for Calendar scopes.

Use the **+** beside Calendars or **Add another account** to connect additional
Google accounts. Each account has its own browser token, so one expired account
does not prevent the others from loading. Disconnecting removes that account's
access and refresh tokens from the browser.

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
| Copy / paste selected events | `Command/Ctrl + C` / `Command/Ctrl + V` |
| Undo the latest pending action | `Command/Ctrl + Z` |
| Submit the latest pending action immediately | `Command/Ctrl + Enter` |
| Open settings | `Command/Ctrl + Shift + ,` |
| Clear selection | `Escape` |
| Show shortcuts | `?` |

## Stack

Node.js 22+, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, date-fns, Lucide, and Sonner.

See [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) for the product principles and staged roadmap.

## License

MIT
