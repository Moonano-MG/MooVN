// Real Chromium settings regression; Studio uses a simulated Tauri IPC bridge.
// Native file dialogs, real OS storage failures and cross-process atomicity are not covered.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const web = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), web ? '../../MooVN Web' : '..');
const entry = web ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-settings-import'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
  optimizeDeps: { entries: [web ? 'studio.html' : 'index.html'] },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}${entry}`;
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const key = 'moovn_studio_settings_v3';
const paths = { workspaceRootPath: 'C:/local/MooVN', projectsDirectoryPath: 'C:/local/MooVN/Projects', exportOutputDirectoryPath: 'C:/local/MooVN/Exports', cacheDirectoryPath: 'C:/local/MooVN/Cache', settingsFilePath: 'C:/local/MooVN/Cache/settings.moovn.json' };
const original = { platform: 'windows', ...paths, editorConfig: { autoSaveIntervalSec: 15, coloredNodeCategories: true, defaultScriptLang: 'typescript' }, defaultGameSettings: { textSpeedMs: 32, autoPlayDelayMs: 2000, bgmVolume: 75, sfxVolume: 85, motionLevel: 'subtle' }, performanceConfig: { compressionFormat: 'moovn_lz77', compressionLevel: 5 } };
const imported = { ...structuredClone(original), workspaceRootPath: 'C:/foreign', projectsDirectoryPath: 'C:/foreign/Projects', editorConfig: { autoSaveIntervalSec: 25, coloredNodeCategories: false, defaultScriptLang: 'rust' }, defaultGameSettings: { textSpeedMs: 44, autoPlayDelayMs: 2100, bgmVolume: 12, sfxVolume: 22, motionLevel: 'off' }, performanceConfig: { compressionFormat: 'moovn_lz77', compressionLevel: 7 } };
let context;
let page;
const errors = [];
const mark = (label) => console.log(`✓ ${web ? 'Web' : 'Studio'}: ${label}`);
const screenshot = (name) => page.screenshot({ path: resolve(output, `${web ? 'web' : 'studio'}-${name}.png`) });
const settingsFile = (value, name = 'settings.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const read = () => page.evaluate((k) => localStorage.getItem(k), key);
async function fresh({ raw = JSON.stringify(original), failMain = false, failBackup = false, delayed = false, readError = false } = {}) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(({ key, raw, paths, desktop, failMain, failBackup, delayed, readError }) => {
    localStorage.setItem(key, raw);
    if (desktop) window.__TAURI_INTERNALS__ = { invoke: async (command) => {
      if (command === 'get_workspace_paths') return paths;
      if (command === 'write_workspace_file') return paths.settingsFilePath;
      throw new Error(`Unexpected mocked IPC command: ${command}`);
    } };
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if ((failMain && name === key) || (failBackup && name.startsWith(`${key}.backup.`))) throw new DOMException('quota exceeded', 'QuotaExceededError');
      return originalSet.call(this, name, value);
    };
    const originalRead = FileReader.prototype.readAsText;
    if (delayed) {
      window.__pendingReads = [];
      FileReader.prototype.readAsText = function(file, ...args) { window.__pendingReads.push(() => originalRead.call(this, file, ...args)); };
    }
    if (readError) FileReader.prototype.readAsText = function() { setTimeout(() => this.dispatchEvent(new ProgressEvent('error')), 0); };
  }, { key, raw, paths, desktop: !web, failMain, failBackup, delayed, readError });
  await page.goto(origin);
}
async function workspace() { await page.getByRole('button', { name: '专属路径与设置文件', exact: true }).click(); }
const input = () => page.locator('input[type=file][accept=".json"]');
async function choose(value) { await input().setInputFiles(settingsFile(value)); }
async function openSettings() { await page.getByRole('button', { name: '设置', exact: true }).last().click(); }
const modal = () => page.getByRole('dialog', { name: '设置' });

try {
  if (!web) {
    await fresh(); await workspace();
    await choose(imported);
    await page.getByText('设置已导入本机应用存储', { exact: false }).waitFor();
    let saved = JSON.parse(await read());
    assert.deepEqual(saved.editorConfig, imported.editorConfig);
    assert.deepEqual(saved.defaultGameSettings, imported.defaultGameSettings);
    assert.equal(saved.workspaceRootPath, paths.workspaceRootPath);
    assert.equal(saved.projectsDirectoryPath, paths.projectsDirectoryPath);
    await screenshot('01-valid-import');
    mark('valid import updates preferences but keeps local paths (mock IPC)');

    for (const value of [
      '{"workspaceRootPath":"x"}', '{invalid json',
      JSON.stringify({ ...imported, extra: true }),
      JSON.stringify({ ...imported, editorConfig: { ...imported.editorConfig, autoSaveIntervalSec: -99999 } }),
      ' '.repeat(300 * 1024),
    ]) {
      const before = await read();
      await choose(value);
      await page.getByText(/ERR_SETTINGS_(VALIDATION|JSON|TOO_LARGE)/).first().waitFor();
      assert.equal(await read(), before);
      assert.equal(await page.getByText('设置已导入本机应用存储', { exact: false }).count(), 0);
    }
    await screenshot('02-invalid-import');
    mark('missing, malformed, unknown, out-of-range and oversized files preserve old settings');

    await fresh({ failMain: true }); await workspace();
    const beforeFail = await read();
    await choose(imported);
    await page.getByText('ERR_SETTINGS_STORAGE:', { exact: false }).waitFor();
    assert.equal(await read(), beforeFail);
    assert.equal(await page.getByText('设置已导入本机应用存储', { exact: false }).count(), 0);
    await screenshot('03-quota-failure');
    mark('simulated storage quota failure is not reported as success');

    await fresh({ readError: true }); await workspace();
    await choose(imported);
    await page.getByText('ERR_SETTINGS_READ:', { exact: false }).waitFor();
    assert.equal(await read(), JSON.stringify(original));
    mark('simulated FileReader error leaves stored settings unchanged');

    await fresh({ delayed: true }); await workspace();
    await choose(imported);
    assert.equal(await page.evaluate(() => window.__pendingReads.length), 1);
    await input().dispatchEvent('cancel');
    await page.evaluate(() => window.__pendingReads.shift()());
    await page.waitForTimeout(200);
    assert.equal(await read(), JSON.stringify(original));
    assert.equal(await page.getByText('设置已导入本机应用存储', { exact: false }).count(), 0);
    mark('a native cancel event invalidates the pending reader (event simulated)');

    await fresh({ delayed: true }); await workspace();
    await choose(imported);
    const changed = { ...structuredClone(original), defaultGameSettings: { ...original.defaultGameSettings, bgmVolume: 9 } };
    await page.evaluate(({ key, changed }) => {
      const oldValue = localStorage.getItem(key);
      const newValue = JSON.stringify(changed);
      localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
      window.__pendingReads.shift()();
    }, { key, changed });
    await page.getByText('ERR_SETTINGS_CHANGED:', { exact: false }).waitFor();
    assert.equal(await read(), JSON.stringify(changed));
    await screenshot('04-race-preserved');
    mark('a newer stored value wins a simulated read/import race');

    await fresh({ delayed: true }); await workspace();
    const second = { ...structuredClone(imported), defaultGameSettings: { ...imported.defaultGameSettings, bgmVolume: 33 } };
    await choose(imported); await choose(second);
    assert.equal(await page.evaluate(() => window.__pendingReads.length), 2);
    await page.evaluate(() => window.__pendingReads[1]());
    await page.getByText('设置已导入本机应用存储', { exact: false }).waitFor();
    await page.evaluate(() => window.__pendingReads[0]());
    await page.waitForTimeout(200);
    saved = JSON.parse(await read());
    assert.equal(saved.defaultGameSettings.bgmVolume, 33);
    mark('older file-reader completion cannot overwrite a newer selection');
  }

  const corrupt = '{"workspaceRootPath":"broken"}';
  await fresh({ raw: corrupt });
  await page.getByText('ERR_SETTINGS_CORRUPT:', { exact: false }).first().waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原始设置', exact: true }).first().click();
  const download = await downloadPromise;
  assert.equal(await readFile(await download.path(), 'utf8'), corrupt);
  await openSettings();
  await modal().getByRole('button', { name: '保存设置', exact: true }).click();
  await modal().getByText('ERR_SETTINGS_CORRUPT:', { exact: false }).last().waitFor();
  assert.equal(await read(), corrupt);
  page.once('dialog', (dialog) => dialog.accept());
  await modal().getByRole('button', { name: '恢复默认', exact: true }).click();
  await modal().getByText('已恢复默认；原设置已备份到本机存储', { exact: false }).waitFor();
  const recovered = await page.evaluate((k) => {
    const backupKey = Object.keys(localStorage).find((name) => name.startsWith(`${k}.backup.`));
    return { backupKey, backup: localStorage.getItem(backupKey), main: JSON.parse(localStorage.getItem(k)) };
  }, key);
  assert.equal(recovered.backup, corrupt);
  assert.equal(recovered.main.editorConfig.autoSaveIntervalSec, 15);
  await screenshot('05-corrupt-backup-reset');
  mark('corrupt record downloads exactly, refuses ordinary save and is backed up before explicit reset');

  await fresh({ raw: corrupt, failBackup: true });
  await openSettings();
  page.once('dialog', (dialog) => dialog.accept());
  await modal().getByRole('button', { name: '恢复默认', exact: true }).click();
  await modal().getByText('ERR_SETTINGS_BACKUP:', { exact: false }).waitFor();
  assert.equal(await read(), corrupt);
  mark('simulated backup failure does not reset the original');

  await fresh(); await openSettings();
  const conflict = { ...structuredClone(original), defaultGameSettings: { ...original.defaultGameSettings, bgmVolume: 5 } };
  await page.evaluate(({ key, conflict }) => localStorage.setItem(key, JSON.stringify(conflict)), { key, conflict });
  await modal().getByRole('button', { name: '游戏默认参数', exact: true }).click();
  await modal().getByLabel('立绘动态').selectOption('off');
  await modal().getByRole('button', { name: '保存设置', exact: true }).click();
  await modal().getByText('ERR_SETTINGS_CHANGED:', { exact: false }).waitFor();
  assert.equal(await read(), JSON.stringify(conflict));
  await screenshot('06-modal-stale-draft');
  mark('an open stale settings dialog cannot overwrite a newer value');

  assert.deepEqual(errors, [], 'unexpected page errors');
  console.log(`${web ? 'Web' : 'Studio'} settings browser checks passed; screenshots: ${output}`);
} catch (error) {
  if (page && !page.isClosed()) {
    try { await screenshot('failure'); } catch (screenshotError) { console.error(screenshotError); }
  }
  throw error;
} finally {
  if (context) await context.close();
  await browser.close();
  await server.close();
}
