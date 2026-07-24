CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY,
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  label TEXT,
  encrypted_key BYTEA NOT NULL,
  key_iv BYTEA NOT NULL,
  key_auth_tag BYTEA NOT NULL,
  key_digest TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT user_api_keys_platform_check
    CHECK (platform IN ('amap', 'baidu', 'tencent')),
  CONSTRAINT user_api_keys_one_per_platform
    UNIQUE (user_sub, platform)
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_updated_idx
  ON user_api_keys (user_sub, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_api_keys_platform_idx
  ON user_api_keys (platform);

DROP TRIGGER IF EXISTS user_api_keys_set_updated_at ON user_api_keys;
CREATE TRIGGER user_api_keys_set_updated_at
BEFORE UPDATE ON user_api_keys
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
