#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Ryaba Kiosk Shell"
APP_DIR="/opt/${APP_NAME}"
HELPER_SRC="${APP_DIR}/resources/helper/ryaba-kiosk-helper.py"
KIOSK_USER="ryaba-kiosk"
KIOSK_PASSWORD="123456"

SHELL_PATH="/bin/bash"

if ! id "${KIOSK_USER}" >/dev/null 2>&1; then
  useradd -m -s "${SHELL_PATH}" -c "Ryaba Kiosk" "${KIOSK_USER}" || true
else
  usermod -s "${SHELL_PATH}" -c "Ryaba Kiosk" "${KIOSK_USER}" || true
fi

echo "${KIOSK_USER}:${KIOSK_PASSWORD}" | chpasswd || true

for group_name in video audio input plugdev network netdev wheel; do
  if getent group "${group_name}" >/dev/null 2>&1; then
    usermod -aG "${group_name}" "${KIOSK_USER}" || true
  fi
done

install -d -m 0755 /etc/ryaba-kiosk
install -d -m 0777 /var/lib/ryaba-kiosk
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
set -u

export XDG_CURRENT_DESKTOP=RyabaKiosk
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
export RYABA_KIOSK_STATE_DIR=/var/lib/ryaba-kiosk

LOG_FILE="/var/log/ryaba-kiosk-session.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ryaba-kiosk-session.log"
chmod 0666 "$LOG_FILE" 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1

echo
echo "===== Ryaba Kiosk session started: $(date -Is) ====="
echo "USER=$(id)"
echo "DISPLAY=${DISPLAY:-}"
echo "XAUTHORITY=${XAUTHORITY:-}"

xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true

APP="/opt/Ryaba Kiosk Shell/ryaba-kiosk-shell"

while true; do
  if [ -x "$APP" ]; then
    if command -v dbus-run-session >/dev/null 2>&1; then
      dbus-run-session -- "$APP" --disable-gpu
    else
      "$APP" --disable-gpu
    fi
  elif command -v ryaba-kiosk-shell >/dev/null 2>&1; then
    if command -v dbus-run-session >/dev/null 2>&1; then
      dbus-run-session -- ryaba-kiosk-shell --disable-gpu
    else
      ryaba-kiosk-shell --disable-gpu
    fi
  else
    echo "ryaba-kiosk-shell not installed"
    sleep 5
  fi

  echo "Ryaba Kiosk exited with code $? at $(date -Is), restarting..."
  sleep 2
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

mkdir -p /var/lib/AccountsService/users
cat > /var/lib/AccountsService/users/${KIOSK_USER} <<ACCOUNT
[User]
Language=ru_RU.UTF-8
Session=ryaba-kiosk
XSession=ryaba-kiosk
SystemAccount=false
ACCOUNT
chmod 0644 /var/lib/AccountsService/users/${KIOSK_USER}

cat > "/home/${KIOSK_USER}/.dmrc" <<DMRC
[Desktop]
Session=ryaba-kiosk
DMRC
chown "${KIOSK_USER}:${KIOSK_USER}" "/home/${KIOSK_USER}/.dmrc" || true

mkdir -p /etc/sddm.conf.d
cat > /etc/sddm.conf.d/20-ryaba-kiosk-user.conf <<'SDDM'
[Users]
MinimumUid=500
MaximumUid=65000
HideUsers=
RememberLastUser=false
RememberLastSession=false
SDDM

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable --now NetworkManager 2>/dev/null || true
  if [ -f /opt/ryaba-kiosk/ryaba-kiosk-helper.py ]; then
    systemctl enable --now ryaba-kiosk-helper.service || true
  fi
fi

exit 0
