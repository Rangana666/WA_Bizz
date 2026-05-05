-- WA Bizz Fleet Manager — Central Database Schema
-- Runs on the Fleet Manager's own PostgreSQL instance.
-- This database NEVER stores customer data — only business/billing/server metadata.

CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  biz_id TEXT UNIQUE NOT NULL,          -- e.g. biz_0042
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT,
  business_type TEXT NOT NULL CHECK (business_type IN ('clothing', 'perfume', 'food', 'other')),
  subdomain TEXT UNIQUE NOT NULL,        -- e.g. mala (→ mala.wabizz.lk)
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro')),

  -- Server info
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'provisioning', 'bootstrapping', 'verifying', 'live', 'suspended', 'failed', 'cancelled')
  ),
  server_id TEXT,                        -- Hetzner server ID
  server_ip TEXT,                        -- VPS public IP
  cloudflare_dns_id TEXT,                -- Cloudflare DNS record ID (for deletion on deprovisioning)
  fleet_secret TEXT NOT NULL,            -- Per-server HMAC secret for heartbeat auth
  app_version TEXT,

  -- Billing
  billing_status TEXT DEFAULT 'trial' CHECK (
    billing_status IN ('trial', 'paid', 'overdue', 'cancelled')
  ),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  next_billing_date TIMESTAMPTZ,
  setup_fee_paid BOOLEAN DEFAULT false,

  -- Live metrics (updated by heartbeat)
  whatsapp_connected BOOLEAN DEFAULT false,
  disk_used_percent INTEGER,
  memory_used_percent INTEGER,
  message_count_today INTEGER DEFAULT 0,
  order_count_today INTEGER DEFAULT 0,
  last_heartbeat TIMESTAMPTZ,

  provisioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heartbeat log (keep 7 days rolling)
CREATE TABLE IF NOT EXISTS heartbeats (
  id SERIAL PRIMARY KEY,
  biz_id TEXT REFERENCES businesses(biz_id) ON DELETE CASCADE,
  status TEXT,
  app_version TEXT,
  disk_used_percent INTEGER,
  memory_used_percent INTEGER,
  message_count INTEGER,
  order_count INTEGER,
  whatsapp_connected BOOLEAN,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events log
CREATE TABLE IF NOT EXISTS billing_events (
  id SERIAL PRIMARY KEY,
  biz_id TEXT REFERENCES businesses(biz_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- subscription_created, payment_success, payment_failed, subscription_cancelled
  amount INTEGER,            -- cents
  currency TEXT DEFAULT 'USD',
  stripe_event_id TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provisioning log (debug trail)
CREATE TABLE IF NOT EXISTS provision_logs (
  id SERIAL PRIMARY KEY,
  biz_id TEXT REFERENCES businesses(biz_id) ON DELETE CASCADE,
  step TEXT NOT NULL,        -- create_server, wait_ready, dns, ssh_bootstrap, verify, email, done
  status TEXT NOT NULL CHECK (status IN ('started', 'ok', 'error')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 5: Rolling update job tracking
CREATE TABLE IF NOT EXISTS update_jobs (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  previous_version TEXT,
  status TEXT DEFAULT 'running' CHECK (
    status IN ('running', 'paused', 'completed', 'rolled_back', 'cancelled')
  ),
  batch_size INTEGER NOT NULL DEFAULT 50,
  batch_delay_ms INTEGER NOT NULL DEFAULT 600000,
  total_servers INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  rolled_back INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  failure_threshold REAL DEFAULT 0.2,
  initiated_by TEXT DEFAULT 'admin',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE TABLE IF NOT EXISTS update_job_servers (
  id SERIAL PRIMARY KEY,
  job_id TEXT REFERENCES update_jobs(id) ON DELETE CASCADE,
  biz_id TEXT REFERENCES businesses(biz_id) ON DELETE CASCADE,
  batch_number INTEGER,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'updating', 'ok', 'failed', 'rolled_back', 'skipped')
  ),
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_update_jobs_status ON update_jobs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_job_servers_job ON update_job_servers(job_id, status);
CREATE INDEX IF NOT EXISTS idx_update_job_servers_biz ON update_job_servers(biz_id);

-- Admin users (TOTP-protected)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_businesses_billing ON businesses(billing_status);
CREATE INDEX IF NOT EXISTS idx_heartbeats_biz ON heartbeats(biz_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_received ON heartbeats(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_biz ON billing_events(biz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provision_logs_biz ON provision_logs(biz_id, created_at DESC);

-- Auto-update updated_at on businesses
CREATE OR REPLACE FUNCTION fleet_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION fleet_update_updated_at();

-- Purge old heartbeats (keep 7 days)
CREATE OR REPLACE FUNCTION purge_old_heartbeats() RETURNS void AS $$
BEGIN
  DELETE FROM heartbeats WHERE received_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
