import http from 'node:http';
import { ring } from './ring.js'

export function startHealthServer({
  port = 3000,
  getState
}) {
  if (typeof getState !== 'function') {
    throw new Error('health: getState() is required');
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const state = getState();

      const statusCode =
        state === 'ok' ? 200 :
        state === 'starting' ? 503 :
        500;

      const body = JSON.stringify({
        status: state,
        battery: ring.getBattery(),
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

  server.listen(port, '0.0.0.0', () => {
    console.log(`HEALTH - Listening on http://0.0.0.0:${port}/health`);
  });

  return {
    close() {
      return new Promise(resolve => server.close(resolve));
    }
  };
}

