const Redis = require('ioredis');
const config = require('../config');

const client = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: false,
});

client.on('error', (err) => console.error('[Redis] Error:', err.message));
client.on('connect', () => console.log('[Redis] Connected'));

const SESSION_PREFIX = 'session:';

function key(phone) {
  return `${SESSION_PREFIX}${phone}`;
}

async function getSession(phone) {
  const raw = await client.get(key(phone));
  return raw ? JSON.parse(raw) : null;
}

async function setSession(phone, data, ttlSeconds = config.bot.sessionTtl) {
  await client.setex(key(phone), ttlSeconds, JSON.stringify(data));
}

async function updateSession(phone, updates) {
  const existing = await getSession(phone);
  const merged = { ...(existing || {}), ...updates };
  await setSession(phone, merged);
  return merged;
}

async function deleteSession(phone) {
  await client.del(key(phone));
}

async function touchSession(phone) {
  await client.expire(key(phone), config.bot.sessionTtl);
}

module.exports = { getSession, setSession, updateSession, deleteSession, touchSession, client };
