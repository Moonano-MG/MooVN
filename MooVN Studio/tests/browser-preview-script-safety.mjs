// Real-browser regressions for preview script safety. These checks deliberately
// distinguish the normal auto-1 checkpoint from the old fake script auto-0.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const webEntry = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), webEntry ? '../../MooVN Web' : '..');
const entry = webEntry ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-preview-script-safety'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
let origin;
let currentContext;
let currentPage;
const pageErrors = [];
const failures = [];

function fixture(source, options = {}) {
  const project = structuredClone(DEFAULT_PROJECT);
  project.title = 'Preview script safety';
  const start = project.nodes[0];
  start.id = 'script-node';
  start.title = 'Script node';
  start.type = options.type || 'script';
  start.customScript = source;
  start.scriptLanguage = options.language || 'typescript';
  start.dialogues[0].text = 'SCRIPT_LINE';
  start.choices = [];
  start.nextNodeId = 'after';
  const after = structuredClone(start);
  after.id = 'after';
  after.title = 'After';
  after.type = 'dialogue';
  after.customScript = undefined;
  after.dialogues[0].id = 'line-after';
  after.dialogues[0].text = 'AFTER_LINE';
  after.nextNodeId = null;
  project.nodes = [start, after];
  project.startNodeId = start.id;
  return project;
}

