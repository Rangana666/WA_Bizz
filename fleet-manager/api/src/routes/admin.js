const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const businessDb = require('../db/businesses');
const provisionService = require('../services/provision');
const sshService = require('../services/ssh');

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
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

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', express.json(), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  if (email !== config.adminEmail) return res.status(401).json({ error: 'Invalid credentials' });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ email, role: 'admin' }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  res.json({ token });
});

// ── All routes below require auth ─────────────────────────────────────────────
router.use(auth);

// ── Businesses ───────────────────────────────────────────────────────────────
router.get('/businesses', async (req, res) => {
  const { status, billing_status } = req.query;
  const businesses = await businessDb.getAll({ status, billing_status });
  res.json(businesses);
});

router.get('/businesses/:bizId', async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz) return res.status(404).json({ error: 'Not found' });
  res.json(biz);
});

// ── Stats / Revenue ───────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const stats = await businessDb.getStats();
  res.json({
    total: parseInt(stats.total),
    live: parseInt(stats.live),
    suspended: parseInt(stats.suspended),
    provisioning: parseInt(stats.provisioning),
    paid: parseInt(stats.paid),
    overdue: parseInt(stats.overdue),
    mrrCents: parseInt(stats.mrr_cents),
    mrrLkr: parseInt(stats.mrr_cents),
  });
});

// ── Provisioning ─────────────────────────────────────────────────────────────
router.post('/provision', express.json(), async (req, res) => {
  const { bizId } = req.body;
  if (!bizId) return res.status(400).json({ error: 'bizId required' });

  const biz = await businessDb.getById(bizId);
  if (!biz) return res.status(404).json({ error: 'Business not found' });

  res.json({ message: 'Provisioning started', bizId });
  provisionService.provision(bizId).catch(console.error);
});

router.delete('/deprovision/:bizId', async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz) return res.status(404).json({ error: 'Not found' });

  res.json({ message: 'Deprovisioning started' });
  provisionService.deprovision(req.params.bizId).catch(console.error);
});

// ── Suspend / Restore ─────────────────────────────────────────────────────────
router.post('/suspend/:bizId', async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz) return res.status(404).json({ error: 'Not found' });
  await provisionService.suspend(req.params.bizId);
  res.json({ message: 'Suspended' });
});

router.post('/restore/:bizId', async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz) return res.status(404).json({ error: 'Not found' });
  await provisionService.restore(req.params.bizId);
  res.json({ message: 'Restored' });
});

// ── Remote update ─────────────────────────────────────────────────────────────
router.post('/update/:bizId', express.json(), async (req, res) => {
  const biz = await businessDb.getById(req.params.bizId);
  if (!biz?.server_ip) return res.status(404).json({ error: 'No server found' });

  res.json({ message: 'Update started' });

  sshService.pushUpdate(biz.server_ip, req.body.version)
    .then(async () => {
      await businessDb.update(biz.biz_id, { app_version: req.body.version });
    })
    .catch((err) => console.error(`[Update ${biz.biz_id}] Failed:`, err.message));
});

// ── Offline server detection ───────────────────────────────────────────────────
router.get('/offline', async (req, res) => {
  const offline = await businessDb.getOfflineServers(5);
  res.json(offline);
});

// ── Provision logs ─────────────────────────────────────────────────────────────
router.get('/businesses/:bizId/logs', async (req, res) => {
  const { rows } = await require('../db/postgres').query(
    `SELECT * FROM provision_logs WHERE biz_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.bizId]
  );
  res.json(rows);
});

// ── Billing events ─────────────────────────────────────────────────────────────
router.get('/businesses/:bizId/billing', async (req, res) => {
  const { rows } = await require('../db/postgres').query(
    `SELECT * FROM billing_events WHERE biz_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.params.bizId]
  );
  res.json(rows);
});

module.exports = router;
