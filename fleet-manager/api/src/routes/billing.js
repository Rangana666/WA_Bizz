const express = require('express');
const Stripe = require('stripe');
const config = require('../config');
const businessDb = require('../db/businesses');
const provisionService = require('../services/provision');
const emailService = require('../services/email');

const router = express.Router();
const stripe = Stripe(config.stripe.secretKey);

// POST /billing/create-checkout — called from signup page
router.post('/create-checkout', express.json(), async (req, res) => {
  const { businessName, ownerName, ownerEmail, ownerPhone, businessType, plan, subdomain } = req.body;

  if (!businessName || !ownerName || !ownerEmail || !businessType || !plan) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const priceId = config.stripe.prices[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan' });

  // Check subdomain availability
  const existing = await businessDb.getBySubdomain(subdomain);
  if (existing) return res.status(409).json({ error: 'Subdomain already taken' });

  try {
    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: ownerName,
      phone: ownerPhone,
      metadata: {
        business_name: businessName,
        business_type: businessType,
        plan,
        subdomain,
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        business_name: businessName,
        owner_name: ownerName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone || '',
        business_type: businessType,
        plan,
        subdomain,
      },
      success_url: `${config.fleetUrl}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.fleetUrl}/signup?cancelled=true`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[Billing] Checkout creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /billing/webhook — Stripe sends events here
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  res.sendStatus(200);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const meta = session.metadata;
        const biz = await businessDb.create({
          business_name: meta.business_name,
          owner_name: meta.owner_name,
          owner_email: meta.owner_email,
          owner_phone: meta.owner_phone,
          business_type: meta.business_type,
          plan: meta.plan,
          subdomain: meta.subdomain,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        });

        await businessDb.update(biz.biz_id, {
          billing_status: 'paid',
          setup_fee_paid: true,
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        await businessDb.logBillingEvent(
          biz.biz_id, 'subscription_created',
          session.amount_total, session.currency,
          event.id, { session_id: session.id }
        );

        console.log(`[Billing] New business signed up: ${biz.biz_id} (${meta.business_name})`);

        // Start provisioning asynchronously — don't await
        provisionService.provision(biz.biz_id).catch(console.error);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const biz = await businessDb.getByStripeSubscription(invoice.subscription);
        if (!biz) break;

        await businessDb.update(biz.biz_id, {
          billing_status: 'paid',
          next_billing_date: new Date(invoice.lines.data[0]?.period?.end * 1000),
        });

        await businessDb.logBillingEvent(
          biz.biz_id, 'payment_success',
          invoice.amount_paid, invoice.currency,
          event.id
        );

        // Restore bot if it was suspended for non-payment
        if (biz.status === 'suspended') {
          await provisionService.restore(biz.biz_id).catch(console.error);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const biz = await businessDb.getByStripeSubscription(invoice.subscription);
        if (!biz) break;

        await businessDb.update(biz.biz_id, { billing_status: 'overdue' });
        await businessDb.logBillingEvent(
          biz.biz_id, 'payment_failed', 0, invoice.currency, event.id
        );

        // Suspend after 3 days overdue (handled by billing checker cron)
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const biz = await businessDb.getByStripeSubscription(sub.id);
        if (!biz) break;

        await businessDb.update(biz.biz_id, { billing_status: 'cancelled' });
        await businessDb.logBillingEvent(
          biz.biz_id, 'subscription_cancelled', 0, 'usd', event.id
        );
        break;
      }
    }
  } catch (err) {
    console.error(`[Billing] Event processing error (${event.type}):`, err.message);
  }
});

// GET /billing/check-subdomain — used by signup form
router.get('/check-subdomain', async (req, res) => {
  const { subdomain } = req.query;
  if (!subdomain || !/^[a-z0-9]{3,20}$/.test(subdomain)) {
    return res.json({ available: false, reason: 'Invalid format' });
  }
  const existing = await businessDb.getBySubdomain(subdomain);
  res.json({ available: !existing });
});

module.exports = router;
