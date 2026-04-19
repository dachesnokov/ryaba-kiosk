#!/usr/bin/env bash
set -euo pipefail

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now ryaba-kiosk-shell.service 2>/dev/null || true
  systemctl disable --now ryaba-kiosk-helper.service 2>/dev/null || true
  systemctl daemon-reload || true
fi

rm -f /etc/systemd/system/ryaba-kiosk-shell.service
rm -f /etc/systemd/system/ryaba-kiosk-helper.service
rm -f /usr/local/bin/ryaba-kiosk-xsession
rm -f /usr/local/bin/ryaba-kiosk-start-xorg
rm -f /usr/local/bin/ryaba-kiosk-session
rm -f /usr/local/bin/ryaba-kiosk-autostart
rm -f /usr/share/xsessions/ryaba-kiosk.desktop
rm -f /etc/xdg/autostart/ryaba-kiosk-shell.desktop
rm -f /home/ryaba-kiosk/.config/autostart/ryaba-kiosk-shell.desktop 2>/dev/null || true

exit 0
