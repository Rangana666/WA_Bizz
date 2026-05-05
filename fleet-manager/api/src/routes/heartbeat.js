const express = require('express');
const businessDb = require('../db/businesses');

const router = express.Router();

// POST /heartbeat — called by each per-business VPS every 60 seconds
router.post('/', async (req, res) => {
  res.sendStatus(200);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);
    const { bizId, status, appVersion, diskUsedPercent, memoryUsedPercent,
            messageCount, orderCount, whatsappConnected } = req.body;

    if (!bizId) return;

    const biz = await businessDb.getById(bizId);
    if (!biz || biz.fleet_secret !== token) {
      console.warn(`[Heartbeat] Invalid token for ${bizId}`);
      return;
    }

    await businessDb.recordHeartbeat(bizId, {
      status: status || 'ok',
      app_version: appVersion,
      disk_used_percent: diskUsedPercent ? parseInt(diskUsedPercent) : null,
      memory_used_percent: memoryUsedPercent ? parseInt(memoryUsedPercent) : null,
      message_count: messageCount ? parseInt(messageCount) : 0,
      order_count: orderCount ? parseInt(orderCount) : 0,
      whatsapp_connected: !!whatsappConnected,
    });
  } catch (err) {
    console.error('[Heartbeat] Error:', err.message);
  }
});

module.exports = router;
