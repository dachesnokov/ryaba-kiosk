# Ryaba Core module: Сервисы → Киоски

Это стартовый backend + frontend page для управления Ryaba Kiosk Shell.

## Установка в Ryaba Core

На сервере Ryaba:

```bash
cd /opt/ryaba/src
bash /path/to/ryaba-core-module/install-kiosk-module.sh /opt/ryaba/src
```

Если Ryaba работает в Docker:

```bash
cd /opt/ryaba/src
docker exec -i ryaba_web bash < /path/to/ryaba-core-module/install-kiosk-module.sh
```

Но удобнее скопировать каталог `ryaba-core-module` на сервер и выполнить внутри контейнера:

```bash
cd /opt/ryaba/src
docker cp ryaba-core-module ryaba_web:/tmp/ryaba-core-module
docker exec -it ryaba_web bash -lc 'bash /tmp/ryaba-core-module/install-kiosk-module.sh /var/www/html'
```

## Что создается

- `service_kiosk_profiles`
- `service_kiosk_devices`
- `service_kiosk_enrollment_tokens`
- `service_kiosk_events`
- `service_kiosk_commands`

## API устройства

- `POST /api/services/kiosks/enroll`
- `POST /api/services/kiosks/heartbeat`
- `GET /api/services/kiosks/commands`
- `POST /api/services/kiosks/commands/{command}/result`

## API администрирования

- `GET /api/admin/services/kiosks/dashboard`
- `GET /api/admin/services/kiosks/devices`
- `POST /api/admin/services/kiosks/devices/{device}/approve`
- `POST /api/admin/services/kiosks/devices/{device}/command`
- `GET /api/admin/services/kiosks/profiles`
- `POST /api/admin/services/kiosks/profiles`
- `POST /api/admin/services/kiosks/enrollment-tokens`
