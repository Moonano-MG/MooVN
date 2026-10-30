import type {
  AssetCompressionFormat,
  GamePerformanceConfig,
  SceneNode,
  StoryChapter,
  VNProject,
} from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';
import { computeFnv1a64Hex } from './vnRuntimeCore.ts';
import { validateChapterPackageData, validateObjectSafety, validateVNProjectShape } from './projectSchema.ts';
import { sha256Json } from './jsonChecksum.ts';

const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_MSVN_PACKAGE_BYTES = 48 * 1024 * 1024;

const isObject = (item: unknown): item is Record<string, unknown> =>
  Boolean(item && typeof item === 'object' && !Array.isArray(item));
const isFiniteMetadataMap = (item: unknown): boolean => isObject(item) && Object.keys(item).length <= 10000 &&
  Object.entries(item).every(([key, value]) => key.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(key) &&
    typeof value === 'number' && Number.isFinite(value));

export const DEFAULT_PERFORMANCE_CONFIG: GamePerformanceConfig = {
  compressionFormat: 'moovn_lz77',
  compressionLevel: 5,

};

/**
 * 判断资源是否为已压缩过的图像/多媒体格式（例如 .png / .webp / .jpg / .ogg）
 * 用于识别无需再次编码的媒体文件扩展名。
 */
export function isAlreadyCompressedAssetPath(pathOrId: string): boolean {
  const lower = pathOrId.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.ogg') ||
    lower.endsWith('.mp3')
  );
}

export interface CompressedChunkEnvelope {
  magic: 'MOOVN_CMP_V1';
  format: AssetCompressionFormat | 'raw_passthrough';
  level: number;
  originalBytes: number;
  compressedBytes: number;
  checksum: string;
  payloadBase64: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Lossless LZ77 byte stream compressor:
 * Encodes repeated sequences of length 4..130 within a sliding window of up to 4095 bytes.
 * Token format:
 * - Literal run (1..128 bytes): header `0x00..(len - 1)` followed by `len` literal bytes
 * - Match back-reference (len 4..131, offset 1..4095):
 *   header `0x80 | ((len - 4) & 0x7f)`, followed by 2 bytes `(offset >> 8) & 0xff`, `offset & 0xff`
 */
export function lzCompressBytes(input: Uint8Array, windowSize = 2048): Uint8Array {
  const n = input.length;
  if (n === 0) return new Uint8Array(0);
  const maxWin = Math.min(4095, Math.max(256, windowSize));
  const out: number[] = [];
  const literals: number[] = [];

  const flushLiterals = () => {
    let idx = 0;
    while (idx < literals.length) {
      const chunkLen = Math.min(128, literals.length - idx);
      out.push(chunkLen - 1);
      for (let j = 0; j < chunkLen; j++) {
        out.push(literals[idx + j]);
      }
      idx += chunkLen;
    }
    literals.length = 0;
  };

  let pos = 0;
  while (pos < n) {
    let bestLen = 0;
    let bestOffset = 0;
    const startSearch = Math.max(0, pos - maxWin);
    const maxLen = Math.min(131, n - pos);

    if (maxLen >= 4) {
      const b0 = input[pos];
      const b1 = input[pos + 1];
      for (let cand = pos - 1; cand >= startSearch; cand--) {
        if (input[cand] === b0 && input[cand + 1] === b1) {
          let len = 2;
          while (len < maxLen && input[cand + len] === input[pos + len]) {
            len++;
          }
          if (len >= 4 && len > bestLen) {
            bestLen = len;
            bestOffset = pos - cand;
            if (len >= 64) break;
          }
        }
      }
    }

    if (bestLen >= 4) {
      flushLiterals();
      out.push(0x80 | ((bestLen - 4) & 0x7f));
      out.push((bestOffset >> 8) & 0xff);
      out.push(bestOffset & 0xff);
      pos += bestLen;
    } else {
      literals.push(input[pos]);
      if (literals.length >= 128) flushLiterals();
      pos++;
    }
  }
  flushLiterals();
  return new Uint8Array(out);
}

export function lzDecompressBytes(compressed: Uint8Array, maxOutputBytes = 16 * 1024 * 1024): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  while (pos < compressed.length) {
    const tag = compressed[pos++];
    if ((tag & 0x80) === 0) {
      const length = (tag & 0x7f) + 1;
      if (pos + length > compressed.length || out.length + length > maxOutputBytes) throw new Error('ERR_COMPRESSION_DATA: invalid literal');
      for (let i = 0; i < length; i++) out.push(compressed[pos++]);
    } else {
      const length = (tag & 0x7f) + 4;
      if (pos + 1 >= compressed.length || out.length + length > maxOutputBytes) throw new Error('ERR_COMPRESSION_DATA: invalid match');
      const offset = ((compressed[pos] << 8) | compressed[pos + 1]) & 0xfff;
      pos += 2;
      if (offset === 0 || offset > out.length) throw new Error('ERR_COMPRESSION_DATA: invalid offset');
      for (let i = 0; i < length; i++) out.push(out[out.length - offset]);
    }
  }
  return new Uint8Array(out);
}

