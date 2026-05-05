# WA Bizz — Quick Start Guide

## One-Command Install

### From a fresh Ubuntu 24.04 server:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/your-org/wabizz/main/install.sh)
```

### From a cloned repository:
```bash
git clone https://github.com/your-org/wabizz.git
cd wabizz
sudo ./install.sh
```

The installer will ask you to choose a mode:

---

## Installation Modes

### Mode 1 — Fleet Manager (Production)
> Installs the central control plane on your server. Businesses sign up on your website and get auto-provisioned.

**Who uses this:** You (the platform owner), once, on your Hetzner control plane server.

**What gets installed:** Fleet Manager API + Admin UI + PostgreSQL — all in Docker.

**Requires:** A domain pointing to this server (e.g. `fleet.wabizz.lk`), Stripe account, Hetzner API token, Cloudflare API token.

```bash
sudo ./install.sh --mode fleet
```

After install:
1. Your signup page is live at `https://fleet.wabizz.lk/signup`
2. Configure your Stripe webhook → `https://fleet.wabizz.lk/billing/webhook`
3. When a business pays, their VPS is auto-provisioned in ~4 minutes

---

### Mode 2 — Single Business Bot (Production)
> Installs the WhatsApp bot + owner dashboard for one business on this server.

**Who uses this:** When manually setting up a bot for one specific customer, or testing before auto-provisioning.

**What gets installed:** Bot API + Dashboard + Evolution API + PostgreSQL + Redis — all in Docker.

**Requires:** A domain or subdomain pointing to this server (e.g. `mala.wabizz.lk`).

```bash
sudo ./install.sh --mode bot
```

After install:
1. Dashboard is live at `https://mala.wabizz.lk`
2. Go to Settings → Scan QR code with WhatsApp
3. Add products in Catalog
4. Send a message to the WhatsApp number to test

---

### Mode 3 — Local Development (No SSL)
> Runs everything on localhost for development and testing.

**Who uses this:** Developers building and testing locally.

**What gets installed:** Everything in Docker, ports exposed directly. Dashboard runs on Vite dev server with hot reload.

```bash
./install.sh --mode dev
# or simply:
make dev
```

After install:

| Service | URL |
|---|---|
| Owner Dashboard | http://localhost:3000 (dev@wabizz.lk / dev123456) |
| Bot API | http://localhost:4000/health |
| Fleet Admin | http://localhost:5001 (admin@wabizz.lk / admin123456) |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Evolution API | http://localhost:8080 |

---

## Developer Workflow

```bash
make help          # Show all available commands

make up            # Start bot stack
make fleet-up      # Start fleet manager
make dev           # Start everything

make logs          # Tail all logs
make bot-logs      # Tail bot logs only
make fleet-logs    # Tail fleet logs only

make bot-shell     # Shell into bot container
make db-shell      # psql into postgres
make redis-shell   # redis-cli

make seed          # Load sample products
make migrate       # Apply Phase 6 migrations
make csv-template  # Print CSV import template

make restart-bot   # Restart bot after code change
make build-bot     # Rebuild bot Docker image

make backup        # Backup dev database locally
make status        # Show container status + health

make down          # Stop bot stack
make dev-down      # Stop everything
```

---

## Environment Variables

Each mode generates its own `.env` automatically. To customise after install:

```bash
# Bot stack
nano /opt/wabizz/.env
docker compose -f /opt/wabizz/docker-compose.yml restart bot

# Fleet Manager
nano /opt/fleet-manager/.env
cd /opt/fleet-manager && docker compose restart api
```

---

## Architecture Quick Reference

```
Your Laptop / CI
      │
      │  git push → Gitea Actions builds Docker images
      │
      ▼
Central Server (fleet.wabizz.lk)
┌─────────────────────────────────┐
│  Fleet Manager                  │
│  ┌──────────┐  ┌─────────────┐  │
│  │  API     │  │  UI         │  │
│  │ :5000    │  │ :5001       │  │
│  └──────────┘  └─────────────┘  │
│  PostgreSQL (fleet DB)          │
└───────────────┬─────────────────┘
                │  Stripe webhook → auto-provision
                │  Hetzner API → create VPS
                │  Cloudflare API → create DNS
                │  SSH → bootstrap script
                ▼
Per-Business VPS (mala.wabizz.lk)
┌─────────────────────────────────┐
│  ┌─────────┐  ┌─────────────┐   │
│  │ Bot     │  │  Dashboard  │   │
│  │ :4000   │  │  :3000      │   │
│  └─────────┘  └─────────────┘   │
│  Evolution API :8080            │
│  PostgreSQL (business data)     │
│  Redis (sessions)               │
└─────────────────────────────────┘
         ▲
    WhatsApp customers
```

---

## CSV Product Import Format

```csv
product_code,name_en,name_si,name_ta,price,category,stock,has_colors,colors,has_sizes,sizes,description_en
SHIRT-001,White Cotton Shirt,සුදු කොටන් ශිර්ට්,,1500.00,Tops,10,true,White|Blue|Black,true,S|M|L|XL,Premium cotton
SAREE-001,Red Silk Saree,රතු සිල්ක් සාරිය,,4500.00,Sarees,5,true,Red|Maroon|Pink,false,,Pure silk
```

- **Price**: in LKR (the system converts to cents automatically)
- **Colors/Sizes**: pipe-separated (`Red|Blue|Black`)
- **has_colors / has_sizes**: `true` or `false`
- Upload via: Dashboard → Catalog → Import CSV

---

## Troubleshooting

**Bot not responding to WhatsApp:**
```bash
make bot-logs   # Check for errors
# Then go to Dashboard → Settings → Reconnect WhatsApp
```

**Evolution API not connecting:**
```bash
make evo-logs
# Verify EVOLUTION_API_KEY in .env matches
```

**Database errors:**
```bash
make db-shell
\dt     -- list tables
\q      -- quit
```

**Restart everything fresh:**
```bash
make down
docker volume prune -f
make up
make seed
```
