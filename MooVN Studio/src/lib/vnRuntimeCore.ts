/**
 * Shared MooVN Runtime Core (`vnRuntimeCore.ts`)
 *
 * Unifies:
 * 1. HTML Escaping (`escapeHtmlText`) to eliminate XSS in exported HTML packages.
 * 2. 64-bit FNV-1a Checksum (`computeFnv1a64Hex`) matching `MooVN Engine/src/save.rs`.
 * 3. Save Slot integrity creation & verification (`createVerifiedSaveRecord`, `verifySaveRecord`).
 * 4. Split-pane ratio clamping (`clampSplitRatio`) to guarantee minimum pane dimensions.
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
  nodeId: string;
  nodeTitle: string;
  dialogueIndex: number;
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

export function serializeSaveCanonical(
  record: Omit<VerifiedSaveRecord, 'checksumFnv64'>
): string {
  return JSON.stringify({
    slotKey: record.slotKey,
    nodeId: record.nodeId,
    dialogueIndex: record.dialogueIndex,
    affectionMap: record.affectionMap,
    customAttributesMap: record.customAttributesMap,
    globalVars: record.globalVars,
    unlockedClues: record.unlockedClues,
  });
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
 * Strictly verifies a save record's 64-bit FNV-1a checksum (`GPT-09`).
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
