// Exercise the built Web assets, not Vite's development server. The local
// server applies the exact /studio rewrite in vercel.json; this is not a test
// of Vercel deployment, serverless APIs, or the Windows desktop application.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(studio, '../MooVN Web');
const dist = resolve(web, 'dist');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || join(studio, 'test-results/browser-web-production'));
await mkdir(output, { recursive: true });
assert.ok(existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'studio.html')), 'Build MooVN Web first');
const config = JSON.parse(readFileSync(join(web, 'vercel.json'), 'utf8'));
const rewrite = config.rewrites?.find((entry) => entry.source === '/studio');
assert.equal(rewrite?.destination, '/studio.html', 'configured /studio rewrite must target the editor');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'], ['.woff2', 'font/woff2'],
]);
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === rewrite.source) pathname = rewrite.destination;
    const file = resolve(dist, `.${pathname}`);
    if (!file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime.get(extname(file).toLowerCase()) || 'application/octet-stream' });
    res.end(bytes);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') { res.writeHead(404).end(); return; }
    console.error(error);
    res.writeHead(500).end();
  }
});
let browser;
const errors = [];
function watch(page) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
}
try {
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local static server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  context.on('page', watch);
  const page = await context.newPage();
  const response = await page.goto(`${origin}/`);
  assert.equal(response?.status(), 200);
  await page.getByRole('heading', { name: 'MooVN Studio', exact: true }).waitFor();
  await page.screenshot({ path: join(output, '01-portal.png') });

  const [editor] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'MooVN网页体验', exact: true }).first().click(),
  ]);
  await editor.waitForURL(`${origin}/studio.html`);
  const sample = editor.getByRole('button', { name: '打开入门示例工程', exact: true }).first();
  await sample.waitFor();
  await editor.screenshot({ path: join(output, '02-launcher.png') });
  await sample.click();
  await editor.getByRole('button', { name: '导出游戏', exact: true }).waitFor();
  await editor.screenshot({ path: join(output, '03-workbench.png') });

  const rewritePage = await context.newPage();
  const rewriteResponse = await rewritePage.goto(`${origin}/studio`);
  assert.equal(rewriteResponse?.status(), 200);
  await rewritePage.getByRole('button', { name: '打开入门示例工程', exact: true }).first().waitFor();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('✓ Web production assets: portal link, launcher, sample workbench and simulated /studio rewrite');
} finally {
  if (browser) await browser.close();
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
}
