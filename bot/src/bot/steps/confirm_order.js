const { sendText, sendButtons } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession, deleteSession } = require('../../session/redis');
const orderDb = require('../../db/orders');
const customerDb = require('../../db/customers');
const productDb = require('../../db/products');
const { notifyNewOrder } = require('../../notifications/owner');

const CONFIRM_TRIGGERS = ['confirm', 'yes', 'ok', '✅', 'තහවුරු', 'ඔව්', 'உறுதிப்படுத்து', 'ஆம்'];
const CANCEL_TRIGGERS = ['cancel', 'no', 'අවලංගු', 'ரத்து', '❌'];

function isConfirm(text) {
  const lower = text.toLowerCase();
  return CONFIRM_TRIGGERS.some((kw) => lower.includes(kw));
}

function isCancel(text) {
  const lower = text.toLowerCase();
  return CANCEL_TRIGGERS.some((kw) => lower.includes(kw));
}

async function handleConfirmOrder(phone, messageText, session) {
  const lang = session.lang || 'en';

  if (isCancel(messageText)) {
    await deleteSession(phone);
    await sendText(phone, t('order_cancelled', lang));
    return;
  }

  if (!isConfirm(messageText)) {
    return;
  }

  const customer = await customerDb.findOrCreate(phone);
  await customerDb.update(phone, { name: session.name });

  const totalAmount = session.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  const order = await orderDb.create({
    customerId: customer.id,
    items: session.cart,
    totalAmount,
    deliveryAddress: session.address,
    paymentMethod: 'cash_on_delivery', // default — overridden in select_payment step
  });

  await customerDb.incrementOrderCount(phone);
  for (const item of session.cart) {
    await productDb.decrementStock(item.productCode, item.qty);
  }

  notifyNewOrder(order, { phone, name: session.name });

  // Keep session alive for payment selection
  await updateSession(phone, {
    step: 'select_payment',
    orderId: order.id,
    orderRef: order.order_ref,
    orderAmount: totalAmount,
    cart: [],
  });

  await sendButtons(phone, t('choose_payment', lang, { orderRef: order.order_ref }), [
    t('pay_online', lang),
    t('pay_bank', lang),
    t('pay_cod', lang),
  ]);
}

module.exports = { handleConfirmOrder };
