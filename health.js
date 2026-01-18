import http from 'node:http';
import { ring } from './ring.js'

const {
  HEALTH_PORT
} = process.env

export function startHealthServer({
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

  server.listen(HEALTH_PORT, '127.0.0.1', () => {
    console.log(`HEALTH - Listening on http://127.0.0.1:${HEALTH_PORT}/health`);
  });

  return {
    close() {
      return new Promise(resolve => server.close(resolve));
    }
  };
}

