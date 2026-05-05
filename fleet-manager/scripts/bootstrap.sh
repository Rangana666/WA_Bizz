#!/bin/bash
# WA Bizz VPS Bootstrap Script
# This script runs on a fresh Ubuntu 24.04 VPS when a new business is provisioned.
# It is executed via SSH by the Fleet Manager provisioning service.
# All environment variables are injected by the Fleet Manager before execution.

set -e
export DEBIAN_FRONTEND=noninteractive

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== WA Bizz Bootstrap Starting ==="
log "Business ID: ${BUSINESS_ID}"
log "Subdomain:   ${SUBDOMAIN}.wabizz.lk"

# ── System update ──────────────────────────────────────────────────────────────
log "--- Updating system ---"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  docker.io docker-compose-plugin \
  nginx certbot python3-certbot-nginx \
  git curl ufw fail2ban htop unattended-upgrades

# ── Docker ─────────────────────────────────────────────────────────────────────
log "--- Configuring Docker ---"
systemctl enable docker --now
usermod -aG docker root

# ── Firewall ───────────────────────────────────────────────────────────────────
log "--- Configuring UFW firewall ---"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# ── Fail2ban ───────────────────────────────────────────────────────────────────
log "--- Configuring fail2ban ---"
systemctl enable fail2ban --now

# ── Clone bot repository ───────────────────────────────────────────────────────
log "--- Cloning bot repository ---"
if [ -d /opt/wabizz ]; then
  rm -rf /opt/wabizz
fi

if [ -n "${BOT_GIT_TOKEN}" ]; then
  git clone "https://token:${BOT_GIT_TOKEN}@${BOT_GIT_REPO}" /opt/wabizz
else
  git clone "https://${BOT_GIT_REPO}" /opt/wabizz
fi

# ── Write .env ────────────────────────────────────────────────────────────────
log "--- Writing environment config ---"
cat > /opt/wabizz/.env << ENVEOF
BUSINESS_ID=${BUSINESS_ID}
BUSINESS_NAME=${BUSINESS_NAME}
BUSINESS_TYPE=${BUSINESS_TYPE}
SUBDOMAIN=${SUBDOMAIN}
DB_HOST=postgres
DB_PORT=5432
DB_NAME=wabizz
DB_USER=wabizz
DB_PASSWORD=${DB_PASSWORD}
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
EVOLUTION_INSTANCE=${SUBDOMAIN}_main
BOT_ACTIVE=true
SESSION_TTL_SECONDS=1800
BOT_PORT=4000
FLEET_MANAGER_URL=${FLEET_MANAGER_URL}
FLEET_MANAGER_SECRET=${FLEET_MANAGER_SECRET}
JWT_SECRET=${JWT_SECRET}
DASHBOARD_OWNER_EMAIL=${OWNER_EMAIL}
DASHBOARD_OWNER_PASSWORD=${OWNER_PASSWORD}
PAYHERE_MERCHANT_ID=${PAYHERE_MERCHANT_ID}
PAYHERE_MERCHANT_SECRET=${PAYHERE_MERCHANT_SECRET}
PAYHERE_SANDBOX=false
ENVEOF

chmod 600 /opt/wabizz/.env

# ── Start Docker services ──────────────────────────────────────────────────────
log "--- Starting Docker Compose services ---"
cd /opt/wabizz
docker compose up -d --build

log "--- Waiting 45s for services to initialize ---"
sleep 45

# ── Nginx configuration ────────────────────────────────────────────────────────
log "--- Configuring Nginx ---"
cat > /etc/nginx/sites-available/wabizz << 'NGINXEOF'
limit_req_zone $binary_remote_addr zone=general:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=webhook:10m rate=100r/m;

upstream bot_up     { server 127.0.0.1:4000; }
upstream dash_up    { server 127.0.0.1:3000; }

