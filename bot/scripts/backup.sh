#!/bin/bash
# WA Bizz Daily Backup Script
# Runs at 02:00 via cron on each per-business VPS.
# Dumps PostgreSQL → gzip → uploads to Hetzner Object Storage.
# Keeps last 7 days. Older backups are automatically deleted.

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/wabizz_backup_${TIMESTAMP}.sql.gz"
BUSINESS_ID=$(grep BUSINESS_ID /opt/wabizz/.env | cut -d= -f2)
BUCKET="${HOS_BUCKET:-wabizz-backups}"
ENDPOINT="${HOS_ENDPOINT:-https://fsn1.your-objectstorage.com}"
ACCESS_KEY="${HOS_ACCESS_KEY}"
SECRET_KEY="${HOS_SECRET_KEY}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Backup] $*"; }

log "Starting backup for ${BUSINESS_ID}"

# Dump PostgreSQL from running container
docker exec postgres pg_dump \
  -U "$(grep DB_USER /opt/wabizz/.env | cut -d= -f2)" \
  "$(grep DB_NAME /opt/wabizz/.env | cut -d= -f2)" \
  | gzip > "${BACKUP_FILE}"

log "Dump complete: $(du -sh ${BACKUP_FILE} | cut -f1)"

# Upload to Hetzner Object Storage using aws-cli (S3-compatible)
if command -v aws &>/dev/null && [ -n "${ACCESS_KEY}" ]; then
  AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
  AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
  aws s3 cp "${BACKUP_FILE}" \
    "s3://${BUCKET}/${BUSINESS_ID}/$(basename ${BACKUP_FILE})" \
    --endpoint-url "${ENDPOINT}" \
    --no-progress

  log "Upload complete: s3://${BUCKET}/${BUSINESS_ID}/$(basename ${BACKUP_FILE})"

  # Delete backups older than 7 days from S3
  CUTOFF=$(date -d '7 days ago' +%Y%m%d)
  AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
  AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
  aws s3 ls "s3://${BUCKET}/${BUSINESS_ID}/" \
    --endpoint-url "${ENDPOINT}" \
    | awk '{print $4}' \
    | grep "wabizz_backup_" \
    | while read -r key; do
        keydate=$(echo "${key}" | grep -oP '\d{8}' | head -1)
        if [ -n "${keydate}" ] && [ "${keydate}" -lt "${CUTOFF}" ]; then
          AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
          AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
          aws s3 rm "s3://${BUCKET}/${BUSINESS_ID}/${key}" \
            --endpoint-url "${ENDPOINT}"
          log "Deleted old backup: ${key}"
        fi
      done
else
  log "WARNING: aws-cli not configured — backup saved locally only at ${BACKUP_FILE}"
fi

# Keep local backup for 2 days as fallback
find /tmp -name "wabizz_backup_*.sql.gz" -mtime +2 -delete

log "Backup complete"
