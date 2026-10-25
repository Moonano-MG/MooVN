import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  escapeHtmlText,
  computeFnv1a64Hex,
  createVerifiedSaveRecord,
  verifySaveRecord,
  clampSplitRatio,
} from '../src/lib/vnRuntimeCore.ts';

import {
  ImageAvatar,
  newImageAvatar,
  newLive2DAvatar,
  isLive2DBackendRegistered,
  parseExpressionSpec,
  clampAvatarDelta,
  normalizeStageCoordinates,
} from '../src/lib/avatarSystem.ts';

import {
  parsePolyglotFastApiLine,
  translatePolyglotScript,
  translatePolyglotScriptWithReport,
  evalPolyglotScriptInEngine,
} from '../src/lib/moovnEngineBridge.ts';

import {
  lzCompressBytes,
  lzDecompressBytes,
} from '../src/lib/assetCompressionEngine.ts';

import {
  validateSafeWorkspaceWrite,
  validateSafeAiProxyEndpoint,
} from '../src/lib/devServerSecurity.ts';

import {
  generateChapterYaml,
  parseChapterYaml,
  generateTypeScriptEngineCode,
} from '../src/lib/projectUtils.ts';

import {
  compileAndCheckProjectTypeScript,
  normalizeConditionForCtx,
} from '../src/lib/nodeCodeCompiler.ts';

import {
  serializeMpvnProject,
  parseMpvnProject,
} from '../src/lib/mpvnFormat.ts';

import {
  clampFloatingRect,
  clampAllFloatingWindows,
  normalizeWindowZIndices,
  clampSplitWidths,
} from '../src/lib/windowManager.ts';

import {
  getMissingI18nKeys,
  translateUI,
} from '../src/lib/i18n.ts';

import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';

test('1. Polyglot API & Transpiler: emits syntactically valid code per language, never emits moobn/sava, preserves unrecognized lines', () => {
  const canonicalInst = parsePolyglotFastApiLine('moovn.save.create("Slot_01");');
  assert.ok(canonicalInst);
  assert.equal(canonicalInst.module, 'save');
  assert.equal(canonicalInst.action, 'create');

  const csharpInst = parsePolyglotFastApiLine('Moovn.Save.Create("Slot_02");');
  assert.ok(csharpInst);
  assert.equal(csharpInst.module, 'save');
  assert.equal(csharpInst.action, 'create');

  // Legacy colon syntax still parsed for backwards compatibility
  const legacyColon = parsePolyglotFastApiLine('moovn.save:create("Legacy_Colon");');
  assert.ok(legacyColon);
  assert.equal(legacyColon.module, 'save');

  const scriptInput = [
    'moovn.scene.load("ch1_station", "fade");',
    'moovn.char.enter("ayase", "50,85");',
    'moovn.text.say("绫濑", "早安，前辈！");',
    'const customScore = 42;',
    'moovn.save.create("Slot_01");',
  ].join('\n');

  const evalResult = evalPolyglotScriptInEngine(scriptInput, 'typescript');
  assert.equal(evalResult.instructions.length, 4);

  const tsReport = translatePolyglotScriptWithReport(scriptInput, 'typescript');
  assert.ok(tsReport.code.includes('moovn.save.create("Slot_01");'), 'TS output must use valid dot syntax moovn.save.create');
  assert.equal(tsReport.code.includes('moovn.save:create'), false, 'TS output must NOT emit invalid colon method call');
  assert.equal(tsReport.unrecognizedLines.length, 1, 'Should report 1 unrecognized host code line');
  assert.equal(tsReport.unrecognizedLines[0].content, 'const customScore = 42;');
  assert.ok(tsReport.code.includes('const customScore = 42;'), 'Unrecognized line must be preserved, never silently dropped');

  const csOutput = translatePolyglotScript(scriptInput, 'csharp');
  assert.ok(csOutput.includes('Moovn.Save.Create("Slot_01");'), 'C# output must use PascalCase Moovn.Save.Create');

  const cppOutput = translatePolyglotScript(scriptInput, 'cpp');
  assert.ok(cppOutput.includes('moovn::save::create("Slot_01");'), 'C++ output must use :: syntax');

  const rsOutput = translatePolyglotScript(scriptInput, 'rust');
  assert.ok(rsOutput.includes('moovn::save::create("Slot_01");'), 'Rust output must use :: syntax');

  for (const lang of ['javascript', 'typescript', 'csharp', 'cpp', 'rust'] as const) {
    const out = translatePolyglotScript(scriptInput, lang);
    assert.equal(out.includes('moobn'), false, `${lang} must never contain moobn`);
    assert.equal(out.includes('sava'), false, `${lang} must never contain sava`);
  }
});

