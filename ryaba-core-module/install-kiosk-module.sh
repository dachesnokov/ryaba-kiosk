#!/usr/bin/env bash
set -euo pipefail

cd "${1:-/opt/ryaba/src}"

if [ ! -f artisan ]; then
  echo "Не найден artisan. Передай путь к Ryaba Core: bash install-kiosk-module.sh /opt/ryaba/src"
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/opt/ryaba/backup/kiosk_module_${TS}"
mkdir -p "$BACKUP_DIR"

echo "===== BACKUP ====="
cp -a routes/api.php "$BACKUP_DIR/api.php.bak"
echo "saved: $BACKUP_DIR"

echo "===== COPY FILES ====="
cp -a "$(dirname "$0")/app/Models/Services/Kiosk" app/Models/Services/
mkdir -p app/Http/Controllers/Api/Services
cp -a "$(dirname "$0")/app/Http/Controllers/Api/Services/Kiosk" app/Http/Controllers/Api/Services/
cp -a "$(dirname "$0")/database/migrations/"*.php database/migrations/
mkdir -p resources/js/pages/services/kiosk
cp -a "$(dirname "$0")/resources/js/pages/services/kiosk/ServiceKioskPage.jsx" resources/js/pages/services/kiosk/ServiceKioskPage.jsx

echo "===== PATCH routes/api.php ====="
if ! grep -q "KioskDeviceApiController" routes/api.php; then
  cat "$(dirname "$0")/routes-kiosk-snippet.php" | sed '1{/^<?php$/d;}' >> routes/api.php
fi

echo "===== PHP LINT ====="
php -l app/Http/Controllers/Api/Services/Kiosk/KioskDeviceApiController.php
php -l app/Http/Controllers/Api/Services/Kiosk/KioskAdminController.php
php -l app/Models/Services/Kiosk/KioskDevice.php
php -l app/Models/Services/Kiosk/KioskProfile.php
php -l database/migrations/2026_04_18_000001_create_service_kiosk_tables.php

echo "===== MIGRATE ====="
php artisan migrate --force

echo "===== CLEAR ====="
php artisan optimize:clear

echo
echo "===== NEXT ====="
echo "1) Нужно подключить React-страницу ServiceKioskPage.jsx в ваш роутер/меню Сервисы."
echo "2) API уже доступны:"
echo "   POST /api/services/kiosks/enroll"
echo "   POST /api/services/kiosks/heartbeat"
echo "   GET  /api/admin/services/kiosks/devices"
echo "   POST /api/admin/services/kiosks/enrollment-tokens"
