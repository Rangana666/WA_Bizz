const { sendButtons, sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const productDb = require('../../db/products');

async function handleSelectSize(phone, messageText, session) {
  const lang = session.lang || 'en';
  const size = messageText.trim().toUpperCase();

  const product = await productDb.getByCode(session.selectedProduct);
  if (!product) {
    await sendText(phone, t('product_not_found', lang));
    await updateSession(phone, { step: 'main_menu' });
    return;
  }

  const validSizes = product.sizes.map((s) => s.toUpperCase());
  if (!validSizes.includes(size)) {
    await sendButtons(phone, t('choose_size', lang), product.sizes.slice(0, 3));
    return;
  }

  const matchedSize = product.sizes.find((s) => s.toUpperCase() === size);
  await updateSession(phone, { step: 'select_quantity', selectedSize: matchedSize });

  await sendButtons(phone, t('choose_quantity', lang), ['1', '2', '3', t('other_qty', lang)]);
}

module.exports = { handleSelectSize };
