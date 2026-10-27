import type { VNProject } from '../types';

export interface TauriOperationResult<T = unknown> {
  ok: boolean;
  data?: T;
  path?: string;
  error?: string;
  code?: string;
}

interface TauriInternalsWindow {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as TauriInternalsWindow).__TAURI_INTERNALS__?.invoke)
  );
}

async function invokeTauriCommand<T>(
  cmd: string,
  args: Record<string, unknown> = {}
): Promise<TauriOperationResult<T>> {
  if (!isTauriEnvironment()) {
    return {
      ok: false,
      code: 'ERR_NOT_TAURI',
      error: '当前运行在浏览器 Web 模式，Tauri 原生命令不可用。',
    };
  }
  try {
    const tauriWindow = window as unknown as TauriInternalsWindow;
    const result = (await tauriWindow.__TAURI_INTERNALS__!.invoke!(cmd, args)) as T;
    return { ok: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const codeMatch = message.match(/^(ERR_[A-Z0-9_]+):/);
    return {
      ok: false,
      code: codeMatch ? codeMatch[1] : 'ERR_TAURI_INVOKE',
      error: message,
    };
  }
}

export interface SaveProjectTauriResponse {
  ok: boolean;
  path: string;
  backup_path: string;
  bytes_written: number;
  saved_at_epoch_ms: number;
}

/**
 * Atomically saves a project via the Tauri backend (`save_project_json`: temp -> fsync -> rename)
 * and returns a structured result with explicit error codes instead of silently failing.
 */
export interface WorkspacePaths {
  workspaceRootPath: string;
  projectsDirectoryPath: string;
  exportOutputDirectoryPath: string;
  cacheDirectoryPath: string;
  settingsFilePath: string;
}

export function getWorkspacePathsFromTauri(): Promise<TauriOperationResult<WorkspacePaths>> {
  return invokeTauriCommand<WorkspacePaths>('get_workspace_paths');
}

const recoveredProjectFiles = new Set<string>();

export async function saveProjectToTauriDetailed(
  fileName: string,
  payload: string
): Promise<TauriOperationResult<SaveProjectTauriResponse>> {
  const res = await invokeTauriCommand<SaveProjectTauriResponse>('save_project_json', {
    fileName,
    payload,
    retainBackup: recoveredProjectFiles.has(fileName),
  });
  if (!res.ok) return res;
  if (!res.data?.ok || !res.data.path) {
    return { ok: false, code: 'ERR_INVALID_SAVE_RESPONSE', error: '保存命令未返回有效的文件路径。' };
  }
  recoveredProjectFiles.delete(fileName);
  return { ok: true, data: res.data, path: res.data.path };
}

export async function loadProjectFromTauri(
  fileName: string
): Promise<TauriOperationResult<VNProject> & { recoveredFromBackup?: boolean; migrated?: boolean; migratedPlacements?: number }> {
  type LoadResult = { payload: string; path: string; recovered_from_backup: boolean };
  let result = await invokeTauriCommand<LoadResult>('load_project_json', { fileName, preferBackup: false });
  if (!result.ok || !result.data) {
    return { ok: false, code: result.code || 'ERR_LOAD_FAILED', error: result.error || '未能读取本地工程文件' };
  }
  const { parseMpvnProject } = await import('./mpvnFormat.ts');
  let parsed = parseMpvnProject(result.data.payload);
  if ((!parsed.ok || !parsed.project) && !result.data.recovered_from_backup) {
    const primaryError = parsed.error || '主工程校验失败';
    result = await invokeTauriCommand<LoadResult>('load_project_json', { fileName, preferBackup: true });
    if (!result.ok || !result.data) {
      return { ok: false, code: 'ERR_PROJECT_VALIDATION', error: `${primaryError}；备份读取失败：${result.error || '未知错误'}` };
    }
    parsed = parseMpvnProject(result.data.payload);
  }
  if (!parsed.ok || !parsed.project) {
    return { ok: false, code: 'ERR_PROJECT_VALIDATION', error: parsed.error || '工程与备份均未通过校验' };
  }
  if (result.data.recovered_from_backup) recoveredProjectFiles.add(fileName);
  else recoveredProjectFiles.delete(fileName);
  return {
    ok: true,
    data: { ...parsed.project, projectPath: result.data.path },
    path: result.data.path,
    recoveredFromBackup: result.data.recovered_from_backup,
    migrated: parsed.migrated,
    migratedPlacements: parsed.migratedPlacements,
  };
}

const ASSET_CHUNK_BYTES = 1024 * 1024;

export async function storeAssetViaTauri(fileName: string, bytes: Uint8Array): Promise<void> {
  const begin = await invokeTauriCommand<string>('begin_asset_upload', { fileName, size: bytes.byteLength });
  if (!begin.ok || !begin.data) throw new Error(begin.error || 'ERR_ASSET_UPLOAD: 无法开始上传');
  const token = begin.data;
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += ASSET_CHUNK_BYTES) {
      const chunk = Array.from(bytes.subarray(offset, offset + ASSET_CHUNK_BYTES));
      const result = await invokeTauriCommand<void>('append_asset_upload', { token, bytes: chunk });
      if (!result.ok) throw new Error(result.error || 'ERR_ASSET_WRITE: 资源写入失败');
    }
    const finish = await invokeTauriCommand<string>('finish_asset_upload', { token });
    if (!finish.ok || !finish.data) throw new Error(finish.error || 'ERR_ASSET_WRITE: 资源提交失败');
  } catch (error) {
    await invokeTauriCommand<void>('abort_asset_upload', { token });
    throw error;
  }
}

export async function readAssetViaTauri(fileName: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  do {
    const result = await invokeTauriCommand<{ bytes: number[]; total_bytes: number }>('read_asset_chunk', {
      fileName, offset, length: ASSET_CHUNK_BYTES,
    });
    if (!result.ok || !result.data) throw new Error(result.error || 'ERR_ASSET_READ: 资源读取失败');
    if (offset && total !== result.data.total_bytes) throw new Error('ERR_ASSET_CHANGED: 读取期间资源发生变化');
    total = result.data.total_bytes;
    const chunk = Uint8Array.from(result.data.bytes);
    if (!chunk.length && offset < total) throw new Error('ERR_ASSET_READ: 资源读取不完整');
    chunks.push(chunk);
    offset += chunk.length;
  } while (offset < total);
  const combined = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { combined.set(chunk, position); position += chunk.length; }
  return combined;
}

export async function evalScriptViaTauriEngine(
  sourceCode: string,
  lang: string
): Promise<TauriOperationResult<string[]>> {
  return invokeTauriCommand<string[]>('eval_engine_script', {
    sourceCode,
    lang,
  });
}

export async function exportSceneYamlViaTauri(
  fileName: string,
  yamlContent: string
): Promise<TauriOperationResult<string>> {
  return invokeTauriCommand<string>('export_scene_yaml', {
    fileName,
    yamlContent,
  });
}

export async function writeWorkspaceFileViaTauri(
  subDir: 'Projects' | 'Exports' | 'Cache' | 'Assets',
  fileName: string,
  content: string
): Promise<TauriOperationResult<string>> {
  return invokeTauriCommand<string>('write_workspace_file', {
    subDir,
    fileName,
    content,
  });
}

export async function readWorkspaceFileViaTauri(
  subDir: 'Projects' | 'Exports' | 'Cache' | 'Assets',
  fileName: string
): Promise<TauriOperationResult<string>> {
  return invokeTauriCommand<string>('read_workspace_file', {
    subDir,
    fileName,
  });
}

