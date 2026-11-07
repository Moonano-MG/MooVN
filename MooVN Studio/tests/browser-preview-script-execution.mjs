// Real Chromium exercise of the supported preview script subset in both entries.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { sha256Json } from '../src/lib/jsonChecksum.ts';
import { waitForBrowserCondition } from './browser-test-helpers.mjs';

const webEntry = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), webEntry ? '../../MooVN Web' : '..');
const entry = webEntry ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-preview-script-execution'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
const source = '// MooVN 节点自定义脚本\nmoovn.text.say("旁白", "执行自定义脚本节点");\nmoovn.save.create("Auto_Slot");\n';
let browser, origin, context, page;
const failures = [];
const pageErrors = [];

function fixture(script = source, withIntro = false) {
  const project = structuredClone(DEFAULT_PROJECT);
  project.id = 'preview-script-execution';
  project.title = 'Preview script execution';
  const node = project.nodes[0];
  node.id = 'script-node';
  node.title = 'Script node';
  node.type = 'script';
  node.scriptLanguage = 'typescript';
  node.customScript = script;
  node.dialogues[0].text = 'SCRIPT_PLACEHOLDER';
  node.choices = [];
  node.nextNodeId = 'after';
  const after = structuredClone(node);
  after.id = 'after';
  after.title = 'After';
  after.type = 'dialogue';
  after.customScript = undefined;
  after.dialogues[0].id = 'after-line';
  after.dialogues[0].text = 'AFTER_LINE';
  after.nextNodeId = null;
  project.nodes = [node, after];
  project.startNodeId = node.id;
  if (withIntro) {
    const intro = structuredClone(after);
    intro.id = 'intro';
    intro.title = 'Intro';
    intro.dialogues[0].id = 'intro-line';
    intro.dialogues[0].text = 'INTRO_LINE';
    intro.nextNodeId = node.id;
    project.nodes.unshift(intro);
    project.startNodeId = intro.id;
  }
  return project;
}

