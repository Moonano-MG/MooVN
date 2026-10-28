// Real browser downloads/imports; the MSVN parser is exercised against the downloaded file.
// This is not an installed desktop, mobile, or runtime chapter-loading test.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { parseMpvnProject } from '../src/lib/mpvnFormat.ts';
import { parseAndDecompressMsvnPackage } from '../src/lib/assetCompressionEngine.ts';

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(studioRoot, 'test-results/browser-formats'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const [edition, root, route] of [
    ['studio', studioRoot, '/'],
    ['web', resolve(studioRoot, '../MooVN Web'), '/studio.html'],
  ]) {
    const server = await createServer({
      root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
      // The Web config's build inputs depend on cwd. Select the real entry for this
      // test instead of scanning the Studio cwd when both servers run in one process.
      optimizeDeps: { entries: [route === '/' ? 'index.html' : 'studio.html'] },
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    let context;
    try {
      await server.listen();
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Vite server did not bind');
      const url = `http://127.0.0.1:${address.port}${route}`;
      context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
      const page = await context.newPage();
      const errors = [];
      const observeErrors = (target) => {
        target.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
        target.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
      };
      observeErrors(page);
      await page.goto(url);
      await page.getByText('打开入门示例工程', { exact: true }).first().click();
      await page.getByRole('button', { name: '导出游戏', exact: true }).first().click();
      await page.getByRole('button', { name: '导出工程 (.mpvn)', exact: true }).click();
      const mpvnDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出 .mpvn', exact: true }).click();
      const mpvn = await mpvnDownload;
      assert.equal(await mpvn.failure(), null);
      const mpvnPath = resolve(output, `${edition}-sample.mpvn`);
      await mpvn.saveAs(mpvnPath);
      const mpvnText = await readFile(mpvnPath, 'utf8');
      const parsedProject = parseMpvnProject(mpvnText);
      assert.equal(parsedProject.ok, true, parsedProject.error);
      assert.equal(parsedProject.integrity, 'sha256');
      assert(parsedProject.project.nodes.length > 0);

      await page.getByRole('button', { name: '导出章节 (.msvn)', exact: true }).click();
      await page.screenshot({ path: resolve(output, `${edition}-chapter-export.png`) });
      const msvnDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出 .msvn', exact: true }).first().click();
      const msvn = await msvnDownload;
      assert.equal(await msvn.failure(), null);
      const msvnPath = resolve(output, `${edition}-sample.msvn`);
      await msvn.saveAs(msvnPath);
      const msvnText = await readFile(msvnPath, 'utf8');
      const parsedChapter = await parseAndDecompressMsvnPackage(msvnText);
      assert.equal(parsedChapter.integrity, 'sha256');
      const changedChapter = JSON.parse(msvnText);
      changedChapter.chapter.title += ' tampered';
      await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(changedChapter)), /ERR_MSVN_CHECKSUM/);
      const expected = parsedProject.project.nodes.filter((node) => node.chapterId === parsedChapter.pkg.chapter.id);
      assert.deepEqual(parsedChapter.nodes, expected);
      console.log(`✓ ${edition}: downloaded .mpvn and .msvn parsed from disk (${expected.length} chapter nodes); modified chapter metadata rejected`);
      assert.deepEqual(errors, [], 'unexpected browser page errors during exports');
      await context.close(); context = undefined;

      context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const importing = await context.newPage();
      observeErrors(importing);
      await importing.goto(url);
      const input = importing.locator('input[type=file][accept*=".mpvn"]');
      const changed = JSON.parse(mpvnText);
      changed.project.title += ' tampered';
      await input.setInputFiles({ name: 'tampered.mpvn', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
      await importing.getByText('ERR_MPVN_CHECKSUM:', { exact: false }).waitFor();
      assert(await importing.getByText('打开入门示例工程', { exact: true }).first().isVisible());
      await importing.screenshot({ path: resolve(output, `${edition}-modified-rejected.png`) });
      await input.setInputFiles(mpvnPath);
      await importing.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
      console.log(`✓ ${edition}: modified .mpvn rejected; original imported through file picker`);
      await context.close(); context = undefined;

      context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const legacyPage = await context.newPage();
      observeErrors(legacyPage);
      await legacyPage.goto(url);
      const legacy = JSON.parse(mpvnText);
      delete legacy.envelopeVersion; delete legacy.integrity;
      const dialogPromise = legacyPage.waitForEvent('dialog');
      await legacyPage.locator('input[type=file][accept*=".mpvn"]').setInputFiles({
        name: 'legacy.mpvn', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
      });
      const dialog = await dialogPromise;
      assert.match(dialog.message(), /旧工程没有文件校验信息/);
      await dialog.accept();
      await legacyPage.getByRole('button', { name: '导出游戏', exact: true }).first().waitFor();
      console.log(`✓ ${edition}: legacy .mpvn opens only after warning`);
      assert.deepEqual(errors, [], 'unexpected browser page or console errors');
    } finally {
      if (context) await context.close();
      await server.close();
    }
  }
  console.log(`Browser format checks passed; files and screenshots: ${output}`);
} finally {
  await browser.close();
}
