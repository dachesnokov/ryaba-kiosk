const { app, BrowserWindow, ipcMain, session, dialog, globalShortcut } = require('electron');
const path = require('path');
const { loadConfig, writeLocalConfig } = require('./config');
const { isAllowedUrl, getSafeHomeUrl } = require('./security');
const { callHelper } = require('./helperClient');
const { RyabaAgent } = require('./agent');

let mainWindow = null;
let adminWindow = null;
let config = loadConfig();
let lastAdminUnlockAt = 0;

function reloadConfig() {
  config = loadConfig();
  return config;
}

function sendBlocked(reason, url) {
  console.warn('[security] blocked:', reason, url);
}

function createMainWindow() {
  config = loadConfig();

  mainWindow = new BrowserWindow({
    show: false,
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-navigate', (_event, url) => {
    global.__RYABA_CURRENT_URL__ = url;
  });

  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    global.__RYABA_CURRENT_URL__ = url;
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url, config)) {
      event.preventDefault();
      sendBlocked('will-navigate', url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url, config)) {
      mainWindow.loadURL(url);
    } else {
      sendBlocked('window.open', url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const resourceType = details.resourceType;
    if (['mainFrame', 'subFrame'].includes(resourceType) && !isAllowedUrl(details.url, config)) {
      sendBlocked(`webRequest:${resourceType}`, details.url);
      return callback({ cancel: true });
    }
    callback({});
  });

  mainWindow.webContents.session.on('will-download', (event, item) => {
    if (config.blockDownloads !== false) {
      event.preventDefault();
      sendBlocked('download', item.getURL());
    }
  });

  if (!config.coreUrl || !config.enrollmentToken) {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'setup.html'));
    return;
  }

  const homeUrl = getSafeHomeUrl(config);
  if (homeUrl === 'about:blank') {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'offline.html'));
  } else {
    mainWindow.loadURL(homeUrl);
  }
}

function createAdminWindow() {
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.focus();
    return;
  }

  adminWindow = new BrowserWindow({
    width: 980,
    height: 720,
    center: true,
    resizable: false,
    alwaysOnTop: true,
    title: 'Ryaba Kiosk · Панель администратора',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  });

  adminWindow.loadFile(path.join(__dirname, 'ui', 'admin.html'));
}

function installPermissionPolicy() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      const allow = config.allowCamera !== false || config.allowMicrophone !== false;
      return callback(allow);
    }
    if (['notifications', 'geolocation', 'midiSysex', 'pointerLock'].includes(permission)) {
      return callback(false);
    }
    callback(false);
  });
}

function installShortcuts() {
  app.on('browser-window-focus', () => {
    globalShortcut.register('CommandOrControl+R', () => {});
    globalShortcut.register('CommandOrControl+Shift+R', () => {});
    globalShortcut.register('F5', () => {});
    globalShortcut.register('F11', () => {});
    globalShortcut.register('Alt+Left', () => {});
    globalShortcut.register('Alt+Right', () => {});
    globalShortcut.register('CommandOrControl+L', () => {});
    globalShortcut.register('CommandOrControl+O', () => {});
    globalShortcut.register('CommandOrControl+S', () => {});
    globalShortcut.register('CommandOrControl+P', () => {});
    globalShortcut.register('CommandOrControl+Shift+I', () => {});
  });
  app.on('browser-window-blur', () => globalShortcut.unregisterAll());
}

async function handleCommand(cmd) {
  switch (cmd.type) {
    case 'reload':
      if (mainWindow) mainWindow.reload();
      return { ok: true };
    case 'go_home':
      if (mainWindow) mainWindow.loadURL(getSafeHomeUrl(loadConfig()));
      return { ok: true };
    case 'restart_app':
      app.relaunch();
      app.exit(0);
      return { ok: true };
    case 'helper':
      return await callHelper(cmd.payload?.action, cmd.payload?.payload || {});
    default:
      return { ok: false, error: `unknown command ${cmd.type}` };
  }
}

app.whenReady().then(() => {
  installPermissionPolicy();
  installShortcuts();
  createMainWindow();

  const agent = new RyabaAgent(() => config, () => {
    reloadConfig();
    if (mainWindow) mainWindow.loadURL(getSafeHomeUrl(config));
  });
  agent.start(handleCommand);

  ipcMain.on('admin:open-request', () => {
    if (config.showAdminPanel === false) return;
    createAdminWindow();
  });

  ipcMain.handle('admin:login', async (_event, pin) => {
    const ok = String(pin || '') === String(config.adminPin || '');
    if (ok) lastAdminUnlockAt = Date.now();
    return { ok };
  });

  ipcMain.handle('admin:status', async () => {
    const network = await callHelper('network.status');
    const audio = await callHelper('audio.status');
    return {
      ok: true,
      unlocked: Date.now() - lastAdminUnlockAt < 15 * 60 * 1000,
      config: {
        coreUrl: config.coreUrl,
        homeUrl: config.homeUrl || config.localHomeUrl,
        allowedOrigins: config.allowedOrigins,
        allowCamera: config.allowCamera,
        allowMicrophone: config.allowMicrophone
      },
      url: global.__RYABA_CURRENT_URL__ || null,
      network,
      audio,
      time: new Date().toISOString(),
      version: require('../package.json').version
    };
  });

  ipcMain.handle('helper:call', async (_event, action, payload) => {
    const protectedActions = ['wifi.connect', 'audio.setVolume', 'audio.mute'];
    if (protectedActions.includes(action) && Date.now() - lastAdminUnlockAt > 15 * 60 * 1000) {
      return { ok: false, error: 'admin pin required' };
    }
    return await callHelper(action, payload || {});
  });

  ipcMain.handle('kiosk:reload', async () => {
    if (mainWindow) mainWindow.reload();
    return { ok: true };
  });

  ipcMain.handle('setup:save', async (_event, payload) => {
    try {
      const coreUrl = String(payload?.coreUrl || '').trim().replace(/\/$/, '');
      const enrollmentToken = String(payload?.enrollmentToken || '').trim();
      const localHomeUrl = String(payload?.localHomeUrl || coreUrl).trim().replace(/\/$/, '');

      if (!coreUrl || !enrollmentToken) {
        return { ok: false, error: 'Укажите адрес Ryaba Core и ключ регистрации.' };
      }

      let origin = coreUrl;
      try {
        origin = new URL(localHomeUrl || coreUrl).origin;
      } catch (_) {}

      writeLocalConfig({
        coreUrl,
        enrollmentToken,
        localHomeUrl: localHomeUrl || coreUrl,
        allowedOrigins: [origin],
        allowedPaths: ['/*'],
        savedAt: new Date().toISOString()
      });

      reloadConfig();

      if (mainWindow) {
        const target = getSafeHomeUrl(config);
        if (target === 'about:blank') {
          mainWindow.loadFile(path.join(__dirname, 'ui', 'offline.html'));
        } else {
          mainWindow.loadURL(target);
        }
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('kiosk:home', async () => {
    reloadConfig();
    if (mainWindow) mainWindow.loadURL(getSafeHomeUrl(config));
    return { ok: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    if (
      key === 'f12' ||
      (ctrl && input.shift && key === 'i') ||
      (ctrl && key === 'r') ||
      (ctrl && key === 'l') ||
      (ctrl && key === 'o') ||
      (ctrl && key === 's') ||
      (ctrl && key === 'p') ||
      (input.alt && ['left', 'right', 'f4'].includes(key))
    ) {
      event.preventDefault();
    }
  });
});
