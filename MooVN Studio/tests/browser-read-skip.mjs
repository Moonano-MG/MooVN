// Real Chromium regressions for read-only skip in Studio/Web preview and the
// standalone file:// player. Does not claim Windows, Android or Engine coverage.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { buildStandaloneGameHtml } from '../src/lib/gamePackager.ts';

const web = process.argv.includes('--web');
const htmlMode = process.argv.includes('--html');
const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = web ? resolve(studio, '../MooVN Web') : studio;
const entry = web ? '/studio.html' : '/';
const mode = htmlMode ? 'html' : web ? 'web' : 'studio';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(studio, 'test-results/browser-read-skip', mode));
await mkdir(output, { recursive: true });

function fixture() {
  const project = structuredClone(DEFAULT_PROJECT);
  project.id = 'read-skip-regression';
  project.title = 'Read skip regression';
  function makeNode(id, text, nextNodeId) {
    const node = structuredClone(DEFAULT_PROJECT.nodes[0]);
    node.id = id;
    node.title = id;
    node.transition = 'none';
    node.dialogues = [{ ...node.dialogues[0], id: `${id}-line`, text }];
    node.nextNodeId = nextNodeId;
    return node;
  }
  const a = makeNode('a', 'LINE_A', 'b');
  a.dialogues.push({ ...a.dialogues[0], id: 'a-line-2', text: 'LINE_A2' });
  const b = makeNode('b', 'LINE_B', 'c');
  const c = makeNode('c', 'LINE_C', null);
  c.type = 'choice';
  c.choices = [{ id: 'choice-d', text: 'GO_D', targetNodeId: 'd' }];
  const d = makeNode('d', 'LINE_D', null);
  project.nodes = [a, b, c, d];
  project.startNodeId = 'a';
  return project;
}

let server;
let browser;
let activePage;
let origin;
const errors = [];
const prefix = htmlMode ? 'moovn_standalone_read_' : 'moovn_preview_read_';

async function openFixture(project, { storageFailure, motion = 'reduce', viewport = { width: 1366, height: 768 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: motion });
  if (storageFailure) {
    await context.addInitScript(({ prefix: storagePrefix, failure }) => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      window.__readWrites = 0;
      Storage.prototype.getItem = function(key) {
        if (failure === 'read' && String(key).startsWith(storagePrefix)) throw new DOMException('Access denied', 'SecurityError');
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith(storagePrefix)) {
          window.__readWrites += 1;
          if (failure === 'write' || failure === 'both') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        if (failure === 'both' && String(key).startsWith('moovn_standalone_saves_')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return originalSet.call(this, key, value);
      };
    }, { prefix, failure: storageFailure });
  }
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (error) => errors.push(error.message));
  let file;
  if (htmlMode) {
    file = resolve(output, 'read-skip.html');
    await writeFile(file, buildStandaloneGameHtml(project, { backgrounds: [], characters: [] }));
    await page.goto(pathToFileURL(file).href);
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  } else {
    await page.goto(`${origin}${entry}`);
    const picker = page.locator('input[type=file][accept*=".mpvn"]');
    await picker.setInputFiles({ name: 'read-skip.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(project)) });
    await picker.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
  }
  return { context, page, file };
}
async function visible(page, text) {
  const scope = htmlMode ? page.locator('#dlg-text') : page.locator('[data-scene-viewport="player"]');
  await scope.getByText(text, { exact: true }).waitFor({ timeout: 8000 });
}
async function advance(page, text) {
  await visible(page, text);
  const scope = htmlMode ? page.locator('#dlg-text') : page.locator('[data-scene-viewport="player"]');
  await scope.getByText(text, { exact: true }).click();
}
async function restart(page) {
  if (htmlMode) {
    await page.getByRole('button', { name: '返回主菜单', exact: true }).click();
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
  }
}
async function skip(page) {
  await page.getByRole('button', { name: '快进', exact: true }).click();
}
async function stopped(page, text) {
  await visible(page, text);
  await page.waitForTimeout(700);
  await visible(page, text);
  assert.equal(await page.getByRole('button', { name: '快进', exact: true }).getAttribute('aria-pressed'), 'false');
}
async function notice(page, pattern) {
  await page.getByRole('status').filter({ hasText: pattern }).first().waitFor({ timeout: 4000 });
}
async function readKey(page) {
  return page.evaluate((storagePrefix) => Object.keys(localStorage).find((name) => name.startsWith(storagePrefix)) || null, prefix);
}
async function saveAndLoadD(page) {
  if (htmlMode) {
    await page.getByRole('button', { name: '快速存档', exact: true }).click();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await visible(page, 'LINE_C');
    await page.getByRole('button', { name: '快速读档', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '存档', exact: true }).click();
    await page.getByText('点击将当前游戏进度保存至此槽位', { exact: true }).first().click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '后退', exact: true }).click();
    await visible(page, 'LINE_C');
    await page.getByRole('button', { name: '读档', exact: true }).click();
    await page.locator('.grid.grid-cols-2.grid-rows-3').getByText('d', { exact: true }).click();
  }
  await visible(page, 'LINE_D');
  await skip(page);
  await stopped(page, 'LINE_D');
}

