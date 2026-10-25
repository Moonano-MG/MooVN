import type { VNProject, SceneNode, StoryChapter } from '../types.ts';
import { writeFileToMountedMooVNFolder } from './workspaceManager.ts';

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
  if (depth > 16 || !obj || typeof obj !== 'object') return false;
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

function validateVNProjectShape(proj: unknown): {
  ok: boolean;
  project?: VNProject;
  error?: string;
} {
  if (!proj || typeof proj !== 'object') {
    return { ok: false, error: 'ERR_SCHEMA_INVALID: 工程根节点不是有效对象' };
  }
  const p = proj as Record<string, unknown>;
  if (!Array.isArray(p.nodes) || p.nodes.length === 0) {
    return { ok: false, error: 'ERR_SCHEMA_NODES: 工程缺少有效的 nodes 数组' };
  }
  if (p.nodes.length > MAX_MPVN_NODES_COUNT) {
    return {
      ok: false,
      error: `ERR_SCHEMA_NODE_LIMIT: 节点数量 (${p.nodes.length}) 超过安全上限 (${MAX_MPVN_NODES_COUNT})`,
    };
  }
  if (!Array.isArray(p.chapters) || p.chapters.length === 0) {
    return { ok: false, error: 'ERR_SCHEMA_CHAPTERS: 工程缺少有效的 chapters 数组' };
  }

  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i] as Partial<SceneNode> | null;
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id.trim()) {
      return { ok: false, error: `ERR_SCHEMA_NODE_ID: 第 ${i + 1} 个节点缺少有效 id` };
    }
    if (!Array.isArray(n.dialogues)) n.dialogues = [];
    if (!Array.isArray(n.choices)) n.choices = [];
    if (!Array.isArray(n.characters)) n.characters = [];
    if (!n.position || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') {
      n.position = { x: 120 + i * 280, y: 160 };
    }
  }

  for (let i = 0; i < p.chapters.length; i++) {
    const c = p.chapters[i] as Partial<StoryChapter> | null;
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id.trim()) {
      return { ok: false, error: `ERR_SCHEMA_CHAPTER_ID: 第 ${i + 1} 个章节缺少有效 id` };
    }
  }

  const typed = p as unknown as VNProject;
  if (!typed.id || typeof typed.id !== 'string') {
    typed.id = `proj-${Date.now()}`;
  }
  if (!typed.title || typeof typed.title !== 'string') {
    typed.title = '未命名视觉小说项目';
  }
  if (!typed.startNodeId || !typed.nodes.some((n) => n.id === typed.startNodeId)) {
    typed.startNodeId = typed.nodes[0].id;
  }
  if (!Array.isArray(typed.characters)) typed.characters = [];
  if (!Array.isArray(typed.variables)) typed.variables = [];

  return { ok: true, project: typed };
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
      return validateVNProjectShape(parsed.project);
    }

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

  await writeFileToMountedMooVNFolder(fileName, content, 'Projects');

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
