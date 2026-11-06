#!/usr/bin/env node
// Optional HTTP wrapper, for a game server that isn't written in JavaScript
// or wants the bot in a separate process.
//
//   PORT=8080 node src/server.js
//   curl -X POST localhost:8080/decide -d '{"state": {...}}'
import http from 'node:http';
import { decide, isStateError } from './index.js';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY = 64 * 1024;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createServer() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/decide') return send(res, 404, { error: 'Use POST /decide' });

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) { send(res, 413, { error: 'Request too large' }); req.destroy(); }
    });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: 'Body must be JSON' }); }
      // Accept either { state, options } or the state on its own.
      const state = parsed && parsed.state ? parsed.state : parsed;
      const options = (parsed && parsed.options) || {};
      try {
        send(res, 200, decide(state, options));
      } catch (e) {
        if (isStateError(e)) return send(res, 400, { error: e.message });
        send(res, 500, { error: e.message });
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, () => console.log(`Bazar Blot bot listening on http://localhost:${PORT}/decide`));
}