test('2. Security Guards: path traversal, customDir rejection, extension allowlist, and SSRF protection', () => {
  const workspaceRoot = '/tmp/moovn-test-workspace';

  // Reject customDir override (`GPT-03`, `Kimi 1C`)
  const customDirAttempt = validateSafeWorkspaceWrite(
    workspaceRoot,
    'Projects',
    'demo.mpvn',
    '/etc'
  );
  assert.equal(customDirAttempt.ok, false);
  assert.equal(customDirAttempt.code, 'ERR_CUSTOM_DIR_FORBIDDEN');

  // Reject path traversal (`..`)
  const traversalAttempt = validateSafeWorkspaceWrite(
    workspaceRoot,
    'Projects',
    '../../etc/passwd'
  );
  assert.equal(traversalAttempt.ok, false);

  // Reject dangerous executable extensions
  const exeAttempt = validateSafeWorkspaceWrite(
    workspaceRoot,
    'Exports',
    'payload.exe'
  );
  assert.equal(exeAttempt.ok, false);
  assert.equal(exeAttempt.code, 'ERR_EXTENSION_NOT_ALLOWED');

  // Allow valid project file
  const validWrite = validateSafeWorkspaceWrite(
    workspaceRoot,
    'Projects',
    'my_story.mpvn'
  );
  assert.equal(validWrite.ok, true);

  // SSRF protection (`GPT-04`, `Kimi 1D`)
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'http://127.0.0.1:8080/v1/chat').ok, false);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://localhost/v1/chat').ok, false);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://169.254.169.254/latest/meta-data').ok, false);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://192.168.1.10/v1/chat').ok, false);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://evil.example.com/v1/chat').ok, false);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://api.openai.com/v1/chat/completions').ok, true);
  assert.equal(validateSafeAiProxyEndpoint('openai_compatible', 'https://api.deepseek.com/v1/chat/completions').ok, true);
});

test('3. Save Integrity & HTML Escaping & Real LZ77 Byte Compression', () => {
  const malicious = `<img src=x onerror="alert('xss')">&"'`;
  const escaped = escapeHtmlText(malicious);
  assert.equal(
    escaped,
    '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;&quot;&#39;'
  );

  const emptyHash = computeFnv1a64Hex('');
  assert.equal(emptyHash, 'cbf29ce484222325');

  const record = createVerifiedSaveRecord({
    slotKey: 'Slot_01',
    nodeId: 'node_opening',
    nodeTitle: '序章·星海站台',
    dialogueIndex: 2,
    speaker: '绫濑',
    textPreview: '早安，前辈！',
    savedAt: '2026-10-25T12:00:00Z',
    affectionMap: { ayase: 15 },
    customAttributesMap: {},
    globalVars: { key: true },
    unlockedClues: ['clue_ticket'],
    visitedNodeIds: ['node_opening'],
  });
  assert.equal(record.schemaVersion, 2);
  assert.equal(verifySaveRecord(record), true);

  // Tamper with affection, variables, or nodeId -> checksum verification must fail (`GPT-08`, `Kimi 1M`)
  assert.equal(verifySaveRecord({ ...record, affectionMap: { ayase: 999 } }), false);
  assert.equal(verifySaveRecord({ ...record, globalVars: { key: false } }), false);
  assert.equal(verifySaveRecord({ ...record, nodeId: 'hacked_node' }), false);

  // Missing checksum must fail verification (`Kimi 1N`)
  const withoutChecksum = { ...record, checksumFnv64: '' };
  assert.equal(verifySaveRecord(withoutChecksum), false);

  // Real LZ77 byte compression round-trip
  const sampleText = 'moovn.save.create("Slot_01");\n'.repeat(40);
  const rawBytes = new TextEncoder().encode(sampleText);
  const compressed = lzCompressBytes(rawBytes, 6);
  assert.ok(compressed.byteLength < rawBytes.byteLength);
  const decompressed = lzDecompressBytes(compressed);
  assert.deepEqual(Array.from(decompressed), Array.from(rawBytes));
});

