// Targeted browser regression tests, not full A/B/C or platform acceptance.
// Run: npm run test:e2e (install Playwright Chromium first) or set MOOVN_CHROMIUM_PATH.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { buildStandaloneGameHtml } from '../src/lib/gamePackager.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-smoke'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
let activePage;
const errors = [];
const mark = (message) => console.log(`✓ ${message}`);
const screenshot = (name) => activePage.screenshot({ path: resolve(output, `${name}.png`) });
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...options });
  activePage = await ctx.newPage();
  activePage.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  activePage.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return ctx;
}
async function openSample() {
  await activePage.goto(origin);
  await activePage.getByText('打开入门示例工程', { exact: true }).first().click();
}
function rail(name) { return activePage.locator(`button[title^="${name} (左键"]`); }
async function setMotionOff() {
  await activePage.getByRole('button', { name: '设置', exact: true }).first().click();
  await activePage.getByRole('button', { name: '游戏默认参数', exact: true }).click();
  await activePage.getByLabel('立绘动态').selectOption('off');
  await activePage.getByRole('button', { name: '保存设置' }).click();
  await activePage.getByText('设置已保存').waitFor();
  await activePage.getByRole('button', { name: '取消', exact: true }).last().click();
  await activePage.locator('[data-motion-off="true"]').waitFor();
}
let origin;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite test server did not bind TCP');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // Unsupported example export must actually be blocked, not merely warned.
  let ctx = await context();
  await openSample();
  await activePage.getByRole('button', { name: '导出游戏', exact: true }).first().click();
  assert(await activePage.getByText('HTML 导出已阻止：', { exact: false }).isVisible());
  assert(await activePage.getByRole('button', { name: '导出 HTML5', exact: true }).isDisabled());
  await screenshot('01-html-export-blocked');
  await activePage.getByRole('button', { name: '关闭导出' }).click();
  mark('unsupported HTML export is blocked');

  // A suffix rename preserves content. The separate preview is reviewable,
  // and restoration refuses to overwrite subsequent edits.
  await rail('脚本编辑器').click();
  await activePage.getByText('main.ts', { exact: true }).first().click();
  const code = activePage.locator('textarea[spellcheck="false"]');
  const original = '// comment\n  moovn.text.say("Alice", nested(1, 2));  \nconst x = 4;\n';
  await code.fill(original);
  const tabs = activePage.locator('[title="点击切换文件 · 双击可修改文件名与后缀 (.ts / .js / .cs / .cpp / .rs / .yaml)"]');
  await tabs.filter({ hasText: 'main.ts' }).dblclick();
  const rename = tabs.locator('input');
  await rename.fill('main.cs');
  await rename.press('Enter');
  assert.equal(await code.inputValue(), original);
  await activePage.getByRole('button', { name: 'API 改写预览（实验）' }).click();
  const preview = await activePage.getByLabel('API 改写差异预览').innerText();
  assert.match(preview, /不是语言编译或代码移植/);
  assert.match(preview, /Moovn\.Text\.Say/);
  await screenshot('02-script-rewrite-preview');
  await activePage.getByRole('button', { name: '应用改写' }).click();
  const rewritten = original.replace('moovn.text.say', 'Moovn.Text.Say');
  assert.equal(await code.inputValue(), rewritten);
  await code.fill(rewritten + '// new edit\n');
  assert(await activePage.getByRole('button', { name: '一键还原改写' }).isDisabled());
  await code.fill(rewritten);
  await activePage.getByRole('button', { name: '一键还原改写' }).click();
  assert.equal(await code.inputValue(), original);
  mark('script rename, preview, apply and protected restore');

  // Simulate a native error through the real browser bridge and make sure it
  // remains readable rather than being shown as a short-lived green success.
  await activePage.evaluate(() => {
    window.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('ERR_SAVE_CREATE: simulated disk failure'); } };
  });
  await activePage.getByRole('button', { name: '解析 / 引擎' }).click();
  const scriptError = activePage.getByRole('alert');
  await scriptError.waitFor();
  assert.match(await scriptError.innerText(), /此前操作可能已执行.*ERR_SAVE_CREATE/);
  await activePage.evaluate(() => { delete window.__TAURI_INTERNALS__; });
  await activePage.waitForTimeout(5200);
  assert(await scriptError.isVisible(), 'native failure must stay visible until dismissed');
  await screenshot('02-script-native-error');
  await activePage.getByRole('button', { name: '关闭脚本错误' }).click();
  assert.equal(await scriptError.count(), 0);
  mark('native script error remains visible and is explicitly dismissed (mock IPC)');

  // AI is intercepted: no real credentials or external provider requests.
  await rail('AI 助手').click();
  await activePage.getByRole('button', { name: '接口设置' }).click();
  await activePage.locator('input[type="password"]').fill('sk-test-session-only');
  const storedConfig = await activePage.evaluate(() => localStorage.getItem('moovn_ai_agent_endpoint_v5'));
  assert(!storedConfig.includes('sk-test-session-only'));
  await activePage.getByRole('button', { name: '确认并返回' }).click();
  let intercepted = 0;
  await activePage.route('https://api.openai.com/**', async (route) => {
    intercepted++;
    assert.equal(route.request().headers().authorization, 'Bearer sk-test-session-only');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '```moovn-agent\n[{"type":"create_node","summary":"测试操作","nodeTitle":"Test agent node","nodeType":"dialogue"}]\n```' } }] }) });
  });
  await activePage.getByRole('button', { name: '纯问答' }).click();
  const chat = activePage.locator('textarea[placeholder]').last();
  await chat.fill('test pure chat');
  await activePage.getByRole('button', { name: '发送', exact: true }).click();
  await activePage.getByText('测试操作', { exact: false }).first().waitFor();
  assert.equal(await activePage.getByRole('button', { name: '确认应用' }).count(), 0);
  await activePage.getByRole('button', { name: 'Agent', exact: true }).click();
  assert.equal(await activePage.getByRole('button', { name: '确认应用' }).count(), 0, 'chat response never becomes an action on mode switch');
  await chat.fill('propose an operation');
  await activePage.getByRole('button', { name: '发送', exact: true }).click();
  await activePage.getByRole('button', { name: '确认应用' }).waitFor();
  assert(await activePage.getByText('2 个场景节点').isVisible());
  await activePage.getByRole('button', { name: '确认应用' }).click();
  await activePage.getByText('3 个场景节点').waitFor();
  assert.equal(intercepted, 2);
  mark('pure chat does not create actions; Agent creates a node only on confirmation');
  await ctx.close();

  // 900x560: default docked layout, four experimental floats, modal stacking,
  // and disabling the experiment re-docks rather than deleting panels.
  ctx = await context({ viewport: { width: 900, height: 560 } });
  await openSample();
  const centerWidth = await activePage.locator('[data-leaf-container="leaf-center-top"]').evaluate((el) => el.getBoundingClientRect().width);
  assert(centerWidth >= 320, `default center width was ${centerWidth}px`);
  await rail('脚本编辑器').click({ button: 'right' });
  assert.equal(await activePage.getByTitle('停靠归位至工作区网格').count(), 0);
  await activePage.getByRole('button', { name: '窗口总览' }).click();
  const experiment = activePage.locator('input[type=checkbox]').last();
  assert.equal(await experiment.isChecked(), false);
  await experiment.check();
  await activePage.getByTitle('关闭', { exact: true }).last().click();
  for (const label of ['脚本编辑器', 'AI 助手', '终端控制台', '舞台预览']) await rail(label).click({ button: 'right' });
  const dockButtons = activePage.getByTitle('停靠归位至工作区网格');
  assert.equal(await dockButtons.count(), 4);
  const zIndices = await dockButtons.evaluateAll((elements) => elements.map((element) => {
    let parent = element;
    while (parent && !parent.style.zIndex) parent = parent.parentElement;
    return Number(parent?.style.zIndex);
  }));
  assert(zIndices.every((value) => value >= 100 && value <= 299));
  await activePage.getByRole('button', { name: '导出游戏', exact: true }).click();
  const modalZ = await activePage.getByRole('button', { name: '关闭导出' }).evaluate((button) => {
    let parent = button;
    while (parent && getComputedStyle(parent).position !== 'fixed') parent = parent.parentElement;
    return Number(parent && getComputedStyle(parent).zIndex);
  });
  assert.equal(modalZ, 600);
  await screenshot('03-layout-four-floats-modal');
  await activePage.getByRole('button', { name: '关闭导出' }).click();
  await activePage.keyboard.press('Control+Shift+W');
  await activePage.locator('input[type=checkbox]').last().uncheck();
  await activePage.getByTitle('关闭', { exact: true }).last().click();
  assert.equal(await dockButtons.count(), 0);
  const reDocked = await activePage.locator('[data-leaf-container]').allTextContents();
  for (const label of ['脚本编辑器', 'AI 助手', '终端控制台', '舞台预览']) assert(reDocked.some((text) => text.includes(label)));
  mark('900×560 dock defaults, experimental windows and modal layering');
  await ctx.close();

  // L0 is observed for 10 seconds. Missing layers remain actionable; an
  // uploaded single eye layer still retains the body when motion is off.
  ctx = await context();
  await openSample();
  await rail('舞台预览').click();
  const portrait = activePage.locator('[data-character-placement="place-sample-1"]').first();
  await portrait.locator('img').first().waitFor();
  await activePage.waitForTimeout(1000);
  const before = await portrait.screenshot();
  const observations = await portrait.evaluate(async (element) => {
    const samples = [];
    const start = performance.now();
    await new Promise((done) => {
      function step(now) {
        const r = element.getBoundingClientRect();
        samples.push([r.x, r.y, r.width, r.height, getComputedStyle(element.querySelector('img')).transform]);
        if (now - start >= 10000) done(); else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    return samples;
  });
  const after = await portrait.screenshot();
  assert(observations.length > 50);
  assert.equal(new Set(observations.map((value) => JSON.stringify(value))).size, 1, 'L0 bounds and transform changed');
  assert.equal(createHash('sha256').update(before).digest('hex'), createHash('sha256').update(after).digest('hex'));
  await activePage.getByRole('button', { name: '角色/章节', exact: true }).click();
  for (const text of ['缺少闭眼层，眨眼停用。', '缺少口型 A，说话口型停用。', '缺少口型 B；只有 A 时会重复显示 A。']) {
    assert(await activePage.getByText(text).isVisible());
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+p5kAAAAASUVORK5CYII=', 'base64');
  await activePage.getByLabel('为 示例角色 绑定 eyes_closed').setInputFiles({ name: 'eye.png', mimeType: 'image/png', buffer: png });
  await activePage.getByText('替换 eyes_closed').waitFor();
  assert.equal(await activePage.getByText('缺少闭眼层，眨眼停用。').count(), 0);
  await rail('舞台预览').click();
  await activePage.locator('[data-avatar-level="L1_LAYERED"]').first().waitFor();
  await setMotionOff();
  const body = activePage.locator('[data-avatar-level="L1_LAYERED"] img[alt="示例角色-body"]').first();
  await body.waitFor();
  assert(await body.evaluate((image) => image.complete && image.naturalWidth > 0 && image.currentSrc.startsWith('data:image/png')));
  assert.equal(await activePage.locator('[data-motion-off]').evaluate((element) => element.getAnimations({ subtree: true }).length), 0);
  await screenshot('04-layer-upload-motion-off');
  await activePage.getByRole('button', { name: '运行预览', exact: true }).click();
  assert(await activePage.getByText('这是一个入门示例工程，演示如何布置场景立绘、对白与分支选项。', { exact: true }).last().isVisible(), 'motion-off does not type out the line');
  mark('L0 observed for 10s; missing layer upload and motion-off body');
  await ctx.close();

  // Exercise an actual looping WebM and verify the off setting pauses it.
  ctx = await context();
  await openSample();
  const videoBytes = await activePage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const paint = canvas.getContext('2d');
    const stream = canvas.captureStream(15);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((done) => { recorder.onstop = done; });
    recorder.start(100);
    let frame = 0;
    const interval = setInterval(() => { paint.fillStyle = frame++ % 2 ? '#f00' : '#00f'; paint.fillRect(0, 0, 64, 64); }, 60);
    await new Promise((done) => setTimeout(done, 1200));
    clearInterval(interval); recorder.stop(); await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
  });
  assert(videoBytes.length > 0);
  await activePage.getByRole('button', { name: '角色/章节', exact: true }).click();
  await activePage.locator('input[type=file][accept^="image/*"]').setInputFiles({ name: 'test.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) });
  await activePage.getByText('已设为视频动画', { exact: false }).first().waitFor();
  await rail('舞台预览').click();
  const video = activePage.locator('video').first();
  await video.waitFor();
  await activePage.waitForFunction(() => { const element = document.querySelector('video'); return element && !element.paused && element.currentTime > 0; });
  await setMotionOff();
  assert(await video.evaluate((element) => element.paused));
  const pausedTime = await video.evaluate((element) => element.currentTime);
  await activePage.waitForTimeout(350);
  assert.equal(await video.evaluate((element) => element.currentTime), pausedTime);
  mark('real WebM plays, then pauses when motion is off');
  await ctx.close();

  // System reduced-motion must be honoured even with the default editor setting.
  ctx = await context({ reducedMotion: 'reduce' });
  await openSample();
  await activePage.locator('[data-motion-off="true"]').waitFor();
  assert.equal(await activePage.locator('[data-motion-off]').evaluate((element) => element.getAnimations({ subtree: true }).length), 0);
  mark('system reduced-motion is applied');
  await ctx.close();

  // Execute an exported HTML file with malicious project/save text in Chromium.
  ctx = await context({ viewport: { width: 1100, height: 700 } });
  const project = structuredClone(DEFAULT_PROJECT);
  project.id = 'moovn-e2e-xss';
  const payload = '<img src=x onerror=window.__xssHit=1>';
  project.title = '</script>' + payload;
  project.nodes[0].dialogues[0].text = 'Hello ' + payload;
  const html = buildStandaloneGameHtml(project, { backgrounds: [], characters: [] });
  await activePage.route(`${origin}/__export-test`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await activePage.addInitScript(() => {
    const value = '<img src=x onerror=window.__xssHit=1>';
    localStorage.setItem('moovn_standalone_saves_moovn-e2e-xss', JSON.stringify({ '1-0': { chapterTitle: value, savedAt: value, nodeTitle: value, speakerName: value, textPreview: value } }));
  });
  await activePage.goto(`${origin}/__export-test`);
  await activePage.getByRole('button', { name: '开始游戏' }).click();
  await activePage.locator('#top-hud').getByRole('button', { name: '读档', exact: true }).click();
  await activePage.getByRole('button', { name: '夹 1', exact: true }).click();
  assert((await activePage.locator('#modal-body').innerText()).includes(payload));
  assert.equal(await activePage.locator('#modal-body img').count(), 0);
  assert.equal(await activePage.evaluate(() => window.__xssHit), undefined);
  await activePage.locator('#modal-overlay').getByRole('button', { name: '关闭' }).click();
  await activePage.getByRole('button', { name: '历史记录' }).click();
  assert((await activePage.locator('#modal-body').innerText()).includes('Hello ' + payload));
  assert.equal(await activePage.locator('#modal-body img').count(), 0);
  assert.equal(await activePage.evaluate(() => window.__xssHit), undefined);
  await screenshot('05-html-text-nodes');
  mark('HTML dialogue, save-slot and backlog payloads remain inert text');
  await ctx.close();
  assert.deepEqual(errors, [], 'uncaught browser errors');
  console.log(`Browser smoke passed; screenshots: ${output}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    try { await screenshot('failure'); } catch (screenshotError) { console.error('Failure screenshot:', screenshotError); }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await server.close();
}
