const db = require('./postgres');

async function getCategories() {
  const res = await db.query(
    `SELECT DISTINCT category FROM products
     WHERE is_active = true AND stock > 0 AND category IS NOT NULL
     ORDER BY category`
  );
  return res.rows.map((r) => r.category);
}

async function getByCategory(category) {
  const res = await db.query(
    `SELECT id, product_code, name_en, name_si, name_ta, price, stock, image_url, has_colors, has_sizes
     FROM products
     WHERE category = $1 AND is_active = true AND stock > 0
     ORDER BY name_en`,
    [category]
  );
  return res.rows;
}

async function getByCode(code) {
  const res = await db.query(
    `SELECT * FROM products WHERE product_code = $1 AND is_active = true`,
    [code.toUpperCase()]
  );
  return res.rows[0] || null;
}

async function getById(id) {
  const res = await db.query(`SELECT * FROM products WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function getAll() {
  const res = await db.query(
    `SELECT * FROM products ORDER BY category, name_en`
  );
  return res.rows;
}

async function create(data) {
  const res = await db.query(
    `INSERT INTO products
       (product_code, name_en, name_si, name_ta, description_en, description_si, description_ta,
        price, category, has_colors, colors, has_sizes, sizes, stock, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.product_code, data.name_en, data.name_si, data.name_ta,
      data.description_en, data.description_si, data.description_ta,
      data.price, data.category, data.has_colors || false,
      data.colors || [], data.has_sizes || false, data.sizes || [],
      data.stock || 0, data.image_url || null,
    ]
  );
  return res.rows[0];
}

async function update(id, data) {
  const fields = [];
  const values = [];
  let i = 1;

  const allowed = [
    'name_en', 'name_si', 'name_ta', 'description_en', 'description_si', 'description_ta',
    'price', 'category', 'has_colors', 'colors', 'has_sizes', 'sizes',
    'stock', 'image_url', 'is_active',
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${i++}`);
      values.push(data[field]);
    }
  }

  if (fields.length === 0) return null;

  values.push(id);
  const res = await db.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function remove(id) {
  await db.query(`UPDATE products SET is_active = false WHERE id = $1`, [id]);
}

async function decrementStock(productCode, qty) {
  await db.query(
    `UPDATE products SET stock = GREATEST(0, stock - $1) WHERE product_code = $2`,
    [qty, productCode]
  );
}

module.exports = { getCategories, getByCategory, getByCode, getById, getAll, create, update, remove, decrementStock };
