const axios = require('axios');
const config = require('../config');

const hetzner = axios.create({
  baseURL: 'https://api.hetzner.cloud/v1',
  headers: { Authorization: `Bearer ${config.hetzner.apiToken}` },
  timeout: 30000,
});

const SERVER_TYPE = 'cx21';   // 2 vCPU, 4 GB RAM, ~€3.29/mo
const IMAGE = 'ubuntu-24.04';
const LOCATION = config.hetzner.location || 'hel1';

async function createServer(biz) {
  const resp = await hetzner.post('/servers', {
    name: biz.biz_id,
    server_type: SERVER_TYPE,
    image: IMAGE,
    location: LOCATION,
    ssh_keys: [config.hetzner.sshKeyId],
    labels: {
      biz_id: biz.biz_id,
      subdomain: biz.subdomain,
      managed_by: 'wabizz-fleet',
    },
    user_data: `#cloud-config\nhostname: ${biz.subdomain}\n`,
  });

  return {
    id: resp.data.server.id,
    ip: resp.data.server.public_net?.ipv4?.ip || null,
    status: resp.data.server.status,
  };
}

async function getServer(serverId) {
  const resp = await hetzner.get(`/servers/${serverId}`);
  return {
    id: resp.data.server.id,
    ip: resp.data.server.public_net?.ipv4?.ip || null,
    status: resp.data.server.status,
  };
}

async function waitForReady(serverId, maxWaitMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    await sleep(5000);
    const server = await getServer(serverId);
    if (server.status === 'running' && server.ip) {
      return server.ip;
    }
  }
  throw new Error(`Server ${serverId} did not become ready within ${maxWaitMs / 1000}s`);
}

async function deleteServer(serverId) {
  await hetzner.delete(`/servers/${serverId}`);
}

async function resizeServer(serverId, newType) {
  await hetzner.post(`/servers/${serverId}/actions/change_type`, {
    server_type: newType,
    upgrade_disk: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { createServer, getServer, waitForReady, deleteServer, resizeServer };
