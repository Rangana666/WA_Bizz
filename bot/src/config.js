require('dotenv').config();

const config = {
  businessId: process.env.BUSINESS_ID || 'biz_0001',
  businessName: process.env.BUSINESS_NAME || 'My Business',
  businessType: process.env.BUSINESS_TYPE || 'clothing',
  subdomain: process.env.SUBDOMAIN || 'demo',

  evolution: {
    url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE || 'main',
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'wabizz',
    user: process.env.DB_USER || 'wabizz',
    password: process.env.DB_PASSWORD,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
  },

  bot: {
    active: process.env.BOT_ACTIVE !== 'false',
    port: parseInt(process.env.BOT_PORT) || 4000,
    sessionTtl: parseInt(process.env.SESSION_TTL_SECONDS) || 1800,
  },

  fleet: {
    managerUrl: process.env.FLEET_MANAGER_URL,
    secret: process.env.FLEET_MANAGER_SECRET,
  },

  payhere: {
    merchantId: process.env.PAYHERE_MERCHANT_ID,
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET,
    sandbox: process.env.PAYHERE_SANDBOX === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
  },

  dashboard: {
    ownerEmail: process.env.DASHBOARD_OWNER_EMAIL,
    ownerPassword: process.env.DASHBOARD_OWNER_PASSWORD,
  },
};

module.exports = config;
