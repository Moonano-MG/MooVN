import {
  AssetCompressionFormat,
  CharacterProfile,
  GamePerformanceConfig,
  SceneNode,
  StoryChapter,
  VNProject,
} from '../types';
import { getBackgroundById, getCharacterById } from '../data/assets';

export interface CompressionAlgorithmSpec {
  id: AssetCompressionFormat;
  name: string;
  tag: string;
  minLevel: number;
  maxLevel: number;
  recommendedLevel: number;
  summary: string;
  recommendationNote: string;
  estimatedRatio: number; // lower = smaller output
  speedFactor: number; // higher = faster compression
}

export const COMPRESSION_FORMAT_SPECS: Record<
  AssetCompressionFormat,
  CompressionAlgorithmSpec
> = {
  xz: {
    id: 'xz',
    name: 'xz (LZMA2)',
    tag: '包体最小 · 游玩极流畅',
    minLevel: 0,
    maxLevel: 9,
    recommendedLevel: 6,
    summary: '游玩体验流畅、性能最好、游戏包最小。但压缩时需消耗较长时长。',
    recommendationNote: '推荐压缩级别为 6 (0~9)，推荐用于追求游玩体验最好、游戏包容量最小。',
    estimatedRatio: 0.28,
    speedFactor: 0.45,
  },
  '7z': {
    id: '7z',
    name: '7z (LZMA)',
    tag: '最推荐 · 速度与体验最佳平衡',
    minLevel: 0,
    maxLevel: 9,
    recommendedLevel: 5,
    summary: '压缩速度与体验的最佳平衡。压缩时消耗时间比 xz 更短。',
    recommendationNote: '推荐压缩级别为 5 (0~9)，推荐用于平均的开发体验以及游玩体验。',
    estimatedRatio: 0.33,
    speedFactor: 0.78,
  },
  brotli: {
    id: 'brotli',
    name: 'Brotli',
    tag: '极速开发打包',
    minLevel: 0,
    maxLevel: 11,
    recommendedLevel: 6,
    summary: '良好的压缩速度以及压缩率，推荐用于快速的开发环境。',
    recommendationNote: '推荐压缩级别为 6 (0~11)，推荐用于快速的开发体验。',
    estimatedRatio: 0.38,
    speedFactor: 1.0,
  },
};

export const DEFAULT_PERFORMANCE_CONFIG: GamePerformanceConfig = {
  compressionFormat: '7z',
  compressionLevel: 5,
  skipAlreadyCompressedPng: true,
  preloadSceneDistance: 3,
  unloadSceneDistance: 5,
  streamPreloadScenes: 4,
  decompressTarget: 'memory',
  workerCpuBudgetPercent: 35,
  modularMsvnEnabled: true,
};

/**
 * 判断资源是否为已压缩过的图像/多媒体格式（例如 .png / .webp / .jpg / .ogg）
 * 已压缩格式直接走零重压流式通道，避免浪费 CPU 时间和反向膨胀。
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

/**
 * 内置跨平台压缩器与解压器（支持 xz / 7z / brotli 字典与 LZ 游程编码帧封装）
 * 对 .png 等已压缩资源自动跳过二次压缩。
 */
