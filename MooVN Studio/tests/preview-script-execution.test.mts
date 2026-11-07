import test from 'node:test';
import assert from 'node:assert/strict';
import type { SaveSlotData, SceneNode, ScriptLanguage } from '../src/types.ts';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { getUnsupportedPreviewIssue } from '../src/lib/previewSupport.ts';
import { parsePreviewScript, resolvePreviewScriptNode } from '../src/lib/previewScript.ts';
import { inspectPreviewSaves } from '../src/lib/previewSaves.ts';
import { persistPreviewScriptSave } from '../src/lib/previewScriptSaves.ts';
import { backPreview, commitPreviewScript, createPreviewPlayback, enterPreviewNode } from '../src/lib/previewState.ts';
import { sha256Json } from '../src/lib/jsonChecksum.ts';

const template = '// script\nmoovn.text.say("旁白", "执行自定义脚本节点");\nmoovn.save.create("Auto_Slot");\n';

function scriptNode(source = template) {
  const node = structuredClone(DEFAULT_PROJECT.nodes[0]);
  node.type = 'script';
  node.scriptLanguage = 'typescript';
  node.customScript = source;
  return node;
}
function scriptSlot(): SaveSlotData {
  return {
    slotKey: 'script-Auto_Slot', tabId: 'script', slotIndex: 0, scriptSlotName: 'Auto_Slot',
    scriptSourceDigest: sha256Json(template), scriptLanguageSnapshot: 'typescript',
    savedAt: 'time', chapterTitle: 'Chapter', nodeId: 'node-1', nodeTitle: 'Script',
    dialogueIndex: 0, speakerName: '旁白', textPreview: '执行自定义脚本节点', backgroundId: '',
    affectionSnapshot: {}, customAttrSnapshot: {}, variablesSnapshot: { count: 7 },
    previewSnapshotVersion: 1, clueSnapshot: [], textSpeedSnapshot: 24, timedRemainingSnapshot: null,
  };
}

test('the standard script-node template is executable rather than blocked', () => {
  const node = scriptNode();
  const original = structuredClone(node);
  assert.equal(getUnsupportedPreviewIssue(node), null);
  const program = parsePreviewScript(node.customScript!, node.scriptLanguage);
  assert.deepEqual(program, { ok: true, say: { speaker: '旁白', text: '执行自定义脚本节点' }, saveName: 'Auto_Slot' });
  const resolved = resolvePreviewScriptNode(node, program);
  assert.equal(resolved.dialogues.length, 1);
  assert.equal(resolved.dialogues[0].speakerName, '旁白');
  assert.equal(resolved.dialogues[0].text, '执行自定义脚本节点');
  assert.deepEqual(node, original, 'preview must not rewrite the authored node');
});

test('trivia and string literals cannot turn quoted or commented calls into actions', () => {
  const comments: Array<[string, ScriptLanguage]> = [
    ['// moovn.save.create("NO")', 'typescript'],
    ['// JS NEL is still a comment\u0085moovn.save.create("NO")', 'javascript'],
    ['/* moovn.save.create("NO"); */', 'typescript'],
    ['/* outer /* moovn::save::create("NO"); */ end */', 'rust'],
  ];
  for (const [source, lang] of comments) {
    assert.deepEqual(parsePreviewScript(source, lang), { ok: true, say: null, saveName: null }, source);
  }
  const inString = parsePreviewScript('moovn.text.say("A", "// moovn.save.create(\\\"NO\\\")");');
  assert.deepEqual(inString, { ok: true, say: { speaker: 'A', text: '// moovn.save.create("NO")' }, saveName: null });
  const separators = parsePreviewScript('// real JS line break\u2028/* safe */ moovn . save . create ( "A" ) ; // tail');
  assert.deepEqual(separators, { ok: true, say: null, saveName: 'A' });
  const escaped = parsePreviewScript('moovn.text.say("A", "line\\n\\u4e2d\\\"B");');
  assert.deepEqual(escaped, { ok: true, say: { speaker: 'A', text: 'line\n中"B' }, saveName: null });
});

