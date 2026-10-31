import type {
  MooVNSystemSettings,
  SavedProjectMeta,
  VNProject,
} from '../types.ts';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../data/defaultProject.ts';
import { DEFAULT_PERFORMANCE_CONFIG } from './assetCompressionEngine.ts';
import {
  isTauriEnvironment,
  getWorkspacePathsFromTauri,
  loadProjectFromTauri,
  saveProjectToTauriDetailed,
  writeWorkspaceFileViaTauri,
  type WorkspacePaths,
} from './tauriBridge.ts';
import { getProjectSnapshot, putProjectSnapshot } from './projectStorage.ts';
import { newId } from './ids.ts';
import { validateVNProjectShape } from './projectSchema.ts';
import { migrateEmbeddedProjectMedia, verifyProjectAssets } from './assetStore.ts';

const SETTINGS_STORAGE_KEY = 'moovn_studio_settings_v3';
const PROJECTS_STORAGE_KEY = 'moovn_studio_projects_v3';

/** Import is always a separate, unsaved project; keep all internal graph IDs intact. */
export function makeImportedProjectCopy(project: VNProject): VNProject {
  return { ...project, id: newId('project'), projectPath: undefined };
}

/** Browser previews do not have desktop filesystem privileges, even in a Studio build. */
export const IS_WEB_EDITION = !isTauriEnvironment();
let resolvedDesktopPaths: WorkspacePaths | null = null;

export async function refreshWorkspacePaths(): Promise<WorkspacePaths> {
  if (!isTauriEnvironment()) return getPlatformDefaultPaths('web');
  const result = await getWorkspacePathsFromTauri();
  if (!result.ok || !result.data) {
    throw new Error(result.error || 'ERR_WORKSPACE_PATH: 无法读取工作区路径');
  }
  resolvedDesktopPaths = result.data;
  return result.data;
}

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

export function getPlatformDefaultPaths(platform: MooVNSystemSettings['platform']): WorkspacePaths {
  if (platform === 'web' || !isTauriEnvironment()) {
    return {
      workspaceRootPath: 'browser://MooVN_Workspace',
      projectsDirectoryPath: 'browser://MooVN_Workspace/Projects',
      exportOutputDirectoryPath: 'browser://MooVN_Workspace/Exports',
      cacheDirectoryPath: 'browser://MooVN_Workspace/Cache',
      settingsFilePath: 'browser://MooVN_Workspace/settings.moovn.json',
    };
  }
  return resolvedDesktopPaths || {
    workspaceRootPath: '正在读取桌面工作区…',
    projectsDirectoryPath: '正在读取桌面工作区…',
    exportOutputDirectoryPath: '正在读取桌面工作区…',
    cacheDirectoryPath: '正在读取桌面工作区…',
    settingsFilePath: '正在读取桌面工作区…',
  };
}

export async function syncWriteToRealWorkspaceDisk(
  subFolder: 'Projects' | 'Exports' | 'Cache' | 'Models' | 'Scripts' | '',
  fileName: string,
  content: string,
  customDir?: string
): Promise<string | null> {
  // The desktop backend confines writes to its actual workspace. Never fall back to a dev server.
  if (!isTauriEnvironment() || customDir) return null;
  const mappedSubDir = subFolder === 'Exports' ? 'Exports' : subFolder === 'Cache' || subFolder === '' ? 'Cache' : 'Projects';
  const result = await writeWorkspaceFileViaTauri(mappedSubDir, fileName, content);
  return result.ok && result.data ? result.data : null;
}

