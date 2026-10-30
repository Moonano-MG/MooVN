import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { validateSameOriginDevRequest } from '../src/lib/devServerSecurity.ts';

const studioRoot = path.resolve(import.meta.dirname, '..');
const webRoot = path.resolve(studioRoot, '../MooVN Web');

test('legacy origin check rejects missing, cross-site, different port and loopback aliases', () => {
  assert.equal(validateSameOriginDevRequest(undefined).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: '127.0.0.1:5173' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: '127.0.0.1:5173', origin: 'null' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: '127.0.0.1:5173', origin: 'http://localhost:5173' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5174' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: 'localhost:5173', origin: 'https://attacker.example' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-site' }).ok, false);
  assert.equal(validateSameOriginDevRequest({ host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }).ok, true);
});

for (const [edition, root] of [['studio', studioRoot], ['web', webRoot]] as const) {
  test(`${edition} development server has no privileged mutation endpoints and blocks unknown hosts`, async () => {
    const server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'silent',
      // Use each edition's actual entry when this test runs from another cwd.
      optimizeDeps: { entries: [edition === 'web' ? 'studio.html' : 'index.html'] },
      server: { port: 0 },
    });
    try {
      assert.equal(server.config.server.host, '127.0.0.1');
      assert.notEqual(server.config.server.allowedHosts, true);
      await server.listen();
      // Let Vite finish its dependency scan before shutdown rather than
      // canceling an active build during this server-security test.
      await server.environments.client.depsOptimizer?.scanProcessing;
      const address = server.httpServer?.address() as AddressInfo | null;
      assert.ok(address);
      const base = `http://127.0.0.1:${address.port}`;
      for (const endpoint of ['/api/moovn-fs/write', '/api/ai/chat']) {
        const response = await fetch(base + endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
          body: JSON.stringify({ subFolder: 'Projects', fileName: 'attack.json', content: 'should-not-write' }),
        });
        assert.equal(response.status, 404, `${endpoint} must not be registered`);
      }
      const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: address.port, path: '/', headers: { host: 'attacker.example' } }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        }).on('error', reject);
      });
      assert.equal(hostStatus, 403);
    } finally {
      await server.close();
    }
  });
}
