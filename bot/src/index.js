require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { routeMessage } = require('./bot/router');
const { init: initNotifications } = require('./notifications/owner');
const orderDb = require('./db/orders');
const productDb = require('./db/products');
const customerDb = require('./db/customers');
const { client: redis } = require('./session/redis');
const payhere = require('./payments/payhere');
const stripePayments = require('./payments/stripe');
const backupService = require('./services/backup');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

initNotifications(io);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Multer for image uploads ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── JWT Auth middleware ──────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwt.secret);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Webhook from Evolution API ───────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  console.log('[Webhook] POST received — body:', JSON.stringify(req.body || {}).slice(0, 120));

  try {
    const body = req.body || {};
    const rawEvent = body.event || body.type || '';

    // Log every webhook event so we can see what's coming in
    console.log(`[Webhook] Event: "${rawEvent}" instance: "${body.instance || ''}"`);

    // Handle both formats: messages.upsert and MESSAGES_UPSERT
    const event = rawEvent.toLowerCase().replace(/[._]/g, '_');
    if (event !== 'messages_upsert') return;

    const msg = body.data;
    if (!msg || msg.key?.fromMe) return;

    // Extract phone from any JID format: @s.whatsapp.net, @lid, @g.us
    const rawJid = msg.key?.remoteJid || '';
    if (rawJid.includes('@g.us') || rawJid.includes('@broadcast')) return;
    const phone = rawJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@.*$/, '');
    if (!phone || !/^\d+$/.test(phone)) return;

    let messageText = '';
    if (msg.message?.conversation) {
      messageText = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      messageText = msg.message.extendedTextMessage.text;
    } else if (msg.message?.buttonsResponseMessage?.selectedDisplayText) {
      messageText = msg.message.buttonsResponseMessage.selectedDisplayText;
    } else if (msg.message?.listResponseMessage?.title) {
      messageText = msg.message.listResponseMessage.title;
    } else {
      return;
    }

    messageText = messageText.trim();
    if (!messageText) return;

    // Log inbound message for stats
    const customer = await customerDb.findOrCreate(phone);
    await customerDb.logMessage(customer.id, 'inbound', 'text', messageText).catch(() => {});

    await routeMessage(phone, messageText);
  } catch (err) {
    console.error('[Webhook] Error:', err.message, err.stack?.split('\n')[1]);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  res.json({
    status: 'ok',
    botActive: config.bot.active,
    businessId: config.businessId,
    redis: redisOk,
    timestamp: new Date().toISOString(),
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  if (email !== config.dashboard.ownerEmail) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, await bcrypt.hash(config.dashboard.ownerPassword, 10))
    .catch(() => false);

  // Simple direct comparison for owner credentials (single-user dashboard)
  if (password !== config.dashboard.ownerPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ email, role: 'owner' }, config.jwt.secret, { expiresIn: '7d' });
  res.json({ token, email });
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  const [stats, msgResult] = await Promise.all([
    orderDb.getTodayStats(),
    require('./db/postgres').query(
      `SELECT COUNT(*) AS count FROM conversation_logs
       WHERE direction = 'inbound' AND DATE(created_at) = CURRENT_DATE`
    ),
  ]);
  res.json({
    totalOrders: parseInt(stats.total_orders),
    totalRevenue: parseInt(stats.total_revenue),
    delivered: parseInt(stats.delivered),
    pending: parseInt(stats.pending),
    messagesToday: parseInt(msgResult.rows[0]?.count || 0),
  });
});

// ─── Orders ───────────────────────────────────────────────────────────────────
app.get('/api/orders', authMiddleware, async (req, res) => {
  const { status, date } = req.query;
  const orders = await orderDb.getAll({ status, date });
  res.json(orders);
});

app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  const order = await orderDb.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

app.patch('/api/orders/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const allowed = ['confirmed', 'payment_pending', 'paid', 'dispatched', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = await orderDb.updateStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const { notifyOrderUpdated } = require('./notifications/owner');
  notifyOrderUpdated(order);

  res.json(order);
});

