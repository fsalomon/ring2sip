import http from 'node:http';
import { sip } from './sip.js'
import { ring } from './ring.js'

const {
  HEALTH_PORT
} = process.env

export function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const statusCode = ring.isConnected() && sip.isRegistered() ? 200 : 500;

      const body = JSON.stringify({
        battery: ring.getBattery(),
        ringConnected: ring.isConnected(),
        sipRegistered: sip.isRegistered(),
        uptime: process.uptime(),
      });

      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(HEALTH_PORT, '0.0.0.0', () => {
    console.log(`HEALTH - Listening on http://0.0.0.0:${HEALTH_PORT}/health`);
  });

  return {
    close() {
      return new Promise(resolve => server.close(resolve));
    }
  };
}

