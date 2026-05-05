const businessDb = require('../db/businesses');
const updateJobDb = require('../db/updateJobs');
const sshService = require('./ssh');
const telegramService = require('./telegram');
const axios = require('axios');

let _io = null;
function setIo(io) { _io = io; }

function emit(event, data) {
  if (_io) _io.emit(event, data);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHealthy(subdomain) {
  try {
    const resp = await axios.get(`https://${subdomain}.wabizz.lk/health`, { timeout: 15000 });
    return resp.data?.status === 'ok';
  } catch {
    return false;
  }
}

// ── Main rollout entry point ─────────────────────────────────────────────────
async function startRollout(version, opts = {}) {
  const {
    batchSize = 50,
    batchDelayMs = 600000,   // 10 minutes between batches
    failureThreshold = 0.2,  // rollback batch if >20% fail
    targetBizIds = null,     // null = all live servers
  } = opts;

  const businesses = targetBizIds
    ? await Promise.all(targetBizIds.map((id) => businessDb.getById(id))).then((bs) => bs.filter(Boolean))
    : await businessDb.getAll({ status: 'live' });

  if (businesses.length === 0) throw new Error('No live servers to update');

  // Detect current version (from first server's app_version)
  const previousVersion = businesses[0]?.app_version || 'unknown';

  const jobId = await updateJobDb.createJob(version, previousVersion, businesses.length, {
    batchSize, batchDelayMs, failureThreshold,
  });

  const batches = chunkArray(businesses, batchSize);

  // Register all servers in job table
  for (let bi = 0; bi < batches.length; bi++) {
    for (const biz of batches[bi]) {
      await updateJobDb.addServerToJob(jobId, biz.biz_id, bi + 1);
    }
  }

  emit('update_job_started', { jobId, version, total: businesses.length, batches: batches.length });
  console.log(`[Updater] Job ${jobId}: updating ${businesses.length} servers to v${version} in ${batches.length} batches`);

  // Process batches asynchronously
  processBatches(jobId, batches, version, previousVersion, { batchDelayMs, failureThreshold }).catch(console.error);

  return jobId;
}

async function processBatches(jobId, batches, version, previousVersion, opts) {
  const { batchDelayMs, failureThreshold } = opts;
  let totalUpdated = 0, totalFailed = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const batchNum = bi + 1;

    const job = await updateJobDb.getJob(jobId);
    if (job?.status === 'cancelled') {
      console.log(`[Updater] Job ${jobId} cancelled — stopping`);
      return;
    }

    console.log(`[Updater] Job ${jobId}: starting batch ${batchNum}/${batches.length} (${batch.length} servers)`);
    emit('update_batch_started', { jobId, batch: batchNum, total: batches.length, servers: batch.length });

    const { updated, failed, rolledBack } = await processSingleBatch(
      jobId, batch, version, previousVersion, failureThreshold
    );

    totalUpdated += updated;
    totalFailed += failed;

    await updateJobDb.updateJobStatus(jobId, {
      updated: totalUpdated,
      failed: totalFailed,
      rolled_back: rolledBack,
    });

    emit('update_batch_done', { jobId, batch: batchNum, updated, failed, rolledBack });

    if (rolledBack > 0) {
      const msg = `Batch ${batchNum} exceeded failure threshold — rolled back. Job paused.`;
      await updateJobDb.updateJobStatus(jobId, { status: 'paused', error: msg });
      emit('update_job_paused', { jobId, reason: msg });
      await telegramService.sendAlert(`⚠️ Update Job ${jobId}\nBatch ${batchNum} failure threshold exceeded. Rolled back and paused.\nVersion: ${version}`);
      return;
    }

    // Wait between batches (except after the last one)
    if (bi < batches.length - 1) {
      console.log(`[Updater] Waiting ${batchDelayMs / 60000}m before next batch...`);
      emit('update_batch_waiting', { jobId, waitMs: batchDelayMs });
      await sleep(batchDelayMs);
    }
  }

  await updateJobDb.updateJobStatus(jobId, { status: 'completed', completed_at: new Date() });
  emit('update_job_completed', { jobId, totalUpdated, totalFailed });
  console.log(`[Updater] Job ${jobId} complete — ${totalUpdated} updated, ${totalFailed} failed`);

  await telegramService.sendAlert(
    `✅ Update complete!\nJob: ${jobId}\nVersion: ${version}\nUpdated: ${totalUpdated} servers\nFailed: ${totalFailed}`
  );
}

async function processSingleBatch(jobId, batch, version, previousVersion, failureThreshold) {
  const CONCURRENCY = 10;
  let updated = 0, failed = 0, rolledBack = 0;

  // Process in sub-chunks to limit concurrent SSH connections
  const subChunks = chunkArray(batch, CONCURRENCY);

  for (const subChunk of subChunks) {
    const results = await Promise.allSettled(
      subChunk.map(async (biz) => {
        await updateJobDb.updateServerStatus(jobId, biz.biz_id, 'updating');
        emit('update_server_started', { jobId, bizId: biz.biz_id, businessName: biz.business_name });

        await sshService.pushUpdate(biz.server_ip, version);

        // Verify health after update
        const healthy = await getHealthy(biz.subdomain);
        if (!healthy) throw new Error('Health check failed after update');

        await businessDb.update(biz.biz_id, { app_version: version });
        await updateJobDb.updateServerStatus(jobId, biz.biz_id, 'ok');
        emit('update_server_done', { jobId, bizId: biz.biz_id, status: 'ok' });
      })
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        updated++;
      } else {
        failed++;
        const biz = subChunk[i];
        const errMsg = r.reason?.message || 'Unknown error';
        await updateJobDb.updateServerStatus(jobId, biz.biz_id, 'failed', errMsg);
        emit('update_server_done', { jobId, bizId: biz.biz_id, status: 'failed', error: errMsg });
        console.error(`[Updater] ${biz.biz_id} failed: ${errMsg}`);
      }
    }
  }

  // Check failure threshold for this batch
  const failRate = batch.length > 0 ? failed / batch.length : 0;
  if (failRate > failureThreshold) {
    console.warn(`[Updater] Failure rate ${(failRate * 100).toFixed(0)}% exceeds threshold — rolling back batch`);

    const failedBizIds = batch.filter(async (biz) => {
      const servers = await updateJobDb.getJobServers(jobId);
      return servers.find((s) => s.biz_id === biz.biz_id && s.status === 'failed');
    });

    // Rollback successful servers in this batch to previous version
    await Promise.allSettled(
      batch.map(async (biz) => {
        try {
          await sshService.pushUpdate(biz.server_ip, previousVersion);
          await updateJobDb.updateServerStatus(jobId, biz.biz_id, 'rolled_back');
          rolledBack++;
        } catch {
          // Rollback failed — leave as failed
        }
      })
    );
  }

  return { updated, failed, rolledBack };
}

async function cancelJob(jobId) {
  await updateJobDb.updateJobStatus(jobId, { status: 'cancelled', completed_at: new Date() });
  emit('update_job_cancelled', { jobId });
}

module.exports = { setIo, startRollout, cancelJob };
