const { contextBridge, ipcRenderer } = require('electron');

let cornerClicks = [];
window.addEventListener('pointerdown', (event) => {
  const inCorner = event.clientX <= 80 && event.clientY <= 80;
  if (!inCorner) {
    cornerClicks = [];
    return;
  }

  const now = Date.now();
  cornerClicks = cornerClicks.filter((ts) => now - ts < 3500);
  cornerClicks.push(now);

  if (cornerClicks.length >= 5) {
    cornerClicks = [];
    ipcRenderer.send('admin:open-request');
  }
}, true);

function createShellControls() {
  if (document.getElementById('ryaba-kiosk-shell-controls')) return;

  const host = document.createElement('div');
  host.id = 'ryaba-kiosk-shell-controls';
  host.style.position = 'fixed';
  host.style.right = '18px';
  host.style.bottom = '18px';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'auto';

  const shadow = host.attachShadow({ mode: 'closed' });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <style>
      .bar {
        display: flex;
        gap: 8px;
        padding: 8px;
        border-radius: 18px;
        background: rgba(15, 23, 42, .88);
        box-shadow: 0 18px 50px rgba(15, 23, 42, .28);
        backdrop-filter: blur(10px);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button {
        border: 0;
        border-radius: 13px;
        padding: 10px 14px;
        background: rgba(255,255,255,.1);
        color: white;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      button:hover {
        background: rgba(255,255,255,.18);
      }
    </style>
    <div class="bar">
      <button id="back" title="Назад">← Назад</button>
      <button id="home" title="На главную">На главную</button>
    </div>
  `;

  shadow.appendChild(wrapper);

  wrapper.querySelector('#back')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.invoke('kiosk:back');
  });

  wrapper.querySelector('#home')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.invoke('kiosk:home');
  });

  document.documentElement.appendChild(host);
}

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', (event) => event.preventDefault(), true);

  // Не добавляем навигационные кнопки во внутренние окна настройки/админки.
  const href = String(window.location.href || '');
  if (!href.includes('/src/ui/admin.html') && !href.includes('/src/ui/setup.html') && !href.includes('/src/ui/offline.html')) {
    createShellControls();
  }
});

contextBridge.exposeInMainWorld('ryabaKiosk', {
  openAdminPanel: () => ipcRenderer.send('admin:open-request'),
  getStatus: () => ipcRenderer.invoke('admin:status'),
  helper: (action, payload) => ipcRenderer.invoke('helper:call', action, payload),
  adminLogin: (pin) => ipcRenderer.invoke('admin:login', pin),
  reloadKiosk: () => ipcRenderer.invoke('kiosk:reload'),
  goHome: () => ipcRenderer.invoke('kiosk:home'),
  goBack: () => ipcRenderer.invoke('kiosk:back'),
  saveSetup: (payload) => ipcRenderer.invoke('setup:save', payload)
});
