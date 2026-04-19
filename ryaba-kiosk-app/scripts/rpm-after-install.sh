#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/Ryaba Kiosk Shell"
HELPER_SRC="${APP_DIR}/resources/helper/ryaba-kiosk-helper.py"
KIOSK_USER="ryaba-kiosk"

SHELL_PATH="/bin/false"
[ -x /usr/sbin/nologin ] && SHELL_PATH="/usr/sbin/nologin"
[ -x /sbin/nologin ] && SHELL_PATH="/sbin/nologin"

if ! id "${KIOSK_USER}" >/dev/null 2>&1; then
  useradd -m -s "${SHELL_PATH}" "${KIOSK_USER}" || true
else
  usermod -s "${SHELL_PATH}" "${KIOSK_USER}" || true
fi

install -d -m 0755 /etc/ryaba-kiosk
install -d -o "${KIOSK_USER}" -g "${KIOSK_USER}" -m 0700 /var/lib/ryaba-kiosk
install -d -m 0755 /opt/ryaba-kiosk

if [ ! -f /etc/ryaba-kiosk/config.json ]; then
  cat > /etc/ryaba-kiosk/config.json <<'JSON'
{
  "coreUrl": "",
  "enrollmentToken": "",
  "localHomeUrl": "",
  "adminPin": "123456",
  "allowCamera": true,
  "allowMicrophone": true,
  "blockDownloads": true,
  "showAdminPanel": true,
  "allowedOrigins": [],
  "allowedPaths": ["/*"],
  "heartbeatSeconds": 30,
  "commandsSeconds": 15
}
JSON
  chmod 0644 /etc/ryaba-kiosk/config.json
fi

if [ -f "${HELPER_SRC}" ]; then
  install -m 0755 "${HELPER_SRC}" /opt/ryaba-kiosk/ryaba-kiosk-helper.py
fi

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

cat > /usr/local/bin/ryaba-kiosk-session <<'SH'
#!/usr/bin/env bash
set -euo pipefail

export XDG_CURRENT_DESKTOP=RyabaKiosk
export ELECTRON_DISABLE_SECURITY_WARNINGS=true

xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true

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

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable --now NetworkManager 2>/dev/null || true
  if [ -f /opt/ryaba-kiosk/ryaba-kiosk-helper.py ]; then
    systemctl enable --now ryaba-kiosk-helper.service || true
  fi
fi

exit 0
