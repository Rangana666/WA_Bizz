-- Phase 6 database additions
-- Run this migration on each per-business VPS after upgrading to Phase 6.

-- Delivery riders
CREATE TABLE IF NOT EXISTS riders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  total_deliveries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assign rider column on orders (add if upgrading)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL;

-- Broadcast message log
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id SERIAL PRIMARY KEY,
  message_en TEXT NOT NULL,
  message_si TEXT,
  message_ta TEXT,
  sent_to INTEGER DEFAULT 0,       -- number of customers reached
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Track which customers received a broadcast (avoid duplicates)
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_logs(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (broadcast_id, customer_id)
);

-- Daily availability for food products (phase 6 food template feature)
ALTER TABLE products ADD COLUMN IF NOT EXISTS daily_available BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_from TIME DEFAULT '06:00';
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_until TIME DEFAULT '22:00';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_riders_active ON riders(is_active);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_status ON broadcast_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
