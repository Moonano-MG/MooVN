// Actual browser import/export regressions for asset-looking ordinary text.
// Run with MOOVN_CHROMIUM_PATH=/path/to/chromium node --experimental-strip-types tests/browser-asset-export.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { parseAndDecompressMsvnPackage } from '../src/lib/assetCompressionEngine.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-assets'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
const errors = [];
const phrase = 'moovn-asset://this-is-story-text-not-a-file';
async function importProject(page, project) {
  const payload = Buffer.from(serializeMpvnProject(project));
  await page.locator('input[type=file][accept*="mpvn"]').setInputFiles({ name: 'asset-regression.mpvn', mimeType: 'application/json', buffer: payload });
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite test server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  let page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  const fixture = structuredClone(DEFAULT_PROJECT);
  fixture.title = 'Asset text export regression';
  fixture.nodes[0].dialogues[0].text = phrase;
  await importProject(page, fixture);
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().click();
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML5', exact: true }).click();
  const html = await htmlDownload;
  const htmlPath = resolve(output, 'asset-export.html');
  await html.saveAs(htmlPath);
  assert.match(await readFile(htmlPath, 'utf8'), /moovn-asset:\/\/this-is-story-text-not-a-file/);
  const player = await context.newPage();
  player.on('pageerror', (error) => errors.push(String(error)));
  await player.goto(pathToFileURL(htmlPath).href);
  await player.getByRole('button', { name: '开始游戏', exact: true }).click();
  await player.getByText(phrase, { exact: true }).waitFor();
  await player.screenshot({ path: resolve(output, '01-html-dialogue-text.png') });
  await player.close();

  await page.getByRole('button', { name: '导出工程 (.mpvn)', exact: true }).click();
  const mpvnDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 .mpvn', exact: true }).click();
  const parsedProject = parseMpvnProject(await readFile(await (await mpvnDownload).path(), 'utf8'));
  assert.equal(parsedProject.ok, true, parsedProject.error);
  assert.equal(parsedProject.project.nodes[0].dialogues[0].text, phrase);

  await page.getByRole('button', { name: '导出章节 (.msvn)', exact: true }).click();
  const msvnDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 .msvn', exact: true }).click();
  const parsedChapter = await parseAndDecompressMsvnPackage(await readFile(await (await msvnDownload).path(), 'utf8'));
  assert.equal(parsedChapter.nodes[0].dialogues[0].text, phrase);
  console.log('✓ HTML plays literal asset-looking dialogue; MPVN and MSVN retain it');
  await context.close();

  // A syntactically valid but missing real image reference is still blocked.
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  const missing = structuredClone(DEFAULT_PROJECT);
  missing.title = 'Missing actual asset regression';
  missing.characters = [structuredClone(SAMPLE_PROJECT.characters[0])];
  missing.characters[0].mediaUrl = `moovn-asset://${'a'.repeat(64)}.png`;
  missing.nodes[0].characters = [structuredClone(SAMPLE_PROJECT.nodes[0].characters[0])];
  missing.nodes[0].characters[0].highlight = false;
  missing.nodes[0].characters[0].enterAnimation = 'none';
  await importProject(page, missing);
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().click();
  await page.getByRole('button', { name: '导出 HTML5', exact: true }).click();
  await page.getByText('ERR_ASSET_MISSING', { exact: false }).waitFor();
  await page.getByRole('button', { name: '导出工程 (.mpvn)', exact: true }).click();
  await page.getByRole('button', { name: '导出 .mpvn', exact: true }).click();
  await page.getByRole('status').getByText('导出失败：工程引用外置素材', { exact: false }).waitFor();
  await page.screenshot({ path: resolve(output, '02-missing-media-blocked.png') });
  await context.close();
  assert.deepEqual(errors, []);
  console.log('✓ missing real media fails visibly and portable MPVN remains blocked');
  console.log(`Browser asset regressions passed; screenshots: ${output}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
