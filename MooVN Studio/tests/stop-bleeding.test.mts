import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { NODE_REGISTRY } from '../src/data/nodeRegistry.ts';
import { buildStandaloneGameHtml } from '../src/lib/gamePackager.ts';
import { validateStandaloneHtmlProject } from '../src/lib/htmlExportValidation.ts';
import { translatePolyglotScriptWithReport } from '../src/lib/moovnEngineBridge.ts';
import { validateSafeAiProxyEndpoint, ALLOWED_AI_UPSTREAM_HOSTS } from '../src/lib/devServerSecurity.ts';
import { ImageAvatar } from '../src/lib/avatarSystem.ts';

const project = () => structuredClone(DEFAULT_PROJECT);

test('HTML builder accepts a minimal narrative but blocks every unsupported registered node', () => {
  const minimal = project();
  assert.deepEqual(validateStandaloneHtmlProject(minimal), []);
  assert.match(buildStandaloneGameHtml(minimal), /<!DOCTYPE html>/);
  for (const { type } of NODE_REGISTRY) {
    if (['dialogue', 'narration', 'choice'].includes(type)) continue;
    const altered = project();
    altered.nodes[0].type = type;
    const issues = validateStandaloneHtmlProject(altered);
    assert.ok(issues.some((entry) => entry.nodeId === altered.nodes[0].id && entry.message.includes(type)), type);
    assert.throws(() => buildStandaloneGameHtml(altered), /HTML 导出已阻止/);
  }
});

test('HTML exporter fails closed for unsupported settings, conditions, dangling targets and audio', () => {
  const altered = project();
  const node = altered.nodes[0];
  node.type = 'condition';
  node.conditionRule = { variableType: 'global_var', attributeKey: 'x', operator: '<=', compareValue: 2, trueTargetNodeId: 'missing', falseTargetNodeId: 'missing' };
  node.bgmId = 'music';
  node.customScript = 'moovn.save.create("slot");';
  node.nextNodeId = 'missing';
  const issues = validateStandaloneHtmlProject(altered);
  for (const term of ['条件', '音频', '脚本', '下一节点']) {
    assert.ok(issues.some((entry) => entry.message.includes(term)), term);
  }
  assert.throws(() => buildStandaloneGameHtml(altered), /HTML 导出已阻止/);
  const choice = project();
  choice.nodes[0].type = 'choice';
  choice.nodes[0].choices = [{ id: 'c', text: 'go', targetNodeId: choice.nodes[0].id, conditionExpr: 'score > 1' }];
  assert.ok(validateStandaloneHtmlProject(choice).some((entry) => entry.message.includes('条件表达式')));
});

test('HTML export embeds untrusted project text safely inside the script', () => {
  const minimal = project();
  const payload = '</script><img src=x onerror=alert(1)>';
  minimal.title = payload;
  minimal.nodes[0].dialogues[0].text = payload;
  const html = buildStandaloneGameHtml(minimal);
  assert.ok(!html.includes(payload));
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.match(html, /&lt;\/script&gt;/);
});

test('API rewrite keeps comments, whitespace, CRLF, arguments and host statements verbatim', () => {
  const source = [
    '  # unchanged comment  ',
    '/* outer',
    ' /* nested */',
    'moovn.save.create("inside-comment");',
    '*/',
    'const x = `',
    'moovn.save.create("inside-template");',
    '`;',
    'let rust = r##"',
    'moovn.save.create("inside-raw");',
    '"##;',
    'auto cpp = R"tag(',
    'moovn.save.create("inside-cpp-raw");',
    ')tag";',
    '  moovn.text.say("A\\nB", build(name, 2));  ',
    'moovn.save.create("x"); // keep inline comment',
    'const x = 4;',
    '   ',
  ].join('\r\n');
  const report = translatePolyglotScriptWithReport(source, 'csharp');
  assert.equal(report.convertedCount, 1);
  assert.equal(report.code, source.replace('  moovn.text.say(', '  Moovn.Text.Say('));
});

