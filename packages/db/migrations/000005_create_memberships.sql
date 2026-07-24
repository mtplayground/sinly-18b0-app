CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY,
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  status TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memberships_status_check
    CHECK (status IN ('active', 'expired', 'cancelled')),
  CONSTRAINT memberships_time_window_check
    CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS memberships_user_expires_idx
  ON memberships (user_sub, expires_at DESC);

CREATE INDEX IF NOT EXISTS memberships_status_expires_idx
  ON memberships (status, expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_active_per_user_idx
  ON memberships (user_sub)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS memberships_set_updated_at ON memberships;
CREATE TRIGGER memberships_set_updated_at
BEFORE UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

UPDATE users
SET current_membership_id = NULL
WHERE current_membership_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM memberships
    WHERE memberships.id = users.current_membership_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_current_membership_id_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_current_membership_id_fk
      FOREIGN KEY (current_membership_id)
      REFERENCES memberships(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;
