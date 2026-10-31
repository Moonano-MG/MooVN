// Targeted real-browser regressions. No external AI request or native IPC is used.
// Run with: MOOVN_CHROMIUM_PATH=/path/to/chromium node --experimental-strip-types tests/browser-p0.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-p0'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
const errors = [];
const observe = (page) => page.on('pageerror', (error) => errors.push(String(error)));
const screenshot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`) });
const storageKey = 'moovn_workspace_layout_v2';
const rail = (page, name) => page.locator(`button[title^="${name} (左键"]`);

async function waitForDraft(page, lineId, value) {
  await waitForBrowserCondition(page, async ({ lineId, value }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('moovn-project-storage', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((entry) => entry.key.startsWith('draft:') && entry.project.nodes.some((node) => node.dialogues.some((line) => line.id === lineId && line.text === value)));
  }, { lineId, value }, `draft dialogue ${lineId}`);
}

async function waitForSprites(page, firstSprite, otherSprite) {
  await waitForBrowserCondition(page, async ({ firstSprite, otherSprite }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('moovn-project-storage', 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.some((entry) => entry.key.startsWith('draft:') && entry.project.nodes.some((node) =>
      node.characters.some((c) => c.id === 'place-sample-1' && c.spriteId === firstSprite) &&
      node.characters.some((c) => c.id === 'other-placement' && c.spriteId === otherSprite)));
  }, { firstSprite, otherSprite }, 'draft character placements');
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite test server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // Corrupted persisted tree is backed up and a usable default is shown.
  const corrupt = JSON.stringify({ splitRoot: { kind: 'leaf', id: 'bad', tabs: null, activeTab: 'canvas' }, floatingWindows: [] });
  let context = await browser.newContext({ viewport: { width: 900, height: 560 }, acceptDownloads: true });
  let page = await context.newPage(); observe(page);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: corrupt });
  await page.goto(origin);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  await page.getByText('损坏的布局已备份为', { exact: false }).waitFor();
  assert(await page.locator('[data-leaf-container="leaf-center-top"]').isVisible());
  const recovery = await page.evaluate(({ key }) => {
    const backup = Object.keys(localStorage).find((name) => name.startsWith(`${key}.invalid.`));
    return { backup, content: backup && localStorage.getItem(backup), active: localStorage.getItem(key) };
  }, { key: storageKey });
  assert.equal(recovery.content, corrupt);
  assert.equal(JSON.parse(recovery.active).version, 2);
  await screenshot(page, '01-corrupt-layout-recovered');
  await context.close();

  // An empty stored value is corruption too, not an absent preference.
  context = await browser.newContext({ viewport: { width: 900, height: 560 } });
  page = await context.newPage(); observe(page);
  await page.addInitScript((key) => localStorage.setItem(key, ''), storageKey);
  await page.goto(origin);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  await page.getByText('损坏的布局已备份为', { exact: false }).waitFor();
  const emptyRecovery = await page.evaluate((key) => {
    const backup = Object.keys(localStorage).find((name) => name.startsWith(`${key}.invalid.`));
    return { backup, content: backup && localStorage.getItem(backup), active: localStorage.getItem(key) };
  }, storageKey);
  assert(emptyRecovery.backup);
  assert.equal(emptyRecovery.content, '');
  assert.equal(JSON.parse(emptyRecovery.active).version, 2);
  await context.close();

  // If backup cannot be written, never overwrite the original; offer a real download.
  context = await browser.newContext({ viewport: { width: 900, height: 560 }, acceptDownloads: true });
  page = await context.newPage(); observe(page);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, content) {
      if (name.startsWith(`${key}.invalid.`)) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, name, content);
    };
  }, { key: storageKey, value: corrupt });
  await page.goto(origin);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  await page.getByText('本次未覆盖原始布局', { exact: false }).waitFor();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), corrupt);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原始布局' }).click();
  const download = await downloadPromise;
  assert.equal(await download.failure(), null);
  assert.equal(await readFile(await download.path(), 'utf8'), corrupt);
  await screenshot(page, '02-layout-backup-failed');
  await context.close();
  console.log('✓ corrupt layout recovers, preserves its original, and backup failures do not overwrite it');

  // The actual file picker imports a new copy and the real browser IndexedDB retains the original.
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage(); observe(page);
  await page.goto(origin);
  const original = structuredClone(DEFAULT_PROJECT);
  original.id = `existing-${crypto.randomUUID()}`;
  original.title = 'ORIGINAL-PROJECT';
  await page.evaluate(async (project) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('moovn-project-storage', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots', { keyPath: 'key' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({ key: `saved:${project.id}`, project, updatedAt: Date.now() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    localStorage.setItem('moovn_studio_projects_v3', JSON.stringify([{ id: project.id, title: project.title, author: project.author, version: project.version, path: `browser://${project.id}.mpvn`, updatedAt: '', chaptersCount: project.chapters.length, nodesCount: project.nodes.length }]));
  }, original);
  const importPicker = page.locator('input[type=file][accept*=".mpvn"]');
  await importPicker.setInputFiles({ name: 'copy.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(original)) });
  // The editor toolbar exists behind the launcher, so waiting for it is not
  // enough: the shortcut is ignored until FileReader finishes and it closes.
  await importPicker.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('moovn_studio_projects_v3') || '[]').length === 2, null, { timeout: 12000 });
  const records = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('moovn-project-storage', 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    db.close(); return rows.filter((entry) => entry.key.startsWith('saved:'));
  });
  assert.equal(records.length, 2);
  assert.deepEqual(records.find((record) => record.key === `saved:${original.id}`).project, original);
  const copy = records.find((record) => record.key !== `saved:${original.id}`).project;
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.nodes[0].id, original.nodes[0].id);
  await screenshot(page, '03-import-copy-saved');
  await context.close();
  console.log('✓ imported same-ID project saves as an independent browser project');

  // AI actions and data egress are exercised against an intercepted provider.
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage(); observe(page);
  const legacySecret = 'sk-legacy-browser-test';
  await page.addInitScript((secret) => localStorage.setItem('moovn_ai_agent_endpoint_v5', JSON.stringify({ apiKey: secret, baseUrl: `https://api.openai.com/v1?key=${secret}`, modelName: 'test' })), legacySecret);
  await page.goto(origin);
  await page.getByText('已清理旧配置中的密钥或不安全地址', { exact: false }).waitFor();
  assert(!(await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'))).includes(legacySecret), 'startup cleans old credentials before the AI panel opens');
  await screenshot(page, '04-ai-startup-cleanup');
  await page.getByRole('button', { name: '关闭接口配置提示' }).click();
  const fixture = structuredClone(SAMPLE_PROJECT);
  fixture.nodes[0].dialogues.push({ ...fixture.nodes[0].dialogues[0], id: 'line-second', text: 'second original' });
  fixture.characters.push({ ...fixture.characters[0], id: 'other-character', name: '另一个角色' });
  fixture.nodes[0].characters.push({ ...fixture.nodes[0].characters[0], id: 'other-placement', characterId: 'other-character', name: '另一个角色' });
  await page.locator('input[type=file][accept*=".mpvn"]').setInputFiles({ name: 'agent-fixture.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(fixture)) });
  await page.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
  await rail(page, 'AI 助手').click();
  assert(!(await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'))).includes(legacySecret));
  await page.getByRole('button', { name: '接口设置' }).click();
  const url = page.locator('input[placeholder="https://api.openai.com/v1"]');
  const key = page.locator('input[type=password]');
  const fakeKey = 'sk-session-browser-test';
  await key.fill(fakeKey);
  await url.fill(`https://api.openai.com/v1?token=${fakeKey}`);
  let stored = await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'));
  assert(!stored.includes(fakeKey));
  assert(!stored.includes('?token='));
  await url.fill('https://api.openai.com/v1');
  await key.fill('private/key+value');
  await url.fill('https://api.openai.com/v1/private%2Fkey%2Bvalue/%ZZ');
  await page.getByText('接口地址包含当前会话密钥', { exact: false }).waitFor();
  stored = await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'));
  assert(!stored.includes('private%2Fkey'));
  await page.getByRole('button', { name: '确认并返回' }).click();
  assert(await url.isVisible(), 'invalid configuration cannot be confirmed');
  await url.fill('https://api.openai.com/v1');
  await key.fill(fakeKey);
  await page.getByRole('button', { name: '确认并返回' }).click();

  const requests = [];
  let reply = '';
  let failure = false;
  await page.route('https://api.openai.com/**', async (route) => {
    requests.push(JSON.parse(route.request().postData()));
    assert.equal(route.request().headers().authorization, `Bearer ${fakeKey}`);
    await route.fulfill(failure
      ? { status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: `echo ${fakeKey} PRIVATE` }) }
      : { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: reply } }] }) });
  });
  const chat = page.locator('textarea[placeholder]').last();
  const send = async (text) => { await chat.fill(text); await page.getByRole('button', { name: '发送', exact: true }).click(); };
  reply = '```moovn-agent\n[{"type":"create_node","summary":"chat must not apply"}]\n```';
  await send('纯问答测试');
  await page.getByText('chat must not apply', { exact: false }).first().waitFor();
  assert(!JSON.stringify(requests[0]).includes(fixture.title));
  assert(!JSON.stringify(requests[0]).includes('line-second'));
  assert.match(requests[0].messages[0].content, /随机分支.*多路路由.*条件表达式.*不支持/);
  assert.equal(await page.getByRole('button', { name: '确认应用' }).count(), 0);

  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '确认应用' }).count(), 0, 'switching modes must not activate a chat reply');
  reply = '```moovn-agent\n[{"type":"update_dialogue","summary":"缺少台词目标","text":"WRONG"},{"type":"set_expression","summary":"缺少角色目标","spriteId":"char-yukina-2"}]\n```';
  await send('提出没有目标的操作');
  await page.getByText('缺少台词目标', { exact: false }).first().waitFor();
  const buttons = page.getByRole('button', { name: '确认应用' });
  assert.equal(await buttons.count(), 2);
  assert(await buttons.nth(0).isDisabled());
  assert(await buttons.nth(1).isDisabled());
  assert(!JSON.stringify(requests[1]).includes(fixture.title));
  await screenshot(page, '04-agent-missing-targets-disabled');

  await page.getByRole('checkbox', { name: /允许 Agent 发送工程 ID/ }).check();
  reply = '```moovn-agent\n[{"type":"update_dialogue","summary":"只改第二句","dialogueId":"line-second","text":"second updated"}]\n```';
  await send('只修改第二句');
  await page.getByText('只改第二句', { exact: false }).first().waitFor();
  assert(JSON.stringify(requests[2]).includes(fixture.title));
  assert(JSON.stringify(requests[2]).includes('line-second'));
  const valid = page.getByRole('button', { name: '确认应用' }).last();
  assert(await valid.isEnabled());
  assert(await page.getByText('second original', { exact: false }).first().isVisible());
  assert(await page.getByText('second updated', { exact: false }).first().isVisible());
  await screenshot(page, '05-agent-exact-diff');
  await valid.click();
  await page.getByRole('button', { name: '已应用' }).waitFor();
  await waitForDraft(page, 'line-second', 'second updated');
  await page.getByTitle('撤销', { exact: true }).click();
  await waitForDraft(page, 'line-second', 'second original');
  assert.equal(await page.getByRole('button', { name: '已应用' }).count(), 0, 'an undone suggestion must not still claim it is applied');
  assert(await page.getByRole('button', { name: '确认应用' }).last().isEnabled());

  reply = '```moovn-agent\n[{"type":"set_expression","summary":"只改一个角色","characterId":"char-sample-1","spriteId":"char-yukina-2"}]\n```';
  await send('切换选定角色的差分');
  await page.getByText('只改一个角色', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: '确认应用' }).last().click();
  await page.getByRole('button', { name: '已应用' }).last().waitFor();
  await waitForSprites(page, 'char-yukina-2', 'char-yukina-1');
  await page.getByTitle('撤销', { exact: true }).click();
  await waitForSprites(page, 'char-yukina-1', 'char-yukina-1');
  console.log('✓ exact dialogue and character targets, full diff and one-step undo; ambiguous actions disabled');

  // A separately created node has one undo step and cannot replace an existing connection.
  reply = '```moovn-agent\n[{"type":"create_node","summary":"创建独立节点","nodeTitle":"atomic-agent-node","nodeType":"dialogue"}]\n```';
  await send('请新增一个节点');
  await page.getByText('atomic-agent-node', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: '确认应用' }).last().click();
  await page.getByRole('button', { name: '已应用' }).last().waitFor();
  await page.getByText('3 个场景节点').waitFor();
  await page.getByTitle('撤销', { exact: true }).click();
  await page.getByText('2 个场景节点').waitFor();
  console.log('✓ Agent-created independent node is reverted by one undo');

  // Changing the project after a suggestion must invalidate the action before it can run.
  reply = '```moovn-agent\n[{"type":"update_dialogue","summary":"过期建议测试","dialogueId":"line-second","text":"MUST NOT APPLY"}]\n```';
  await send('提出一个将变过期的建议');
  await page.getByText('过期建议测试', { exact: false }).first().waitFor();
  const staleButton = page.getByRole('button', { name: '确认应用' }).last();
  assert(await staleButton.isEnabled());
  const card = page.locator('.vn-node-card').filter({ hasText: '序幕：夕阳教室' }).first();
  const box = await card.boundingBox();
  assert(box, 'expected the selected canvas node to be visible');
  await page.mouse.move(box.x + 70, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 22, { steps: 3 });
  await page.mouse.up();
  await page.getByText('工程或选中节点已变化，请重新请求建议', { exact: false }).last().waitFor();
  assert(await staleButton.isDisabled());
  await waitForDraft(page, 'line-second', 'second original');
  console.log('✓ changing the project disables stale Agent suggestions');

  // Provider failures never display a body that might echo a key or private text.
  await page.getByRole('button', { name: '纯问答', exact: true }).click();
  failure = true;
  await send('触发假 401');
  await page.getByText('HTTP 401：服务商拒绝请求', { exact: false }).waitFor();
  assert(!(await page.locator('body').innerText()).includes(fakeKey));
  assert(!(await page.locator('body').innerText()).includes('PRIVATE'));
  stored = await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'));
  assert(!stored.includes(fakeKey));
  await screenshot(page, '06-ai-redacted-error');
  failure = false;
  reply = `provider echo ${fakeKey}`;
  await send('触发成功响应中的密钥回显');
  await page.getByText('provider echo [已隐藏]', { exact: false }).first().waitFor();
  assert(!(await page.locator('body').innerText()).includes(fakeKey));
  await context.close();

  // Failure to erase a legacy key must be reported rather than claiming success.
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage(); observe(page);
  await page.addInitScript((secret) => {
    const key = 'moovn_ai_agent_endpoint_v5';
    localStorage.setItem(key, JSON.stringify({ apiKey: secret, baseUrl: 'https://api.openai.com/v1' }));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, legacySecret);
  await page.goto(origin);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  await rail(page, 'AI 助手').click();
  await page.getByText('旧接口配置含不安全内容，但清理失败', { exact: false }).first().waitFor();
  assert((await page.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'))).includes(legacySecret));
  assert(!(await page.locator('body').innerText()).includes(legacySecret));
  await screenshot(page, '07-ai-cleanup-failed');
  await context.close();
  assert.deepEqual(errors, [], 'unexpected browser page errors');
  console.log('✓ legacy credentials scrubbed or cleanup failure reported; URLs fail closed and 401 body is not echoed');
  console.log(`Browser P0 regressions passed; screenshots: ${output}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