async function open(project, viewport = { width: 1366, height: 768 }, configure) {
  context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    // Make every save timestamp distinct, so duplicate named writes are observable.
    window.__testClock = 0;
    window.__scriptWrites = 0;
    window.__failScriptWrites = false;
    const originalLocaleString = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = function (...args) {
      return originalLocaleString.apply(new Date(this.getTime() + 1000 * ++window.__testClock), args);
    };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('moovn_saves_')) {
        let next, old;
        try { next = JSON.parse(value); old = JSON.parse(this.getItem(key) || '{}'); } catch { /* normal error path handles malformed data */ }
        const changes = next && Object.keys(next).filter((name) => name.startsWith('script-') &&
          JSON.stringify(next[name]) !== JSON.stringify(old?.[name]));
        if (changes?.length && window.__failScriptWrites) throw new Error('simulated quota failure');
        if (changes?.length) window.__scriptWrites += changes.length;
      }
      return original.call(this, key, value);
    };
  });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(`${origin}${entry}`);
  const picker = page.locator('input[type=file][accept*=".mpvn"]');
  await picker.setInputFiles({ name: 'script-execution.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
  await picker.waitFor({ state: 'detached' });
  if (configure) await configure(page);
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').waitFor();
  return page;
}
const viewport = () => page.locator('[data-scene-viewport="player"]');
const line = (text) => viewport().getByText(text, { exact: true });
async function read() {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    return key ? { key, raw: localStorage.getItem(key), slots: JSON.parse(localStorage.getItem(key)) } : null;
  });
}
async function waitSlot(slot) {
  return waitForBrowserCondition(page, (name) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('moovn_saves_'));
    const saves = key && JSON.parse(localStorage.getItem(key));
    return saves?.[name] ? { key, slots: saves } : false;
  }, slot, `save ${slot}`);
}
async function advance(text) { await line(text).click(); }
async function loadNamed(name) {
  await page.getByRole('button', { name: '读档', exact: true }).click();
  await viewport().getByRole('button', { name: '脚本', exact: true }).click();
  await viewport().getByRole('button', { name: new RegExp(name) }).click();
}
async function run(name, fn) {
  if (process.env.MOOVN_CASE && process.env.MOOVN_CASE !== name) return;
  page = undefined; context = undefined;
  try { await fn(); console.log(`✓ ${name}`); }
  catch (error) {
    failures.push({ name, message: error instanceof Error ? error.stack : String(error) });
    console.error(`✗ ${name}: ${error instanceof Error ? error.stack : String(error)}`);
    if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, `failure-${name}.png`) });
  } finally { if (context) await context.close(); }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not bind');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  await run('default-template-save-load-back', async () => {
    await open(fixture());
    await line('执行自定义脚本节点').waitFor();
    assert.equal(await line('SCRIPT_PLACEHOLDER').count(), 0, 'script text replaces placeholder');
    const saved = await waitSlot('script-Auto_Slot');
    const named = saved.slots['script-Auto_Slot'];
    assert.equal(named.nodeId, 'script-node');
    assert.equal(named.textPreview, '执行自定义脚本节点');
    assert.equal(named.speakerName, '旁白');
    assert.equal(named.variablesSnapshot.chapterIndex, 1);
    assert.equal(named.scriptSourceDigest, sha256Json(source));
    assert(!JSON.stringify(named).includes(source), 'the full script source is not stored in the save');
    assert.equal(named.scriptLanguageSnapshot, 'typescript');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1);
    assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT' }).count(), 0);
    await page.screenshot({ path: resolve(output, 'script-dialogue-and-save.png') });
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await viewport().getByRole('button', { name: '脚本', exact: true }).click();
    assert(await viewport().getByRole('button', { name: /Auto_Slot/ }).isVisible());
    await page.screenshot({ path: resolve(output, 'named-save-load.png') });
    await viewport().getByRole('button', { name: /Auto_Slot/ }).click();
    await line('执行自定义脚本节点').waitFor();
    assert(await page.getByRole('button', { name: '后退', exact: true }).isDisabled());
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1, 'loading must not execute script again');
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await line('执行自定义脚本节点').waitFor();
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1, 'back must not execute script again');
    assert.deepEqual((await read()).slots['script-Auto_Slot'], named);
  });

  await run('create-script-node-through-editor', async () => {
    const project = structuredClone(DEFAULT_PROJECT);
    project.title = 'Create script from node library';
    await open(project);
    await line(project.nodes[0].dialogues[0].text).waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByTitle('打开节点库').click();
    const quickAdd = page.locator('.canvas-Floating-ui');
    await quickAdd.getByRole('button', { name: '脚本', exact: true }).click();
    await quickAdd.getByRole('button', { name: /^脚本代码/ }).click();
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await line('执行自定义脚本节点').waitFor();
    const saved = await waitSlot('script-Auto_Slot');
    assert.match(saved.slots['script-Auto_Slot'].nodeTitle, /^脚本代码/);
    assert.notEqual(saved.slots['script-Auto_Slot'].nodeId, project.startNodeId);
    assert.equal(saved.slots['script-Auto_Slot'].scriptSourceDigest, sha256Json(source));
    await page.screenshot({ path: resolve(output, 'created-script-node.png') });
  });

  await run('fresh-self-loop-executes-once-per-visit', async () => {
    const project = fixture();
    project.nodes[0].nextNodeId = 'script-node';
    await open(project);
    await line('执行自定义脚本节点').waitFor();
    await waitSlot('script-Auto_Slot');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1);
    await advance('执行自定义脚本节点');
    await waitForBrowserCondition(page, () => window.__scriptWrites === 2, null, 'second fresh visit');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 2);
  });

  await run('save-only-and-literal-text', async () => {
    await open(fixture('moovn.save.create("Auto_Slot");'));
    await line('SCRIPT_PLACEHOLDER').waitFor();
    const saved = await waitSlot('script-Auto_Slot');
    assert.equal(saved.slots['script-Auto_Slot'].textPreview, 'SCRIPT_PLACEHOLDER');
    await context.close(); context = undefined;
    const quoted = 'moovn.text.say("旁白", "moovn.save.create(\\\"FAKE\\\")"); // moovn.save.create("ALSO_FAKE")';
    await open(fixture(quoted));
    await line('moovn.save.create("FAKE")').waitFor();
    const auto = await waitSlot('auto-1');
    assert.equal(Object.keys(auto.slots).some((key) => key.startsWith('script-')), false);
    assert.equal(await page.evaluate(() => window.__scriptWrites), 0);
  });

  await run('script-save-survives-closing-preview', async () => {
    await open(fixture(source, true));
    await line('INTRO_LINE').waitFor();
    await advance('INTRO_LINE');
    await line('执行自定义脚本节点').waitFor();
    const original = (await waitSlot('script-Auto_Slot')).slots['script-Auto_Slot'];
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await line('INTRO_LINE').waitFor();
    await loadNamed('Auto_Slot');
    await line('执行自定义脚本节点').waitFor();
    assert.deepEqual((await read()).slots['script-Auto_Slot'], original);
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1, 'reopening and loading must not rerun script');
  });

  await run('script-line-read-history-and-skip', async () => {
    await open(fixture());
    await line('执行自定义脚本节点').waitFor();
    await waitSlot('script-Auto_Slot');
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
    await loadNamed('Auto_Slot');
    await line('执行自定义脚本节点').waitFor();
    await page.getByRole('button', { name: '快进', exact: true }).click();
    await line('AFTER_LINE').waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1);
    assert(await page.getByRole('status').filter({ hasText: '未读剧情' }).isVisible());
  });

  await run('script-source-not-copied-to-saves', async () => {
    const secret = 'TEST_COMMENT_TOKEN_DO_NOT_STORE';
    await open(fixture(`// ${secret}\nmoovn.save.create("Auto_Slot");`));
    await line('SCRIPT_PLACEHOLDER').waitFor();
    const saved = await waitSlot('script-Auto_Slot');
    assert(!JSON.stringify(saved.slots).includes(secret), 'comments and full source must not be copied into saves');
  });

  await run('save-only-without-dialogue-fails-safely', async () => {
    const project = fixture('moovn.save.create("Auto_Slot");');
    project.nodes[0].dialogues = [];
    await open(project);
    await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).waitFor();
    assert(await page.getByRole('alert').filter({ hasText: '没有可保存的台词位置' }).isVisible());
    assert.equal(await read(), null);
    assert(await page.getByRole('button', { name: '返回编辑器', exact: true }).isVisible());
  });

  await run('whole-program-validation', async () => {
    await open(fixture('moovn.save.create("Auto_Slot");\nmoovn.unknown.action();'));
    await line('SCRIPT_PLACEHOLDER').waitFor();
    assert(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).isVisible());
    assert.equal(await read(), null, 'no early save or auto-save after an invalid later statement');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 0);
    await advance('SCRIPT_PLACEHOLDER');
    assert.equal(await line('AFTER_LINE').count(), 0);
  });

  await run('mixed-node-action-blocks-script', async () => {
    const project = fixture();
    project.nodes[0].toastMessage = 'UNSUPPORTED_TOAST';
    await open(project);
    await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' }).waitFor();
    assert(await page.getByRole('alert').filter({ hasText: '其他逻辑或积木动作' }).isVisible());
    assert.equal(await viewport().getByText('UNSUPPORTED_TOAST', { exact: true }).count(), 0);
    assert.equal(await read(), null);
    assert.equal(await page.evaluate(() => window.__scriptWrites), 0);
  });

  await run('corrupt-target-retry-preserves-checkpoint', async () => {
    await open(fixture(source, true));
    await line('INTRO_LINE').waitFor();
    const old = await waitSlot('auto-1');
    const oldAuto = old.slots['auto-1'];
    const corrupt = { futureVersion: 999, payload: 'preserve me' };
    await page.evaluate(({ key, corrupt }) => {
      const data = JSON.parse(localStorage.getItem(key));
      data['script-Auto_Slot'] = corrupt;
      localStorage.setItem(key, JSON.stringify(data));
      window.__scriptWrites = 0;
    }, { key: old.key, corrupt });
    await advance('INTRO_LINE');
    await line('SCRIPT_PLACEHOLDER').waitFor();
    assert(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).isVisible());
    assert.equal(await line('执行自定义脚本节点').count(), 0, 'failed program must not display its scripted text');
    let current = await read();
    assert.deepEqual(current.slots['auto-1'], oldAuto);
    assert.deepEqual(current.slots['script-Auto_Slot'], corrupt);
    await advance('SCRIPT_PLACEHOLDER');
    assert.equal(await line('AFTER_LINE').count(), 0);
    await page.evaluate((key) => {
      const data = JSON.parse(localStorage.getItem(key));
      delete data['script-Auto_Slot'];
      localStorage.setItem(key, JSON.stringify(data));
    }, old.key);
    await page.getByRole('button', { name: '重试脚本存档', exact: true }).click();
    current = await waitSlot('script-Auto_Slot');
    await line('执行自定义脚本节点').waitFor();
    assert.equal(current.slots['script-Auto_Slot'].nodeId, 'script-node');
    assert.equal(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).count(), 0);
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1);
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
  });

  await run('storage-failure-and-retry', async () => {
    await open(fixture(), undefined, (p) => p.evaluate(() => { window.__failScriptWrites = true; }));
    await line('SCRIPT_PLACEHOLDER').waitFor();
    assert(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).isVisible());
    assert.equal(await read(), null, 'failed script write must not produce an auto checkpoint');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 0);
    await page.evaluate(() => { window.__failScriptWrites = false; });
    await page.getByRole('button', { name: '重试脚本存档', exact: true }).click();
    await waitSlot('script-Auto_Slot');
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1);
  });

  await run('initial-read-failure-stops-auto-save-until-advance', async () => {
    await open(fixture(), undefined, (p) => p.evaluate(() => {
      window.__failSaveRead = true;
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('moovn_saves_') && window.__failSaveRead) throw new Error('simulated read failure');
        return originalGetItem.call(this, key);
      };
    }));
    await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).waitFor();
    assert(await page.getByRole('status').filter({ hasText: '自动存档读取失败' }).isVisible());
    await page.evaluate(() => { window.__failSaveRead = false; });
    assert.equal(await read(), null);
    await page.getByRole('button', { name: '重试脚本存档', exact: true }).click();
    const saved = await waitSlot('script-Auto_Slot');
    await line('执行自定义脚本节点').waitFor();
    assert(!saved.slots['auto-1']);
    assert(await page.getByRole('status').filter({ hasText: '自动存档已暂停' }).isVisible());
    await advance('执行自定义脚本节点');
    await line('AFTER_LINE').waitFor();
    assert((await waitSlot('auto-1')).slots['auto-1']);
  });

  await run('choice-state-commits-only-after-success', async () => {
    const project = fixture(source, true);
    const character = structuredClone(SAMPLE_PROJECT.characters[0]);
    project.characters = [character];
    const intro = project.nodes[0];
    intro.type = 'choice';
    intro.choices = [{ id: 'choice', text: 'TAKE_CHOICE', targetNodeId: 'script-node',
      affectionCharacterId: character.id, affectionDelta: 10, setVarKey: 'chapterIndex', setVarValue: 17 }];
    await open(project);
    await line('INTRO_LINE').waitFor();
    const before = await waitSlot('auto-1');
    const oldAuto = before.slots['auto-1'];
    await page.getByTitle('运行状态监控').click();
    await page.evaluate(() => { window.__failScriptWrites = true; });
    await page.getByRole('button', { name: 'TAKE_CHOICE', exact: true }).click();
    await line('SCRIPT_PLACEHOLDER').waitFor();
    assert(await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_SCRIPT_SAVE' }).isVisible());
    assert(await viewport().getByText(`• ${character.name}: ${character.initialAffection}`, { exact: true }).isVisible());
    assert.deepEqual((await read()).slots['auto-1'], oldAuto);
    await page.evaluate(() => { window.__failScriptWrites = false; });
    await page.getByRole('button', { name: '重试脚本存档', exact: true }).click();
    const saved = await waitSlot('script-Auto_Slot');
    await line('执行自定义脚本节点').waitFor();
    assert.equal(saved.slots['script-Auto_Slot'].variablesSnapshot.chapterIndex, 17);
    assert.equal(saved.slots['script-Auto_Slot'].affectionSnapshot[character.id], character.initialAffection + 10);
    assert(await viewport().getByText(`• ${character.name}: ${character.initialAffection + 10}`, { exact: true }).isVisible());
  });

  await run('changed-script-save-is-not-restored', async () => {
    await open(fixture());
    await line('执行自定义脚本节点').waitFor();
    const first = await waitSlot('script-Auto_Slot');
    const stale = { ...first.slots['script-Auto_Slot'], scriptSourceDigest: sha256Json(source + '// edited later') };
    await context.close(); context = undefined;
    await open(fixture(source, true));
    await line('INTRO_LINE').waitFor();
    const auto = await waitSlot('auto-1');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const seeded = { ...auto.slots, 'script-Auto_Slot': stale };
    await page.evaluate(({ key, seeded }) => localStorage.setItem(key, JSON.stringify(seeded)), { key: auto.key, seeded });
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
    await line('INTRO_LINE').waitFor();
    await loadNamed('Auto_Slot');
    assert(await page.getByRole('alert').filter({ hasText: '存档缺少匹配的脚本执行记录' }).isVisible());
    assert.deepEqual((await read()).slots, seeded);
    // Modal is still open and no script was executed by the failed load.
    assert.equal(await page.evaluate(() => window.__scriptWrites), 1, 'only the deliberately seeded slot changed');
  });

  await run('script-text-is-rendered-as-text', async () => {
    const malicious = '<img src=x onerror="window.__scriptXss=1">';
    await open(fixture(`moovn.text.say("旁白", ${JSON.stringify(malicious)});`));
    await line(malicious).waitFor();
    await waitSlot('auto-1');
    assert.equal(await viewport().locator('img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__scriptXss), undefined);
  });

  await run('narrow-named-load', async () => {
    await open(fixture(), { width: 360, height: 640 });
    await line('执行自定义脚本节点').waitFor();
    await waitSlot('script-Auto_Slot');
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await viewport().getByRole('button', { name: '脚本', exact: true }).click();
    const named = viewport().getByRole('button', { name: /Auto_Slot/ });
    await named.waitFor({ state: 'visible' });
    const box = await named.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 360 && box.y >= 0 && box.y + box.height <= 640);
    await page.screenshot({ path: resolve(output, 'named-save-mobile.png') });
    await named.click();
    await line('执行自定义脚本节点').waitFor();
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
