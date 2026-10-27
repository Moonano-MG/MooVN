import type { VNProject } from '../types.ts';
import { validateVNProjectShape } from './projectSchema.ts';

export const MAX_MPVN_PROJECT_BYTES = 16 * 1024 * 1024; // 16 MiB limit
export const MAX_MPVN_NODES_COUNT = 5000;

export interface MpvnProjectPackage {
  magic: 'MPVN_STUDIO_PROJECT';
  format: 'mpvn';
  schemaVersion: '1.0.0';
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
  const pkg: MpvnProjectPackage = {
    magic: 'MPVN_STUDIO_PROJECT',
    format: 'mpvn',
    schemaVersion: '1.0.0',
    studioName: 'MooVN Studio',
    exportedAt: new Date().toISOString(),
    projectMeta: {
      id: project.id,
      title: project.title,
      author: project.author,
      version: project.version,
      chaptersCount: project.chapters.length,
      nodesCount: project.nodes.length,
      charactersCount: project.characters.length,
    },
    project,
  };
  return JSON.stringify(pkg, null, 2);
}

/**
 * 解析并校验 .mpvn 项目文件（含大小上限、原型污染检测与节点/章节 schema 校验，`GPT-12`）
 */
export function parseMpvnProject(rawText: string): {
  ok: boolean;
  project?: VNProject;
  error?: string;
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
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'ERR_INVALID_JSON: 无效的 .mpvn 项目文件格式' };
    }

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
      if (parsed.magic && !['MPVN_STUDIO_PROJECT', 'MOOVN_PROJECT_MPVN_V1'].includes(parsed.magic)) {
        return { ok: false, error: 'ERR_UNSUPPORTED_FORMAT: 不支持的工程标识' };
      }
      if (parsed.format && parsed.format !== 'mpvn') {
        return { ok: false, error: 'ERR_UNSUPPORTED_FORMAT: 不支持的工程格式' };
      }
      if (parsed.schemaVersion && !['1.0', '1.0.0'].includes(String(parsed.schemaVersion))) {
        return { ok: false, error: `ERR_SCHEMA_VERSION: 不支持的工程版本 ${String(parsed.schemaVersion)}` };
      }
      return validateVNProjectShape(parsed.project);
    }
    // Legacy bare project objects are validated as-is; no implicit repair occurs.
    return validateVNProjectShape(parsed);
  } catch (err) {
    return {
      ok: false,
      error: `ERR_JSON_SYNTAX: 解析 .mpvn 项目文件失败: ${
        err instanceof Error ? err.message : String(err)
      }`,
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
