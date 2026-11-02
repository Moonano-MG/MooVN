// Chromium regression for the supported standalone HTML story subset. This does
// not validate Tauri, Android, audio, scripts, or the native Engine player.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { buildStandaloneGameHtml } from '../src/lib/gamePackager.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-standalone-saves'));
await mkdir(output, { recursive: true });
const project = structuredClone(DEFAULT_PROJECT);
project.id = 'standalone-save-regression';
project.characters = [structuredClone(SAMPLE_PROJECT.characters[0])];
project.variables = [{ key: 'score', label: 'score', type: 'number', value: 0 }];
const makeNode = (id, text, type = 'dialogue') => ({
  ...structuredClone(DEFAULT_PROJECT.nodes[0]), id, title: id, type,
  transition: 'none', dialogues: [{ ...structuredClone(DEFAULT_PROJECT.nodes[0].dialogues[0]), id: `${id}-line`, text }],
  choices: [], nextNodeId: null,
});
const first = makeNode('root', 'Choose a path', 'choice');
first.choices = [{ id: 'choice-a', text: 'Take the path', targetNodeId: 'b', affectionCharacterId: project.characters[0].id, affectionDelta: 5, setVarKey: 'score', setVarValue: 10 }];
const b = makeNode('b', 'Second scene');
b.dialogues.push({ ...b.dialogues[0], id: 'b-line-2', text: 'Second line' });
const c = makeNode('c', 'Third scene');
b.nextNodeId = c.id;
project.nodes = [first, b, c];
project.startNodeId = first.id;
const html = buildStandaloneGameHtml(project, { backgrounds: [], characters: [] });
const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const key = `moovn_standalone_saves_${project.id}`;
const errors = [];
let page;
let context;
async function fresh(init) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  if (init) await page.addInitScript(init, { key });
  await page.goto(origin);
}
const saveData = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
const quickSave = () => page.getByRole('button', { name: '快速存档', exact: true }).click();
const start = () => page.getByRole('button', { name: '开始游戏', exact: true }).click();
const selectPath = () => page.getByRole('button', { name: 'Take the path', exact: true }).click();
const back = () => page.locator('#dlg-wrap').getByRole('button', { name: '后退', exact: true }).click();
const saveMenu = () => page.locator('#top-hud').getByRole('button', { name: '存档', exact: true }).click();
const loadMenu = () => page.locator('#top-hud').getByRole('button', { name: '读档', exact: true }).click();
const screenshot = (name) => page.screenshot({ path: resolve(output, `${name}.png`) });
const closeModal = () => page.locator('#modal-overlay').getByRole('button', { name: '关闭', exact: true }).click();

