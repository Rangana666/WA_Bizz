const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function connect(ip, retries = 10, delayMs = 8000) {
  const ssh = new NodeSSH();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ssh.connect({
        host: ip,
        username: 'root',
        privateKey: config.ssh.privateKeyPath
          ? fs.readFileSync(config.ssh.privateKeyPath, 'utf8')
          : config.ssh.privateKey,
        readyTimeout: 20000,
      });
      console.log(`[SSH] Connected to ${ip} on attempt ${attempt}`);
      return ssh;
    } catch (err) {
      console.log(`[SSH] Attempt ${attempt}/${retries} to ${ip} failed: ${err.message}`);
      if (attempt === retries) throw new Error(`SSH connection to ${ip} failed after ${retries} attempts`);
      await sleep(delayMs);
    }
  }
}

async function runBootstrap(ip, biz) {
  const ssh = await connect(ip);
  try {
    const bootstrapScript = buildBootstrapScript(biz);
    const scriptPath = `/tmp/bootstrap_${biz.biz_id}.sh`;

    await ssh.putContent(bootstrapScript, scriptPath);

    const result = await ssh.execCommand(`chmod +x ${scriptPath} && bash ${scriptPath}`, {
      onStdout: (chunk) => process.stdout.write(`[Bootstrap ${biz.biz_id}] ${chunk}`),
      onStderr: (chunk) => process.stderr.write(`[Bootstrap ${biz.biz_id}] ${chunk}`),
    });

    if (result.code !== 0) {
      throw new Error(`Bootstrap exited with code ${result.code}: ${result.stderr}`);
    }

    return true;
  } finally {
    ssh.dispose();
  }
}

async function runCommand(ip, command) {
  const ssh = await connect(ip, 3, 3000);
  try {
    const result = await ssh.execCommand(command);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  } finally {
    ssh.dispose();
  }
}

async function pushUpdate(ip, version) {
  return runCommand(ip, `
    cd /opt/wabizz && \
    git pull origin main && \
    docker compose pull && \
    docker compose up -d --no-deps --build bot dashboard && \
    docker image prune -f
  `);
}

async function suspendBot(ip) {
  return runCommand(ip, `
    cd /opt/wabizz && \
    sed -i 's/BOT_ACTIVE=true/BOT_ACTIVE=false/' .env && \
    docker compose restart bot
  `);
}

async function restoreBot(ip) {
  return runCommand(ip, `
    cd /opt/wabizz && \
    sed -i 's/BOT_ACTIVE=false/BOT_ACTIVE=true/' .env && \
    docker compose restart bot
  `);
}

function buildBootstrapScript(biz) {
  const fleetUrl = config.fleetUrl;
  const gitRepo = config.bot.gitRepo;
  const gitToken = config.bot.gitToken;

  return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "=== WA Bizz Bootstrap: ${biz.biz_id} ==="
echo "=== Business: ${biz.business_name} ==="

# System update
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \\
  docker.io docker-compose-plugin \\
  nginx certbot python3-certbot-nginx \\
  git curl ufw fail2ban htop

# Start and enable Docker
systemctl enable docker --now

# UFW firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Fail2ban for SSH protection
systemctl enable fail2ban --now

# Clone bot repository
git clone ${gitToken ? `https://token:${gitToken}@${gitRepo}` : `https://${gitRepo}`} /opt/wabizz

# Write environment configuration
cat > /opt/wabizz/.env << 'ENVEOF'
BUSINESS_ID=${biz.biz_id}
BUSINESS_NAME=${biz.business_name}
BUSINESS_TYPE=${biz.business_type}
SUBDOMAIN=${biz.subdomain}
DB_HOST=postgres
DB_PORT=5432
DB_NAME=wabizz
DB_USER=wabizz
DB_PASSWORD=${generateRandomPassword()}
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${generateRandomPassword()}
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=${generateRandomPassword()}
EVOLUTION_INSTANCE=${biz.subdomain}_main
BOT_ACTIVE=true
SESSION_TTL_SECONDS=1800
BOT_PORT=4000
FLEET_MANAGER_URL=${fleetUrl}
FLEET_MANAGER_SECRET=${biz.fleet_secret}
JWT_SECRET=${generateRandomPassword()}
DASHBOARD_OWNER_EMAIL=${biz.owner_email}
DASHBOARD_OWNER_PASSWORD=${generateRandomPassword(16)}
PAYHERE_SANDBOX=false
ENVEOF

# Start all services
cd /opt/wabizz
docker compose up -d

echo "=== Waiting for services to start (30s) ==="
sleep 30

# Configure Nginx
cat > /etc/nginx/sites-available/wabizz << 'NGINXEOF'
upstream bot_backend { server 127.0.0.1:4000; }
upstream dashboard_backend { server 127.0.0.1:3000; }

server {
    listen 80;
    server_name ${biz.subdomain}.wabizz.lk;

    location / { proxy_pass http://dashboard_backend; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/ { proxy_pass http://bot_backend; proxy_set_header Host $host; }
    location /webhook { proxy_pass http://bot_backend; proxy_set_header Host $host; }
    location /socket.io/ {
        proxy_pass http://bot_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    location /pay/ { proxy_pass http://bot_backend; proxy_set_header Host $host; }
    location /uploads/ { proxy_pass http://bot_backend; proxy_set_header Host $host; }
    location /health { proxy_pass http://bot_backend; proxy_set_header Host $host; }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/wabizz /etc/nginx/sites-enabled/wabizz
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d ${biz.subdomain}.wabizz.lk \\
  --non-interactive --agree-tos -m admin@wabizz.lk \\
  --redirect

# Register heartbeat cron (every 60 seconds via two 30s-offset jobs)
(crontab -l 2>/dev/null; echo "* * * * * curl -s -X POST ${fleetUrl}/heartbeat -H 'Authorization: Bearer ${biz.fleet_secret}' -H 'Content-Type: application/json' -d '{\"bizId\":\"${biz.biz_id}\",\"status\":\"ok\"}' > /dev/null 2>&1") | crontab -

echo "=== Bootstrap complete for ${biz.biz_id} ==="
`;
}

function generateRandomPassword(len = 32) {
  return require('crypto').randomBytes(len).toString('hex').slice(0, len);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { runBootstrap, runCommand, pushUpdate, suspendBot, restoreBot };
