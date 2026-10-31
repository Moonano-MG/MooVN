// End-to-end regressions for preview history, save/load, restart and timed choices.
// Run against either the Studio or the shared Web entry, using real imported projects.
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
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-preview-state'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
const errors = [];
const failures = [];
let browser;
let origin;
let activePage;

function fixture() {
  const project = structuredClone(DEFAULT_PROJECT);
  project.title = 'Preview state regression';
  project.characters = [structuredClone(SAMPLE_PROJECT.characters[0])];
  project.variables = [{ key: 'score', label: 'Score', type: 'number', value: 0 }];
  const make = (id, text) => {
    const node = structuredClone(DEFAULT_PROJECT.nodes[0]);
    node.id = id;
    node.title = `Node ${id}`;
    node.dialogues[0].id = `${id}-line`;
    node.dialogues[0].text = text;
    node.choices = [];
    return node;
  };
  const rootNode = make('root', 'ROOT_LINE');
  rootNode.type = 'choice';
  rootNode.choices = [{ id: 'take', text: 'TAKE_BRANCH', targetNodeId: 'b', affectionCharacterId: project.characters[0].id, affectionDelta: 5, setVarKey: 'score', setVarValue: 10 }];
  const b = make('b', 'B_LINE');
  b.type = 'math_operation';
  b.logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
  b.unlockedClueTitle = 'CLUE_B';
  b.unlockedClueDesc = 'Description B';
  b.nextNodeId = 'c';
  const c = make('c', 'C_LINE');
  c.type = 'math_operation';
  c.logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 100 };
  c.unlockedClueTitle = 'CLUE_C';
  c.unlockedClueDesc = 'Description C';
  c.nextNodeId = null;
  project.nodes = [rootNode, b, c];
  project.startNodeId = rootNode.id;
  return project;
}
function legacySlot(tabId, slotIndex) {
  return {
    slotKey: `${tabId}-${slotIndex}`, tabId, slotIndex, savedAt: '2026-10-31 12:00:00',
    chapterTitle: 'Chapter', nodeId: 'b', nodeTitle: 'Node b', dialogueIndex: 0,
    speakerName: '旁白', textPreview: 'B_LINE', backgroundId: '',
    affectionSnapshot: { 'char-sample-1': 55 }, customAttrSnapshot: { 'char-sample-1': { trust: 2 } },
    variablesSnapshot: { score: 11 },
  };
}
async function readRawSaves(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    return key ? localStorage.getItem(key) : null;
  });
}
async function openFixture(project, initialSaves) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${origin}${entry}`);
  const picker = page.locator('input[type=file][accept*=".mpvn"]');
  await picker.setInputFiles({ name: 'preview-state.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await picker.waitFor({ state: 'detached' });
  if (initialSaves !== undefined) {
    // Import assigns a fresh ID. Start an isolated preview once to discover its
    // real storage key, then close it before seeding the fixture's existing saves.
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    const saveKey = await waitForBrowserCondition(page, () =>
      Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_')) || false,
    null, 'imported preview save key');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: saveKey, raw: initialSaves });
  }
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  return { context, page };
}
async function nodeVisible(page, text) {
  await page.locator('[data-scene-viewport="player"]').getByText(text, { exact: true }).waitFor({ timeout: 5000 });
}
async function advance(page, text) {
  await page.locator('[data-scene-viewport="player"]').getByText(text, { exact: true }).click();
}
async function slotWhen(page, nodeId, scores, description) {
  return waitForBrowserCondition(page, ({ nodeId, scores }) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    const slot = key ? JSON.parse(localStorage.getItem(key))?.['auto-1'] : null;
    return slot?.nodeId === nodeId && (!scores || scores.includes(slot.variablesSnapshot?.score)) ? slot : false;
  }, { nodeId, scores }, description, 6000);
}
async function reachedB(page) {
  await nodeVisible(page, 'ROOT_LINE');
  await page.getByRole('button', { name: 'TAKE_BRANCH', exact: true }).click();
  await nodeVisible(page, 'B_LINE');
  await slotWhen(page, 'b', [11], 'B state after choice');
}
async function reachedC(page) {
  await reachedB(page);
  await advance(page, 'B_LINE');
  await nodeVisible(page, 'C_LINE');
  await slotWhen(page, 'c', [111], 'C state after increment');
}
async function runCase(name, makeProject, check, initialSaves) {
  if (process.env.MOOVN_CASE && !name.includes(process.env.MOOVN_CASE)) return;
  const { context, page } = await openFixture(makeProject(), initialSaves);
  try {
    await check(page);
    console.log(`✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.stack || error}`);
    console.error(`✗ ${name}: ${error.message}`);
    await page.screenshot({ path: resolve(output, `${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png`) });
  } finally {
    await context.close();
  }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  await runCase('back restores node entry state and clues', fixture, async (page) => {
    await reachedC(page);
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'B_LINE');
    const slot = await slotWhen(page, 'b', [11, 112], 'settled B state after back');
    const clues = await page.getByRole('button', { name: /档案词条/ }).textContent();
    console.log('  back observation:', JSON.stringify({ score: slot.variablesSnapshot.score, affection: slot.affectionSnapshot['char-sample-1'], clues }));
    await page.screenshot({ path: resolve(output, 'back-state.png') });
    assert.equal(slot.variablesSnapshot.score, 11, 'back should restore B, not apply B again to C state');
    assert.match(clues, /\(1\)/, 'back should restore the clue set at B');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    const rootSlot = await slotWhen(page, 'root', null, 'root after second back');
    assert.equal(rootSlot.variablesSnapshot.score, 0);
    assert.equal(rootSlot.affectionSnapshot['char-sample-1'], 50);
    assert.match(await page.getByRole('button', { name: /档案词条/ }).textContent(), /\(0\)/);
  });

  await runCase('load restores state without replay and clears stale history', fixture, async (page) => {
    await reachedB(page);
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key && JSON.parse(localStorage.getItem(key))?.['1-1']?.nodeId === 'b';
    }, null, 'manual B save');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await advance(page, 'B_LINE');
    await nodeVisible(page, 'C_LINE');
    await slotWhen(page, 'c', [111], 'C before loading B');
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('Node b', { exact: true }).click();
    await nodeVisible(page, 'B_LINE');
    const clues = await page.getByRole('button', { name: /档案词条/ }).textContent();
    const backDisabled = await page.getByRole('button', { name: '后退', exact: true }).isDisabled();
    const autoBeforeAdvance = await slotWhen(page, 'c', [111], 'previous auto-save preserved after load');
    await page.screenshot({ path: resolve(output, 'load-state.png') });
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    const slot = await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key ? JSON.parse(localStorage.getItem(key))?.['1-2'] || false : false;
    }, null, 'manual snapshot of loaded state');
    console.log('  load observation:', JSON.stringify({ score: slot.variablesSnapshot.score, clues, backDisabled, previousAuto: autoBeforeAdvance.nodeId }));
    assert.equal(slot.variablesSnapshot.score, 11, 'loading a node must not apply its effect again');
    assert.equal(slot.affectionSnapshot['char-sample-1'], 55);
    assert.deepEqual(slot.clueSnapshot, [{ title: 'CLUE_B', desc: 'Description B' }]);
    assert.match(clues, /\(1\)/, 'loading must restore saved clues');
    assert(backDisabled, 'history from the prior timeline must be cleared on load');
  });

  await runCase('versioned preview save survives closing and reopening preview', fixture, async (page) => {
    await reachedB(page);
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key && JSON.parse(localStorage.getItem(key))?.['1-1']?.previewSnapshotVersion === 1;
    }, null, 'versioned B save');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('status').filter({ hasText: '已保留现有自动存档' }).waitFor();
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('Node b', { exact: true }).click();
    await nodeVisible(page, 'B_LINE');
    assert.equal(await page.getByRole('button', { name: '继续读取旧存档', exact: true }).count(), 0);
    assert.match(await page.getByRole('button', { name: /档案词条/ }).textContent(), /\(1\)/);
    await page.getByRole('button', { name: /档案词条/ }).click();
    await page.getByText('Description B', { exact: true }).waitFor();
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    const loaded = await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key ? JSON.parse(localStorage.getItem(key))?.['1-2'] || false : false;
    }, null, 'reopened and re-saved state');
    assert.equal(loaded.variablesSnapshot.score, 11);
    assert.deepEqual(loaded.clueSnapshot, [{ title: 'CLUE_B', desc: 'Description B' }]);
  });

  await runCase('new game resets progress and history', fixture, async (page) => {
    await reachedC(page);
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    const slot = await slotWhen(page, 'root', null, 'new-game state');
    const clues = await page.getByRole('button', { name: /档案词条/ }).textContent();
    console.log('  new-game observation:', JSON.stringify({ score: slot.variablesSnapshot.score, affection: slot.affectionSnapshot['char-sample-1'], clues }));
    await page.screenshot({ path: resolve(output, 'new-game-state.png') });
    assert.equal(slot.variablesSnapshot.score, 0);
    assert.equal(slot.affectionSnapshot['char-sample-1'], 50);
    assert.match(clues, /\(0\)/);
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled());
  });

  await runCase('timed fallback keeps back history', () => {
    const project = fixture();
    project.nodes[0].type = 'timed_choice';
    project.nodes[0].timedChoiceSeconds = 1;
    project.nodes[0].defaultTimeoutTargetId = 'b';
    return project;
  }, async (page) => {
    await nodeVisible(page, 'B_LINE');
    const enabled = await page.getByRole('button', { name: '后退', exact: true }).isEnabled();
    console.log('  timeout observation:', JSON.stringify({ backEnabled: enabled }));
    assert(enabled, 'a timeout transition should be represented in history');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
  });

  await runCase('initial node effect runs once in StrictMode', () => {
    const project = fixture();
    project.nodes[0].type = 'math_operation';
    project.nodes[0].choices = [];
    project.nodes[0].logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    const slot = await slotWhen(page, 'root', [1, 2], 'initial math state');
    console.log('  initial effect observation:', JSON.stringify({ score: slot.variablesSnapshot.score }));
    assert.equal(slot.variablesSnapshot.score, 1);
  });

  await runCase('self loop is a fresh visit and back is a restore', () => {
    const project = fixture();
    project.nodes[0].type = 'math_operation';
    project.nodes[0].choices = [];
    project.nodes[0].logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
    project.nodes[0].nextNodeId = 'root';
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [1], 'initial self-loop state');
    await advance(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [2], 'first self-loop entry');
    await advance(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [3], 'second self-loop entry');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await slotWhen(page, 'root', [2], 'self-loop back restores previous state');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await slotWhen(page, 'root', [1], 'self-loop back restores initial state');
  });

  await runCase('multiple dialogue lines do not re-enter the node', () => {
    const project = fixture();
    const rootNode = project.nodes[0];
    rootNode.type = 'math_operation';
    rootNode.choices = [];
    rootNode.logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
    rootNode.dialogues.push({ ...rootNode.dialogues[0], id: 'root-second', text: 'ROOT_SECOND' });
    rootNode.nextNodeId = 'b';
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [1], 'initial multi-line state');
    await advance(page, 'ROOT_LINE');
    await nodeVisible(page, 'ROOT_SECOND');
    await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      const slot = key ? JSON.parse(localStorage.getItem(key))?.['auto-1'] : null;
      return slot?.dialogueIndex === 1 && slot.variablesSnapshot.score === 1;
    }, null, 'second dialogue snapshot');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [1], 'back within a node');
    await advance(page, 'ROOT_LINE');
    await nodeVisible(page, 'ROOT_SECOND');
    await advance(page, 'ROOT_SECOND');
    await nodeVisible(page, 'B_LINE');
    await slotWhen(page, 'b', [2], 'destination effect runs once');
  });

  await runCase('timed choice snapshots resume and pause in save modal', () => {
    const project = fixture();
    project.nodes[0].type = 'timed_choice';
    project.nodes[0].timedChoiceSeconds = 6;
    project.nodes[0].defaultTimeoutTargetId = 'b';
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    const countdown = page.getByText(/限时抉择剩余：\d+ 秒/);
    await page.getByText('限时抉择剩余：4 秒', { exact: true }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: '存档', exact: true }).click();
    const pausedAt = await countdown.textContent();
    await page.waitForTimeout(1200);
    assert.equal(await countdown.textContent(), pausedAt, 'save/load UI must pause the countdown');
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    const saved = await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key ? JSON.parse(localStorage.getItem(key))?.['1-1'] || false : false;
    }, null, 'timed choice save');
    assert.equal(saved.timedRemainingSnapshot, 4);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: 'TAKE_BRANCH', exact: true }).click();
    await nodeVisible(page, 'B_LINE');
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    const afterBack = await countdown.textContent();
    assert.match(afterBack, /剩余：[34] 秒/, 'back must not restart the full six seconds');
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('Node root', { exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    assert.equal(await countdown.textContent(), '限时抉择剩余：4 秒');
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled());
  });

  await runCase('settings effects restore without reopening the panel', () => {
    const project = fixture();
    project.nodes[0].type = 'dialogue';
    project.nodes[0].choices = [];
    project.nodes[0].nextNodeId = 'settings';
    const settings = structuredClone(project.nodes[0]);
    settings.id = 'settings';
    settings.title = 'Node settings';
    settings.type = 'game_settings_modify';
    settings.dialogues[0].id = 'settings-line';
    settings.dialogues[0].text = 'SETTINGS_LINE';
    settings.settingsActionConfig = { textSpeedMs: 40, openSettingsPanel: true };
    settings.nextNodeId = 'c';
    project.nodes.splice(1, 0, settings);
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await advance(page, 'ROOT_LINE');
    await nodeVisible(page, 'SETTINGS_LINE');
    await page.getByText('游戏环境设置', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-scene-viewport="player"] input[type=range]').inputValue(), '40');
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await advance(page, 'SETTINGS_LINE');
    await nodeVisible(page, 'C_LINE');
    await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('[data-scene-viewport="player"] input[type=range]').fill('50');
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'SETTINGS_LINE');
    assert.equal(await page.getByText('游戏环境设置', { exact: true }).count(), 0, 'restore must not reopen a one-shot panel');
    await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await page.locator('[data-scene-viewport="player"] input[type=range]').inputValue(), '40');
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await page.locator('[data-scene-viewport="player"] input[type=range]').inputValue(), '24');
  });

  await runCase('restart from the same start node applies its effect once', () => {
    const project = fixture();
    project.nodes[0].type = 'math_operation';
    project.nodes[0].choices = [];
    project.nodes[0].logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
    project.nodes[0].nextNodeId = 'root';
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [1], 'initial start node effect');
    await advance(page, 'ROOT_LINE');
    await slotWhen(page, 'root', [2], 'same-node progress before restart');
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await nodeVisible(page, 'ROOT_LINE');
    const result = await slotWhen(page, 'root', [1], 'same-node restart');
    assert.equal(result.variablesSnapshot.score, 1);
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled());
  });

  const oldAuto = legacySlot('auto', 1);
  const oldManual = legacySlot('1', 1);
  const legacyRaw = JSON.stringify({ 'auto-1': oldAuto, '1-1': oldManual });
  await runCase('legacy saves require consent and opening preview preserves auto save', fixture, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('status').filter({ hasText: '已保留现有自动存档' }).waitFor();
    assert.equal(await readRawSaves(page), legacyRaw, 'opening a preview must not erase an old auto-save');
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '旧版预览存档未完整记录词条' }).waitFor();
    await page.screenshot({ path: resolve(output, 'legacy-warning.png') });
    assert.equal(await readRawSaves(page), legacyRaw);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert(await page.getByRole('button', { name: '继续游戏', exact: true }).isVisible());
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.getByRole('button', { name: '继续读取旧存档', exact: true }).click();
    await nodeVisible(page, 'B_LINE');
    assert.match(await page.getByRole('button', { name: /档案词条/ }).textContent(), /\(0\)/);
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled());
    assert.equal(await readRawSaves(page), legacyRaw, 'legacy auto-save remains untouched until progression');
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    const copied = await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      return key ? JSON.parse(localStorage.getItem(key))?.['1-2'] || false : false;
    }, null, 'legacy state copied to a new manual slot');
    assert.equal(copied.customAttrSnapshot['char-sample-1'].trust, 2);
    assert.equal(copied.affectionSnapshot['char-sample-1'], 55);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await advance(page, 'B_LINE');
    await nodeVisible(page, 'C_LINE');
    const newAuto = await slotWhen(page, 'c', [111], 'auto-save after explicit progression');
    assert.equal(newAuto.previewSnapshotVersion, 1);
    assert.deepEqual(JSON.parse(await readRawSaves(page))['1-1'], oldManual, 'other legacy slots remain untouched');
  }, legacyRaw);

  await runCase('legacy confirmation stays reachable at 900 and 360 pixels', fixture, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    const warning = page.getByRole('alert').filter({ hasText: '旧版预览存档未完整记录词条' });
    await warning.waitFor();
    for (const viewport of [{ width: 900, height: 560 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(viewport);
      const dimensions = await warning.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
      assert(dimensions.scrollWidth <= dimensions.width + 1, `legacy warning overflows at ${viewport.width}px`);
      for (const name of ['继续读取旧存档', '取消']) {
        const button = warning.getByRole('button', { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
          `${name} must remain reachable at ${viewport.width}px`);
      }
      await page.screenshot({ path: resolve(output, `legacy-${viewport.width}.png`) });
    }
    await warning.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await readRawSaves(page), legacyRaw);
  }, legacyRaw);

  const brokenAuto = { deliberately: 'unreadable auto', extra: 42 };
  const brokenManual = { slotKey: '1-1', variablesSnapshot: null, unrecognized: ['keep', 'me'] };
  const futureSlot = { ...legacySlot('1', 2), previewSnapshotVersion: 999, future: { keep: true } };
  const validOldSlot = legacySlot('1', 3);
  const brokenRaw = JSON.stringify({ 'auto-1': brokenAuto, '1-1': brokenManual, '1-2': futureSlot, '1-3': validOldSlot });
  await runCase('damaged and future slots are isolated without erasing others', fixture, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('alert').filter({ hasText: '部分存档槽损坏或版本不支持' }).waitFor();
    await page.getByRole('status').filter({ hasText: '已保留原数据并停止自动覆盖' }).waitFor();
    assert.equal(await readRawSaves(page), brokenRaw);
    await page.getByRole('button', { name: '读档', exact: true }).click();
    assert.equal(await page.getByText('槽位损坏或版本不支持，原数据未覆盖', { exact: true }).count(), 2);
    await page.screenshot({ path: resolve(output, 'corrupt-slots.png') });
    await page.getByText('槽位损坏或版本不支持，原数据未覆盖', { exact: true }).first().click();
    await page.getByRole('alert').filter({ hasText: '存档槽 1-1' }).waitFor();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('Node b', { exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    const after = await waitForBrowserCondition(page, () => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
      const slots = key ? JSON.parse(localStorage.getItem(key)) : null;
      return slots?.['1-4'] ? slots : false;
    }, null, 'save into a separate valid slot');
    assert.deepEqual(after['auto-1'], brokenAuto);
    assert.deepEqual(after['1-1'], brokenManual);
    assert.deepEqual(after['1-2'], futureSlot);
    assert.deepEqual(after['1-3'], validOldSlot);
    assert.equal(after['1-4'].previewSnapshotVersion, 1);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '自动存档无法读取' }).waitFor();
    assert(await page.getByRole('button', { name: '继续游戏', exact: true }).isVisible());
  }, brokenRaw);

  await runCase('unreadable save table and non-finite state are not overwritten', fixture, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('alert').filter({ hasText: '存档读取失败' }).waitFor();
    assert.equal(await readRawSaves(page), '{');
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await page.getByRole('alert').filter({ hasText: '未覆盖原数据' }).waitFor();
    assert.equal(await readRawSaves(page), '{');
  }, '{');

  await runCase('empty save table string is preserved as corrupt', fixture, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('alert').filter({ hasText: '存档读取失败' }).waitFor();
    assert.equal(await readRawSaves(page), '', 'an empty value is not the same as an absent save table');
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await page.getByRole('alert').filter({ hasText: '未覆盖原数据' }).waitFor();
    assert.equal(await readRawSaves(page), '');
  }, '');

  await runCase('non finite simulated values do not corrupt save data', () => {
    const project = fixture();
    project.variables[0].value = 1e308;
    project.nodes[0].type = 'math_operation';
    project.nodes[0].choices = [];
    project.nodes[0].logicConfig = { targetVar: 'score', mathOp: '*=', operandValue: 1e308 };
    return project;
  }, async (page) => {
    await nodeVisible(page, 'ROOT_LINE');
    await page.getByRole('alert').filter({ hasText: '当前预览状态无法保存' }).waitFor();
    assert.equal(await readRawSaves(page), null);
  });

  await runCase('blocked branch cannot be manually saved', () => {
    const project = fixture();
    project.nodes[0].type = 'random_branch';
    project.nodes[0].choices = [];
    return project;
  }, async (page) => {
    await page.getByRole('alert').filter({ hasText: 'ERR_RANDOM_BRANCH_UNSUPPORTED' }).waitFor();
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await page.getByRole('alert').filter({ hasText: '当前节点尚未执行' }).waitFor();
    assert.equal(await readRawSaves(page), null);
  });

  assert.deepEqual(errors, [], 'unexpected browser page errors');
  if (failures.length) throw new Error(`${failures.length} preview-state regression(s) failed:\n${failures.join('\n\n')}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
