#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Ryaba Kiosk Shell"
APP_DIR="/opt/$APP_NAME"
HELPER_SRC="$APP_DIR/resources/helper/ryaba-kiosk-helper.py"
KIOSK_USER="ryaba-kiosk"
KIOSK_PASSWORD="123456"

if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -c "Ryaba Kiosk" "$KIOSK_USER" || true
else
  usermod -s /bin/bash -c "Ryaba Kiosk" "$KIOSK_USER" || true
fi

echo "$KIOSK_USER:$KIOSK_PASSWORD" | chpasswd || true

for group_name in video audio input plugdev network netdev wheel; do
  if getent group "$group_name" >/dev/null 2>&1; then
    usermod -aG "$group_name" "$KIOSK_USER" || true
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

if [ -f "$HELPER_SRC" ]; then
  install -m 0755 "$HELPER_SRC" /opt/ryaba-kiosk/ryaba-kiosk-helper.py
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

cat > /usr/local/bin/ryaba-kiosk-autostart <<'SH'
#!/usr/bin/env bash

if [ "$(id -un)" != "ryaba-kiosk" ]; then
  exit 0
fi

mkdir -p /var/lib/ryaba-kiosk
chmod 0777 /var/lib/ryaba-kiosk 2>/dev/null || true

LOG_FILE="/var/lib/ryaba-kiosk/shell.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ryaba-kiosk-shell.log"
chmod 0666 "$LOG_FILE" 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1

echo
echo "===== Ryaba Kiosk autostart: $(date -Is) ====="
id
env | sort

export RYABA_KIOSK_STATE_DIR=/var/lib/ryaba-kiosk
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_ENABLE_STACK_DUMPING=1

if [ -z "${DISPLAY:-}" ]; then
  if [ -e /tmp/.X11-unix/X1 ]; then
    export DISPLAY=:1
  elif [ -e /tmp/.X11-unix/X0 ]; then
    export DISPLAY=:0
  fi
fi

APP="/opt/Ryaba Kiosk Shell/ryaba-kiosk-shell"

sleep 5

echo "DISPLAY=${DISPLAY:-}"
echo "WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}"
echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"
echo "Starting: $APP"

if [ ! -x "$APP" ]; then
  echo "ERROR: app not found: $APP"
  exit 1
fi

exec "$APP" --disable-gpu --no-sandbox --ozone-platform=x11
SH

chmod 0755 /usr/local/bin/ryaba-kiosk-autostart

install -d -m 0755 /home/$KIOSK_USER/.config/autostart

cat > /home/$KIOSK_USER/.config/autostart/ryaba-kiosk-shell.desktop <<AUTOSTART
[Desktop Entry]
Type=Application
Name=Ryaba Kiosk Shell
Comment=Start Ryaba Kiosk Shell after Plasma login
Exec=/usr/local/bin/ryaba-kiosk-autostart
Terminal=false
X-KDE-autostart-after=panel
X-KDE-StartupNotify=false
AUTOSTART

chown -R "$KIOSK_USER:$KIOSK_USER" /home/$KIOSK_USER/.config || true

mkdir -p /etc/xdg/autostart

cat > /etc/xdg/autostart/ryaba-kiosk-shell.desktop <<AUTOSTART
[Desktop Entry]
Type=Application
Name=Ryaba Kiosk Shell
Comment=Start Ryaba Kiosk Shell for ryaba-kiosk user
Exec=/usr/local/bin/ryaba-kiosk-autostart
Terminal=false
OnlyShowIn=KDE;
X-KDE-autostart-after=panel
X-KDE-StartupNotify=false
AUTOSTART

chmod 0644 /etc/xdg/autostart/ryaba-kiosk-shell.desktop

mkdir -p /var/lib/AccountsService/users

cat > /home/$KIOSK_USER/.dmrc <<DMRC
[Desktop]
Session=01plasma
DMRC
chown "$KIOSK_USER:$KIOSK_USER" /home/$KIOSK_USER/.dmrc || true

cat > /var/lib/AccountsService/users/$KIOSK_USER <<ACCOUNT
[User]
Language=ru_RU.UTF-8
Session=01plasma
XSession=01plasma
SystemAccount=false
ACCOUNT
chmod 0644 /var/lib/AccountsService/users/$KIOSK_USER || true

if id teacher >/dev/null 2>&1; then
  cat > /home/teacher/.dmrc <<'DMRC'
[Desktop]
Session=01plasma
DMRC
  chown teacher:teacher /home/teacher/.dmrc || true

  cat > /var/lib/AccountsService/users/teacher <<'ACCOUNT'
[User]
Language=ru_RU.UTF-8
Session=01plasma
XSession=01plasma
SystemAccount=false
ACCOUNT
  chmod 0644 /var/lib/AccountsService/users/teacher || true
fi

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