app.patch('/api/orders/:id/rider', authMiddleware, async (req, res) => {
  const { riderName, riderPhone } = req.body;
  const order = await orderDb.updateRider(req.params.id, riderName, riderPhone);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

app.post('/api/orders/:id/mark-paid', authMiddleware, async (req, res) => {
  const { paymentRef } = req.body;
  const order = await orderDb.markPaid(req.params.id, paymentRef);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const { notifyOrderUpdated } = require('./notifications/owner');
  notifyOrderUpdated(order);
  res.json(order);
});

// ─── Hosted PayHere checkout page ─────────────────────────────────────────────
app.get('/pay/:orderRef', async (req, res) => {
  const order = await orderDb.getByRef(req.params.orderRef);
  if (!order) return res.status(404).send('<h2>Order not found</h2>');

  const formData = payhere.getCheckoutFormData(order, config.subdomain);
  const { checkout_url, ...fields } = formData;

  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`)
    .join('\n    ');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure Payment — ${order.order_ref}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f1f5f9;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .card { background: #1e293b; border-radius: 1rem; padding: 2rem; max-width: 380px; width: 100%; text-align: center; }
    .logo { font-size: 1.5rem; font-weight: 700; color: #22c55e; margin-bottom: 0.5rem; }
    .amount { font-size: 2rem; font-weight: 800; margin: 1rem 0; }
    .ref { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid #334155; border-top-color: #22c55e;
               border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #94a3b8; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">WA Bizz</div>
    <div class="amount">Rs ${(order.total_amount / 100).toFixed(2)}</div>
    <div class="ref">Order ${order.order_ref}</div>
    <div class="spinner"></div>
    <p>Redirecting to PayHere secure checkout...</p>
    <form id="ph" method="POST" action="${checkout_url}">
      ${inputs}
    </form>
  </div>
  <script>
    setTimeout(() => document.getElementById('ph').submit(), 1500);
  </script>
</body>
</html>`);
});

app.get('/pay/success', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment successful</title>
    <style>body{font-family:system-ui;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;
    justify-content:center;min-height:100vh;text-align:center;}</style></head>
    <body><div><div style="font-size:3rem">✅</div><h2 style="color:#22c55e;margin:1rem 0">Payment Successful!</h2>
    <p style="color:#94a3b8">Your order has been paid. You will receive a WhatsApp confirmation shortly.</p>
    <p style="color:#64748b;font-size:.8rem;margin-top:2rem">You may close this window.</p></div></body></html>`);
});

app.get('/pay/cancel', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment cancelled</title>
    <style>body{font-family:system-ui;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;
    justify-content:center;min-height:100vh;text-align:center;}</style></head>
    <body><div><div style="font-size:3rem">❌</div><h2 style="color:#ef4444;margin:1rem 0">Payment Cancelled</h2>
    <p style="color:#94a3b8">Your order is still saved. Contact us on WhatsApp to complete payment.</p>
    <p style="color:#64748b;font-size:.8rem;margin-top:2rem">You may close this window.</p></div></body></html>`);
});

