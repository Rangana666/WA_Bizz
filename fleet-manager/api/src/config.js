require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT) || 5000,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@wabizz.lk',
  fleetUrl: process.env.FLEET_URL || 'https://fleet.wabizz.lk',
  domain: process.env.DOMAIN || 'wabizz.lk',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'fleet',
    user: process.env.DB_USER || 'fleet',
    password: process.env.DB_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    expiresIn: '12h',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    prices: {
      starter: process.env.STRIPE_PRICE_STARTER,   // monthly price ID
      growth: process.env.STRIPE_PRICE_GROWTH,
      pro: process.env.STRIPE_PRICE_PRO,
    },
  },

  hetzner: {
    apiToken: process.env.HETZNER_API_TOKEN,
    sshKeyId: process.env.HETZNER_SSH_KEY_ID,
    location: process.env.HETZNER_LOCATION || 'hel1',
  },

  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
  },

  ssh: {
    privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH || '/root/.ssh/id_rsa',
    privateKey: process.env.SSH_PRIVATE_KEY,  // inline key (alternative to path)
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },

  bot: {
    gitRepo: process.env.BOT_GIT_REPO,   // e.g. gitea.wabizz.lk/wabizz/bot-core.git
    gitToken: process.env.BOT_GIT_TOKEN,
  },
};

module.exports = config;
