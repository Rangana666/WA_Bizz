const crypto = require('crypto');
const config = require('../config');

const CHECKOUT_URL = config.payhere.sandbox
  ? 'https://sandbox.payhere.lk/pay/checkout'
  : 'https://www.payhere.lk/pay/checkout';

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

function generateHash(merchantId, orderId, amount, currency, merchantSecret) {
  const secretHash = md5(merchantSecret);
  return md5(`${merchantId}${orderId}${amount}${currency}${secretHash}`);
}

function verifyWebhookHash(params, merchantSecret) {
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } = params;
  const secretHash = md5(merchantSecret);
  const expected = md5(
    `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`
  );
  return expected === md5sig;
}

function getCheckoutFormData(order, subdomain) {
  const merchantId = config.payhere.merchantId;
  const merchantSecret = config.payhere.merchantSecret;
  const orderId = order.order_ref;
  const amount = (order.total_amount / 100).toFixed(2);
  const currency = 'LKR';

  const hash = generateHash(merchantId, orderId, amount, currency, merchantSecret);

  return {
    merchant_id: merchantId,
    return_url: `https://${subdomain}.wabizz.lk/pay/success`,
    cancel_url: `https://${subdomain}.wabizz.lk/pay/cancel`,
    notify_url: `https://${subdomain}.wabizz.lk/api/webhooks/payhere`,
    order_id: orderId,
    items: `Order ${orderId}`,
    currency,
    amount,
    first_name: (order.customer_name || 'Customer').split(' ')[0],
    last_name: (order.customer_name || '').split(' ').slice(1).join(' ') || 'N/A',
    email: 'customer@wabizz.lk',
    phone: order.phone || '',
    address: order.delivery_address || '',
    city: 'Colombo',
    country: 'Sri Lanka',
    hash,
    checkout_url: CHECKOUT_URL,
  };
}

function getPaymentLink(orderRef, subdomain) {
  return `https://${subdomain}.wabizz.lk/pay/${orderRef}`;
}

// PayHere status codes
const STATUS = {
  SUCCESS: 2,
  PENDING: 0,
  FAILED: '-1',
  CANCELLED: '-2',
  CHARGEDBACK: '-3',
};

module.exports = { getCheckoutFormData, verifyWebhookHash, getPaymentLink, STATUS };