try {
  if (!htmlMode) {
    server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
    origin = `http://127.0.0.1:${address.port}`;
  }
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  {
    const project = fixture();
    const { context, page, file } = await openFixture(project);
    try {
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_A');
      await notice(page, /尚未读过/);
      assert.equal(await readKey(page), null, 'merely displaying a line must not mark it read');
      await page.screenshot({ path: resolve(output, '01-unread-blocked.png') });

      await advance(page, 'LINE_A');
      await visible(page, 'LINE_A2');
      await page.getByRole('button', { name: '后退', exact: true }).click();
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_A2');
      await notice(page, /未读剧情/);
      const key = await readKey(page);
      assert(key, 'advancing a complete line should persist a read entry');
      const entriesAfterOne = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries.map((item) => JSON.parse(item)), key);
      assert.equal(entriesAfterOne.length, 1, 'a different line in the same node remains unread');
      assert.equal(entriesAfterOne[0][1], 0);
      await page.screenshot({ path: resolve(output, '02-skip-stops-at-next-line.png') });

      await advance(page, 'LINE_A2');
      await visible(page, 'LINE_B');
      await restart(page);
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_B');
      console.log(`✓ ${mode}: completed lines survive restart; skip stops at the first unread line`);

      await advance(page, 'LINE_B');
      await visible(page, 'LINE_C');
      await page.getByRole('button', { name: 'GO_D', exact: true }).click();
      await visible(page, 'LINE_D');
      await saveAndLoadD(page);
      console.log(`✓ ${mode}: loading an unread line does not mark it read`);
      await advance(page, 'LINE_D');
      await skip(page);
      await stopped(page, 'LINE_D');
      await notice(page, /末尾/);
      console.log(`✓ ${mode}: skip switches off at the end of a completed story`);

      await restart(page);
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_C');
      await notice(page, /选项/);
      assert.equal(await page.getByRole('button', { name: 'GO_D', exact: true }).isVisible(), true);
      await page.screenshot({ path: resolve(output, '03-choice-pause.png') });
      await page.getByRole('button', { name: 'GO_D', exact: true }).click();
      await stopped(page, 'LINE_D');
      console.log(`✓ ${mode}: skip never chooses a branch, including a previously read choice`);

      // Simulate a competing writer after skip is enabled but before its next
      // timer. Same-tab writes do not emit a storage event, so the advance must
      // re-read rather than trusting a cached React render.
      await restart(page);
      await visible(page, 'LINE_A');
      const previousRaw = await page.evaluate((k) => localStorage.getItem(k), key);
      await skip(page);
      const atMutation = await page.evaluate(({ k, standalone }) => {
        const text = standalone ? document.querySelector('#dlg-text')?.textContent
          : [...document.querySelectorAll('[data-scene-viewport="player"] p')]
            .map((element) => element.textContent).find((value) => value?.startsWith('LINE_'));
        const active = document.querySelector(standalone ? '#btn-skip' : 'button[aria-pressed="true"]')?.getAttribute('aria-pressed');
        localStorage.setItem(k, '{changed-during-skip');
        return { text, active };
      }, { k: key, standalone: htmlMode });
      assert.equal(atMutation.active, 'true', 'the race must be injected while skip is running');
      assert.match(atMutation.text || '', /^LINE_(A|A2|B)$/);
      await stopped(page, atMutation.text);
      await notice(page, /已读记录损坏/);
      assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), '{changed-during-skip');
      await page.evaluate(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: previousRaw });
      console.log(`✓ ${mode}: a changed record is rechecked before the next skip timer`);

      // Change text while retaining the same node and line IDs.
      if (htmlMode) {
        project.nodes[0].dialogues[0].text = 'LINE_A_EDITED';
        await writeFile(file, buildStandaloneGameHtml(project, { backgrounds: [], characters: [] }));
        await page.reload();
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
      } else {
        await page.getByRole('button', { name: '返回', exact: true }).click();
        const fields = await page.locator('textarea').all();
        const dialogueField = (await Promise.all(fields.map(async (field) => [field, await field.inputValue()])))
          .find(([, value]) => value === 'LINE_A')?.[0];
        assert(dialogueField, 'the original line must be editable in the inspector');
        await dialogueField.fill('LINE_A_EDITED');
        await page.getByRole('button', { name: '运行预览', exact: true }).click();
      }
      await visible(page, 'LINE_A_EDITED');
      await skip(page);
      await stopped(page, 'LINE_A_EDITED');
      console.log(`✓ ${mode}: edited dialogue with the same ID is unread`);

      await page.evaluate((k) => localStorage.setItem(k, '{broken'), key);
      await restart(page);
      await visible(page, 'LINE_A_EDITED');
      await skip(page);
      await notice(page, /已读记录损坏/);
      await stopped(page, 'LINE_A_EDITED');
      await advance(page, 'LINE_A_EDITED');
      await visible(page, 'LINE_A2');
      assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), '{broken', 'invalid history must never be overwritten');
      await notice(page, /已读记录损坏/);
      await page.screenshot({ path: resolve(output, '04-corrupt-preserved.png') });
      console.log(`✓ ${mode}: corrupt history disables skip and is preserved while manual play continues`);
    } finally { await context.close(); }
  }

  {
    const { context, page } = await openFixture(fixture());
    try {
      await advance(page, 'LINE_A');
      await visible(page, 'LINE_A2');
      if (!htmlMode) {
        await page.getByRole('button', { name: '返回', exact: true }).click();
        await page.keyboard.press('Control+s');
        await page.waitForFunction(() => {
          const raw = localStorage.getItem('moovn_studio_projects_v3');
          return raw && JSON.parse(raw).some((item) => item.title === 'Read skip regression');
        });
      }
      await page.reload();
      if (htmlMode) {
        await page.getByRole('button', { name: '开始游戏', exact: true }).click();
      } else {
        // Both entries run in a browser here, so the launcher uses browser storage.
        await page.getByRole('button', { name: 'Read skip regression', exact: true }).click();
        await page.getByRole('button', { name: '运行预览', exact: true }).click();
      }
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_A2');
      console.log(`✓ ${mode}: history survives reloading and reopening the saved project or game`);
    } finally { await context.close(); }
  }

  for (const failure of ['write', 'read']) {
    const { context, page } = await openFixture(fixture(), { storageFailure: failure });
    try {
      await visible(page, 'LINE_A');
      if (failure === 'read') {
        await skip(page);
        await notice(page, /已读记录读取失败/);
      }
      await advance(page, 'LINE_A');
      await visible(page, 'LINE_A2');
      await notice(page, failure === 'write' ? /已读记录写入失败/ : /已读记录读取失败/);
      assert.equal(await readKey(page), null);
      if (failure === 'read') assert.equal(await page.evaluate(() => window.__readWrites), 0, 'failed reads must not be overwritten');
      await restart(page);
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_A');
      console.log(`✓ ${mode}: simulated storage ${failure} failure never reports a successful read mark`);
    } finally { await context.close(); }
  }

  {
    const { context, page } = await openFixture(fixture(), { storageFailure: 'write', viewport: { width: 360, height: 780 } });
    try {
      await advance(page, 'LINE_A');
      const warning = page.getByRole('status').filter({ hasText: /已读记录写入失败/ }).first();
      await warning.waitFor();
      const bounds = await warning.boundingBox();
      assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 361, 'read warning must fit the narrow viewport');
      await page.screenshot({ path: resolve(output, '06-narrow-warning.png') });
      console.log(`✓ ${mode}: read-history failure remains visible at 360px`);
    } finally { await context.close(); }
  }

  if (htmlMode) {
    const { context, page } = await openFixture(fixture(), { storageFailure: 'both' });
    try {
      await advance(page, 'LINE_A');
      await visible(page, 'LINE_A2');
      assert.match(await page.locator('#read-warning').innerText(), /已读记录写入失败/);
      assert.match(await page.locator('#toast-banner').innerText(), /存档写入失败/);
      assert.equal(await page.locator('#read-warning').isVisible(), true, 'save notifications must not hide the read failure');
      await page.screenshot({ path: resolve(output, '05-independent-storage-errors.png') });
      console.log('✓ html: simultaneous save and read-history failures stay independently visible');
    } finally { await context.close(); }
  }

  {
    const { context, page } = await openFixture(fixture());
    try {
      await visible(page, 'LINE_A');
      await page.getByRole('button', { name: '自动', exact: true }).click();
      await visible(page, 'LINE_A2');
      await page.getByRole('button', { name: '自动', exact: true }).click();
      await page.getByRole('button', { name: '后退', exact: true }).click();
      await visible(page, 'LINE_A');
      await skip(page);
      await stopped(page, 'LINE_A2');
      console.log(`✓ ${mode}: autoplay marks the completed line and skip still stops at the next unread line`);
    } finally { await context.close(); }
  }

  {
    const project = fixture();
    project.startNodeId = 'c';
    project.nodes[2].dialogues[0].text = `LONG_CHOICE_${'x'.repeat(500)}`;
    const { context, page } = await openFixture(project, { motion: 'no-preference' });
    try {
      await page.getByRole('button', { name: 'GO_D', exact: true }).click();
      await visible(page, 'LINE_D');
      assert.equal(await readKey(page), null, 'choosing before text finishes must not mark unseen text as read');
      console.log(`✓ ${mode}: an early choice does not mark partially displayed text read`);
    } finally { await context.close(); }
  }
  {
    const project = fixture();
    const longText = `TYPEWRITER_${'x'.repeat(300)}`;
    project.nodes[0].dialogues[0].text = longText;
    const { context, page } = await openFixture(project, { motion: 'no-preference' });
    try {
      const line = htmlMode ? page.locator('#dlg-text') : page.locator('[data-scene-viewport="player"] p').first();
      await page.waitForFunction(({ selector }) => {
        const text = document.querySelector(selector)?.textContent || '';
        return text.startsWith('TYPE') && text.length < 300;
      }, { selector: htmlMode ? '#dlg-text' : '[data-scene-viewport="player"] p' });
      await line.click();
      await visible(page, longText);
      await page.waitForTimeout(250);
      await visible(page, longText);
      assert.equal(await readKey(page), null, 'revealing a partial line is not an advance');
      await advance(page, longText);
      await visible(page, 'LINE_A2');
      assert(await readKey(page), 'a fully displayed and advanced line should be recorded');
      console.log(`✓ ${mode}: revealing text cancels typing and only the next advance records it`);
    } finally { await context.close(); }
  }

  if (!htmlMode) {
    // HTML export rejects empty nodes; preview must stop rather than reusing
    // the preceding dialogue's read status or leaving its text on screen.
    const project = fixture();
    project.nodes[0].dialogues = project.nodes[0].dialogues.slice(0, 1);
    project.nodes[0].nextNodeId = 'empty';
    const empty = structuredClone(project.nodes[1]);
    empty.id = 'empty'; empty.title = 'empty'; empty.dialogues = []; empty.nextNodeId = 'b';
    project.nodes.splice(1, 0, empty);
    const { context, page } = await openFixture(project);
    try {
      await advance(page, 'LINE_A');
      await page.getByRole('button', { name: '后退', exact: true }).click();
      await visible(page, 'LINE_A');
      await skip(page);
      await notice(page, /没有可记录的台词/);
      await page.waitForTimeout(700);
      assert.equal(await page.getByRole('button', { name: '快进', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('LINE_B', { exact: true }).count(), 0);
      assert.equal(await page.locator('[data-scene-viewport="player"]').getByText('LINE_A', { exact: true }).count(), 0);
      console.log(`✓ ${mode}: skip stops on a node without dialogue and clears stale text`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(`All ${mode} read-skip browser checks passed; screenshots: ${output}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: resolve(output, 'failure.png') });
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
