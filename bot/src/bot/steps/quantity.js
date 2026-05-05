const { sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');

const OTHER_QTY_TRIGGERS = ['other', 'other amount', 'වෙනත්', 'வேறு'];

async function handleSelectQuantity(phone, messageText, session) {
  const lang = session.lang || 'en';
  const text = messageText.trim().toLowerCase();

  if (OTHER_QTY_TRIGGERS.some((kw) => text.includes(kw))) {
    await updateSession(phone, { step: 'enter_quantity' });
    await sendText(phone, t('enter_quantity', lang));
    return;
  }

  const qty = parseInt(messageText.trim());
  if (isNaN(qty) || qty < 1 || qty > 99) {
    await sendText(phone, t('invalid_quantity', lang));
    return;
  }

  await _addToCartAndNext(phone, session, qty, lang);
}

async function handleEnterQuantity(phone, messageText, session) {
  const lang = session.lang || 'en';
  const qty = parseInt(messageText.trim());

  if (isNaN(qty) || qty < 1 || qty > 99) {
    await sendText(phone, t('invalid_quantity', lang));
    return;
  }

  await _addToCartAndNext(phone, session, qty, lang);
}

async function _addToCartAndNext(phone, session, qty, lang) {
  const cartItem = {
    productCode: session.selectedProduct,
    name: session.selectedProductName,
    color: session.selectedColor || null,
    size: session.selectedSize || null,
    qty,
    unitPrice: session.selectedProductPrice,
  };

  const cart = [...(session.cart || []), cartItem];
  await updateSession(phone, { step: 'collect_name', cart });

  await sendText(phone, t('enter_name', lang));
}

module.exports = { handleSelectQuantity, handleEnterQuantity };
