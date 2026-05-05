#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║              WA Bizz — Universal Installer                                  ║
# ║                                                                              ║
# ║  Single-command setup for the full WhatsApp SaaS platform.                  ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    bash <(curl -fsSL https://raw.githubusercontent.com/Rangana666/WA_Bizz/main/install.sh)║
# ║    — OR —                                                                    ║
# ║    ./install.sh                        (from cloned repo)                    ║
# ║    ./install.sh --mode fleet           (skip mode prompt)                    ║
# ║    ./install.sh --mode bot             (single business)                     ║
# ║    ./install.sh --mode dev             (local dev, no SSL)                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colour palette ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Logging helpers ──────────────────────────────────────────────────────────
ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
info() { echo -e "${CYAN}  →${NC}  $*"; }
warn() { echo -e "${YELLOW}  !${NC}  $*"; }
step() { echo -e "\n${BOLD}${BLUE}━━ $* ${NC}"; }
die()  { echo -e "\n${RED}  ✗  ERROR: $*${NC}\n"; exit 1; }

ask() {
  local prompt="$1" var="$2" default="${3:-}"
  if [ -n "$default" ]; then
    echo -en "${BLUE}  ?${NC}  ${prompt} [${YELLOW}${default}${NC}]: "
  else
    echo -en "${BLUE}  ?${NC}  ${prompt}: "
  fi
  read -r "$var"
  if [ -z "${!var}" ] && [ -n "$default" ]; then
    eval "$var='$default'"
  fi
}

ask_secret() {
  local prompt="$1" var="$2"
  echo -en "${BLUE}  ?${NC}  ${prompt}: "
  read -rs "$var"; echo
  if [ -z "${!var}" ]; then die "${prompt} cannot be empty"; fi
}

gen() { openssl rand -hex "${1:-32}"; }
gen_pass() { openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20; }

# ─── Banner ───────────────────────────────────────────────────────────────────
print_banner() {
  echo -e "${GREEN}"
  cat << 'EOF'
  ██╗    ██╗ █████╗     ██████╗ ██╗███████╗███████╗
  ██║    ██║██╔══██╗    ██╔══██╗██║╚══███╔╝╚══███╔╝
  ██║ █╗ ██║███████║    ██████╔╝██║  ███╔╝   ███╔╝
  ██║███╗██║██╔══██║    ██╔══██╗██║ ███╔╝   ███╔╝
  ╚███╔███╔╝██║  ██║    ██████╔╝██║███████╗███████╗
   ╚══╝╚══╝ ╚═╝  ╚═╝    ╚═════╝ ╚═╝╚══════╝╚══════╝
EOF
  echo -e "${NC}"
  echo -e "  ${BOLD}WhatsApp Commerce Platform — Universal Installer${NC}"
  echo -e "  ${CYAN}https://wabizz.lk${NC}\n"
}

# ─── Parse CLI args ───────────────────────────────────────────────────────────
MODE=""
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
NONINTERACTIVE="${NONINTERACTIVE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --non-interactive) NONINTERACTIVE=1; shift ;;
    --help|-h)
      echo "Usage: ./install.sh [--mode fleet|bot|dev] [--non-interactive]"
      exit 0 ;;
    *) shift ;;
  esac
done

# ─── Requirement checks ───────────────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This installer must be run as root.\n  Try: sudo bash install.sh"
  fi
}

check_os() {
  if ! grep -qi "ubuntu\|debian" /etc/os-release 2>/dev/null; then
    warn "This installer is designed for Ubuntu/Debian. Proceeding anyway..."
  fi
  local version; version=$(lsb_release -rs 2>/dev/null || echo "unknown")
  ok "OS: $(lsb_release -ds 2>/dev/null || uname -s) ${version}"
}

check_ports() {
  local ports=("$@")
  for port in "${ports[@]}"; do
    if ss -tlnp | grep -q ":${port} "; then
      warn "Port ${port} is already in use — may cause conflicts"
    fi
  done
}

# ─── Docker installation ──────────────────────────────────────────────────────
ensure_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
    return
  fi

  info "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker --now
  ok "Docker installed"
}

ensure_deps() {
  apt-get install -y -qq git curl nginx certbot python3-certbot-nginx openssl ufw 2>/dev/null || true
  ok "System dependencies ready"
}

