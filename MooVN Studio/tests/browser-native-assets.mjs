// Actual editor UI + actual Rust asset_io module, with a test-only IPC transport.
// This is NOT a Tauri/WebView or Windows acceptance test. It creates a disposable
// workspace and injects one deliberately corrupted chunk at the IPC boundary.
// Run with cargo, Playwright Chromium and: npm run test:native-assets:e2e
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(process.env.MOOVN_E2E_ROOT || studio);
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || join(studio, 'test-results/browser-native-assets'));
const baseline = process.env.MOOVN_BASELINE === '1';
const workspace = await mkdtemp(join(tmpdir(), 'moovn-native-asset-e2e-'));
await mkdir(output, { recursive: true });
const targetDir = resolve(process.env.CARGO_TARGET_DIR || join(studio, 'tests/native-io/target'));
const worker = process.env.MOOVN_NATIVE_WORKER || join(targetDir, 'debug', `asset-io-worker${process.platform === 'win32' ? '.exe' : ''}`);
if (!process.env.MOOVN_NATIVE_WORKER) {
  execFileSync('cargo', ['build', '--locked', '--manifest-path', join(studio, 'tests/native-io/Cargo.toml'), '--target-dir', targetDir, '--bin', 'asset-io-worker'], { stdio: 'inherit' });
}
function openWorker(directory) {
  const child = spawn(worker, [directory], { stdio: ['pipe', 'pipe', 'pipe'] });
  const responses = [];
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (part) => { stderr += part; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const pending = responses.shift();
    if (!pending) throw new Error(`Unexpected native test response: ${line}`);
    const [status, ...parts] = line.split('\t');
    if (status === 'ok') pending.resolve(parts);
    else pending.reject(new Error(parts.join('\t')));
  });
  child.on('error', (error) => { while (responses.length) responses.shift().reject(error); });
  child.on('exit', (code) => {
    while (responses.length) responses.shift().reject(new Error(`native worker exited ${code}: ${stderr}`));
  });
  return {
    command(...fields) {
      if (child.exitCode !== null || child.killed) return Promise.reject(new Error(`native worker stopped: ${stderr}`));
      return new Promise((resolve, reject) => {
        const pending = { resolve, reject };
        responses.push(pending);
        child.stdin.write(`${fields.join('\t')}\n`, (error) => {
          if (!error) return;
          const index = responses.indexOf(pending);
          if (index >= 0) responses.splice(index, 1);
          reject(error);
        });
      });
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.stdin.end();
        await closed;
      }
      if (child.exitCode !== 0 || child.signalCode !== null) {
        throw new Error(`native test worker exited ${child.exitCode ?? child.signalCode}: ${stderr}`);
      }
    },
  };
}
const native = openWorker(workspace);
const command = (...fields) => native.command(...fields);
let corruptNextChunk = false;
async function invokeNative(cmd, args) {
  if (cmd === 'begin_asset_upload') return (await command('begin', args.fileName, args.size))[0];
  if (cmd === 'append_asset_upload') {
    const bytes = Buffer.from(args.bytes);
    if (corruptNextChunk) { bytes[0] ^= 1; corruptNextChunk = false; }
    await command('append', args.token, bytes.toString('hex'));
    return null;
  }
  if (cmd === 'finish_asset_upload') return (await command('finish', args.token))[0];
  if (cmd === 'abort_asset_upload') { await command('abort', args.token); return null; }
  if (cmd === 'read_asset_chunk') {
    const [total, hex] = await command('read', args.fileName, args.offset, args.length);
    return { total_bytes: Number(total), bytes: Array.from(Buffer.from(hex, 'hex')) };
  }
  throw new Error(`Unexpected native test command: ${cmd}`);
}

