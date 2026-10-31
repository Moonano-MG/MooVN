import test from 'node:test';
import assert from 'node:assert/strict';
import type { SaveSlotData, SceneNode, VNProject } from '../src/types.ts';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { backPreview, createPreviewPlayback, enterPreviewNode, nextPreviewDialogue, restorePreviewSlot } from '../src/lib/previewState.ts';
import { inspectPreviewSaves } from '../src/lib/previewSaves.ts';

function fixture(): VNProject {
  const project = structuredClone(DEFAULT_PROJECT);
  project.characters = [structuredClone(SAMPLE_PROJECT.characters[0])];
  project.variables = [{ key: 'score', label: 'Score', type: 'number', value: 0 }];
  const root: SceneNode = { ...structuredClone(project.nodes[0]), id: 'root', type: 'choice', choices: [] };
  const b: SceneNode = {
    ...structuredClone(root), id: 'b', type: 'math_operation',
    logicConfig: { targetVar: 'score', mathOp: '+=', operandValue: 1 },
    unlockedClueTitle: 'clue-b', unlockedClueDesc: 'first description',
  };
  const c: SceneNode = {
    ...structuredClone(root), id: 'c', type: 'math_operation',
    logicConfig: { targetVar: 'score', mathOp: '+=', operandValue: 100 },
    unlockedClueTitle: 'clue-c', unlockedClueDesc: 'second description',
  };
  project.nodes = [root, b, c];
  project.startNodeId = root.id;
  return project;
}
function slot(): SaveSlotData {
  return {
    slotKey: '1-1', tabId: '1', slotIndex: 1, savedAt: 'time', chapterTitle: 'chapter',
    nodeId: 'b', nodeTitle: 'B', dialogueIndex: 0, speakerName: 'narrator', textPreview: 'line', backgroundId: '',
    affectionSnapshot: { 'char-sample-1': 55 }, customAttrSnapshot: { 'char-sample-1': { trust: 2 } },
    variablesSnapshot: { score: 11 }, previewSnapshotVersion: 1,
    clueSnapshot: [{ title: 'same title', desc: 'the visited description' }],
    textSpeedSnapshot: 32, timedRemainingSnapshot: null,
  };
}

test('choice, entry effects and back preserve distinct immutable snapshots', () => {
  const project = fixture();
  const beforeProject = structuredClone(project);
  const initial = createPreviewPlayback(project, 'root');
  const b = enterPreviewNode(initial, project, 'b', {
    id: 'choice', text: 'choose', targetNodeId: 'b', affectionCharacterId: 'char-sample-1',
    affectionDelta: 5, setVarKey: 'score', setVarValue: 10,
  });
  assert.equal(b.current.variablesMap.score, 11);
  assert.equal(b.current.affectionMap['char-sample-1'], 55);
  assert.deepEqual(b.current.clues, [{ title: 'clue-b', desc: 'first description' }]);
  const c = enterPreviewNode(b, project, 'c');
  assert.equal(c.current.variablesMap.score, 111);
  assert.equal(c.current.clues.length, 2);
  const backToB = backPreview(c);
  assert.deepEqual(backToB.current, b.current);
  assert.equal(backToB.entry, 'restore');
  const backToRoot = backPreview(backToB);
  assert.deepEqual(backToRoot.current, initial.current);
  assert.equal(backToRoot.history.length, 0);
  assert.equal(initial.current.variablesMap.score, 0, 'later transitions must not mutate earlier snapshots');
  assert.deepEqual(project, beforeProject, 'preview state changes must not mutate the project');
});

test('fresh self loops execute once, restart resets state and blocked nodes have no entry effects', () => {
  const project = fixture();
  const root = project.nodes[0];
  root.type = 'math_operation';
  root.logicConfig = { targetVar: 'score', mathOp: '+=', operandValue: 1 };
  const first = createPreviewPlayback(project, 'root');
  const second = enterPreviewNode(first, project, 'root');
  const third = enterPreviewNode(second, project, 'root');
  assert.equal(first.current.variablesMap.score, 1);
  assert.equal(second.current.variablesMap.score, 2);
  assert.equal(third.current.variablesMap.score, 3);
  assert.equal(backPreview(third).current.variablesMap.score, 2);
  const reset = createPreviewPlayback(project, 'root', true, third.visit + 1);
  assert.equal(reset.current.variablesMap.score, 1);
  assert.equal(reset.history.length, 0);

  project.nodes[1].type = 'random_branch';
  const blocked = enterPreviewNode(first, project, 'b');
  assert.equal(blocked.current.variablesMap.score, 1);
  assert.deepEqual(blocked.current.clues, []);
  assert.equal(blocked.current.timedRemaining, null);
});

