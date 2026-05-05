#!/bin/bash
# WA Bizz VPS Update Script
# Runs on each per-business VPS during a rolling update pushed by Fleet Manager.
# Usage: bash update.sh [version]

set -e
VERSION=${1:-"latest"}
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Update] $*"; }

log "Starting update to version: $VERSION"
cd /opt/wabizz

# Pull latest code
log "Pulling latest code from repository..."
git fetch --all
git reset --hard origin/main

# Pull latest Docker images
log "Pulling Docker images..."
docker compose pull

# Zero-downtime restart of bot and dashboard only
# (postgres and redis are not restarted to avoid data loss)
log "Restarting bot and dashboard containers..."
docker compose up -d --no-deps --build bot dashboard

# Clean up old images to save disk space
log "Cleaning up old Docker images..."
docker image prune -f

# Health check
sleep 10
HEALTH=$(curl -s http://localhost:4000/health | grep -c '"ok"' || echo "0")
if [ "$HEALTH" -gt 0 ]; then
  log "Health check passed ✅"
  exit 0
else
  log "Health check FAILED ❌ — rolling back"
  git stash
  docker compose up -d --no-deps bot dashboard
  exit 1
fi
