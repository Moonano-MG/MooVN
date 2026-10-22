import { VNProject } from '../types';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function saveProjectToTauri(project: VNProject): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    const tauriWindow = window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    await tauriWindow.__TAURI_INTERNALS__?.invoke?.('save_project_json', {
      payload: JSON.stringify(project, null, 2),
    });
    return true;
  } catch {
    return false;
  }
}
