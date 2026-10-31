import { z } from 'zod';
import type { SaveSlotData } from '../types.ts';

const primitive = z.union([z.string(), z.number().finite(), z.boolean()]);
const saveTab = z.enum(['auto', 'quick', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
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
  textSpeedSnapshot: z.number().finite().optional(),
  timedRemainingSnapshot: z.number().finite().positive().nullable().optional(),
}).passthrough().superRefine((slot, ctx) => {
  if (slot.slotKey !== `${slot.tabId}-${slot.slotIndex}`) {
    ctx.addIssue({ code: 'custom', message: '存档槽标识不一致' });
  }
  if (slot.previewSnapshotVersion === 1 && (
    slot.clueSnapshot === undefined || slot.textSpeedSnapshot === undefined || slot.timedRemainingSnapshot === undefined
  )) {
    ctx.addIssue({ code: 'custom', message: '预览状态快照不完整' });
  }
});

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
    const parsed = slotSchema.safeParse(raw);
    if (!parsed.success || parsed.data.slotKey !== key) {
      invalidKeys.push(key);
    } else {
      slots[key] = parsed.data;
    }
  }
  return { rawSlots, slots, invalidKeys };
}
