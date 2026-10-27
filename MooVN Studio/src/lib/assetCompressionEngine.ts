import type {
  AssetCompressionFormat,
  GamePerformanceConfig,
  SceneNode,
  StoryChapter,
  VNProject,
} from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';
import { computeFnv1a64Hex } from './vnRuntimeCore.ts';

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
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(rawText);
    const originalBytes = rawBytes.byteLength;
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
    if (envelope.magic !== 'MOOVN_CMP_V1' || !Number.isSafeInteger(envelope.originalBytes) ||
        envelope.originalBytes < 0 || envelope.originalBytes > 16 * 1024 * 1024) {
      throw new Error('ERR_COMPRESSION_SIZE: invalid decompressed size');
    }
    if (!['raw_passthrough', 'moovn_lz77', 'xz', '7z', 'brotli'].includes(envelope.format)) {
      throw new Error('ERR_COMPRESSION_FORMAT: unsupported format');
    }
    const bytes = base64ToUint8(envelope.payloadBase64);
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
  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new Error(`ERR_CHAPTER_NOT_FOUND: ${chapterId}`);
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

  return {
    magic: 'MSVN_CHAPTER_PACKAGE_V1',
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
}

export function downloadChapterMsvnFile(
  project: VNProject,
  chapterId: string,
  perfConfig?: GamePerformanceConfig
): string {
  const pkg = buildChapterMsvnPackage(project, chapterId, perfConfig);
  const content = JSON.stringify(pkg, null, 2);
  const safeChapterId = pkg.chapter.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${project.id}_${safeChapterId}_ch${pkg.chapter.index}.msvn`;

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
}> {
  const pkg = JSON.parse(rawJsonText) as MsvnChapterPackage;
  if (pkg.magic !== 'MSVN_CHAPTER_PACKAGE_V1') {
    throw new Error('无效的 .msvn 章节包文件');
  }
  const nodesRaw = await MooVNBuiltInCodec.decompressChunkAsync(pkg.compressedNodesEnvelope);
  const nodes = JSON.parse(nodesRaw) as SceneNode[];
  return { pkg, nodes };
}
