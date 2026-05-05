const db = require('./postgres');
const crypto = require('crypto');

function generateBizId() {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `biz_${num}`;
}

function generateFleetSecret() {
  return crypto.randomBytes(32).toString('hex');
}

async function create(data) {
  const bizId = generateBizId();
  const fleetSecret = generateFleetSecret();
  const subdomain = data.subdomain || data.business_name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  const res = await db.query(
    `INSERT INTO businesses
       (biz_id, business_name, owner_name, owner_email, owner_phone,
        business_type, subdomain, plan, fleet_secret,
        stripe_customer_id, stripe_subscription_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      bizId, data.business_name, data.owner_name, data.owner_email,
      data.owner_phone || null, data.business_type, subdomain,
      data.plan || 'starter', fleetSecret,
      data.stripe_customer_id || null, data.stripe_subscription_id || null,
    ]
  );
  return res.rows[0];
}

async function getById(bizId) {
  const res = await db.query(`SELECT * FROM businesses WHERE biz_id = $1`, [bizId]);
  return res.rows[0] || null;
}

async function getBySubdomain(subdomain) {
  const res = await db.query(`SELECT * FROM businesses WHERE subdomain = $1`, [subdomain]);
  return res.rows[0] || null;
}

async function getByStripeSubscription(subscriptionId) {
  const res = await db.query(
    `SELECT * FROM businesses WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
  return res.rows[0] || null;
}

async function getAll(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.status) { conditions.push(`status = $${i++}`); values.push(filters.status); }
  if (filters.billing_status) { conditions.push(`billing_status = $${i++}`); values.push(filters.billing_status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT * FROM businesses ${where} ORDER BY created_at DESC`,
    values
  );
  return res.rows;
}

async function update(bizId, data) {
  const allowed = [
    'status', 'server_id', 'server_ip', 'cloudflare_dns_id', 'app_version',
    'billing_status', 'next_billing_date', 'setup_fee_paid',
    'stripe_customer_id', 'stripe_subscription_id',
    'whatsapp_connected', 'disk_used_percent', 'memory_used_percent',
    'message_count_today', 'order_count_today', 'last_heartbeat',
    'provisioned_at', 'fleet_secret',
  ];

  const fields = [];
  const values = [];
  let i = 1;

  for (const field of allowed) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${i++}`);
      values.push(data[field]);
    }
  }

  if (fields.length === 0) return null;

  values.push(bizId);
  const res = await db.query(
    `UPDATE businesses SET ${fields.join(', ')} WHERE biz_id = $${i} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function logProvision(bizId, step, status, message = null) {
  await db.query(
    `INSERT INTO provision_logs (biz_id, step, status, message) VALUES ($1,$2,$3,$4)`,
    [bizId, step, status, message]
  );
}

async function logBillingEvent(bizId, eventType, amount, currency, stripeEventId, metadata = {}) {
  await db.query(
    `INSERT INTO billing_events (biz_id, event_type, amount, currency, stripe_event_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [bizId, eventType, amount, currency, stripeEventId, JSON.stringify(metadata)]
  );
}

async function recordHeartbeat(bizId, data) {
  await db.query(
    `INSERT INTO heartbeats
       (biz_id, status, app_version, disk_used_percent, memory_used_percent,
        message_count, order_count, whatsapp_connected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      bizId, data.status, data.app_version,
      data.disk_used_percent, data.memory_used_percent,
      data.message_count, data.order_count, data.whatsapp_connected,
    ]
  );

  await update(bizId, {
    last_heartbeat: new Date(),
    app_version: data.app_version,
    disk_used_percent: data.disk_used_percent,
    memory_used_percent: data.memory_used_percent,
    message_count_today: data.message_count,
    order_count_today: data.order_count,
    whatsapp_connected: data.whatsapp_connected,
    status: 'live',
  });
}

async function getStats() {
  const res = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'live') AS live,
      COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
      COUNT(*) FILTER (WHERE status = 'provisioning' OR status = 'bootstrapping') AS provisioning,
      COUNT(*) FILTER (WHERE billing_status = 'paid') AS paid,
      COUNT(*) FILTER (WHERE billing_status = 'overdue') AS overdue,
      COALESCE(SUM(
        CASE plan
          WHEN 'starter' THEN 350000
          WHEN 'growth'  THEN 550000
          WHEN 'pro'     THEN 900000
          ELSE 0
        END
      ) FILTER (WHERE billing_status = 'paid'), 0) AS mrr_cents
    FROM businesses
    WHERE status != 'cancelled'
  `);
  return res.rows[0];
}

async function getOfflineServers(thresholdMinutes = 5) {
  const res = await db.query(
    `SELECT * FROM businesses
     WHERE status = 'live'
       AND (last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '${thresholdMinutes} minutes')`,
  );
  return res.rows;
}

module.exports = {
  create, getById, getBySubdomain, getByStripeSubscription, getAll,
  update, logProvision, logBillingEvent, recordHeartbeat, getStats, getOfflineServers,
};