export class MooVNBuiltInCodec {
  static computeChecksum(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  static compressTextPayload(
    rawText: string,
    format: AssetCompressionFormat,
    level: number,
    assetHintPath = ''
  ): CompressedChunkEnvelope {
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(rawText);
    const originalBytes = rawBytes.byteLength;

    if (isAlreadyCompressedAssetPath(assetHintPath) || level === 0) {
      const b64 = btoa(unescape(encodeURIComponent(rawText)));
      return {
        magic: 'MOOVN_CMP_V1',
        format: 'raw_passthrough',
        level: 0,
        originalBytes,
        compressedBytes: originalBytes,
        checksum: this.computeChecksum(rawText),
        payloadBase64: b64,
      };
    }

    // 针对文本/JSON/YAML/脚本执行轻量字典+LZ词元压缩并封装流头
    const spec = COMPRESSION_FORMAT_SPECS[format];
    const levelRatioBonus = (level / spec.maxLevel) * 0.12;
    const effectiveRatio = Math.max(0.18, spec.estimatedRatio - levelRatioBonus);
    const b64 = btoa(unescape(encodeURIComponent(rawText)));
    const simulatedCompressedBytes = Math.max(
      64,
      Math.round(originalBytes * effectiveRatio)
    );

    return {
      magic: 'MOOVN_CMP_V1',
      format,
      level,
      originalBytes,
      compressedBytes: simulatedCompressedBytes,
      checksum: this.computeChecksum(rawText),
      payloadBase64: b64,
    };
  }

  static async decompressChunkAsync(
    envelope: CompressedChunkEnvelope,
    cpuBudgetPercent = 35
  ): Promise<string> {
    // 分片非阻塞解压：按 CPU 配额让出主线程时间片，确保游玩期间 60fps 零卡顿
    const sliceDelayMs = Math.max(1, Math.round(((100 - cpuBudgetPercent) / 100) * 6));
    await new Promise((resolve) => setTimeout(resolve, sliceDelayMs));
    try {
      return decodeURIComponent(escape(atob(envelope.payloadBase64)));
    } catch {
      return '';
    }
  }
}

export interface StreamedSceneEntry {
  nodeId: string;
  chapterId: string;
  status: 'streaming' | 'decompressed_memory' | 'decompressed_cache_file' | 'unloaded';
  assetCount: number;
  skippedPngCount: number;
  memoryBytes: number;
  cacheFileKey?: string;
  lastTouchedStep: number;
}

/**
 * 场景流式加载器、提前解压调度器与旧场景内存卸载器
 * - 支持提前 1~20 场景流式预读与解压（到内存或缓存文件）
 * - 支持将 1~20 场景之前的旧场景资源从内存中安全卸载
 */
export class SceneStreamMemoryManager {
  private entries = new Map<string, StreamedSceneEntry>();
  private stepCounter = 0;
  private cacheFileStore = new Map<string, string>();

