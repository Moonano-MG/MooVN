import { useState } from "react";
import { Feather, Minus, Square, X, AppWindow, Moon, Sun } from "lucide-react";
import { isTauriRuntime, windowControls } from "../lib/tauriBridge";
import type { EditorTheme } from "../types";

interface TitleBarProps {
  projectName: string;
  dirty: boolean;
  theme: EditorTheme;
  onToggleTheme: () => void;
  onRename: (name: string) => void;
  notify: (msg: string) => void;
}

export default function TitleBar({
  projectName,
  dirty,
  theme,
  onToggleTheme,
  onRename,
  notify,
}: TitleBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const tauri = isTauriRuntime();

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== projectName) onRename(name);
    else setDraft(projectName);
  };

  const handleControl = async (fn: () => Promise<boolean>, label: string) => {
    const ok = await fn();
    if (!ok) notify(`当前为浏览器预览，「${label}」在桌面端可用`);
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#101013] px-3 select-none"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-[0_2px_10px_rgba(14,165,233,0.4)]">
          <Feather size={16} strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-wide text-zinc-100">
            MooVN <span className="font-medium text-zinc-500">Visual Novel Studio</span>
          </div>
        </div>
      </div>

      <div className="mx-1 h-5 w-px bg-white/10" />

      {/* 工程名（双击重命名） */}
      <div className="flex items-center gap-1.5" data-tauri-drag-region="false">
        <span className="text-zinc-500">《</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(projectName);
                setEditing(false);
              }
            }}
            className="field w-44 rounded-md border border-white/15 bg-zinc-900 px-2 py-0.5 text-[13px] text-zinc-100"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setDraft(projectName);
              setEditing(true);
            }}
            title="双击重命名工程"
            className="max-w-56 truncate text-[13px] font-medium text-zinc-200 hover:text-sky-400"
          >
            {projectName}
          </button>
        )}
        <span className="text-zinc-500">》</span>
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="有未保存的更改" />}
      </div>

      <div className="flex-1" data-tauri-drag-region />

      {/* 黑 / 白 主题切换 */}
      <button
        onClick={onToggleTheme}
        data-tauri-drag-region="false"
        className="flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11.5px] text-zinc-300 transition hover:bg-white/[0.09]"
        title="切换深色 / 浅色外观"
      >
        {theme === "dark" ? <Moon size={12} className="text-sky-400" /> : <Sun size={12} className="text-amber-500" />}
        <span>{theme === "dark" ? "深色风格" : "浅色风格"}</span>
      </button>

      <div
        className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] md:flex ${
          tauri
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : "border-white/10 bg-white/[0.04] text-zinc-400"
        }`}
      >
        <AppWindow size={12} />
        {tauri ? "桌面端" : "Web 模式"}
      </div>

      {/* 窗口控制 */}
      <div className="flex items-center gap-1" data-tauri-drag-region="false">
        <button
          onClick={() => void handleControl(windowControls.minimize, "最小化")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100"
          title="最小化"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => void handleControl(windowControls.toggleMaximize, "最大化")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100"
          title="最大化 / 还原"
        >
          <Square size={13} />
        </button>
        <button
          onClick={() => void handleControl(windowControls.close, "关闭窗口")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-rose-500 hover:text-white"
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
