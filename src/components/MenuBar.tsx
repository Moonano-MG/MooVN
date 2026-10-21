import { useEffect, useRef, useState } from "react";
import {
  Play,
  Save,
  Undo2,
  Redo2,
  FolderOpen,
  FilePlus2,
  Trash2,
  Copy,
  Flag,
  Sparkles,
  Feather,
  Moon,
  Sun,
  Package,
  Bug,
  RotateCcw,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { EditorTheme } from "../types";

interface MenuBarProps {
  editor: Editor;
  theme: EditorTheme;
  debugMode: boolean;
  onToggleDebugMode: () => void;
  onToggleTheme: () => void;
  onSave: () => void;
  onPackageGame: () => void;
  onImport: () => void;
  onNewProject: () => void;
  onLoadTemplate: () => void;
  onPreview: () => void;
  onResetLayout: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action?: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export default function MenuBar(props: MenuBarProps) {
  const { editor, theme, debugMode } = props;
  const { project, selectedNode, selectedEdge } = editor;
  const [open, setOpen] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameDraft(project.name);
  }, [project.name]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== project.name) {
      editor.update((p) => ({ ...p, name: trimmed }), true);
    } else {
      setNameDraft(project.name);
    }
  };

  const deleteSelected = () => {
    if (selectedEdge) editor.connect(selectedEdge, null);
    else if (selectedNode) editor.deleteNode(selectedNode.id);
  };

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: "文件",
      items: [
        { label: "新建空白工程", icon: <FilePlus2 size={14} />, shortcut: "Ctrl+N", action: props.onNewProject },
        { label: "载入《樱花树下的约定》示例", icon: <Sparkles size={14} />, action: props.onLoadTemplate },
        { label: "导入工程 (.json)…", icon: <FolderOpen size={14} />, action: props.onImport },
        { divider: true, label: "" },
        { label: "保存工程", icon: <Save size={14} />, shortcut: "Ctrl+S", action: props.onSave },
        { label: "打包导出独立游戏 (.html)", icon: <Package size={14} />, action: props.onPackageGame },
      ],
    },
    {
      label: "编辑",
      items: [
        { label: "撤销", icon: <Undo2 size={14} />, shortcut: "Ctrl+Z", action: editor.undo, disabled: !editor.canUndo },
        { label: "重做", icon: <Redo2 size={14} />, shortcut: "Ctrl+Y", action: editor.redo, disabled: !editor.canRedo },
        { divider: true, label: "" },
        {
          label: "复制当前选中节点",
          icon: <Copy size={14} />,
          action: () => selectedNode && editor.duplicateNode(selectedNode.id),
          disabled: !selectedNode,
        },
        {
          label: selectedEdge ? "删除所选连线" : "删除当前节点",
          icon: <Trash2 size={14} />,
          shortcut: "Del",
          danger: true,
          action: deleteSelected,
          disabled: !selectedNode && !selectedEdge,
        },
        {
          label: "设为故事起点",
          icon: <Flag size={14} />,
          action: () => selectedNode && editor.setStartNode(selectedNode.id),
          disabled: !selectedNode || selectedNode?.id === project.startNodeId,
        },
      ],
    },
    {
      label: "布局",
      items: [
        { label: "重置所有面板停靠位置与尺寸", icon: <RotateCcw size={14} />, action: props.onResetLayout },
      ],
    },
  ];

  return (
    <header
      ref={barRef}
      className="relative z-30 flex h-10 shrink-0 items-center gap-1.5 border-b border-white/[0.07] bg-[#0e0e12] px-3 select-none"
    >
      {/* Logo 与工程名 */}
      <div className="flex items-center gap-2 pr-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500 text-white">
          <Feather size={14} strokeWidth={2.2} />
        </div>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setNameDraft(project.name);
                setEditingName(false);
              }
            }}
            className="field w-40 rounded border border-white/20 bg-zinc-900 px-2 py-0.5 text-[12.5px] text-zinc-100"
          />
        ) : (
          <button
            onDoubleClick={() => setEditingName(true)}
            title="双击修改工程名称"
            className="max-w-44 truncate text-[13px] font-semibold text-zinc-100 hover:text-sky-400"
          >
            {project.name}
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-white/10" />

      {/* 顶部菜单 */}
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            onMouseEnter={() => open && setOpen(menu.label)}
            className={`rounded-md px-2.5 py-1 text-[12.5px] transition ${
              open === menu.label
                ? "bg-white/[0.09] text-white"
                : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className="animate-pop-in absolute top-full left-0 mt-1 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#17171c] py-1.5 shadow-2xl">
              {menu.items.map((item, i) =>
                item.divider ? (
                  <div key={i} className="mx-3 my-1 h-px bg-white/[0.07]" />
                ) : (
                  <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.action?.();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition ${
                      item.disabled
                        ? "cursor-not-allowed text-zinc-600"
                        : item.danger
                          ? "text-rose-300 hover:bg-rose-500/15"
                          : "text-zinc-200 hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-zinc-400">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && <span className="font-mono text-[10.5px] text-zinc-500">{item.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      <div className="h-4 w-px bg-white/10" />

      {/* 撤销 / 重做 / 保存 */}
      <button
        onClick={editor.undo}
        disabled={!editor.canUndo}
        title="撤销 (Ctrl+Z)"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-30"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={editor.redo}
        disabled={!editor.canRedo}
        title="重做 (Ctrl+Y)"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-30"
      >
        <Redo2 size={14} />
      </button>
      <button
        onClick={props.onSave}
        title="保存 (Ctrl+S)"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
      >
        <Save size={14} />
      </button>

      <div className="flex-1" />

      {/* 深浅主题切换 */}
      <button
        onClick={props.onToggleTheme}
        className="flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11.5px] text-zinc-300 hover:bg-white/[0.09]"
      >
        {theme === "dark" ? <Moon size={12} className="text-sky-400" /> : <Sun size={12} className="text-amber-500" />}
        <span>{theme === "dark" ? "深色" : "浅色"}</span>
      </button>

      {/* 开发者调试开关（正式打包导出时自动剔除） */}
      <button
        onClick={props.onToggleDebugMode}
        title="开启后在编辑器内运行游戏时可查看开发者调试悬浮窗（正式打包导出的游戏不会包含）"
        className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition ${
          debugMode
            ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
            : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
        }`}
      >
        <Bug size={12} />
        <span>调试模式</span>
      </button>

      {/* 唯一打包游戏入口 */}
      <button
        onClick={props.onPackageGame}
        className="flex h-7 items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/15 px-3 text-[12px] font-medium text-sky-200 transition hover:bg-sky-500/25"
      >
        <Package size={13} />
        打包游戏
      </button>

      {/* 唯一运行入口 */}
      <button
        onClick={props.onPreview}
        className="flex h-7 items-center gap-1.5 rounded-md bg-sky-500 px-3 text-[12px] font-semibold text-white shadow-[0_2px_10px_rgba(14,165,233,0.35)] transition hover:bg-sky-400"
      >
        <Play size={12} fill="currentColor" />
        运行游戏
      </button>
    </header>
  );
}
