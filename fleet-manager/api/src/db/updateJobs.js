const db = require('./postgres');
const { v4: uuidv4 } = require('uuid');

async function createJob(version, previousVersion, totalServers, opts = {}) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO update_jobs
       (id, version, previous_version, total_servers, batch_size, batch_delay_ms, failure_threshold)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id, version, previousVersion, totalServers,
      opts.batchSize || 50,
      opts.batchDelayMs || 600000,
      opts.failureThreshold || 0.2,
    ]
  );
  return id;
}

async function getJob(jobId) {
  const res = await db.query(`SELECT * FROM update_jobs WHERE id = $1`, [jobId]);
  return res.rows[0] || null;
}

async function getJobs(limit = 20) {
  const res = await db.query(
    `SELECT * FROM update_jobs ORDER BY started_at DESC LIMIT $1`, [limit]
  );
  return res.rows;
}

async function updateJobStatus(jobId, data) {
  const allowed = ['status', 'updated', 'failed', 'rolled_back', 'skipped', 'completed_at', 'error'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(data[key]); }
  }
  if (!fields.length) return;
  values.push(jobId);
  await db.query(`UPDATE update_jobs SET ${fields.join(', ')} WHERE id = $${i}`, values);
}

async function addServerToJob(jobId, bizId, batchNumber) {
  await db.query(
    `INSERT INTO update_job_servers (job_id, biz_id, batch_number) VALUES ($1,$2,$3)`,
    [jobId, bizId, batchNumber]
  );
}

async function updateServerStatus(jobId, bizId, status, error = null) {
  await db.query(
    `UPDATE update_job_servers
     SET status = $1, error = $2,
         started_at  = CASE WHEN $1 = 'updating' THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN $1 IN ('ok','failed','rolled_back','skipped') THEN NOW() ELSE completed_at END
     WHERE job_id = $3 AND biz_id = $4`,
    [status, error, jobId, bizId]
  );
}

async function getJobServers(jobId) {
  const res = await db.query(
    `SELECT ujs.*, b.business_name, b.subdomain, b.app_version
     FROM update_job_servers ujs
     JOIN businesses b ON ujs.biz_id = b.biz_id
     WHERE ujs.job_id = $1
     ORDER BY ujs.batch_number, ujs.id`,
    [jobId]
  );
  return res.rows;
}

module.exports = { createJob, getJob, getJobs, updateJobStatus, addServerToJob, updateServerStatus, getJobServers };