// One transparent PNG; the hash and all disk paths below are test fixtures.
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iR9kAAAAASUVORK5CYII=', 'base64');
const name = `${createHash('sha256').update(image).digest('hex')}.png`;
const stored = join(workspace, 'Assets', name);
const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
const pageErrors = [];
async function setupPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.exposeFunction('invokeNativeForTest', invokeNative);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.getByText('打开入门示例工程', { exact: true }).first().click();
  if (viewport.width < 768) await page.getByRole('button', { name: '素材工坊', exact: true }).click();
  else await page.locator('button[title^="素材工坊 (左键"]').click();
  await page.getByRole('button', { name: 'L0/L1 分层立绘装配' }).click();
  // Switch the existing runtime bridge only after the browser launcher opened.
  // All four asset commands are implemented by the real Rust module above.
  await page.evaluate(() => {
    window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.invokeNativeForTest(cmd, args) };
  });
  return { context, page };
}
function layer(page, label) { return page.getByText(label, { exact: true }).locator('../../..'); }
async function uploadTo(page, label) {
  await layer(page, label).locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
}
async function runViewport(viewport, suffix) {
  const { context, page } = await setupPage(viewport);
  try {
    await uploadTo(page, '后发层 (hair_back)');
    await page.getByText('已为「示例角色」绑定图层 hair_back', { exact: true }).waitFor();
    assert.deepEqual(await readFile(stored), image);

    corruptNextChunk = true;
    await uploadTo(page, '后发层 (hair_back)');
    const failure = page.getByText(/ERR_ASSET_(HASH_MISMATCH|INTEGRITY)/).first();
    await failure.waitFor();
    await failure.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${baseline ? 'before' : 'after'}-${suffix}.png`) });
    const actual = await readFile(stored);
    assert.deepEqual(actual, image, 'a damaged upload must not overwrite the previously committed image');
    assert.match(await page.getByRole('alert').innerText(), /ERR_ASSET_HASH_MISMATCH/);
    assert.equal(await page.getByRole('status').filter({ hasText: '已为' }).count(), 0, 'failed import is not presented as successful');
    assert.deepEqual(await readdir(join(workspace, 'Assets')), [name]);

    // Re-importing the identical, undamaged asset remains usable.
    await uploadTo(page, '后发层 (hair_back)');
    await page.getByRole('status').filter({ hasText: '已为「示例角色」绑定图层 hair_back' }).waitFor();
    assert.deepEqual(await readFile(stored), image);

    // A pre-existing damaged file is not silently replaced or bound to another layer.
    const damaged = Buffer.from('damaged-existing-asset');
    await writeFile(stored, damaged);
    assert.match(await layer(page, '身体素体层 (body)').innerText(), /未绑定/);
    await uploadTo(page, '身体素体层 (body)');
    const conflict = page.getByRole('alert').filter({ hasText: 'ERR_ASSET_CONFLICT' });
    await conflict.waitFor();
    assert.deepEqual(await readFile(stored), damaged);
    assert.match(await layer(page, '身体素体层 (body)').innerText(), /未绑定/);
    assert.deepEqual(await readdir(join(workspace, 'Assets')), [name]);
    await page.screenshot({ path: join(output, `conflict-${suffix}.png`) });
    console.log(`✓ ${suffix}: failed chunk preserved original; duplicate reused; damaged existing asset retained without binding`);
  } finally { await context.close(); }
}
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  await runViewport({ width: 1366, height: 768 }, 'desktop');
  // Restore only this disposable fixture, not a user asset, for the next viewport.
  await writeFile(stored, image);
  await runViewport({ width: 360, height: 780 }, 'mobile');
  assert.deepEqual(pageErrors, []);

  // Separate OS processes race on the same content address. One sends bad
  // bytes; none may replace a committed asset or leave a temporary behind.
  const raceRoot = await mkdtemp(join(tmpdir(), 'moovn-native-asset-race-'));
  const peers = Array.from({ length: 4 }, () => openWorker(raceRoot));
  try {
    const hashName = `${createHash('sha256').update('abc').digest('hex')}.png`;
    const tokens = await Promise.all(peers.map(async (peer, index) => {
      const [token] = await peer.command('begin', hashName, 3);
      await peer.command('append', token, Buffer.from(index === 3 ? 'BAD' : 'abc').toString('hex'));
      return token;
    }));
    const results = await Promise.allSettled(peers.map((peer, index) => peer.command('finish', tokens[index])));
    for (let i = 0; i < 3; i++) assert.equal(results[i].status, 'fulfilled', `valid process ${i} must succeed`);
    assert.equal(results[3].status, 'rejected');
    assert.match(String(results[3].reason), /ERR_ASSET_HASH_MISMATCH/);
    assert.deepEqual(await readFile(join(raceRoot, 'Assets', hashName)), Buffer.from('abc'));
    assert.deepEqual(await readdir(join(raceRoot, 'Assets')), [hashName]);
    console.log('✓ four independent native processes: valid uploads coexist, bad bytes are rejected, original intact');
  } finally {
    await Promise.all(peers.map((peer) => peer.close()));
    await rm(raceRoot, { recursive: true, force: true });
  }
  console.log(`Screenshots: ${output}`);
} finally {
  if (browser) await browser.close();
  await server.close();
  await native.close();
  await rm(workspace, { recursive: true, force: true });
}