// ─── PayHere webhook ──────────────────────────────────────────────────────────
app.post('/api/webhooks/payhere', express.urlencoded({ extended: true }), async (req, res) => {
  res.sendStatus(200);
  try {
    const valid = payhere.verifyWebhookHash(req.body, config.payhere.merchantSecret);
    if (!valid) { console.warn('[PayHere] Invalid webhook hash'); return; }

    const { order_id, status_code, md5sig, payhere_amount, payhere_currency } = req.body;
    const statusCode = parseInt(status_code);

    const order = await orderDb.getByRef(order_id);
    if (!order) return;

    if (statusCode === payhere.STATUS.SUCCESS) {
      const updated = await orderDb.markPaid(order.id, md5sig);
      const { notifyOrderUpdated } = require('./notifications/owner');
      notifyOrderUpdated(updated);

      const { sendText } = require('./bot/messages/send');
      const { t } = require('./bot/messages/templates');
      if (order.phone) {
        await sendText(order.phone, t('payment_confirmed', 'en', { orderRef: order_id }));
      }
    } else if (statusCode === payhere.STATUS.PENDING) {
      await orderDb.updateStatus(order.id, 'payment_pending');
    }
  } catch (err) {
    console.error('[PayHere] Webhook error:', err.message);
  }
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripePayments.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    res.sendStatus(200);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderRef = session.metadata?.order_ref;
      if (!orderRef) return;

      const order = await orderDb.getByRef(orderRef);
      if (!order) return;

      const updated = await orderDb.markPaid(order.id, session.payment_intent);
      const { notifyOrderUpdated } = require('./notifications/owner');
      notifyOrderUpdated(updated);

      const { sendText } = require('./bot/messages/send');
      const { t } = require('./bot/messages/templates');
      if (order.phone) {
        await sendText(order.phone, t('payment_confirmed', 'en', { orderRef }));
      }
    }
  }
);