test('AI endpoint policy rejects credentials, query, fragments, unusual ports and redirects must be blocked in the client', () => {
  for (const url of [
    'http://api.openai.com/v1', 'https://evil.example/v1', 'https://api.openai.com.evil.example/v1',
    'https://name:secret@api.openai.com/v1', 'https://api.openai.com/v1?key=secret',
    'https://api.openai.com/v1#fragment', 'https://api.openai.com:444/v1',
    'http://127.0.0.1:11434/v1',
  ]) assert.equal(validateSafeAiProxyEndpoint('openai_compatible', url).ok, false, url);
  for (const host of ALLOWED_AI_UPSTREAM_HOSTS) assert.equal(validateSafeAiProxyEndpoint('openai_compatible', `https://${host}/v1`).ok, true, host);
  assert.equal(validateSafeAiProxyEndpoint('ollama_local', 'http://localhost:11434/v1').ok, true);
  for (const url of ['http://localhost/v1', 'https://localhost:11434/v1', 'http://localhost:11435/v1']) {
    assert.equal(validateSafeAiProxyEndpoint('ollama_local', url).ok, false, url);
  }
  const client = readFileSync(new URL('../src/components/AiAssistantPanel.tsx', import.meta.url), 'utf8');
  assert.match(client, /validateSafeAiProxyEndpoint\('openai_compatible', config\.baseUrl\)/);
  assert.match(client, /redirect: 'error'/);
  const check = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/sync-tauri-csp.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('static and layered avatars never stretch the body; missing layers do not erase neutral parts', () => {
  const staticAvatar = new ImageAvatar({ baseTexture: '/portrait.png', randomSeed: () => 0 });
  for (let i = 0; i < 700; i++) staticAvatar.update(0.02);
  assert.equal(staticAvatar.getLayer('body').scaleY, 1);
  staticAvatar.setParameter('ParamBreath', 1);
  assert.equal(staticAvatar.getLayer('body').scaleY, 1, 'manual parameters cannot scale the portrait either');
  staticAvatar.setExpression('blink');
  assert.equal(staticAvatar.getLayer('eyes_open').visible, true, 'missing closed eyes must not erase open eyes');
  staticAvatar.setParameter('ParamEyeLOpen', 0);
  assert.equal(staticAvatar.getLayer('eyes_open').visible, true);
  staticAvatar.setParameter('ParamMouthOpenY', 1);
  assert.equal(staticAvatar.getLayer('mouth_neutral').visible, true);
  assert.equal(staticAvatar.getLayer('eyes_closed').visible, false);
  staticAvatar.setTalking(true);
  assert.equal(staticAvatar.getLayer('mouth_neutral').visible, true);
  const partial = new ImageAvatar({ layerTextures: { mouth_talk_a: '/a.png' }, randomSeed: () => 0 });
  partial.setTalking(true);
  for (let i = 0; i < 8; i++) partial.update(0.02);
  assert.equal(partial.getLayer('body').scaleY, 1);
  assert.equal(partial.getLayer('mouth_talk_a').visible, true, 'missing mouth B reuses A');
  partial.setTalking(false);
  partial.setParameter('ParamMouthOpenY', 1);
  assert.equal(partial.getLayer('mouth_talk_a').visible, true, 'manual B also reuses A');
  assert.equal(partial.getLayer('eyes_open').visible, true, 'missing closed eye does not blink');
  assert.ok(partial.getMissingLayerWarnings().some((warning) => warning.includes('eyes_closed')));
  assert.ok(partial.getMissingLayerWarnings().some((warning) => warning.includes('mouth_talk_b')));
});

test('HTML low-level builder rejects unhydrated workspace image references', () => {
  const sample = project();
  const profile = structuredClone(SAMPLE_PROJECT.characters[0]);
  sample.characters.push(profile);
  profile.mediaUrl = 'moovn-asset://missing-image';
  sample.nodes[0].characters = [{
    id: 'test-placement', characterId: profile.id, name: profile.name, spriteId: profile.spriteId,
    x: 50, y: 100, scale: 1, opacity: 1, flipX: false,
  }];
  assert.equal(validateStandaloneHtmlProject(sample).length, 0, 'UI may first hydrate a workspace reference');
  assert.throws(() => buildStandaloneGameHtml(sample), /未加载的素材 URL/);
});

test('native engine errors are not silently downgraded to a successful web check', async () => {
  const { evalPolyglotScriptInEngineAsync } = await import('../src/lib/moovnEngineBridge.ts');
  const oldWindow = globalThis.window;
  try {
    // The real Tauri bridge detects this runtime function, which intentionally rejects.
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      __TAURI_INTERNALS__: { invoke: async () => { throw new Error('ERR_ENGINE_LOCK: unavailable'); } },
    }});
    await assert.rejects(evalPolyglotScriptInEngineAsync('moovn.save.create("x");', 'typescript'), /未执行且未自动降级.*ERR_ENGINE_LOCK/);
  } finally {
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow });
  }
});
