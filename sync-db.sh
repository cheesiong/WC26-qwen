#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  sync-db.sh — Safely push a local DB fix to production
#
#  ALWAYS backs up the production DB before overwriting.
#
#  Usage:
#    bash sync-db.sh                          # uses default local DB path
#    LOCAL_DB=backend/data/worldcup2026.db bash sync-db.sh
# ──────────────────────────────────────────────────────────────────
set -e

ECS_IP="${ECS_IP:-43.98.192.47}"
ECS_USER="${ECS_USER:-root}"
ECS_KEY="${ECS_KEY:-$HOME/.ssh/aliyun-ecs.pem}"
LOCAL_DB="${LOCAL_DB:-backend/data/worldcup2026.db}"
CONTAINER="wc2026-backend-1"
REMOTE_DB="/data/worldcup2026.db"

SSH="ssh -i $ECS_KEY -o StrictHostKeyChecking=no $ECS_USER@$ECS_IP"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REMOTE_BACKUP="/tmp/worldcup2026.db.backup-$TIMESTAMP"
LOCAL_BACKUP="backend/data/worldcup2026.db.prod-backup-$TIMESTAMP"

echo "🗄️  DB Sync — local → production"
echo "────────────────────────────────────────"

# ── 1. Backup production DB locally ──────────────────────────────
echo "📥 Pulling production DB backup → $LOCAL_BACKUP"
$SSH "docker cp $CONTAINER:$REMOTE_DB $REMOTE_BACKUP"
scp -i "$ECS_KEY" -o StrictHostKeyChecking=no \
  "$ECS_USER@$ECS_IP:$REMOTE_BACKUP" "$LOCAL_BACKUP"
echo "   ✓ Backup saved locally: $LOCAL_BACKUP"

# ── 2. Push local DB to production ───────────────────────────────
echo "📤 Pushing $LOCAL_DB → production"
scp -i "$ECS_KEY" -o StrictHostKeyChecking=no \
  "$LOCAL_DB" "$ECS_USER@$ECS_IP:/tmp/worldcup2026.db.new"
$SSH "docker cp /tmp/worldcup2026.db.new $CONTAINER:$REMOTE_DB"
echo "   ✓ DB pushed to container"

# ── 3. Restart backend ────────────────────────────────────────────
echo "🔄 Restarting backend..."
$SSH "docker compose -f /opt/wc2026/docker-compose.yml restart backend"
sleep 5

# ── 4. Verify ────────────────────────────────────────────────────
COUNT=$($SSH "curl -sf http://localhost:6173/api/matches | python3 -c \"import json,sys; d=json.load(sys.stdin); print(len([m for m in d if m.get('status')=='COMPLETED']))\" 2>/dev/null" || echo "?")
echo "   ✓ Backend up — $COUNT completed matches"

echo ""
echo "────────────────────────────────────────"
echo "✅  Done! Backup kept at: $LOCAL_BACKUP"
echo "   To restore: LOCAL_DB=$LOCAL_BACKUP bash sync-db.sh"
echo "────────────────────────────────────────"