// ─── Stripe create session (for dashboard manual payment link) ─────────────────
app.post('/api/orders/:id/stripe-link', authMiddleware, async (req, res) => {
  const order = await orderDb.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  try {
    const url = await stripePayments.createCheckoutSession(order, config.subdomain);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────
app.get('/api/products', authMiddleware, async (req, res) => {
  const products = await productDb.getAll();
  res.json(products);
});

app.post('/api/products', authMiddleware, async (req, res) => {
  const product = await productDb.create(req.body);
  res.status(201).json(product);
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  const product = await productDb.update(req.params.id, req.body);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  await productDb.remove(req.params.id);
  res.json({ success: true });
});

app.post('/api/products/upload-image', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// ─── Customers ────────────────────────────────────────────────────────────────
app.get('/api/customers', authMiddleware, async (req, res) => {
  const customers = await customerDb.getAll();
  res.json(customers);
});

// ─── CSV Product Import (Phase 6) ─────────────────────────────────────────────
app.post('/api/products/import-csv', authMiddleware, upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

  try {
    const content = require('fs').readFileSync(req.file.path, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

    let imported = 0, errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 3) continue;

      const row = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

      try {
        await productDb.create({
          product_code: row.product_code || `AUTO-${Date.now()}-${i}`,
          name_en: row.name_en || row.name || '',
          name_si: row.name_si || null,
          name_ta: row.name_ta || null,
          description_en: row.description_en || row.description || null,
          price: Math.round(parseFloat(row.price || 0) * 100),
          category: row.category || null,
          has_colors: row.has_colors === 'true',
          colors: row.colors ? row.colors.split('|').map((c) => c.trim()) : [],
          has_sizes: row.has_sizes === 'true',
          sizes: row.sizes ? row.sizes.split('|').map((s) => s.trim()) : [],
          stock: parseInt(row.stock) || 0,
          image_url: row.image_url || null,
        });
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    require('fs').unlinkSync(req.file.path);
    res.json({ imported, errors: errors.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; continue; }
    if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += line[i];
  }
  result.push(current);
  return result;
}

// ─── Business type template ────────────────────────────────────────────────────
app.get('/api/templates/:type', authMiddleware, (req, res) => {
  try {
    const tmpl = require(`./templates/${req.params.type}.json`);
    res.json(tmpl);
  } catch {
    res.status(404).json({ error: 'Template not found' });
  }
});

// ─── Analytics CSV Export (Phase 6) ───────────────────────────────────────────
app.get('/api/analytics/export', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await require('./db/postgres').query(
    `SELECT o.order_ref, c.name as customer_name, c.phone,
            o.status, o.total_amount, o.payment_method, o.payment_ref,
            o.delivery_address, o.items, o.created_at, o.delivered_at
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE ($1::date IS NULL OR DATE(o.created_at) >= $1::date)
       AND ($2::date IS NULL OR DATE(o.created_at) <= $2::date)
     ORDER BY o.created_at DESC`,
    [from || null, to || null]
  );

  const csvHeaders = 'order_ref,customer_name,phone,status,total_lkr,payment_method,delivery_address,created_at,delivered_at\n';
  const csvRows = rows.map((r) => [
    r.order_ref,
    `"${(r.customer_name || '').replace(/"/g, '""')}"`,
    r.phone,
    r.status,
    (r.total_amount / 100).toFixed(2),
    r.payment_method || '',
    `"${(r.delivery_address || '').replace(/"/g, '""')}"`,
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 19) : '',
    r.delivered_at ? new Date(r.delivered_at).toISOString().slice(0, 19) : '',
  ].join(','));

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
  res.send(csvHeaders + csvRows.join('\n'));
});

// ─── Riders (Phase 6) ─────────────────────────────────────────────────────────
app.get('/api/riders', authMiddleware, async (req, res) => {
  const { rows } = await require('./db/postgres').query(
    `SELECT * FROM riders ORDER BY name`
  );
  res.json(rows);
});

app.post('/api/riders', authMiddleware, async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
  const { rows } = await require('./db/postgres').query(
    `INSERT INTO riders (name, phone) VALUES ($1, $2) RETURNING *`, [name, phone]
  );
  res.status(201).json(rows[0]);
});

app.put('/api/riders/:id', authMiddleware, async (req, res) => {
  const { name, phone, is_active } = req.body;
  const { rows } = await require('./db/postgres').query(
    `UPDATE riders SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       is_active = COALESCE($3, is_active)
     WHERE id = $4 RETURNING *`,
    [name || null, phone || null, is_active ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.delete('/api/riders/:id', authMiddleware, async (req, res) => {
  await require('./db/postgres').query(
    `UPDATE riders SET is_active = false WHERE id = $1`, [req.params.id]
  );
  res.json({ success: true });
});

app.patch('/api/orders/:id/assign-rider', authMiddleware, async (req, res) => {
  const { riderId } = req.body;
  const db = require('./db/postgres');
  const { sendText } = require('./bot/messages/send');
  const { t } = require('./bot/messages/templates');

  const [orderRes, riderRes] = await Promise.all([
    orderDb.getById(req.params.id),
    db.query(`SELECT * FROM riders WHERE id = $1`, [riderId]),
  ]);

  const order = orderRes;
  const rider = riderRes.rows[0];
  if (!order || !rider) return res.status(404).json({ error: 'Order or rider not found' });

  await db.query(
    `UPDATE orders SET rider_id = $1, status = 'dispatched', dispatched_at = NOW() WHERE id = $2`,
    [riderId, req.params.id]
  );

  await db.query(
    `UPDATE riders SET total_deliveries = total_deliveries + 1 WHERE id = $1`, [riderId]
  );

  const { notifyOrderUpdated } = require('./notifications/owner');
  notifyOrderUpdated({ ...order, status: 'dispatched' });

  // Notify customer
  if (order.phone) {
    const lang = 'en';
    await sendText(order.phone, t('rider_assigned', lang, {
      orderRef: order.order_ref,
      riderName: rider.name,
      riderPhone: rider.phone,
    })).catch(() => {});
  }

  // Notify rider
  await sendText(rider.phone, t('rider_notification', 'en', {
    riderName: rider.name,
    orderRef: order.order_ref,
    customerName: order.customer_name || 'Customer',
    address: order.delivery_address || '',
    amount: ((order.total_amount || 0) / 100).toFixed(2),
  })).catch(() => {});

  res.json({ success: true, riderId, orderRef: order.order_ref });
});

// ─── Broadcast (Phase 6) ──────────────────────────────────────────────────────
app.get('/api/broadcasts', authMiddleware, async (req, res) => {
  const { rows } = await require('./db/postgres').query(
    `SELECT * FROM broadcast_logs ORDER BY created_at DESC LIMIT 50`
  );
  res.json(rows);
});

app.post('/api/broadcasts', authMiddleware, async (req, res) => {
  const { message_en, message_si, message_ta } = req.body;
  if (!message_en) return res.status(400).json({ error: 'message_en is required' });

  const db = require('./db/postgres');
  const { rows: [broadcast] } = await db.query(
    `INSERT INTO broadcast_logs (message_en, message_si, message_ta, status)
     VALUES ($1,$2,$3,'pending') RETURNING *`,
    [message_en, message_si || null, message_ta || null]
  );

  res.status(202).json(broadcast);

  // Send async — don't block response
  sendBroadcast(broadcast).catch(console.error);
});

async function sendBroadcast(broadcast) {
  const db = require('./db/postgres');
  const { sendText } = require('./bot/messages/send');
  const { t } = require('./bot/messages/templates');

  await db.query(`UPDATE broadcast_logs SET status = 'sending' WHERE id = $1`, [broadcast.id]);

  const { rows: customers } = await db.query(
    `SELECT id, phone, lang FROM customers WHERE total_orders > 0`
  );

  let sent = 0;
  for (const customer of customers) {
    try {
      const lang = customer.lang || 'en';
      const message = (broadcast[`message_${lang}`] || broadcast.message_en) +
        t('broadcast_message_footer', lang);

      await sendText(customer.phone, message);

      await db.query(
        `INSERT INTO broadcast_recipients (broadcast_id, customer_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [broadcast.id, customer.id]
      );

      sent++;
      // Rate limit: 1 message per 1.5 seconds to avoid WA blocking
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      // Continue even if one customer fails
    }
  }

  await db.query(
    `UPDATE broadcast_logs SET status = 'done', sent_to = $1, completed_at = NOW() WHERE id = $2`,
    [sent, broadcast.id]
  );
}

// ─── Tracking number (third-party delivery) ───────────────────────────────────
app.patch('/api/orders/:id/tracking', authMiddleware, async (req, res) => {
  const { trackingNumber, deliveryCompany } = req.body;
  if (!trackingNumber) return res.status(400).json({ error: 'Tracking number required' });

  const order = await orderDb.addTracking(req.params.id, trackingNumber, deliveryCompany);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { notifyOrderUpdated } = require('./notifications/owner');
  notifyOrderUpdated(order);

  // Notify customer via WhatsApp
  if (order.phone) {
    const { sendText } = require('./bot/messages/send');
    const { t } = require('./bot/messages/templates');
    const customerRes = await require('./db/postgres').query(
      `SELECT lang FROM customers WHERE id = $1`, [order.customer_id]
    );
    const lang = customerRes.rows[0]?.lang || 'en';
    await sendText(order.phone, t('tracking_notification', lang, {
      orderRef: order.order_ref,
      deliveryCompany: deliveryCompany || 'Delivery Partner',
      trackingNumber,
    })).catch(() => {});
  }

  res.json(order);
});

// ─── Monthly stats ────────────────────────────────────────────────────────────
app.get('/api/analytics/monthly', authMiddleware, async (req, res) => {
  const { months } = req.query;
  const data = await orderDb.getMonthlyStats(parseInt(months) || 6);
  res.json(data);
});

// ─── Backup (Phase 6) ─────────────────────────────────────────────────────────
app.post('/api/backup/trigger', authMiddleware, async (req, res) => {
  res.json({ message: 'Backup started' });
  backupService.triggerBackup().catch(console.error);
});

// ─── WhatsApp status (proxies to Evolution API) ────────────────────────────────
app.get('/api/whatsapp/status', authMiddleware, async (req, res) => {
  try {
    const axios = require('axios');
    const resp = await axios.get(
      `${config.evolution.url}/instance/connectionState/${config.evolution.instance}`,
      { headers: { apikey: config.evolution.apiKey }, timeout: 5000 }
    );
    res.json(resp.data);
  } catch {
    res.json({ instance: { state: 'close' }, state: 'close' });
  }
});

app.get('/api/whatsapp/qr', authMiddleware, async (req, res) => {
  const axios = require('axios');
  const headers = { apikey: config.evolution.apiKey, 'Content-Type': 'application/json' };
  const baseUrl = config.evolution.url;
  const instance = config.evolution.instance;

  function extractBase64(data) {
    return data?.base64 || data?.qrcode?.base64 || null;
  }

  try {
    // Try connect up to 6 times with 3-second gaps (v2.x generates QR asynchronously)
    for (let attempt = 0; attempt < 6; attempt++) {
      const connectResp = await axios.get(
        `${baseUrl}/instance/connect/${instance}`,
        { headers, timeout: 15000 }
      ).catch(() => null);

      const data = connectResp?.data;
      const base64 = extractBase64(data);
      if (base64) return res.json({ base64 });

      if (attempt < 5) await new Promise((r) => setTimeout(r, 3000));
    }

    // All retries exhausted — delete (v2.x path) and recreate
    await axios.delete(`${baseUrl}/instance/${instance}`, { headers, timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    const createResp = await axios.post(
      `${baseUrl}/instance/create`,
      { instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' },
      { headers, timeout: 15000 }
    ).catch(() => null);

    const base64FromCreate = extractBase64(createResp?.data);
    if (base64FromCreate) return res.json({ base64: base64FromCreate });

    // Wait 15 seconds after create then try connect once more
    await new Promise((r) => setTimeout(r, 15000));
    const finalResp = await axios.get(
      `${baseUrl}/instance/connect/${instance}`,
      { headers, timeout: 15000 }
    ).catch(() => null);

    const finalBase64 = extractBase64(finalResp?.data);
    if (finalBase64) return res.json({ base64: finalBase64 });

    res.status(503).json({ error: 'QR code not ready yet — try again in 5 seconds' });
  } catch (err) {
    console.error('[WhatsApp QR]', err.message);
    res.status(500).json({ error: 'Failed to get QR code — check if Evolution API is running' });
  }
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Socket.io] Dashboard connected:', socket.id);
  socket.on('disconnect', () => console.log('[Socket.io] Dashboard disconnected:', socket.id));
});

// ─── Fleet Manager heartbeat ──────────────────────────────────────────────────
if (config.fleet.managerUrl && config.fleet.secret) {
  const axios = require('axios');
  setInterval(async () => {
    try {
      await axios.post(
        `${config.fleet.managerUrl}/heartbeat`,
        { bizId: config.businessId, status: 'ok' },
        { headers: { Authorization: `Bearer ${config.fleet.secret}` }, timeout: 5000 }
      );
    } catch { /* Fleet manager ping failure is non-critical */ }
  }, 60000);
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(config.bot.port, () => {
  console.log(`[WA Bizz Bot] Running on port ${config.bot.port}`);
  console.log(`[WA Bizz Bot] Business: ${config.businessName} (${config.businessId})`);
  console.log(`[WA Bizz Bot] Bot active: ${config.bot.active}`);

  // Schedule daily automated backup at 02:00
  if (process.env.HOS_ACCESS_KEY) {
    backupService.scheduleDailyBackup();
  }

  // Auto-setup Evolution API instance after 30 seconds (v2.x needs DB migration time)
  setTimeout(async () => {
    const axios = require('axios');
    const evoHeaders = { apikey: config.evolution.apiKey, 'Content-Type': 'application/json' };

    try {
      // Check if instance exists
      await axios.get(
        `${config.evolution.url}/instance/connectionState/${config.evolution.instance}`,
        { headers: evoHeaders, timeout: 5000 }
      );
      console.log(`[Evolution] Instance "${config.evolution.instance}" exists`);
    } catch {
      // Instance doesn't exist — create it
      try {
        await axios.post(
          `${config.evolution.url}/instance/create`,
          { instanceName: config.evolution.instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' },
          { headers: evoHeaders, timeout: 10000 }
        );
        console.log(`[Evolution] Instance "${config.evolution.instance}" created`);
      } catch (err) {
        console.warn(`[Evolution] Could not create instance: ${err.message}`);
      }
    }

    // Set per-instance webhook (v2.x path: PUT /webhook/set/{instance})
    const evoBaseUrl = config.evolution.url;
    const inst = config.evolution.instance;
    const webhookBody = {
      url: 'http://bot:4000/webhook',
      webhook_by_events: false,
      enabled: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    };
    try {
      await axios.put(
        `${evoBaseUrl}/webhook/set/${inst}`,
        webhookBody,
        { headers: evoHeaders, timeout: 5000 }
      );
      console.log('[Evolution] Webhook configured via API');
    } catch {
      console.log('[Evolution] Per-instance webhook not set — global webhook active via env var');
    }
  }, 10000);
});

// ─── Message polling via findMessages (works with @lid multi-device) ──────────
// Polls /chat/findMessages every 3 s, only processing messages newer than boot
let _lastPollTs = Math.floor(Date.now() / 1000); // Unix timestamp, seconds
const _seenMsgIds = new Set();                    // de-dupe within this process run

async function pollMessages() {
  try {
    const axios = require('axios');
    // Evolution API v1.8.x stores and exposes messages via this endpoint
    // Filter: inbound only (fromMe=false), newer than our last poll window
    // v2.x uses /message/findMessages, v1.x used /chat/findMessages — try both
    const resp = await axios.get(
      `${config.evolution.url}/message/findMessages/${config.evolution.instance}`,
      {
        headers: { apikey: config.evolution.apiKey },
        params: {
          'where[key.fromMe]': false,
          limit: 30,
        },
        timeout: 8000,
      }
    );

    const msgs = Array.isArray(resp.data)
      ? resp.data
      : Array.isArray(resp.data?.messages)
        ? resp.data.messages
        : [];

    for (const msg of msgs) {
      const ts = msg.messageTimestamp || msg.t || 0;
      if (ts <= _lastPollTs) continue; // older than our startup timestamp

      const msgId = msg.key?.id || `${ts}`;
      if (_seenMsgIds.has(msgId)) continue;
      _seenMsgIds.add(msgId);
      if (_seenMsgIds.size > 1000) {
        // Prune to avoid unbounded growth
        const iter = _seenMsgIds.values();
        for (let i = 0; i < 200; i++) _seenMsgIds.delete(iter.next().value);
      }

      // Skip group/broadcast
      const rawJid = msg.key?.remoteJid || '';
      if (rawJid.includes('@g.us') || rawJid.includes('@broadcast')) continue;

      // Extract numeric phone from any JID format (@s.whatsapp.net or @lid)
      const phone = rawJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@.*$/, '');
      if (!phone || !/^\d+$/.test(phone)) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedDisplayText ||
        msg.message?.listResponseMessage?.title ||
        msg.body || '';

      if (!text.trim()) continue;

      console.log(`[Msg Poll] New msg ts=${ts} from ${phone}: "${text.trim().slice(0, 60)}"`);
      await routeMessage(phone, text.trim()).catch(console.error);
    }

    // Advance the watermark to avoid reprocessing on next poll
    if (msgs.length > 0) {
      const maxTs = Math.max(...msgs.map((m) => m.messageTimestamp || m.t || 0));
      if (maxTs > _lastPollTs) _lastPollTs = maxTs;
    }
  } catch (err) {
    // Silently ignore — endpoint may not be available depending on EVO version/state
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Msg Poll] Error:', err.message);
    }
  }
}

// Start polling 30 seconds after boot (let Evolution API fully connect first)
setTimeout(() => {
  console.log('[Msg Poll] Starting message polling every 3 s (fallback for @lid)...');
  setInterval(pollMessages, 3000);
}, 30000);

module.exports = { app, server };
