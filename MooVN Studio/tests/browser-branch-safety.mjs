// Real-browser regressions for unsupported random branches and choice conditions.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const webEntry = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), webEntry ? '../../MooVN Web' : '..');
const entry = webEntry ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-branch-safety'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
let activePage;
const errors = [];

function fixture(type, condition, hasChoices = true) {
  const project = structuredClone(DEFAULT_PROJECT);
  project.title = `Preview branch safety ${type}`;
  const start = project.nodes[0];
  start.type = type;
  start.title = `Branch ${type}`;
  start.dialogues[0].text = 'ROOT_BRANCH';
  start.nextNodeId = 'target-b';
  start.choices = hasChoices ? [
    { id: 'choice-a', text: 'CONDITIONAL_OPTION', targetNodeId: 'target-a', ...(condition === undefined ? {} : { conditionExpr: condition }) },
    { id: 'choice-b', text: 'OTHER_OPTION', targetNodeId: 'target-b' },
  ] : [];
  if (type === 'timed_choice') {
    start.timedChoiceSeconds = 1;
    start.defaultTimeoutTargetId = 'target-a';
  }
  for (const name of ['a', 'b']) {
    const target = structuredClone(DEFAULT_PROJECT.nodes[0]);
    target.id = `target-${name}`;
    target.type = 'dialogue';
    target.title = `Target ${name}`;
    target.dialogues[0].id = `line-${name}`;
    target.dialogues[0].text = `TARGET_${name.toUpperCase()}`;
    target.choices = [];
    project.nodes.push(target);
  }
  return project;
}