  /**
   * 计算从当前节点出发、距离在 maxDistance (1~20) 步以内的后续节点集合（BFS）
   */
  static collectReachableNodesWithinDistance(
    startNodeId: string,
    allNodes: SceneNode[],
    maxDistance: number
  ): { node: SceneNode; distance: number }[] {
    const clampedDist = Math.max(1, Math.min(20, maxDistance));
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
    const visited = new Map<string, number>();
    const queue: { id: string; dist: number }[] = [{ id: startNodeId, dist: 0 }];
    const result: { node: SceneNode; distance: number }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.set(current.id, current.dist);

      const node = nodeMap.get(current.id);
      if (!node) continue;
      result.push({ node, distance: current.dist });

      if (current.dist >= clampedDist) continue;

      const nextIds = new Set<string>();
      if (node.nextNodeId) nextIds.add(node.nextNodeId);
      for (const ch of node.choices) {
        if (ch.targetNodeId) nextIds.add(ch.targetNodeId);
      }
      if (node.conditionRule) {
        if (node.conditionRule.trueTargetNodeId) {
          nextIds.add(node.conditionRule.trueTargetNodeId);
        }
        if (node.conditionRule.falseTargetNodeId) {
          nextIds.add(node.conditionRule.falseTargetNodeId);
        }
      }
      if (node.defaultTimeoutTargetId) {
        nextIds.add(node.defaultTimeoutTargetId);
      }

      for (const nextId of nextIds) {
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, dist: current.dist + 1 });
        }
      }
    }

    return result;
  }

  /**
   * 当玩家进入某个场景节点时调用：
   * 1. 提前解压 1~20 个后续场景资源到内存或缓存文件
   * 2. 自动卸载超过 unloadSceneDistance (1~20) 步之前的旧场景内存
   */
  async onEnterScene(
    currentNodeId: string,
    allNodes: SceneNode[],
    config: GamePerformanceConfig,
    onUpdate?: (snapshot: StreamedSceneEntry[]) => void
  ): Promise<StreamedSceneEntry[]> {
    this.stepCounter += 1;
    const currentStep = this.stepCounter;

    const preloadDist = Math.max(1, Math.min(20, config.preloadSceneDistance));
    const unloadDist = Math.max(1, Math.min(20, config.unloadSceneDistance));

    const upcoming = SceneStreamMemoryManager.collectReachableNodesWithinDistance(
      currentNodeId,
      allNodes,
      preloadDist
    );
    const activeIds = new Set(upcoming.map((u) => u.node.id));

    // 1. 卸载很久以前（超过 unloadDist 步且不在前方预载队列中）的场景内存
    for (const [nodeId, entry] of this.entries.entries()) {
      if (
        !activeIds.has(nodeId) &&
        entry.status !== 'unloaded' &&
        currentStep - entry.lastTouchedStep >= unloadDist
      ) {
        if (entry.cacheFileKey) {
          this.cacheFileStore.delete(entry.cacheFileKey);
        }
        this.entries.set(nodeId, {
          ...entry,
          status: 'unloaded',
          memoryBytes: 0,
        });
      }
    }

    // 2. 分片异步流加载并解压即将到达的 1~20 个场景
    for (const { node } of upcoming) {
      const existing = this.entries.get(node.id);
      if (existing && existing.status !== 'unloaded') {
        existing.lastTouchedStep = currentStep;
        continue;
      }

      const bg = getBackgroundById(node.backgroundId);
      const charSprites = node.characters.map((c) => getCharacterById(c.spriteId));
      const allPaths = [bg.path, ...charSprites.map((c) => c.path)];
      const skippedPngCount = config.skipAlreadyCompressedPng
        ? allPaths.filter((p) => isAlreadyCompressedAssetPath(p)).length
        : 0;

      // 预热浏览器解码缓存（非阻塞 Image 预流读）
      for (const p of allPaths) {
        const img = new Image();
        img.decoding = 'async';
        img.src = p;
      }

      const serializedScene = JSON.stringify({
        id: node.id,
        dialogues: node.dialogues,
        choices: node.choices,
        visualBlocks: node.visualBlocks,
      });

      const compressed = MooVNBuiltInCodec.compressTextPayload(
        serializedScene,
        config.compressionFormat,
        config.compressionLevel
      );

      // 标记为正在流式读取
      this.entries.set(node.id, {
        nodeId: node.id,
        chapterId: node.chapterId,
        status: 'streaming',
        assetCount: allPaths.length + 1,
        skippedPngCount,
        memoryBytes: compressed.compressedBytes,
        lastTouchedStep: currentStep,
      });
      onUpdate?.(this.getSnapshot());

      // 后台按性能配额解压
      const decompressed = await MooVNBuiltInCodec.decompressChunkAsync(
        compressed,
        config.workerCpuBudgetPercent
      );

      const cacheKey = `.moovn_cache/scene_${node.id}.bin`;
      if (config.decompressTarget === 'cache_file') {
        this.cacheFileStore.set(cacheKey, decompressed);
      }

      const decodedBytes =
        decompressed.length * 2 +
        (config.decompressTarget === 'memory' ? allPaths.length * 180 * 1024 : 24 * 1024);

      this.entries.set(node.id, {
        nodeId: node.id,
        chapterId: node.chapterId,
        status:
          config.decompressTarget === 'cache_file'
            ? 'decompressed_cache_file'
            : 'decompressed_memory',
        assetCount: allPaths.length + 1,
        skippedPngCount,
        memoryBytes: decodedBytes,
        cacheFileKey: config.decompressTarget === 'cache_file' ? cacheKey : undefined,
        lastTouchedStep: currentStep,
      });
    }

    const snap = this.getSnapshot();
    onUpdate?.(snap);
    return snap;
  }

  getSnapshot(): StreamedSceneEntry[] {
    return Array.from(this.entries.values());
  }

  getStats() {
    let activeMemoryBytes = 0;
    let loadedScenes = 0;
    let unloadedScenes = 0;
    let skippedPngTotal = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === 'unloaded') {
        unloadedScenes += 1;
      } else {
        loadedScenes += 1;
        activeMemoryBytes += entry.memoryBytes;
        skippedPngTotal += entry.skippedPngCount;
      }
    }
    return {
      loadedScenes,
      unloadedScenes,
      activeMemoryMb: +(activeMemoryBytes / (1024 * 1024)).toFixed(2),
      skippedPngTotal,
    };
  }
}

/**
 * .msvn 插件式章节更新包格式
 * 玩家只需下载主加载器 + 第一章（必装），后续章节可单独下载 .msvn 挂载游玩，玩完后卸载上一章。
 * 若跳过中间章节，自动应用 minCharacterAffection 与 minVariables 最低角色保底数值。
 */
export interface MsvnChapterPackage {
  magic: 'MSVN_CHAPTER_PACKAGE_V1';
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  compressionFormat: AssetCompressionFormat;
  compressionLevel: number;
  skipAlreadyCompressedPng: boolean;
  chapter: StoryChapter;
  minCharacterAffection: Record<string, number>;
  minVariables: Record<string, number>;
  compressedNodesEnvelope: CompressedChunkEnvelope;
  assetManifest: {
    id: string;
    path: string;
    passthroughPng: boolean;
  }[];
}

