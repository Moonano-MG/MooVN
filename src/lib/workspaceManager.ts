import {
  MooVNSystemSettings,
  SavedProjectMeta,
  VNProject,
} from '../types';
import { DEFAULT_PROJECT } from '../data/defaultProject';
import { DEFAULT_PERFORMANCE_CONFIG } from './assetCompressionEngine';

const SETTINGS_STORAGE_KEY = 'moovn_system_settings_v2';
const PROJECTS_STORAGE_KEY = 'moovn_saved_projects_v2';

export function detectRuntimePlatform(): MooVNSystemSettings['platform'] {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (!isTauri) return 'web';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  return 'windows';
}

export function getPlatformDefaultPaths(platform: MooVNSystemSettings['platform']): {
  workspaceRootPath: string;
  projectsDirectoryPath: string;
  exportOutputDirectoryPath: string;
  cacheDirectoryPath: string;
  settingsFilePath: string;
} {
  switch (platform) {
    case 'windows':
      return {
        workspaceRootPath: 'C:\\Users\\Public\\Documents\\MooVN',
        projectsDirectoryPath: 'C:\\Users\\Public\\Documents\\MooVN\\Projects',
        exportOutputDirectoryPath: 'C:\\Users\\Public\\Documents\\MooVN\\Exports',
        cacheDirectoryPath: 'C:\\Users\\Public\\Documents\\MooVN\\Cache',
        settingsFilePath: 'C:\\Users\\Public\\Documents\\MooVN\\settings.moovn.json',
      };
    case 'android':
      return {
        workspaceRootPath: '/storage/emulated/0/Android/data/com.moovn.editor/files/MooVN',
        projectsDirectoryPath:
          '/storage/emulated/0/Android/data/com.moovn.editor/files/MooVN/Projects',
        exportOutputDirectoryPath:
          '/storage/emulated/0/Android/data/com.moovn.editor/files/MooVN/Exports',
        cacheDirectoryPath:
          '/storage/emulated/0/Android/data/com.moovn.editor/files/MooVN/Cache',
        settingsFilePath:
          '/storage/emulated/0/Android/data/com.moovn.editor/files/MooVN/settings.moovn.json',
      };
    case 'ios':
      return {
        workspaceRootPath: 'On My iPhone/MooVN',
        projectsDirectoryPath: 'On My iPhone/MooVN/Projects',
        exportOutputDirectoryPath: 'On My iPhone/MooVN/Exports',
        cacheDirectoryPath: 'On My iPhone/MooVN/Cache',
        settingsFilePath: 'On My iPhone/MooVN/settings.moovn.json',
      };
    case 'macos':
      return {
        workspaceRootPath: '~/Documents/MooVN',
        projectsDirectoryPath: '~/Documents/MooVN/Projects',
        exportOutputDirectoryPath: '~/Documents/MooVN/Exports',
        cacheDirectoryPath: '~/Documents/MooVN/Cache',
        settingsFilePath: '~/Documents/MooVN/settings.moovn.json',
      };
    case 'web':
    default:
      return {
        workspaceRootPath: '/home/user/MooVN/MooVN_Workspace',
        projectsDirectoryPath: '/home/user/MooVN/MooVN_Workspace/Projects',
        exportOutputDirectoryPath: '/home/user/MooVN/MooVN_Workspace/Exports',
        cacheDirectoryPath: '/home/user/MooVN/MooVN_Workspace/Cache',
        settingsFilePath: '/home/user/MooVN/MooVN_Workspace/settings.moovn.json',
      };
  }
}

