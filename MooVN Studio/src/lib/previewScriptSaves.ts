import type { SaveSlotData } from '../types.ts';
import { inspectPreviewSaves, type PreviewSaveRead } from './previewSaves.ts';

type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type ScriptSaveResult = { ok: true; saves: PreviewSaveRead } | { ok: false; error: string };
const MAX_SAVE_ROOT_CHARS = 4 * 1024 * 1024;

/**
 * Write one named preview slot only after validating the complete new slot and
 * existing root. Other unknown/damaged slot values are retained. This checks
 * for a concurrent update before writing, but localStorage is not transactional
 * across tabs; it cannot guarantee cross-tab atomicity.
 */
export function persistPreviewScriptSave(getStorage: () => SaveStorage, key: string, slot: SaveSlotData): ScriptSaveResult {
  const fail = (message: string): ScriptSaveResult => ({ ok: false, error: `${message}；原存档未覆盖。` });
  if (slot.tabId !== 'script' || inspectPreviewSaves({ [slot.slotKey]: slot }).invalidKeys.length) {
    return fail('脚本存档状态无效');
  }
  try {
    const storage = getStorage();
    const raw = storage.getItem(key);
    if (raw !== null && raw.length > MAX_SAVE_ROOT_CHARS) return fail('存档数据超过大小限制');
    const existing = inspectPreviewSaves(raw === null ? {} : JSON.parse(raw));
    if (existing.invalidKeys.includes(slot.slotKey)) return fail(`脚本存档槽 ${slot.scriptSlotName} 损坏或版本不支持`);
    const next = { ...existing.rawSlots, [slot.slotKey]: slot };
    const encoded = JSON.stringify(next);
    if (encoded.length > MAX_SAVE_ROOT_CHARS) return fail('存档数据超过大小限制');
    if (storage.getItem(key) !== raw) return fail('存档已在其他窗口更改，请重试');
    storage.setItem(key, encoded);
    return { ok: true, saves: inspectPreviewSaves(next) };
  } catch (error: unknown) {
    return fail(`脚本存档读取或写入失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
