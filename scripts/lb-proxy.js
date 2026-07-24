import http from 'http';

/**
 * WealthGenie Round-Robin HTTP Load Balancer
 * Fronts PORT 3001 and PORT 3002 to prove stateless execution.
 */
const TARGETS = [
  { host: '127.0.0.1', port: 3001, name: 'instance-3001' },
  { host: '127.0.0.1', port: 3002, name: 'instance-3002' },
];

let counter = 0;

const server = http.createServer((req, res) => {
  const target = TARGETS[counter % TARGETS.length];
  counter++;

  const options = {
    host: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${target.port}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'x-served-by': target.name,
      'x-target-port': String(target.port),
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[LoadBalancer] Error forwarding to ${target.name}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Bad Gateway: ${target.name} unreachable` }));
  });

  req.pipe(proxyReq, { end: true });
});

const PORT = 8080;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[LoadBalancer] Started round-robin proxy on http://127.0.0.1:${PORT} -> [3001, 3002]`);
});
