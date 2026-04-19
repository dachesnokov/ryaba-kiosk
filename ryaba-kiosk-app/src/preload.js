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

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', (event) => event.preventDefault(), true);
});

contextBridge.exposeInMainWorld('ryabaKiosk', {
  openAdminPanel: () => ipcRenderer.send('admin:open-request'),
  getStatus: () => ipcRenderer.invoke('admin:status'),
  helper: (action, payload) => ipcRenderer.invoke('helper:call', action, payload),
  adminLogin: (pin) => ipcRenderer.invoke('admin:login', pin),
  reloadKiosk: () => ipcRenderer.invoke('kiosk:reload'),
  goHome: () => ipcRenderer.invoke('kiosk:home'),
  saveSetup: (payload) => ipcRenderer.invoke('setup:save', payload)
});
