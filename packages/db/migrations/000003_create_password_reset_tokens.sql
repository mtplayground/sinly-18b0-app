CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_requested_idx
  ON password_reset_tokens (user_sub, requested_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_tokens_email_requested_idx
  ON password_reset_tokens (email, requested_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx
  ON password_reset_tokens (expires_at)
  WHERE consumed_at IS NULL;
