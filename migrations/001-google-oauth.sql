CREATE TABLE IF NOT EXISTS unplan_google_accounts (
  owner_id text NOT NULL,
  google_id text NOT NULL,
  email text NOT NULL,
  encrypted_tokens text,
  status text NOT NULL CHECK (status IN ('active', 'expired')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, google_id),
  CHECK ((status = 'active') = (encrypted_tokens IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS unplan_sessions (
  token_hash text PRIMARY KEY,
  owner_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unplan_sessions_expiry ON unplan_sessions (expires_at);
