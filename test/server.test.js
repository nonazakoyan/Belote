import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('HTTP: POST /decide returns a move, bad state returns 400', async () => {
  const server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://localhost:${server.address().port}/decide`;
  try {
    const ok = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ state: { seat: 1, dealer: 0, hand: ['7H', '8S', '7D', '7C', '8C', 'QS', 'KH', '8D'], bids: [] }, options: { level: 'rules' } }),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).type, 'pass');
    const bad = await fetch(url, { method: 'POST', body: JSON.stringify({ seat: 9 }) });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /seat/);
  } finally {
    server.close();
  }
});
