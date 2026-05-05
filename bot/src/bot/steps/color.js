const { sendButtons, sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const productDb = require('../../db/products');

async function handleSelectColor(phone, messageText, session) {
  const lang = session.lang || 'en';
  const color = messageText.trim();

  const product = await productDb.getByCode(session.selectedProduct);
  if (!product) {
    await sendText(phone, t('product_not_found', lang));
    await updateSession(phone, { step: 'main_menu' });
    return;
  }

  const validColors = product.colors.map((c) => c.toLowerCase());
  if (!validColors.includes(color.toLowerCase())) {
    await sendButtons(phone, t('choose_color', lang), product.colors.slice(0, 3));
    return;
  }

  const matchedColor = product.colors.find((c) => c.toLowerCase() === color.toLowerCase());

  if (product.has_sizes) {
    await updateSession(phone, { step: 'select_size', selectedColor: matchedColor });
    await sendButtons(phone, t('choose_size', lang), product.sizes.slice(0, 3));
  } else {
    await updateSession(phone, { step: 'select_quantity', selectedColor: matchedColor });
    await sendButtons(phone, t('choose_quantity', lang), ['1', '2', '3', t('other_qty', lang)]);
  }
}

module.exports = { handleSelectColor };
