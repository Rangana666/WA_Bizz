const businessDb = require('../db/businesses');
const hetzner = require('./hetzner');
const cloudflare = require('./cloudflare');
const ssh = require('./ssh');
const email = require('./email');
const uptime = require('./uptime');
const telegram = require('./telegram');
const axios = require('axios');
const crypto = require('crypto');

const HEALTH_CHECK_RETRIES = 20;
const HEALTH_CHECK_DELAY_MS = 15000;

async function log(bizId, step, status, message) {
  await businessDb.logProvision(bizId, step, status, message);
  console.log(`[Provision ${bizId}] [${step}] ${status}: ${message || ''}`);
}

async function provision(bizId) {
  const biz = await businessDb.getById(bizId);
  if (!biz) throw new Error(`Business ${bizId} not found`);

  let serverId, serverIp, cfDnsId;

  try {
    // ── Step 1: Create Hetzner VPS ───────────────────────────────────────────
    await log(bizId, 'create_server', 'started');
    await businessDb.update(bizId, { status: 'provisioning' });

    const server = await hetzner.createServer(biz);
    serverId = server.id;
    await businessDb.update(bizId, { server_id: String(server.id) });
    await log(bizId, 'create_server', 'ok', `Server ID: ${server.id}`);

    // ── Step 2: Wait for VPS to be ready ─────────────────────────────────────
    await log(bizId, 'wait_ready', 'started');
    serverIp = await hetzner.waitForReady(server.id);
    await businessDb.update(bizId, { server_ip: serverIp });
    await log(bizId, 'wait_ready', 'ok', `IP: ${serverIp}`);

    // ── Step 3: Create Cloudflare DNS record ──────────────────────────────────
    await log(bizId, 'dns', 'started');
    cfDnsId = await cloudflare.createDNSRecord(biz.subdomain, serverIp);
    await businessDb.update(bizId, { cloudflare_dns_id: cfDnsId });
    await log(bizId, 'dns', 'ok', `DNS record: ${cfDnsId}`);

    // Give DNS a moment to propagate before requesting SSL cert
    await sleep(10000);

    // ── Step 4: SSH bootstrap ─────────────────────────────────────────────────
    await log(bizId, 'ssh_bootstrap', 'started');
    await businessDb.update(bizId, { status: 'bootstrapping' });
    await ssh.runBootstrap(serverIp, biz);
    await log(bizId, 'ssh_bootstrap', 'ok');

    // ── Step 5: Verify health endpoint ───────────────────────────────────────
    await log(bizId, 'verify', 'started');
    await businessDb.update(bizId, { status: 'verifying' });
    await waitForHealth(biz.subdomain);
    await log(bizId, 'verify', 'ok');

    // ── Step 6: Send onboarding email ────────────────────────────────────────
    await log(bizId, 'email', 'started');
    const ownerPassword = await extractPasswordFromEnv(serverIp);
    await email.sendOnboardingEmail({ ...biz, server_ip: serverIp }, ownerPassword);
    await log(bizId, 'email', 'ok');

    // ── Step 7: Register UptimeRobot monitor ─────────────────────────────────
    await log(bizId, 'uptime_monitor', 'started');
    const monitorId = await uptime.createMonitor(biz.subdomain, bizId);
    if (monitorId) {
      await log(bizId, 'uptime_monitor', 'ok', `Monitor ID: ${monitorId}`);
    } else {
      await log(bizId, 'uptime_monitor', 'ok', 'Skipped (not configured)');
    }

    // ── Step 8: Mark as live ──────────────────────────────────────────────────
    await businessDb.update(bizId, {
      status: 'live',
      provisioned_at: new Date(),
    });
    await log(bizId, 'done', 'ok', `${biz.subdomain}.wabizz.lk is live!`);
    await telegram.sendProvisionComplete({ ...biz, server_ip: serverIp });

  } catch (err) {
    await log(bizId, 'error', 'error', err.message);
    await businessDb.update(bizId, { status: 'failed' });
    console.error(`[Provision ${bizId}] FAILED:`, err);
    const failedBiz = await businessDb.getById(bizId);
    if (failedBiz) {
      await telegram.sendProvisionFailed(failedBiz, err.message).catch(() => {});
    }
  }
}

async function deprovision(bizId) {
  const biz = await businessDb.getById(bizId);
  if (!biz) throw new Error(`Business ${bizId} not found`);

  // Delete Cloudflare DNS record
  if (biz.cloudflare_dns_id) {
    await cloudflare.deleteDNSRecord(biz.cloudflare_dns_id).catch(console.error);
  }

  // Delete Hetzner server
  if (biz.server_id) {
    await hetzner.deleteServer(biz.server_id).catch(console.error);
  }

  await businessDb.update(bizId, {
    status: 'cancelled',
    server_ip: null,
    server_id: null,
  });

  console.log(`[Deprovision ${bizId}] Complete`);
}

async function suspend(bizId) {
  const biz = await businessDb.getById(bizId);
  if (!biz?.server_ip) return;
  await ssh.suspendBot(biz.server_ip);
  await businessDb.update(bizId, { status: 'suspended', billing_status: 'overdue' });
  await email.sendSuspensionEmail(biz);
}

async function restore(bizId) {
  const biz = await businessDb.getById(bizId);
  if (!biz?.server_ip) return;
  await ssh.restoreBot(biz.server_ip);
  await businessDb.update(bizId, { status: 'live', billing_status: 'paid' });
}

async function waitForHealth(subdomain) {
  const healthUrl = `https://${subdomain}.wabizz.lk/health`;
  for (let i = 0; i < HEALTH_CHECK_RETRIES; i++) {
    try {
      const resp = await axios.get(healthUrl, { timeout: 10000 });
      if (resp.data?.status === 'ok') return;
    } catch {
      // Not ready yet
    }
    await sleep(HEALTH_CHECK_DELAY_MS);
  }
  throw new Error(`Health check failed for ${subdomain} after ${HEALTH_CHECK_RETRIES} retries`);
}

// The bootstrap script writes the generated owner password to the .env.
// We retrieve it via SSH to include in the onboarding email.
async function extractPasswordFromEnv(serverIp) {
  try {
    const result = await ssh.runCommand(
      serverIp,
      "grep DASHBOARD_OWNER_PASSWORD /opt/wabizz/.env | cut -d= -f2"
    );
    return result.stdout.trim() || 'Check your server .env file';
  } catch {
    return 'Check your server .env file for the dashboard password';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { provision, deprovision, suspend, restore };
