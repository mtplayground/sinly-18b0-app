CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY,
  user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  membership_months INTEGER NOT NULL DEFAULT 12,
  subject TEXT NOT NULL,
  checkout_url TEXT,
  order_expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  callback_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_orders_provider_check
    CHECK (provider IN ('alipay', 'wechat')),
  CONSTRAINT payment_orders_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  CONSTRAINT payment_orders_amount_check
    CHECK (amount_cents > 0),
  CONSTRAINT payment_orders_membership_months_check
    CHECK (membership_months > 0),
  CONSTRAINT payment_orders_provider_order_unique
    UNIQUE (provider, provider_order_id)
);

CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON payment_orders (user_sub, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_status_expires_idx
  ON payment_orders (status, order_expires_at);

DROP TRIGGER IF EXISTS payment_orders_set_updated_at ON payment_orders;
CREATE TRIGGER payment_orders_set_updated_at
BEFORE UPDATE ON payment_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
