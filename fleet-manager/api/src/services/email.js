const axios = require('axios');
const config = require('../config');

const resend = axios.create({
  baseURL: 'https://api.resend.com',
  headers: {
    Authorization: `Bearer ${config.resend.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

async function sendOnboardingEmail(biz, ownerPassword) {
  const dashboardUrl = `https://${biz.subdomain}.wabizz.lk`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; color: #1f2937; }
  .header { background: #16a34a; color: white; padding: 2rem; border-radius: 12px; text-align: center; margin-bottom: 2rem; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
  .btn { display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
  .code { background: #1f2937; color: #22c55e; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  h2 { color: #16a34a; }
</style></head>
<body>
  <div class="header">
    <h1 style="margin:0">🎉 Your WhatsApp Bot is Live!</h1>
    <p style="margin:0.5rem 0 0">Welcome to WA Bizz, ${biz.owner_name}!</p>
  </div>

  <p>Your <strong>${biz.business_name}</strong> WhatsApp bot is ready. Here's everything you need to get started:</p>

  <div class="card">
    <h2>📊 Your Dashboard</h2>
    <p><a href="${dashboardUrl}" class="btn">Open Dashboard</a></p>
    <p style="margin-top:1rem">
      <strong>URL:</strong> <a href="${dashboardUrl}">${dashboardUrl}</a><br>
      <strong>Email:</strong> ${biz.owner_email}<br>
      <strong>Password:</strong> <span class="code">${ownerPassword}</span>
    </p>
    <p style="color:#6b7280;font-size:0.85rem">Please change your password after first login.</p>
  </div>

  <div class="card">
    <h2>📱 Connect Your WhatsApp</h2>
    <ol>
      <li>Open your Dashboard → Settings</li>
      <li>Click <strong>Get QR Code</strong></li>
      <li>Open WhatsApp on your phone</li>
      <li>Go to <strong>Linked Devices → Link a Device</strong></li>
      <li>Scan the QR code</li>
    </ol>
    <p>Your bot is live within seconds of scanning!</p>
  </div>

  <div class="card">
    <h2>🛍 Add Your Products</h2>
    <p>Go to Dashboard → <strong>Catalog</strong> to add your products with photos, prices, sizes and colours.</p>
  </div>

  <div class="card">
    <h2>📞 Need Help?</h2>
    <p>WhatsApp us directly: <strong>+94 77 XXX XXXX</strong> or email <a href="mailto:support@wabizz.lk">support@wabizz.lk</a></p>
  </div>

  <p style="color:#6b7280;font-size:0.8rem;margin-top:2rem">
    WA Bizz · Your server: ${biz.server_ip} · Business ID: ${biz.biz_id}
  </p>
</body>
</html>`;

  await resend.post('/emails', {
    from: 'WA Bizz <onboarding@wabizz.lk>',
    to: [biz.owner_email],
    subject: `🎉 Your WhatsApp bot for ${biz.business_name} is live!`,
    html,
  });
}

async function sendSuspensionEmail(biz) {
  await resend.post('/emails', {
    from: 'WA Bizz <billing@wabizz.lk>',
    to: [biz.owner_email],
    subject: `⚠️ Action required: Renew your WA Bizz subscription`,
    html: `<p>Hi ${biz.owner_name},</p>
    <p>Your WA Bizz subscription for <strong>${biz.business_name}</strong> has expired.
    Your bot has been temporarily paused.</p>
    <p><a href="https://wabizz.lk/renew?biz=${biz.biz_id}" style="background:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">Renew Now</a></p>
    <p>Your bot will be back online within 2 minutes of payment.</p>`,
  });
}

async function sendAlertEmail(biz, message) {
  await resend.post('/emails', {
    from: 'WA Bizz Fleet <alerts@wabizz.lk>',
    to: [config.adminEmail],
    subject: `🚨 Fleet Alert: ${biz.biz_id} — ${message}`,
    html: `<p>Business: ${biz.business_name} (${biz.biz_id})</p>
    <p>Subdomain: ${biz.subdomain}.wabizz.lk</p>
    <p>Server IP: ${biz.server_ip}</p>
    <p>Alert: ${message}</p>
    <p>Last heartbeat: ${biz.last_heartbeat || 'never'}</p>`,
  });
}

module.exports = { sendOnboardingEmail, sendSuspensionEmail, sendAlertEmail };