server {
    listen 80;
    server_name SUBDOMAIN_PLACEHOLDER.wabizz.lk;
    client_max_body_size 10M;

    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://dash_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    location /api/ {
        limit_req zone=general burst=30 nodelay;
        proxy_pass http://bot_up;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /socket.io/ {
        proxy_pass http://bot_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    location /webhook {
        limit_req zone=webhook burst=50 nodelay;
        proxy_pass http://bot_up;
        proxy_set_header Host $host;
    }
    location /pay/ { proxy_pass http://bot_up; proxy_set_header Host $host; }
    location /health { proxy_pass http://bot_up; proxy_set_header Host $host; }
    location /uploads/ { proxy_pass http://bot_up; proxy_set_header Host $host; }

    # Block direct Evolution API access from outside
    location /evolution/ { return 403; }
}
NGINXEOF

# Replace placeholder with actual subdomain
sed -i "s/SUBDOMAIN_PLACEHOLDER/${SUBDOMAIN}/g" /etc/nginx/sites-available/wabizz

ln -sf /etc/nginx/sites-available/wabizz /etc/nginx/sites-enabled/wabizz
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── SSL Certificate ────────────────────────────────────────────────────────────
log "--- Requesting SSL certificate ---"
certbot --nginx \
  -d ${SUBDOMAIN}.wabizz.lk \
  --non-interactive \
  --agree-tos \
  --email admin@wabizz.lk \
  --redirect

# ── Auto-renewal cron ──────────────────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

# ── Heartbeat cron (every 60 seconds) ─────────────────────────────────────────
log "--- Setting up heartbeat cron ---"
HEARTBEAT_SCRIPT="/usr/local/bin/wabizz_heartbeat.sh"
cat > $HEARTBEAT_SCRIPT << 'HBEOF'
#!/bin/bash
DISK=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
MEM=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
WA=$(curl -s http://localhost:8080/instance/connectionState/INSTANCE_PLACEHOLDER \
  -H "apikey: APIKEY_PLACEHOLDER" 2>/dev/null | grep -c '"open"' || echo "0")

curl -s -X POST FLEET_URL_PLACEHOLDER/heartbeat \
  -H "Authorization: Bearer FLEET_SECRET_PLACEHOLDER" \
  -H "Content-Type: application/json" \
  -d "{\"bizId\":\"BIZID_PLACEHOLDER\",\"status\":\"ok\",\"diskUsedPercent\":$DISK,\"memoryUsedPercent\":$MEM,\"whatsappConnected\":$([ $WA -gt 0 ] && echo true || echo false)}" \
  > /dev/null 2>&1
HBEOF

# Inject actual values
EVOLUTION_API_KEY_VAL=$(grep EVOLUTION_API_KEY /opt/wabizz/.env | cut -d= -f2)
sed -i "s/INSTANCE_PLACEHOLDER/${SUBDOMAIN}_main/g" $HEARTBEAT_SCRIPT
sed -i "s/APIKEY_PLACEHOLDER/${EVOLUTION_API_KEY_VAL}/g" $HEARTBEAT_SCRIPT
sed -i "s|FLEET_URL_PLACEHOLDER|${FLEET_MANAGER_URL}|g" $HEARTBEAT_SCRIPT
sed -i "s/FLEET_SECRET_PLACEHOLDER/${FLEET_MANAGER_SECRET}/g" $HEARTBEAT_SCRIPT
sed -i "s/BIZID_PLACEHOLDER/${BUSINESS_ID}/g" $HEARTBEAT_SCRIPT
chmod +x $HEARTBEAT_SCRIPT

(crontab -l 2>/dev/null; echo "* * * * * $HEARTBEAT_SCRIPT") | crontab -

# ── Unattended security upgrades ───────────────────────────────────────────────
dpkg-reconfigure -plow unattended-upgrades || true

log "=== Bootstrap complete for ${BUSINESS_ID} ==="
log "Dashboard: https://${SUBDOMAIN}.wabizz.lk"
log "Server IP: $(curl -s ifconfig.me)"
