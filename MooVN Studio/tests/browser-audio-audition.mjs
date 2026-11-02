// Browser-mode check for BGM audition controls sharing one audio engine.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

const web = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), web ? '../../MooVN Web' : '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-audio-audition'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const screenshot = (name) => page.screenshot({ path: resolve(output, `${web ? 'web' : 'studio'}-${name}.png`) });
const project = structuredClone(DEFAULT_PROJECT);
project.nodes[0].type = 'bgm_play';
project.nodes[0].bgmId = 'bgm-spring-breeze';
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${web ? '/studio.html' : '/'}`);
  await page.locator('input[type=file][accept*=".mpvn"]').setInputFiles({ name: 'audition.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await page.getByRole('button', { name: '工程资源', exact: true }).click();
  await page.getByRole('button', { name: '音频', exact: true }).click();
  const asset = page.getByText('BGM · 樱色晨风与始业式 (Piano)', { exact: true }).locator('../..');
  await page.getByRole('button', { name: '试听当前音轨', exact: true }).click();
  await page.getByRole('button', { name: '停止试听', exact: true }).waitFor();
  await screenshot(process.env.MOOVN_BASELINE ? 'baseline-unsynced' : '01-inspector-start');
  assert.equal(await asset.getByTitle('停止', { exact: true }).count(), 1, 'asset audition must show BGM started in Inspector');
  await asset.getByTitle('停止', { exact: true }).click();
  await page.getByRole('button', { name: '试听当前音轨', exact: true }).waitFor();
  await asset.getByTitle('试听', { exact: true }).click();
  await page.getByRole('button', { name: '停止试听', exact: true }).waitFor();
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').waitFor();
  // Exiting preview stops shared BGM and must update both labels.
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '试听当前音轨', exact: true }).waitFor();
  assert.equal(await asset.getByTitle('试听', { exact: true }).count(), 1);
  await screenshot('02-preview-stop');

  await page.evaluate(() => {
    window.__deferredResumes = [];
    Object.defineProperty(AudioContext.prototype, 'state', { configurable: true, get: () => 'suspended' });
    AudioContext.prototype.resume = () => new Promise((resolve, reject) => window.__deferredResumes.push({ resolve, reject }));
  });
  const secondAsset = page.getByText('BGM · 第十三声钟鸣之谜 (Music Box)', { exact: true }).locator('../..');
  await asset.getByTitle('试听', { exact: true }).click();
  await secondAsset.getByTitle('试听', { exact: true }).click();
  await page.evaluate(() => window.__deferredResumes[0].reject(new Error('old resume rejection')));
  await page.waitForTimeout(30);
  assert.equal(await secondAsset.getByTitle('停止', { exact: true }).count(), 1, 'old resume rejection cannot stop a newer track');
  assert.equal(await page.getByRole('alert').filter({ hasText: 'old resume rejection' }).count(), 0);
  await page.evaluate(() => window.__deferredResumes[1].reject(new Error('current resume rejection')));
  await page.getByRole('alert').filter({ hasText: 'current resume rejection' }).waitFor();
  assert.equal(await secondAsset.getByTitle('试听', { exact: true }).count(), 1, 'current resume rejection resets controls');
  await screenshot('03-resume-failure');
  assert.deepEqual(errors, []);
  console.log('✓ Inspector, assets and preview reflect the same BGM start/stop state');
  console.log('✓ stale asynchronous resume failure does not stop the newer track');
} catch (error) {
  try { await screenshot(process.env.MOOVN_BASELINE ? 'baseline-failure' : 'failure'); } catch (screenshotError) { console.error(screenshotError); }
  throw error;
} finally {
  await context.close(); await browser.close(); await server.close();
}
