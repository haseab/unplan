# Attention sidebar integration

`GET /api/integrations/next-meeting` accepts `Authorization: Bearer <ATTENTION_API_KEY>`.
Use a separate random key of at least 32 characters. Store it as `unplanApiKey`
in BB's Attention plugin. This key grants access only to this read-only endpoint;
Google credentials remain in Unplan.

Configure `ATTENTION_GOOGLE_EMAILS` with a comma-separated list to search specific
Google accounts together, including connections under separate Unplan owners.
Every selected email must resolve to exactly one active connection; a missing,
expired or ambiguous connection fails closed. An optional `ATTENTION_GOOGLE_OWNER_ID`
restricts those email lookups to that owner. No other accounts are included.

Alternatively, configure `ATTENTION_GOOGLE_EMAIL` with an email connected to your Unplan account,
or set `ATTENTION_GOOGLE_OWNER_ID` to an exact account owner. Email lookup must
resolve to exactly one owner; it never falls back to another account. Accounts,
calendars, or owners cannot be supplied by the caller.

The endpoint searches the next 30 days across the owner's active Google accounts
and selected calendars. It expands recurring events, includes ongoing meetings,
and excludes declined, cancelled, all-day and solo focus events. Meetings have a
conference link or another non-declined attendee. An event without a conference
link opens its Google Calendar URL. Only `title`, `start`, `end`, and `url` leave
Unplan. A calendar failure returns an error rather than a misleading later event.
Successful results are cached for 30 seconds; HTTP responses use `no-store`.

Rotate `ATTENTION_API_KEY` on the service and replace the secret in Attention to
revoke an old integration key. The key does not grant access to calendar writes,
Google tokens, or general Unplan APIs. Existing Google connections must remain
active. Polling pauses in BB's hidden windows and refreshes when they regain focus.

Validation: `node --test tests/attention-next-meeting-route.mjs`, plus the
`src/lib/attention-next-meeting.test.ts` and existing next-calendar-call tests.
