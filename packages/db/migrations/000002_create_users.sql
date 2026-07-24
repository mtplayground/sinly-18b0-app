CREATE TABLE IF NOT EXISTS users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  account TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  picture_url TEXT,
  membership_status TEXT NOT NULL DEFAULT 'none',
  current_membership_id UUID,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_membership_status_check
    CHECK (membership_status IN ('none', 'active', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS users_membership_status_idx
  ON users (membership_status);

CREATE INDEX IF NOT EXISTS users_last_seen_at_idx
  ON users (last_seen_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
