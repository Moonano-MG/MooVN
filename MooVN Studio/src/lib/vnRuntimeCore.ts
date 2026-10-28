/**
 * Shared MooVN Runtime Core (`vnRuntimeCore.ts`)
 *
 * Provides HTML escaping, a non-cryptographic FNV-1a corruption check,
 * a legacy TypeScript v2 save serializer, and split-pane clamping.
 * The v2 serializer differs from the Rust serializer and is not interoperable.
 * A checksum can be recomputed by anyone who changes the data; it is not authentication.
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
 * Serializes a legacy TypeScript v2 save payload. Custom attributes and clues
 * are folded into variables and keys are ordered by JavaScript UTF-16 order.
 * This differs from Rust's v2 representation; do not exchange v2 saves between them.
 * Several display fields are omitted. FNV-1a only detects some accidental changes,
 * not deliberate edits followed by checksum recomputation.
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
 * Checks the stored 64-bit FNV-1a value against the legacy v2 payload.
 * This is not a cryptographic verification or a check of every field.
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
