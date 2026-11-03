// Network-intercepted Chromium regression using the real editor/preview UI.
// No real third party is contacted. This is not a native Tauri/WebView test.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

const web = process.argv.includes('--web');
const baseline = process.env.MOOVN_BASELINE === '1';
const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(process.env.MOOVN_E2E_ROOT || (web ? resolve(studio, '../MooVN Web') : studio));
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-remote-media'));
await mkdir(output, { recursive: true });
const edition = web ? 'web' : 'studio';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iR9kAAAAASUVORK5CYII=', 'base64');
const defaultLayers = {
  body: 'https://tracker.invalid/body.png?tracking=body',
  eyes_closed: 'https://tracker.invalid/eyes.png?tracking=eyes',
  hair_front: 'https://tracker.invalid/hair.png?tracking=hair',
};
function makeFixture({ base = 'https://tracker.invalid/portrait.png?tracking=portrait', layers = defaultLayers, mediaType, secondNode = false } = {}) {
  const fixture = structuredClone(DEFAULT_PROJECT);
  fixture.id = 'remote-media-regression';
  fixture.title = '远程媒体隐私回归';
  fixture.characters = structuredClone(SAMPLE_PROJECT.characters);
  fixture.characters[0].mediaUrl = base;
  fixture.characters[0].layerTextures = layers;
  if (mediaType) fixture.characters[0].mediaType = mediaType;
  fixture.nodes[0].characters = structuredClone(SAMPLE_PROJECT.nodes[0].characters);
  fixture.nodes[0].transition = 'none';
  fixture.nodes[0].dialogues[0].text = '第一行';
  if (secondNode) {
    const next = structuredClone(fixture.nodes[0]);
    next.id = 'scene-second'; next.title = '第二个节点';
    next.dialogues[0].id = 'second-line'; next.dialogues[0].text = '第二行';
    next.characters[0].id = 'place-sample-2'; next.nextNodeId = null;
    fixture.nodes[0].nextNodeId = next.id;
    fixture.nodes.push(next);
  }
  return fixture;
}

const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
// Real second origin for CORS/redirect enforcement: Playwright's synthetic
// route.fulfill can bypass CORS in Chromium. This server is loopback-only.
const mediaServer = createHttpServer((request, response) => {
  const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  response.setHeader('cache-control', 'no-store');
  if (path !== '/nocors.png') response.setHeader('access-control-allow-origin', '*');
  if (path === '/redirect.png') {
    response.writeHead(302, { location: 'https://redirect.invalid/beacon.png' });
    response.end();
    return;
  }
  response.writeHead(200, { 'content-type': path === '/svg.png' ? 'image/svg+xml' : 'image/png' });
  response.end(png);
});
let browser;
let origin;
let mediaOrigin;
const errors = [];
const openContexts = new Set();
const mark = (message) => console.log(`✓ ${message}`);
const shot = (page, name) => page.screenshot({ path: resolve(output, `${name}-${edition}.png`) });
const badge = (page) => page.getByRole('button', { name: '远程素材已阻止：示例角色，查看详情' });
const dialog = (page) => page.getByRole('dialog', { name: '允许加载远程素材？' });

