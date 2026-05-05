const { sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { deleteSession } = require('../../session/redis');
const orderDb = require('../../db/orders');
const config = require('../../config');

const PAYHERE_TRIGGERS = ['online', 'pay online', 'card', 'payhere', '💳', 'online payment'];
const BANK_TRIGGERS = ['bank', 'bank transfer', 'transfer', '🏦', 'bank tr'];
const COD_TRIGGERS = ['cash', 'cod', 'cash on delivery', 'delivery', '💵'];

function matches(text, triggers) {
  const lower = text.toLowerCase();
  return triggers.some((kw) => lower.includes(kw));
}

async function handleSelectPayment(phone, messageText, session) {
  const lang = session.lang || 'en';
  const { orderId, orderRef } = session;

  if (!orderId) {
    await deleteSession(phone);
    await sendText(phone, t('welcome', lang, { businessName: config.businessName }));
    return;
  }

  if (matches(messageText, PAYHERE_TRIGGERS)) {
    await orderDb.updateStatus(orderId, 'payment_pending');
    await orderDb.updatePaymentMethod(orderId, 'payhere');
    await deleteSession(phone);

    const link = `https://${config.subdomain}.wabizz.lk/pay/${orderRef}`;
    await sendText(phone, t('payment_link_payhere', lang, { orderRef, link }));
    return;
  }

  if (matches(messageText, BANK_TRIGGERS)) {
    await orderDb.updateStatus(orderId, 'payment_pending');
    await orderDb.updatePaymentMethod(orderId, 'bank_transfer');
    await deleteSession(phone);

    await sendText(phone, t('payment_bank_details', lang, { orderRef }));
    return;
  }

  if (matches(messageText, COD_TRIGGERS)) {
    await orderDb.updateStatus(orderId, 'confirmed');
    await orderDb.updatePaymentMethod(orderId, 'cash_on_delivery');
    await deleteSession(phone);

    await sendText(phone, t('payment_cod_confirmed', lang, { orderRef }));
    return;
  }

  // Unrecognised — re-prompt
  const { sendButtons } = require('../messages/send');
  await sendButtons(phone, t('choose_payment', lang, { orderRef }), [
    t('pay_online', lang),
    t('pay_bank', lang),
    t('pay_cod', lang),
  ]);
}

module.exports = { handleSelectPayment };