test('4. YAML Schema Round-Trip & TS String Escaping & Node Compiler Diagnostics', () => {
  // Test YAML round-trip with colons, quotes, and multi-line strings (`GPT-11`, `Kimi 1P`, `2E`)
  const testProject = structuredClone(DEFAULT_PROJECT);
  testProject.nodes[0].dialogues[0].text = '第一行：包含 "双引号" 与 : 冒号\n第二行：换行文本';
  const yamlStr = generateChapterYaml(testProject, testProject.chapters[0].id);
  assert.ok(yamlStr.includes('moovn_schema: "1.0"'));
  const parsedYaml = parseChapterYaml(yamlStr);
  assert.equal(parsedYaml.ok, true);
  assert.equal(
    parsedYaml.nodes?.[0].dialogues[0].text,
    '第一行：包含 "双引号" 与 : 冒号\n第二行：换行文本'
  );

  // Verify scenes/scene_01.yaml conforms to the same schema (`Kimi 1P`)
  const scene01Path = path.resolve(import.meta.dirname, '../scenes/scene_01.yaml');
  const scene01Raw = fs.readFileSync(scene01Path, 'utf-8');
  const scene01Doc = parseChapterYaml(scene01Raw);
  assert.equal(scene01Doc.ok, true);
  assert.ok((scene01Doc.nodes?.length ?? 0) >= 1);

  // Verify TS code generation escapes quotes and newlines safely (`Kimi 1F`)
  const tsEngineCode = generateTypeScriptEngineCode(testProject);
  assert.ok(tsEngineCode.includes('\\n'), 'Multi-line dialogue must be JSON-escaped in generated TS');

  // Verify condition normalization (`Kimi 1E`: `affection >= 50` -> `ctx.affection[...] >= 50`)
  const normCond = normalizeConditionForCtx('affection >= 50', 'protagonist');
  assert.equal(normCond, '(ctx.affection["protagonist"] ?? 0) >= 50');

  // Verify honest MVN diagnostics and real line numbers (`GPT-12`, `Kimi 2F`, `2G`)
  const report = compileAndCheckProjectTypeScript(testProject);
  assert.equal(report.errorCount, 0);
  assert.ok(report.lineCount > 10);
});

test('5. MPVN Serialization & Validation: size guard, prototype pollution guard, schema validation', () => {
  const serialized = serializeMpvnProject(DEFAULT_PROJECT);
  const restored = parseMpvnProject(serialized);
  assert.equal(restored.ok, true);
  assert.equal(restored.project?.id, DEFAULT_PROJECT.id);
  assert.equal(restored.project?.chapters.length, DEFAULT_PROJECT.chapters.length);

  // Reject prototype pollution (`GPT-46`)
  const polluted = parseMpvnProject(
    '{"__proto__": {"polluted": true}, "chapters": [], "nodes": []}'
  );
  assert.equal(polluted.ok, false);
  assert.ok(polluted.error?.includes('ERR_PROTOTYPE_POLLUTION'));

  // Reject empty nodes array in schema validation
  const badSchema = parseMpvnProject(
    JSON.stringify({
      magic: 'MPVN_STUDIO_PROJECT',
      format: 'mpvn',
      project: {
        ...DEFAULT_PROJECT,
        nodes: [],
      },
    })
  );
  assert.equal(badSchema.ok, false);
});

