/**
 * lb-proxy.js — Minimal round-robin HTTP reverse proxy
 *
 * ARCHITECTURE PROOF: Demonstrates two WealthGenie server instances
 * can serve traffic behind a load balancer with zero request failures.
 *
 * Usage: node scripts/lb-proxy.js <port1> <port2> [proxyPort]
 * Example: node scripts/lb-proxy.js 4001 4002 4000
 */
import http from 'http';

const [,, port1, port2, proxyPort = '4000'] = process.argv;

if (!port1 || !port2) {
  console.error('Usage: node scripts/lb-proxy.js <port1> <port2> [proxyPort]');
  process.exit(1);
}

const backends = [
  { host: '127.0.0.1', port: parseInt(port1) },
  { host: '127.0.0.1', port: parseInt(port2) },
];

let index = 0;
const routingLog = { [port1]: 0, [port2]: 0 };

const server = http.createServer((clientReq, clientRes) => {
  const backend = backends[index % backends.length];
  index++;
  routingLog[backend.port]++;

  const options = {
    hostname: backend.host,
    port: backend.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers, 'x-lb-backend': `${backend.port}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Inject backend identifier into RESPONSE headers for observability
    proxyRes.headers['x-lb-backend'] = String(backend.port);
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[LB] Backend :${backend.port} error: ${err.message}`);
    clientRes.writeHead(502, { 'content-type': 'application/json' });
    clientRes.end(JSON.stringify({ error: 'Bad Gateway', backend: backend.port }));
  });

  clientReq.pipe(proxyReq, { end: true });
});

server.listen(parseInt(proxyPort), () => {
  console.log(`[LB] Round-robin proxy listening on :${proxyPort}`);
  console.log(`[LB] Backends: :${port1}, :${port2}`);
});

// Print routing stats on SIGINT
process.on('SIGINT', () => {
  console.log(`\n[LB] Routing stats:`, routingLog);
  process.exit(0);
});

// Export for programmatic use
export { server, routingLog };
