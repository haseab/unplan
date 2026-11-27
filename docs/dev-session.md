# Managed development previews

Use `bb dev-session start --workspace "$PWD"` and `bb dev-session wait <id>`.
Inspect assignments with `bb dev-session ports --workspace "$PWD"`.
Project gateway ports are private machine settings shared across worktrees; inspect
that command rather than hardcoding a port or hostname in application source.
A separate worktree or `--name second-preview` creates another instance from the
same pool. Restart/resume preserves its slot; stop releases it. Occupied ports
are skipped, never reclaimed from another process. The ordinary dev command is unchanged.

This versioned adapter runs the real app server as the backend, with a streaming
frontend transport for non-API traffic and HMR. API requests reach the same real
app through the session gateway. It preserves cookies, authorization and foreign
Origins, never fakes a data backend or bypasses application authentication.
Next previews use per-session build and TypeScript files. The launcher sets the
exact public origin for application CSRF checks and OAuth callbacks without
rewriting shared dotenv files or production settings.

Run `node --test scripts/dev-session.test.mjs` for the adapter tests.
`node scripts/check-dev-session.mjs --static` validates the source contract without
installed dependencies; real session preflight also requires the app dependencies.
A healthy transport is not application verification. Inspect session checks; a
configured browser read must succeed before claiming the application is ready.
Database, external services and accounts are not isolated by a worktree or port.
Never run migrations, background delivery, live writes or real-data tests to make
a preview pass. OAuth consent and account access remain normal application checks.

Google clients must register exact origins and callback URIs for all assigned
slots. Register Auth.js callbacks at `/api/auth/callback/google`; popup-based
Google Identity Services needs authorized JavaScript origins. Hosted Supabase
OAuth keeps its fixed provider callback and separately allows each preview's
return URL. Keep registrations additive and preserve production entries.
