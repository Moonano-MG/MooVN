/**
 * 存储抽象层：
 * - Web / 沙盒预览：localStorage + IndexedDB（大对象）
 * - Tauri 桌面/移动端：通过 window.__TAURI__ 检测后走 fs（appDataDir）
 * 对上层暴露统一的异步 get/set/remove 接口。
 */

type KV = Record<string, unknown>;

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function lsGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[MooVN] localStorage 写入失败（可能超出容量）:', err);
  }
}

export const storage = {
  isTauri,

  async get<T = unknown>(key: string): Promise<T | null> {
    if (isTauri()) {
      try {
        const tauri = (window as unknown as KV).__TAURI__ as {
          core?: { invoke?: (cmd: string, args?: KV) => Promise<unknown> };
        };
        const invoke = tauri?.core?.invoke;
        if (invoke) {
          const raw = await invoke('kv_read', { key });
          return raw === null ? null : (JSON.parse(String(raw)) as T);
        }
      } catch (err) {
        console.warn('[MooVN] Tauri kv_read 失败，回退 localStorage:', err);
      }
    }
    return lsGet(key) as T | null;
  },

  async set(key: string, value: unknown): Promise<void> {
    if (isTauri()) {
      try {
        const tauri = (window as unknown as KV).__TAURI__ as {
          core?: { invoke?: (cmd: string, args?: KV) => Promise<unknown> };
        };
        const invoke = tauri?.core?.invoke;
        if (invoke) {
          await invoke('kv_write', { key, value: JSON.stringify(value) });
          return;
        }
      } catch (err) {
        console.warn('[MooVN] Tauri kv_write 失败，回退 localStorage:', err);
      }
    }
    lsSet(key, value);
  },

  async remove(key: string): Promise<void> {
    if (isTauri()) {
      try {
        const tauri = (window as unknown as KV).__TAURI__ as {
          core?: { invoke?: (cmd: string, args?: KV) => Promise<unknown> };
        };
        const invoke = tauri?.core?.invoke;
        if (invoke) {
          await invoke('kv_delete', { key });
          return;
        }
      } catch {
        /* 回退 */
      }
    }
    localStorage.removeItem(key);
  },

  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out.push(k);
    }
    return out;
  }
};

/* ------------------------------------------------------------------ */
/* 键名约定                                                            */
/* ------------------------------------------------------------------ */
export const KEYS = {
  saveData: 'moovn.save.v1', // 存档（读档/存档档案互通）
  progress: 'moovn.progress.v1', // 全局进度：已读场景、通关结局
  settings: 'moovn.settings.v1', // 游戏设置（文字速度等）
  editorProject: 'moovn.editor.project.v1', // 编辑器当前项目
  editorTheme: 'moovn.editor.theme.v1' // 编辑器主题 black|white
} as const;

/** 退出到 Web 预览时清理（Tauri 下不会调用） */
export function isWebPreview(): boolean {
  return !isTauri();
}
