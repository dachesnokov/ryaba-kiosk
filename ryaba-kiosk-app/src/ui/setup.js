const $ = (id) => document.getElementById(id);

$('save').onclick = async () => {
  const payload = {
    coreUrl: $('coreUrl').value.trim().replace(/\/$/, ''),
    enrollmentToken: $('enrollmentToken').value.trim(),
    localHomeUrl: $('homeUrl').value.trim().replace(/\/$/, '')
  };

  if (!payload.coreUrl || !payload.enrollmentToken) {
    $('result').textContent = 'Укажите адрес Ryaba Core и ключ регистрации.';
    return;
  }

  $('result').textContent = 'Сохраняю настройки...';

  const result = await window.ryabaKiosk.saveSetup(payload);

  if (!result.ok) {
    $('result').textContent = result.error || 'Ошибка сохранения настроек.';
    return;
  }

  $('result').textContent = 'Настройки сохранены. Киоск подключается к Ryaba Core...';
};
