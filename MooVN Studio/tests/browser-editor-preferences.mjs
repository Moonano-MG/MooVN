// Real-browser checks for persisted editor preferences, not native platform acceptance.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const web = process.argv.includes('--web');
const root = resolve(process.env.MOOVN_E2E_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), web ? '../../MooVN Web' : '..'));
const entry = web ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-editor-preferences'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}${entry}`;
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const screenshot = (name) => page.screenshot({ path: resolve(output, `${web ? 'web' : 'studio'}-${name}.png`) });
const modal = () => process.env.MOOVN_BASELINE ? page.locator('div.fixed.inset-0').last() : page.getByRole('dialog', { name: '设置' });
const rail = (name) => page.locator(`button[title^="${name} (左键"]`);
try {
  await page.goto(origin);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  const card = page.locator('.vn-node-card').first();
  await card.waitFor();
  if (process.env.MOOVN_BASELINE_SCRIPT) {
    await rail('脚本编辑器').click();
    const editor = page.locator('textarea[spellcheck="false"]').first();
    await editor.waitFor();
    const stats = await editor.evaluate((el) => ({ text: el.value, background: getComputedStyle(el).backgroundColor, rendered: el.parentElement.querySelector('pre').textContent }));
    await screenshot('baseline-invisible-script');
    console.log(`script text length=${stats.text.length}; highlighted text length=${stats.rendered.length}; overlay background=${stats.background}`);
    assert(stats.text.length > 0);
    assert.equal(stats.background, 'rgba(0, 0, 0, 0)', 'transparent editing layer must not obscure highlighted code');
  }
  const initial = await card.evaluate((el) => getComputedStyle(el).borderLeftColor);
  await page.getByRole('button', { name: '设置', exact: true }).first().click();
  await modal().getByText('启用节点类别彩色边框标识').locator('..').getByRole('checkbox').uncheck();
  if (!process.env.MOOVN_BASELINE) {
    await modal().getByLabel('新建项目的默认脚本语言').selectOption('rust');
    await modal().getByRole('button', { name: '游戏默认参数', exact: true }).click();
    await modal().getByLabel('立绘动态').selectOption('off');
  }
  await modal().getByRole('button', { name: '保存设置', exact: true }).click();
  await modal().getByText('设置已保存', { exact: true }).waitFor();
  await modal().getByRole('button', { name: '取消', exact: true }).click();
  const after = await card.evaluate((el) => getComputedStyle(el).borderLeftColor);
  await screenshot(process.env.MOOVN_BASELINE ? 'baseline-unchecked' : '01-neutral-border');
  console.log(`node border before=${initial}; after checkbox disabled=${after}`);
  assert.notEqual(initial, 'rgb(82, 82, 91)');
  assert.equal(after, 'rgb(82, 82, 91)', 'the persisted checkbox must actually change node borders');
  assert(await page.locator('[data-motion-off="true"]').count() > 0, 'saved motion setting takes effect');
  await rail('脚本编辑器').click();
  await page.getByText('main.ts', { exact: true }).first().waitFor();
  const input = page.getByLabel('脚本代码');
  const overlayStats = () => input.evaluate((el) => ({ text: el.value, background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, rendered: el.parentElement.querySelector('pre').textContent }));
  let stats = await overlayStats();
  assert(stats.text.length > 0);
  assert.equal(stats.rendered.trimEnd(), stats.text.trimEnd());
  assert.equal(stats.background, 'rgba(0, 0, 0, 0)', 'editor overlay must not cover highlighted text');
  assert.equal(stats.color, 'rgba(0, 0, 0, 0)');
  await screenshot('03-visible-dark-script');
  await page.getByTitle('切换为浅色(白)界面风格').click();
  stats = await overlayStats();
  assert.equal(stats.background, 'rgba(0, 0, 0, 0)', 'light theme must not cover highlighted text');
  assert.equal(stats.color, 'rgba(0, 0, 0, 0)', 'light theme must not paint text twice');
  await screenshot('04-visible-light-script');
  await page.getByTitle('切换为深色(黑)界面风格').click();
  console.log('✓ saved category/motion preferences take effect without rewriting the existing project');
  console.log('✓ highlighted source remains visible beneath a transparent overlay in both themes');

  await page.reload();
  await page.getByRole('button', { name: '创建并进入编辑器', exact: true }).click();
  await rail('脚本编辑器').click();
  await page.getByText('main.rs', { exact: true }).first().waitFor();
  const activeTabs = page.locator('[title="点击切换文件 · 双击可修改文件名与后缀 (.ts / .js / .cs / .cpp / .rs / .yaml)"]');
  assert(await activeTabs.filter({ hasText: '.rs' }).count());
  await screenshot('02-new-project-rust');
  await page.getByTitle('新建文件', { exact: true }).click();
  const filename = page.getByPlaceholder('例如: dialogue.ts / save.cs / shader.cpp / mod.rs / script.js');
  assert.equal(await filename.inputValue(), 'new_script.rs');
  await page.keyboard.press('Escape');
  await page.getByText('main.rs', { exact: true }).first().click();
  assert.match(await input.inputValue(), /宿主语言编译与预览执行尚未实现/);
  await input.fill('fn main() { println!(\"test\"); }\n');
  await page.keyboard.press('Control+s');
  await page.getByText('已保存到浏览器缓存', { exact: false }).first().waitFor();
  await page.getByTitle('项目中心', { exact: true }).click();
  await page.getByRole('button', { name: '新视觉小说项目', exact: true }).first().click();
  await page.getByText('main.rs', { exact: true }).first().click();
  assert.equal(await input.inputValue(), 'fn main() { println!(\"test\"); }\n');
  console.log('✓ new project uses Rust-named drafts and retains edits after project save/reopen; no runtime execution is claimed');
  assert.deepEqual(errors, []);
  console.log(`${web ? 'Web' : 'Studio browser mode'} editor preference checks passed; screenshots: ${output}`);
} catch (error) {
  if (!page.isClosed()) {
    try { await screenshot(process.env.MOOVN_BASELINE ? 'baseline-failure' : 'failure'); } catch (screenshotError) { console.error(screenshotError); }
  }
  throw error;
} finally {
  await context.close(); await browser.close(); await server.close();
}
