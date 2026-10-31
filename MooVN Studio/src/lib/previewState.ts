import type { ChoiceOption, SaveSlotData, SceneNode, VNProject } from '../types.ts';
import { getUnsupportedBranchIssue } from './branchSupport.ts';

type Primitive = string | number | boolean;
export interface PreviewClue {
  title: string;
  desc: string;
}

/** The state actually simulated by PreviewPlayer, not the Engine or HTML runtime. */
export interface PreviewSnapshot {
  nodeId: string;
  dialogueIndex: number;
  affectionMap: Record<string, number>;
  customAttrMap: Record<string, Record<string, Primitive>>;
  variablesMap: Record<string, Primitive>;
  clues: PreviewClue[];
  textSpeedMs: number;
  timedRemaining: number | null;
}

export interface PreviewPlayback {
  current: PreviewSnapshot;
  history: PreviewSnapshot[];
  /** Changes on every node entry, including self-loops and restores. */
  visit: number;
  entry: 'fresh' | 'restore';
}

function findNode(project: VNProject, nodeId: string): SceneNode {
  // Preserve the player's existing fallback for dangling links; graph validation
  // remains responsible for reporting those links.
  return project.nodes.find((node) => node.id === nodeId) || project.nodes[0];
}

function initialTimer(node: SceneNode, dialogueIndex: number): number | null {
  if (getUnsupportedBranchIssue(node)) return null;
  return node.type === 'timed_choice' && dialogueIndex === node.dialogues.length - 1
    ? Math.max(1, node.timedChoiceSeconds || 12)
    : null;
}

/** Pure entry effects: returning to a snapshot must never execute these again. */
function enterNode(project: VNProject, snapshot: PreviewSnapshot, nodeId: string): PreviewSnapshot {
  const node = findNode(project, nodeId);
  let next: PreviewSnapshot = {
    ...snapshot,
    nodeId,
    dialogueIndex: 0,
    timedRemaining: initialTimer(node, 0),
  };
  if (getUnsupportedBranchIssue(node)) return next;

  if (node.unlockedClueTitle && !next.clues.some((clue) => clue.title === node.unlockedClueTitle)) {
    next = { ...next, clues: [...next.clues, { title: node.unlockedClueTitle, desc: node.unlockedClueDesc || '' }] };
  }
  if (node.type === 'game_settings_modify' && typeof node.settingsActionConfig?.textSpeedMs === 'number') {
    next = { ...next, textSpeedMs: node.settingsActionConfig.textSpeedMs };
  }
  // Match the preview's existing math subset. Cross-runtime math semantics are
  // deliberately not claimed here and require separate work.
  if (node.type === 'math_operation' && node.logicConfig) {
    const { targetVar, mathOp = '+=', operandValue = 1 } = node.logicConfig;
    const current = Number(next.variablesMap[targetVar] ?? 0);
    const value = Number(operandValue ?? 1);
    const result = mathOp === '+=' ? current + value :
      mathOp === '-=' ? current - value :
      mathOp === '*=' ? current * value :
      mathOp === '/=' && value !== 0 ? Math.floor(current / value) : value;
    next = { ...next, variablesMap: { ...next.variablesMap, [targetVar]: result } };
  } else if (node.type === 'set_variable' && node.variableKey) {
    next = { ...next, variablesMap: { ...next.variablesMap, [node.variableKey]: node.variableValue ?? 1 } };
  }
  return next;
}

export function createPreviewPlayback(project: VNProject, nodeId: string, enter = true, visit = 0): PreviewPlayback {
  const affectionMap: PreviewSnapshot['affectionMap'] = {};
  const customAttrMap: PreviewSnapshot['customAttrMap'] = {};
  for (const character of project.characters) {
    affectionMap[character.id] = character.initialAffection;
    customAttrMap[character.id] = Object.fromEntries(character.customAttributes.map((attr) => [attr.key, attr.value]));
  }
  const variablesMap: PreviewSnapshot['variablesMap'] = Object.fromEntries(project.variables.map((v) => [v.key, v.value]));
  const initial: PreviewSnapshot = {
    nodeId, dialogueIndex: 0, affectionMap, customAttrMap, variablesMap,
    clues: [], textSpeedMs: 24, timedRemaining: null,
  };
  return { current: enter ? enterNode(project, initial, nodeId) : initial, history: [], visit, entry: 'fresh' };
}

/** Take one dialogue step without re-entering the current node. */
export function nextPreviewDialogue(playback: PreviewPlayback, node: SceneNode): PreviewPlayback {
  const dialogueIndex = playback.current.dialogueIndex + 1;
  return {
    ...playback,
    history: [...playback.history, playback.current],
    current: { ...playback.current, dialogueIndex, timedRemaining: initialTimer(node, dialogueIndex) },
  };
}

/** Snapshot before applying choice effects; then execute the destination once. */
export function enterPreviewNode(playback: PreviewPlayback, project: VNProject, nodeId: string, choice?: ChoiceOption): PreviewPlayback {
  let next = playback.current;
  if (choice?.affectionCharacterId && choice.affectionDelta) {
    const charId = choice.affectionCharacterId;
    next = { ...next, affectionMap: { ...next.affectionMap, [charId]: (next.affectionMap[charId] || 0) + choice.affectionDelta } };
  }
  if (choice?.setVarKey !== undefined && choice.setVarValue !== undefined) {
    next = { ...next, variablesMap: { ...next.variablesMap, [choice.setVarKey]: choice.setVarValue } };
  }
  return {
    current: enterNode(project, next, nodeId),
    history: [...playback.history, playback.current],
    visit: playback.visit + 1,
    entry: 'fresh',
  };
}

export function backPreview(playback: PreviewPlayback): PreviewPlayback {
  if (!playback.history.length) return playback;
  return {
    current: playback.history[playback.history.length - 1],
    history: playback.history.slice(0, -1),
    visit: playback.visit + 1,
    entry: 'restore',
  };
}

/** Slots without the preview snapshot fields require explicit legacy confirmation. */
export function restorePreviewSlot(playback: PreviewPlayback, project: VNProject, slot: SaveSlotData): PreviewPlayback {
  const node = findNode(project, slot.nodeId);
  let clues: PreviewClue[] = [];
  let textSpeedMs = 24;
  let timedRemaining = initialTimer(node, slot.dialogueIndex);
  if (slot.previewSnapshotVersion === 1) {
    if (!slot.clueSnapshot || slot.textSpeedSnapshot === undefined || slot.timedRemainingSnapshot === undefined) {
      throw new Error('预览状态快照不完整');
    }
    clues = slot.clueSnapshot.map((clue) => ({ ...clue }));
    textSpeedMs = slot.textSpeedSnapshot;
    timedRemaining = slot.timedRemainingSnapshot;
  }
  return {
    current: {
      nodeId: slot.nodeId,
      dialogueIndex: slot.dialogueIndex,
      affectionMap: { ...slot.affectionSnapshot },
      customAttrMap: structuredClone(slot.customAttrSnapshot),
      variablesMap: { ...slot.variablesSnapshot },
      clues, textSpeedMs, timedRemaining,
    },
    history: [],
    visit: playback.visit + 1,
    entry: 'restore',
  };
}