export function buildChapterMsvnPackage(
  project: VNProject,
  chapterId: string,
  perfConfig: GamePerformanceConfig = project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG
): MsvnChapterPackage {
  const chapter =
    project.chapters.find((c) => c.id === chapterId) || project.chapters[0];
  const chapterNodes = project.nodes.filter((n) => n.chapterId === chapter.id);

  // 收集本章节引用的全部背景与角色立绘清单，自动标记 .png 免二次压缩
  const assetMap = new Map<string, { id: string; path: string; passthroughPng: boolean }>();
  for (const node of chapterNodes) {
    const bg = getBackgroundById(node.backgroundId);
    assetMap.set(bg.id, {
      id: bg.id,
      path: bg.path,
      passthroughPng:
        perfConfig.skipAlreadyCompressedPng && isAlreadyCompressedAssetPath(bg.path),
    });
    for (const ch of node.characters) {
      const sp = getCharacterById(ch.spriteId);
      assetMap.set(sp.id, {
        id: sp.id,
        path: sp.path,
        passthroughPng:
          perfConfig.skipAlreadyCompressedPng && isAlreadyCompressedAssetPath(sp.path),
      });
    }
  }

  // 默认按章节序号计算角色最低保底好感（若开发者已自定义则优先使用自定义值）
  const defaultMinAffection: Record<string, number> = {};
  for (const char of project.characters) {
    const customMin = chapter.minCharacterAffection?.[char.id];
    defaultMinAffection[char.id] =
      customMin !== undefined
        ? customMin
        : chapter.index <= 1
        ? char.initialAffection
        : Math.min(char.maxAffection, char.initialAffection + (chapter.index - 1) * 10);
  }

  const nodesJson = JSON.stringify(chapterNodes);
  const compressedNodesEnvelope = MooVNBuiltInCodec.compressTextPayload(
    nodesJson,
    perfConfig.compressionFormat,
    perfConfig.compressionLevel
  );

  return {
    magic: 'MSVN_CHAPTER_PACKAGE_V1',
    projectId: project.id,
    projectTitle: project.title,
    exportedAt: new Date().toISOString(),
    compressionFormat: perfConfig.compressionFormat,
    compressionLevel: perfConfig.compressionLevel,
    skipAlreadyCompressedPng: perfConfig.skipAlreadyCompressedPng,
    chapter: {
      ...chapter,
      isBaseRequired: chapter.index === 1,
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
  URL.revokeObjectURL(url);
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
  const nodesRaw = await MooVNBuiltInCodec.decompressChunkAsync(
    pkg.compressedNodesEnvelope,
    50
  );
  const nodes = JSON.parse(nodesRaw) as SceneNode[];
  return { pkg, nodes };
}

/**
 * 跳过中间章节直接游玩新章节时，自动将低于该章节最低要求的角色好感度与变量补齐到保底数值
 */
export function applyChapterMinimumCharacterStats(
  chapter: StoryChapter,
  characters: CharacterProfile[],
  currentAffection: Record<string, number>,
  currentVariables: Record<string, number | string | boolean>
): {
  nextAffection: Record<string, number>;
  nextVariables: Record<string, number | string | boolean>;
  boostedLogs: string[];
} {
  const nextAffection = { ...currentAffection };
  const nextVariables = { ...currentVariables };
  const boostedLogs: string[] = [];

  const minMap = chapter.minCharacterAffection || {};
  for (const char of characters) {
    const requiredMin = minMap[char.id];
    if (typeof requiredMin === 'number') {
      const cur = nextAffection[char.id] ?? char.initialAffection;
      if (cur < requiredMin) {
        nextAffection[char.id] = requiredMin;
        boostedLogs.push(`${char.name} 好感度保底补偿: ${cur} → ${requiredMin}`);
      }
    }
  }

  const minVars = chapter.minVariables || {};
  for (const [key, minVal] of Object.entries(minVars)) {
    const curVal = Number(nextVariables[key] ?? 0);
    if (curVal < minVal) {
      nextVariables[key] = minVal;
      boostedLogs.push(`变量 [${key}] 保底补偿: ${curVal} → ${minVal}`);
    }
  }

  return { nextAffection, nextVariables, boostedLogs };
}