export async function fetchWorkspaceDiskStatus(): Promise<null> {
  return null;
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
      defaultScriptLang: 'typescript',
    },
    defaultGameSettings: {
      textSpeedMs: 32,
      autoPlayDelayMs: 2000,
      bgmVolume: 75,
      sfxVolume: 85,
      motionLevel: 'subtle',
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
      ...defaults,
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

export function saveSystemSettings(settings: MooVNSystemSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function resetSystemSettings(): MooVNSystemSettings {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // ignore
  }
  const fresh = loadSystemSettings();
  saveSystemSettings(fresh);
  return fresh;
}

export async function syncSystemSettingsToDisk(
  settings: MooVNSystemSettings
): Promise<string | null> {
  const payload = JSON.stringify(settings, null, 2);
  return syncWriteToRealWorkspaceDisk('', 'settings.moovn.json', payload);
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
type BrowsableDirectory = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<BrowsableDirectory> };
let activeWebDirHandle: FileSystemDirectoryHandle | null = null;

export function getActiveWebDirHandle(): FileSystemDirectoryHandle | null {
  return activeWebDirHandle;
}

export async function pickDeviceMooVNFolder(): Promise<{
  folderName: string;
  loadedSettings?: MooVNSystemSettings;
  loadedProjects: VNProject[];
} | null> {
  if (typeof window === 'undefined') return null;
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const dirHandle = await picker.call(window, { mode: 'readwrite' });
    const loadedProjects: VNProject[] = [];
    const { parseMpvnProject } = await import('./mpvnFormat.ts');
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      const name = entry.name;
      if (!name.endsWith('.mpvn') && !name.endsWith('.moovn.json') && !name.endsWith('.vnproject.json')) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.size > 16 * 1024 * 1024) throw new Error(`ERR_FILE_TOO_LARGE: ${name}`);
      const validation = parseMpvnProject(await file.text());
      if (!validation.ok || !validation.project) throw new Error(`${name}: ${validation.error || 'ERR_PROJECT_VALIDATION'}`);
      loadedProjects.push(validation.project);
    }
    const folderName = dirHandle.name || 'MooVN';
    const currentSettings = { ...loadSystemSettings(), webMountedFolderName: folderName };
    if (!saveSystemSettings(currentSettings)) throw new Error('ERR_SETTINGS_WRITE: 无法保存文件夹设置');
    activeWebDirHandle = dirHandle;
    return { folderName, loadedSettings: currentSettings, loadedProjects };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
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
  if (isTauriEnvironment()) {
    return Boolean(await syncWriteToRealWorkspaceDisk(subFolder, filename, content, customDir));
  }
  if (!activeWebDirHandle || customDir) return false;
  try {
    const dir = await activeWebDirHandle.getDirectoryHandle(subFolder, { create: true });
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (err) {
      await writable.abort?.();
      throw err;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建全新纯净空白视觉小说项目 (`GPT-18 / CL-18`: 0 角色、1 章节、1 空节点、无预置 BGM/天气)
 */
export function createBlankVNProject(params: {
  title: string;
  author: string;
  width: number;
  height: number;
  projectPath: string;
}): VNProject {
  const id = newId('proj');
  const startNodeId = newId('scene');
  const chapterId = newId('chapter');
  return {
    schemaVersion: '1.1.0',
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
    uiConfig: structuredClone(DEFAULT_PROJECT.uiConfig),
    characters: [],
    variables: [
      { key: 'chapterIndex', label: '当前章节序号', type: 'number', value: 1 },
    ],
    chapters: [
      {
        id: chapterId,
        index: 1,
        title: '第一章：序章',
        subtitle: 'Chapter 01',
        yamlFileName: 'chapter_01.yaml',
        description: '新建章节',
          minCharacterAffection: {},
      },
    ],
    nodes: [
      {
        id: startNodeId,
        type: 'dialogue',
        title: '初始场景 01',
        chapterId,
        position: { x: 140, y: 160 },
        backgroundId: '',
        bgmId: '',
        transition: 'fade',
        weatherEffect: 'none',
        colorFilter: 'none',
        characters: [],
        dialogues: [
          {
            id: newId('dlg'),
            speakerId: 'narrator',
            speakerName: '旁白',
            speakerColor: '#94a3b8',
            text: '请在此输入第一句台词，或在右侧检查器中添加登场角色与背景。',
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
 * 创建独立于空白工程之外的入门示例项目 (`SAMPLE_PROJECT`, `GPT-18 / CL-18`)
 */
export function createSampleVNProject(projectPath?: string): VNProject {
  const cloned = structuredClone(SAMPLE_PROJECT);
  cloned.id = newId('sample');
  cloned.projectPath =
    projectPath ||
    `${loadSystemSettings().projectsDirectoryPath}/Sample_Classroom.mpvn`;
  cloned.performanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG };
  return cloned;
}

/**
 * 构建 MooVN Studio 空白基础项目实例（内部测试用游戏模板已独立剥离为本地 .mpvn 文件，不内置于公开版）
 */
export function createPresetTemplateProject(customTitle?: string, projectPath?: string): VNProject {
  const cloned = structuredClone(DEFAULT_PROJECT);
  if (customTitle) cloned.title = customTitle;
  cloned.isTemplatePreset = false;
  cloned.projectPath =
    projectPath ||
    `${loadSystemSettings().projectsDirectoryPath}/Untitled_Project.mpvn`;
  cloned.performanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG };
  return cloned;
}

export function loadSavedProjectsList(): SavedProjectMeta[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedProjectMeta =>
      Boolean(item && typeof item.id === 'string' && typeof item.path === 'string')
    );
  } catch {
    return [];
  }
}

export type WorkspaceSaveResult =
  | { ok: true; path: string; storage: 'file' | 'browser'; project: VNProject; savedAt: number }
  | { ok: false; code: string; error: string; path?: string };

function projectFileName(project: Pick<VNProject, 'id' | 'projectPath'>, path?: string): string {
  const candidate = (path || project.projectPath || `${project.id}.mpvn`).split(/[\\/]/).pop() || '';
  if (!candidate || candidate.startsWith('.') || candidate.includes('..') ||
      /[\\/:*?"<>|\x00-\x1f]/.test(candidate) || !candidate.toLowerCase().endsWith('.mpvn')) {
    throw new Error('ERR_INVALID_PROJECT_PATH: 工程文件名无效，须为 .mpvn 文件');
  }
  return candidate;
}

let saveQueue: Promise<void> = Promise.resolve();

/** Serialize saves so an older, slower write cannot replace a newer revision. */
export function saveProjectToWorkspace(project: VNProject, customPath?: string): Promise<WorkspaceSaveResult> {
  const operation = saveQueue.then(() => performProjectSave(project, customPath));
  saveQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function performProjectSave(project: VNProject, customPath?: string): Promise<WorkspaceSaveResult> {
  let path: string | undefined;
  try {
    const fileName = projectFileName(project, customPath);
    const { serializeMpvnProject, upgradeProjectCoordinates, MAX_MPVN_PROJECT_BYTES } = await import('./mpvnFormat.ts');
    const preparedProject = await migrateEmbeddedProjectMedia(upgradeProjectCoordinates(project).project);
    if (isTauriEnvironment()) {
      const paths = await refreshWorkspacePaths();
      const separator = paths.projectsDirectoryPath.includes('\\') ? '\\' : '/';
      path = `${paths.projectsDirectoryPath.replace(/[\\/]+$/, '')}${separator}${fileName}`;
      const updatedProject = { ...preparedProject, projectPath: path };
      const payload = serializeMpvnProject(updatedProject);
      if (new TextEncoder().encode(payload).byteLength > MAX_MPVN_PROJECT_BYTES) {
        return { ok: false, code: 'ERR_PAYLOAD_TOO_LARGE', error: '工程超过 16 MiB 上限，请先减少内嵌媒体。', path };
      }
      const validation = validateVNProjectShape(updatedProject);
      if (!validation.ok) return { ok: false, code: validation.error.match(/ERR_[A-Z0-9_]+/)?.[0] || 'ERR_SCHEMA_INVALID', error: validation.error, path };
      await verifyProjectAssets(updatedProject);
      const result = await saveProjectToTauriDetailed(fileName, payload);
      if (!result.ok || !result.path) {
        return { ok: false, code: result.code || 'ERR_SAVE_FAILED', error: result.error || '保存失败', path };
      }
      path = result.path;
      const saved = { ...updatedProject, projectPath: path };
      await persistRecentProject(saved, path);
      return { ok: true, path, storage: 'file', project: saved, savedAt: result.data?.saved_at_epoch_ms || Date.now() };
    }

    path = `browser://MooVN_Workspace/Projects/${fileName}`;
    const saved = { ...preparedProject, projectPath: path };
    const payload = serializeMpvnProject(saved);
    if (new TextEncoder().encode(payload).byteLength > MAX_MPVN_PROJECT_BYTES) {
      return { ok: false, code: 'ERR_PAYLOAD_TOO_LARGE', error: '工程超过 16 MiB 上限，请先减少内嵌媒体。', path };
    }
    const validation = validateVNProjectShape(saved);
    if (!validation.ok) return { ok: false, code: validation.error.match(/ERR_[A-Z0-9_]+/)?.[0] || 'ERR_SCHEMA_INVALID', error: validation.error, path };
    await verifyProjectAssets(saved);
    await putProjectSnapshot(`saved:${project.id}`, saved);
    await persistRecentProject(saved, path);
    return { ok: true, path, storage: 'browser', project: saved, savedAt: Date.now() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.match(/ERR_[A-Z0-9_]+/)?.[0] || 'ERR_SAVE_FAILED';
    return { ok: false, code, error: message, path };
  }
}

async function persistRecentProject(project: VNProject, path: string): Promise<void> {
  const meta: SavedProjectMeta = {
    id: project.id,
    title: project.title,
    author: project.author,
    version: project.version,
    path,
    updatedAt: new Date().toLocaleString(),
    chaptersCount: project.chapters.length,
    nodesCount: project.nodes.length,
    isTemplatePreset: project.isTemplatePreset,
  };
  const list = loadSavedProjectsList().filter((item) => item.id !== meta.id);
  const metadata = await migrateLegacyRecentEntries(list);
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([meta, ...metadata]));
  } catch (error) {
    throw new Error(`ERR_RECENT_PROJECTS_WRITE: 工程已写入 ${path}，但更新最近工程列表失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function migrateLegacyRecentEntries(list: SavedProjectMeta[]): Promise<SavedProjectMeta[]> {
  const metadata: SavedProjectMeta[] = [];
  for (const item of list) {
    const { projectData, ...entry } = item;
    if (projectData) {
      const validation = validateVNProjectShape(projectData);
      if (!validation.ok) throw new Error(`ERR_LEGACY_PROJECT_MIGRATION: ${item.title}: ${validation.error}`);
      await putProjectSnapshot(`legacy:${item.id}`, projectData);
    }
    metadata.push(entry);
  }
  return metadata;
}

/** Move legacy recent-list project bodies to IndexedDB before removing them from localStorage. */
export async function migrateLegacyRecentProjects(): Promise<SavedProjectMeta[]> {
  const list = loadSavedProjectsList();
  if (!list.some((item) => item.projectData)) return list;
  const metadata = await migrateLegacyRecentEntries(list);
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(metadata));
  return metadata;
}

export async function openSavedProject(meta: SavedProjectMeta): Promise<{
  ok: boolean; project?: VNProject; error?: string; recoveredFromBackup?: boolean;
  migrated?: boolean; migratedPlacements?: number; integrity?: 'sha256' | 'legacy-unchecked';
}> {
  let nativeError: string | undefined;
  if (isTauriEnvironment()) {
    const result = await loadProjectFromTauri(projectFileName({ id: meta.id, projectPath: meta.path }));
    if (result.ok && result.data) {
      return {
        ok: true, project: result.data, recoveredFromBackup: result.recoveredFromBackup,
        migrated: result.migrated, migratedPlacements: result.migratedPlacements, integrity: result.integrity,
      };
    }
    nativeError = result.error || '工程文件读取失败';
  }
  try {
    const snapshot = await getProjectSnapshot(`${isTauriEnvironment() ? 'legacy' : 'saved'}:${meta.id}`)
      || (!isTauriEnvironment() ? await getProjectSnapshot(`legacy:${meta.id}`) : undefined);
    const candidate = snapshot?.project || meta.projectData;
    if (candidate) {
      const { parseMpvnProject } = await import('./mpvnFormat.ts');
      const validation = parseMpvnProject(JSON.stringify(candidate));
      return validation.ok ? {
        ok: true, project: validation.project,
        recoveredFromBackup: isTauriEnvironment() || snapshot?.key.startsWith('legacy:'),
        migrated: validation.migrated, migratedPlacements: validation.migratedPlacements,
      } : { ok: false, error: validation.error };
    }
  } catch (error) {
    if (!meta.projectData) return { ok: false, error: nativeError || (error instanceof Error ? error.message : String(error)) };
    const { parseMpvnProject } = await import('./mpvnFormat.ts');
    const validation = parseMpvnProject(JSON.stringify(meta.projectData));
    return validation.ok ? {
      ok: true, project: validation.project, recoveredFromBackup: true,
      migrated: validation.migrated, migratedPlacements: validation.migratedPlacements,
    } : { ok: false, error: validation.error };
  }
  if (nativeError) return { ok: false, error: nativeError };
  return { ok: false, error: 'ERR_PROJECT_NOT_FOUND: 找不到此工程，请重新导入' };
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
