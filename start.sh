#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  WC2026 Predictor — One-command startup
# ──────────────────────────────────────────────────────────────────

set -e

BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

echo ""
echo "⚽  WC2026 Predictor — Starting up..."
echo "────────────────────────────────────────"

# 1. Install backend deps if needed
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd "$BACKEND_DIR" && npm install
fi

# 2. Install frontend deps if needed
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  cd "$FRONTEND_DIR" && npm install
fi

# 3. Create .env if missing
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo "📝 Created backend/.env — add your FOOTBALL_DATA_API_KEY for live data"
fi

# 4. Seed the database (first run only)
if [ ! -f "$BACKEND_DIR/data/worldcup2026.db" ]; then
  echo "🌱 Seeding database..."
  cd "$BACKEND_DIR" && node database/seed.js
fi

echo "🚀 Starting servers..."
echo ""

# 5. Start both servers in parallel
(cd "$BACKEND_DIR" && npm start) &
BACKEND_PID=$!

(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

# Trap Ctrl+C and kill both
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

# 6. Wait for both servers to be ready before printing the URL
printf "⏳ Waiting for backend"
until curl -sf http://localhost:6173/api/teams > /dev/null 2>&1; do
  printf "."; sleep 0.5
done
echo " ✓"

printf "⏳ Waiting for frontend"
until curl -sf http://localhost:6001 > /dev/null 2>&1; do
  printf "."; sleep 0.5
done
echo " ✓"

echo ""
echo "────────────────────────────────────────"
echo "✅  Ready! Open http://localhost:6001"
echo "────────────────────────────────────────"
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait
wait $BACKEND_PID $FRONTEND_PID
