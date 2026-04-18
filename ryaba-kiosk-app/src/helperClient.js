const net = require('net');

const SOCKET_PATH = '/run/ryaba-kiosk-helper.sock';

function callHelper(action, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(SOCKET_PATH);
    let buffer = '';
    let finished = false;

    const finish = (data) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch (_) {}
      resolve(data);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'helper timeout' });
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify({ action, payload }) + '\n');
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('\n')) return;
      clearTimeout(timer);
      const line = buffer.split('\n')[0];
      try {
        finish(JSON.parse(line));
      } catch (error) {
        finish({ ok: false, error: `bad helper response: ${error.message}` });
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: error.message });
    });

    socket.on('end', () => {
      if (!finished && buffer.trim()) {
        clearTimeout(timer);
        try {
          finish(JSON.parse(buffer.trim()));
        } catch (_) {
          finish({ ok: false, error: 'helper disconnected' });
        }
      }
    });
  });
}

module.exports = { callHelper };
