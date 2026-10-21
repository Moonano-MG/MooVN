import { useEffect, useRef, useState } from "react";
import {
  Play,
  Save,
  Undo2,
  Redo2,
  FileJson,
  FileCode2,
  FolderOpen,
  FilePlus2,
  Network,
  ScrollText,
  Maximize,
  PanelLeft,
  PanelRight,
  CircleHelp,
  Trash2,
  Copy,
  Flag,
  Check,
  MonitorPlay,
  Sparkles,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";

export type ViewTab = "graph" | "stage" | "script";

interface MenuBarProps {
  editor: Editor;
  view: ViewTab;
  onViewChange: (v: ViewTab) => void;
  onSave: () => void;
  onExportYaml: () => void;
  onExportSceneYaml: () => void;
  onImport: () => void;
  onNewProject: () => void;
  onLoadTemplate: () => void;
  onPreview: (fromNodeId: string | null, startInMenu?: boolean) => void;
  onFitView: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onAbout: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export default function MenuBar(props: MenuBarProps) {
  const { editor, view, onViewChange } = props;
  const { project, selectedNode, selectedEdge } = editor;
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const deleteSelected = () => {
    if (selectedEdge) editor.connect(selectedEdge, null);
    else if (selectedNode) editor.deleteNode(selectedNode.id);
  };

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: "文件",
      items: [
        { label: "新建空白工程", icon: <FilePlus2 size={14} />, shortcut: "Ctrl+N", action: props.onNewProject },
        { label: "加载《樱花树下的约定》模板", icon: <Sparkles size={14} />, action: props.onLoadTemplate },
        { label: "导入工程文件…", icon: <FolderOpen size={14} />, action: props.onImport },
        { divider: true, label: "" },
        { label: "保存工程", icon: <Save size={14} />, shortcut: "Ctrl+S", action: props.onSave },
        { label: "导出当前场景 YAML", icon: <FileCode2 size={14} />, action: props.onExportSceneYaml },
        { label: "导出全工程 YAML", icon: <FileJson size={14} />, action: props.onExportYaml },
      ],
    },
    {
      label: "编辑",
      items: [
        { label: "撤销", icon: <Undo2 size={14} />, shortcut: "Ctrl+Z", action: editor.undo, disabled: !editor.canUndo },
        { label: "重做", icon: <Redo2 size={14} />, shortcut: "Ctrl+Y", action: editor.redo, disabled: !editor.canRedo },
        { divider: true, label: "" },
        {
          label: "复制当前场景",
          icon: <Copy size={14} />,
          action: () => selectedNode && editor.duplicateNode(selectedNode.id),
          disabled: !selectedNode,
        },
        {
          label: selectedEdge ? "删除所选连线" : "删除当前场景",
          icon: <Trash2 size={14} />,
          shortcut: "Del",
          danger: true,
          action: deleteSelected,
          disabled: !selectedNode && !selectedEdge,
        },
        {
          label: "将当前场景设为故事起点",
          icon: <Flag size={14} />,
          action: () => selectedNode && editor.setStartNode(selectedNode.id),
          disabled: !selectedNode || selectedNode?.id === project.startNodeId,
        },
      ],
    },
    {
      label: "视图",
      items: [
        { label: "工作流画布", icon: <Network size={14} />, checked: view === "graph", action: () => onViewChange("graph") },
        { label: "可视化场景舞台", icon: <MonitorPlay size={14} />, checked: view === "stage", action: () => onViewChange("stage") },
        { label: "脚本与配置 (YAML / Lua / Teal / Py / TS)", icon: <ScrollText size={14} />, checked: view === "script", action: () => onViewChange("script") },
        { divider: true, label: "" },
        { label: "适应画布", icon: <Maximize size={14} />, action: props.onFitView, disabled: view !== "graph" },
        { label: "切换左侧面板", icon: <PanelLeft size={14} />, action: props.onToggleLeft },
        { label: "切换右侧检查器", icon: <PanelRight size={14} />, action: props.onToggleRight },
      ],
    },
    {
      label: "运行",
      items: [
        { label: "启动完整游戏（含主菜单）", icon: <Play size={14} />, shortcut: "F5", action: () => props.onPreview(null, true) },
        {
          label: "从当前选中场景直接试玩",
          icon: <Play size={14} />,
          action: () => selectedNode && props.onPreview(selectedNode.id, false),
          disabled: !selectedNode,
        },
      ],
    },
    {
      label: "帮助",
      items: [
        { label: "关于 MooVN Studio", icon: <CircleHelp size={14} />, action: props.onAbout },
      ],
    },
  ];

  return (
    <div
      ref={barRef}
      className="relative z-30 flex h-11 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#0d0d10] px-2 select-none"
    >
      {/* 顶部下拉菜单 */}
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            onMouseEnter={() => open && setOpen(menu.label)}
            className={`rounded-md px-3 py-1.5 text-[13px] transition ${
              open === menu.label
                ? "bg-white/[0.08] text-white"
                : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className="animate-pop-in absolute top-full left-0 mt-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#17171b] py-1.5 shadow-2xl shadow-black/60">
              {menu.items.map((item, i) =>
                item.divider ? (
                  <div key={i} className="mx-3 my-1.5 h-px bg-white/[0.07]" />
                ) : (
                  <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.action?.();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition ${
                      item.disabled
                        ? "cursor-not-allowed text-zinc-600"
                        : item.danger
                          ? "text-rose-300 hover:bg-rose-500/15"
                          : "text-zinc-200 hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-zinc-400">
                      {item.checked ? <Check size={13} className="text-sky-400" /> : item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && <span className="font-mono text-[11px] text-zinc-500">{item.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      <div className="mx-1.5 h-4 w-px bg-white/10" />

      {/* 快捷撤销 / 重做 / 保存 */}
      <button
        onClick={editor.undo}
        disabled={!editor.canUndo}
        title="撤销 (Ctrl+Z)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-30"
      >
        <Undo2 size={15} />
      </button>
      <button
        onClick={editor.redo}
        disabled={!editor.canRedo}
        title="重做 (Ctrl+Y)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-30"
      >
        <Redo2 size={15} />
      </button>
      <button
        onClick={props.onSave}
        title="保存工程 (Ctrl+S)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      >
        <Save size={15} />
      </button>

      <div className="flex-1" />

      {/* 中央清爽三视图切换器：工作流 / 场景舞台 / 脚本与配置 */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
        <button
          onClick={() => onViewChange("graph")}
          className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition ${
            view === "graph" ? "bg-sky-500 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Network size={13} />
          工作流
        </button>
        <button
          onClick={() => onViewChange("stage")}
          className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition ${
            view === "stage" ? "bg-sky-500 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <MonitorPlay size={13} />
          场景舞台
        </button>
        <button
          onClick={() => onViewChange("script")}
          className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition ${
            view === "script" ? "bg-sky-500 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <ScrollText size={13} />
          脚本与YAML
        </button>
      </div>

      <div className="flex-1" />

      {/* 右侧运行按钮 */}
      <div className="flex items-center gap-1.5">
        {selectedNode && (
          <button
            onClick={() => props.onPreview(selectedNode.id, false)}
            className="hidden h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[12.5px] text-zinc-200 transition hover:bg-white/[0.09] sm:flex"
            title="从当前选中的场景直接进入画面试玩"
          >
            <Play size={12} />
            当前场景试玩
          </button>
        )}
        <button
          onClick={() => props.onPreview(null, true)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12.5px] font-medium text-white shadow-[0_2px_12px_rgba(14,165,233,0.35)] transition hover:bg-sky-400"
          title="运行完整游戏 (F5)"
        >
          <Play size={13} fill="currentColor" />
          运行游戏
        </button>
      </div>
    </div>
  );
}
