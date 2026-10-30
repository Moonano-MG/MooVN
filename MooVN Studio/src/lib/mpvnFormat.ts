import type { VNProject } from '../types.ts';
import { validateVNProjectShape } from './projectSchema.ts';
import { sha256Json } from './jsonChecksum.ts';

export const MAX_MPVN_PROJECT_BYTES = 16 * 1024 * 1024; // 16 MiB limit
export const MAX_MPVN_NODES_COUNT = 5000;
export const CURRENT_PROJECT_SCHEMA_VERSION = '1.1.0' as const;

type CoordinateVersion = '1.0.0' | '1.1.0';

function normalizeSchemaVersion(version: unknown): CoordinateVersion | undefined {
  if (version === undefined) return undefined;
  if (version === '1.0' || version === '1.0.0') return '1.0.0';
  if (version === '1.1' || version === '1.1.0') return '1.1.0';
  throw new Error(`ERR_SCHEMA_VERSION: 不支持的工程版本 ${String(version)}`);
}

/**
 * A 1.0 placement at y <= 70 used the center of a 78%-high portrait;
 * lower placements already used the bottom. The specified migration is an
 * approximation for that historic 78% convention, not a per-asset repair.
 * Never mutate the source; snapshots and exported packages both retain a 1.1
 * marker so reopening or saving them cannot apply the offset a second time.
 */
export function upgradeProjectCoordinates(project: VNProject, envelopeVersion?: unknown): {
  project: VNProject;
  migrated: boolean;
  migratedPlacements: number;
} {
  const inside = normalizeSchemaVersion(project.schemaVersion);
  const outside = normalizeSchemaVersion(envelopeVersion);
  if (inside && outside && inside !== outside) {
    throw new Error('ERR_SCHEMA_VERSION: 工程内容与文件封套版本不一致');
  }
  const legacy = (inside || outside || '1.0.0') === '1.0.0';
  let migratedPlacements = 0;
  const nodes = legacy ? project.nodes.map((node) => ({
    ...node,
    characters: node.characters.map((placement) => {
      if (placement.y > 70) return placement;
      migratedPlacements += 1;
      return { ...placement, y: Math.min(100, placement.y + 39) };
    }),
  })) : project.nodes;
  return {
    project: project.schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION && !legacy
      ? project
      : { ...project, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION, nodes },
    migrated: legacy,
    migratedPlacements,
  };
}

export interface MpvnProjectPackage {
  magic: 'MPVN_STUDIO_PROJECT';
  format: 'mpvn';
  envelopeVersion: 2;
  integrity: { algorithm: 'sha256'; digest: string };
  schemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  studioName: 'MooVN Studio';
  exportedAt: string;
  projectMeta: {
    id: string;
    title: string;
    author: string;
    version: string;
    chaptersCount: number;
    nodesCount: number;
    charactersCount: number;
  };
  project: VNProject;
}

