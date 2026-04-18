# Ryaba Kiosk Shell MVP

Управляемый киоск-браузер для МОС 12.

## Что уже есть

- Electron-приложение в kiosk/fullscreen режиме.
- Загрузка только разрешенных сайтов.
- Блокировка `window.open`, внешних URL, скачиваний, DevTools и основных горячих клавиш.
- Скрытая панель администратора: 5 кликов в левый верхний угол.
- PIN администратора.
- Wi‑Fi scan/connect через локальный root-helper.
- Статус Ethernet/Wi‑Fi/IP.
- Громкость через PulseAudio/pactl.
- Проверка камеры/микрофона.
- Автоматическая регистрация в Ryaba Core через enrollment token.
- Heartbeat и получение удаленного профиля.

## Быстрый запуск разработки

```bash
cd ryaba-kiosk-app
npm install
npm run dev
```

## Сборка RPM

```bash
cd ryaba-kiosk-app
bash scripts/build-rpm.sh
```

RPM появится в `dist/`.

## Установка на МОС 12

```bash
sudo rpm -Uvh dist/ryaba-kiosk-shell-0.1.0-x86_64.rpm
sudo bash scripts/install-mos12.sh https://ra.spo-kp.ru ENROLLMENT_TOKEN https://ra.spo-kp.ru
```

После этого нужно включить автологин пользователя `ryaba-kiosk` в графическом менеджере входа и выбрать сессию `Ryaba Kiosk`.

Для ручной проверки:

```bash
sudo -u ryaba-kiosk ryaba-kiosk-shell
```

## Конфиг

`/etc/ryaba-kiosk/config.json`

```json
{
  "coreUrl": "https://ra.spo-kp.ru",
  "enrollmentToken": "token-from-ryaba",
  "localHomeUrl": "https://ra.spo-kp.ru",
  "adminPin": "123456",
  "allowedOrigins": ["https://ra.spo-kp.ru"],
  "allowedPaths": ["/*"]
}
```
