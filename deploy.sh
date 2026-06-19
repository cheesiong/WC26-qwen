#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  WC2026 — Deploy to Alibaba Cloud ECS via rsync + Docker Compose
#  Usage:
#    bash deploy.sh                          # deploy (HTTP only if no DOMAIN)
#    DOMAIN=example.com bash deploy.sh       # deploy with HTTPS
#
#  Required env vars (or edit defaults below):
#    ECS_IP    — ECS public IP address
#    ECS_USER  — SSH user (default: root)
#    ECS_KEY   — Path to SSH private key (default: ~/.ssh/aliyun-ecs.pem)
#
#  Optional env vars:
#    DOMAIN    — Domain name for HTTPS (e.g. wc2026.example.com)
#    CERT_EMAIL — Email for Let's Encrypt (default: admin@$DOMAIN)
# ──────────────────────────────────────────────────────────────────

set -e

ECS_IP="${ECS_IP:-your-ecs-public-ip}"
ECS_USER="${ECS_USER:-root}"
ECS_KEY="${ECS_KEY:-$HOME/.ssh/aliyun-ecs.pem}"
REMOTE_DIR="/opt/wc2026"

if [ "$ECS_IP" = "your-ecs-public-ip" ]; then
  echo "❌  Set ECS_IP before deploying:"
  echo "    ECS_IP=1.2.3.4 bash deploy.sh"
  exit 1
fi

echo ""
echo "⚽  WC2026 — Deploying to Alibaba Cloud ECS ($ECS_IP)..."
if [ -n "$DOMAIN" ]; then
  echo "🔐 HTTPS enabled for $DOMAIN"
fi
echo "────────────────────────────────────────"

SSH="ssh -i $ECS_KEY -o StrictHostKeyChecking=no $ECS_USER@$ECS_IP"

# ── 1. Sync source files ──────────────────────────────────────────
echo "📤 Syncing files..."
rsync -az --delete \
  --exclude '.DS_Store' \
  --exclude '.git/' \
  --exclude '.gstack/' \
  --exclude 'node_modules/' \
  --exclude 'frontend/dist/' \
  --exclude 'backend/data/*.db' \
  --exclude 'backend/data/*.db.bak*' \
  --exclude 'backend/data/*.db.corrupted' \
  --exclude 'backend/wc2026.db' \
  --exclude 'backend/.env' \
  -e "ssh -i $ECS_KEY -o StrictHostKeyChecking=no" \
  "$(pwd)/" "$ECS_USER@$ECS_IP:$REMOTE_DIR/"
echo "   ✓ Files synced"

# ── 2. Ensure .env exists on ECS ─────────────────────────────────
ENV_EXISTS=$($SSH "[ -f $REMOTE_DIR/backend/.env ] && echo yes || echo no")
if [ "$ENV_EXISTS" = "no" ]; then
  echo ""
  echo "⚠️  No backend/.env found on ECS."
  echo "   Copy your .env file first:"
  echo "   scp -i $ECS_KEY backend/.env $ECS_USER@$ECS_IP:$REMOTE_DIR/backend/.env"
  echo ""
  echo "   Then re-run: bash deploy.sh"
  exit 1
fi

# ── 3. Build and restart containers ──────────────────────────────
echo "🐳 Building and restarting containers..."
DOMAIN_ENV="${DOMAIN:-}"
CERT_EMAIL_ENV="${CERT_EMAIL:-}"
$SSH bash <<REMOTE
  set -e
  cd $REMOTE_DIR
  export DOMAIN="$DOMAIN_ENV"
  export CERT_EMAIL="$CERT_EMAIL_ENV"
  docker compose up -d --build
  docker image prune -f
REMOTE
echo "   ✓ Containers running"

# ── 4. Health check ───────────────────────────────────────────────
echo "🔍 Health check..."
sleep 8
if $SSH "curl -sf http://localhost:6173/api/teams > /dev/null 2>&1"; then
  echo "   ✓ Backend API responding"
else
  echo "   ⚠️  Backend not responding yet — check: ssh -i $ECS_KEY $ECS_USER@$ECS_IP 'cd $REMOTE_DIR && docker compose logs backend'"
fi

if [ -n "$DOMAIN" ]; then
  if $SSH "curl -sf -o /dev/null -w '%{http_code}' https://$DOMAIN 2>/dev/null | grep -q '200\|301'" 2>/dev/null; then
    echo "   ✓ HTTPS responding on $DOMAIN"
  else
    echo "   ⏳ HTTPS may still be provisioning — check: ssh -i $ECS_KEY $ECS_USER@$ECS_IP 'cd $REMOTE_DIR && docker compose logs frontend'"
  fi
fi

echo ""
echo "────────────────────────────────────────"
echo "✅  Deployed!"
if [ -n "$DOMAIN" ]; then
  echo "    https://$DOMAIN"
else
  echo "    http://$ECS_IP"
  echo ""
  echo "    To enable HTTPS, re-run with a domain:"
  echo "    DOMAIN=yourdomain.com ECS_IP=$ECS_IP bash deploy.sh"
fi
echo "────────────────────────────────────────"
