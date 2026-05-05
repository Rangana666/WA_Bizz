-- WA Bizz per-business database schema
-- This runs once when the PostgreSQL container is first created.

-- Business configuration (single row per VPS)
CREATE TABLE IF NOT EXISTS business_config (
  id SERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('clothing', 'perfume', 'food', 'other')),
  currency TEXT DEFAULT 'LKR',
  languages TEXT[] DEFAULT '{en,si,ta}',
  welcome_msg_en TEXT DEFAULT 'Welcome! How can we help you today?',
  welcome_msg_si TEXT DEFAULT 'සාදරයෙන් පිළිගනිමු! අද ඔබට කෙසේ උදව් කළ හැකිද?',
  welcome_msg_ta TEXT DEFAULT 'வரவேற்கிறோம்! இன்று நாங்கள் உங்களுக்கு எவ்வாறு உதவலாம்?',
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product catalog
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_si TEXT,
  name_ta TEXT,
  description_en TEXT,
  description_si TEXT,
  description_ta TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  category TEXT,
  has_colors BOOLEAN DEFAULT false,
  colors TEXT[] DEFAULT '{}',
  has_sizes BOOLEAN DEFAULT false,
  sizes TEXT[] DEFAULT '{}',
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer records
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  address TEXT,
  lang TEXT DEFAULT 'en' CHECK (lang IN ('en', 'si', 'ta')),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  total_orders INTEGER DEFAULT 0 CHECK (total_orders >= 0)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new' CHECK (
    status IN ('new', 'confirmed', 'payment_pending', 'paid', 'dispatched', 'delivered', 'cancelled')
  ),
  items JSONB NOT NULL DEFAULT '[]',
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  delivery_address TEXT,
  delivery_note TEXT,
  payment_method TEXT CHECK (payment_method IN ('payhere', 'bank_transfer', 'cash_on_delivery')),
  payment_ref TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  confirmed_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation logs (persistent history mirror of Redis)
CREATE TABLE IF NOT EXISTS conversation_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT CHECK (message_type IN ('text', 'button', 'image', 'list')),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_conversation_customer ON conversation_logs(customer_id, created_at DESC);

-- Auto-update updated_at on products
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Riders (Phase 6)
CREATE TABLE IF NOT EXISTS riders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  total_deliveries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcast message log (Phase 6)
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id SERIAL PRIMARY KEY,
  message_en TEXT NOT NULL,
  message_si TEXT,
  message_ta TEXT,
  sent_to INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_logs(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (broadcast_id, customer_id)
);

-- Phase 6 product additions
ALTER TABLE products ADD COLUMN IF NOT EXISTS daily_available BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL;

-- Seed initial business config (overridden by .env at runtime)
INSERT INTO business_config (business_name, owner_name, owner_phone, business_type)
VALUES ('My Business', 'Owner', '+94700000000', 'clothing')
ON CONFLICT DO NOTHING;
