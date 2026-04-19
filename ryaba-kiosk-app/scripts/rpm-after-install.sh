#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Ryaba Kiosk Shell"
APP_DIR="/opt/$APP_NAME"
HELPER_SRC="$APP_DIR/resources/helper/ryaba-kiosk-helper.py"
KIOSK_USER="ryaba-kiosk"
KIOSK_PASSWORD="123456"

echo "===== Ryaba Kiosk postinstall ====="

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
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 0775 /var/lib/ryaba-kiosk
chown -R "$KIOSK_USER:$KIOSK_USER" /var/lib/ryaba-kiosk || true
chmod -R u+rwX,g+rwX /var/lib/ryaba-kiosk || true
install -d -m 0755 /opt/ryaba-kiosk

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

cat > /usr/local/bin/ryaba-kiosk-xsession <<'SH'
#!/usr/bin/env bash
set -u

mkdir -p /var/lib/ryaba-kiosk
chmod 0777 /var/lib/ryaba-kiosk 2>/dev/null || true

LOG_FILE="/var/lib/ryaba-kiosk/shell.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ryaba-kiosk-shell.log"
chmod 0666 "$LOG_FILE" 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1

echo
echo "===== Ryaba Kiosk pure X session: $(date -Is) ====="
id
env | sort

export RYABA_KIOSK_STATE_DIR=/var/lib/ryaba-kiosk
export ELECTRON_DISABLE_SECURITY_WARNINGS=true
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_ENABLE_STACK_DUMPING=1
export NO_AT_BRIDGE=1

xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true

if command -v xrandr >/dev/null 2>&1; then
  XRANDR_OUTPUT="$(xrandr | awk '/ connected/{print $1; exit}')"
  if [ -n "$XRANDR_OUTPUT" ]; then
    xrandr --output "$XRANDR_OUTPUT" --auto 2>/dev/null || true
  fi
fi

APP="/opt/Ryaba Kiosk Shell/ryaba-kiosk-shell"

while true; do
  echo
  echo "Starting: $APP at $(date -Is)"

  if [ ! -x "$APP" ]; then
    echo "ERROR: app not found: $APP"
    sleep 5
    continue
  fi

  "$APP" --disable-gpu --no-sandbox --ozone-platform=x11

  CODE="$?"
  echo "Ryaba Kiosk exited with code $CODE at $(date -Is), restarting in 2s"
  sleep 2
done
SH

chmod 0755 /usr/local/bin/ryaba-kiosk-xsession

cat > /usr/local/bin/ryaba-kiosk-start-xorg <<'SH'
#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/lib/ryaba-kiosk
chmod 0777 /var/lib/ryaba-kiosk 2>/dev/null || true

LOG_FILE="/var/lib/ryaba-kiosk/xorg-start.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ryaba-kiosk-xorg-start.log"
chmod 0666 "$LOG_FILE" 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1

echo
echo "===== Ryaba Kiosk Xorg launcher: $(date -Is) ====="
id
env | sort

XINIT_BIN="$(command -v xinit || true)"
if [ -z "$XINIT_BIN" ]; then
  echo "ERROR: xinit not found. Install xinit/xorg-x11-xinit package."
  exit 127
fi

XORG_BIN="$(command -v Xorg || true)"
if [ -z "$XORG_BIN" ] && [ -x /usr/libexec/Xorg ]; then
  XORG_BIN="/usr/libexec/Xorg"
fi

if [ -z "$XORG_BIN" ]; then
  echo "ERROR: Xorg not found."
  exit 127
fi

echo "XINIT_BIN=$XINIT_BIN"
echo "XORG_BIN=$XORG_BIN"

exec "$XINIT_BIN" /usr/local/bin/ryaba-kiosk-xsession -- "$XORG_BIN" :1 vt7 -nolisten tcp -noreset
SH

chmod 0755 /usr/local/bin/ryaba-kiosk-start-xorg

cat > /etc/systemd/system/ryaba-kiosk-shell.service <<'UNIT'
[Unit]
Description=Ryaba Kiosk dedicated pure Xorg shell
Documentation=https://ra.spo-kp.ru
After=systemd-user-sessions.service NetworkManager.service ryaba-kiosk-helper.service
Wants=NetworkManager.service ryaba-kiosk-helper.service

# Киоск-режим должен быть отдельным режимом, без SDDM/KDE.
Conflicts=display-manager.service sddm.service

[Service]
Type=simple
User=ryaba-kiosk
Group=ryaba-kiosk
PAMName=login
WorkingDirectory=/home/ryaba-kiosk
Environment=HOME=/home/ryaba-kiosk
Environment=USER=ryaba-kiosk
Environment=LOGNAME=ryaba-kiosk
Environment=RYABA_KIOSK_STATE_DIR=/var/lib/ryaba-kiosk
ExecStartPre=+/usr/bin/install -d -o ryaba-kiosk -g ryaba-kiosk -m 0775 /var/lib/ryaba-kiosk
ExecStartPre=+/usr/bin/chown -R ryaba-kiosk:ryaba-kiosk /var/lib/ryaba-kiosk
ExecStartPre=+/usr/bin/chmod -R u+rwX,g+rwX /var/lib/ryaba-kiosk

TTYPath=/dev/tty7
TTYReset=yes
TTYVHangup=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal

ExecStart=/usr/local/bin/ryaba-kiosk-start-xorg
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

# Убираем все старые попытки автозапуска через KDE/SDDM.
rm -f /etc/xdg/autostart/ryaba-kiosk-shell.desktop
rm -f /usr/share/xsessions/ryaba-kiosk.desktop
rm -f /usr/local/bin/ryaba-kiosk-session
rm -f /usr/local/bin/ryaba-kiosk-autostart
rm -f /home/ryaba-kiosk/.config/autostart/ryaba-kiosk-shell.desktop 2>/dev/null || true

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable --now NetworkManager 2>/dev/null || true
  if [ -f /opt/ryaba-kiosk/ryaba-kiosk-helper.py ]; then
    systemctl enable --now ryaba-kiosk-helper.service || true
  fi
fi

cat > /var/lib/ryaba-kiosk/README-MODE.txt <<'TXT'
Ryaba Kiosk установлен.

Обычный режим:
  sudo systemctl enable --now sddm

Киоск-режим без KDE/Plasma:
  sudo systemctl disable --now sddm
  sudo systemctl enable --now ryaba-kiosk-shell

Вернуться из киоск-режима:
  sudo systemctl disable --now ryaba-kiosk-shell
  sudo systemctl enable --now sddm

Логи:
  sudo cat /var/lib/ryaba-kiosk/shell.log
  sudo cat /var/lib/ryaba-kiosk/xorg-start.log
  sudo journalctl -u ryaba-kiosk-shell -n 200 --no-pager
TXT
chmod 0666 /var/lib/ryaba-kiosk/README-MODE.txt || true

exit 0
