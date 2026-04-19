#!/usr/bin/env bash
set -euo pipefail

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now ryaba-kiosk-helper.service 2>/dev/null || true
  systemctl daemon-reload || true
fi

rm -f /etc/systemd/system/ryaba-kiosk-helper.service
rm -f /usr/local/bin/ryaba-kiosk-session
rm -f /usr/local/bin/ryaba-kiosk-autostart
rm -f /usr/share/xsessions/ryaba-kiosk.desktop
rm -f /etc/xdg/autostart/ryaba-kiosk-shell.desktop

if [ -d /home/ryaba-kiosk/.config/autostart ]; then
  rm -f /home/ryaba-kiosk/.config/autostart/ryaba-kiosk-shell.desktop
fi

exit 0
