// Real browser regression: new containers must not add unrequested content or scene effects.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-containers'));
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
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  await page.getByRole('button', { name: '添加节点', exact: true }).click();
  const menu = page.locator('.canvas-Floating-ui').filter({ hasText: '循环逻辑' });
  await menu.getByRole('button', { name: '循环逻辑', exact: true }).click();
  await menu.getByRole('button', { name: /重复循环/ }).click();
  await page.getByText('3 个场景节点', { exact: true }).waitFor();
  const getDraftNode = async (nested) => {
    return waitForBrowserCondition(page, async (expectNested) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('moovn-project-storage', 1);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      db.close();
      const node = rows.filter((entry) => entry.key.startsWith('draft:')).flatMap((entry) => entry.project.nodes).find((item) => item.type === 'repeat_loop');
      return node && (!expectNested || node.childrenNodes?.some((child) => child.type === 'if_else_container')) ? node : false;
    }, nested, nested ? 'nested container draft' : 'container draft');
  };
  let node = await getDraftNode(false);
  assert.deepEqual(node.childrenNodes, [], 'new top-level container should not contain a shake or sample dialogue');
  assert.equal(node.backgroundId, '');
  assert.equal(node.bgmId, '');
  assert.deepEqual(node.characters, []);

  await page.getByRole('button', { name: '添加积木 / 嵌套容器 (多重添加)' }).first().click();
  await page.getByRole('button', { name: /如果否则.*C型槽/ }).last().click();
  node = await getDraftNode(true);
  const child = node.childrenNodes.find((entry) => entry.type === 'if_else_container');
  assert.deepEqual(child.childrenNodes, []);
  assert.deepEqual(child.elseChildrenNodes, []);
  await page.screenshot({ path: resolve(output, '01-empty-container.png') });
  assert.deepEqual(errors, []);
  await context.close();
  console.log('✓ new top-level and nested containers have empty slots and no inherited scene effects');
} finally {
  if (browser) await browser.close();
  await server.close();
}