async function openFixture(origin, project, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__moovnOscillatorCount = 0;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.__moovnOscillatorCount += 1;
      return createOscillator.apply(this, args);
    };
  });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${origin}${entry}`);
  const picker = page.locator('input[type=file][accept*=".mpvn"]');
  await picker.setInputFiles({ name: 'branch.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await picker.waitFor({ state: 'detached' });
  return { context, page };
}
async function waitForConditionDraft(page, expected) {
  await waitForBrowserCondition(page, async (value) => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open('moovn-project-storage', 1);
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = await new Promise((resolveEntries, reject) => {
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      request.onsuccess = () => resolveEntries(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return entries.some((entry) => {
      const choice = entry.project?.nodes?.[0]?.choices?.find((item) => item.id === 'choice-a');
      return entry.key.startsWith('draft:') && entry.project?.title === 'Preview branch safety choice' &&
        Boolean(choice) && (choice.conditionExpr ?? null) === value;
    });
  }, expected, `draft condition ${expected}`);
}
async function startPreview(page) {
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('ROOT_BRANCH', { exact: true }).waitFor();
}
async function assertStopped(page, code) {
  const alert = page.getByRole('alert').filter({ hasText: code });
  await alert.waitFor({ timeout: 5000 });
  assert(await alert.isVisible());
  assert.equal(await page.getByRole('button', { name: 'CONDITIONAL_OPTION', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'OTHER_OPTION', exact: true }).count(), 0);
  assert(await page.getByRole('button', { name: '自动', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '快进', exact: true }).isDisabled());
  await page.locator('[data-scene-viewport="player"]').getByText('ROOT_BRANCH', { exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('ROOT_BRANCH', { exact: true }).click();
  assert(await page.locator('[data-scene-viewport="player"]').getByText('ROOT_BRANCH', { exact: true }).isVisible());
  assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).count(), 0);
  assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('TARGET_B', { exact: true }).count(), 0);
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  let { context, page } = await openFixture(origin, fixture('random_branch'));
  assert.equal(await page.getByRole('button', { name: /^随机分支/ }).count(), 0, 'unimplemented random branch should not be offered as a new node');
  assert.equal(await page.getByRole('button', { name: /^多路路由/ }).count(), 0, 'unimplemented switch routing should not be offered as a new node');
  await page.getByTitle('打开节点库').click();
  const quickAdd = page.locator('.canvas-Floating-ui');
  await quickAdd.getByRole('button', { name: '控制', exact: true }).click();
  assert.equal(await quickAdd.getByRole('button', { name: /^随机分支/ }).count(), 0);
  assert.equal(await quickAdd.getByRole('button', { name: /^多路路由/ }).count(), 0);
  assert.equal(await quickAdd.getByRole('button', { name: /^玩家选项/ }).count(), 1);
  await page.getByTitle('打开节点库').click();
  await startPreview(page);
  await assertStopped(page, 'ERR_RANDOM_BRANCH_UNSUPPORTED');
  await page.screenshot({ path: resolve(output, 'random-stopped.png') });
  await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
  assert(await page.getByRole('button', { name: '运行预览', exact: true }).isVisible());
  await context.close();

  ({ context, page } = await openFixture(origin, fixture('random_branch', undefined, false)));
  await startPreview(page);
  await assertStopped(page, 'ERR_RANDOM_BRANCH_UNSUPPORTED');
  await context.close();

  const emptyDialogue = fixture('random_branch');
  emptyDialogue.nodes[0].dialogues = [];
  ({ context, page } = await openFixture(origin, emptyDialogue));
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'ERR_RANDOM_BRANCH_UNSUPPORTED' }).waitFor({ timeout: 5000 });
  assert(await page.getByRole('button', { name: '返回编辑器', exact: true }).isVisible());
  await context.close();

  const autoProject = fixture('random_branch');
  autoProject.nodes[0].unlockedClueTitle = 'SHOULD_NOT_UNLOCK';
  autoProject.nodes[0].bgmId = 'bgm-spring-breeze';
  const intro = structuredClone(DEFAULT_PROJECT.nodes[0]);
  intro.id = 'intro';
  intro.dialogues[0].id = 'intro-line';
  intro.dialogues[0].text = 'INTRO_LINE';
  intro.nextNodeId = autoProject.startNodeId;
  autoProject.nodes.unshift(intro);
  autoProject.startNodeId = intro.id;
  ({ context, page } = await openFixture(origin, autoProject));
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
  const previousSave = await waitForBrowserCondition(page, () => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    const slot = key ? JSON.parse(localStorage.getItem(key))?.['auto-1'] : null;
    return slot?.nodeId === 'intro' ? { key, slot } : false;
  }, null, 'last good auto-save');
  const savedBeforeStop = previousSave.slot;
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await assertStopped(page, 'ERR_RANDOM_BRANCH_UNSUPPORTED');
  const savedAfterStop = await page.evaluate((key) => JSON.parse(localStorage.getItem(key))['auto-1'], previousSave.key);
  assert.deepEqual(savedAfterStop, savedBeforeStop, 'a blocked node must not overwrite the last good auto-save');
  assert.match(await page.getByRole('button', { name: /档案词条/ }).textContent(), /\(0\)/, 'a blocked node must not unlock clues');
  assert.equal(await page.evaluate(() => window.__moovnOscillatorCount), 0, 'a blocked node must not start its BGM');
  await page.getByRole('button', { name: '后退', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('INTRO_LINE', { exact: true }).waitFor();
  await page.waitForTimeout(1800);
  assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_RANDOM_BRANCH_UNSUPPORTED' }).count(), 0, 'backtracking must not silently restart autoplay');
  await context.close();

  const nestedProject = fixture('repeat_loop', undefined, false);
  nestedProject.nodes[0].loopConfig = { repeatCount: 1 };
  nestedProject.nodes[0].childrenNodes = [
    { id: 'nested-random', type: 'random_branch', title: '旧的嵌套随机分支', params: {} },
  ];
  ({ context, page } = await openFixture(origin, nestedProject));
  await startPreview(page);
  await assertStopped(page, 'ERR_RANDOM_BRANCH_UNSUPPORTED');
  assert(await page.getByRole('alert').filter({ hasText: 'nested-random' }).isVisible());
  await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
  const inspector = page.locator('[data-leaf-container="leaf-right"]');
  await inspector.getByText('旧的嵌套随机分支（未实现）', { exact: true }).waitFor();
  await inspector.getByRole('button', { name: '添加积木 / 嵌套容器 (多重添加)', exact: true }).click();
  await inspector.getByRole('button', { name: '控制', exact: true }).click();
  assert.equal(await inspector.getByRole('button', { name: /^随机分支/ }).count(), 0);
  assert.equal(await inspector.getByRole('button', { name: /^多路路由/ }).count(), 0);
  assert.equal(await inspector.getByRole('button', { name: /^玩家选项/ }).count(), 1);
  await context.close();
  console.log('✓ top-level and nested legacy random branches stop visibly; no fallback, autoplay or new unsupported node');

  ({ context, page } = await openFixture(origin, fixture('switch_branch')));
  await startPreview(page);
  await assertStopped(page, 'ERR_SWITCH_BRANCH_UNSUPPORTED');
  await page.screenshot({ path: resolve(output, 'switch-stopped.png') });
  await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
  const typeSelect = page.locator('[data-leaf-container="leaf-right"] select').filter({ has: page.locator('option[value="switch_branch"]') });
  await typeSelect.selectOption('choice');
  await startPreview(page);
  await page.getByRole('button', { name: 'CONDITIONAL_OPTION', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTitle('撤销', { exact: true }).click();
  await startPreview(page);
  await assertStopped(page, 'ERR_SWITCH_BRANCH_UNSUPPORTED');
  await context.close();
  console.log('✓ legacy switch routing stops; deliberate conversion to choice is reversible');

  ({ context, page } = await openFixture(origin, fixture('choice', 'chapterIndex > 5')));
  await startPreview(page);
  await assertStopped(page, 'ERR_CHOICE_CONDITION_UNSUPPORTED');
  await page.screenshot({ path: resolve(output, 'condition-stopped.png') });
  await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
  await page.getByText('chapterIndex > 5', { exact: true }).waitFor();
  await page.getByRole('button', { name: '移除选项条件', exact: true }).click();
  await waitForConditionDraft(page, null);
  await startPreview(page);
  await page.getByRole('button', { name: 'CONDITIONAL_OPTION', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTitle('撤销', { exact: true }).click();
  await waitForConditionDraft(page, 'chapterIndex > 5');
  await startPreview(page);
  await assertStopped(page, 'ERR_CHOICE_CONDITION_UNSUPPORTED');
  await context.close();
  console.log('✓ choice conditions are preserved, visibly blocked and removable with undo');

  ({ context, page } = await openFixture(origin, fixture('dialogue', 'legacy_condition')));
  await startPreview(page);
  await assertStopped(page, 'ERR_CHOICE_CONDITION_UNSUPPORTED');
  await page.getByRole('button', { name: '返回编辑器', exact: true }).click();
  await page.getByText('legacy_condition', { exact: true }).waitFor();
  await page.getByRole('button', { name: '移除选项条件', exact: true }).click();
  await startPreview(page);
  assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_CHOICE_CONDITION_UNSUPPORTED' }).count(), 0);
  await context.close();
  console.log('✓ legacy conditions on other node types are still visible and removable');

  ({ context, page } = await openFixture(origin, fixture('timed_choice', 'chapterIndex > 5')));
  await startPreview(page);
  await assertStopped(page, 'ERR_CHOICE_CONDITION_UNSUPPORTED');
  await page.waitForTimeout(1600);
  assert(await page.locator('[data-scene-viewport="player"]').getByText('ROOT_BRANCH', { exact: true }).isVisible(), 'timed choice must not use an unchecked fallback');
  assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).count(), 0);
  await context.close();
  console.log('✓ timed choice does not silently take an unchecked fallback');

  for (const viewport of [{ width: 900, height: 560 }, { width: 360, height: 640 }]) {
    const narrow = fixture('choice', 'chapterIndex > 5');
    narrow.nodes[0].title = '较长的分支节点名称'.repeat(10);
    ({ context, page } = await openFixture(origin, narrow, viewport));
    if (viewport.width === 360) {
      await page.getByTitle('打开节点库').click();
      const mobileQuickAdd = page.locator('.canvas-Floating-ui').filter({ hasText: '控制' });
      await mobileQuickAdd.getByRole('button', { name: '控制', exact: true }).click();
      assert.equal(await mobileQuickAdd.getByRole('button', { name: /^随机分支/ }).count(), 0);
      assert.equal(await mobileQuickAdd.getByRole('button', { name: /^多路路由/ }).count(), 0);
      assert.equal(await mobileQuickAdd.getByRole('button', { name: /^玩家选项/ }).count(), 1);
      await page.getByTitle('打开节点库').click();
    }
    await startPreview(page);
    const alert = page.getByRole('alert').filter({ hasText: 'ERR_CHOICE_CONDITION_UNSUPPORTED' });
    await alert.waitFor();
    const dimensions = await alert.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    assert(dimensions.scrollWidth <= dimensions.width + 1, `branch alert overflows at ${viewport.width}px`);
    const back = alert.getByRole('button', { name: '返回编辑器', exact: true });
    await back.scrollIntoViewIfNeeded();
    const box = await back.boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'return button must remain reachable');
    await page.screenshot({ path: resolve(output, `condition-${viewport.width}.png`) });
    await context.close();
  }
  console.log('✓ branch warning and return action remain visible at 900×560 and 360×640');

  const normalChoice = fixture('choice', '   ');
  normalChoice.nodes[0].bgmId = 'bgm-spring-breeze';
  ({ context, page } = await openFixture(origin, normalChoice));
  await startPreview(page);
  await waitForBrowserCondition(page, () => window.__moovnOscillatorCount > 0, null, 'normal BGM plays');
  assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_CHOICE_CONDITION_UNSUPPORTED' }).count(), 0);
  await page.getByRole('button', { name: 'CONDITIONAL_OPTION', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).waitFor();
  await context.close();

  ({ context, page } = await openFixture(origin, fixture('timed_choice', undefined)));
  await startPreview(page);
  await page.locator('[data-scene-viewport="player"]').getByText('TARGET_A', { exact: true }).waitFor({ timeout: 5000 });
  await context.close();
  assert.deepEqual(errors, [], 'unexpected browser page errors');
  console.log('✓ unconditional choices and timed fallbacks still work');
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    try { await activePage.screenshot({ path: resolve(output, 'failure.png') }); }
    catch (screenshotError) { console.error('Failure screenshot:', screenshotError); }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await server.close();
}
