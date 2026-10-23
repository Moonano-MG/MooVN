import { VNProject } from '../types';
import { writeFileToMountedMooVNFolder } from './workspaceManager';

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
 * 解析 .mpvn 项目文件（同时兼容旧版 .moovn.json 工程文件），拒绝将已编译的游戏产物(.msvn)误当作项目导入
 */
export function parseMpvnProject(rawText: string): {
  ok: boolean;
  project?: VNProject;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: '无效的 .mpvn 项目文件格式' };
    }

    // 拦截游戏运行时章节包 (.msvn)
    if (parsed.magic === 'MSVN_CHAPTER_PACK' || parsed.format === 'msvn') {
      return {
        ok: false,
        error:
          '该文件是已导出的游戏章节运行包 (.msvn)，不是 MooVN Studio 可编辑项目文件 (.mpvn)。请导入 .mpvn 项目文件。',
      };
    }

    // 标准 .mpvn 封装结构
    if (
      (parsed.magic === 'MPVN_STUDIO_PROJECT' || parsed.format === 'mpvn') &&
      parsed.project &&
      Array.isArray(parsed.project.nodes) &&
      Array.isArray(parsed.project.chapters)
    ) {
      return { ok: true, project: parsed.project as VNProject };
    }

    // 兼容直接包含 VNProject 结构的 .mpvn / .moovn.json 文件
    if (
      parsed.id &&
      Array.isArray(parsed.nodes) &&
      Array.isArray(parsed.chapters)
    ) {
      return { ok: true, project: parsed as VNProject };
    }

    return {
      ok: false,
      error: '文件缺少有效的 MooVN Studio 项目节点与章节结构 (.mpvn)',
    };
  } catch (err) {
    return {
      ok: false,
      error: `解析 .mpvn 项目文件失败: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * 导出并下载 .mpvn 项目文件（同时同步写入本地工作区 Projects 目录）
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
    URL.revokeObjectURL(url);
  }

  return fileName;
}