async function openFixture(project, viewport = { width: 1366, height: 768 }) {
  currentContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await currentContext.addInitScript(() => {
    window.__moovnOscillatorCount = 0;
    window.__moovnVideoPlayCount = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.tagName === 'VIDEO') window.__moovnVideoPlayCount += 1;
      return play.apply(this, args);
    };
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.__moovnOscillatorCount += 1;
      return createOscillator.apply(this, args);
    };
  });
  currentPage = await currentContext.newPage();
  currentPage.on('pageerror', (error) => pageErrors.push(String(error)));
  await currentPage.goto(`${origin}${entry}`);
  const picker = currentPage.locator('input[type=file][accept*=".mpvn"]');
  await picker.setInputFiles({ name: 'script-safety.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await picker.waitFor({ state: 'detached' });
  await currentPage.getByRole('button', { name: '运行预览', exact: true }).click();
  const viewportElement = currentPage.locator('[data-scene-viewport="player"]');
  await viewportElement.waitFor();
  if (project.nodes[0].dialogues.length) {
    await viewportElement.getByText(project.nodes[0].dialogues[0].text, { exact: true }).waitFor();
  }
  return currentPage;
}

async function readSaves(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    return key ? { key, slots: JSON.parse(localStorage.getItem(key)) } : null;
  });
}
async function waitForAutoSave(page) {
  return waitForBrowserCondition(page, () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    const slots = key && JSON.parse(localStorage.getItem(key));
    return slots?.['auto-1'] ? { key, slots } : false;
  }, null, 'normal auto-1 checkpoint');
}
async function advance(page, text) {
  await page.locator('[data-scene-viewport="player"]').getByText(text, { exact: true }).click();
}
async function assertStopped(page) {
  const alert = page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' });
  assert(await alert.isVisible(), 'unsupported script must show ERR_PREVIEW_SCRIPT_UNSUPPORTED');
  assert(await page.getByRole('button', { name: '自动', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '快进', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '返回编辑器', exact: true }).isVisible());
  await advance(page, 'SCRIPT_LINE');
  assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('AFTER_LINE', { exact: true }).count(), 0);
}
async function runCase(name, fn) {
  if (process.env.MOOVN_CASE && process.env.MOOVN_CASE !== name) return;
  currentPage = undefined;
  currentContext = undefined;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures.push({ name, message: error instanceof Error ? error.message : String(error) });
    console.error(`✗ ${name}: ${error instanceof Error ? error.stack : String(error)}`);
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({ path: resolve(output, `failure-${name}.png`) });
    }
  } finally {
    if (currentContext) await currentContext.close();
  }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const [name, source, language] of [
    ['line-comment', '// moovn.save:create("FAKE")\n', 'typescript'],
    ['block-comment', '/* moovn::save::create("FAKE") */\n// more comment', 'cpp'],
    ['nested-rust-comment', '/* outer /* moovn::save::create("FAKE") */ still a comment */', 'rust'],
  ]) {
    await runCase(name, async () => {
      const page = await openFixture(fixture(source, { language }));
      const save = await waitForAutoSave(page);
      console.log(`  ${name} slots=${JSON.stringify(Object.keys(save.slots))}`);
      assert(!('auto-0' in save.slots), 'comments must not trigger a script save in auto-0');
      assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).count(), 0);
      await advance(page, 'SCRIPT_LINE');
      await page.locator('[data-scene-viewport="player"]').getByText('AFTER_LINE', { exact: true }).waitFor();
    });
  }

  for (const [name, source, options] of [
    ['default-standard-api', '// default node script\nmoovn.text.say("旁白", "执行自定义脚本节点");\nmoovn.save.create("Auto_Slot");\n', {}],
    ['string-literal', 'const text = "moovn::save::create(FAKE)";', { language: 'javascript' }],
    ['unreachable-host-code', 'if (false) { moovn::save::create("FAKE"); }', { language: 'cpp' }],
    ['unterminated-comment', '/* moovn.save:create("FAKE")', {}],
    ['unknown-instruction', 'moovn.unsupported.operation("test");', {}],
  ]) {
    await runCase(name, async () => {
      const page = await openFixture(fixture(source, options));
      const save = await readSaves(page);
      console.log(`  ${name} slots=${JSON.stringify(save ? Object.keys(save.slots) : [])}; script warning=${await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).count()}`);
      await assertStopped(page);
      assert.equal(await readSaves(page), null, 'a blocked initial script node must not write any save');
      if (name === 'default-standard-api') {
        await page.screenshot({ path: resolve(output, 'standard-api-stopped.png') });
        await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
        const inspector = page.locator('[data-leaf-container="leaf-right"]');
        await inspector.getByRole('button', { name: '脚本', exact: true }).click();
        const editor = inspector.locator('textarea[placeholder*="编写自定义"]');
        assert.equal(await editor.inputValue(), source, 'the unsupported script must remain intact in the editor');
        assert(await inspector.getByText('预览不执行自定义脚本或函数调用', { exact: false }).isVisible());
        await page.screenshot({ path: resolve(output, 'editor-script-warning.png') });
        await editor.fill('// moovn.save:create("fake")\n');
        await page.getByRole('button', { name: '运行预览', exact: true }).click();
        await page.locator('[data-scene-viewport="player"]').getByText('SCRIPT_LINE', { exact: true }).waitFor();
        const commentSave = await waitForAutoSave(page);
        assert(!('auto-0' in commentSave.slots));
        assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).count(), 0);
        await page.getByRole('button', { name: '返回', exact: true }).click();
        await page.getByTitle('撤销', { exact: true }).click();
        assert.equal(await editor.inputValue(), source, 'editing the script remains undoable');
        await page.getByRole('button', { name: '运行预览', exact: true }).click();
        await page.locator('[data-scene-viewport="player"]').getByText('SCRIPT_LINE', { exact: true }).waitFor();
        await assertStopped(page);
        assert.deepEqual((await readSaves(page)).slots['auto-1'], commentSave.slots['auto-1']);
      }
    });
  }

  await runCase('function-call', async () => {
    const project = fixture(undefined, { type: 'function_call' });
    project.nodes[0].logicConfig = { targetVar: '', operandValue: '', functionName: 'onEvent', functionArgs: 'ctx' };
    const page = await openFixture(project);
    await assertStopped(page);
    assert.equal(await readSaves(page), null);
  });

  await runCase('nested-custom-code', async () => {
    const project = fixture(undefined, { type: 'repeat_loop' });
    project.nodes[0].childrenNodes = [{ id: 'child-script', type: 'script', title: 'Nested', params: {}, customCode: 'moovn.save.create("A");' }];
    const page = await openFixture(project);
    await assertStopped(page);
    assert(await page.getByRole('alert').filter({ hasText: 'child-script' }).isVisible());
    assert.equal(await readSaves(page), null);
  });

  await runCase('warning-escapes-untrusted-identifiers', async () => {
    const project = fixture(undefined, { type: 'repeat_loop' });
    project.nodes[0].childrenNodes = [{ id: 'nested-<img src=x onerror=alert(1)>', type: 'script', title: 'Nested', params: {}, customCode: 'const secret = "test-secret-not-for-warning";' }];
    const page = await openFixture(project);
    const alert = page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' });
    assert(await alert.isVisible());
    assert.match(await alert.textContent(), /nested-<img/);
    assert.equal(await alert.locator('img').count(), 0, 'node identifiers must be rendered as text');
    assert(!String(await alert.textContent()).includes('test-secret-not-for-warning'), 'script contents must not be echoed in the warning');
    assert.equal(await readSaves(page), null);
  });

  await runCase('empty-nested-script', async () => {
    const project = fixture(undefined, { type: 'repeat_loop' });
    project.nodes[0].childrenNodes = [{ id: 'empty-script', type: 'script', title: 'Nested script', params: {} }];
    const page = await openFixture(project);
    await assertStopped(page);
    assert(await page.getByRole('alert').filter({ hasText: 'empty-script' }).isVisible());
    assert.equal(await readSaves(page), null);
  });

  await runCase('visual-bridge-block', async () => {
    const project = fixture(undefined, { type: 'dialogue' });
    project.nodes[0].visualBlocks = [{ id: 'bridge', category: 'script', kind: 'call_bridge_script', params: { code: 'moovn.save.create("A")' } }];
    const page = await openFixture(project);
    await assertStopped(page);
    assert.equal(await readSaves(page), null);
  });

  await runCase('last-good-checkpoint-and-back', async () => {
    const project = fixture('moovn.save.create("Auto_Slot");', { type: 'math_operation' });
    const blocked = project.nodes[0];
    blocked.logicConfig = { targetVar: 'chapterIndex', mathOp: '+=', operandValue: 100 };
    blocked.unlockedClueTitle = 'MUST_NOT_UNLOCK';
    blocked.bgmId = 'bgm-spring-breeze';
    blocked.toastMessage = 'MUST_NOT_TOAST';
    blocked.screenTextConfig = { text: 'MUST_NOT_BANNER', x: 50, y: 50, fontSize: 20, color: '#fff', align: 'center', bgOverlay: 'none', animation: 'fade', durationMs: 1000 };
    project.characters = [structuredClone(SAMPLE_PROJECT.characters[0])];
    blocked.characters = [structuredClone(SAMPLE_PROJECT.nodes[0].characters[0])];
    blocked.characters[0].mediaType = 'video';
    blocked.characters[0].mediaUrl = 'data:video/webm;base64,AA==';
    const intro = structuredClone(project.nodes[1]);
    intro.id = 'intro';
    intro.title = 'Intro';
    intro.dialogues[0].id = 'line-intro';
    intro.dialogues[0].text = 'INTRO_LINE';
    intro.nextNodeId = blocked.id;
    project.nodes.unshift(intro);
    project.startNodeId = intro.id;
    const page = await openFixture(project);
    const previous = await waitForAutoSave(page);
    const oldAuto = previous.slots['auto-1'];
    await page.getByRole('button', { name: '自动', exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('SCRIPT_LINE', { exact: true }).waitFor({ timeout: 7000 });
    const actual = await readSaves(page);
    console.log(`  before=${JSON.stringify({ node: oldAuto.nodeId, chapterIndex: oldAuto.variablesSnapshot.chapterIndex })}; after=${JSON.stringify({ node: actual?.slots['auto-1']?.nodeId, chapterIndex: actual?.slots['auto-1']?.variablesSnapshot.chapterIndex, clues: actual?.slots['auto-1']?.clueSnapshot, oscillator: await page.evaluate(() => window.__moovnOscillatorCount) })}`);
    await assertStopped(page);
    assert.deepEqual(actual.slots['auto-1'], oldAuto, 'the blocked node must not overwrite the last good auto-save');
    assert(!('auto-0' in actual.slots));
    assert.match(await page.getByRole('button', { name: /档案词条/ }).textContent(), /\(0\)/);
    assert.equal(await page.evaluate(() => window.__moovnOscillatorCount), 0, 'blocked node must not start BGM');
    assert.equal(await page.locator('[data-character-placement]').count(), 0, 'blocked node must not mount character media');
    assert.equal(await page.evaluate(() => window.__moovnVideoPlayCount), 0, 'blocked node must not play video');
    assert.equal(await page.getByText('MUST_NOT_TOAST').count(), 0, 'blocked node must not display its toast action');
    assert.equal(await page.getByText('MUST_NOT_BANNER').count(), 0, 'blocked node must not display its screen-text action');
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    assert(await page.getByRole('alert').filter({ hasText: '当前节点尚未执行' }).isVisible());
    assert.deepEqual((await readSaves(page)).slots['auto-1'], oldAuto);
    await page.getByRole('button', { name: '关闭', exact: true }).last().click();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
    await page.waitForTimeout(1900);
    assert(await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).isVisible(), 'back must not restart autoplay');
    await page.screenshot({ path: resolve(output, 'last-good-checkpoint-back.png') });
  });

  await runCase('timer-and-empty-dialogue', async () => {
    const timed = fixture('moovn.save.create("A");', { type: 'timed_choice' });
    timed.nodes[0].timedChoiceSeconds = 1;
    timed.nodes[0].defaultTimeoutTargetId = 'after';
    timed.nodes[0].choices = [{ id: 'choice', text: 'TAKE_AFTER', targetNodeId: 'after' }];
    const page = await openFixture(timed);
    await assertStopped(page);
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('AFTER_LINE', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'TAKE_AFTER' }).count(), 0);
    assert.equal(await readSaves(page), null);
    await currentContext.close();
    currentContext = undefined;

    const empty = fixture('moovn.save.create("A");');
    empty.nodes[0].dialogues = [];
    const emptyPage = await openFixture(empty);
    assert(await emptyPage.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).isVisible());
    assert(await emptyPage.getByRole('button', { name: '返回编辑器', exact: true }).isVisible());
    assert.equal(await readSaves(emptyPage), null);
  });

  await runCase('existing-auto-zero-preserved', async () => {
    const project = fixture('moovn.save.create("A");');
    const intro = structuredClone(project.nodes[1]);
    intro.id = 'intro';
    intro.title = 'Intro';
    intro.dialogues[0].id = 'line-intro';
    intro.dialogues[0].text = 'INTRO_LINE';
    intro.nextNodeId = 'script-node';
    project.nodes.unshift(intro);
    project.startNodeId = intro.id;
    const page = await openFixture(project);
    const original = await waitForAutoSave(page);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const oldZero = { ...original.slots['auto-1'], slotKey: 'auto-0', slotIndex: 0, textPreview: 'existing old slot' };
    const futureSlot = { slotKey: '1-2', previewSnapshotVersion: 999, payload: { preserve: true } };
    const seeded = { 'auto-0': oldZero, 'auto-1': original.slots['auto-1'], '1-2': futureSlot };
    await page.evaluate(({ key, slots }) => localStorage.setItem(key, JSON.stringify(slots)), { key: original.key, slots: seeded });
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
    assert.deepEqual((await readSaves(page)).slots, seeded, 'opening preview must preserve previous slots');
    await advance(page, 'INTRO_LINE');
    await page.locator('[data-scene-viewport="player"]').getByText('SCRIPT_LINE', { exact: true }).waitFor();
    await assertStopped(page);
    assert.deepEqual((await readSaves(page)).slots, seeded, 'blocked script must not overwrite old or future slots');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
    const afterBack = await readSaves(page);
    assert.deepEqual(afterBack.slots['auto-0'], oldZero);
    assert.deepEqual(afterBack.slots['1-2'], futureSlot);
  });

  await runCase('load-existing-blocked-slot', async () => {
    const project = fixture('moovn.save.create("A");');
    const intro = structuredClone(project.nodes[1]);
    intro.id = 'intro';
    intro.title = 'Intro';
    intro.dialogues[0].id = 'line-intro';
    intro.dialogues[0].text = 'INTRO_LINE';
    intro.nextNodeId = 'script-node';
    project.nodes.unshift(intro);
    project.startNodeId = intro.id;
    const page = await openFixture(project);
    const original = await waitForAutoSave(page);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const savedBlocked = { ...original.slots['auto-1'], slotKey: '1-1', tabId: '1', slotIndex: 1,
      nodeId: 'script-node', nodeTitle: 'Script node', textPreview: 'SCRIPT_LINE' };
    const seeded = { ...original.slots, '1-1': savedBlocked };
    await page.evaluate(({ key, slots }) => localStorage.setItem(key, JSON.stringify(slots)), { key: original.key, slots: seeded });
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('Script node', { exact: true }).click();
    await page.locator('[data-scene-viewport="player"]').getByText('SCRIPT_LINE', { exact: true }).waitFor();
    await assertStopped(page);
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled(), 'loading clears old history');
    assert.deepEqual((await readSaves(page)).slots, seeded, 'loading a blocked old slot must not rewrite it');
  });

  await runCase('narrow-warning', async () => {
    for (const viewport of [{ width: 900, height: 560 }, { width: 360, height: 640 }]) {
      const page = await openFixture(fixture('moovn.save.create("Auto_Slot");'), viewport);
      const alert = page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' });
      const back = page.getByRole('button', { name: '返回编辑器', exact: true });
      assert(await alert.isVisible());
      assert(await back.isVisible());
      const bounds = await back.boundingBox();
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, 'return action must stay in the viewport');
      await page.screenshot({ path: resolve(output, `script-warning-${viewport.width}.png`) });
      await currentContext.close();
      currentContext = undefined;
    }
  });

  if (pageErrors.length) failures.push({ name: 'browser-page-errors', message: pageErrors.join('\n') });
  if (failures.length) {
    console.error(`\n${failures.length} case(s) failed:\n${failures.map((f) => `- ${f.name}: ${f.message}`).join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}