/**
 * 内置跨平台真实 LZ77 字节压缩器与校验器
 * - `compressedBytes` 为真实压缩后字节流长度
 * - `checksum` 为 64-bit FNV-1a 校验和，解压时校验完整性
 */
export class MooVNBuiltInCodec {
  static computeChecksum(input: string): string {
    return computeFnv1a64Hex(input);
  }

  static compressTextPayload(
    rawText: string,
    level: number,
    assetHintPath = ''
  ): CompressedChunkEnvelope {
    if (!Number.isInteger(level) || level < 0 || level > 9) {
      throw new Error('ERR_COMPRESSION_LEVEL: 压缩级别必须是 0 到 9 的整数');
    }
    if (rawText.length > MAX_DECOMPRESSED_BYTES) throw new Error('ERR_COMPRESSION_SIZE: 原始数据过大');
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(rawText);
    const originalBytes = rawBytes.byteLength;
    if (originalBytes > MAX_DECOMPRESSED_BYTES) throw new Error('ERR_COMPRESSION_SIZE: 原始数据过大');
    const checksum = this.computeChecksum(rawText);

    if (isAlreadyCompressedAssetPath(assetHintPath) || level === 0) {
      return {
        magic: 'MOOVN_CMP_V1',
        format: 'raw_passthrough',
        level: 0,
        originalBytes,
        compressedBytes: originalBytes,
        checksum,
        payloadBase64: uint8ToBase64(rawBytes),
      };
    }

    const windowByLevel = Math.min(4095, 512 + Math.max(1, level) * 350);
    const compressedBuf = lzCompressBytes(rawBytes, windowByLevel);

    // If incompressible tiny input, store raw passthrough honestly
    if (compressedBuf.byteLength >= originalBytes) {
      return {
        magic: 'MOOVN_CMP_V1',
        format: 'raw_passthrough',
        level: 0,
        originalBytes,
        compressedBytes: originalBytes,
        checksum,
        payloadBase64: uint8ToBase64(rawBytes),
      };
    }

    return {
      magic: 'MOOVN_CMP_V1',
      format: 'moovn_lz77',
      level,
      originalBytes,
      compressedBytes: compressedBuf.byteLength,
      checksum,
      payloadBase64: uint8ToBase64(compressedBuf),
    };
  }

