const translations = require('../../lang/translations.json');

function t(key, lang = 'en', replacements = {}) {
  const entry = translations[key];
  if (!entry) return key;
  let text = entry[lang] || entry['en'] || key;
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
}

function formatPrice(cents) {
  return `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function productName(product, lang) {
  return product[`name_${lang}`] || product.name_en;
}

function productDescription(product, lang) {
  return product[`description_${lang}`] || product.description_en || '';
}

function buildProductListText(products, lang) {
  if (products.length === 0) return null;
  const lines = products.map(
    (p) => `*${p.product_code}* — ${productName(p, lang)} — ${formatPrice(p.price)}`
  );
  return lines.join('\n');
}

function buildProductDetailText(product, lang) {
  const name = productName(product, lang);
  const desc = productDescription(product, lang);
  const price = formatPrice(product.price);
  const stock = product.stock;

  let text = `*${name}*\n${price} · In stock: ${stock}`;
  if (desc) text += `\n\n${desc}`;
  return text;
}

function buildOrderSummaryText(session, lang) {
  const lines = session.cart.map((item) => {
    let line = `${item.name} × ${item.qty}`;
    if (item.color) line += ` (${item.color})`;
    if (item.size) line += ` [${item.size}]`;
    line += ` — ${formatPrice(item.unitPrice * item.qty)}`;
    return line;
  });

  const total = session.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  return (
    `${t('order_summary', lang)}\n\n` +
    lines.join('\n') +
    `\n\n*${t('total', lang)}:* ${formatPrice(total)}` +
    `\n*${t('deliver_to', lang)}:* ${session.address}`
  );
}

function buildMyOrdersText(orders, lang) {
  if (orders.length === 0) return t('my_orders_empty', lang);

  const lines = orders.map((o) => {
    const status = t(`status_${o.status}`, lang) || o.status;
    return `• *${o.order_ref}* — ${status}`;
  });

  return `${t('my_orders_list', lang)}\n\n${lines.join('\n')}`;
}

module.exports = {
  t,
  formatPrice,
  productName,
  buildProductListText,
  buildProductDetailText,
  buildOrderSummaryText,
  buildMyOrdersText,
};
