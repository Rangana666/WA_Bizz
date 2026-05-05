const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const updaterService = require('../services/updater');
const updateJobDb = require('../db/updateJobs');
const businessDb = require('../db/businesses');
const sshService = require('../services/ssh');

const router = express.Router();

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(auth);

// ── List all update jobs ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const jobs = await updateJobDb.getJobs(50);
  res.json(jobs);
});

// ── Get single job + server list ─────────────────────────────────────────────
router.get('/:jobId', async (req, res) => {
  const [job, servers] = await Promise.all([
    updateJobDb.getJob(req.params.jobId),
    updateJobDb.getJobServers(req.params.jobId),
  ]);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ ...job, servers });
});

// ── Start new rolling update ──────────────────────────────────────────────────
router.post('/start', express.json(), async (req, res) => {
  const { version, batchSize, batchDelayMinutes, failureThreshold, targetBizIds } = req.body;

  if (!version) return res.status(400).json({ error: 'version is required' });

  try {
    const jobId = await updaterService.startRollout(version, {
      batchSize: batchSize || 50,
      batchDelayMs: (batchDelayMinutes || 10) * 60 * 1000,
      failureThreshold: failureThreshold || 0.2,
      targetBizIds: targetBizIds || null,
    });

    res.status(202).json({ jobId, message: 'Rollout started' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Cancel a running job ──────────────────────────────────────────────────────
router.post('/:jobId/cancel', async (req, res) => {
  const job = await updateJobDb.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['running', 'paused'].includes(job.status)) {
    return res.status(400).json({ error: `Cannot cancel job in status: ${job.status}` });
  }
  await updaterService.cancelJob(req.params.jobId);
  res.json({ message: 'Job cancelled' });
});

// ── Retry single failed server in a job ───────────────────────────────────────
router.post('/:jobId/retry/:bizId', async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz?.server_ip) return res.status(404).json({ error: 'Business/server not found' });

  const job = await updateJobDb.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({ message: 'Retry started' });

  try {
    await updateJobDb.updateServerStatus(job.id, biz.biz_id, 'updating');
    await sshService.pushUpdate(biz.server_ip, job.version);
    await businessDb.update(biz.biz_id, { app_version: job.version });
    await updateJobDb.updateServerStatus(job.id, biz.biz_id, 'ok');
  } catch (err) {
    await updateJobDb.updateServerStatus(job.id, biz.biz_id, 'failed', err.message);
  }
});

// ── Resize a single server ────────────────────────────────────────────────────
router.post('/resize/:bizId', express.json(), async (req, res) => {
  const { serverType } = req.body;
  const validTypes = ['cx21', 'cx31', 'cx41', 'cx51'];
  if (!validTypes.includes(serverType)) {
    return res.status(400).json({ error: `Invalid server type. Choose: ${validTypes.join(', ')}` });
  }

  const biz = await businessDb.getById(req.params.bizId);
  if (!biz?.server_id) return res.status(404).json({ error: 'Business or server not found' });

  res.json({ message: `Resize to ${serverType} started` });

  const hetzner = require('../services/hetzner');
  hetzner.resizeServer(biz.server_id, serverType)
    .then(() => console.log(`[Resize] ${biz.biz_id} → ${serverType} done`))
    .catch((err) => console.error(`[Resize] ${biz.biz_id} failed:`, err.message));
});

// ── Aggregate metrics snapshot (all servers) ──────────────────────────────────
router.get('/metrics/snapshot', async (req, res) => {
  const businesses = await businessDb.getAll();
  const now = Date.now();

  const metrics = businesses.map((b) => {
    const minsOffline = b.last_heartbeat
      ? Math.floor((now - new Date(b.last_heartbeat).getTime()) / 60000)
      : null;

    return {
      bizId: b.biz_id,
      businessName: b.business_name,
      subdomain: b.subdomain,
      status: b.status,
      plan: b.plan,
      billingStatus: b.billing_status,
      serverIp: b.server_ip,
      appVersion: b.app_version,
      whatsappConnected: b.whatsapp_connected,
      diskUsedPercent: b.disk_used_percent,
      memoryUsedPercent: b.memory_used_percent,
      messageCountToday: b.message_count_today,
      orderCountToday: b.order_count_today,
      lastHeartbeat: b.last_heartbeat,
      minsOffline,
      isOnline: minsOffline !== null && minsOffline < 3,
    };
  });

  res.json({
    total: metrics.length,
    online: metrics.filter((m) => m.isOnline).length,
    offline: metrics.filter((m) => !m.isOnline && m.status === 'live').length,
    waConnected: metrics.filter((m) => m.whatsappConnected).length,
    servers: metrics,
  });
});

module.exports = router;
