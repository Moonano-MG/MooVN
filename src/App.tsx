import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuBar from "./components/MenuBar";
import LeftPanel, { type LeftTab } from "./components/LeftPanel";
import NodeCanvas, { getNodeHeight, NODE_WIDTH, type Viewport } from "./components/NodeCanvas";
import SceneStageView from "./components/SceneStageView";
import ScriptView from "./components/ScriptView";
import Inspector from "./components/Inspector";
import StatusBar from "./components/StatusBar";
import PreviewPlayer from "./components/PreviewPlayer";
import AiAssistantPanel from "./components/AiAssistantPanel";
import { blankProject, useEditor } from "./hooks/useEditor";
import { defaultProject } from "./data/defaultProject";
import { nodeById, validateProject } from "./lib/projectUtils";
import { parseProjectFile } from "./lib/tauriBridge";
import { packageStandaloneGame } from "./lib/gamePackager";
import type {
  DockSlot,
  EditorTheme,
  FloatingPanelRect,
  ScriptLang,
  WorkspacePanelId,
} from "./types";
import {
  Network,
  MonitorPlay,
  Code2,
  Sliders,
  Bot,
  Maximize2,
  Minimize2,
  GripHorizontal,
} from "lucide-react";

const PANEL_META: Record<
  WorkspacePanelId,
  { title: string; icon: typeof Network }
> = {
  workflow: { title: "工作流与积木", icon: Network },
  stage: { title: "场景舞台渲染", icon: MonitorPlay },
  code: { title: "TS代码与章节YAML", icon: Code2 },
  inspector: { title: "属性检查器", icon: Sliders },
  ai: { title: "AI 编辑助手", icon: Bot },
};

const DEFAULT_DOCK: Record<WorkspacePanelId, DockSlot> = {
  workflow: "center",
  code: "center",
  stage: "right",
  inspector: "right",
  ai: "right",
};

const DEFAULT_FLOATING_RECTS: Record<WorkspacePanelId, FloatingPanelRect> = {
  workflow: { x: 140, y: 80, width: 760, height: 520 },
  stage: { x: 220, y: 90, width: 720, height: 480 },
  code: { x: 200, y: 100, width: 680, height: 480 },
  inspector: { x: 640, y: 90, width: 380, height: 520 },
  ai: { x: 300, y: 90, width: 560, height: 500 },
};