function hasDangerousKeys(obj: unknown, depth = 0): boolean {
  if (depth > 64) return true;
  if (!obj || typeof obj !== 'object') return false;
  if (
    Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(obj, 'prototype')
  ) {
    return true;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (val && typeof val === 'object' && hasDangerousKeys(val, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * 将 MooVN Studio 项目序列化为 .mpvn 格式文本
 */
export function serializeMpvnProject(project: VNProject): string {
  const currentProject = upgradeProjectCoordinates(project).project;
  if (new TextEncoder().encode(JSON.stringify(currentProject)).byteLength > MAX_MPVN_PROJECT_BYTES) {
    throw new Error('ERR_PAYLOAD_TOO_LARGE: 工程文件超过 16 MiB');
  }
  const validation = validateVNProjectShape(currentProject);
  if (!validation.ok) throw new Error(validation.error);
  const payload: Omit<MpvnProjectPackage, 'integrity'> = {
    magic: 'MPVN_STUDIO_PROJECT',
    format: 'mpvn',
    envelopeVersion: 2,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    studioName: 'MooVN Studio',
    exportedAt: new Date().toISOString(),
    projectMeta: {
      id: currentProject.id,
      title: currentProject.title,
      author: currentProject.author,
      version: currentProject.version,
      chaptersCount: currentProject.chapters.length,
      nodesCount: currentProject.nodes.length,
      charactersCount: currentProject.characters.length,
    },
    project: currentProject,
  };
  // The hash covers the JSON payload, not formatting whitespace or the hash field.
  // SHA-256 here is unkeyed: it can detect accidental changes, not authenticate a file.
  const digest = sha256Json(payload);
  const pkg: MpvnProjectPackage = { ...payload, integrity: { algorithm: 'sha256', digest } };
  const result = JSON.stringify(pkg, null, 2);
  if (new TextEncoder().encode(result).byteLength > MAX_MPVN_PROJECT_BYTES) {
    throw new Error('ERR_PAYLOAD_TOO_LARGE: 工程文件超过 16 MiB');
  }
  return result;
}

/**
 * 解析并校验 .mpvn 项目文件（含大小上限、原型污染检测与节点/章节 schema 校验，`GPT-12`）
 */
export function parseMpvnProject(rawText: string): {
  ok: boolean;
  project?: VNProject;
  error?: string;
  migrated?: boolean;
  migratedPlacements?: number;
  integrity?: 'sha256' | 'legacy-unchecked';
} {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, error: 'ERR_EMPTY_FILE: .mpvn 文件内容为空' };
  }
  if (new TextEncoder().encode(rawText).byteLength > MAX_MPVN_PROJECT_BYTES) {
    return {
      ok: false,
      error: `ERR_FILE_TOO_LARGE: 项目文件超过 ${MAX_MPVN_PROJECT_BYTES / (1024 * 1024)}MB 安全限制`,
    };
  }

  try {
    const value: unknown = JSON.parse(rawText);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'ERR_INVALID_JSON: 无效的 .mpvn 项目文件格式' };
    }

    const parsed = value as Record<string, unknown>;
    if (hasDangerousKeys(parsed)) {
      return {
        ok: false,
        error: 'ERR_PROTOTYPE_POLLUTION: 检测到非法属性名 (__proto__ / constructor)',
      };
    }

    if (
      parsed.magic === 'MSVN_CHAPTER_PACK' ||
      parsed.magic === 'MSVN_CHAPTER_PACKAGE_V1' ||
      parsed.format === 'msvn'
    ) {
      return {
        ok: false,
        error:
          'ERR_MSVN_NOT_PROJECT: 该文件是章节资源包 (.msvn)，不是可编辑项目文件 (.mpvn)。',
      };
    }

    if (parsed.project && typeof parsed.project === 'object') {
      if (parsed.magic !== undefined && (typeof parsed.magic !== 'string' || !['MPVN_STUDIO_PROJECT', 'MOOVN_PROJECT_MPVN_V1'].includes(parsed.magic))) {
        return { ok: false, error: 'ERR_UNSUPPORTED_FORMAT: 不支持的工程标识' };
      }
      if (parsed.format !== undefined && parsed.format !== 'mpvn') {
        return { ok: false, error: 'ERR_UNSUPPORTED_FORMAT: 不支持的工程格式' };
      }
      // Check the project schema before the package checksum, so future files
      // are never interpreted with the legacy placement migration.
      normalizeSchemaVersion(parsed.schemaVersion);
      const version = parsed.envelopeVersion;
      const checksum = parsed.integrity;
      let integrity: 'sha256' | 'legacy-unchecked' = 'legacy-unchecked';
      if (version !== undefined || checksum !== undefined) {
        if (version !== 2 || !checksum || typeof checksum !== 'object' || Array.isArray(checksum)) {
          return { ok: false, error: 'ERR_MPVN_CHECKSUM: 新版工程校验信息缺失或不支持' };
        }
        const field = checksum as Record<string, unknown>;
        if (field.algorithm !== 'sha256' || typeof field.digest !== 'string' || !/^[a-f0-9]{64}$/.test(field.digest)) {
          return { ok: false, error: 'ERR_MPVN_CHECKSUM: 工程校验信息无效' };
        }
        const { integrity: _excluded, ...payload } = parsed;
        const expected = sha256Json(payload);
        if (field.digest !== expected) {
          return { ok: false, error: 'ERR_MPVN_CHECKSUM: 工程内容已损坏或发生变化' };
        }
        integrity = 'sha256';
      }
      const validation = validateVNProjectShape(parsed.project);
      if (!validation.ok) return validation;
      return { ok: true, ...upgradeProjectCoordinates(validation.project, parsed.schemaVersion), integrity };
    }
    // Browser snapshots and older files are bare projects, not envelopes.
    normalizeSchemaVersion(parsed.schemaVersion);
    const validation = validateVNProjectShape(parsed);
    if (!validation.ok) return validation;
    return { ok: true, ...upgradeProjectCoordinates(validation.project), integrity: 'legacy-unchecked' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message.startsWith('ERR_SCHEMA_VERSION:')
        ? message
        : `ERR_JSON_SYNTAX: 解析 .mpvn 项目文件失败: ${message}`,
    };
  }
}

/**
 * 导出并下载 .mpvn 项目文件（延时回收 ObjectURL 避免 Safari/Firefox 下载中断，`Kimi 1L`）
 */
export async function exportProjectAsMpvn(project: VNProject): Promise<string> {
  const safeName = (project.title || project.id || 'MooVN_Project').replace(
    /[\\/:*?"<>|\s]+/g,
    '_'
  );
  const fileName = safeName.endsWith('.mpvn') ? safeName : `${safeName}.mpvn`;
  const content = serializeMpvnProject(project);

  if (typeof window !== 'undefined') {
    const blob = new Blob([content], {
      type: 'application/x-moovn-project+json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return fileName;
}