async function openFixture(fixture, { mode = 'preview', viewport = { width: 1366, height: 768 }, reducedMotion = 'no-preference', video = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  openContexts.add(context);
  await context.addCookies([{ name: 'remote_session', value: 'must-not-send', url: 'https://tracker.invalid/', sameSite: 'None', secure: true }]);
  await context.addInitScript(() => {
    window.__createdMediaUrls = [];
    window.__revokedMediaUrls = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const value = create(blob); window.__createdMediaUrls.push(value); return value; };
    URL.revokeObjectURL = (value) => { window.__revokedMediaUrls.push(value); return revoke(value); };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (message) => message.accept());
  const requests = [];
  const unexpected = [];
  let webm;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(`${origin}/`) || url === origin) return route.continue();
    if (url.startsWith(`${mediaOrigin}/`)) {
      requests.push({ url, method: request.method(), resourceType: request.resourceType(), headers: await request.allHeaders() });
      return route.continue();
    }
    if (!url.startsWith('https://tracker.invalid/')) {
      unexpected.push(url);
      return route.abort();
    }
    requests.push({ url, method: request.method(), resourceType: request.resourceType(), headers: await request.allHeaders() });
    const path = new URL(url).pathname;
    if (path === '/slow.png') await new Promise((resolve) => setTimeout(resolve, 1500));
    const headers = { 'content-type': path === '/video.webm' ? 'video/webm' : 'image/png', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
    try {
      await route.fulfill({ status: 200, headers, body: path === '/video.webm' ? webm : png });
    } catch (error) {
      // A cancelled slow request may already have been aborted by Chromium.
      if (path !== '/slow.png') throw error;
    }
  });
  await page.goto(`${origin}${web ? '/studio.html' : '/'}`);
  if (video) {
    // Generate a small genuine WebM in Chromium; no external media fixture.
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.captureStream || !MediaRecorder.isTypeSupported('video/webm')) throw new Error('WebM recording unavailable');
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
      recorder.start();
      for (const color of ['red', 'blue', 'green', 'red']) {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 32, 32);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      recorder.stop(); await stopped; stream.getTracks().forEach((track) => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
    });
    webm = Buffer.from(bytes);
    assert(webm.length > 100, 'generated WebM must contain frames');
  }
  const payload = Buffer.from(serializeMpvnProject(fixture));
  await page.locator('input[type=file][accept*="mpvn"]').setInputFiles({ name: 'remote-media.mpvn', mimeType: 'application/json', buffer: payload });
  await page.getByRole('button', { name: '运行预览', exact: true }).waitFor();
  if (mode === 'preview') {
    await page.getByRole('button', { name: '运行预览', exact: true }).click();
  } else if (mode === 'stage') {
    await page.locator('button[title^="舞台预览 (左键"]').click();
  } else if (mode === 'asset') {
    await page.locator('button[title^="素材工坊 (左键"]').click();
    await page.getByRole('button', { name: 'L0/L1 分层立绘装配' }).click();
  }
  return { context, page, requests, unexpected, payload };
}
async function close(opened) {
  await opened.context.close();
  openContexts.delete(opened.context);
}
async function assertNoRemote(opened) {
  await opened.page.waitForTimeout(600); // Allow image, layer and React effects to run.
  assert.equal(opened.requests.length, 0, 'no remote requests before permission');
  assert.deepEqual(opened.unexpected, []);
}
async function openPermission(opened) {
  const before = opened.requests.length;
  await badge(opened.page).waitFor();
  await badge(opened.page).click();
  await dialog(opened.page).waitFor();
  assert.equal(opened.requests.length, before, 'viewing the warning is not consent');
}
async function permit(opened) {
  await openPermission(opened);
  await dialog(opened.page).getByRole('button', { name: '允许并尝试加载' }).click();
}

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite test server did not bind');
  origin = `http://127.0.0.1:${address.port}`;
  await new Promise((resolve, reject) => {
    mediaServer.once('error', reject);
    mediaServer.listen(0, '127.0.0.1', resolve);
  });
  const mediaAddress = mediaServer.address();
  if (!mediaAddress || typeof mediaAddress === 'string') throw new Error('Loopback media server did not bind');
  mediaOrigin = `http://127.0.0.1:${mediaAddress.port}`;
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  if (baseline) {
    const mode = process.argv.includes('--preview') ? 'preview' : 'stage';
    const opened = await openFixture(makeFixture(), { mode });
    await opened.page.locator('[data-character-placement="place-sample-1"]').first().waitFor({ state: 'attached' });
    await opened.page.waitForTimeout(800);
    await opened.page.screenshot({ path: resolve(output, `before-${edition}-${mode}.png`) });
    console.log(`${edition}-${mode}: ${opened.requests.length} unconsented remote requests: ${opened.requests.map((request) => new URL(request.url).pathname).join(', ')}`);
    assert.equal(opened.requests.length, 0, 'opening imported media must not contact the remote host before explicit consent');
    await close(opened);
  } else {
    for (const mode of ['stage', 'preview']) {
      const opened = await openFixture(makeFixture({ secondNode: mode === 'preview' }), { mode });
      await badge(opened.page).waitFor();
      await assertNoRemote(opened);
      await shot(opened.page, `after-${mode}`);
      await openPermission(opened);
      const text = await dialog(opened.page).innerText();
      assert.match(text, /tracker\.invalid/);
      assert.match(text, /IP/);
      assert.match(text, /Cookie/);
      assert.match(text, /重定向/);
      assert.doesNotMatch(text, /tracking=portrait|tracking=body/);
      const showAddress = dialog(opened.page).getByText('查看完整地址（可能含敏感参数）');
      const allow = dialog(opened.page).getByRole('button', { name: '允许并尝试加载' });
      await allow.focus();
      await opened.page.keyboard.press('Tab');
      assert.equal(await showAddress.evaluate((element) => document.activeElement === element), true, 'focus wraps inside the dialog');
      await opened.page.keyboard.press('Shift+Tab');
      assert.equal(await allow.evaluate((element) => document.activeElement === element), true, 'reverse focus also wraps');
      await showAddress.click();
      assert.match(await dialog(opened.page).innerText(), /tracking=portrait/);
      await dialog(opened.page).getByText('查看完整地址（可能含敏感参数）').click();
      await shot(opened.page, `consent-${mode}`);
      await dialog(opened.page).getByRole('button', { name: '取消', exact: true }).click();
      await assertNoRemote(opened);
      await openPermission(opened);
      await opened.page.keyboard.press('Escape');
      await dialog(opened.page).waitFor({ state: 'hidden' });
      assert.equal(opened.requests.length, 0, 'Escape also closes without consent');
      await permit(opened);
      await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
      assert.deepEqual(new Set(opened.requests.map((request) => new URL(request.url).pathname)), new Set(['/portrait.png', '/body.png', '/eyes.png', '/hair.png']));
      assert.equal(opened.requests.length, 4, 'each approved source is fetched once');
      for (const request of opened.requests) {
        assert.equal(request.method, 'GET');
        assert.equal(request.resourceType, 'fetch');
        assert.equal(request.headers.cookie, undefined);
        assert.equal(request.headers.referer, undefined);
      }
      assert.deepEqual(opened.unexpected, []);
      assert.equal(await opened.page.locator('img[src^="https://tracker.invalid"], video[src^="https://tracker.invalid"]').count(), 0);
      assert(await opened.page.locator('[data-avatar-level="L1_LAYERED"] img[src^="blob:"]').count() > 0);
      await shot(opened.page, `allowed-${mode}`);
      const created = await opened.page.evaluate(() => window.__createdMediaUrls.length);
      assert.equal(created, 4);
      if (mode === 'preview') {
        await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).click();
        await badge(opened.page).waitFor();
        await opened.page.waitForFunction(() => window.__revokedMediaUrls.length >= 4);
        assert.equal(opened.requests.length, 4, 'revoking consent does not start a new request');
        await permit(opened);
        await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
        assert.equal(opened.requests.length, 8);
        const player = opened.page.locator('[data-scene-viewport="player"]');
        await player.getByText('第一行', { exact: true }).click();
        await player.getByText('第二行', { exact: true }).waitFor();
        await badge(opened.page).waitFor();
        await opened.page.waitForFunction(() => window.__revokedMediaUrls.length >= 8);
        await opened.page.waitForTimeout(500);
        assert.equal(opened.requests.length, 8, 'the next node must ask again before fetching');
      } else {
        // Reopen the same imported file while the stage remains active. Approval
        // belongs to the old project session, not merely to a reused URL or ID.
        await opened.page.getByTitle('项目中心', { exact: true }).click();
        await opened.page.locator('input[type=file][accept*="mpvn"]').setInputFiles({ name: 'remote-media.mpvn', mimeType: 'application/json', buffer: opened.payload });
        await badge(opened.page).waitFor();
        await opened.page.waitForTimeout(600);
        assert.equal(opened.requests.length, 4, 'opening a new project session must reset approval');
        await opened.page.waitForFunction(() => window.__revokedMediaUrls.length >= 4);
      }
      await close(opened);
      mark(`${mode}: no implicit requests, informed cancel/consent/revocation, blob cleanup and session isolation`);
    }

    {
      const fixture = makeFixture({ base: '', layers: { hair_front: 'https://tracker.invalid/only-layer.png' } });
      const opened = await openFixture(fixture, { mode: 'stage' });
      await badge(opened.page).waitFor();
      await assertNoRemote(opened);
      await permit(opened);
      await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
      assert.deepEqual(opened.requests.map((request) => new URL(request.url).pathname), ['/only-layer.png']);
      await close(opened);

      const placementFixture = makeFixture({ base: '', layers: {} });
      placementFixture.nodes[0].characters[0].mediaUrl = 'https://tracker.invalid/placement.png';
      placementFixture.nodes[0].characters[0].layerTextures = { eyes_closed: 'https://tracker.invalid/placement-eye.png' };
      const placement = await openFixture(placementFixture, { mode: 'preview' });
      await badge(placement.page).waitFor();
      await assertNoRemote(placement);
      await permit(placement);
      await placement.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
      assert.deepEqual(new Set(placement.requests.map((request) => new URL(request.url).pathname)), new Set(['/placement.png', '/placement-eye.png']));
      await close(placement);
      mark('layer-only references and placement overrides cannot bypass permission');
    }

    {
      const opened = await openFixture(makeFixture(), { viewport: { width: 360, height: 780 } });
      await assertNoRemote(opened);
      await openPermission(opened);
      assert.equal(await opened.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await shot(opened.page, 'consent-mobile');
      await dialog(opened.page).getByRole('button', { name: '取消' }).click();
      assert.equal(opened.requests.length, 0);
      await close(opened);
      mark('360px consent remains reachable and cancel stays offline');
    }

    {
      const opened = await openFixture(makeFixture({ secondNode: true }), { mode: 'asset' });
      await badge(opened.page).waitFor();
      await assertNoRemote(opened);
      await permit(opened);
      await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
      assert.equal(opened.requests.length, 4);
      await opened.page.getByRole('button', { name: '章节大纲', exact: true }).click();
      await opened.page.getByText('第二个节点', { exact: true }).first().click();
      await badge(opened.page).waitFor();
      await opened.page.waitForFunction(() => window.__revokedMediaUrls.length >= 4);
      await opened.page.waitForTimeout(300);
      assert.equal(opened.requests.length, 4, 'changing nodes also resets workshop approval');
      await close(opened);
      mark('asset workshop applies and resets the same permission gate');
    }

    for (const [path, expected] of [['redirect.png', /ERR_REMOTE_MEDIA_REQUEST/], ['nocors.png', /ERR_REMOTE_MEDIA_REQUEST/], ['svg.png', /ERR_REMOTE_MEDIA_TYPE/]]) {
      console.log(`checking ${path}`);
      const opened = await openFixture(makeFixture({ base: `${mediaOrigin}/${path}`, layers: {} }));
      await assertNoRemote(opened);
      await permit(opened);
      const failure = opened.page.getByRole('button', { name: '远程素材加载失败：示例角色，查看详情' });
      try {
        await failure.waitFor({ timeout: 8000 });
      } catch (error) {
        await shot(opened.page, `failure-${path}`);
        console.error('remote requests:', opened.requests, 'unexpected:', opened.unexpected, 'notices:', await opened.page.locator('[aria-label="工程媒体状态"]').allTextContents());
        throw error;
      }
      await failure.click();
      assert.match(await dialog(opened.page).getByRole('alert').innerText(), expected);
      assert.equal(opened.requests.length, 1);
      assert.deepEqual(opened.unexpected, [], 'redirect target must not be contacted');
      assert.equal(await opened.page.locator('img[src^="https://tracker.invalid"], video[src^="https://tracker.invalid"]').count(), 0);
      if (path === 'redirect.png') await shot(opened.page, 'redirect-blocked');
      await close(opened);
    }
    mark('redirect, missing CORS and unsupported MIME fail visibly without following to another host');

    {
      const opened = await openFixture(makeFixture({ base: `${mediaOrigin}/a-good.png`, layers: { body: `${mediaOrigin}/nocors.png` } }));
      await permit(opened);
      await opened.page.getByRole('button', { name: '远程素材加载失败：示例角色，查看详情' }).waitFor();
      const urls = await opened.page.evaluate(() => ({ created: window.__createdMediaUrls, revoked: window.__revokedMediaUrls }));
      assert.equal(urls.created.length, 1);
      assert.deepEqual(urls.revoked, urls.created, 'a later failure releases any blobs created earlier');
      assert.equal(opened.requests.length, 2);
      await close(opened);
      mark('partial failure releases already fetched media and never displays raw URLs');
    }

    {
      const opened = await openFixture(makeFixture({ base: 'https://tracker.invalid/csp.png', layers: {} }));
      // Emulate a restrictive connect-src after the app has loaded; this does
      // not represent a real Tauri WebView or prove the packaged desktop CSP.
      await opened.page.evaluate(() => {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "connect-src 'self'";
        document.head.appendChild(meta);
      });
      await permit(opened);
      const failure = opened.page.getByRole('button', { name: '远程素材加载失败：示例角色，查看详情' });
      await failure.waitFor();
      await failure.click();
      assert.match(await dialog(opened.page).getByRole('alert').innerText(), /ERR_REMOTE_MEDIA_REQUEST/);
      assert.equal(opened.requests.length, 0);
      await close(opened);
      mark('simulated restrictive connect-src fails visibly without weakening the desktop policy');
    }

    {
      const opened = await openFixture(makeFixture({ base: 'https://tracker.invalid/slow.png', layers: { body: 'https://tracker.invalid/z-after-cancel.png' } }));
      const firstRequest = opened.page.waitForRequest('https://tracker.invalid/slow.png');
      await permit(opened);
      await firstRequest;
      await opened.page.getByRole('button', { name: '取消加载' }).click();
      await badge(opened.page).waitFor();
      await opened.page.waitForTimeout(1800);
      assert.equal(opened.requests.length, 1);
      assert.equal(await opened.page.evaluate(() => window.__createdMediaUrls.length), 0);
      await close(opened);
      mark('cancelling an in-flight request aborts it and does not display a late result');
    }

    for (const source of ['https://user:password@tracker.invalid/a.png', '/images/../redirect']) {
      const opened = await openFixture(makeFixture({ base: source, layers: {} }));
      await opened.page.getByRole('alert').filter({ hasText: '媒体未加载' }).waitFor();
      await assertNoRemote(opened);
      assert.equal(await opened.page.getByRole('button', { name: /允许并尝试加载/ }).count(), 0);
      await close(opened);
    }
    mark('credentials in URLs and path traversal are rejected without contacting a host');

    {
      const opened = await openFixture(makeFixture({ base: 'https://tracker.invalid/video.webm', layers: {}, mediaType: 'video' }), { video: true });
      await assertNoRemote(opened);
      await permit(opened);
      await opened.page.getByRole('button', { name: '停止远程素材：示例角色' }).waitFor();
      await opened.page.waitForFunction(() => {
        const videoElement = document.querySelector('video');
        return videoElement && videoElement.currentSrc.startsWith('blob:') && videoElement.videoWidth === 32;
      });
      assert.equal(opened.requests.length, 1);
      await close(opened);
      mark('an explicitly approved real WebM loads from a blob, not from a direct video URL');
    }

    assert.deepEqual(errors, []);
    console.log(`${edition} remote-media browser regressions passed; screenshots: ${output}`);
  }
} finally {
  for (const context of openContexts) await context.close();
  if (browser) await browser.close();
  if (mediaServer.listening) await new Promise((resolve, reject) => mediaServer.close((error) => error ? reject(error) : resolve()));
  await server.close();
}
