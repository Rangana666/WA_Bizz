-- Tracking number support for third-party delivery
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_company TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_notified_at TIMESTAMPTZ;
