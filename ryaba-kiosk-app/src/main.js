const { app, BrowserWindow, ipcMain, session, dialog, globalShortcut, screen } = require('electron');

try {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-features', 'UseOzonePlatform,Vulkan');
} catch (_) {}
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

function hasRemoteProfileConfig(nextConfig = {}) {
  return Boolean(nextConfig.remoteConfigVersion || nextConfig.fetchedAt || nextConfig.homeUrl);
}

function getWaitingProfileHtml(message = 'Киоск подключается к Ryaba Core и ожидает настройки профиля.') {
  return `
    <!doctype html>
    <html lang="ru">
    <head>
      <meta charset="utf-8">
      <title>Ryaba Kiosk · Ожидание профиля</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #0f172a;
          color: #fff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card {
          width: min(760px, calc(100vw - 48px));
          border-radius: 32px;
          background: rgba(255,255,255,.08);
          box-shadow: 0 28px 90px rgba(0,0,0,.35);
          padding: 36px;
        }
        .label {
          color: #94a3b8;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        h1 {
          margin: 10px 0 12px;
          font-size: 34px;
        }
        p {
          margin: 0;
          color: #cbd5e1;
          font-size: 17px;
          line-height: 1.6;
        }
        .dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          margin-right: 8px;
          border-radius: 999px;
          background: #38bdf8;
          animation: pulse 1.1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: .35; transform: scale(.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="label">Ryaba Kiosk Shell</div>
        <h1><span class="dot"></span>Ожидание настроек</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `;
}

function showWaitingProfile(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getWaitingProfileHtml(message)));
}


function sendBlocked(reason, url) {
  console.warn('[security] blocked:', reason, url);
}

function getKioskBounds() {
  try {
    const display = screen.getPrimaryDisplay();
    const bounds = display?.bounds || display?.workArea || {};
    return {
      x: Number.isFinite(bounds.x) ? bounds.x : 0,
      y: Number.isFinite(bounds.y) ? bounds.y : 0,
      width: Math.max(1024, Number.isFinite(bounds.width) ? bounds.width : 1920),
      height: Math.max(768, Number.isFinite(bounds.height) ? bounds.height : 1080)
    };
  } catch (_) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
}


function createMainWindow() {
  config = loadConfig();
  const kioskBounds = getKioskBounds();

  mainWindow = new BrowserWindow({
    show: false,
    x: kioskBounds.x,
    y: kioskBounds.y,
    width: kioskBounds.width,
    height: kioskBounds.height,
    minWidth: kioskBounds.width,
    minHeight: kioskBounds.height,
    frame: false,
    resizable: false,
    movable: false,
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

  mainWindow.once('ready-to-show', () => {
    try {
      const bounds = getKioskBounds();
      mainWindow.setBounds(bounds, false);
      mainWindow.setFullScreen(true);
      mainWindow.setKiosk(true);
      mainWindow.focus();
    } catch (_) {}

    mainWindow.show();
  });

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


  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return;

    const html = `
      <!doctype html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <title>Ryaba Kiosk · Ошибка загрузки</title>
        <style>
          body {
            margin: 0;
            display: grid;
            min-height: 100vh;
            place-items: center;
            background: #0f172a;
            color: white;
            font-family: system-ui, sans-serif;
          }
          .card {
            max-width: 760px;
            border-radius: 28px;
            background: rgba(255,255,255,.08);
            padding: 32px;
            box-shadow: 0 24px 80px rgba(0,0,0,.25);
          }
          h1 { margin: 0 0 12px; font-size: 32px; }
          pre {
            white-space: pre-wrap;
            color: #cbd5e1;
            background: rgba(15,23,42,.75);
            border-radius: 18px;
            padding: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Не удалось открыть сайт</h1>
          <p>Киоск получил адрес, но страница не загрузилась.</p>
          <pre>${errorCode}: ${errorDescription}
${validatedUrl}</pre>
          <p>Проверьте доступность сайта с МОС 12 и разрешенные домены в профиле Ryaba.</p>
        </div>
      </body>
      </html>
    `;

    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
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

    // Внутренние страницы самого приложения: админка, первый запуск, offline fallback.
    // Их нельзя прогонять через allowlist сайтов, иначе Electron получает ERR_BLOCKED_BY_CLIENT.
    let protocol = '';
    try {
      protocol = new URL(details.url).protocol;
    } catch (_) {}

    if (['file:', 'data:', 'about:'].includes(protocol)) {
      return callback({});
    }

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

  if (!hasRemoteProfileConfig(config)) {
    showWaitingProfile('Киоск зарегистрирован или подключается к Ryaba Core. Ожидаем профиль и стартовую страницу из Ryaba.');
    return;
  }

  const homeUrl = getSafeHomeUrl(config);
  if (homeUrl === 'about:blank') {
    showWaitingProfile('Ryaba Core пока не передала стартовую страницу профиля.');
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

    if (!mainWindow) return;

    if (!hasRemoteProfileConfig(config)) {
      showWaitingProfile('Ryaba Core пока не передала профиль киоска.');
      return;
    }

    mainWindow.loadURL(getSafeHomeUrl(config));
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
      const localHomeUrl = coreUrl;

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

      setTimeout(() => {
        try {
          app.relaunch();
        } catch (_) {}

        app.exit(0);
      }, 300);

      return { ok: true, relaunch: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('kiosk:home', async () => {
    reloadConfig();

    if (mainWindow) {
      if (!hasRemoteProfileConfig(config)) {
        showWaitingProfile('Стартовая страница еще не получена из профиля Ryaba.');
      } else {
        mainWindow.loadURL(getSafeHomeUrl(config));
      }
    }

    return { ok: true };
  });

  ipcMain.handle('kiosk:back', async () => {
    if (mainWindow && mainWindow.webContents.canGoBack()) {
      mainWindow.webContents.goBack();
      return { ok: true, action: 'back' };
    }

    reloadConfig();

    if (mainWindow) {
      const target = getSafeHomeUrl(config);
      if (target !== 'about:blank') {
        mainWindow.loadURL(target);
      }
    }

    return { ok: true, action: 'home' };
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