test('dialogue and timed-choice history restores the captured countdown', () => {
  const project = fixture();
  const root = project.nodes[0];
  root.type = 'timed_choice';
  root.timedChoiceSeconds = 6;
  root.dialogues.push({ ...root.dialogues[0], id: 'second' });
  const initial = createPreviewPlayback(project, 'root');
  assert.equal(initial.current.timedRemaining, null);
  const second = nextPreviewDialogue(initial, root);
  assert.equal(second.current.timedRemaining, 6);
  const threeSecondsLeft = { ...second, current: { ...second.current, timedRemaining: 3 } };
  const fallback = enterPreviewNode(threeSecondsLeft, project, 'b');
  const restored = backPreview(fallback);
  assert.equal(restored.current.dialogueIndex, 1);
  assert.equal(restored.current.timedRemaining, 3);
  const firstLine = backPreview(restored);
  assert.equal(firstLine.current.dialogueIndex, 0);
  assert.equal(firstLine.current.timedRemaining, null);
});

test('current and legacy preview saves restore explicit state and clear old history', () => {
  const project = fixture();
  const previous = enterPreviewNode(createPreviewPlayback(project, 'root'), project, 'c');
  const saved = slot();
  const restored = restorePreviewSlot(previous, project, saved);
  assert.equal(restored.current.variablesMap.score, 11);
  assert.equal(restored.current.affectionMap['char-sample-1'], 55);
  assert.equal(restored.current.customAttrMap['char-sample-1'].trust, 2);
  assert.deepEqual(restored.current.clues, [{ title: 'same title', desc: 'the visited description' }]);
  assert.equal(restored.current.textSpeedMs, 32);
  assert.equal(restored.history.length, 0);
  saved.customAttrSnapshot['char-sample-1'].trust = 9;
  saved.clueSnapshot![0].desc = 'changed later';
  assert.equal(restored.current.customAttrMap['char-sample-1'].trust, 2);
  assert.equal(restored.current.clues[0].desc, 'the visited description');

  const legacy = slot();
  delete legacy.previewSnapshotVersion;
  delete legacy.clueSnapshot;
  delete legacy.textSpeedSnapshot;
  delete legacy.timedRemainingSnapshot;
  const oldRestore = restorePreviewSlot(previous, project, legacy);
  assert.deepEqual(oldRestore.current.clues, []);
  assert.equal(oldRestore.current.textSpeedMs, 24);
  assert.equal(oldRestore.history.length, 0);
  const incomplete = { ...slot(), clueSnapshot: undefined };
  assert.throws(() => restorePreviewSlot(previous, project, incomplete), /快照不完整/);
});

test('preview save validation isolates corrupt and future slots and preserves original values', () => {
  const valid = slot();
  const legacy = { ...slot(), slotKey: '1-2', slotIndex: 2, previewSnapshotVersion: undefined, clueSnapshot: undefined, textSpeedSnapshot: undefined, timedRemainingSnapshot: undefined };
  const future = { ...slot(), slotKey: '1-3', slotIndex: 3, previewSnapshotVersion: 999, unknown: { preserve: true } };
  const broken = { slotKey: '1-4', variablesSnapshot: null, data: ['preserve'] };
  const mismatched = { ...slot(), slotKey: '1-5', slotIndex: 6 };
  const raw = { '1-1': valid, '1-2': legacy, '1-3': future, '1-4': broken, '1-5': mismatched };
  const inspected = inspectPreviewSaves(raw);
  assert.deepEqual(Object.keys(inspected.slots), ['1-1', '1-2']);
  assert.deepEqual(inspected.invalidKeys, ['1-3', '1-4', '1-5']);
  assert.equal(inspected.rawSlots, raw);
  assert.deepEqual(inspected.rawSlots['1-3'], future);
  assert.deepEqual(inspected.rawSlots['1-4'], broken);
  assert.throws(() => inspectPreviewSaves(null), /存档格式错误/);
  assert.throws(() => inspectPreviewSaves([]), /存档格式错误/);
  assert.deepEqual(inspectPreviewSaves({ '1-1': { ...valid, variablesSnapshot: { score: Infinity } } }).invalidKeys, ['1-1']);
  assert.deepEqual(inspectPreviewSaves({ '1-1': { ...valid, clueSnapshot: undefined } }).invalidKeys, ['1-1']);
});
