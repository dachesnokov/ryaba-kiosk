# Ryaba Kiosk

Ryaba Kiosk — управляемая оболочка информационного киоска для МОС 12.

## Состав

- ryaba-kiosk-app — Electron-приложение киоска.
- ryaba-core-module — модуль Ryaba Core для управления киосками.

## Сборка RPM

cd ryaba-kiosk-app
npm install
npm run build:rpm

## Установка на МОС 12

sudo rpm -Uvh dist/ryaba-kiosk-shell-0.1.0-x86_64.rpm

sudo bash scripts/install-mos12.sh \
  https://ra.spo-kp.ru \
  ENROLLMENT_TOKEN \
  https://ra.spo-kp.ru

ENROLLMENT_TOKEN не хранить в Git.