export default function App() {
  const editor = useEditor();
  const { project, selectedNode, selectedEdge } = editor;

  const [theme, setTheme] = useState<EditorTheme>("dark");
  const [debugMode, setDebugMode] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("outline");

  // VS Code 风格可调节分栏宽度与面板停靠状态
  const [leftWidth, setLeftWidth] = useState(268);
  const [rightWidth, setRightWidth] = useState(460);
  const [panelDock, setPanelDock] = useState<Record<WorkspacePanelId, DockSlot>>(DEFAULT_DOCK);
  const [activeCenterTab, setActiveCenterTab] = useState<WorkspacePanelId>("workflow");
  const [activeRightTab, setActiveRightTab] = useState<WorkspacePanelId>("stage");
  const [floatingRects, setFloatingRects] =
    useState<Record<WorkspacePanelId, FloatingPanelRect>>(DEFAULT_FLOATING_RECTS);
  const [dragOverZone, setDragOverZone] = useState<"center" | "right" | null>(null);

  // 代码/章节YAML与AI规范联动状态
  const [activeChapterYamlId, setActiveChapterYamlId] = useState<string | null>(null);
  const [forcedScriptLang, setForcedScriptLang] = useState<ScriptLang | null>(null);
  const [openAiSpecFlag, setOpenAiSpecFlag] = useState(false);

  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 50, zoom: 0.88 });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const issues = useMemo(() => validateProject(project), [project]);

  const centerPanels = useMemo(
    () => (Object.keys(panelDock) as WorkspacePanelId[]).filter((id) => panelDock[id] === "center"),
    [panelDock],
  );
  const rightPanels = useMemo(
    () => (Object.keys(panelDock) as WorkspacePanelId[]).filter((id) => panelDock[id] === "right"),
    [panelDock],
  );
  const floatingPanels = useMemo(
    () => (Object.keys(panelDock) as WorkspacePanelId[]).filter((id) => panelDock[id] === "floating"),
    [panelDock],
  );

  useEffect(() => {
    if (!centerPanels.includes(activeCenterTab) && centerPanels[0]) {
      setActiveCenterTab(centerPanels[0]);
    }
  }, [centerPanels, activeCenterTab]);

  useEffect(() => {
    if (!rightPanels.includes(activeRightTab) && rightPanels[0]) {
      setActiveRightTab(rightPanels[0]);
    }
  }, [rightPanels, activeRightTab]);

  const focusPanel = useCallback(
    (id: WorkspacePanelId) => {
      const slot = panelDock[id];
      if (slot === "center") setActiveCenterTab(id);
      else if (slot === "right") setActiveRightTab(id);
    },
    [panelDock],
  );

  const movePanelToSlot = (id: WorkspacePanelId, targetSlot: DockSlot) => {
    setPanelDock((prev) => ({ ...prev, [id]: targetSlot }));
    if (targetSlot === "center") setActiveCenterTab(id);
    if (targetSlot === "right") setActiveRightTab(id);
  };

  const resetLayout = () => {
    setLeftWidth(268);
    setRightWidth(460);
    setPanelDock(DEFAULT_DOCK);
    setActiveCenterTab("workflow");
    setActiveRightTab("stage");
    setFloatingRects(DEFAULT_FLOATING_RECTS);
    notify("已重置 VS Code 分栏与停靠布局");
  };

  // 左右分隔条拖拽调整宽度
  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const orig = leftWidth;
    const onMove = (ev: MouseEvent) => {
      setLeftWidth(Math.max(200, Math.min(460, orig + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const orig = rightWidth;
    const onMove = (ev: MouseEvent) => {
      setRightWidth(Math.max(280, Math.min(760, orig - (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 浮动窗口拖拽位置与拖拽缩放大小
  const startDragFloating = (e: React.MouseEvent, id: WorkspacePanelId) => {
    e.stopPropagation();
    const rect = floatingRects[id];
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      setFloatingRects((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          x: Math.max(10, Math.min(window.innerWidth - 180, rect.x + (ev.clientX - startX))),
          y: Math.max(42, Math.min(window.innerHeight - 100, rect.y + (ev.clientY - startY))),
        },
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResizeFloating = (e: React.MouseEvent, id: WorkspacePanelId) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = floatingRects[id];
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      setFloatingRects((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          width: Math.max(320, Math.min(1100, rect.width + (ev.clientX - startX))),
          height: Math.max(240, Math.min(820, rect.height + (ev.clientY - startY))),
        },
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSave = useCallback(() => {
    editor.markSaved();
    notify("工程已保存");
  }, [editor, notify]);

  const handlePackageGame = useCallback(async () => {
    await packageStandaloneGame(project);
    notify(`已打包导出独立游戏《${project.name}-Game-Release.html》`);
  }, [project, notify]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const loaded = await parseProjectFile(file);
    if (!loaded) {
      notify("导入失败：无效的工程文件");
      return;
    }
    editor.replaceProject(loaded);
    notify(`已载入《${loaded.name}》`);
  };

  const locateNode = useCallback(
    (id: string) => {
      editor.selectNode(id);
      const n = nodeById(project, id);
      if (!n) return;
      const h = getNodeHeight(n);
      setViewport((vp) => ({
        ...vp,
        x: Math.round(320 - (n.x + NODE_WIDTH / 2) * vp.zoom),
        y: Math.round(220 - (n.y + h / 2) * vp.zoom),
      }));
    },
    [editor, project],
  );

  // 渲染指定面板内容
  const renderPanelContent = (id: WorkspacePanelId) => {
    switch (id) {
      case "workflow":
        return (
          <NodeCanvas
            editor={editor}
            theme={theme}
            viewport={viewport}
            onViewportChange={setViewport}
            notify={notify}
          />
        );
      case "stage":
        return <SceneStageView editor={editor} notify={notify} />;
      case "code":
        return (
          <ScriptView
            editor={editor}
            activeChapterId={activeChapterYamlId}
            forcedLang={forcedScriptLang}
            notify={notify}
          />
        );
      case "inspector":
        return <Inspector editor={editor} notify={notify} />;
      case "ai":
        return (
          <AiAssistantPanel
            editor={editor}
            openSpecInitially={openAiSpecFlag}
            notify={notify}
          />
        );
    }
  };

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewOpen) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        editor.redo();
      } else if (e.key === "F5") {
        e.preventDefault();
        setPreviewOpen(true);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        if (selectedEdge) {
          editor.connect(selectedEdge, null);
          editor.selectEdge(null);
        } else if (selectedNode) {
          editor.deleteNode(selectedNode.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, handleSave, editor, selectedEdge, selectedNode]);

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100 ${
        theme === "light" ? "theme-light" : ""
      }`}
    >
      {/* 顶部栏（无模拟 Windows 标题栏、无重复按钮） */}
      <MenuBar
        editor={editor}
        theme={theme}
        debugMode={debugMode}
        onToggleDebugMode={() => {
          setDebugMode((v) => !v);
          notify(!debugMode ? "已开启开发者调试悬浮窗" : "已关闭开发者调试悬浮窗");
        }}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onSave={handleSave}
        onPackageGame={handlePackageGame}
        onImport={() => fileInputRef.current?.click()}
        onNewProject={() => {
          editor.replaceProject(blankProject());
          notify("已创建空白工程");
        }}
        onLoadTemplate={() => {
          editor.replaceProject(defaultProject);
          notify("已加载《樱花树下的约定》");
        }}
        onPreview={() => setPreviewOpen(true)}
        onResetLayout={resetLayout}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.moovn.json,application/json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* VS Code 风格可拖拽分栏与停靠工作区 */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 1. 左侧文件总管 / 角色 / 资源栏 */}
        <div style={{ width: leftWidth }} className="shrink-0 overflow-hidden">
          <LeftPanel
            editor={editor}
            issues={issues}
            activeTab={leftTab}
            onTabChange={setLeftTab}
            onLocateNode={(id) => {
              locateNode(id);
              focusPanel("workflow");
            }}
            onOpenChapterYaml={(chapId) => {
              setActiveChapterYamlId(chapId);
              focusPanel("code");
            }}
            onOpenScriptLang={(lang) => {
              setForcedScriptLang(lang);
              focusPanel("code");
            }}
            onOpenAiSpec={() => {
              setOpenAiSpecFlag((v) => !v);
              focusPanel("ai");
            }}
            notify={notify}
          />
        </div>

        {/* 左侧可拖拽分隔条 (Sash) */}
        <div
          onMouseDown={startResizeLeft}
          title="拖拽调整左侧边栏宽度"
          className="w-1 shrink-0 cursor-col-resize bg-white/[0.06] transition hover:bg-sky-500"
        />

        {/* 2. 中央停靠分栏 (Center Dock) */}
        {centerPanels.length > 0 && (
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/moovn-panel-id")) {
                e.preventDefault();
                setDragOverZone("center");
              }
            }}
            onDragLeave={() => setDragOverZone(null)}
            onDrop={(e) => {
              setDragOverZone(null);
              const pid = e.dataTransfer.getData("text/moovn-panel-id") as WorkspacePanelId;
              if (pid) movePanelToSlot(pid, "center");
            }}
            className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
              dragOverZone === "center" ? "ring-2 ring-sky-400/60 ring-inset" : ""
            }`}
          >
            {/* VS Code 风格可拖拽标签栏 */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#111116] px-2 select-none">
              <div className="flex items-center gap-1 overflow-x-auto">
                {centerPanels.map((pid) => {
                  const meta = PANEL_META[pid];
                  const Icon = meta.icon;
                  const active = activeCenterTab === pid;
                  return (
                    <div
                      key={pid}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/moovn-panel-id", pid);
                      }}
                      onClick={() => setActiveCenterTab(pid)}
                      title="可拖拽此标签到右侧分栏，或点击右侧图标弹出为自由浮动窗口"
                      className={`group flex h-7 cursor-grab items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition active:cursor-grabbing ${
                        active
                          ? "bg-sky-500/20 text-sky-300 border border-sky-400/35"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{meta.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          movePanelToSlot(pid, "floating");
                        }}
                        title="弹出为可自由拖动与缩放的浮动窗口"
                        className="ml-1 rounded p-0.5 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                      >
                        <Maximize2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {renderPanelContent(activeCenterTab)}
            </div>
          </div>
        )}

        {/* 中右可拖拽分隔条 (Sash) */}
        {rightPanels.length > 0 && (
          <div
            onMouseDown={startResizeRight}
            title="拖拽调整右侧分栏宽度"
            className="w-1 shrink-0 cursor-col-resize bg-white/[0.06] transition hover:bg-sky-500"
          />
        )}

        {/* 3. 右侧停靠分栏 (Right Split Dock — 默认停靠场景渲染舞台、属性检查器、AI 助手) */}
        {rightPanels.length > 0 && (
          <div
            style={{ width: centerPanels.length > 0 ? rightWidth : undefined }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/moovn-panel-id")) {
                e.preventDefault();
                setDragOverZone("right");
              }
            }}
            onDragLeave={() => setDragOverZone(null)}
            onDrop={(e) => {
              setDragOverZone(null);
              const pid = e.dataTransfer.getData("text/moovn-panel-id") as WorkspacePanelId;
              if (pid) movePanelToSlot(pid, "right");
            }}
            className={`flex shrink-0 flex-col overflow-hidden ${
              centerPanels.length === 0 ? "flex-1" : ""
            } ${dragOverZone === "right" ? "ring-2 ring-sky-400/60 ring-inset" : ""}`}
          >
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#111116] px-2 select-none">
              <div className="flex items-center gap-1 overflow-x-auto">
                {rightPanels.map((pid) => {
                  const meta = PANEL_META[pid];
                  const Icon = meta.icon;
                  const active = activeRightTab === pid;
                  return (
                    <div
                      key={pid}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/moovn-panel-id", pid);
                      }}
                      onClick={() => setActiveRightTab(pid)}
                      title="可拖拽此标签到左侧主分栏，或弹出为自由浮动窗口"
                      className={`group flex h-7 cursor-grab items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition active:cursor-grabbing ${
                        active
                          ? "bg-sky-500/20 text-sky-300 border border-sky-400/35"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{meta.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          movePanelToSlot(pid, "floating");
                        }}
                        title="弹出为可自由拖动与缩放的浮动窗口"
                        className="ml-1 rounded p-0.5 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                      >
                        <Maximize2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {renderPanelContent(activeRightTab)}
            </div>
          </div>
        )}

        {/* 4. 自由浮动与可缩放窗口层（如渲染舞台、AI 助手等可随意拖到任意位置与更改尺寸） */}
        {floatingPanels.map((pid) => {
          const meta = PANEL_META[pid];
          const Icon = meta.icon;
          const rect = floatingRects[pid];
          return (
            <div
              key={pid}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }}
              className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-sky-400/40 bg-[#121217] shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
            >
              {/* 浮动窗口可拖拽标题栏 */}
              <div
                onMouseDown={(e) => startDragFloating(e, pid)}
                className="flex h-9 shrink-0 cursor-move items-center justify-between border-b border-white/10 bg-[#181820] px-3 select-none"
              >
                <div className="flex items-center gap-2 text-[12px] font-semibold text-sky-200">
                  <GripHorizontal size={13} className="text-zinc-500" />
                  <Icon size={13} />
                  <span>{meta.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => movePanelToSlot(pid, "center")}
                    className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
                  >
                    停靠中央
                  </button>
                  <button
                    onClick={() => movePanelToSlot(pid, "right")}
                    title="停靠回右侧分栏"
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
                  >
                    <Minimize2 size={11} /> 停靠右侧
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">{renderPanelContent(pid)}</div>

              {/* 右下角自由缩放手柄 */}
              <div
                onMouseDown={(e) => startResizeFloating(e, pid)}
                title="拖拽调整窗口大小"
                className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize bg-gradient-to-tl from-sky-400/60 to-transparent"
              />
            </div>
          );
        })}
      </div>

      <StatusBar
        project={project}
        selectedNode={selectedNode}
        issues={issues}
        zoom={viewport.zoom}
        dirty={editor.dirty}
        lastSavedAt={editor.lastSavedAt}
        toast={toast}
        onClickIssues={() => setLeftTab("outline")}
      />

      {/* 蓝色模板实机游戏预览 */}
      {previewOpen && (
        <PreviewPlayer
          project={project}
          initialNodeId={null}
          startInMenu={true}
          debugMode={debugMode}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
