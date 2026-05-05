const { execSync } = require('child_process');
const path = require('path');
const config = require('../config');

async function triggerBackup() {
  const scriptPath = path.join(__dirname, '../../scripts/backup.sh');

  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(`bash ${scriptPath}`, {
      env: {
        ...process.env,
        HOS_BUCKET: process.env.HOS_BUCKET || 'wabizz-backups',
        HOS_ENDPOINT: process.env.HOS_ENDPOINT,
        HOS_ACCESS_KEY: process.env.HOS_ACCESS_KEY,
        HOS_SECRET_KEY: process.env.HOS_SECRET_KEY,
      },
      timeout: 5 * 60 * 1000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Backup] Failed:', stderr);
        reject(err);
      } else {
        console.log('[Backup] Complete:', stdout.trim().split('\n').pop());
        resolve(stdout);
      }
    });
  });
}

// Schedule daily backup at 02:00 if cron-like scheduling is desired in-process
function scheduleDailyBackup() {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(2, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

  const msUntilFirst = nextRun - now;

  setTimeout(() => {
    triggerBackup().catch(console.error);
    setInterval(() => triggerBackup().catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilFirst);

  console.log(`[Backup] Scheduled daily backup at 02:00 (first run in ${Math.round(msUntilFirst / 3600000)}h)`);
}

module.exports = { triggerBackup, scheduleDailyBackup };
