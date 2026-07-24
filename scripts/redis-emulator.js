import net from 'net';

/**
 * Embedded RESP2 Redis Server for Local Execution & Multi-Instance Load Balancing.
 * Handles node-redis v4 handshake (PING, CLIENT, HELLO, COMMAND) and key-value store.
 */
const store = new Map();
const ttls = new Map();

function cleanExpired() {
  const now = Date.now();
  for (const [key, expireTime] of ttls.entries()) {
    if (now >= expireTime) {
      ttls.delete(key);
      store.delete(key);
    }
  }
}
setInterval(cleanExpired, 1000).unref();

function parseResp(data) {
  const str = data.toString();
  const lines = str.split('\r\n');
  if (!lines[0].startsWith('*')) return [];
  const count = parseInt(lines[0].substring(1), 10);
  const args = [];
  let lineIdx = 1;
  for (let i = 0; i < count; i++) {
    if (lines[lineIdx] && lines[lineIdx].startsWith('$')) {
      const len = parseInt(lines[lineIdx].substring(1), 10);
      lineIdx++;
      if (len === -1) {
        args.push(null);
      } else {
        args.push(lines[lineIdx]);
        lineIdx++;
      }
    }
  }
  return args;
}

function encodeResp(val) {
  if (val === null || val === undefined) return '$-1\r\n';
  if (typeof val === 'number') return `:${val}\r\n`;
  if (typeof val === 'boolean') return val ? ':1\r\n' : ':0\r\n';
  if (val === 'OK') return '+OK\r\n';
  if (val === 'PONG') return '+PONG\r\n';
  const str = String(val);
  return `$${Buffer.byteLength(str)}\r\n${str}\r\n`;
}

export function startRedisEmulator(port = 6379) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('error', () => {}); // swallow socket errors (e.g. abrupt disconnect)

      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length > 0) {
          const args = parseResp(buffer);
          if (!args || args.length === 0) break;
          buffer = Buffer.alloc(0); // reset buffer for next command

          const cmd = args[0] ? args[0].toUpperCase() : '';
          cleanExpired();

          if (cmd === 'PING') {
            socket.write(encodeResp('PONG'));
          } else if (cmd === 'CLIENT' || cmd === 'HELLO' || cmd === 'COMMAND' || cmd === 'SELECT' || cmd === 'QUIT') {
            socket.write(encodeResp('OK'));
          } else if (cmd === 'GET') {
            const key = args[1];
            const val = store.get(key);
            socket.write(encodeResp(val !== undefined ? val : null));
          } else if (cmd === 'SET') {
            const key = args[1];
            const val = args[2];
            let isNx = false;
            let ttlSec = null;
            for (let i = 3; i < args.length; i++) {
              if (args[i].toUpperCase() === 'NX') isNx = true;
              if (args[i].toUpperCase() === 'EX' && args[i + 1]) ttlSec = parseInt(args[i + 1], 10);
            }
            if (isNx && store.has(key)) {
              socket.write('$-1\r\n');
            } else {
              store.set(key, val);
              if (ttlSec) ttls.set(key, Date.now() + ttlSec * 1000);
              socket.write(encodeResp('OK'));
            }
          } else if (cmd === 'SETEX') {
            const key = args[1];
            const ttlSec = parseInt(args[2], 10);
            const val = args[3];
            store.set(key, val);
            ttls.set(key, Date.now() + ttlSec * 1000);
            socket.write(encodeResp('OK'));
          } else if (cmd === 'INCR') {
            const key = args[1];
            let val = parseInt(store.get(key) || '0', 10);
            if (isNaN(val)) val = 0;
            val++;
            store.set(key, String(val));
            socket.write(encodeResp(val));
          } else if (cmd === 'DECR') {
            const key = args[1];
            let val = parseInt(store.get(key) || '0', 10);
            if (isNaN(val)) val = 0;
            val--;
            store.set(key, String(val));
            socket.write(encodeResp(val));
          } else if (cmd === 'EXPIRE') {
            const key = args[1];
            const ttlSec = parseInt(args[2], 10);
            if (store.has(key)) {
              ttls.set(key, Date.now() + ttlSec * 1000);
              socket.write(encodeResp(1));
            } else {
              socket.write(encodeResp(0));
            }
          } else if (cmd === 'TTL') {
            const key = args[1];
            if (!store.has(key)) {
              socket.write(encodeResp(-2));
            } else if (!ttls.has(key)) {
              socket.write(encodeResp(-1));
            } else {
              const remaining = Math.max(0, Math.ceil((ttls.get(key) - Date.now()) / 1000));
              socket.write(encodeResp(remaining));
            }
          } else if (cmd === 'DEL') {
            let count = 0;
            for (let i = 1; i < args.length; i++) {
              if (store.delete(args[i])) count++;
              ttls.delete(args[i]);
            }
            socket.write(encodeResp(count));
          } else if (cmd === 'EVAL' || cmd === 'EVALSHA') {
            socket.write(encodeResp('OK'));
          } else {
            socket.write(encodeResp('OK'));
          }
        }
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[RedisEmulator] Listening on 127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('redis-emulator.js')) {
  startRedisEmulator(6379);
}
