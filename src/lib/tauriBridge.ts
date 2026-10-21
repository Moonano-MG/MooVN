import type { Project } from "../types";

const STORAGE_KEY = "moovn-studio:project:v2";

type TauriGlobal = {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  window?: { getCurrentWindow: () => TauriWindow };
};

interface TauriWindow {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __TAURI__?: TauriGlobal };
  return w.__TAURI__ ?? null;
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

export function runtimeLabel(): string {
  return isTauriRuntime() ? "Tauri 2 运行时" : "Web 预览模式";
}

export function persistLocal(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    /* ignore */
  }
}

export function loadLocal(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Project;
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.characters) || !Array.isArray(data.chapters)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function downloadBlob(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

export async function saveProjectFile(project: Project): Promise<"tauri" | "web"> {
  persistLocal(project);
  const content = JSON.stringify(project, null, 2);
  downloadBlob(`${project.name || "project"}.moovn.json`, content);
  return isTauriRuntime() ? "tauri" : "web";
}

export const exportProjectJson = saveProjectFile;

export async function parseProjectFile(file: File): Promise<Project | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as Project;
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.characters)) return null;
    if (!Array.isArray(data.chapters)) {
      data.chapters = [{ id: "ch-1", title: "第一章", order: 1 }];
      data.nodes.forEach((n) => {
        if (!n.chapterId) n.chapterId = "ch-1";
        if (!Array.isArray(n.stageCharacters)) n.stageCharacters = [];
      });
    }
    return data;
  } catch {
    return null;
  }
}

export async function exportTextFile(filename: string, content: string, mime = "text/yaml"): Promise<void> {
  downloadBlob(filename, content, mime);
}

async function currentWindow(): Promise<TauriWindow | null> {
  const t = tauri();
  if (!t || !isTauriRuntime()) return null;
  try {
    if (t.window?.getCurrentWindow) return t.window.getCurrentWindow();
  } catch {
    return null;
  }
  return null;
}

export const windowControls = {
  async minimize(): Promise<boolean> {
    const w = await currentWindow();
    if (!w) return false;
    await w.minimize();
    return true;
  },
  async toggleMaximize(): Promise<boolean> {
    const w = await currentWindow();
    if (!w) return false;
    await w.toggleMaximize();
    return true;
  },
  async close(): Promise<boolean> {
    const w = await currentWindow();
    if (!w) return false;
    await w.close();
    return true;
  },
};