test('6. Layered Avatar L0 vs L1 Honesty & Live2D SDK Guard', () => {
  // Single flat image -> L0_STATIC with explicit missing layer warnings (`GPT-17`, `Kimi 2C`)
  const l0Avatar = newImageAvatar({ baseTexture: '/images/characters/char-yukina-1.png' });
  assert.equal(l0Avatar.getCapabilityLevel(), 'L0_STATIC');
  assert.equal(l0Avatar.hasLayeredParts(), false);
  assert.ok(l0Avatar.getMissingLayerWarnings().length >= 2);

  // Multi-layer textures -> L1_LAYERED (`GPT-17`)
  const l1Avatar = new ImageAvatar({
    baseTexture: '/images/characters/body.png',
    layerTextures: {
      body: '/images/characters/body.png',
      eyes_open: '/images/characters/eyes_open.png',
      eyes_closed: '/images/characters/eyes_closed.png',
      mouth_neutral: '/images/characters/mouth_neutral.png',
      mouth_talk_a: '/images/characters/mouth_talk_a.png',
      mouth_talk_b: '/images/characters/mouth_talk_b.png',
    },
  });
  assert.equal(l1Avatar.getCapabilityLevel(), 'L1_LAYERED');
  assert.equal(l1Avatar.hasLayeredParts(), true);
  assert.equal(l1Avatar.getMissingLayerWarnings().length, 0);

  // Expression DSL: only `eyes=closed` closes eyes (`Kimi 7F`)
  const happyRule = parseExpressionSpec('happy', 'eyes=open; mouth=talk_a');
  assert.equal(happyRule.eyes, 'open');
  const closedRule = parseExpressionSpec('blink', 'eyes=closed; mouth=neutral');
  assert.equal(closedRule.eyes, 'closed');

  // Breathing & Lip-sync
  l1Avatar.setBreathingEnabled(true);
  l1Avatar.update(0.05);
  assert.ok(l1Avatar.getLayer('body').scaleY <= 1.008);

  l1Avatar.setTalking(true);
  assert.equal(l1Avatar.getLayer('mouth_talk_a').visible, true);
  l1Avatar.update(0.05);
  l1Avatar.update(0.05);
  l1Avatar.update(0.03);
  assert.equal(l1Avatar.getLayer('mouth_talk_b').visible, true);
  l1Avatar.setTalking(false);
  assert.equal(l1Avatar.getLayer('mouth_neutral').visible, true);

  // Live2D must NOT silently degrade to static image when unconfigured (`GPT-16`, `Kimi 2B`)
  assert.equal(isLive2DBackendRegistered(), false);
  assert.throws(() => {
    newLive2DAvatar('/models/ayase.model3.json');
  }, /ERR_LIVE2D_SDK_NOT_CONFIGURED/);

  assert.equal(clampAvatarDelta(5.0), 0.05);
  const norm = normalizeStageCoordinates(125, -10, 100);
  assert.equal(norm.nx, 1);
  assert.equal(norm.ny, 0);
});

test('7. Window Manager Clamping, Z-Index Normalization & Split Ratios', () => {
  assert.equal(clampSplitRatio(0.02), 0.18);
  assert.equal(clampSplitRatio(0.99), 0.82);

  // Clamp off-screen floating window into 1280x800 and 900x560 viewports (`GPT-19`, `GPT-24`, `Kimi 1L`)
  const clamped1280 = clampFloatingRect(
    { x: -500, y: 2000, width: 1600, height: 1200 },
    { width: 1280, height: 800 },
    280,
    200
  );
  assert.ok(clamped1280.x >= 8);
  assert.ok(clamped1280.y >= 44);
  assert.ok(clamped1280.x + clamped1280.width <= 1280 - 8);
  assert.ok(clamped1280.y + clamped1280.height <= 800 - 32);

  const clamped900 = clampAllFloatingWindows(
    [
      { id: 'stage', title: 'Stage', x: 850, y: 520, width: 600, height: 450, zIndex: 999 },
    ],
    { width: 900, height: 560 }
  );
  assert.ok(clamped900[0].x >= 8);
  assert.ok(clamped900[0].x + clamped900[0].width <= 900 - 8);
  assert.ok(clamped900[0].y + clamped900[0].height <= 560 - 32);

  // Z-Index normalization (`Kimi 3E`)
  const normalized = normalizeWindowZIndices(
    [
      { id: 'a', title: 'A', x: 20, y: 60, width: 300, height: 240, zIndex: 1050 },
      { id: 'b', title: 'B', x: 40, y: 80, width: 300, height: 240, zIndex: 2099 },
    ],
    'a'
  );
  const aWin = normalized.find((w) => w.id === 'a')!;
  const bWin = normalized.find((w) => w.id === 'b')!;
  assert.equal(bWin.zIndex, 40);
  assert.equal(aWin.zIndex, 41);

  // Split widths preserve at least 320px for center canvas (`GPT-25`)
  const splits = clampSplitWidths(400, 500, 220, { width: 900, height: 560 }, false, false);
  assert.ok(900 - splits.leftWidth - splits.rightWidth >= 320);
});

test('8. i18n Completeness Across All 4 Locales (zh-CN, zh-TW, en-US, ja-JP)', () => {
  const missing = getMissingI18nKeys();
  assert.deepEqual(missing, [], `Missing i18n keys found: ${JSON.stringify(missing)}`);
  assert.equal(translateUI('left.tabNodes', 'en-US'), 'Nodes');
  assert.equal(translateUI('status.nodes', 'ja-JP'), 'シーンノード');
});
