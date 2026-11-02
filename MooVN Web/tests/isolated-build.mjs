// Regression for a Web-only installation: the shared Studio source must resolve
// dependencies from MooVN Web, even if MooVN Studio/node_modules does not exist.
// This performs a real production build in an isolated temporary checkout.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const studioRoot = resolve(webRoot, '../MooVN Studio');
const modules = join(webRoot, 'node_modules');
assert.ok(existsSync(join(modules, 'vite', 'bin', 'vite.js')), 'Run npm ci in MooVN Web first.');
const tempRoot = mkdtempSync(join(tmpdir(), 'moovn-web-isolated-build-'));
const webFixture = join(tempRoot, 'MooVN Web');
const studioFixture = join(tempRoot, 'MooVN Studio');
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function runNode(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: webFixture,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, `${script}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${script} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
}

try {
  cpSync(join(webRoot, 'src'), join(webFixture, 'src'), { recursive: true });
  for (const file of ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'studio.html']) {
    cpSync(join(webRoot, file), join(webFixture, file));
  }
  cpSync(join(studioRoot, 'src'), join(studioFixture, 'src'), { recursive: true });
  cpSync(join(studioRoot, 'ai-endpoints.json'), join(studioFixture, 'ai-endpoints.json'));
  symlinkSync(modules, join(webFixture, 'node_modules'), linkType);
  symlinkSync(join(studioRoot, 'public'), join(studioFixture, 'public'), linkType);
  assert.equal(existsSync(join(studioFixture, 'node_modules')), false);

  runNode(join(modules, 'typescript', 'bin', 'tsc'), '-b');
  runNode(join(modules, 'vite', 'bin', 'vite.js'), 'build');

  const dist = join(webFixture, 'dist');
  for (const entry of ['index.html', 'studio.html']) {
    const html = readFileSync(join(dist, entry), 'utf8');
    assert.match(html, /<div id="root"><\/div>/, `${entry} must include its app root`);
    const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)].map((match) => match[1]);
    assert.ok(assets.some((asset) => asset.endsWith('.js')), `${entry} must reference a JS bundle`);
    assert.ok(assets.some((asset) => asset.endsWith('.css')), `${entry} must reference a stylesheet`);
    for (const asset of assets) assert.ok(existsSync(join(dist, asset)), `Missing ${entry} asset: ${asset}`);
  }
  assert.ok(existsSync(join(dist, 'images', 'characters', 'char-yukina-1.png')), 'shared public assets must be copied');
  console.log('✓ Web-only dependency installation builds both production entries and their referenced assets');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
