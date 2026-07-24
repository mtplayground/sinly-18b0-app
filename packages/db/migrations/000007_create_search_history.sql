CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY,
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  keyword TEXT NOT NULL,
  search_mode TEXT NOT NULL DEFAULT 'single',
  province TEXT,
  city TEXT,
  district TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_history_platform_check
    CHECK (platform IN ('amap', 'baidu', 'tencent')),
  CONSTRAINT search_history_search_mode_check
    CHECK (search_mode IN ('single', 'batch')),
  CONSTRAINT search_history_keyword_check
    CHECK (LENGTH(TRIM(keyword)) > 0),
  CONSTRAINT search_history_result_count_check
    CHECK (result_count >= 0),
  CONSTRAINT search_history_total_count_check
    CHECK (total_count IS NULL OR total_count >= 0)
);

CREATE INDEX IF NOT EXISTS search_history_user_created_idx
  ON search_history (user_sub, created_at DESC);

CREATE INDEX IF NOT EXISTS search_history_user_platform_created_idx
  ON search_history (user_sub, platform, created_at DESC);
