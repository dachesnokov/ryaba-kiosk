#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "===== Ryaba Kiosk: install npm deps ====="
npm install

echo
echo "===== Ryaba Kiosk: build RPM ====="
npm run build:rpm

echo
echo "===== RESULT ====="
ls -lah dist/*.rpm || true
