import type { DialogueLine } from '../types.ts';

type ReadLine = Pick<DialogueLine, 'id' | 'speakerId' | 'speakerName' | 'text'>;
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;
type HistoryCheck = { read: boolean; error: string | null };
type HistoryWrite = { ok: boolean; error: string | null };

/**
 * A self-contained factory shared by preview and the standalone HTML player.
 * The HTML exporter embeds this function's JavaScript source, so keep all
 * runtime helpers and constants inside the function. It never evaluates story
 * text as code. A line counts as read only after the player moves past it.
 */
export function createReadHistory(getStorage: () => HistoryStorage, storageKey: string) {
  const maxChars = 4 * 1024 * 1024;
  const maxEntries = 20_000;
  const maxEntryChars = 1_100_000;
  const invalidMessage = '已读记录损坏或版本不支持，快进已停用；原记录未覆盖。';
  const readMessage = '已读记录读取失败，快进已停用；原记录未覆盖。';
  const writeMessage = '已读记录写入失败，快进已停用；原记录未覆盖。';
  let cachedRaw: string | null | undefined;
  let cachedEntries: Set<string> | null = null;

  function fingerprint(nodeId: string, index: number, line: ReadLine): string | null {
    if (typeof nodeId !== 'string' || !nodeId || nodeId.length > 200 ||
        !Number.isInteger(index) || index < 0 || index >= 10_000 ||
        !line || typeof line.id !== 'string' || !line.id || line.id.length > 200 ||
        typeof line.speakerId !== 'string' || !line.speakerId || line.speakerId.length > 200 ||
        typeof line.speakerName !== 'string' || line.speakerName.length > 4096 ||
        typeof line.text !== 'string' || line.text.length > 1_000_000) return null;
    // Store exact contents rather than a short hash: changed dialogue must not
    // become skippable through a hash collision or an unchanged line ID.
    const key = JSON.stringify([nodeId, index, line.id, line.speakerId, line.speakerName, line.text]);
    return key.length <= maxEntryChars ? key : null;
  }

  function validEntry(entry: unknown): entry is string {
    if (typeof entry !== 'string' || entry.length > maxEntryChars) return false;
    let value: unknown;
    try { value = JSON.parse(entry); }
    catch { return false; }
    if (!Array.isArray(value) || value.length !== 6) return false;
    return fingerprint(value[0], value[1], {
      id: value[2], speakerId: value[3], speakerName: value[4], text: value[5],
    }) === entry;
  }

  function load(): { raw: string | null; entries: Set<string>; error: string | null } {
    let raw: string | null;
    try { raw = getStorage().getItem(storageKey); }
    catch { return { raw: null, entries: new Set(), error: readMessage }; }
    if (raw === cachedRaw && cachedEntries) return { raw, entries: cachedEntries, error: null };
    if (raw === null) {
      cachedRaw = raw;
      cachedEntries = new Set();
      return { raw, entries: cachedEntries, error: null };
    }
    if (raw.length > maxChars) return { raw, entries: new Set(), error: invalidMessage };
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { return { raw, entries: new Set(), error: invalidMessage }; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { raw, entries: new Set(), error: invalidMessage };
    }
    const record = value as { version?: unknown; entries?: unknown };
    if (Object.keys(record).sort().join(',') !== 'entries,version' || record.version !== 1 ||
        !Array.isArray(record.entries) || record.entries.length > maxEntries ||
        record.entries.some((entry: unknown) => !validEntry(entry))) {
      return { raw, entries: new Set(), error: invalidMessage };
    }
    const entries = new Set<string>(record.entries);
    if (entries.size !== record.entries.length) return { raw, entries: new Set(), error: invalidMessage };
    cachedRaw = raw;
    cachedEntries = entries;
    return { raw, entries, error: null };
  }

  function hasRead(nodeId: string, index: number, line: ReadLine): HistoryCheck {
    const key = fingerprint(nodeId, index, line);
    if (!key) return { read: false, error: '台词过大或无效，无法记录已读；快进已停用。' };
    const state = load();
    return { read: !state.error && state.entries.has(key), error: state.error };
  }

  function markRead(nodeId: string, index: number, line: ReadLine): HistoryWrite {
    const key = fingerprint(nodeId, index, line);
    if (!key) return { ok: false, error: '台词过大或无效，无法记录已读；快进已停用。' };
    const state = load();
    if (state.error) return { ok: false, error: state.error };
    if (state.entries.has(key)) return { ok: true, error: null };
    if (state.entries.size >= maxEntries) return { ok: false, error: '已读记录数量已达上限，原记录未覆盖。' };
    // A failed write must not mutate the cached set and create a false read.
    const next = new Set(state.entries);
    next.add(key);
    const encoded = JSON.stringify({ version: 1, entries: Array.from(next) });
    if (encoded.length > maxChars) return { ok: false, error: '已读记录过大，原记录未覆盖。' };
    try {
      const storage = getStorage();
      if (storage.getItem(storageKey) !== state.raw) {
        return { ok: false, error: '已读记录已在其他窗口更改，未覆盖新数据；请重试。' };
      }
      storage.setItem(storageKey, encoded);
      cachedRaw = encoded;
      cachedEntries = next;
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: writeMessage };
    }
  }

  return { hasRead, markRead };
}
