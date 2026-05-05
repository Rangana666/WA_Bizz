const { sendList, sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const productDb = require('../../db/products');

async function handleBrowse(phone, messageText, session) {
  const lang = session.lang || 'en';
  const categories = await productDb.getCategories();

  if (categories.length === 0) {
    await sendText(phone, t('no_products', lang));
    return;
  }

  await updateSession(phone, { step: 'select_category' });

  const sections = [{
    title: t('choose_category', lang),
    rows: categories.map((cat) => ({
      rowId: cat,
      title: cat,
      description: '',
    })),
  }];

  await sendList(phone, t('choose_category', lang), '', sections);
}

async function handleSelectCategory(phone, messageText, session) {
  const lang = session.lang || 'en';
  const category = messageText.trim();

  const products = await productDb.getByCategory(category);

  if (products.length === 0) {
    await sendText(phone, t('no_products', lang));
    await updateSession(phone, { step: 'main_menu' });
    return;
  }

  await updateSession(phone, { step: 'select_product', currentCategory: category });

  const lines = products.map((p) => {
    const name = p[`name_${lang}`] || p.name_en;
    const price = `Rs ${(p.price / 100).toFixed(2)}`;
    return `*${p.product_code}* — ${name} — ${price}`;
  });

  const text =
    `${t('products_in_category', lang, { category })}\n\n` +
    lines.join('\n') +
    `\n\n${t('enter_product_code', lang)}`;

  await sendText(phone, text);
}

module.exports = { handleBrowse, handleSelectCategory };
