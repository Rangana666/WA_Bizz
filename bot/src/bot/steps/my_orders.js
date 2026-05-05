const { sendText } = require('../messages/send');
const { t, buildMyOrdersText } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const orderDb = require('../../db/orders');
const customerDb = require('../../db/customers');

async function handleMyOrders(phone, messageText, session) {
  const lang = session.lang || 'en';

  const customer = await customerDb.getByPhone(phone);
  let orders = [];

  if (customer) {
    orders = await orderDb.getByCustomer(customer.id, 5);
  }

  await updateSession(phone, { step: 'main_menu' });

  const text = buildMyOrdersText(orders, lang);
  await sendText(phone, text);
}

module.exports = { handleMyOrders };
