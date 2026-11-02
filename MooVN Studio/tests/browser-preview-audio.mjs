// Chromium checks for the editor preview only. Built-in audio is synthesised;
// this does not test native audio devices, custom files or exported games.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

const web = process.argv.includes('--web');
const root = resolve(dirname(fileURLToPath(import.meta.url)), web ? '../../MooVN Web' : '..');
const entry = web ? '/studio.html' : '/';
const output = resolve(process.env.MOOVN_E2E_ARTIFACT_DIR || resolve(root, 'test-results/browser-preview-audio'));
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}${entry}`;
const browser = await chromium.launch({ executablePath: process.env.MOOVN_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const project = structuredClone(DEFAULT_PROJECT);
const first = project.nodes[0];
first.id = 'first'; first.dialogues[0].text = 'FIRST'; first.bgmId = 'bgm-spring-breeze'; first.nextNodeId = 'sound';
const second = structuredClone(first);
second.id = 'sound'; second.type = 'sfx_play'; second.sfxId = 'sfx-school-bell'; second.dialogues[0].id = 'sound-line'; second.dialogues[0].text = 'SECOND'; second.nextNodeId = 'third';
const third = structuredClone(first); third.id = 'third'; third.dialogues[0].id = 'third-line'; third.dialogues[0].text = 'THIRD'; third.nextNodeId = null;
project.nodes = [first, second, third]; project.startNodeId = 'first';
const settings = { platform: 'web', workspaceRootPath: 'browser://MooVN_Workspace', projectsDirectoryPath: 'browser://MooVN_Workspace/Projects', exportOutputDirectoryPath: 'browser://MooVN_Workspace/Exports', cacheDirectoryPath: 'browser://MooVN_Workspace/Cache', settingsFilePath: 'browser://MooVN_Workspace/settings.moovn.json', editorConfig: { autoSaveIntervalSec: 15, coloredNodeCategories: true, defaultScriptLang: 'typescript' }, defaultGameSettings: { textSpeedMs: 78, autoPlayDelayMs: 600, bgmVolume: 35, sfxVolume: 20, motionLevel: 'off' }, performanceConfig: { compressionFormat: 'moovn_lz77', compressionLevel: 5 } };
let context, page;
const errors = [];
async function open(projectToOpen, audioFailure = false) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(({ settings, audioFailure }) => {
    localStorage.setItem('moovn_studio_settings_v3', JSON.stringify(settings));
    window.__gainValues = [];
    window.__frequencies = [];
    window.__disconnects = 0;
    const disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function(...args) { window.__disconnects += 1; return disconnect.apply(this, args); };
    const originalSet = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, time) { window.__gainValues.push(value); return originalSet.call(this, value, time); };
    const originalOsc = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const osc = originalOsc.call(this);
      const originalFrequency = osc.frequency.setValueAtTime.bind(osc.frequency);
      osc.frequency.setValueAtTime = (value, time) => { window.__frequencies.push(value); return originalFrequency(value, time); };
      return osc;
    };
    if (audioFailure === 'constructor') window.AudioContext = class { constructor() { throw new Error('simulated audio failure'); } };
    if (audioFailure === 'resume') {
      Object.defineProperty(AudioContext.prototype, 'state', { get: () => 'suspended' });
      AudioContext.prototype.resume = () => Promise.reject(new Error('simulated autoplay denial'));
    }
  }, { settings, audioFailure });
  await page.goto(origin);
  await page.locator('input[type=file][accept*=".mpvn"]').setInputFiles({ name: 'audio.mpvn', mimeType: 'application/json', buffer: Buffer.from(serializeMpvnProject(projectToOpen)) });
  await page.getByRole('button', { name: '运行预览', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').waitFor();
}
const screenshot = (name) => page.screenshot({ path: resolve(output, `${web ? 'web' : 'studio'}-${name}.png`) });
try {
  await open(project);
  await page.locator('[data-scene-viewport="player"]').getByText('FIRST', { exact: true }).waitFor();
  await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('游戏环境设置').waitFor();
  await screenshot(process.env.MOOVN_BASELINE ? 'baseline-speed' : '01-default-speed');
  const speedText = await page.locator('text=/\\d+ ms\/字/').last().innerText();
  console.log(`preview default speed: ${speedText}`);
  assert.match(speedText, /78 ms\/字/, 'the system default speed must be used in preview');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  const bgmGains = await page.evaluate(() => window.__gainValues);
  assert(bgmGains.some((value) => Math.abs(value - 0.35) < 0.0001), `BGM volume gain missing: ${bgmGains}`);
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('SECOND', { exact: true }).waitFor({ timeout: 1200 });
  const audio = await page.evaluate(() => ({ gain: window.__gainValues, frequencies: window.__frequencies }));
  assert(audio.gain.some((value) => Math.abs(value - 0.2) < 0.0001), `SFX volume gain missing: ${audio.gain}`);
  assert(audio.frequencies.includes(659.25) && audio.frequencies.includes(587.33), `SFX notes missing: ${audio.frequencies}`);
  await screenshot('02-sfx-and-autoplay');
  console.log('✓ configured text speed, autoplay delay and built-in BGM/SFX volume affect preview');
  await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '后退', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('FIRST', { exact: true }).waitFor();
  await page.locator('[data-scene-viewport="player"]').getByText('FIRST', { exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('SECOND', { exact: true }).waitFor();
  const afterReentry = await page.evaluate(() => window.__gainValues.filter((value) => Math.abs(value - 0.2) < 0.0001).length);
  assert.equal(afterReentry, 2, 'a fresh SFX node visit should replay exactly once');
  await page.locator('[data-scene-viewport="player"]').getByText('SECOND', { exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('THIRD', { exact: true }).waitFor();
  await page.locator('[data-scene-viewport="player"]').getByRole('button', { name: '后退', exact: true }).click();
  await page.locator('[data-scene-viewport="player"]').getByText('SECOND', { exact: true }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__gainValues.filter((value) => Math.abs(value - 0.2) < 0.0001).length), 2, 'back restores a node without replaying its entry sound');
  const disconnectedBeforeMute = await page.evaluate(() => window.__disconnects);
  await page.getByRole('button', { name: '静音', exact: true }).click();
  assert(await page.evaluate(() => window.__disconnects) > disconnectedBeforeMute, 'mute disconnects active sound output');
  console.log('✓ fresh visits replay once, restored visits do not, and mute disconnects audio');

  const voice = structuredClone(project);
  voice.nodes[0].type = 'voice_play'; voice.nodes[0].bgmId = ''; voice.nodes[0].dialogues[0].text = 'VOICE';
  await open(voice);
  await page.getByRole('alert').filter({ hasText: 'ERR_PREVIEW_AUDIO_UNSUPPORTED' }).waitFor();
  assert(await page.getByRole('button', { name: '自动', exact: true }).isDisabled());
  const slots = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('moovn_saves_')));
  assert.equal(slots.length, 0, 'unsupported voice cannot overwrite a checkpoint');
  await screenshot('03-voice-blocked');
  console.log('✓ unsupported voice stops before actions or saves');

  await open(project, 'constructor');
  await page.getByRole('alert').filter({ hasText: '音频播放失败' }).waitFor();
  await screenshot('04-audio-error');
  await open(project, 'resume');
  await page.getByRole('alert').filter({ hasText: 'simulated autoplay denial' }).waitFor();
  console.log('✓ simulated Web Audio constructor and autoplay failures are visible');
  assert.deepEqual(errors, []);
  console.log(`${web ? 'Web' : 'Studio'} preview audio checks passed; screenshots: ${output}`);
} catch (error) {
  if (page && !page.isClosed()) {
    try { await screenshot(process.env.MOOVN_BASELINE ? 'baseline-failure' : 'failure'); } catch (screenshotError) { console.error(screenshotError); }
  }
  throw error;
} finally {
  if (context) await context.close();
  await browser.close(); await server.close();
}
