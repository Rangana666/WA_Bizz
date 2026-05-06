const db = require('./postgres');

function generateOrderRef() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `SL-${date}-${rand}`;
}

async function create(data) {
  const orderRef = generateOrderRef();
  const res = await db.query(
    `INSERT INTO orders
       (order_ref, customer_id, items, total_amount, delivery_address, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      orderRef,
      data.customerId,
      JSON.stringify(data.items),
      data.totalAmount,
      data.deliveryAddress,
      data.paymentMethod || 'cash_on_delivery',
    ]
  );
  return res.rows[0];
}

async function updateStatus(id, status) {
  const timestamps = {
    confirmed: 'confirmed_at',
    dispatched: 'dispatched_at',
    delivered: 'delivered_at',
  };
  const tsField = timestamps[status];
  const tsClause = tsField ? `, ${tsField} = NOW()` : '';

  const res = await db.query(
    `UPDATE orders SET status = $1${tsClause} WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return res.rows[0] || null;
}

async function getByCustomer(customerId, limit = 5) {
  const res = await db.query(
    `SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [customerId, limit]
  );
  return res.rows;
}

async function getAll(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.status) { conditions.push(`status = $${i++}`); values.push(filters.status); }
  if (filters.date) {
    conditions.push(`DATE(created_at) = $${i++}`);
    values.push(filters.date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT o.*, c.phone, c.name as customer_name
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT 200`,
    values
  );
  return res.rows;
}

async function getById(id) {
  const res = await db.query(
    `SELECT o.*, c.phone, c.name as customer_name
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function getTodayStats() {
  const res = await db.query(
    `SELECT
       COUNT(*) as total_orders,
       COALESCE(SUM(total_amount), 0) as total_revenue,
       COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
       COUNT(*) FILTER (WHERE status = 'new') as pending
     FROM orders
     WHERE DATE(created_at) = CURRENT_DATE`
  );
  return res.rows[0];
}

async function getByRef(orderRef) {
  const res = await db.query(
    `SELECT o.*, c.phone, c.name as customer_name
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.order_ref = $1`,
    [orderRef]
  );
  return res.rows[0] || null;
}

async function updatePaymentMethod(id, method) {
  await db.query(`UPDATE orders SET payment_method = $1 WHERE id = $2`, [method, id]);
}

async function markPaid(id, paymentRef) {
  const res = await db.query(
    `UPDATE orders SET status = 'paid', payment_ref = $1 WHERE id = $2 RETURNING *`,
    [paymentRef || null, id]
  );
  return res.rows[0] || null;
}

async function updateRider(id, riderName, riderPhone) {
  const res = await db.query(
    `UPDATE orders SET rider_name = $1, rider_phone = $2 WHERE id = $3 RETURNING *`,
    [riderName, riderPhone, id]
  );
  return res.rows[0] || null;
}

async function addTracking(id, trackingNumber, deliveryCompany) {
  const res = await db.query(
    `UPDATE orders
     SET tracking_number = $1,
         delivery_company = $2,
         status = 'dispatched',
         dispatched_at = NOW(),
         tracking_notified_at = NOW()
     WHERE id = $3 RETURNING *`,
    [trackingNumber, deliveryCompany || null, id]
  );
  return res.rows[0] || null;
}

async function getMonthlyStats(months = 6) {
  const res = await db.query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
       DATE_TRUNC('month', created_at) AS month_date,
       COUNT(*) AS total_orders,
       COALESCE(SUM(total_amount), 0) AS total_revenue,
       COUNT(*) FILTER (WHERE status = 'delivered') AS delivered
     FROM orders
     WHERE created_at >= NOW() - INTERVAL '${months} months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month_date ASC`
  );
  return res.rows;
}

module.exports = { create, updateStatus, getByCustomer, getAll, getById, getByRef, getTodayStats, updateRider, updatePaymentMethod, markPaid, addTracking, getMonthlyStats };
