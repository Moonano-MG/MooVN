// Real browser regression for the numeric operand editor. This does not certify runtime math semantics.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-math'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}`);
  const project = structuredClone(DEFAULT_PROJECT);
  project.title = 'Math editor operand test';
  project.nodes[0].type = 'math_operation';
  project.nodes[0].logicConfig = { targetVar: 'chapterIndex', mathOp: '+=', operandValue: 1 };
  await page.locator('input[type=file][accept*="mpvn"]').setInputFiles({ name: 'math.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
  const input = page.getByText('运算数值 / 元素内容', { exact: true }).locator('..').locator('input');
  await input.waitFor();
  assert.equal(await input.inputValue(), '1');
  await input.fill('7');
  assert.equal(await input.inputValue(), '7', 'editing the operand must not be replaced by the old value');
  const waitForOperandDraft = (expected) => waitForBrowserCondition(page, async (expectedValue) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('moovn-project-storage', 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((entry) => entry.key.startsWith('draft:') && entry.project.nodes[0].logicConfig?.operandValue === expectedValue);
  }, expected, `math operand draft ${expected}`);
  await waitForOperandDraft(7);
  await input.focus();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.pressSequentially('-3.5');
  assert.equal(await input.inputValue(), '-3.5', 'typing a negative decimal must work character by character');
  await input.fill('not-a-number');
  await input.blur();
  await page.getByText('数值无效，已保留上一次有效值。', { exact: true }).waitFor();
  assert.equal(await input.inputValue(), '-3.5');
  await waitForOperandDraft(-3.5);
  await page.screenshot({ path: resolve(output, '01-operand-edited.png') });
  assert.deepEqual(errors, []);
  await context.close();

  const arrayContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const arrayPage = await arrayContext.newPage();
  arrayPage.on('pageerror', (error) => errors.push(String(error)));
  await arrayPage.goto(`http://127.0.0.1:${address.port}`);
  const arrayProject = structuredClone(DEFAULT_PROJECT);
  arrayProject.title = 'Array editor operand test';
  arrayProject.nodes[0].type = 'array_operation';
  arrayProject.nodes[0].logicConfig = { targetVar: 'inventory', arrayAction: 'push', operandValue: 'old' };
  await arrayPage.locator('input[type=file][accept*="mpvn"]').setInputFiles({ name: 'array.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(arrayProject)) });
  await arrayPage.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
  const arrayInput = arrayPage.getByText('运算数值 / 元素内容', { exact: true }).locator('..').locator('input');
  await arrayInput.fill('new item');
  assert.equal(await arrayInput.inputValue(), 'new item');
  await waitForBrowserCondition(arrayPage, async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('moovn-project-storage', 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((entry) => entry.key.startsWith('draft:') && entry.project.nodes[0].logicConfig?.operandValue === 'new item');
  }, null, 'array operand draft');
  assert.deepEqual(errors, []);
  await arrayContext.close();
  console.log('✓ math and array operand edits persist in the actual browser draft');
} finally {
  if (browser) await browser.close();
  await server.close();
}