try {
  await fresh();
  await start();
  await selectPath();
  await quickSave();
  let saves = await saveData();
  assert.equal(saves['quick-0'].variables.score, 10);
  assert.equal(saves['quick-0'].affection[project.characters[0].id], 55);
  await saveMenu();
  await page.locator('#modal-body .save-slot').first().click();
  await closeModal();
  await back();
  await quickSave();
  saves = await saveData();
  await screenshot(process.env.MOOVN_BASELINE ? 'baseline-back-state' : '01-back-state');
  console.log(`Back to ${saves['quick-0'].nodeId}: score=${saves['quick-0'].variables.score}, affection=${saves['quick-0'].affection[project.characters[0].id]}`);
  assert.equal(saves['quick-0'].nodeId, 'root');
  assert.equal(saves['quick-0'].variables.score, 0, 'back must restore variables before the choice');
  assert.equal(saves['quick-0'].affection[project.characters[0].id], 50, 'back must restore affection before the choice');
  assert.equal(saves['auto-0'].nodeId, 'root', 'auto checkpoint should follow a deliberate back action');
  assert.equal(saves['auto-0'].variables.score, 0);
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  const backlog = await page.locator('#modal-body').innerText();
  assert(backlog.includes('Choose a path'));
  assert(!backlog.includes('Second scene'), 'history must not contain a scene rolled back out of');
  assert.equal(backlog.split('Choose a path').length - 1, 1, 'returning to a line should not duplicate it');
  await closeModal();
  console.log('✓ choice state, backlog and automatic checkpoint roll back together');

  await selectPath();
  saves = await saveData();
  assert.equal(saves['auto-0'].nodeId, 'b');
  assert.equal(saves['auto-0'].variables.score, 10);
  await page.getByRole('button', { name: '返回主菜单', exact: true }).click();
  await start();
  saves = await saveData();
  assert.equal(saves['auto-0'].nodeId, 'root');
  assert.equal(saves['auto-0'].variables.score, 0, 'new game must start with fresh variables');
  assert.equal(saves['auto-0'].affection[project.characters[0].id], 50);
  assert.equal(saves['1-0'].variables.score, 10, 'new game must not delete manual slots');
  console.log('✓ new game resets only the current session');

  await loadMenu();
  await page.locator('#modal-body .save-slot').first().click();
  await back();
  await quickSave();
  saves = await saveData();
  assert.equal(saves['quick-0'].nodeId, 'b', 'load must discard history from the previous session');
  assert.equal(saves['quick-0'].variables.score, 10);
  assert.equal(saves['quick-0'].affection[project.characters[0].id], 55);
  await screenshot('02-load-restores-state');
  await page.reload();
  await page.getByRole('button', { name: '读取存档', exact: true }).click();
  await page.locator('#modal-body .save-slot').first().click();
  await quickSave();
  saves = await saveData();
  assert.equal(saves['quick-0'].nodeId, 'b');
  assert.equal(saves['quick-0'].variables.score, 10);
  console.log('✓ manual slot survives reload, restores state and clears old history');

  await page.waitForFunction(() => document.querySelector('#dlg-text')?.textContent === 'Second scene');
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await page.waitForTimeout(1800);
  await quickSave();
  saves = await saveData();
  assert.equal(saves['quick-0'].dialogueIndex, 0, 'turning off autoplay must cancel its queued timer');
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await loadMenu();
  await page.waitForTimeout(1800);
  await closeModal();
  await quickSave();
  saves = await saveData();
  assert.equal(saves['quick-0'].dialogueIndex, 0, 'an open save modal must not advance in the background');
  console.log('✓ autoplay cancellation and modal pause do not advance invisibly');

  const corrupt = { '1-0': { slotKey: '1-0', futureField: { preserve: true } } };
  await fresh(({ key }) => localStorage.setItem(key, JSON.stringify({ '1-0': { slotKey: '1-0', futureField: { preserve: true } } })));
  await start();
  await saveMenu();
  await page.locator('#modal-body .save-slot').first().click();
  await page.getByText('损坏或版本不支持', { exact: false }).first().waitFor();
  saves = await saveData();
  assert.deepEqual(saves['1-0'], corrupt['1-0'], 'unknown or corrupt slots must not be overwritten');
  await screenshot('03-invalid-slot-preserved');
  console.log('✓ corrupt/future individual slot is visible and preserved');

  await fresh(({ key }) => localStorage.setItem(key, '{bad json'));
  await start();
  await page.getByText('存档读取失败', { exact: false }).first().waitFor();
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), '{bad json');
  await screenshot('04-invalid-root-preserved');
  console.log('✓ invalid storage root is not replaced');

  await fresh(({ key }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  });
  await start();
  await page.getByText('存档写入失败', { exact: false }).first().waitFor();
  await quickSave();
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), null);
  assert(!(await page.locator('#toast-banner').innerText()).includes('已快速存档'));
  console.log('✓ simulated quota failure never reports successful save');

  // Simulate a storage backend with a larger quota than our own safety limit.
  // A valid root just below the limit must not become an unreadable oversized root.
  await fresh(({ key }) => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    window.__initialSaveRoot = JSON.stringify({ futureSlot: 'x'.repeat(16 * 1024 * 1024 - 50) });
    window.__memorySaveRoot = window.__initialSaveRoot;
    Storage.prototype.getItem = function(name) { return name === key ? window.__memorySaveRoot : get.call(this, name); };
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__memorySaveRoot = String(value);
      else set.call(this, name, value);
    };
  });
  await start();
  await screenshot(process.env.MOOVN_BASELINE_LIMIT ? 'baseline-oversize-write' : '05-size-limit');
  assert.equal(await page.evaluate(() => window.__memorySaveRoot === window.__initialSaveRoot), true, 'writing beyond the read limit must preserve the prior root');
  assert.match(await page.locator('#toast-banner').innerText(), /过大|超出/);
  console.log('✓ oversized output is refused before writing, even with a larger storage quota');
  assert.deepEqual(errors, []);
  console.log(`Standalone save checks passed; screenshots: ${output}`);
} catch (error) {
  if (page && !page.isClosed()) {
    try { await screenshot(process.env.MOOVN_BASELINE ? 'baseline-failure' : 'failure'); } catch (screenshotError) { console.error(screenshotError); }
  }
  throw error;
} finally {
  if (context) await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
