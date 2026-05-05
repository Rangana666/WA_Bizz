let stripe = null;

function getStripe() {
  if (!stripe) {
    const Stripe = require('stripe');
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function createCheckoutSession(order, subdomain) {
  const s = getStripe();

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'lkr',
          unit_amount: order.total_amount,
          product_data: {
            name: `Order ${order.order_ref}`,
            description: `Delivery to: ${order.delivery_address || 'N/A'}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      order_ref: order.order_ref,
      order_id: String(order.id),
    },
    success_url: `https://${subdomain}.wabizz.lk/pay/success?ref=${order.order_ref}`,
    cancel_url: `https://${subdomain}.wabizz.lk/pay/cancel?ref=${order.order_ref}`,
  });

  return session.url;
}

function constructEvent(rawBody, signature, webhookSecret) {
  const s = getStripe();
  return s.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = { createCheckoutSession, constructEvent };
