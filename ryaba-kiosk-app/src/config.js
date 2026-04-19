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
  if (process.env.RYABA_KIOSK_STATE_DIR) {
    return process.env.RYABA_KIOSK_STATE_DIR;
  }

  // Общий state нужен, чтобы настройка, сделанная из teacher или из ryaba-kiosk,
  // не терялась при смене пользователя.
  const shared = '/var/lib/ryaba-kiosk';

  try {
    fs.mkdirSync(shared, { recursive: true });
    return shared;
  } catch (_) {
    return path.join(os.homedir(), '.local', 'share', 'ryaba-kiosk');
  }
}

function loadConfig() {
  const packagedDefault = path.join(__dirname, '..', 'config', 'default-config.json');
  const defaults = safeReadJson(packagedDefault, {});
  const stateDir = getStateDir();
  const etc = safeReadJson(ETC_CONFIG, {});
  const local = safeReadJson(path.join(stateDir, 'local-config.json'), {});
  const remote = safeReadJson(path.join(stateDir, 'remote-config.json'), {});
  return {
    ...defaults,
    ...etc,
    ...local,
    ...remote,
    coreUrl: remote.coreUrl || local.coreUrl || etc.coreUrl || defaults.coreUrl || '',
    enrollmentToken: local.enrollmentToken || etc.enrollmentToken || defaults.enrollmentToken || '',
    allowedOrigins: remote.allowedOrigins || local.allowedOrigins || etc.allowedOrigins || defaults.allowedOrigins || [],
    allowedPaths: remote.allowedPaths || local.allowedPaths || etc.allowedPaths || defaults.allowedPaths || ['/*']
  };
}

function writeLocalConfig(config) {
  const stateDir = getStateDir();
  ensureDir(stateDir);
  const file = path.join(stateDir, 'local-config.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  try {
    fs.chownSync(file, process.getuid?.() ?? 0, process.getgid?.() ?? 0);
    fs.chmodSync(file, 0o666);
  } catch (_) {}
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
    fs.chmodSync(file, 0o666);
  } catch (_) {}
}

module.exports = {
  ETC_CONFIG,
  STATE_DIR,
  getStateDir,
  loadConfig,
  writeLocalConfig,
  writeLocalConfig,
  writeLocalConfig,
  writeLocalConfig,
  writeRemoteConfig,
  readDeviceState,
  writeDeviceState
};
