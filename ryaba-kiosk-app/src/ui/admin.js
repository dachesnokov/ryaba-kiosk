const $ = (id) => document.getElementById(id);

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

async function refreshStatus() {
  const status = await window.ryabaKiosk.getStatus();
  if (status.unlocked) {
    $('loginCard').classList.add('hidden');
    $('content').classList.remove('hidden');
  }

  const rows = [
    ['Версия', status.version],
    ['Время', new Date().toLocaleString()],
    ['Текущий URL', status.url || '—'],
    ['Ryaba Core', status.config?.coreUrl || '—'],
    ['Домашний сайт', status.config?.homeUrl || '—'],
    ['Камера', status.config?.allowCamera ? 'разрешена' : 'запрещена'],
    ['Микрофон', status.config?.allowMicrophone ? 'разрешен' : 'запрещен']
  ];

  $('statusList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${String(v)}</dd>`).join('');
  $('networkStatus').textContent = renderJson(status.network);
  $('audioStatus').textContent = renderJson(status.audio);
}

$('login').onclick = async () => {
  const result = await window.ryabaKiosk.adminLogin($('pin').value);
  if (!result.ok) {
    $('loginError').textContent = 'Неверный PIN';
    return;
  }
  $('loginError').textContent = '';
  await refreshStatus();
};

$('reload').onclick = () => window.ryabaKiosk.reloadKiosk();
$('goHome').onclick = () => window.ryabaKiosk.goHome();

$('scanWifi').onclick = async () => {
  const result = await window.ryabaKiosk.helper('wifi.scan', {});
  if (!result.ok) {
    $('wifiList').innerHTML = `<div class="error">${result.error}</div>`;
    return;
  }
  const rows = result.data || [];
  $('wifiList').innerHTML = rows.map((row) => `
    <div class="wifi-row">
      <strong>${row.ssid || '(скрытая сеть)'}</strong>
      <span>${row.signal || ''}% · ${row.security || 'open'}</span>
    </div>
  `).join('');
};

$('connectWifi').onclick = async () => {
  const result = await window.ryabaKiosk.helper('wifi.connect', {
    ssid: $('wifiSsid').value,
    password: $('wifiPassword').value
  });
  $('wifiResult').textContent = renderJson(result);
  await refreshStatus();
};

$('setVolume').onclick = async () => {
  const result = await window.ryabaKiosk.helper('audio.setVolume', {
    volume: Number($('volume').value)
  });
  $('audioStatus').textContent = renderJson(result);
};

$('testMedia').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $('preview').srcObject = stream;
    $('mediaResult').textContent = 'Камера и микрофон доступны.';
  } catch (error) {
    $('mediaResult').textContent = error.message;
  }
};

refreshStatus();
setInterval(refreshStatus, 5000);
