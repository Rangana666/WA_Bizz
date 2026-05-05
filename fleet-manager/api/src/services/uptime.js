const axios = require('axios');

const API_KEY = process.env.UPTIMEROBOT_API_KEY;
const BASE = 'https://api.uptimerobot.com/v2';

function isConfigured() {
  return !!API_KEY;
}

async function post(endpoint, data) {
  const resp = await axios.post(`${BASE}/${endpoint}`, {
    api_key: API_KEY,
    format: 'json',
    ...data,
  }, { timeout: 10000 });
  return resp.data;
}

async function createMonitor(subdomain, bizId) {
  if (!isConfigured()) {
    console.log('[UptimeRobot] Not configured — skipping monitor creation');
    return null;
  }

  const url = `https://${subdomain}.wabizz.lk/health`;

  try {
    const result = await post('newMonitor', {
      friendly_name: `WA Bizz — ${subdomain} (${bizId})`,
      url,
      type: 1,           // HTTP(S) monitor
      interval: 300,     // Check every 5 minutes
      alert_contacts: process.env.UPTIMEROBOT_ALERT_CONTACTS || '',
    });

    if (result.stat === 'ok') {
      console.log(`[UptimeRobot] Monitor created for ${subdomain}: ID ${result.monitor.id}`);
      return result.monitor.id;
    } else {
      console.warn(`[UptimeRobot] Failed to create monitor for ${subdomain}:`, result.error);
      return null;
    }
  } catch (err) {
    console.warn(`[UptimeRobot] Error creating monitor:`, err.message);
    return null;
  }
}

async function deleteMonitor(monitorId) {
  if (!isConfigured() || !monitorId) return;
  try {
    await post('deleteMonitor', { id: monitorId });
    console.log(`[UptimeRobot] Monitor ${monitorId} deleted`);
  } catch (err) {
    console.warn(`[UptimeRobot] Failed to delete monitor ${monitorId}:`, err.message);
  }
}

async function pauseMonitor(monitorId) {
  if (!isConfigured() || !monitorId) return;
  await post('editMonitor', { id: monitorId, status: 0 });
}

async function resumeMonitor(monitorId) {
  if (!isConfigured() || !monitorId) return;
  await post('editMonitor', { id: monitorId, status: 1 });
}

module.exports = { createMonitor, deleteMonitor, pauseMonitor, resumeMonitor };
