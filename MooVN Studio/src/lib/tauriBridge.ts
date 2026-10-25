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
export async function saveProjectToTauriDetailed(
  project: VNProject
): Promise<TauriOperationResult<SaveProjectTauriResponse>> {
  const payload = JSON.stringify(project, null, 2);
  const res = await invokeTauriCommand<SaveProjectTauriResponse>('save_project_json', {
    projectId: project.id || 'moovn_project',
    payload,
  });
  if (res.ok && res.data) {
    return {
      ok: true,
      data: res.data,
      path: res.data.path,
    };
  }
  return res;
}

export async function saveProjectToTauri(project: VNProject): Promise<boolean> {
  const res = await saveProjectToTauriDetailed(project);
  return res.ok;
}

export async function loadProjectFromTauri(
  projectId: string
): Promise<TauriOperationResult<VNProject>> {
  const res = await invokeTauriCommand<string>('load_project_json', {
    projectId,
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      code: res.code || 'ERR_LOAD_FAILED',
      error: res.error || '未能读取本地工程文件',
    };
  }
  try {
    const parsed = JSON.parse(res.data) as VNProject;
    return { ok: true, data: parsed };
  } catch (err: unknown) {
    return {
      ok: false,
      code: 'ERR_PARSE_PROJECT_JSON',
      error: err instanceof Error ? err.message : '工程 JSON 解析失败',
    };
  }
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
