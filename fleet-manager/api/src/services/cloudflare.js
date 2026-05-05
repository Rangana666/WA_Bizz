const axios = require('axios');
const config = require('../config');

const cf = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: {
    Authorization: `Bearer ${config.cloudflare.apiToken}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

const ZONE_ID = config.cloudflare.zoneId;

async function createDNSRecord(subdomain, ip) {
  const resp = await cf.post(`/zones/${ZONE_ID}/dns_records`, {
    type: 'A',
    name: `${subdomain}.wabizz.lk`,
    content: ip,
    ttl: 120,
    proxied: false,  // Direct IP — Cloudflare proxy not needed for SSL termination on VPS
  });

  if (!resp.data.success) {
    throw new Error(`Cloudflare DNS creation failed: ${JSON.stringify(resp.data.errors)}`);
  }

  return resp.data.result.id;
}

async function deleteDNSRecord(dnsRecordId) {
  if (!dnsRecordId) return;
  await cf.delete(`/zones/${ZONE_ID}/dns_records/${dnsRecordId}`);
}

async function updateDNSRecord(dnsRecordId, subdomain, newIp) {
  const resp = await cf.put(`/zones/${ZONE_ID}/dns_records/${dnsRecordId}`, {
    type: 'A',
    name: `${subdomain}.wabizz.lk`,
    content: newIp,
    ttl: 120,
    proxied: false,
  });

  if (!resp.data.success) {
    throw new Error(`Cloudflare DNS update failed: ${JSON.stringify(resp.data.errors)}`);
  }
}

module.exports = { createDNSRecord, deleteDNSRecord, updateDNSRecord };