test('invalid, extra or host code rejects the entire program, including any preceding valid command', () => {
  const bad = [
    'const s = "moovn.save.create(\\\"A\\\")";',
    'if (false) moovn.save.create("A");',
    '/* /* */ moovn.save.create("A"); */',
    '/* missing end moovn.save.create("A")',
    'moovn.save.create("A"); unknown();',
    'moovn.save.create("A"); moovn.unknown.action();',
    'moovn.save.create("A"); moovn.save.create("B");',
    'moovn.save.create("A"); moovn.text.say("A", "B");',
    'moovn.text.say("A", "B"); moovn.text.say("A", "C");',
    'moovn.save.create("A") moovn.save.create("B")',
    'moovn.save.create("A", "B");',
    'moovn.save.create(slotName);',
    "moovn.save.create('A');",
    'moovn.save.create("");',
    'moovn.save.create("../escape");',
    'moovn.save.create("中");',
    `moovn.save.create("${'a'.repeat(65)}");`,
    'moovn.text.say("A", 1);',
    'moovn.text.say("A", "B", "C");',
    'moovn.text.say("A", "line\nbreak");',
    'moovn.save.create("A");\n*/',
  ];
  for (const source of bad) {
    assert.equal(parsePreviewScript(source, 'typescript').ok, false, source);
    assert.equal(getUnsupportedPreviewIssue(scriptNode(source))?.code, 'ERR_PREVIEW_SCRIPT_UNSUPPORTED', source);
  }
  for (const [source, language] of [
    ['Moovn.Save.Create("A");', 'csharp'], ['moovn::save::create("A");', 'cpp'],
    ['moovn::save::create("A");', 'rust'],
  ] as const) assert.equal(parsePreviewScript(source, language).ok, false);
  const wrongNode = scriptNode('moovn.save.create("A");');
  wrongNode.type = 'math_operation';
  assert.equal(getUnsupportedPreviewIssue(wrongNode)?.code, 'ERR_PREVIEW_SCRIPT_UNSUPPORTED');
  wrongNode.type = 'script';
  wrongNode.unlockedClueTitle = 'extra effect';
  assert.equal(getUnsupportedPreviewIssue(wrongNode)?.code, 'ERR_PREVIEW_SCRIPT_UNSUPPORTED');
});

test('a supported script cannot silently mix in other node actions', () => {
  const mixed: Array<Partial<SceneNode>> = [
    { timedChoiceSeconds: 12 }, { defaultTimeoutTargetId: 'x' },
    { fadeConfig: { targetType: 'screen', direction: 'in', durationMs: 200, easing: 'linear' } },
    { screenTextConfig: { text: 'extra', x: 50, y: 50, fontSize: 24, color: '#fff', align: 'center',
      bgOverlay: 'none', animation: 'fade', durationMs: 1000 } },
    { cameraConfig: { zoom: 1, offsetX: 0, offsetY: 0, durationMs: 1000 } },
    { settingsActionConfig: { openSettingsPanel: true } }, { loopConfig: { repeatCount: 2 } },
    { logicConfig: { targetVar: 'score', operandValue: 1 } }, { waitDurationMs: 500 },
    { toastMessage: 'extra' }, { unlockedClueTitle: 'extra' }, { unlockedClueDesc: 'extra' },
    { targetExpressionCharId: 'c' }, { targetExpressionSpriteId: 's' },
    { affectionTargetCharId: 'c' }, { affectionDelta: 0 }, { variableKey: '' }, { variableValue: false },
    { mediaAnimation: { mediaType: 'video' } }, { endingType: 'good' }, { endingTitle: 'extra' },
    { visualBlocks: [{ id: 'x', category: 'control', kind: 'wait_ms', params: {} }] },
    { childrenNodes: [{ id: 'x', type: 'dialogue', title: 'extra', params: {} }] },
    { choices: [{ id: 'x', text: 'extra', targetNodeId: 'next' }] },
  ];
  for (const extra of mixed) {
    const node = { ...scriptNode(), ...extra };
    assert.notEqual(getUnsupportedPreviewIssue(node), null, JSON.stringify(extra));
  }
});