export async function syncWriteToRealWorkspaceDisk(
  subFolder: 'Projects' | 'Exports' | 'Cache' | 'Models' | '',
  fileName: string,
  content: string,
  customDir?: string
): Promise<string | null> {
  try {
    const resp = await fetch('/api/moovn-fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subFolder, fileName, content, customDir }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.savedPath || null;
  } catch {
    return null;
  }
}

export async function fetchWorkspaceDiskStatus(): Promise<{
  ok: boolean;
  workspaceRoot: string;
  projectsDir: string;
  exportsDir: string;
  cacheDir: string;
  modelsDir: string;
  settingsFile: string;
  projectFiles: { name: string; path: string; size: number; mtime: string }[];
  exportFiles: { name: string; path: string; size: number; mtime: string }[];
  modelFiles: { name: string; path: string; size: number; mtime: string }[];
} | null> {
  try {
    const resp = await fetch('/api/moovn-fs/status');
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export function loadSystemSettings(): MooVNSystemSettings {
  const platform = detectRuntimePlatform();
  const defaults = getPlatformDefaultPaths(platform);

  const fallback: MooVNSystemSettings = {
    platform,
    ...defaults,
    editorConfig: {
      autoSaveIntervalSec: 15,
      coloredNodeCategories: true,
      showStreamMonitorInPreview: true,
      defaultScriptLang: 'typescript',
    },
    defaultGameSettings: {
      textSpeedMs: 32,
      autoPlayDelayMs: 2000,
      bgmVolume: 75,
      sfxVolume: 85,
    },
    performanceConfig: { ...DEFAULT_PERFORMANCE_CONFIG },
  };

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<MooVNSystemSettings>;
    return {
      ...fallback,
      ...parsed,
      editorConfig: { ...fallback.editorConfig, ...(parsed.editorConfig || {}) },
      defaultGameSettings: {
        ...fallback.defaultGameSettings,
        ...(parsed.defaultGameSettings || {}),
      },
      performanceConfig: {
        ...fallback.performanceConfig,
        ...(parsed.performanceConfig || {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function saveSystemSettings(settings: MooVNSystemSettings): void {
  const payload = JSON.stringify(settings, null, 2);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, payload);
  } catch {
    // ignore storage quota errors
  }
  syncWriteToRealWorkspaceDisk('', 'settings.moovn.json', payload);
}

export function exportSettingsFileJson(settings: MooVNSystemSettings): void {
  const payload = JSON.stringify(settings, null, 2);
  syncWriteToRealWorkspaceDisk('', 'settings.moovn.json', payload);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'settings.moovn.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Web 端支持选择设备上一个已经保存的 MooVN 文件夹（通过 File System Access API 或 webkitdirectory）
 */
let activeWebDirHandle: any = null;

export function getActiveWebDirHandle(): any {
  return activeWebDirHandle;
}

export async function pickDeviceMooVNFolder(): Promise<{
  folderName: string;
  loadedSettings?: MooVNSystemSettings;
  loadedProjects: VNProject[];
} | null> {
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      activeWebDirHandle = dirHandle;
      const folderName = dirHandle.name || 'MooVN';
      const loadedProjects: VNProject[] = [];
      let loadedSettings: MooVNSystemSettings | undefined;

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const name = entry.name as string;
          if (name === 'settings.moovn.json') {
            const file = await entry.getFile();
            const text = await file.text();
            loadedSettings = JSON.parse(text) as MooVNSystemSettings;
          } else if (name.endsWith('.moovn.json') || name.endsWith('.vnproject.json')) {
            const file = await entry.getFile();
            const text = await file.text();
            const proj = JSON.parse(text) as VNProject;
            if (proj && proj.id && Array.isArray(proj.nodes)) {
              loadedProjects.push(proj);
            }
          }
        }
      }

      // 将当前 settings.moovn.json 写入所选文件夹
      const currentSettings = loadedSettings || loadSystemSettings();
      currentSettings.webMountedFolderName = folderName;
      currentSettings.workspaceRootPath = `设备文件夹://${folderName}`;
      currentSettings.projectsDirectoryPath = `设备文件夹://${folderName}/Projects`;
      currentSettings.exportOutputDirectoryPath = `设备文件夹://${folderName}/Exports`;
      currentSettings.cacheDirectoryPath = `设备文件夹://${folderName}/Cache`;
      currentSettings.settingsFilePath = `设备文件夹://${folderName}/settings.moovn.json`;
      saveSystemSettings(currentSettings);

      try {
        const settingsFileHandle = await dirHandle.getFileHandle('settings.moovn.json', {
          create: true,
        });
        const writable = await settingsFileHandle.createWritable();
        await writable.write(JSON.stringify(currentSettings, null, 2));
        await writable.close();
      } catch {
        // read-only fallback
      }

      return { folderName, loadedSettings: currentSettings, loadedProjects };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 若 Web 端已挂载设备文件夹，可将项目或导出的包直接写入该文件夹
 */
export async function writeFileToMountedMooVNFolder(
  filename: string,
  content: string,
  subFolder: 'Projects' | 'Exports' | 'Cache' | 'Models' = 'Exports',
  customDir?: string
): Promise<boolean> {
  await syncWriteToRealWorkspaceDisk(subFolder, filename, content, customDir);
  if (!activeWebDirHandle) return true;
  try {
    const fileHandle = await activeWebDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return true;
  }
}

/**
 * 创建全新空白视觉小说项目
 */
export function createBlankVNProject(params: {
  title: string;
  author: string;
  width: number;
  height: number;
  projectPath: string;
}): VNProject {
  const id = `proj-${Date.now()}`;
  const startNodeId = 'node-ch1-start';
  return {
    id,
    title: params.title || '未命名视觉小说工程',
    author: params.author || '独立开发者',
    version: '0.1.0',
    projectPath: params.projectPath,
    isTemplatePreset: false,
    resolution: { width: params.width, height: params.height },
    defaultLanguage: 'typescript',
    startNodeId,
    performanceConfig: { ...DEFAULT_PERFORMANCE_CONFIG },
    uiConfig: JSON.parse(JSON.stringify(DEFAULT_PROJECT.uiConfig)),
    characters: [
      {
        id: 'heroine-1',
        name: '星野 雪奈',
        titleRole: '女主角',
        color: '#38bdf8',
        spriteId: 'char-yukina-1',
        initialAffection: 50,
        maxAffection: 100,
        bio: '登场角色设定',
        customAttributes: [],
      },
    ],
    variables: [
      { key: 'day_count', label: '当前天数', type: 'number', value: 1 },
    ],
    chapters: [
      {
        id: 'ch-1',
        index: 1,
        title: '第一章：序幕',
        subtitle: 'Chapter 01',
        yamlFileName: 'chapter_01.yaml',
        description: '故事开篇章节（必装基础包）',
        isBaseRequired: true,
        minCharacterAffection: { 'heroine-1': 50 },
      },
    ],
    nodes: [
      {
        id: startNodeId,
        type: 'dialogue',
        title: '开场对白',
        chapterId: 'ch-1',
        position: { x: 140, y: 160 },
        backgroundId: 'bg-sheet1-r1-c1',
        bgmId: 'bgm-morning-breeze',
        transition: 'fade',
        weatherEffect: 'sakura',
        colorFilter: 'none',
        characters: [
          {
            id: 'place-init-1',
            characterId: 'heroine-1',
            name: '星野 雪奈',
            spriteId: 'char-yukina-1',
            expressionLabel: '温柔微笑',
            x: 50,
            y: 55,
            scale: 1,
            enterAnimation: 'fade',
          },
        ],
        dialogues: [
          {
            id: 'dlg-init-1',
            speakerId: 'heroine-1',
            speakerName: '星野 雪奈',
            speakerColor: '#38bdf8',
            text: '欢迎来到全新的视觉小说工程！你可以在左侧添加节点、布置舞台立绘或导出多平台游戏。',
          },
        ],
        choices: [],
        visualBlocks: [],
        nextNodeId: null,
      },
    ],
  };
}

/**
 * 构建内置《汐见学园与第十三声钟鸣》模板项目实例（带每章最低角色好感保底配置与性能配置）
 */
export function createPresetTemplateProject(customTitle?: string, projectPath?: string): VNProject {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_PROJECT)) as VNProject;
  if (customTitle) cloned.title = customTitle;
  cloned.isTemplatePreset = true;
  cloned.projectPath =
    projectPath ||
    `${loadSystemSettings().projectsDirectoryPath}/Shiomi_Bell13.moovn.json`;
  cloned.performanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG };

  // 为 6 个章节自动注入保底角色好感度与必装标记（第一章必装，后续章节支持跳过时自动补偿数值）
  cloned.chapters = cloned.chapters.map((ch, idx) => {
    const minAffection: Record<string, number> = {};
    for (const c of cloned.characters) {
      minAffection[c.id] = Math.min(c.maxAffection, c.initialAffection + idx * 8);
    }
    return {
      ...ch,
      isBaseRequired: idx === 0,
      minCharacterAffection: ch.minCharacterAffection || minAffection,
      msvnSizeEstimateMb: idx === 0 ? 185 : 140 + idx * 25,
    };
  });

  return cloned;
}

export function loadSavedProjectsList(): SavedProjectMeta[] {
  const settings = loadSystemSettings();
  const templateProj = createPresetTemplateProject();
  const defaultTemplateMeta: SavedProjectMeta = {
    id: templateProj.id,
    title: templateProj.title,
    author: templateProj.author,
    version: templateProj.version,
    path: `${settings.projectsDirectoryPath}/Shiomi_Bell13.moovn.json`,
    updatedAt: '内置预设模板',
    chaptersCount: templateProj.chapters.length,
    nodesCount: templateProj.nodes.length,
    isTemplatePreset: true,
    projectData: templateProj,
  };

  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [defaultTemplateMeta];
    const parsed = JSON.parse(raw) as SavedProjectMeta[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultTemplateMeta];
    const hasTemplate = parsed.some((p) => p.id === templateProj.id || p.isTemplatePreset);
    return hasTemplate ? parsed : [defaultTemplateMeta, ...parsed];
  } catch {
    return [defaultTemplateMeta];
  }
}

export async function saveProjectToWorkspace(
  project: VNProject,
  customPath?: string
): Promise<SavedProjectMeta> {
  const settings = loadSystemSettings();
  const safeName = (project.title || project.id).replace(/[\\/:*?"<>|\s]+/g, '_');
  const resolvedPath =
    customPath ||
    project.projectPath ||
    `${settings.projectsDirectoryPath}/${safeName}.moovn.json`;

  const updatedProject: VNProject = {
    ...project,
    projectPath: resolvedPath,
  };

  const meta: SavedProjectMeta = {
    id: updatedProject.id,
    title: updatedProject.title,
    author: updatedProject.author,
    version: updatedProject.version,
    path: resolvedPath,
    updatedAt: new Date().toLocaleString(),
    chaptersCount: updatedProject.chapters.length,
    nodesCount: updatedProject.nodes.length,
    isTemplatePreset: updatedProject.isTemplatePreset,
    projectData: updatedProject,
  };

  const list = loadSavedProjectsList();
  const idx = list.findIndex((item) => item.id === meta.id);
  const nextList =
    idx >= 0 ? list.map((item, i) => (i === idx ? meta : item)) : [meta, ...list];

  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // ignore quota error
  }

  // 同步写入磁盘 MooVN_Workspace/Projects/ 目录及已挂载设备本地文件夹
  await writeFileToMountedMooVNFolder(
    `${safeName}.moovn.json`,
    JSON.stringify(updatedProject, null, 2),
    'Projects'
  );

  return meta;
}

export function deleteSavedProject(projectId: string): SavedProjectMeta[] {
  const list = loadSavedProjectsList().filter((p) => p.id !== projectId);
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}
