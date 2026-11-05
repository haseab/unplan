# Google OAuth production setup

Unplan uses Google Identity Services' popup authorization-code flow. The server
verifies Google's signed ID token and stores credentials encrypted with AES-256-GCM
in PostgreSQL. Browsers receive only account summaries and an HttpOnly session
cookie. Sessions expire after 180 days of inactivity. Tokens are refreshed on the
server and temporary errors do not disconnect accounts.

## Deployment prerequisites

Configure these on Railway before deploying the auth migration:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: production Web application's public client ID.
- `GOOGLE_CLIENT_SECRET`: the matching client secret, server-side only.
- `APP_ORIGIN=https://unplan.io`.
- `DATABASE_URL`: PostgreSQL connection URL. Prefer Railway's private network;
  use authenticated TLS for external database connections.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: base64-encoded 32 random bytes. Generate and
  store it securely without printing it in logs. Preserve this key across
  deployments and back it up separately from the database. Changing or losing
  the key makes existing credentials unreadable and requires reconnecting.

Run `npm run db:migrate` before starting the new version. The migration is
idempotent and serialized with a PostgreSQL advisory lock. Existing browser-only
connections need to be reauthorized once; the new application removes legacy
browser tokens after successfully loading server account metadata.

Build with `npm run build`, then start with `npm run start`. Keep deployment
changes separate from unrelated work in the checkout. Production must be deployed
from the reviewed release commit through the existing Railway pipeline.

## Google Cloud configuration

Current project: `unplan-calendar-haseab`. Its existing Web client is named
`Unplan local web`; the name is only an administrative label. Use a separate
Google project/client for ongoing local development so production branding and
grants are independent of experiments.

1. Confirm Google Calendar API is enabled. Confirm the Web client's authorized
   JavaScript origins include exactly `https://unplan.io`. The popup code model
   exchanges codes with that origin as `redirect_uri`; it does not use an
   invented `/api/auth/callback/google` URL. A development client uses
   `http://localhost:3004`.
2. Complete Branding:
   - App name: `Unplan`.
   - Support and developer contact: `hullah3000@gmail.com`.
   - Application homepage: `https://unplan.io/about`.
   - Privacy policy: `https://unplan.io/privacy`.
   - Terms: `https://unplan.io/terms`.
   - Authorized domain: `unplan.io`.
3. Verify ownership of `unplan.io` in Google Search Console using a Google
   account that is an owner/editor of the OAuth project. A required DNS TXT
   record must use the exact value Google supplies.
4. Add the scopes below in Data Access. Console may normalize `email` to
   `https://www.googleapis.com/auth/userinfo.email`.
5. After the real pages and new auth are deployed, change Audience to
   **In production**. Publishing changes who can authorize the app; review the
   confirmation immediately before applying it.
6. Follow Branding/Verification Center's prompts to verify and publish branding,
   then submit the Calendar permissions for verification. Supply the
   justifications and a real demo video below. Respond to review emails sent to
   the configured developer contact. Submission is not approval.
7. Reauthorize each Google account once after publishing to obtain a new
   production grant. Verify silent refresh beyond seven days, including after
   closing the browser and restarting the application server.

### Requested scopes and justifications

| Scope | Why Unplan needs it |
| --- | --- |
| `openid` | Verify the Google identity that owns an Unplan session using the signed ID token's stable subject. |
| `email` | Identify connected accounts in the calendar sidebar and account menu. |
| `https://www.googleapis.com/auth/calendar.events` | Display and search events and perform user-requested event creation, edits, moves, deletion, attendee, reminder, description, and meeting-link changes across the user's writable calendars. Read-only and owned-only event scopes do not cover editing shared calendars. |
| `https://www.googleapis.com/auth/calendar.calendarlist` | List calendars and persist user-requested visibility changes to the calendar list. The read-only calendar-list scope cannot update the `selected` property. This scope also authorizes the shared color palette. |

Unplan does not need full `calendar` access, calendar ACL permissions, Gmail, or
Drive scopes. Keep Cloud Console declarations aligned with
`src/lib/google-auth-shared.ts`. Old grants may still contain previously granted
permissions until they are revoked and reauthorized.

### Verification video storyboard

Record a real flow in English using the deployed production client. Avoid
unrelated tabs and private calendar details. Do not include credentials or tokens.

1. Show `/about`, `/privacy`, and the application name.
2. Click Connect Google Calendar and show the Google consent screen, app name,
   requested permissions, and client ID in the address bar.
3. Complete consent as the account owner, then show the account identity and
   imported calendar list in Unplan.
4. Toggle a calendar's visibility and show the preference synchronizing.
5. On an account/calendar you control, create a disposable event without other
   attendees; edit its title/time and notes, move it between writable calendars,
   search for it, and delete it. Avoid real appointments or notifications.
6. Show the account menu and the disconnection path. Disconnecting revokes app
   access, so finish any other recording first.
7. Upload the reviewed recording to YouTube as **Unlisted**, then supply the
   link in Verification Center. The owner must approve sharing any private data
   visible in the recording before upload.

## Validation and operations

- `npm run test:google-auth` covers refresh retries, terminal vs. temporary
  failures, encryption, request-origin validation, and metadata-only browser
  storage.
- `npm run test:google-failures` covers multi-account calendar/search behavior.
- `npm run test:google-auth:database` uses `GOOGLE_AUTH_TEST_DATABASE_URL` for
  isolated PostgreSQL checks; never point it at production.
- OAuth diagnostics use `[BUG:GOOGLE-RECONNECT]` and record only safe error codes,
  HTTP status, attempt count, and operation type. Never log bodies, cookies,
  authorization codes, tokens, client secrets, or database URLs.
- Disconnecting an account revokes its Google grant and removes its stored
  connection. Disconnecting the last account removes the owner's server sessions.
- Existing local notes, tasks, and recovery history are independent of account
  credentials and remain until the user clears them or clears browser site data.

Google references: [code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model),
[verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification),
[branding](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification),
[testing expiration](https://support.google.com/cloud/answer/15549945).
