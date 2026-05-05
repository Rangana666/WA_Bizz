const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Silent if not configured
function isConfigured() {
  return !!(BOT_TOKEN && CHAT_ID);
}

async function sendMessage(text) {
  if (!isConfigured()) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text, parse_mode: 'HTML' },
      { timeout: 8000 }
    );
  } catch (err) {
    console.warn('[Telegram] Failed to send message:', err.message);
  }
}

async function sendAlert(message) {
  return sendMessage(`🚨 <b>WA Bizz Fleet Alert</b>\n\n${message}`);
}

async function sendServerOffline(biz) {
  const lastSeen = biz.last_heartbeat
    ? `Last seen: ${Math.floor((Date.now() - new Date(biz.last_heartbeat).getTime()) / 60000)}m ago`
    : 'Never connected';

  return sendMessage(
    `🔴 <b>Server Offline</b>\n` +
    `Business: ${biz.business_name}\n` +
    `ID: ${biz.biz_id}\n` +
    `URL: ${biz.subdomain}.wabizz.lk\n` +
    `IP: ${biz.server_ip || 'unknown'}\n` +
    `${lastSeen}`
  );
}

async function sendServerRecovered(biz) {
  return sendMessage(
    `🟢 <b>Server Recovered</b>\n` +
    `Business: ${biz.business_name} (${biz.biz_id})\n` +
    `URL: ${biz.subdomain}.wabizz.lk`
  );
}

async function sendNewBusiness(biz) {
  return sendMessage(
    `🆕 <b>New Business Signed Up</b>\n` +
    `Name: ${biz.business_name}\n` +
    `Plan: ${biz.plan}\n` +
    `Owner: ${biz.owner_name} (${biz.owner_email})\n` +
    `URL: ${biz.subdomain}.wabizz.lk\n` +
    `Provisioning started...`
  );
}

async function sendProvisionComplete(biz) {
  return sendMessage(
    `✅ <b>Server Live</b>\n` +
    `${biz.business_name} is now online\n` +
    `${biz.subdomain}.wabizz.lk`
  );
}

async function sendProvisionFailed(biz, error) {
  return sendMessage(
    `❌ <b>Provisioning Failed</b>\n` +
    `Business: ${biz.business_name} (${biz.biz_id})\n` +
    `Error: ${error}`
  );
}

module.exports = {
  sendAlert,
  sendServerOffline,
  sendServerRecovered,
  sendNewBusiness,
  sendProvisionComplete,
  sendProvisionFailed,
};