test('named slots validate their identity, version and complete script signature', () => {
  const good = scriptSlot();
  assert.equal(inspectPreviewSaves({ [good.slotKey]: good }).invalidKeys.length, 0);
  const topProto = JSON.parse(JSON.stringify(good).replace('{', '{"__proto__":{"polluted":true},'));
  const nestedProto = JSON.parse(JSON.stringify({ ...good, clueSnapshot: [{ title: 'x', desc: 'y' }] })
    .replace('"title":"x"', '"__proto__":{"polluted":true},"title":"x"'));
  for (const bad of [
    topProto, nestedProto,
    { ...good, scriptSlotName: '../other' }, { ...good, scriptSlotName: 'other' },
    { ...good, slotIndex: 1 }, { ...good, previewSnapshotVersion: 2 },
    { ...good, scriptSourceDigest: undefined }, { ...good, scriptLanguageSnapshot: undefined },
    { ...good, tabId: 'auto', slotKey: 'auto-0' }, { ...good, variablesSnapshot: { count: Infinity } },
    { ...good, futureField: { doNotOverwrite: true } },
    { ...good, clueSnapshot: [{ title: 'clue', desc: 'desc', futureField: true }] },
  ]) {
    assert.equal(inspectPreviewSaves({ [bad.slotKey]: bad }).invalidKeys.length, 1);
  }
});

test('script save preserves other slots and refuses corruption, conflicts, quota and access failures', () => {
  const good = scriptSlot();
  const future = { version: 999, payload: { preserve: true } };
  let raw: string | null = JSON.stringify({ '1-2': future });
  let writes = 0;
  const storage = {
    getItem: (_key: string) => raw,
    setItem: (_key: string, value: string) => { raw = value; writes++; },
  };
  const success = persistPreviewScriptSave(() => storage, 'key', good);
  assert.equal(success.ok, true);
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(raw!)['1-2'], future);
  assert.deepEqual(JSON.parse(raw!)[good.slotKey], good);

  raw = JSON.stringify({ [good.slotKey]: future, '1-2': future });
  const damagedBefore = raw;
  assert.equal(persistPreviewScriptSave(() => storage, 'key', good).ok, false);
  assert.equal(raw, damagedBefore);
  assert.equal(writes, 1);
  raw = '{invalid';
  assert.equal(persistPreviewScriptSave(() => storage, 'key', good).ok, false);
  assert.equal(raw, '{invalid');
  raw = 'x'.repeat(4 * 1024 * 1024 + 1);
  assert.equal(persistPreviewScriptSave(() => storage, 'key', good).ok, false);
  assert.equal(writes, 1);
  assert.equal(persistPreviewScriptSave(() => { throw new Error('denied'); }, 'key', good).ok, false);

  raw = null;
  const quota = { getItem: () => raw, setItem: () => { throw new Error('quota'); } };
  assert.equal(persistPreviewScriptSave(() => quota, 'key', good).ok, false);
  assert.equal(raw, null);
  let reads = 0;
  const race = { getItem: () => (++reads === 1 ? null : '{"other":true}'), setItem: () => { writes++; } };
  assert.equal(persistPreviewScriptSave(() => race, 'key', good).ok, false);
  assert.equal(writes, 1);
});

test('a scripted destination defers choice changes until success and back discards them', () => {
  const project = structuredClone(DEFAULT_PROJECT);
  const intro = project.nodes[0];
  intro.id = 'intro';
  const target = scriptNode();
  target.id = 'script-node';
  project.nodes = [intro, target];
  project.startNodeId = intro.id;
  const initial = createPreviewPlayback(project, intro.id);
  const choice = { id: 'choice', text: 'choose', targetNodeId: target.id, setVarKey: 'chapterIndex', setVarValue: 17 };
  const pending = enterPreviewNode(initial, project, target.id, choice);
  assert.equal(pending.current.nodeId, target.id);
  assert.equal(pending.current.variablesMap.chapterIndex, 1, 'no choice change before script succeeds');
  assert.equal(pending.pendingScript?.variablesMap.chapterIndex, 17);
  assert.deepEqual(backPreview(pending).current, initial.current);
  const success = commitPreviewScript(pending);
  assert.equal(success.current.variablesMap.chapterIndex, 17);
  assert.equal(success.pendingScript, undefined);
  assert.deepEqual(backPreview(success).current, initial.current);
});
