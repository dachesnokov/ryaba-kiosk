const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { readDeviceState, writeDeviceState, writeRemoteConfig } = require('./config');
const { sanitizeRemoteConfig } = require('./security');

function readMachineId() {
  for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return value;
    } catch (_) {}
  }
  return os.hostname();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getNetworkSnapshot() {
  const interfaces = os.networkInterfaces();
  const macAddresses = [];
  const localIps = [];

  for (const [name, rows] of Object.entries(interfaces)) {
    for (const row of rows || []) {
      if (!row || row.internal) continue;

      if (row.mac && row.mac !== '00:00:00:00:00:00') {
        macAddresses.push({
          name,
          mac: row.mac,
          address: row.address,
          family: row.family,
          cidr: row.cidr || null
        });
      }

      if (row.address && (row.family === 'IPv4' || row.family === 4)) {
        localIps.push({
          name,
          address: row.address,
          cidr: row.cidr || null
        });
      }
    }
  }

  const primaryIp = localIps.find((row) => !String(row.address).startsWith('127.'))?.address || localIps[0]?.address || null;

  return { macAddresses, localIps, primaryIp };
}

function devicePayload() {
  const network = getNetworkSnapshot();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    machineIdHash: sha256(readMachineId()),
    macAddresses: network.macAddresses,
    localIps: network.localIps,
    primaryIp: network.primaryIp,
    appVersion: require('../package.json').version
  };
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const message = data.message || data.error || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data;
}

class RyabaAgent {
  constructor(configProvider, onConfigChanged) {
    this.configProvider = configProvider;
    this.onConfigChanged = onConfigChanged;
    this.timer = null;
    this.commandsTimer = null;
    this.lastConfigVersion = String(this.config.remoteConfigVersion || '');
  }

  get config() {
    return this.configProvider();
  }

  async enrollIfNeeded() {
    const config = this.config;
    const state = readDeviceState();
    if (state.deviceToken && state.deviceUuid) return state;
    if (!config.coreUrl || !config.enrollmentToken) {
      return { offline: true, reason: 'coreUrl or enrollmentToken is empty' };
    }

    const data = await requestJson(`${config.coreUrl.replace(/\/$/, '')}/api/services/kiosks/enroll`, {
      method: 'POST',
      body: JSON.stringify({
        enrollment_token: config.enrollmentToken,
        device: devicePayload()
      })
    });

    const newState = {
      deviceUuid: data.device_uuid,
      deviceToken: data.device_token,
      enrolledAt: new Date().toISOString()
    };
    writeDeviceState(newState);
    return newState;
  }

  authHeaders() {
    const state = readDeviceState();
    if (!state.deviceToken) return {};
    return { Authorization: `Bearer ${state.deviceToken}` };
  }

  async heartbeat() {
    const config = this.config;
    if (!config.coreUrl) return { ok: false, error: 'coreUrl empty' };
    await this.enrollIfNeeded();
    const data = await requestJson(`${config.coreUrl.replace(/\/$/, '')}/api/services/kiosks/heartbeat`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        device: devicePayload(),
        current_url: global.__RYABA_CURRENT_URL__ || null
      })
    });

    if (data.config && data.config_version) {
      const currentVersion = String(this.config.remoteConfigVersion || this.lastConfigVersion || '');
      const nextVersion = String(data.config_version || '');

      if (currentVersion !== nextVersion) {
        const nextConfig = sanitizeRemoteConfig({
          ...data.config,
          remoteConfigVersion: data.config_version,
          fetchedAt: new Date().toISOString()
        });

        writeRemoteConfig(nextConfig);

        this.lastConfigVersion = nextVersion;

        if (typeof this.onConfigChanged === 'function') this.onConfigChanged();
      }
    }

    return data;
  }

  async fetchCommands() {
    const config = this.config;
    const state = readDeviceState();
    if (!config.coreUrl || !state.deviceToken) return [];
    try {
      const data = await requestJson(`${config.coreUrl.replace(/\/$/, '')}/api/services/kiosks/commands`, {
        method: 'GET',
        headers: this.authHeaders()
      });
      return data.commands || [];
    } catch (error) {
      return [];
    }
  }

  async reportCommand(id, result) {
    const config = this.config;
    try {
      await requestJson(`${config.coreUrl.replace(/\/$/, '')}/api/services/kiosks/commands/${id}/result`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ result })
      });
    } catch (_) {}
  }

  start(commandHandler) {
    const hbSeconds = Number(this.config.heartbeatSeconds || 30);
    const cmdSeconds = Number(this.config.commandsSeconds || 15);

    const tickHeartbeat = async () => {
      try { await this.heartbeat(); } catch (error) { console.error('[agent] heartbeat failed:', error.message); }
    };

    const tickCommands = async () => {
      const commands = await this.fetchCommands();
      for (const cmd of commands) {
        let result = { ok: false, error: 'no handler' };
        try {
          result = await commandHandler(cmd);
        } catch (error) {
          result = { ok: false, error: error.message };
        }
        await this.reportCommand(cmd.id, result);
      }
    };

    tickHeartbeat();
    tickCommands();
    this.timer = setInterval(tickHeartbeat, hbSeconds * 1000);
    this.commandsTimer = setInterval(tickCommands, cmdSeconds * 1000);
  }
}

module.exports = { RyabaAgent };