  static decompressSync(envelope: CompressedChunkEnvelope): string {
    if (!envelope || typeof envelope !== 'object' || envelope.magic !== 'MOOVN_CMP_V1' ||
        !Number.isSafeInteger(envelope.originalBytes) ||
        envelope.originalBytes < 0 || envelope.originalBytes > MAX_DECOMPRESSED_BYTES) {
      throw new Error('ERR_COMPRESSION_SIZE: invalid decompressed size');
    }
    if (!['raw_passthrough', 'moovn_lz77', 'xz', '7z', 'brotli'].includes(envelope.format)) {
      throw new Error('ERR_COMPRESSION_FORMAT: unsupported format');
    }
    if (!Number.isInteger(envelope.level) || envelope.level < 0 || envelope.level > 9 ||
        (envelope.format === 'raw_passthrough' && envelope.level !== 0)) {
      throw new Error('ERR_COMPRESSION_LEVEL: invalid compression level');
    }
    if (!Number.isSafeInteger(envelope.compressedBytes) || envelope.compressedBytes < 0 ||
        envelope.compressedBytes > MAX_COMPRESSED_BYTES || typeof envelope.payloadBase64 !== 'string' ||
        envelope.payloadBase64.length !== Math.ceil(envelope.compressedBytes / 3) * 4) {
      throw new Error('ERR_COMPRESSION_SIZE: compressed size mismatch');
    }
    let bytes: Uint8Array;
    try { bytes = base64ToUint8(envelope.payloadBase64); }
    catch { throw new Error('ERR_COMPRESSION_DATA: invalid base64'); }
    if (bytes.length !== envelope.compressedBytes) throw new Error('ERR_COMPRESSION_SIZE: compressed size mismatch');
    // Legacy files were labeled xz/7z/brotli but actually contained this LZ77 stream.
    const decodedBytes = envelope.format === 'raw_passthrough'
      ? bytes : lzDecompressBytes(bytes, envelope.originalBytes);
    if (decodedBytes.length !== envelope.originalBytes) throw new Error('ERR_COMPRESSION_SIZE: decompressed size mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes);
    if (!envelope.checksum || this.computeChecksum(text) !== envelope.checksum) throw new Error('ERR_COMPRESSION_CHECKSUM: checksum mismatch');
    return text;
  }

  static async decompressChunkAsync(envelope: CompressedChunkEnvelope): Promise<string> {
    return this.decompressSync(envelope);
  }
}

/** A chapter's node data and referenced built-in asset manifest. Assets are not included. */
export interface MsvnChapterPackage {
  magic: 'MSVN_CHAPTER_PACKAGE_V1';
  /** Version 2 adds an unkeyed checksum over the whole chapter envelope. */
  envelopeVersion?: 2;
  integrity?: { algorithm: 'sha256'; digest: string };
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  compressionFormat: CompressedChunkEnvelope['format'];
  compressionLevel: number;
  chapter: StoryChapter;
  minCharacterAffection: Record<string, number>;
  minVariables: Record<string, number>;
  compressedNodesEnvelope: CompressedChunkEnvelope;
  assetManifest: {
    id: string;
    path: string;
  }[];
}

export function buildChapterMsvnPackage(
  project: VNProject,
  chapterId: string,
  perfConfig: GamePerformanceConfig = project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG
): MsvnChapterPackage {
  const validation = validateVNProjectShape(project);
  if (!validation.ok) throw new Error(validation.error);
  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new Error(`ERR_CHAPTER_NOT_FOUND: ${chapterId}`);
  if (!isFiniteMetadataMap(chapter.minCharacterAffection || {}) || !isFiniteMetadataMap(chapter.minVariables || {})) {
    throw new Error('ERR_MSVN_FORMAT: 章节解锁信息超过格式限制');
  }
  const chapterNodes = project.nodes.filter((n) => n.chapterId === chapter.id);

  // Collect references; the referenced asset bytes are not included.
  const assetMap = new Map<string, { id: string; path: string }>();
  for (const node of chapterNodes) {
    const bg = BACKGROUND_ASSETS.find((asset) => asset.id === node.backgroundId);
    if (bg) assetMap.set(bg.id, {
      id: bg.id,
      path: bg.path,
    });
    for (const ch of node.characters) {
      const sp = CHARACTER_ASSETS.find((asset) => asset.id === ch.spriteId);
      if (!sp) continue;
      assetMap.set(sp.id, {
        id: sp.id,
        path: sp.path,
      });
    }
  }

  // Preserve only explicit chapter minimums; do not invent character stats.
  const defaultMinAffection: Record<string, number> = { ...(chapter.minCharacterAffection || {}) };

  const nodesJson = JSON.stringify(chapterNodes);
  const compressedNodesEnvelope = MooVNBuiltInCodec.compressTextPayload(
    nodesJson,
    perfConfig.compressionLevel
  );

  const payload: Omit<MsvnChapterPackage, 'integrity'> = {
    magic: 'MSVN_CHAPTER_PACKAGE_V1',
    envelopeVersion: 2,
    projectId: project.id,
    projectTitle: project.title,
    exportedAt: new Date().toISOString(),
    compressionFormat: compressedNodesEnvelope.format,
    compressionLevel: compressedNodesEnvelope.level,
    chapter: {
      ...chapter,
      minCharacterAffection: defaultMinAffection,
    },
    minCharacterAffection: defaultMinAffection,
    minVariables: chapter.minVariables || {},
    compressedNodesEnvelope,
    assetManifest: Array.from(assetMap.values()),
  };
  return { ...payload, integrity: { algorithm: 'sha256', digest: sha256Json(payload) } };
}

export function downloadChapterMsvnFile(
  project: VNProject,
  chapterId: string,
  perfConfig?: GamePerformanceConfig
): string {
  const pkg = buildChapterMsvnPackage(project, chapterId, perfConfig);
  const content = JSON.stringify(pkg, null, 2);
  const safeChapterId = pkg.chapter.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeProjectId = project.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeProjectId}_${safeChapterId}_ch${pkg.chapter.index}.msvn`;

  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

export async function parseAndDecompressMsvnPackage(
  rawJsonText: string
): Promise<{
  pkg: MsvnChapterPackage;
  nodes: SceneNode[];
  integrity: 'sha256' | 'legacy-unchecked';
}> {
  if (typeof rawJsonText !== 'string' || rawJsonText.length > MAX_MSVN_PACKAGE_BYTES ||
      new TextEncoder().encode(rawJsonText).byteLength > MAX_MSVN_PACKAGE_BYTES) {
    throw new Error('ERR_MSVN_SIZE: 章节文件超过大小上限');
  }
  let value: unknown;
  try { value = JSON.parse(rawJsonText); }
  catch { throw new Error('ERR_MSVN_FORMAT: 章节文件不是有效 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ERR_MSVN_FORMAT: 无效的 .msvn 章节包文件');
  }
  const safetyError = validateObjectSafety(value);
  if (safetyError) throw new Error(safetyError);
  const data = value as Record<string, unknown>;
  if (data.magic !== 'MSVN_CHAPTER_PACKAGE_V1') {
    throw new Error('ERR_MSVN_FORMAT: 无效的 .msvn 章节包文件');
  }
  let integrity: 'sha256' | 'legacy-unchecked' = 'legacy-unchecked';
  if (data.envelopeVersion !== undefined || data.integrity !== undefined) {
    if (data.envelopeVersion !== 2 || !isObject(data.integrity) || data.integrity.algorithm !== 'sha256' ||
        typeof data.integrity.digest !== 'string' || !/^[a-f0-9]{64}$/.test(data.integrity.digest)) {
      throw new Error('ERR_MSVN_CHECKSUM: 新版章节校验信息缺失或无效');
    }
    const { integrity: _excluded, ...payload } = data;
    if (sha256Json(payload) !== data.integrity.digest) {
      throw new Error('ERR_MSVN_CHECKSUM: 章节包内容已损坏或发生变化');
    }
    integrity = 'sha256';
  }
  if (typeof data.projectId !== 'string' || !data.projectId.trim() || data.projectId.length > 200 ||
      typeof data.projectTitle !== 'string' || data.projectTitle.length > 4096 ||
      typeof data.exportedAt !== 'string' || data.exportedAt.length > 100 ||
      !isObject(data.chapter) || !isFiniteMetadataMap(data.minCharacterAffection) || !isFiniteMetadataMap(data.minVariables) ||
      !Array.isArray(data.assetManifest) || data.assetManifest.length > 10000 ||
      !data.assetManifest.every((item: unknown) => isObject(item) && typeof item.id === 'string' && item.id.length <= 200 &&
        typeof item.path === 'string' && item.path.length <= 4096) || !isObject(data.compressedNodesEnvelope)) {
    throw new Error('ERR_MSVN_FORMAT: 章节包信息无效');
  }
  const manifestIds = new Set<string>();
  for (const entry of data.assetManifest) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id.trim() || manifestIds.has(entry.id)) {
      throw new Error('ERR_MSVN_FORMAT: 素材清单标识无效或重复');
    }
    manifestIds.add(entry.id);
  }
  const envelope = data.compressedNodesEnvelope as unknown as CompressedChunkEnvelope;
  if (data.compressionFormat !== envelope.format || data.compressionLevel !== envelope.level) {
    throw new Error('ERR_MSVN_FORMAT: 压缩信息不一致');
  }
  const nodesRaw = await MooVNBuiltInCodec.decompressChunkAsync(envelope);
  let nodes: unknown;
  try { nodes = JSON.parse(nodesRaw); }
  catch { throw new Error('ERR_MSVN_NODES: 节点数据不是有效 JSON'); }
  const validated = validateChapterPackageData(data.chapter, nodes);
  if (!validated.ok) throw new Error(validated.error);
  const sameMap = (actual: unknown, expected: Record<string, number> | undefined): boolean => {
    if (!isObject(actual)) return false;
    const source = expected || {};
    return Object.keys(actual).length === Object.keys(source).length &&
      Object.entries(source).every(([key, number]) => Object.prototype.hasOwnProperty.call(actual, key) && actual[key] === number);
  };
  if (!sameMap(data.minCharacterAffection, validated.chapter.minCharacterAffection) ||
      !sameMap(data.minVariables, validated.chapter.minVariables)) {
    throw new Error('ERR_MSVN_CHAPTER: 章节解锁信息不一致');
  }
  return { pkg: data as unknown as MsvnChapterPackage, nodes: validated.nodes, integrity };
}
