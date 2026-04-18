const fs = require('fs');
const path = require('path');
const os = require('os');

const ETC_CONFIG = '/etc/ryaba-kiosk/config.json';
const STATE_DIR = '/var/lib/ryaba-kiosk';
const USER_STATE_DIR = path.join(os.homedir(), '.local', 'state', 'ryaba-kiosk');

function safeReadJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('[config] failed to read', file, error);
    return fallback;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function getStateDir() {
  try {
    ensureDir(STATE_DIR);
    fs.accessSync(STATE_DIR, fs.constants.W_OK);
    return STATE_DIR;
  } catch (_) {
    ensureDir(USER_STATE_DIR);
    return USER_STATE_DIR;
  }
}

function loadConfig() {
  const packagedDefault = path.join(__dirname, '..', 'config', 'default-config.json');
  const defaults = safeReadJson(packagedDefault, {});
  const etc = safeReadJson(ETC_CONFIG, {});
  const stateDir = getStateDir();
  const remote = safeReadJson(path.join(stateDir, 'remote-config.json'), {});
  return {
    ...defaults,
    ...etc,
    ...remote,
    allowedOrigins: remote.allowedOrigins || etc.allowedOrigins || defaults.allowedOrigins || [],
    allowedPaths: remote.allowedPaths || etc.allowedPaths || defaults.allowedPaths || ['/*']
  };
}

function writeRemoteConfig(config) {
  const stateDir = getStateDir();
  ensureDir(stateDir);
  fs.writeFileSync(path.join(stateDir, 'remote-config.json'), JSON.stringify(config, null, 2));
}

function readDeviceState() {
  return safeReadJson(path.join(getStateDir(), 'device.json'), {});
}

function writeDeviceState(state) {
  const stateDir = getStateDir();
  ensureDir(stateDir);
  const file = path.join(stateDir, 'device.json');
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  try {
    fs.chmodSync(file, 0o600);
  } catch (_) {}
}

module.exports = {
  ETC_CONFIG,
  STATE_DIR,
  getStateDir,
  loadConfig,
  writeRemoteConfig,
  readDeviceState,
  writeDeviceState
};