# ─── Repo ─────────────────────────────────────────────────────────────────────
ensure_repo() {
  # If we're already inside the repo, use it; otherwise clone it
  if [ -f "${REPO_DIR}/docker-compose.yml" ] && [ -d "${REPO_DIR}/bot" ]; then
    ok "Running from repo: ${REPO_DIR}"
  else
    info "Cloning WA Bizz repository..."
    ask "Git repository URL" REPO_URL "https://github.com/Rangana666/WA_Bizz.git"
    git clone "${REPO_URL}" /opt/wabizz-repo
    REPO_DIR="/opt/wabizz-repo"
    ok "Repository cloned to ${REPO_DIR}"
  fi
}

# ─── Nginx helpers ────────────────────────────────────────────────────────────
write_nginx_http_only() {
  local domain="$1" proxy_pass="$2" conf_name="${3:-wabizz}"
  cat > "/etc/nginx/sites-available/${conf_name}" << NGINX
server {
    listen 80;
    server_name ${domain};
    client_max_body_size 10M;

    location / {
        proxy_pass ${proxy_pass};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/${conf_name}" "/etc/nginx/sites-enabled/${conf_name}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
}

get_ssl_cert() {
  local domain="$1" email="$2"
  info "Requesting SSL certificate for ${domain}..."
  certbot --nginx -d "${domain}" --non-interactive --agree-tos \
    --email "${email}" --redirect --quiet
  ok "SSL certificate issued for ${domain}"

  # Auto-renewal cron
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sort -u | crontab -
}

# ─── Wait for service health ──────────────────────────────────────────────────
wait_healthy() {
  local url="$1" label="${2:-service}" retries=30 delay=5
  info "Waiting for ${label} to be ready..."
  for ((i=1; i<=retries; i++)); do
    if curl -sf "${url}" &>/dev/null; then
      ok "${label} is healthy"
      return 0
    fi
    sleep "${delay}"
  done
  die "${label} did not respond at ${url} after $((retries * delay))s"
}

# ══════════════════════════════════════════════════════════════════════════════
# MODE 1: FLEET MANAGER
# Installs the central control plane on this server.
# ══════════════════════════════════════════════════════════════════════════════
collect_fleet_config() {
  step "Fleet Manager Configuration"
  echo "  This server will become your central control plane."
  echo "  It manages billing, provisioning, and all business servers."
  echo

  ask "Your domain for Fleet Manager" FM_DOMAIN "fleet.wabizz.lk"
  ask "Admin email address"           FM_ADMIN_EMAIL "admin@wabizz.lk"
  ask_secret "Admin password"         FM_ADMIN_PASSWORD
  ask "Stripe secret key (sk_live_...)" FM_STRIPE_KEY ""
  ask "Stripe webhook secret"         FM_STRIPE_WEBHOOK ""
  ask "Stripe price ID — Starter plan" FM_PRICE_STARTER ""
  ask "Stripe price ID — Growth plan"  FM_PRICE_GROWTH ""
  ask "Stripe price ID — Pro plan"     FM_PRICE_PRO ""
  ask "Hetzner Cloud API token"        FM_HETZNER_TOKEN ""
  ask "Hetzner SSH key ID (numeric)"   FM_HETZNER_KEY_ID ""
  ask "Hetzner location"               FM_HETZNER_LOC "hel1"
  ask "Cloudflare API token"           FM_CF_TOKEN ""
  ask "Cloudflare zone ID (wabizz.lk)" FM_CF_ZONE_ID ""
  ask "Bot Git repo URL"               FM_GIT_REPO "gitea.wabizz.lk/wabizz/bot-core.git"
  ask "Bot Git token (leave blank if public)" FM_GIT_TOKEN ""
  ask "Resend API key (re_...)"        FM_RESEND_KEY ""
  ask "Telegram bot token (optional)"  FM_TG_TOKEN ""
  ask "Telegram chat ID (optional)"    FM_TG_CHAT ""

  # Generated secrets
  FM_JWT_SECRET=$(gen)
  FM_DB_PASSWORD=$(gen_pass)
  FM_INTERNAL_TOKEN=$(gen)

  ok "Configuration collected"
}

write_fleet_env() {
  local env_file="${INSTALL_DIR}/.env"
  info "Writing Fleet Manager .env..."
  cat > "${env_file}" << ENV
PORT=5000
FLEET_URL=https://${FM_DOMAIN}
DOMAIN=wabizz.lk
ADMIN_EMAIL=${FM_ADMIN_EMAIL}
ADMIN_PASSWORD=${FM_ADMIN_PASSWORD}
JWT_SECRET=${FM_JWT_SECRET}
ALLOWED_ORIGINS=https://${FM_DOMAIN}

DB_HOST=postgres
DB_PORT=5432
DB_NAME=fleet
DB_USER=fleet
DB_PASSWORD=${FM_DB_PASSWORD}

STRIPE_SECRET_KEY=${FM_STRIPE_KEY}
STRIPE_WEBHOOK_SECRET=${FM_STRIPE_WEBHOOK}
STRIPE_PRICE_STARTER=${FM_PRICE_STARTER}
STRIPE_PRICE_GROWTH=${FM_PRICE_GROWTH}
STRIPE_PRICE_PRO=${FM_PRICE_PRO}

HETZNER_API_TOKEN=${FM_HETZNER_TOKEN}
HETZNER_SSH_KEY_ID=${FM_HETZNER_KEY_ID}
HETZNER_LOCATION=${FM_HETZNER_LOC}

CLOUDFLARE_API_TOKEN=${FM_CF_TOKEN}
CLOUDFLARE_ZONE_ID=${FM_CF_ZONE_ID}

SSH_PRIVATE_KEY_PATH=/root/.ssh/id_rsa

BOT_GIT_REPO=${FM_GIT_REPO}
BOT_GIT_TOKEN=${FM_GIT_TOKEN}

RESEND_API_KEY=${FM_RESEND_KEY}

TELEGRAM_BOT_TOKEN=${FM_TG_TOKEN}
TELEGRAM_CHAT_ID=${FM_TG_CHAT}

FLEET_MANAGER_TOKEN=${FM_INTERNAL_TOKEN}
ENV
  chmod 600 "${env_file}"
  ok ".env written to ${env_file}"
}

install_fleet() {
  INSTALL_DIR="/opt/fleet-manager"

  step "Setting up Fleet Manager"
  info "Install directory: ${INSTALL_DIR}"

  # Copy fleet-manager from repo
  if [ -d "${INSTALL_DIR}" ]; then
    warn "Existing installation found at ${INSTALL_DIR} — updating..."
    cp -r "${REPO_DIR}/fleet-manager/." "${INSTALL_DIR}/"
  else
    cp -r "${REPO_DIR}/fleet-manager" "${INSTALL_DIR}"
  fi

  collect_fleet_config
  write_fleet_env

  # Generate SSH key for fleet manager to SSH into business VPSes
  if [ ! -f /root/.ssh/id_rsa ]; then
    info "Generating SSH key pair for fleet operations..."
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" -C "wabizz-fleet@$(hostname)" -q
    ok "SSH key generated"
    echo
    warn "Add this public key to Hetzner Cloud (Settings → SSH Keys):"
    echo
    cat /root/.ssh/id_rsa.pub
    echo
    read -rp "  Press ENTER once you've added the key to Hetzner..."
  fi

  step "Starting Fleet Manager services"
  check_ports 80 443 5000 5001

  cd "${INSTALL_DIR}"
  docker compose pull --quiet
  docker compose up -d
  ok "Fleet Manager containers started"

  step "Configuring Nginx"
  # Initial HTTP-only config for SSL challenge
  write_nginx_http_only "${FM_DOMAIN}" "http://127.0.0.1:5001"
  get_ssl_cert "${FM_DOMAIN}" "${FM_ADMIN_EMAIL}"

  # After SSL, update nginx to also proxy API
  cat > "/etc/nginx/sites-available/wabizz-fleet" << NGINX
upstream fleet_api { server 127.0.0.1:5000; }
upstream fleet_ui  { server 127.0.0.1:5001; }

server {
    listen 80;
    server_name ${FM_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${FM_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${FM_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${FM_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10M;

    # API + webhooks
    location ~ ^/(admin|billing|heartbeat|updates|health) {
        proxy_pass http://fleet_api;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Socket.io
    location /socket.io/ {
        proxy_pass http://fleet_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # UI (React SPA — everything else)
    location / {
        proxy_pass http://fleet_ui;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  nginx -t && systemctl reload nginx
  ok "Nginx configured with SSL"

  step "Verifying installation"
  wait_healthy "https://${FM_DOMAIN}/health" "Fleet Manager API"

  print_fleet_summary
}

print_fleet_summary() {
  local bar; bar=$(printf '━%.0s' {1..62})
  echo
  echo -e "${GREEN}${bar}${NC}"
  echo -e "${GREEN}${BOLD}  🎉  WA Bizz Fleet Manager is LIVE!${NC}"
  echo -e "${GREEN}${bar}${NC}"
  echo
  echo -e "  ${BOLD}Admin panel:${NC}   https://${FM_DOMAIN}"
  echo -e "  ${BOLD}Signup page:${NC}   https://${FM_DOMAIN}/signup"
  echo -e "  ${BOLD}Admin email:${NC}   ${FM_ADMIN_EMAIL}"
  echo -e "  ${BOLD}Install dir:${NC}   /opt/fleet-manager"
  echo
  echo -e "  ${CYAN}Next steps:${NC}"
  echo -e "  1. Add ${FM_DOMAIN} to Cloudflare with the IP of this server"
  echo -e "  2. Configure Stripe webhook → https://${FM_DOMAIN}/billing/webhook"
  echo -e "  3. Share https://${FM_DOMAIN}/signup with your first customers"
  echo
  echo -e "  ${YELLOW}Useful commands:${NC}"
  echo -e "  cd /opt/fleet-manager && docker compose logs -f api"
  echo -e "  cd /opt/fleet-manager && docker compose restart api"
  echo
}

# ══════════════════════════════════════════════════════════════════════════════
# MODE 2: SINGLE BUSINESS BOT
# Installs the bot + dashboard for one business on this server.
# ══════════════════════════════════════════════════════════════════════════════
collect_bot_config() {
  step "Bot Configuration"
  echo "  This will install a WhatsApp bot + owner dashboard for one business."
  echo

  ask "Business name"          BOT_BIZ_NAME   "My Fashion Store"
  ask "Business type"          BOT_BIZ_TYPE   "clothing"
  ask "Your subdomain"         BOT_SUBDOMAIN  "mybiz"
  ask "Owner email"            BOT_OWNER_EMAIL ""
  ask_secret "Dashboard password" BOT_OWNER_PASS
  ask "Fleet Manager URL (leave blank if standalone)" BOT_FLEET_URL ""

  # Generated
  BOT_DB_PASS=$(gen_pass)
  BOT_REDIS_PASS=$(gen_pass)
  BOT_EVO_KEY=$(gen 24)
  BOT_JWT=$(gen)
  BOT_BIZ_ID="biz_$(shuf -i 10000-99999 -n1)"
  BOT_FLEET_SECRET=$(gen)
  BOT_INSTANCE="${BOT_SUBDOMAIN}_main"

  ok "Configuration collected"
}

write_bot_env() {
  info "Writing bot .env..."
  cat > "${INSTALL_DIR}/.env" << ENV
BUSINESS_ID=${BOT_BIZ_ID}
BUSINESS_NAME=${BOT_BIZ_NAME}
BUSINESS_TYPE=${BOT_BIZ_TYPE}
SUBDOMAIN=${BOT_SUBDOMAIN}

DB_HOST=postgres
DB_PORT=5432
DB_NAME=wabizz
DB_USER=wabizz
DB_PASSWORD=${BOT_DB_PASS}

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${BOT_REDIS_PASS}

EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=${BOT_EVO_KEY}
EVOLUTION_INSTANCE=${BOT_INSTANCE}

BOT_ACTIVE=true
SESSION_TTL_SECONDS=1800
BOT_PORT=4000

FLEET_MANAGER_URL=${BOT_FLEET_URL}
FLEET_MANAGER_SECRET=${BOT_FLEET_SECRET}

JWT_SECRET=${BOT_JWT}
DASHBOARD_OWNER_EMAIL=${BOT_OWNER_EMAIL}
DASHBOARD_OWNER_PASSWORD=${BOT_OWNER_PASS}

PAYHERE_SANDBOX=true
ENV
  chmod 600 "${INSTALL_DIR}/.env"
  ok ".env written"
}

install_bot() {
  INSTALL_DIR="/opt/wabizz"

  step "Setting up WA Bizz Bot"

  if [ -d "${INSTALL_DIR}" ]; then
    warn "Existing installation found at ${INSTALL_DIR} — updating..."
    cp -r "${REPO_DIR}/bot" "${REPO_DIR}/dashboard" "${REPO_DIR}/postgres" \
           "${REPO_DIR}/nginx" "${REPO_DIR}/docker-compose.yml" "${INSTALL_DIR}/" 2>/dev/null || true
  else
    mkdir -p "${INSTALL_DIR}"
    cp -r "${REPO_DIR}/bot" "${REPO_DIR}/dashboard" "${REPO_DIR}/postgres" \
           "${REPO_DIR}/nginx" "${REPO_DIR}/docker-compose.yml" "${INSTALL_DIR}/"
  fi

  collect_bot_config

  local DOMAIN="${BOT_SUBDOMAIN}.wabizz.lk"
  ask "Full domain for this bot" DOMAIN "${DOMAIN}"
  ask "SSL email"                 SSL_EMAIL "admin@wabizz.lk"

  write_bot_env

  step "Starting bot services"
  check_ports 80 443

  cd "${INSTALL_DIR}"
  docker compose pull --quiet
  docker compose up -d --build
  ok "All containers started"

  step "Configuring Nginx"
  write_nginx_http_only "${DOMAIN}" "http://127.0.0.1:3000"

  step "Waiting for services to initialize (45s)..."
  sleep 45

  get_ssl_cert "${DOMAIN}" "${SSL_EMAIL}"

  # Full Nginx config after SSL
  cat > "/etc/nginx/sites-available/wabizz" << NGINX
upstream bot_up  { server 127.0.0.1:4000; }
upstream dash_up { server 127.0.0.1:3000; }

server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 10M;

    location /api/       { proxy_pass http://bot_up; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; }
    location /webhook    { proxy_pass http://bot_up; proxy_set_header Host \$host; }
    location /pay/       { proxy_pass http://bot_up; proxy_set_header Host \$host; }
    location /health     { proxy_pass http://bot_up; proxy_set_header Host \$host; }
    location /uploads/   { proxy_pass http://bot_up; proxy_set_header Host \$host; }
    location /socket.io/ {
        proxy_pass http://bot_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
    location / {
        proxy_pass http://dash_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  nginx -t && systemctl reload nginx

  step "Verifying installation"
  wait_healthy "http://127.0.0.1:4000/health" "Bot API"

  print_bot_summary "${DOMAIN}"
}

print_bot_summary() {
  local domain="$1"
  local bar; bar=$(printf '━%.0s' {1..62})
  echo
  echo -e "${GREEN}${bar}${NC}"
  echo -e "${GREEN}${BOLD}  🤖  WA Bizz Bot is LIVE!${NC}"
  echo -e "${GREEN}${bar}${NC}"
  echo
  echo -e "  ${BOLD}Dashboard:${NC}    https://${domain}"
  echo -e "  ${BOLD}Login email:${NC}  ${BOT_OWNER_EMAIL}"
  echo -e "  ${BOLD}Install dir:${NC}  /opt/wabizz"
  echo
  echo -e "  ${CYAN}Next steps:${NC}"
  echo -e "  1. Open the dashboard and go to Settings"
  echo -e "  2. Click 'Get QR Code' and scan with WhatsApp"
  echo -e "  3. Go to Catalog and add your products"
  echo -e "  4. Send a message to your WhatsApp number to test the bot"
  echo
  echo -e "  ${YELLOW}Useful commands:${NC}"
  echo -e "  cd /opt/wabizz && docker compose logs -f bot"
  echo -e "  cd /opt/wabizz && docker compose restart bot"
  echo
}

# ══════════════════════════════════════════════════════════════════════════════
# MODE 3: LOCAL DEVELOPMENT ENVIRONMENT
# Everything on one machine, no SSL, ports exposed directly.
# ══════════════════════════════════════════════════════════════════════════════
install_dev() {
  step "Setting up Development Environment"
  echo "  No SSL. Services accessible on localhost."
  echo

  INSTALL_DIR="${REPO_DIR}"
  DEV_ENV="${INSTALL_DIR}/.env"

  if [ ! -f "${DEV_ENV}" ]; then
    info "Generating development .env..."
    cat > "${DEV_ENV}" << ENV
# Development environment — auto-generated by install.sh
BUSINESS_ID=biz_dev001
BUSINESS_NAME=Dev Business
BUSINESS_TYPE=clothing
SUBDOMAIN=dev

DB_HOST=postgres
DB_PORT=5432
DB_NAME=wabizz
DB_USER=wabizz
DB_PASSWORD=$(gen_pass)

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$(gen_pass)

EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=$(gen 24)
EVOLUTION_INSTANCE=dev_main

BOT_ACTIVE=true
SESSION_TTL_SECONDS=1800
BOT_PORT=4000

FLEET_MANAGER_URL=
FLEET_MANAGER_SECRET=$(gen)

JWT_SECRET=$(gen)
DASHBOARD_OWNER_EMAIL=dev@wabizz.lk
DASHBOARD_OWNER_PASSWORD=dev123456

PAYHERE_SANDBOX=true
ENV
    ok ".env generated"
  else
    ok "Using existing .env"
  fi

  # Fleet manager dev env
  FM_DEV_ENV="${INSTALL_DIR}/fleet-manager/.env"
  if [ ! -f "${FM_DEV_ENV}" ]; then
    cat > "${FM_DEV_ENV}" << ENV
PORT=5000
FLEET_URL=http://localhost:5000
DOMAIN=localhost
ADMIN_EMAIL=admin@wabizz.lk
ADMIN_PASSWORD=admin123456
JWT_SECRET=$(gen)

DB_HOST=postgres
DB_PORT=5432
DB_NAME=fleet
DB_USER=fleet
DB_PASSWORD=$(gen_pass)

STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
STRIPE_PRICE_STARTER=price_placeholder
STRIPE_PRICE_GROWTH=price_placeholder
STRIPE_PRICE_PRO=price_placeholder

HETZNER_API_TOKEN=placeholder
HETZNER_SSH_KEY_ID=placeholder
HETZNER_LOCATION=hel1

CLOUDFLARE_API_TOKEN=placeholder
CLOUDFLARE_ZONE_ID=placeholder

BOT_GIT_REPO=placeholder
BOT_GIT_TOKEN=

RESEND_API_KEY=placeholder
FLEET_MANAGER_TOKEN=$(gen)
ENV
    ok "Fleet manager .env generated"
  fi

  step "Starting bot stack (bot + dashboard + postgres + redis + evolution)"
  cd "${INSTALL_DIR}"
  docker compose -f docker-compose.dev.yml up -d --build
  ok "Bot stack started"

  step "Starting Fleet Manager stack"
  cd "${INSTALL_DIR}/fleet-manager"
  docker compose up -d
  ok "Fleet Manager started"

  step "Verifying services"
  wait_healthy "http://localhost:4000/health" "Bot API"
  wait_healthy "http://localhost:5000/health" "Fleet Manager API"

  print_dev_summary
}

print_dev_summary() {
  local bar; bar=$(printf '━%.0s' {1..62})
  echo
  echo -e "${GREEN}${bar}${NC}"
  echo -e "${GREEN}${BOLD}  🛠  Development Environment Ready!${NC}"
  echo -e "${GREEN}${bar}${NC}"
  echo
  echo -e "  ${BOLD}Bot API:${NC}          http://localhost:4000/health"
  echo -e "  ${BOLD}Dashboard:${NC}        http://localhost:3000"
  echo -e "  ${BOLD}Dashboard login:${NC}  dev@wabizz.lk / dev123456"
  echo -e "  ${BOLD}Fleet Manager:${NC}    http://localhost:5000/health"
  echo -e "  ${BOLD}Fleet Admin:${NC}      http://localhost:5001"
  echo -e "  ${BOLD}Fleet login:${NC}      admin@wabizz.lk / admin123456"
  echo -e "  ${BOLD}PostgreSQL:${NC}       localhost:5432 (check .env for password)"
  echo -e "  ${BOLD}Redis:${NC}            localhost:6379"
  echo
  echo -e "  ${CYAN}Quick commands (from repo root):${NC}"
  echo -e "  make logs         — Follow all container logs"
  echo -e "  make bot-shell    — Shell inside bot container"
  echo -e "  make db-shell     — psql inside postgres container"
  echo -e "  make restart-bot  — Restart bot after code changes"
  echo -e "  make down         — Stop everything"
  echo
  echo -e "  ${YELLOW}To test the WhatsApp bot:${NC}"
  echo -e "  Dashboard → Settings → Get QR Code → scan with WhatsApp"
  echo
}

# ─── Mode selection ───────────────────────────────────────────────────────────
select_mode() {
  if [ -n "${MODE}" ]; then return; fi

  step "Select Installation Type"
  echo -e "  ${BOLD}1)${NC} Fleet Manager   — Central control plane for managing all businesses"
  echo -e "  ${BOLD}2)${NC} Bot + Dashboard — Single business WhatsApp bot (production)"
  echo -e "  ${BOLD}3)${NC} Dev Environment — Everything on localhost, no SSL, for development"
  echo
  ask "Your choice" MODE "3"
}

# ─── Main entry point ─────────────────────────────────────────────────────────
main() {
  print_banner

  check_root
  check_os
  ensure_deps
  ensure_docker
  ensure_repo

  select_mode

  case "${MODE}" in
    1|fleet)   install_fleet ;;
    2|bot)     install_bot ;;
    3|dev)     install_dev ;;
    *) die "Invalid mode '${MODE}'. Choose 1 (fleet), 2 (bot), or 3 (dev)" ;;
  esac
}

main "$@"
