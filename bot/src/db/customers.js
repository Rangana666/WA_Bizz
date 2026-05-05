const db = require('./postgres');

async function findOrCreate(phone) {
  const res = await db.query(
    `INSERT INTO customers (phone)
     VALUES ($1)
     ON CONFLICT (phone) DO UPDATE
       SET last_seen = NOW()
     RETURNING *`,
    [phone]
  );
  return res.rows[0];
}

async function update(phone, data) {
  const fields = [];
  const values = [];
  let i = 1;

  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.address !== undefined) { fields.push(`address = $${i++}`); values.push(data.address); }
  if (data.lang !== undefined) { fields.push(`lang = $${i++}`); values.push(data.lang); }

  if (fields.length === 0) return null;

  values.push(phone);
  const res = await db.query(
    `UPDATE customers SET ${fields.join(', ')}, last_seen = NOW() WHERE phone = $${i} RETURNING *`,
    values
  );
  return res.rows[0];
}

async function incrementOrderCount(phone) {
  await db.query(
    `UPDATE customers SET total_orders = total_orders + 1 WHERE phone = $1`,
    [phone]
  );
}

async function getAll() {
  const res = await db.query(
    `SELECT * FROM customers ORDER BY last_seen DESC`
  );
  return res.rows;
}

async function getByPhone(phone) {
  const res = await db.query(`SELECT * FROM customers WHERE phone = $1`, [phone]);
  return res.rows[0] || null;
}

async function logMessage(customerId, direction, messageType, content) {
  await db.query(
    `INSERT INTO conversation_logs (customer_id, direction, message_type, content)
     VALUES ($1, $2, $3, $4)`,
    [customerId, direction, messageType, content]
  );
}

module.exports = { findOrCreate, update, incrementOrderCount, getAll, getByPhone, logMessage };
