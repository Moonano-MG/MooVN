// Exercises built Studio/Web assets and exports the HTML through the actual UI.
// The exported game is opened at file://, not through the dev-server module.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

const web = process.argv.includes('--web');
const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = web ? resolve(studio, '../MooVN Web') : studio;
const dist = resolve(root, 'dist');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(studio, 'test-results/browser-read-skip-production', web ? 'web' : 'studio'));
await mkdir(output, { recursive: true });
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'], ['.woff2', 'font/woff2'],
]);
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    const file = resolve(dist, `.${path}`);
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
const project = structuredClone(DEFAULT_PROJECT);
project.title = 'Production skip export';
const a = structuredClone(project.nodes[0]);
a.id = 'a'; a.title = 'a'; a.transition = 'none'; a.dialogues[0].id = 'a-line'; a.dialogues[0].text = 'UI_EXPORT_A'; a.nextNodeId = 'b';
const b = structuredClone(a);
b.id = 'b'; b.title = 'b'; b.dialogues[0].id = 'b-line'; b.dialogues[0].text = 'UI_EXPORT_B'; b.nextNodeId = null;
project.nodes = [a, b]; project.startNodeId = 'a';
let browser;
let context;
const errors = [];
try {
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Production server did not bind');
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce', acceptDownloads: true });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  const page = await context.newPage();
  const response = await page.goto(`http://127.0.0.1:${address.port}${web ? '/studio.html' : '/'}`);
  assert.equal(response?.status(), 200, 'production assets must be built before running this test');
  await page.locator('input[type=file][accept*=".mpvn"]').setInputFiles({ name: 'production-skip.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  const viewport = page.locator('[data-scene-viewport="player"]');
  await viewport.getByText('UI_EXPORT_A', { exact: true }).waitFor();
  await page.getByRole('button', { name: '快进', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await viewport.getByText('UI_EXPORT_A', { exact: true }).isVisible(), true);
  await viewport.getByText('UI_EXPORT_A', { exact: true }).click();
  await viewport.getByText('UI_EXPORT_B', { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();

  await page.getByRole('button', { name: '导出游戏', exact: true }).first().click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML5', exact: true }).click();
  const download = await downloadPromise;
  const file = resolve(output, 'ui-exported-game.html');
  await download.saveAs(file);
  const player = await context.newPage();
  await player.goto(pathToFileURL(file).href);
  await player.getByRole('button', { name: '开始游戏', exact: true }).click();
  await player.getByText('UI_EXPORT_A', { exact: true }).waitFor();
  await player.getByRole('button', { name: '快进', exact: true }).click();
  await player.waitForTimeout(400);
  assert.equal(await player.locator('#dlg-text').innerText(), 'UI_EXPORT_A', 'preview history must not mark the exported game read');
  await player.screenshot({ path: resolve(output, '01-unread-blocked.png') });
  await player.locator('#dlg-text').click();
  await player.getByText('UI_EXPORT_B', { exact: true }).waitFor();
  await player.reload();
  await player.getByRole('button', { name: '开始游戏', exact: true }).click();
  await player.getByText('UI_EXPORT_A', { exact: true }).waitFor();
  await player.getByRole('button', { name: '快进', exact: true }).click();
  await player.getByText('UI_EXPORT_B', { exact: true }).waitFor();
  await player.waitForTimeout(400);
  assert.equal(await player.getByRole('button', { name: '快进', exact: true }).getAttribute('aria-pressed'), 'false');
  await player.screenshot({ path: resolve(output, '02-read-skipped-unread-stopped.png') });
  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  console.log(`✓ ${web ? 'Web' : 'Studio'} production UI exported file:// HTML, preserved read history after reload, and stopped at unread dialogue`);
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
}
