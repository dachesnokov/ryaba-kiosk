#!/usr/bin/env bash
set -euo pipefail

CORE_URL="${1:-https://ra.spo-kp.ru}"
ENROLLMENT_TOKEN="${2:-}"
HOME_URL="${3:-$CORE_URL}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запусти от root: sudo bash scripts/install-mos12.sh https://ra.spo-kp.ru TOKEN"
  exit 1
fi

echo "===== Packages ====="
if command -v dnf >/dev/null 2>&1; then
  dnf install -y NetworkManager python3 pulseaudio-utils || true
elif command -v urpmi >/dev/null 2>&1; then
  urpmi --auto NetworkManager python3 pulseaudio-utils || true
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y network-manager python3 pulseaudio-utils || true
fi

echo "===== User ====="
id ryaba-kiosk >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin ryaba-kiosk

echo "===== Directories ====="
install -d -m 0755 /etc/ryaba-kiosk
install -d -o ryaba-kiosk -g ryaba-kiosk -m 0700 /var/lib/ryaba-kiosk
install -d -m 0755 /opt/ryaba-kiosk

echo "===== Config ====="
cat > /etc/ryaba-kiosk/config.json <<JSON
{
  "coreUrl": "$CORE_URL",
  "enrollmentToken": "$ENROLLMENT_TOKEN",
  "localHomeUrl": "$HOME_URL",
  "adminPin": "123456",
  "allowCamera": true,
  "allowMicrophone": true,
  "blockDownloads": true,
  "showAdminPanel": true,
  "allowedOrigins": [
    "$CORE_URL"
  ],
  "allowedPaths": [
    "/*"
  ],
  "heartbeatSeconds": 30,
  "commandsSeconds": 15
}
JSON
chmod 0644 /etc/ryaba-kiosk/config.json

echo "===== Helper ====="
install -m 0755 "$(dirname "$0")/../helper/ryaba-kiosk-helper.py" /opt/ryaba-kiosk/ryaba-kiosk-helper.py

cat > /etc/systemd/system/ryaba-kiosk-helper.service <<'UNIT'
[Unit]
Description=Ryaba Kiosk privileged helper
After=NetworkManager.service sound.target
Wants=NetworkManager.service

[Service]
Type=simple
Environment=RYABA_KIOSK_USER=ryaba-kiosk
Environment=RYABA_KIOSK_GROUP=ryaba-kiosk
ExecStart=/usr/bin/python3 /opt/ryaba-kiosk/ryaba-kiosk-helper.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now ryaba-kiosk-helper.service

echo "===== Kiosk session ====="
cat > /usr/local/bin/ryaba-kiosk-session <<'SH'
#!/usr/bin/env bash
set -euo pipefail
export XDG_CURRENT_DESKTOP=RyabaKiosk
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
xset -dpms || true
xset s off || true
xset s noblank || true
while true; do
  if command -v ryaba-kiosk-shell >/dev/null 2>&1; then
    ryaba-kiosk-shell || true
  elif [ -x "/opt/Ryaba Kiosk Shell/ryaba-kiosk-shell" ]; then
    "/opt/Ryaba Kiosk Shell/ryaba-kiosk-shell" || true
  else
    echo "ryaba-kiosk-shell not installed"
    sleep 5
  fi
  sleep 1
done
SH
chmod 0755 /usr/local/bin/ryaba-kiosk-session

install -d -m 0755 /usr/share/xsessions
cat > /usr/share/xsessions/ryaba-kiosk.desktop <<'DESKTOP'
[Desktop Entry]
Name=Ryaba Kiosk
Comment=Ryaba managed kiosk shell
Exec=/usr/local/bin/ryaba-kiosk-session
Type=Application
DesktopNames=RyabaKiosk
DESKTOP

echo
echo "===== DONE ====="
echo "1) Установи RPM приложения: sudo rpm -Uvh dist/ryaba-kiosk-shell-*.rpm"
echo "2) Включи автологин пользователя ryaba-kiosk в display manager МОС 12."
echo "3) Для проверки без автологина: sudo -u ryaba-kiosk ryaba-kiosk-shell"
