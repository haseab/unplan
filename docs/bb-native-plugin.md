# Native Unplan frontend in BB

`POST /api/integrations/bb` serves the native BB plugin through a narrow JSON request/response envelope. It invokes the existing Google, Todoist and refresh-settings handlers directly, preserving their validations, rate limits, provider operations and errors. No Google/Todoist tokens, browser cookies or session credentials are sent to BB's browser.

The endpoint is disabled unless `BB_API_KEY` (at least 32 characters) is configured. Use a new random key, distinct from the existing Sidebar `ATTENTION_API_KEY`. Store the same key only in the Unplan plugin's secret `apiKey` setting. API keys and owner selection come exclusively from server configuration.

The endpoint does not accept OAuth, arbitrary URLs, headers, owner IDs, task-refresh triggers or recursive gateway calls. An async request context carries the configured Google owner to existing account/session helpers and cannot cross into other requests. Website cookie sessions retain their existing behavior. Todoist uses the existing server `TODOIST_API_KEY`.

Request: `{ path, method, headers, body? }`, with `body` an optional JSON string. Responses: `{ status, headers, body }`. Only content type, retry delay and event-move outcome headers are returned. The outer response never contains Set-Cookie. Provider consent continues on the website's registered origin.

Verification: compile/run `src/lib/bb-api-policy.test.ts` using the same TypeScript + node:test pattern as the other domain tests; run the app's TypeScript check and Next build. Production deployment and secret provisioning must happen before the BB plugin can show live accounts and perform changes.

Google accounts default to the existing integration’s explicit account selection. The server resolves each selected account’s owner and refuses Google requests for accounts outside that selection. An optional `BB_GOOGLE_OWNER_ID` can instead restrict the plugin to one existing owner.
