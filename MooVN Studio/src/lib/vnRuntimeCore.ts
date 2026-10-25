/**
 * Shared MooVN Runtime Core (`vnRuntimeCore.ts`)
 *
 * Unifies:
 * 1. HTML Escaping (`escapeHtmlText`) to eliminate XSS in exported HTML packages.
 * 2. 64-bit FNV-1a Checksum (`computeFnv1a64Hex`) matching `MooVN Engine/src/save.rs`.
 * 3. Cross-language canonical save payload (`serializeSaveCanonical`) matching
 *    `SaveSlotRecord::compute_canonical_payload` in `MooVN Engine/src/save.rs` byte-for-byte (`GPT-59`).
 * 4. Save Slot integrity creation & verification (`createVerifiedSaveRecord`, `verifySaveRecord`).
 * 5. Split-pane ratio clamping (`clampSplitRatio`) to guarantee minimum pane dimensions.
 */

export function escapeHtmlText(raw: unknown): string {
  const str = String(raw ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FNV1A_64_OFFSET = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * Computes the exact 64-bit FNV-1a checksum (as 16-char lowercase hex) matching
 * `SaveManager::compute_fnv1a64` in `MooVN Engine/src/save.rs`.
 */
export function computeFnv1a64Hex(payload: string): string {
  let hash = FNV1A_64_OFFSET;
  const bytes = new TextEncoder().encode(payload);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV1A_64_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export interface VerifiedSaveRecord {
  schemaVersion?: number;
  slotKey: string;
  chapterId?: string;
  nodeId: string;
  nodeTitle: string;
  dialogueIndex: number;
  activeBackground?: string;
  activeBgm?: string;
  speaker: string;
  textPreview: string;
  savedAt: string;
  affectionMap: Record<string, number>;
  customAttributesMap: Record<string, Record<string, number | string | boolean>>;
  globalVars: Record<string, number | string | boolean>;
  unlockedClues: string[];
  visitedNodeIds: string[];
  checksumFnv64: string;
}

function bytewiseCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Serializes a save record into the exact cross-language canonical v2 format shared with
 * `SaveSlotRecord::compute_canonical_payload` in `MooVN Engine/src/save.rs` (`GPT-59`):
 *
 * `v2|slot={slotKey}|ch={chapterId}|node={nodeId}|dlg={dialogueIndex}|bg={activeBackground}|bgm={activeBgm}|vars=[{k}={v},...]|aff=[{k}={v},...]`
 *
 * Custom attributes and unlocked clues (if present) are folded into `vars` with deterministic
 * `__attr.{charId}.{key}` and `__clue.{idx}` keys so tampering with any field invalidates the hash.
 */
export function serializeSaveCanonical(
  record: Omit<VerifiedSaveRecord, 'checksumFnv64'>
): string {
  const mergedVars: Record<string, string> = {};
  if (record.globalVars && typeof record.globalVars === 'object') {
    for (const [k, v] of Object.entries(record.globalVars)) {
      mergedVars[k] = String(v);
    }
  }
  if (record.customAttributesMap && typeof record.customAttributesMap === 'object') {
    for (const charId of Object.keys(record.customAttributesMap).sort(bytewiseCompare)) {
      const attrs = record.customAttributesMap[charId];
      if (attrs && typeof attrs === 'object') {
        for (const attrKey of Object.keys(attrs).sort(bytewiseCompare)) {
          mergedVars[`__attr.${charId}.${attrKey}`] = String(attrs[attrKey]);
        }
      }
    }
  }
  if (Array.isArray(record.unlockedClues) && record.unlockedClues.length > 0) {
    record.unlockedClues.forEach((clue, idx) => {
      mergedVars[`__clue.${idx}`] = String(clue);
    });
  }

  const varsSerialized = Object.keys(mergedVars)
    .sort(bytewiseCompare)
    .map((k) => `${k}=${mergedVars[k]}`)
    .join(',');

  const affMap = record.affectionMap || {};
  const affSerialized = Object.keys(affMap)
    .sort(bytewiseCompare)
    .map((k) => `${k}=${Math.trunc(Number(affMap[k]) || 0)}`)
    .join(',');

  return `v2|slot=${record.slotKey}|ch=${record.chapterId ?? ''}|node=${record.nodeId}|dlg=${record.dialogueIndex}|bg=${record.activeBackground ?? ''}|bgm=${record.activeBgm ?? ''}|vars=[${varsSerialized}]|aff=[${affSerialized}]`;
}

export function createVerifiedSaveRecord(
  input: Omit<VerifiedSaveRecord, 'checksumFnv64'>
): VerifiedSaveRecord {
  const canonical = serializeSaveCanonical(input);
  const checksumFnv64 = computeFnv1a64Hex(canonical);
  return {
    ...input,
    schemaVersion: 2,
    checksumFnv64,
  };
}

/**
 * Strictly verifies a save record's 64-bit FNV-1a checksum (`GPT-09`, `GPT-59`).
 * Missing or empty `checksumFnv64` is rejected (`false`).
 * Legacy unverified saves must be checked separately via `isLegacyUnverifiedSave`.
 */
export function verifySaveRecord(
  record: Partial<VerifiedSaveRecord> | null | undefined
): boolean {
  if (!record || typeof record !== 'object' || !record.nodeId || !record.slotKey) {
    return false;
  }
  if (typeof record.checksumFnv64 !== 'string' || record.checksumFnv64.length !== 16) {
    return false;
  }
  const expected = computeFnv1a64Hex(
    serializeSaveCanonical(record as Omit<VerifiedSaveRecord, 'checksumFnv64'>)
  );
  return expected === record.checksumFnv64;
}

/**
 * Identifies a legacy v1 save record that lacks `checksumFnv64` so callers can prompt
 * the user before migrating it into a verified v2 record.
 */
export function isLegacyUnverifiedSave(
  record: Partial<VerifiedSaveRecord> | null | undefined
): boolean {
  if (!record || typeof record !== 'object') return false;
  return Boolean(record.nodeId && record.slotKey && !record.checksumFnv64);
}

/**
 * Clamps a split-tree branch ratio to `[minRatio, maxRatio]` (default `[0.18, 0.82]`)
 * so no docked panel can ever be resized to 0 width or height.
 */
export function clampSplitRatio(ratio: number, minRatio = 0.18, maxRatio = 0.82): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(maxRatio, Math.max(minRatio, ratio));
}
