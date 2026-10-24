import test from 'node:test';
import assert from 'node:assert/strict';

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
  clampAvatarDelta,
  normalizeStageCoordinates,
} from '../src/lib/avatarSystem.ts';

import {
  parsePolyglotFastApiLine,
  translatePolyglotScript,
  evalPolyglotScriptInEngine,
} from '../src/lib/moovnEngineBridge.ts';

import {
  lzCompressBytes,
  lzDecompressBytes,
} from '../src/lib/assetCompressionEngine.ts';

test('1. API Normalization: emits canonical moovn.save and parses legacy moobn.sava one-way', () => {
  // Parse canonical moovn.save and legacy moobn.sava
  const canonicalInst = parsePolyglotFastApiLine('moovn.save:create("Slot_01");');
  assert.ok(canonicalInst);
  assert.equal(canonicalInst.module, 'save');
  assert.equal(canonicalInst.action, 'create');

  const legacyInst = parsePolyglotFastApiLine('moobn.sava:create("Legacy_Slot_02");');
  assert.ok(legacyInst, 'Legacy moobn.sava should be parsed one-way into save module');
  assert.equal(legacyInst.module, 'save');
  assert.equal(legacyInst.action, 'create');

  const scriptInput = `
    moovn.scene:load("ch1_station", "fade")
    moovn.char:enter("ayase", "50,85")
    moovn.text:say("绫濑", "早安，前辈！")
    moovn.save:create("Slot_01")
    moobn.sava:create("Legacy_Slot_02")
  `;
  const evalResult = evalPolyglotScriptInEngine(scriptInput, 'typescript');
  assert.equal(evalResult.instructions.length, 5);

  // Re-compile back to JS, TS, C#, C++, Rust — must NEVER emit moobn.sava
  for (const lang of ['javascript', 'typescript', 'csharp', 'cpp', 'rust'] as const) {
    const output = translatePolyglotScript(scriptInput, lang);
    assert.equal(
      output.includes('moobn'),
      false,
      `Generated ${lang} code must never contain 'moobn'`
    );
    assert.equal(
      output.includes('sava'),
      false,
      `Generated ${lang} code must never contain 'sava'`
    );
    assert.ok(
      output.includes('save:create') || output.includes('save::create'),
      `Generated ${lang} code must emit canonical save:create / save::create`
    );
  }
});

test('2. HTML Escaping & 64-bit FNV-1a Save Checksum + Real LZ77 Byte Compression', () => {
  const malicious = `<img src=x onerror="alert('xss')">&"'`;
  const escaped = escapeHtmlText(malicious);
  assert.equal(
    escaped,
    '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;&quot;&#39;'
  );
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);

  // 64-bit FNV-1a deterministic verification (matches Rust Engine 0xcbf29ce484222325)
  const emptyHash = computeFnv1a64Hex('');
  assert.equal(emptyHash, 'cbf29ce484222325');

  const record = createVerifiedSaveRecord({
    slotKey: 'Slot_01',
    nodeId: 'node_opening',
    nodeTitle: '序章·星海站台',
    dialogueIndex: 2,
    speaker: '绫濑',
    textPreview: '早安，前辈！',
    savedAt: '2026-10-24T12:00:00Z',
    affectionMap: { ayase: 15 },
    customAttributesMap: {},
    globalVars: { key: true },
    unlockedClues: ['clue_ticket'],
    visitedNodeIds: ['node_opening'],
  });
  assert.equal(verifySaveRecord(record), true);

  // Tamper with variables -> checksum verification must fail
  const tampered = { ...record, affectionMap: { ayase: 999 } };
  assert.equal(verifySaveRecord(tampered), false);

  // Real LZ77 byte compression round-trip
  const sampleText = 'moovn.save:create("Slot_01")\n'.repeat(40);
  const rawBytes = new TextEncoder().encode(sampleText);
  const compressed = lzCompressBytes(rawBytes, 6);
  assert.ok(
    compressed.byteLength < rawBytes.byteLength,
    `Compressed size (${compressed.byteLength}) should be smaller than raw size (${rawBytes.byteLength})`
  );
  const decompressed = lzDecompressBytes(compressed);
  assert.deepEqual(Array.from(decompressed), Array.from(rawBytes));
});

test('3. Layout Split-Tree Minimum Ratio Clamping', () => {
  assert.equal(clampSplitRatio(0.02), 0.18, 'Should clamp small ratio to 0.18 minimum');
  assert.equal(clampSplitRatio(0.99), 0.82, 'Should clamp large ratio to 0.82 maximum');
  assert.equal(clampSplitRatio(0.5), 0.5, 'Should preserve valid ratio');
  assert.equal(clampSplitRatio(Number.NaN), 0.5, 'Should fallback NaN to 0.5');
});

test('4. 7-Step Layered ImageAvatar State Machine (Expression, Blink, Lip-Sync, Breathing, Relayout)', () => {
  const avatar = new ImageAvatar({ baseTexture: '/images/characters/ayase_normal.png' });

  // Step 2: Expression table
  avatar.defineExpression('custom_smirk', {
    eyes: 'open',
    mouth: 'talk_a',
    brow: 'angry',
    blush: true,
  });
  avatar.setExpression('custom_smirk');
  assert.equal(avatar.getLayer('brow_angry').visible, true);
  assert.equal(avatar.getLayer('blush').visible, true);

  // Step 3: Subtle breathing is off by default; when enabled, body scaleY stays within [1.0, 1.008]
  assert.equal(avatar.getLayer('body').scaleY, 1.0);
  avatar.setBreathingEnabled(true);
  avatar.update(0.05);
  const bodyScaleY = avatar.getLayer('body').scaleY;
  assert.ok(bodyScaleY >= 1.0 && bodyScaleY <= 1.008, 'Body breathing scaleY must never exceed 1.008');

  // Step 5: Lip-sync tied strictly to text printing (120ms cadence)
  avatar.setExpression('normal');
  avatar.setTalking(true);
  assert.equal(avatar.getLayer('mouth_talk_a').visible, true);
  avatar.update(0.05);
  avatar.update(0.05);
  avatar.update(0.03); // 130ms -> switches to mouth_talk_b
  assert.equal(avatar.getLayer('mouth_talk_b').visible, true);
  avatar.setTalking(false); // Printing finished -> immediately close to neutral
  assert.equal(avatar.getLayer('mouth_neutral').visible, true);
  assert.equal(avatar.getLayer('mouth_talk_a').visible, false);
  assert.equal(avatar.getLayer('mouth_talk_b').visible, false);

  // Step 7: dt clamp prevents background tab jump
  assert.equal(clampAvatarDelta(5.0), 0.05, 'Should clamp large background tab dt to 0.05s');
  const norm = normalizeStageCoordinates(125, -10, 100);
  assert.equal(norm.nx, 1);
  assert.equal(norm.ny, 0);

  // Step 6 & 7: Unified IAvatarRenderable interface & relayout
  const imgRenderable = newImageAvatar({ baseTexture: '/images/characters/ayase_normal.png' });
  const l2dRenderable = newLive2DAvatar('/models/ayase.model3.json');
  imgRenderable.setNormalizedPosition(0.5, 0.85, 1.0);
  const layout = imgRenderable.relayout({ width: 1280, height: 720 });
  assert.equal(layout.anchorX, 640);
  assert.equal(layout.anchorY, 612);
  l2dRenderable.setExpression('smile');
  l2dRenderable.setTalking(true);
  l2dRenderable.update(0.016);
  assert.equal(l2dRenderable.getKind(), 'live2d');
});
