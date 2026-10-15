#!/usr/bin/env bash
# ============================================================
#  DentalFlow - one-command start for macOS / Linux (no Docker)
#  ./start.sh      First run installs everything.
# ============================================================
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org" >&2
  exit 1
fi

[ -d backend/node_modules ]  || { echo "Installing server packages..."; npm install --prefix backend; }
[ -d frontend/node_modules ] || { echo "Installing app packages...";    npm install --prefix frontend --include=dev; }

echo "Building the app..."
npm run build --prefix frontend

echo "Starting DentalFlow..."
exec npm run start:prod --prefix backend
