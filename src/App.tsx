import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TitleBar from "./components/TitleBar";
import MenuBar, { type ViewTab } from "./components/MenuBar";
import LeftPanel, { type LeftTab } from "./components/LeftPanel";
import NodeCanvas, { getNodeHeight, NODE_WIDTH, type Viewport } from "./components/NodeCanvas";
import SceneStageView from "./components/SceneStageView";
import ScriptView from "./components/ScriptView";
import Inspector from "./components/Inspector";
import StatusBar from "./components/StatusBar";
import PreviewPlayer from "./components/PreviewPlayer";
import { blankProject, useEditor } from "./hooks/useEditor";
import { defaultProject } from "./data/defaultProject";
import { nodeById, nodeToYaml, projectToYaml, validateProject } from "./lib/projectUtils";
import { exportProjectJson, exportTextFile, parseProjectFile } from "./lib/tauriBridge";
import type { EditorTheme } from "./types";
import { Feather, X } from "lucide-react";

export default function App() {
  const editor = useEditor();
  const { project, selectedNode, selectedEdge } = editor;

  const [theme, setTheme] = useState<EditorTheme>("dark");
  const [view, setView] = useState<ViewTab>("graph");
  const [leftTab, setLeftTab] = useState<LeftTab>("outline");
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ x: 50, y: 60, zoom: 0.92 });
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    fromId: string | null;
    startInMenu: boolean;
  }>({ open: false, fromId: null, startInMenu: true });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const issues = useMemo(() => validateProject(project), [project]);

  const handleSave = useCallback(() => {
    editor.markSaved();
    notify("工程已保存");
  }, [editor, notify]);

  const handleExportYaml = useCallback(async () => {
    const yamlContent = projectToYaml(project);
    await exportTextFile(`${project.name}.moovn.yaml`, yamlContent);
    notify("已导出全工程 YAML 文件");
  }, [project, notify]);

  const handleExportSceneYaml = useCallback(async () => {
    const target = selectedNode ?? project.nodes[0];
    if (!target) return;
    const yamlContent = nodeToYaml(project, target);
    await exportTextFile(`${target.id}.yaml`, yamlContent);
    notify(`已导出「${target.title}」场景 YAML`);
  }, [project, selectedNode, notify]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const loaded = await parseProjectFile(file);
    if (!loaded) {
      notify("导入失败：不是有效的 MooVN 工程文件");
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
        x: Math.round(440 - (n.x + NODE_WIDTH / 2) * vp.zoom),
        y: Math.round(280 - (n.y + h / 2) * vp.zoom),
      }));
    },
    [editor, project],
  );

  const fitAll = useCallback(() => {
    if (project.nodes.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of project.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.y + getNodeHeight(n));
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({
      x: Math.round(480 - cx * 0.85),
      y: Math.round(290 - cy * 0.85),
      zoom: 0.85,
    });
  }, [project.nodes]);

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewState.open) return;
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
        setPreviewState({ open: true, fromId: null, startInMenu: true });
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        if (selectedEdge) {
          editor.connect(selectedEdge, null);
          editor.selectEdge(null);
          notify("已断开连线");
        } else if (selectedNode) {
          editor.deleteNode(selectedNode.id);
          notify("场景已删除");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewState.open, handleSave, editor, selectedEdge, selectedNode, notify]);

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100 ${
        theme === "light" ? "theme-light" : ""
      }`}
    >
      <TitleBar
        projectName={project.name}
        dirty={editor.dirty}
        theme={theme}
        onToggleTheme={() => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next);
          notify(`已切换为${next === "dark" ? "深色" : "浅色"}主题`);
        }}
        onRename={(name) => {
          editor.update((p) => ({ ...p, name }), true);
          notify(`工程已重命名为《${name}》`);
        }}
        notify={notify}
      />

      <MenuBar
        editor={editor}
        view={view}
        onViewChange={setView}
        onSave={handleSave}
        onExportYaml={handleExportYaml}
        onExportSceneYaml={handleExportSceneYaml}
        onImport={() => fileInputRef.current?.click()}
        onNewProject={() => {
          editor.replaceProject(blankProject());
          notify("已创建空白工程");
        }}
        onLoadTemplate={() => {
          editor.replaceProject(defaultProject);
          notify("已加载《樱花树下的约定》完整章节模板");
        }}
        onPreview={(fromNodeId, startInMenu = true) =>
          setPreviewState({ open: true, fromId: fromNodeId, startInMenu })
        }
        onFitView={fitAll}
        onToggleLeft={() => setShowLeft((v) => !v)}
        onToggleRight={() => setShowRight((v) => !v)}
        onAbout={() => setAboutOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.moovn.json,application/json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* 主工作区 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showLeft && (
          <LeftPanel
            editor={editor}
            issues={issues}
            activeTab={leftTab}
            onTabChange={setLeftTab}
            onLocateNode={locateNode}
            onPreviewFrom={(id) => setPreviewState({ open: true, fromId: id, startInMenu: false })}
            notify={notify}
          />
        )}

        {view === "graph" && (
          <NodeCanvas
            editor={editor}
            theme={theme}
            viewport={viewport}
            onViewportChange={setViewport}
            onPreviewFrom={(id) => setPreviewState({ open: true, fromId: id, startInMenu: false })}
            notify={notify}
          />
        )}

        {view === "stage" && (
          <SceneStageView
            editor={editor}
            onExportSceneYaml={handleExportSceneYaml}
            onPreviewFrom={(id) => setPreviewState({ open: true, fromId: id, startInMenu: false })}
            notify={notify}
          />
        )}

        {view === "script" && (
          <ScriptView
            editor={editor}
            onSelectNode={(id) => editor.selectNode(id)}
            onPreviewFrom={(id) => setPreviewState({ open: true, fromId: id, startInMenu: false })}
            notify={notify}
          />
        )}

        {showRight && (
          <Inspector
            editor={editor}
            onPreviewFrom={(id) => setPreviewState({ open: true, fromId: id, startInMenu: false })}
            onExportSceneYaml={handleExportSceneYaml}
            notify={notify}
          />
        )}
      </div>

      <StatusBar
        project={project}
        selectedNode={selectedNode}
        issues={issues}
        zoom={viewport.zoom}
        dirty={editor.dirty}
        lastSavedAt={editor.lastSavedAt}
        toast={toast}
        onClickIssues={() => {
          setShowLeft(true);
          setLeftTab("outline");
        }}
      />

      {/* 蓝色模板实机游戏预览 */}
      {previewState.open && (
        <PreviewPlayer
          project={project}
          initialNodeId={previewState.fromId}
          startInMenu={previewState.startInMenu}
          onClose={() => setPreviewState({ open: false, fromId: null, startInMenu: true })}
        />
      )}

      {/* 关于弹窗 */}
      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-pop-in w-full max-w-md rounded-2xl border border-white/10 bg-[#151519] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-lg shadow-sky-500/30">
                  <Feather size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">MooVN Visual Novel Studio</h3>
                  <p className="text-[12px] text-zinc-400">版本 0.1.0 · TypeScript + Tauri 2 + Pixi.js + YAML</p>
                </div>
              </div>
              <button
                onClick={() => setAboutOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-zinc-300">
              面向视觉小说与互动叙事创作者的现代化桌面编辑器。支持节点工作流编排、「章节 &gt; 场景」结构管理、可视化舞台拖拽、YAML 场景配置以及 Lua / Teal / Python / TypeScript 多语言脚本。
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3">
              <button
                onClick={() => {
                  void exportProjectJson(project);
                  notify("已导出工程 JSON 备份");
                }}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] text-zinc-200 hover:bg-white/[0.1]"
              >
                导出工程 JSON
              </button>
              <button
                onClick={() => setAboutOpen(false)}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-sky-400"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
