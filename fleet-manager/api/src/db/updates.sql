-- Phase 5: Update job tracking tables
-- Run this migration on the Fleet Manager PostgreSQL database.

CREATE TABLE IF NOT EXISTS update_jobs (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  previous_version TEXT,
  status TEXT DEFAULT 'running' CHECK (
    status IN ('running', 'paused', 'completed', 'rolled_back', 'cancelled')
  ),
  batch_size INTEGER NOT NULL DEFAULT 50,
  batch_delay_ms INTEGER NOT NULL DEFAULT 600000,  -- 10 min between batches
  total_servers INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  rolled_back INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  failure_threshold REAL DEFAULT 0.2,             -- auto-rollback if >20% fail
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
