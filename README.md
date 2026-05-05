# WA Bizz — Self-Hosted Per-Business WhatsApp SaaS Platform

> A complete multi-tenant WhatsApp automation platform where every SME gets their own isolated server, their own bot, and their own data. Built for Sri Lankan small businesses — clothing sellers, perfume shops, food vendors, and more.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [System Components](#4-system-components)
5. [Database Schema](#5-database-schema)
6. [How the WhatsApp Bot Works](#6-how-the-whatsapp-bot-works)
7. [Multi-Language Support](#7-multi-language-support)
8. [Auto-Provisioning Pipeline](#8-auto-provisioning-pipeline)
9. [Fleet Manager](#9-fleet-manager)
10. [Load Balancing Strategy](#10-load-balancing-strategy)
11. [Remote Update System](#11-remote-update-system)
12. [Billing and Access Control](#12-billing-and-access-control)
13. [Security](#13-security)
14. [Full Build Roadmap](#14-full-build-roadmap)
15. [Folder Structure](#15-folder-structure)
16. [Environment Variables](#16-environment-variables)
17. [Deployment](#17-deployment)
18. [Pricing Model](#18-pricing-model)
19. [Scaling Plan](#19-scaling-plan)

---

## 1. What This System Does

WA Bizz is a SaaS product you sell to small business owners in Sri Lanka. Each business owner connects their own WhatsApp number to the platform. Their customers then message that number and a smart bot handles everything — browsing products, selecting colors and sizes, placing orders, confirming payment, and tracking delivery.

The key design decision is **self-hosted per business**. When a business signs up and pays, your platform automatically creates a brand new VPS server just for them. Their bot, their products, their customer data, and their orders all live on that one server — completely isolated from every other business on the platform.

You earn a setup fee plus a monthly subscription. You manage all servers remotely from your central Fleet Manager dashboard. If one business's server crashes, every other business keeps running without any impact.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR INFRASTRUCTURE                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CENTRAL CONTROL PLANE                       │   │
│  │                                                          │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │   │  Fleet        │  │  Billing     │  │  Update     │  │   │
│  │   │  Manager      │  │  Server      │  │  Registry   │  │   │
│  │   │  (Admin UI)   │  │  (Stripe)    │  │  (Git)      │  │   │
│  │   └──────────────┘  └──────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│          Auto-provision via Hetzner Cloud API                   │
│                           │                                     │
│    ┌──────────────────────┼──────────────────────┐             │
│    ▼                      ▼                      ▼             │
│  ┌────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │ BIZ-001    │  │ BIZ-002        │  │ BIZ-003        │        │
│  │ Mala's     │  │ Rajan's        │  │ Dilani's       │        │
│  │ Fashion    │  │ Perfumes       │  │ Foods          │        │
│  │            │  │                │  │                │        │
│  │ Evolution  │  │ Evolution API  │  │ Evolution API  │        │
│  │ API        │  │ Node.js Bot    │  │ Node.js Bot    │        │
│  │ Node.js    │  │ PostgreSQL     │  │ PostgreSQL     │        │
│  │ PostgreSQL │  │ React Dashboard│  │ React Dashboard│        │
│  │ Nginx      │  │ Nginx          │  │ Nginx          │        │
│  └────────────┘  └────────────────┘  └────────────────┘        │
│        ▲                  ▲                  ▲                  │
└────────┼──────────────────┼──────────────────┼──────────────────┘
         │                  │                  │
    Customers          Customers          Customers
    (WhatsApp)         (WhatsApp)         (WhatsApp)
```

### Key Principles

**One server per business.** Every business that pays for your platform gets a dedicated Hetzner CX21 VPS. Nothing is shared at the application or database layer.

**Central control only.** Your central servers only handle billing, fleet monitoring, update distribution, and provisioning. They never touch customer data or message content.

**Automated everything.** A new business signs up → your system calls Hetzner API → new VPS is created → Docker Compose runs → bot is live. All within 4 minutes, no human action needed.

**Remote updates.** When you ship a new version, a single command in your Fleet Manager pushes the update to all 1000 servers in a rolling wave overnight.

---

## 3. Tech Stack

### Per-Business Server (runs on each SME's VPS)

| Layer | Technology | Why |
|---|---|---|
| WhatsApp API | Evolution API (open source) | Free, self-hosted, supports multiple sessions, full WhatsApp feature support |
| Bot backend | Node.js 20 + Express | Fast, async, huge ecosystem, easy webhook handling |
| Session store | Redis | In-memory session tracking per customer conversation |
| Database | PostgreSQL 16 | Reliable, powerful, great for structured order data |
| File storage | Local disk + Nginx | Product images stored locally, served by Nginx |
| Web server | Nginx | Reverse proxy, SSL termination, static file serving |
| SSL | Certbot (Let's Encrypt) | Free SSL certificates, auto-renewal |
| Containerization | Docker + Docker Compose | Easy deployment, version control, rollback |
| Process manager | PM2 (inside container) | Auto-restart on crash, log management |
| Owner dashboard | React 18 + Vite + Tailwind | Fast, mobile-friendly, real-time with Socket.io |

### Central Control Plane (your infrastructure)

| Component | Technology | Why |
|---|---|---|
| Fleet Manager API | Node.js + Express | Manages all provisioning and monitoring |
| Fleet Manager UI | React + Tailwind | Your admin dashboard to see all businesses |
| Billing | Stripe / PayHere (LK) | Handles subscriptions and payment webhooks |
| Provisioning | Hetzner Cloud API | Creates and destroys VPS servers programmatically |
| Heartbeat store | PostgreSQL | Tracks server status, uptime, last ping |
| Update registry | Private Git repo (Gitea) | Stores versioned Docker images for distribution |
| DNS management | Cloudflare API | Auto-creates subdomain per business (biz001.wabizz.lk) |
| Notification | Resend (email) | Sends onboarding emails to business owners |

### Infrastructure Providers

| Provider | What For | Cost |
|---|---|---|
| Hetzner Cloud | Per-business VPS (CX21) | ~€3.29/month per server (~Rs 1,100) |
| Hetzner (your server) | Fleet Manager + Billing | ~€10/month for control plane |
| Cloudflare | DNS, DDoS protection | Free tier sufficient |
| GitHub / Gitea | Private update registry | Free / €5/month |

---

## 4. System Components

### 4.1 Evolution API (WhatsApp Engine)

Evolution API is the open-source engine that connects to WhatsApp. It runs as a Docker container on each business VPS. It provides a REST API to:

- Send text messages, button messages, list messages, images
- Receive incoming messages via webhooks
- Manage WhatsApp session (connect, disconnect, check status)
- Send media files (product images)

Each business VPS runs exactly one Evolution API instance connected to that business's one WhatsApp number.

```
Evolution API endpoints used:
POST /instance/create        → initial setup
GET  /instance/connect       → get QR code for owner to scan
GET  /instance/connectionState → check if connected
POST /message/sendText       → send text to customer
POST /message/sendButtons    → send interactive button message
POST /message/sendList       → send list menu
POST /message/sendMedia      → send product image
```

### 4.2 Bot Engine (Node.js)

The bot engine is the brain. It receives webhooks from Evolution API, reads customer sessions from Redis, queries the product catalog from PostgreSQL, and sends replies back through Evolution API.

The conversation is entirely button/list driven. A customer never needs to type anything except their name and delivery address. Every other interaction is a button tap — this makes the bot work perfectly in all three languages (English, Sinhala, Tamil) without any AI.

### 4.3 Session Manager (Redis)

Each active customer conversation is a session in Redis. The session stores:

```json
{
  "customerId": "+94771234567",
  "step": "select_size",
  "lang": "si",
  "selectedProduct": "SHIRT-042",
  "selectedColor": "Red",
  "cart": [],
  "name": null,
  "address": null,
  "sessionStart": "2026-05-05T10:23:00Z"
}
```

Sessions expire after 30 minutes of inactivity and are cleaned up automatically by Redis TTL.

### 4.4 Owner Dashboard (React)

The dashboard is served by Nginx from the same VPS. The business owner accesses it at their subdomain (e.g. `mala.wabizz.lk`). Features include:

- Real-time order feed via Socket.io
- Message count and order count for today
- Accept / Reject orders with one click
- Mark orders as dispatched and delivered
- Manage product catalog (add, edit, remove products)
- Upload product images
- View revenue reports and charts
- Connect / reconnect WhatsApp (shows QR code from Evolution API)
- View customer list and conversation history

### 4.5 Fleet Manager (Central)

Your private admin system. Runs on one central Hetzner server. Features include:

- See all provisioned business servers in one table
- Live heartbeat status (green/yellow/red per server)
- Push software updates to all servers or selected ones
- Suspend/restore server access (for non-payment)
- Trigger re-provisioning if a server fails
- Revenue dashboard (MRR, churn, new signups)
- Manage business onboarding and plan changes

---

## 5. Database Schema

Every per-business PostgreSQL database contains these tables. There is no `business_id` column because each business has their own completely separate database.

```sql
-- Business configuration (one row, this business's settings)
CREATE TABLE business_config (
  id SERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  business_type TEXT NOT NULL, -- 'clothing', 'perfume', 'food', 'other'
  currency TEXT DEFAULT 'LKR',
  languages TEXT[] DEFAULT '{en,si,ta}',
  welcome_msg_en TEXT,
  welcome_msg_si TEXT,
  welcome_msg_ta TEXT,
  plan TEXT DEFAULT 'starter', -- 'starter', 'growth', 'pro'
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Product catalog
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL, -- e.g. SHIRT-042
  name_en TEXT NOT NULL,
  name_si TEXT,
  name_ta TEXT,
  description_en TEXT,
  description_si TEXT,
  description_ta TEXT,
  price INTEGER NOT NULL, -- in LKR cents (e.g. 320000 = Rs 3200)
  category TEXT, -- 'tops', 'bottoms', 'dresses', etc.
  has_colors BOOLEAN DEFAULT false,
  colors TEXT[], -- e.g. ['Red', 'Blue', 'Black']
  has_sizes BOOLEAN DEFAULT false,
  sizes TEXT[], -- e.g. ['S', 'M', 'L', 'XL', 'XXL']
  stock INTEGER DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Customer records
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL, -- WhatsApp number
  name TEXT,
  address TEXT,
  lang TEXT DEFAULT 'en', -- detected language preference
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  total_orders INTEGER DEFAULT 0
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_ref TEXT UNIQUE NOT NULL, -- e.g. SL-20260505-001
  customer_id INTEGER REFERENCES customers(id),
  status TEXT DEFAULT 'new',
    -- 'new' → 'confirmed' → 'payment_pending' → 'paid'
    -- → 'dispatched' → 'delivered' → 'cancelled'
  items JSONB NOT NULL, -- array of {product_code, color, size, qty, unit_price}
  total_amount INTEGER NOT NULL, -- LKR cents
  delivery_address TEXT,
  delivery_note TEXT,
  payment_method TEXT, -- 'payhere', 'bank_transfer', 'cash_on_delivery'
  payment_ref TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  confirmed_at TIMESTAMP,
  dispatched_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Customer conversation sessions (mirror of Redis, for history)
CREATE TABLE conversation_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  direction TEXT NOT NULL, -- 'inbound' or 'outbound'
  message_type TEXT, -- 'text', 'button', 'image', 'list'
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_products_code ON products(product_code);
CREATE INDEX idx_conversation_customer ON conversation_logs(customer_id, created_at DESC);
```

---

## 6. How the WhatsApp Bot Works

### Conversation State Machine

Every customer message triggers this flow:

```
1. Message arrives at Evolution API
2. Evolution API fires webhook to Node.js bot
3. Bot reads customer session from Redis
4. Bot checks current "step" in session
5. Bot executes the handler for that step
6. Bot sends reply via Evolution API
7. Bot updates session in Redis
```

### Full Conversation Flow

```
CUSTOMER SENDS ANY MESSAGE
         │
         ▼
   Detect language (franc-min library)
   Save lang to session
         │
         ▼
   Send welcome + main menu (buttons)
   ┌──────────────────────────────┐
   │ Welcome to Mala's Fashion!   │
   │                              │
   │ [🛍 Browse products]          │
   │ [📦 My orders]               │
   │ [📞 Contact us]              │
   └──────────────────────────────┘
         │
   Customer taps [Browse products]
         │
         ▼
   Send category menu (list)
   ┌──────────────────────────────┐
   │ Choose a category:           │
   │  ▸ Sarees                    │
   │  ▸ Dresses                   │
   │  ▸ Tops & Blouses            │
   │  ▸ Kurtas                    │
   └──────────────────────────────┘
         │
   Customer selects category
         │
         ▼
   Send product list with codes
   ┌──────────────────────────────┐
   │ Sarees available:            │
   │ SAREE-001 — Red Silk Rs 4500 │
   │ SAREE-002 — Blue Silk Rs 5200│
   │                              │
   │ Reply with product code or:  │
   │ [🔍 Search by ID]            │
   └──────────────────────────────┘
         │
   Customer types: SAREE-001
         │
         ▼
   Fetch product from DB
   Send product details + image
   ┌──────────────────────────────┐
   │ [Product Image]              │
   │ Red Silk Saree               │
   │ Rs 4,500 · In stock: 8       │
   │                              │
   │ Choose colour:               │
   │ [Red] [Maroon] [Pink]        │
   └──────────────────────────────┘
         │
   Customer taps [Red]
         │
         ▼
   (If has_sizes = true)
   ┌──────────────────────────────┐
   │ Choose size:                 │
   │ [S] [M] [L] [XL] [XXL]      │
   └──────────────────────────────┘
         │
   Customer taps [M]
         │
         ▼
   ┌──────────────────────────────┐
   │ Quantity?                    │
   │ [1] [2] [3] [Other]         │
   └──────────────────────────────┘
         │
         ▼
   ┌──────────────────────────────┐
   │ Your name? (type it)         │
   └──────────────────────────────┘
         │
         ▼
   ┌──────────────────────────────┐
   │ Delivery address? (type it)  │
   └──────────────────────────────┘
         │
         ▼
   Show order summary
   ┌──────────────────────────────┐
   │ ✅ Order summary:             │
   │ Red Silk Saree (M) × 1       │
   │ Total: Rs 4,500              │
   │ Deliver to: [address]        │
   │                              │
   │ [✅ Confirm order]           │
   │ [❌ Cancel]                  │
   └──────────────────────────────┘
         │
   Customer taps [Confirm]
         │
         ▼
   Generate order ref: SL-20260505-001
   Save order to PostgreSQL
   Send to customer: "Order confirmed ✅"
   Notify owner dashboard via Socket.io
```

---

## 7. Multi-Language Support

Language detection runs on the first message using the `franc-min` npm package. The detected language (`en`, `si`, `ta`) is stored in the customer's Redis session and used for all subsequent messages in that conversation.

All button labels, messages, and prompts have three versions stored in the `business_config` table and in a `translations.json` file bundled with the bot.

```json
{
  "welcome": {
    "en": "Welcome to {businessName}! How can we help you today?",
    "si": "{businessName} වෙත සාදරයෙන් පිළිගනිමු! අද ඔබට කෙසේ උදව් කළ හැකිද?",
    "ta": "{businessName} க்கு வரவேற்கிறோம்! இன்று நாங்கள் உங்களுக்கு எவ்வாறு உதவலாம்?"
  },
  "browse": {
    "en": "Browse products",
    "si": "නිෂ්පාදන බලන්න",
    "ta": "பொருட்களை உலாவுக"
  },
  "confirm_order": {
    "en": "Confirm order",
    "si": "ඇණවුම තහවුරු කරන්න",
    "ta": "ஆர்டரை உறுதிப்படுத்துங்கள்"
  }
}
```

---

## 8. Auto-Provisioning Pipeline

When a business pays and completes signup, your central server executes this automated pipeline — no human involvement required.

```
Payment confirmed (Stripe webhook)
          │
          ▼
Create business record in central DB
Generate unique business ID: biz_0042
Generate subdomain: mala.wabizz.lk
          │
          ▼
Call Hetzner Cloud API → Create new CX21 VPS
  - Location: Helsinki or Nuremberg (cheapest)
  - Image: Ubuntu 24.04
  - SSH key: your fleet manager public key
  - User data: cloud-init bootstrap script
          │
          ▼
Wait for VPS to be ready (~60 seconds)
          │
          ▼
Cloudflare API → Create A record
  mala.wabizz.lk → [new VPS IP]
          │
          ▼
SSH into new VPS (automated)
Run bootstrap.sh:
  1. Install Docker + Docker Compose
  2. Install Nginx + Certbot
  3. Clone bot software from private registry
  4. Write .env file with business config
  5. docker compose up -d
  6. Request SSL certificate (Let's Encrypt)
  7. Configure Nginx reverse proxy
  8. Register heartbeat cron (sends ping every 60s)
  9. Set webhook URL in Evolution API
          │
          ▼
Verify: ping /health endpoint
          │
          ▼
Send onboarding email to business owner:
  - Dashboard URL: https://mala.wabizz.lk
  - Login credentials
  - QR scan instructions
  - Getting started guide
          │
          ▼
Fleet Manager marks server as LIVE ✅
Total time: 3–5 minutes
```

### bootstrap.sh (runs on new VPS at creation)

```bash
#!/bin/bash
set -e

# System update
apt-get update -y && apt-get upgrade -y
apt-get install -y docker.io docker-compose nginx certbot python3-certbot-nginx git curl

# Start Docker
systemctl enable docker && systemctl start docker

# Clone the bot software from your private registry
git clone https://YOUR_GITEA_TOKEN@gitea.wabizz.lk/wabizz/bot-core.git /opt/wabizz

# Write environment config (injected by fleet manager)
cat > /opt/wabizz/.env << EOF
BUSINESS_ID=${BUSINESS_ID}
BUSINESS_NAME=${BUSINESS_NAME}
BUSINESS_TYPE=${BUSINESS_TYPE}
SUBDOMAIN=${SUBDOMAIN}
FLEET_MANAGER_URL=https://fleet.wabizz.lk
FLEET_MANAGER_SECRET=${FLEET_SECRET}
DB_PASSWORD=${DB_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF

# Start all services
cd /opt/wabizz && docker compose up -d

# Configure Nginx
cat > /etc/nginx/sites-available/wabizz << NGINX
server {
    listen 80;
    server_name ${SUBDOMAIN}.wabizz.lk;
    location / { proxy_pass http://localhost:3000; }
    location /evolution { proxy_pass http://localhost:8080; }
}
NGINX
ln -s /etc/nginx/sites-available/wabizz /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d ${SUBDOMAIN}.wabizz.lk --non-interactive --agree-tos -m admin@wabizz.lk

# Register heartbeat (sends server health to fleet manager every 60s)
echo "* * * * * curl -s -X POST https://fleet.wabizz.lk/heartbeat \
  -H 'Authorization: Bearer ${FLEET_SECRET}' \
  -d '{\"bizId\":\"${BUSINESS_ID}\",\"status\":\"ok\"}'" | crontab -

echo "Bootstrap complete ✅"
```

---

## 9. Fleet Manager

The Fleet Manager is your private control panel that runs on one dedicated central server.

### What it tracks per business server

```json
{
  "bizId": "biz_0042",
  "businessName": "Mala's Fashion",
  "serverIp": "65.21.xxx.xxx",
  "subdomain": "mala.wabizz.lk",
  "plan": "growth",
  "status": "live",
  "lastHeartbeat": "2026-05-05T10:59:45Z",
  "whatsappConnected": true,
  "appVersion": "2.4.1",
  "diskUsedPercent": 34,
  "memoryUsedPercent": 58,
  "messageCountToday": 1243,
  "orderCountToday": 38,
  "billingStatus": "paid",
  "nextBillingDate": "2026-06-05",
  "provisionedAt": "2026-01-15T08:30:00Z"
}
```

### Fleet Manager API Endpoints

```
GET  /admin/businesses          → list all businesses with status
GET  /admin/businesses/:id      → full detail of one business
POST /admin/provision           → trigger new server provision
POST /admin/update/:id          → push update to one server
POST /admin/update/all          → push update to all servers (rolling)
POST /admin/suspend/:id         → disable bot access (non-payment)
POST /admin/restore/:id         → re-enable bot access
POST /admin/reconnect/:id       → trigger WhatsApp QR refresh
DELETE /admin/deprovision/:id   → destroy server (business cancels)
POST /heartbeat                 → receives pings from all servers
GET  /admin/revenue             → MRR, churn, growth metrics
```

---

## 10. Load Balancing Strategy

In the self-hosted per-business model, each server handles only one business. There is no traditional application load balancer needed at the per-business level. However you need load balancing at the central control plane level.

### DNS-Level Load Balancing (for your central API)

Your Fleet Manager and Billing server can have two instances behind Cloudflare's free load balancing. Cloudflare routes traffic between them and provides automatic failover.

```
fleet.wabizz.lk
      │
  Cloudflare LB
      │
  ┌───┴───┐
  ▼       ▼
Fleet-1  Fleet-2
(primary) (failover)
```

### Per-Business Server: No LB Needed

Each business VPS is small (CX21 — 2 vCPU, 4GB RAM). A single server handles 5,000+ WhatsApp messages per day comfortably. You only need to scale a single business's server if they grow beyond 20,000 messages/day — at which point you upgrade their VPS tier from CX21 to CX31 (one API call to Hetzner).

### Smart Server Placement

When provisioning, pick the Hetzner location geographically closest to the business owner for the best dashboard experience:

- Sri Lanka businesses → `hel1` (Helsinki) or `nbg1` (Nuremberg) — both ~120ms latency, cheapest
- Future expansion to India → `blr1` (Bangalore) Hetzner location when available

---

## 11. Remote Update System

This is how you push code updates to all 1000 servers without touching any of them manually.

### How Updates Flow

```
You commit new code to private Gitea repo
          │
          ▼
CI pipeline runs tests (GitHub Actions / Gitea Actions)
          │
          ▼
Build new Docker image → push to private Docker registry
Tag as version: wabizz/bot:2.4.2
          │
          ▼
In Fleet Manager: click "Push update to all"
Set: version=2.4.2, rollout=rolling, batchSize=50
          │
          ▼
Fleet Manager sends update signal to server batches:
Batch 1 (50 servers) → wait 10 min → check health
Batch 2 (50 servers) → wait 10 min → check health
... continues until all servers updated
          │
          ▼
Each server runs:
  cd /opt/wabizz
  git pull origin main
  docker compose pull
  docker compose up -d --no-deps bot
  (zero-downtime: new container starts before old one stops)
```

### Rollback

If a batch shows errors after update, Fleet Manager auto-rolls back that batch to the previous image tag and pauses the rollout until you review.

```bash
# Rollback command sent to affected servers
cd /opt/wabizz
docker compose pull bot:2.4.1
docker compose up -d --no-deps bot
```

---

## 12. Billing and Access Control

### How Billing Works

1. Business owner pays monthly via Stripe (card) or PayHere (Sri Lanka local — supports bank transfer, cards, FriMi, eZCash)
2. Stripe/PayHere fires a webhook to your central billing server on payment success and failure
3. Billing server updates the `billing_status` in your central database
4. Fleet Manager checks billing status every 6 hours

### Access Control on Non-Payment

When billing_status becomes `overdue` (3 days after due date):

```
Fleet Manager → SSH to business VPS
  → Set ENV: BOT_ACTIVE=false
  → docker compose restart bot

Bot now responds to ALL customer messages:
"This store is temporarily unavailable. Please contact the seller directly."

Owner dashboard shows: "Subscription expired. Renew to reactivate."
```

When they pay:
```
Stripe webhook → billing_status = paid
Fleet Manager → SSH to VPS → Set BOT_ACTIVE=true → restart bot
Bot live again within 2 minutes
```

---

## 13. Security

### Per-Business Server Security

Each VPS is hardened at provisioning time:

- UFW firewall: only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open
- SSH access: key-based only, password auth disabled
- Evolution API: bound to localhost only, not exposed externally
- PostgreSQL: bound to localhost only, never exposed externally
- Redis: password-protected, bound to localhost only
- Nginx: rate limiting (100 requests/minute per IP)
- Certbot: auto-renewing SSL certificate
- Fail2ban: blocks IPs after repeated SSH failures

### Fleet Manager Security

- Fleet Manager communicates with each VPS using a unique per-server secret token
- All communication is HTTPS only
- Admin UI protected by username + TOTP (two-factor authentication)
- Heartbeat endpoint validates the per-server token on every request

### Data Privacy

- Customer data (phone numbers, names, addresses, orders) lives only on the business's own VPS
- Your central servers never see, store, or process any customer data
- This is a strong selling point: "Your data never leaves your own server"

---

## 14. Full Build Roadmap

This roadmap is divided into six phases. Each phase produces something working and testable before moving to the next.

---

### Phase 1 — Core Bot (Weeks 1–4)

**Goal:** One WhatsApp number, one business, working bot on a single server.

**Tasks:**

1. Set up a Hetzner CX21 VPS manually (this will later be automated)
2. Install Docker and Docker Compose
3. Deploy Evolution API using official Docker image
4. Connect one WhatsApp number by scanning QR
5. Build Node.js Express app with webhook endpoint
6. Implement basic Redis session management
7. Set up PostgreSQL with products and orders tables
8. Build conversation flow:
   - Welcome message with language detection
   - Main menu buttons
   - Product listing by category
   - Product detail with image
   - Color selection buttons
   - Size selection buttons (for clothing)
   - Quantity selection
   - Name and address collection
   - Order summary and confirm/cancel
   - Order saved to PostgreSQL
9. Test full conversation end-to-end
10. Set up Nginx + SSL with Certbot

**Deliverable:** One working WhatsApp bot that takes orders and saves them to a database.

---

### Phase 2 — Owner Dashboard (Weeks 5–7)

**Goal:** Business owner can see and manage orders from their phone or laptop.

**Tasks:**

1. Build React dashboard with Vite and Tailwind CSS
2. Socket.io integration for real-time order arrival
3. Today's summary (messages, orders, revenue)
4. Order list with accept / reject / dispatch / deliver buttons
5. Each action triggers a WhatsApp notification to the customer:
   - Accept → "Your order is confirmed ✅ Order #SL-001"
   - Dispatch → "Your order is on the way 🚚"
   - Deliver → "Your order has been delivered 📦"
6. Product catalog management (add, edit, delete products)
7. Image upload for products (stored locally, served by Nginx)
8. WhatsApp QR reconnect screen (in case connection drops)
9. Basic revenue chart (daily orders and revenue)
10. Mobile-responsive layout (most owners use phones)

**Deliverable:** Full working system. A clothing shop owner can manage their business entirely from the dashboard.

---

### Phase 3 — Payment Integration (Week 8–9)

**Goal:** Customers receive payment links and orders are confirmed automatically.

**Tasks:**

1. Integrate PayHere (Sri Lanka) for local payment methods
2. After order confirmation, send payment link via WhatsApp
3. PayHere fires webhook on payment — order status updates automatically
4. Optional: Stripe integration for card payments
5. Show payment status in owner dashboard
6. Manual "mark as paid" option for bank transfer / cash on delivery

**Deliverable:** End-to-end automated payment flow.

---

### Phase 4 — Auto-Provisioning (Weeks 10–13)

**Goal:** New businesses can sign up online and their server is created automatically.

**Tasks:**

1. Build central Fleet Manager backend (Node.js)
2. Build signup / onboarding flow (landing page + form)
3. Integrate Stripe for subscription billing (monthly)
4. On payment: call Hetzner API to create new CX21 VPS
5. SSH automation using `node-ssh` library
6. Write and test `bootstrap.sh` provisioning script
7. Cloudflare API integration for automatic subdomain creation
8. Send onboarding email via Resend API (dashboard URL + instructions)
9. Heartbeat system: each server pings Fleet Manager every 60 seconds
10. Build Fleet Manager UI (React, your private admin panel)
11. Test full signup → provisioning → live bot flow

**Deliverable:** Self-service signup. A business owner pays online and has a live bot in under 5 minutes.

---

### Phase 5 — Remote Updates + Fleet Management (Weeks 14–16)

**Goal:** Push software updates to all servers from one place. Manage all businesses from the Fleet Manager.

**Tasks:**

1. Set up private Docker registry (or use Gitea Packages)
2. Build CI pipeline (Gitea Actions) — on push: test → build image → push to registry
3. Fleet Manager: "Push update" button — rolling update with batch size control
4. Auto-rollback if health check fails after update
5. Fleet Manager: suspend and restore access tied to billing webhook
6. Fleet Manager: one-click VPS resize when a business needs more power
7. Alerting: email or Telegram notification when server goes offline
8. Server metrics dashboard (memory, disk, uptime per server)

**Deliverable:** You can manage 1000 servers from one screen and push updates overnight.

---

### Phase 6 — Polish, Scaling, and Multi-Business-Type (Weeks 17–20)

**Goal:** Support different business types (perfume, food, electronics). Harden the system for scale.

**Tasks:**

1. Business type templates:
   - Clothing template: has colors + sizes
   - Perfume template: has ml sizes, fragrance family
   - Food template: has portion sizes, daily availability toggle
   - Generic template: simple product + price
2. Catalog import via CSV (business can upload their full catalog at once)
3. Customer broadcast messages (business can message all past customers)
4. Delivery rider management (assign rider, rider gets WhatsApp notification)
5. Multi-language catalog entries (all product names in en/si/ta)
6. Analytics export (CSV download of orders and revenue)
7. Automated backup (daily pg_dump to Hetzner Object Storage)
8. Monitoring integration (UptimeRobot for each subdomain)
9. Load testing and performance tuning

**Deliverable:** Production-ready platform handling 1000+ businesses.

---

## 15. Folder Structure

### Per-Business Bot (deployed on each VPS)

```
/opt/wabizz/
├── docker-compose.yml          # Orchestrates all services
├── .env                        # Business-specific config (auto-generated)
├── bot/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Express app + webhook handler
│   │   ├── config.js           # Loads .env config
│   │   ├── session/
│   │   │   └── redis.js        # Customer session read/write
│   │   ├── bot/
│   │   │   ├── router.js       # Routes messages to step handlers
│   │   │   ├── steps/
│   │   │   │   ├── welcome.js
│   │   │   │   ├── browse.js
│   │   │   │   ├── product.js
│   │   │   │   ├── color.js
│   │   │   │   ├── size.js
│   │   │   │   ├── quantity.js
│   │   │   │   ├── collect_name.js
│   │   │   │   ├── collect_address.js
│   │   │   │   ├── confirm_order.js
│   │   │   │   └── my_orders.js
│   │   │   └── messages/
│   │   │       ├── send.js     # Wrapper around Evolution API
│   │   │       └── templates.js # Button/list message builders
│   │   ├── db/
│   │   │   ├── postgres.js     # DB connection pool
│   │   │   ├── products.js     # Product queries
│   │   │   ├── orders.js       # Order queries
│   │   │   └── customers.js    # Customer queries
│   │   ├── lang/
│   │   │   ├── detect.js       # franc-min language detection
│   │   │   └── translations.json
│   │   └── notifications/
│   │       └── owner.js        # Socket.io emit to dashboard
├── dashboard/
│   ├── Dockerfile
│   ├── package.json
│   └── src/                    # React app
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx   # Main order management view
│       │   ├── Catalog.jsx     # Product management
│       │   ├── Settings.jsx    # Business config + QR connect
│       │   └── Reports.jsx     # Revenue charts
│       └── components/
├── nginx/
│   └── default.conf
└── postgres/
    └── init.sql                # Schema setup on first run
```

### Central Fleet Manager

```
/opt/fleet-manager/
├── api/                        # Fleet Manager backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── admin.js
│   │   │   ├── heartbeat.js
│   │   │   ├── billing.js      # Stripe webhook handler
│   │   │   └── provision.js    # Hetzner API integration
│   │   ├── services/
│   │   │   ├── hetzner.js      # VPS create/destroy/resize
│   │   │   ├── cloudflare.js   # DNS management
│   │   │   ├── ssh.js          # Remote commands to VPS
│   │   │   ├── updater.js      # Rolling update logic
│   │   │   └── billing.js      # Stripe/PayHere integration
│   │   └── db/
│   │       └── schema.sql      # Central DB (businesses, billing, heartbeats)
├── ui/                         # Fleet Manager React UI
└── scripts/
    ├── bootstrap.sh            # Runs on each new VPS at creation
    └── update.sh               # Runs on each VPS during updates
```

---

## 16. Environment Variables

### Per-Business VPS (.env)

```env
# Business identity
BUSINESS_ID=biz_0042
BUSINESS_NAME=Mala's Fashion
BUSINESS_TYPE=clothing
SUBDOMAIN=mala

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your_secret_key
EVOLUTION_INSTANCE=mala_main

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wabizz
DB_USER=wabizz
DB_PASSWORD=strong_random_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=strong_random_password

# Bot settings
BOT_ACTIVE=true
SESSION_TTL_SECONDS=1800

# Fleet Manager
FLEET_MANAGER_URL=https://fleet.wabizz.lk
FLEET_MANAGER_SECRET=per_server_unique_secret

# Payment
PAYHERE_MERCHANT_ID=your_merchant_id
PAYHERE_MERCHANT_SECRET=your_merchant_secret

# Dashboard
DASHBOARD_PORT=3000
JWT_SECRET=strong_random_jwt_secret
```

---

## 17. Deployment

### docker-compose.yml (per-business VPS)

```yaml
version: "3.9"

services:
  evolution:
    image: atendai/evolution-api:latest
    container_name: evolution
    restart: always
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      - SERVER_URL=https://${SUBDOMAIN}.wabizz.lk/evolution
      - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
    depends_on:
      - postgres
      - redis

  bot:
    image: wabizz-registry.wabizz.lk/wabizz/bot:latest
    container_name: bot
    restart: always
    ports:
      - "127.0.0.1:4000:4000"
    env_file: .env
    depends_on:
      - postgres
      - redis
      - evolution

  dashboard:
    image: wabizz-registry.wabizz.lk/wabizz/dashboard:latest
    container_name: dashboard
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    depends_on:
      - bot

  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: always
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    container_name: redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## 18. Pricing Model

### Plans (in LKR)

| Plan | Setup Fee | Monthly Fee | Your Server Cost | Your Profit/month |
|---|---|---|---|---|
| Starter | Rs 3,000 | Rs 3,500 | Rs 1,100 | Rs 2,400 |
| Growth | Rs 5,000 | Rs 5,500 | Rs 1,100 | Rs 4,400 |
| Pro | Rs 8,000 | Rs 9,000 | Rs 2,200 (bigger VPS) | Rs 6,800 |

### Revenue Projections

| Businesses | Plan Mix | Monthly Revenue | Server Costs | Net Profit |
|---|---|---|---|---|
| 50 | All Growth | Rs 275,000 | Rs 55,000 | Rs 220,000 |
| 200 | Mix | Rs 1,000,000 | Rs 220,000 | Rs 780,000 |
| 500 | Mix | Rs 2,500,000 | Rs 550,000 | Rs 1,950,000 |
| 1,000 | Mix | Rs 5,000,000 | Rs 1,100,000 | Rs 3,900,000 |

---

## 19. Scaling Plan

### 0–50 businesses
Manual provisioning is acceptable. Run everything on 2–3 servers. No automation needed yet. Focus on getting the bot and dashboard right.

### 50–200 businesses
Build the auto-provisioning pipeline (Phase 4). Switch to automated Hetzner API provisioning. This is the most important investment — without it you can't grow past 50 without burning out.

### 200–500 businesses
Build the Fleet Manager update system. Make sure you can push updates in one click. Hire one support person to handle WhatsApp connection issues (the most common support request).

### 500–1000 businesses
Set up monitoring for every VPS (UptimeRobot). Add automated backup (pg_dump to object storage daily). Add automated alerts to Telegram when any server goes down. At this scale, you earn ~Rs 4M/month — invest in a small team.

### 1000+ businesses
Split your private Docker registry to a CDN-backed registry so update distribution is fast. Consider Hetzner dedicated servers for higher-volume businesses. Explore a reseller program — let IT agencies sell your platform under their own brand.

---

## License

This document and the system architecture described within are proprietary to WA Bizz. All rights reserved.

---

*Last updated: May 2026*
