import { z } from 'zod';
import type { SaveSlotData } from '../types.ts';
import { isPreviewScriptSlotName } from './previewScript.ts';

const primitive = z.union([z.string(), z.number().finite(), z.boolean()]);
const saveTab = z.enum(['auto', 'quick', 'script', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
const scriptSlotFields = new Set([
  'slotKey', 'tabId', 'slotIndex', 'savedAt', 'chapterTitle', 'nodeId', 'nodeTitle', 'dialogueIndex',
  'speakerName', 'textPreview', 'backgroundId', 'affectionSnapshot', 'customAttrSnapshot', 'variablesSnapshot',
  'unlockedClues', 'previewSnapshotVersion', 'clueSnapshot', 'textSpeedSnapshot', 'timedRemainingSnapshot',
  'scriptSlotName', 'scriptSourceDigest', 'scriptLanguageSnapshot',
]);
const slotSchema = z.object({
  slotKey: z.string(), tabId: saveTab, slotIndex: z.number().int().min(0).max(6),
  savedAt: z.string(), chapterTitle: z.string(), nodeId: z.string().min(1), nodeTitle: z.string(),
  dialogueIndex: z.number().int().min(0), speakerName: z.string(), textPreview: z.string(), backgroundId: z.string(),
  affectionSnapshot: z.record(z.string(), z.number().finite()),
  customAttrSnapshot: z.record(z.string(), z.record(z.string(), primitive)),
  variablesSnapshot: z.record(z.string(), primitive),
  unlockedClues: z.array(z.string()).optional(),
  previewSnapshotVersion: z.literal(1).optional(),
  clueSnapshot: z.array(z.object({ title: z.string(), desc: z.string() })).optional(),
  textSpeedSnapshot: z.number().int().min(10).max(80).optional(),
  timedRemainingSnapshot: z.number().finite().positive().nullable().optional(),
  scriptSlotName: z.string().optional(),
  scriptSourceDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  scriptLanguageSnapshot: z.enum(['javascript', 'typescript']).optional(),
}).passthrough().superRefine((slot, ctx) => {
  if (slot.tabId === 'script') {
    if (!slot.scriptSlotName || !isPreviewScriptSlotName(slot.scriptSlotName) || slot.slotIndex !== 0 ||
        slot.slotKey !== `script-${slot.scriptSlotName}` || slot.previewSnapshotVersion !== 1 ||
        slot.scriptSourceDigest === undefined || slot.scriptLanguageSnapshot === undefined ||
        Object.keys(slot).some((field) => !scriptSlotFields.has(field))) {
      ctx.addIssue({ code: 'custom', message: '脚本存档标识或执行记录无效' });
    }
  } else if (slot.slotKey !== `${slot.tabId}-${slot.slotIndex}` || slot.scriptSlotName !== undefined) {
    ctx.addIssue({ code: 'custom', message: '存档槽标识不一致' });
  }
  if ((slot.scriptSourceDigest === undefined) !== (slot.scriptLanguageSnapshot === undefined)) {
    ctx.addIssue({ code: 'custom', message: '脚本执行记录不完整' });
  }
  if (slot.previewSnapshotVersion === 1 && (
    slot.clueSnapshot === undefined || slot.textSpeedSnapshot === undefined || slot.timedRemainingSnapshot === undefined
  )) {
    ctx.addIssue({ code: 'custom', message: '预览状态快照不完整' });
  }
});

/** Inspect the original JSON before Zod can strip special or future fields. */
function validRawScriptSlot(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (Object.keys(root).some((field) => !scriptSlotFields.has(field))) return false;
  if (Array.isArray(root.clueSnapshot) && root.clueSnapshot.some((clue: unknown) =>
    !clue || typeof clue !== 'object' || Array.isArray(clue) ||
    Object.keys(clue).some((field) => field !== 'title' && field !== 'desc'))) return false;
  const pending: Array<{ value: object; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new WeakSet<object>();
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (item.depth > 8 || seen.has(item.value) || ++visited > 100_000) return false;
    seen.add(item.value);
    for (const [key, child] of Object.entries(item.value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return false;
      if (child && typeof child === 'object') pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  return true;
}

export interface PreviewSaveRead {
  /** All original slot values, including invalid values, for lossless updates. */
  rawSlots: Record<string, unknown>;
  slots: Record<string, SaveSlotData>;
  invalidKeys: string[];
}

/** Validate each local preview slot separately and preserve invalid/future slots verbatim. */
export function inspectPreviewSaves(value: unknown): PreviewSaveRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档格式错误');
  const rawSlots = value as Record<string, unknown>;
  const slots: Record<string, SaveSlotData> = {};
  const invalidKeys: string[] = [];
  for (const [key, raw] of Object.entries(rawSlots)) {
    // Named slots are a new format: unknown or unsafe fields must never be
    // discarded and then overwritten as though they were an older valid slot.
    if (key.startsWith('script-') && !validRawScriptSlot(raw)) {
      invalidKeys.push(key);
      continue;
    }
    const parsed = slotSchema.safeParse(raw);
    if (!parsed.success || parsed.data.slotKey !== key) {
      invalidKeys.push(key);
    } else {
      slots[key] = parsed.data;
    }
  }
  return { rawSlots, slots, invalidKeys };
}
