require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const config = require('./config');

const adminRoutes = require('./routes/admin');
const heartbeatRoutes = require('./routes/heartbeat');
const billingRoutes = require('./routes/billing');
const updatesRoutes = require('./routes/updates');

const businessDb = require('./db/businesses');
const emailService = require('./services/email');
const telegramService = require('./services/telegram');
const provisionService = require('./services/provision');
const updaterService = require('./services/updater');

const app = express();
const server = http.createServer(app);

// ── Socket.io (live update progress streaming) ────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

updaterService.setIo(io);

io.on('connection', (socket) => {
  console.log('[Fleet Socket.io] Client connected:', socket.id);
  socket.on('disconnect', () => console.log('[Fleet Socket.io] Client disconnected:', socket.id));
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// Raw body for Stripe webhook — must come before express.json()
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/admin', adminRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/billing', billingRoutes);
app.use('/updates', updatesRoutes);

// Notify Fleet Manager of a new image build (called by CI pipeline)
app.post('/admin/registry/notify', express.json(), (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.FLEET_MANAGER_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { version, buildRef } = req.body;
  console.log(`[Registry] New image available: v${version} (${buildRef})`);
  io.emit('new_version_available', { version, buildRef, timestamp: new Date().toISOString() });
  telegramService.sendAlert(`🏗 New build available: v${version}\nBuild ref: ${buildRef}\nReady to push to fleet.`);
  res.json({ received: true });
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Track previously alerted offline servers (avoid spam) ────────────────────
const alertedOffline = new Set();

// ── Offline server check (every 5 minutes) ───────────────────────────────────
async function offlineServerCheck() {
  try {
    const offline = await businessDb.getOfflineServers(5);
    const offlineIds = new Set(offline.map((b) => b.biz_id));

    for (const biz of offline) {
      if (!alertedOffline.has(biz.biz_id)) {
        console.warn(`[Fleet] Server offline: ${biz.biz_id} (${biz.subdomain})`);
        alertedOffline.add(biz.biz_id);
        await telegramService.sendServerOffline(biz).catch(() => {});
        await emailService.sendAlertEmail(
          biz, `Server offline — last heartbeat: ${biz.last_heartbeat || 'never'}`
        ).catch(() => {});
        io.emit('server_offline', { bizId: biz.biz_id, subdomain: biz.subdomain });
      }
    }

    // Clear from alerted set when server comes back online
    for (const bizId of alertedOffline) {
      if (!offlineIds.has(bizId)) {
        alertedOffline.delete(bizId);
        const biz = await businessDb.getById(bizId);
        if (biz) {
          await telegramService.sendServerRecovered(biz).catch(() => {});
          io.emit('server_recovered', { bizId, subdomain: biz.subdomain });
        }
      }
    }
  } catch (err) {
    console.error('[Offline Check] Error:', err.message);
  }
}

// ── Billing compliance check (every 6 hours) ─────────────────────────────────
async function billingComplianceCheck() {
  try {
    const businesses = await businessDb.getAll({ billing_status: 'overdue' });
    for (const biz of businesses) {
      if (biz.status !== 'live') continue;
      const daysSince = biz.next_billing_date
        ? (Date.now() - new Date(biz.next_billing_date).getTime()) / 86400000
        : 0;
      if (daysSince >= 3) {
        console.log(`[Billing] Suspending ${biz.biz_id} (${daysSince.toFixed(1)} days overdue)`);
        await provisionService.suspend(biz.biz_id).catch(console.error);
      }
    }
  } catch (err) {
    console.error('[Billing Check] Error:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(config.port, () => {
  console.log(`[Fleet Manager] Running on port ${config.port}`);
  console.log(`[Fleet Manager] Admin: ${config.adminEmail}`);
  console.log(`[Fleet Manager] Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured'}`);

  setInterval(offlineServerCheck, 5 * 60 * 1000);
  setInterval(billingComplianceCheck, 6 * 60 * 60 * 1000);
  setTimeout(offlineServerCheck, 30000);
});

module.exports = { app, server };
