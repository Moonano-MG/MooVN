import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ExternalLink,
  Minimize2,
  SplitSquareVertical,
  SplitSquareHorizontal,
  GripHorizontal,
  FolderTree,
  Blocks,
  Workflow,
  MonitorPlay,
  Sliders,
  Code2,
  Terminal,
  Bot,
  Scissors,
  Palette,
  Settings,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CircleDot,
} from 'lucide-react';
import { useEditor } from './hooks/useEditor';
import { newId } from './lib/ids';
import {
  DockDirection,
  MenuBar,
  RailPosition,
  WindowPanelDescriptor,
} from './components/MenuBar';
import { LeftPanel } from './components/LeftPanel';
import { NodeCanvas } from './components/NodeCanvas';
import { SceneStageView } from './components/SceneStageView';
import { GameUICustomizer } from './components/GameUICustomizer';
import { ScriptView } from './components/ScriptView';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { PreviewPlayer } from './components/PreviewPlayer';
import { ExportModal } from './components/ExportModal';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { ProjectLauncher } from './components/ProjectLauncher';
import { TerminalPanel } from './components/TerminalPanel';
import { AssetStudioPanel } from './components/AssetStudioPanel';
import { SettingsModal } from './components/SettingsModal';
import { OfficialPortal } from './components/OfficialPortal';
import { PanelId } from './types';
import { loadSystemSettings, saveProjectToWorkspace } from './lib/workspaceManager';
import { useUILanguage } from './lib/i18n';
import { clampSplitRatio } from './lib/vnRuntimeCore';
import {
  clampAllFloatingWindows,
  clampFloatingRect,
  getResponsiveLayoutMode,
  normalizeWindowZIndices,
  type ResponsiveLayoutBreakpoint,
} from './lib/windowManager';
import {
  getFeatureFlags,
  setFeatureFlag,
  Z_INDEX_TOKENS,
} from './lib/featureFlags';
import type { VNProject, WorkflowNodeType } from './types';

const PANEL_TITLES: Record<PanelId, string> = {
  explorer: '工程资源与章节',
  node_library: '节点与积木库',
  canvas: '可视化节点画布',
  stage: '场景舞台',
  ui_customizer: '界面定制',
  ts_code: '多语言脚本 (TS/JS/C#/C++/Rust)',
  yaml_code: 'YAML 剧本',
  inspector: '属性与积木检查器',
  characters: '角色好感表',
  ai_agent: 'AI 助手',
  terminal: '终端与编译诊断',
  asset_studio: '抠图与分层立绘工坊',
  settings: '系统设置',
};

const ALL_WINDOW_IDS: PanelId[] = [
  'explorer',
  'node_library',
  'canvas',
  'stage',
  'inspector',
  'ts_code',
  'yaml_code',
  'terminal',
  'ai_agent',
  'asset_studio',
  'ui_customizer',
];

const ACTIVITY_RAIL_ITEMS: {
  id: PanelId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'explorer',
    label: '工程资源与章节',
    shortLabel: '章节目录',
    icon: <FolderTree className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'node_library',
    label: '彩色分类节点与积木库',
    shortLabel: '节点库',
    icon: <Blocks className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'canvas',
    label: '可视化节点画布',
    shortLabel: '剧情编排',
    icon: <Workflow className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'stage',
    label: '场景舞台演播',
    shortLabel: '场景舞台',
    icon: <MonitorPlay className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'inspector',
    label: '节点专属属性与积木检查器',
    shortLabel: '属性编辑',
    icon: <Sliders className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ts_code',
    label: '多语言脚本编译器',
    shortLabel: '多语言脚本',
    icon: <Code2 className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'terminal',
    label: '终端与编译诊断',
    shortLabel: '终端诊断',
    icon: <Terminal className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ai_agent',
    label: 'AI 助手窗口',
    shortLabel: 'AI 助手',
    icon: <Bot className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'asset_studio',
    label: '智能抠图与 AI 生图',
    shortLabel: '素材工坊',
    icon: <Scissors className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ui_customizer',
    label: '游戏界面定制',
    shortLabel: '界面定制',
    icon: <Palette className="w-4 h-4" strokeWidth={1.7} />,
  },
];

export interface FloatingWindowState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

type DropZonePosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

// ============================================================================
// True VS Code Recursive 2D Split Tree (`EditorSplitNode = Leaf | Branch`)
// Supports arbitrary 2D layouts: [A | C] over [B | D], [A | C] over [B], etc.
// ============================================================================
export interface EditorGroupLeaf {
  kind: 'leaf';
  id: string;
  tabs: PanelId[];
  activeTab: PanelId;
}

export interface EditorSplitBranch {
  kind: 'branch';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number; // 0.15 .. 0.85
  first: EditorSplitNode;
  second: EditorSplitNode;
}

export type EditorSplitNode = EditorGroupLeaf | EditorSplitBranch;

const createDefaultSplitTree = (): EditorSplitNode => ({
  kind: 'branch',
  id: 'root-h-1',
  direction: 'horizontal',
  ratio: 0.2,
  first: {
    kind: 'leaf',
    id: 'leaf-left',
    tabs: ['node_library', 'explorer'],
    activeTab: 'node_library',
  },
  second: {
    kind: 'branch',
    id: 'root-h-2',
    direction: 'horizontal',
    ratio: 0.65,
    first: {
      kind: 'leaf',
      id: 'leaf-center-top',
      tabs: ['canvas', 'stage', 'ts_code', 'yaml_code', 'terminal'],
      activeTab: 'canvas',
    },
    second: {
      kind: 'leaf',
      id: 'leaf-right',
      tabs: ['inspector', 'ai_agent', 'ui_customizer'],
      activeTab: 'inspector',
    },
  },
});

function collectLeaves(node: EditorSplitNode | null): EditorGroupLeaf[] {
  if (!node) return [];
  if (node.kind === 'leaf') return [node];
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

function removePanelFromSplitTree(
  node: EditorSplitNode | null,
  panelId: PanelId
): EditorSplitNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') {
    if (!node.tabs.includes(panelId)) return node;
    const remaining = node.tabs.filter((t) => t !== panelId);
    if (remaining.length === 0) return null;
    return {
      ...node,
      tabs: remaining,
      activeTab: node.activeTab === panelId ? remaining[0] : node.activeTab,
    };
  }
  const nextFirst = removePanelFromSplitTree(node.first, panelId);
  const nextSecond = removePanelFromSplitTree(node.second, panelId);
  if (!nextFirst && !nextSecond) return null;
  if (!nextFirst) return nextSecond;
  if (!nextSecond) return nextFirst;
  return {
    ...node,
    first: nextFirst,
    second: nextSecond,
  };
}

function updateLeafInTree(
  node: EditorSplitNode | null,
  leafId: string,
  updater: (leaf: EditorGroupLeaf) => EditorSplitNode | null
): EditorSplitNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') {
    if (node.id === leafId) return updater(node);
    return node;
  }
  const nextFirst = updateLeafInTree(node.first, leafId, updater);
  const nextSecond = updateLeafInTree(node.second, leafId, updater);
  if (!nextFirst && !nextSecond) return null;
  if (!nextFirst) return nextSecond;
  if (!nextSecond) return nextFirst;
  return {
    ...node,
    first: nextFirst,
    second: nextSecond,
  };
}

function updateBranchRatioInTree(
  node: EditorSplitNode | null,
  branchId: string,
  ratio: number
): EditorSplitNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') return node;
  if (node.id === branchId) {
    return { ...node, ratio: clampSplitRatio(ratio, 0.18, 0.82) };
  }
  return {
    ...node,
    first: updateBranchRatioInTree(node.first, branchId, ratio) || node.first,
    second: updateBranchRatioInTree(node.second, branchId, ratio) || node.second,
  };
}

function dockPanelIntoTree(
  root: EditorSplitNode | null,
  panelId: PanelId,
  targetLeafId: string,
  zone: DropZonePosition
): EditorSplitNode {
  const cleaned = removePanelFromSplitTree(root, panelId);
  const leaves = collectLeaves(cleaned);
  if (!cleaned || leaves.length === 0) {
    return {
      kind: 'leaf',
      id: newId('leaf'),
      tabs: [panelId],
      activeTab: panelId,
    };
  }

  const effectiveLeafId = leaves.some((l) => l.id === targetLeafId)
    ? targetLeafId
    : leaves[0].id;

  const updated = updateLeafInTree(cleaned, effectiveLeafId, (leaf) => {
    if (zone === 'center') {
      const nextTabs = leaf.tabs.includes(panelId)
        ? leaf.tabs
        : [...leaf.tabs, panelId];
      return {
        ...leaf,
        tabs: nextTabs,
        activeTab: panelId,
      };
    }

    const newLeaf: EditorGroupLeaf = {
      kind: 'leaf',
      id: newId('leaf'),
      tabs: [panelId],
      activeTab: panelId,
    };

    const direction: 'horizontal' | 'vertical' =
      zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical';
    const isFirst = zone === 'left' || zone === 'top';

    return {
      kind: 'branch',
      id: newId('branch'),
      direction,
      ratio: 0.5,
      first: isFirst ? newLeaf : leaf,
      second: isFirst ? leaf : newLeaf,
    };
  });

  return (
    updated || {
      kind: 'leaf',
      id: newId('leaf'),
      tabs: [panelId],
      activeTab: panelId,
    }
  );
}

export function App({
  initialMode,
}: {
  initialMode?: 'portal' | 'studio';
} = {}) {
  const {
    project,
    setProject,
    adoptSavedProject,
    replaceProject,
    selectedNodeId,
    selectedNode,
    selectedChapterId,
    selectedDialogueIndex,
    selectedCharacterPlacementId,
    canUndo,
    canRedo,
    selectNode: setSelectedNodeId,
    setSelectedChapterId,
    setSelectedDialogueIndex,
    setSelectedCharacterPlacementId,
    undo,
    redo,
    updateUIConfig,
    updateNode,
    addNode,
    deleteNode,
    addDialogueLine,
    updateDialogueLine,
    deleteDialogueLine,
    addChoiceOption: addChoice,
    updateChoiceOption: updateChoice,
    deleteChoiceOption: deleteChoice,
    addCharacterToStage: addCharacterToNode,
    updateCharacterPlacement,
    removeCharacterPlacement: removeCharacterFromNode,
    updateCharacterProfile,
    addCharacterProfile,
    addChapter,
    updateChapter,
    addVisualBlock,
    updateVisualBlock,
    removeVisualBlock,
    storageWarning,
  } = useEditor();

  // Dark / Light 2 UI Themes (`开发方案 2: 界面风格有黑和白2种风格`)
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');

  // 网站分 2 部分：
  // 1) 'portal' (默认进入 Vercel 时的引导与 GitHub Release 客户端下载站 + GitHub Issues 客服中心)
  // 2) 'studio' (网页版 MooVN Studio 完整 IDE 工作台)
  const [siteSection, setSiteSection] = useState<'portal' | 'studio'>(() => {
    if (initialMode) return initialMode;
    if (typeof window !== 'undefined') {
      const isTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
      const params = new URLSearchParams(window.location.search);
      if (
        isTauri ||
        window.location.pathname.includes('studio') ||
        params.get('mode') === 'studio' ||
        window.location.hash === '#studio'
      ) {
        return 'studio';
      }
    }
    return 'portal';
  });

  // 响应式三档断点 (`>=1100` 三栏 / `768~1099` 双栏 / `<768` 单栏, `GPT-26 / CL-26`, Section 8)
  const checkIsPhone = () => {
    if (typeof window === 'undefined') return false;
    return getResponsiveLayoutMode(window.innerWidth) === 'single-column';
  };

  const { tPanel } = useUILanguage();
  const [isMobile, setIsMobile] = useState<boolean>(checkIsPhone);
  const [responsiveBreakpoint, setResponsiveBreakpoint] = useState<ResponsiveLayoutBreakpoint>(() =>
    typeof window !== 'undefined' ? getResponsiveLayoutMode(window.innerWidth) : 'three-column'
  );
  const [featureFlags, setFeatureFlagsState] = useState(() => getFeatureFlags());
  const [isWindowOverviewOpen, setIsWindowOverviewOpen] = useState(false);
  const [isLauncherOpen, setIsLauncherOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [motionLevel, setMotionLevel] = useState(() => loadSystemSettings().defaultGameSettings.motionLevel || 'subtle');
  const lastSavedProjectRef = useRef<VNProject | null>(null);
  const currentProjectRef = useRef(project);
  currentProjectRef.current = project;
  const projectSessionRef = useRef(0);
  const hasOpenProjectRef = useRef(false);
  const requireManualSaveRef = useRef(false);
  const savedPathRef = useRef<string | undefined>(undefined);
  const savingRef = useRef(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'file' | 'browser'>('idle');
  const [saveError, setSaveError] = useState<{ code: string; error: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveWasAutomatic, setLastSaveWasAutomatic] = useState(false);
  // Immutable project identity is the saved revision; no full-project serialization on render.
  const isDirty = project !== lastSavedProjectRef.current;
  const [mobileActivePanel, setMobileActivePanel] = useState<PanelId>('canvas');
  const [mobilePinStage, setMobilePinStage] = useState<boolean>(false);

  // Customizable Window Options Bar Position ('left' | 'right' | 'top' | 'bottom') & Order
  const [railPosition, setRailPosition] = useState<RailPosition>(() => {
    try {
      const saved = localStorage.getItem('moovn_rail_pos_v1') as RailPosition | null;
      if (saved === 'left' || saved === 'right' || saved === 'top' || saved === 'bottom') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'left';
  });

  const [windowOrder, setWindowOrder] = useState<PanelId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('moovn_window_order_v1') || 'null');
      if (Array.isArray(saved) && saved.length > 0) {
        const merged = [...saved.filter((x) => ALL_WINDOW_IDS.includes(x))];
        ALL_WINDOW_IDS.forEach((id) => {
          if (!merged.includes(id)) merged.push(id);
        });
        return merged;
      }
    } catch {
      // ignore
    }
    return ALL_WINDOW_IDS;
  });

  const [draggingRailItemId, setDraggingRailItemId] = useState<PanelId | null>(null);

  const handleChangeRailPosition = (pos: RailPosition) => {
    setRailPosition(pos);
    try {
      localStorage.setItem('moovn_rail_pos_v1', pos);
    } catch {
      // ignore
    }
  };

  const handleMoveWindowOrder = (id: PanelId, dir: 'up' | 'down') => {
    setWindowOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      try {
        localStorage.setItem('moovn_window_order_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleReorderRailItems = (fromId: PanelId, toId: PanelId) => {
    if (fromId === toId) return;
    setWindowOrder((prev) => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx = prev.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      try {
        localStorage.setItem('moovn_window_order_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    const onResize = () => {
      setIsMobile(checkIsPhone());
      setResponsiveBreakpoint(getResponsiveLayoutMode(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Warn before closing tab/window when project has unsaved changes (`GPT-31 / CL-31`)
  useEffect(() => {
    if (!isDirty || !hasOpenProjectRef.current) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, isLauncherOpen]);

  const saveCurrentProject = useCallback(async (automatic = false) => {
    if (savingRef.current || (automatic && requireManualSaveRef.current)) return;
    savingRef.current = true;
    const snapshot = currentProjectRef.current;
    const session = projectSessionRef.current;
    setSaveError(null);
    setSaveState('saving');
    try {
      const result = await saveProjectToWorkspace(snapshot, savedPathRef.current);
      if (session !== projectSessionRef.current) return;
      if (!result.ok) {
        setSaveState('idle');
        setSaveError({ code: result.code, error: result.error });
        return;
      }
      savedPathRef.current = result.path;
      requireManualSaveRef.current = false;
      if (currentProjectRef.current === snapshot) {
        lastSavedProjectRef.current = result.project;
        currentProjectRef.current = result.project;
        adoptSavedProject(snapshot, result.project);
      } else {
        lastSavedProjectRef.current = snapshot;
      }
      setLastSavedAt(new Date(result.savedAt).toLocaleTimeString());
      setLastSaveWasAutomatic(automatic);
      setSaveState(result.storage);
    } catch (error: unknown) {
      if (session === projectSessionRef.current) {
        setSaveState('idle');
        setSaveError({ code: 'ERR_SAVE_UNEXPECTED', error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      savingRef.current = false;
    }
  }, [adoptSavedProject]);

  // Autosave commits the current revision, never a stale completion as the current revision.
  useEffect(() => {
    if (siteSection !== 'studio' || isLauncherOpen) return;
    const seconds = Number(loadSystemSettings().editorConfig.autoSaveIntervalSec);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const timer = window.setInterval(() => {
      if (currentProjectRef.current !== lastSavedProjectRef.current) void saveCurrentProject(true);
    }, Math.max(5, seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [siteSection, isLauncherOpen, isSettingsOpen, saveCurrentProject]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        setIsWindowOverviewOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (siteSection === 'studio' && !isLauncherOpen) void saveCurrentProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [siteSection, isLauncherOpen, saveCurrentProject]);

  const updateProjectMeta = (patch: Partial<typeof project>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };

  const setAsStartNode = (id: string) => {
    setProject((prev) => ({ ...prev, startNodeId: id }));
  };

  const importProject = (proj: typeof project) => {
    replaceProject(proj);
    const firstCh = proj.chapters?.[0]?.id || 'ch-1';
    const firstNode =
      proj.startNodeId ||
      proj.nodes?.find((n) => n.chapterId === firstCh)?.id ||
      proj.nodes?.[0]?.id ||
      '';
    setSelectedChapterId(firstCh);
    if (firstNode) {
      setSelectedNodeId(firstNode);
    }
    setSelectedDialogueIndex(0);
    setSelectedCharacterPlacementId(null);
  };

  // ==================== Recursive 2D Split Tree + Floating State ====================
  const [splitRoot, setSplitRoot] = useState<EditorSplitNode | null>(() => {
    try {
      const raw = localStorage.getItem('moovn_workspace_layout_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.splitRoot) {
          return parsed.splitRoot as EditorSplitNode;
        }
      }
    } catch {
      // ignore
    }
    return createDefaultSplitTree();
  });
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowState[]>(() => {
    try {
      const raw = localStorage.getItem('moovn_workspace_layout_v2');
      if (raw && typeof window !== 'undefined') {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.floatingWindows)) {
          const clamped: FloatingWindowState[] = parsed.floatingWindows.map(
            (w: FloatingWindowState) => ({
              ...w,
              ...clampFloatingRect(
                w,
                { width: window.innerWidth, height: window.innerHeight },
                320,
                220
              ),
            })
          );
          return normalizeWindowZIndices(clamped);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [topZ, setTopZ] = useState<number>(60);

  // Persist layout state (`splitRoot` + `floatingWindows`) (`GPT-30`, `GPT-39`)
  useEffect(() => {
    try {
      localStorage.setItem(
        'moovn_workspace_layout_v2',
        JSON.stringify({ splitRoot, floatingWindows })
      );
    } catch {
      // ignore quota errors
    }
  }, [splitRoot, floatingWindows]);

  // Clamp floating windows when browser / Tauri window resizes (`GPT-19`, `GPT-24`, `Kimi 1L`)
  useEffect(() => {
    const onViewportResize = () => {
      setFloatingWindows((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((w) => ({
          ...w,
          ...clampFloatingRect(
            w,
            { width: window.innerWidth, height: window.innerHeight },
            320,
            220
          ),
        }));
      });
    };
    window.addEventListener('resize', onViewportResize);
    return () => window.removeEventListener('resize', onViewportResize);
  }, []);

  // Dragging state for seamless Dock <-> Float transitions
  const [draggingFloatingId, setDraggingFloatingId] = useState<PanelId | null>(
    null
  );
  const [floatDragOffset, setFloatDragOffset] = useState({ x: 0, y: 0 });
  const [hoverDropTarget, setHoverDropTarget] = useState<{
    leafId: string;
    zone: DropZonePosition;
  } | null>(null);

  // Pending drag on a docked tab (if dragged > 24px, smoothly detaches into Floating Window)
  const pendingTabDragRef = useRef<{
    panelId: PanelId;
    startX: number;
    startY: number;
  } | null>(null);

  // Branch Sash Resizing & Floating Window Corner Resizing
  const resizingBranchRef = useRef<{
    branchId: string;
    direction: 'horizontal' | 'vertical';
    rect: DOMRect;
  } | null>(null);

  const resizingFloatRef = useRef<{
    panelId: PanelId;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // Modals & Logs — First time entering MooVN starts on Project Selection (`isLauncherOpen = true`)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const savedSplitBeforeFocusRef = useRef<EditorSplitNode | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString().slice(0, 8)}] 工作区已就绪`,
  ]);

  const handleToggleFocusMode = () => {
    if (!isFocusMode) {
      savedSplitBeforeFocusRef.current = splitRoot;
      setIsFocusMode(true);
      setSplitRoot({
        kind: 'leaf',
        id: 'leaf-focus-main',
        tabs: ['canvas', 'stage', 'ts_code', 'yaml_code'],
        activeTab: 'canvas',
      });
    } else {
      setIsFocusMode(false);
      setSplitRoot(savedSplitBeforeFocusRef.current || createDefaultSplitTree());
    }
  };

  // Convert a docked panel directly into a Floating Window (clamped to viewport)
  const undockPanelToFloat = (
    panelId: PanelId,
    clientX = 240,
    clientY = 110,
    startDraggingImmediately = false
  ) => {
    setSplitRoot((prev) => removePanelFromSplitTree(prev, panelId));

    const defaultW =
      panelId === 'canvas' || panelId === 'stage' ? 680 : 480;
    const defaultH = panelId === 'terminal' ? 320 : 500;
    const clamped = clampFloatingRect(
      {
        x: clientX - 120,
        y: clientY - 16,
        width: defaultW,
        height: defaultH,
      },
      { width: window.innerWidth, height: window.innerHeight },
      320,
      220
    );

    setFloatingWindows((prev) => {
      const exists = prev.find((w) => w.id === panelId);
      const updated = exists
        ? prev.map((w) =>
            w.id === panelId ? { ...w, x: clamped.x, y: clamped.y } : w
          )
        : [
            ...prev,
            {
              id: panelId,
              x: clamped.x,
              y: clamped.y,
              width: clamped.width,
              height: clamped.height,
              zIndex: 999,
            },
          ];
      return normalizeWindowZIndices(updated as any, panelId) as unknown as FloatingWindowState[];
    });

    if (startDraggingImmediately) {
      setDraggingFloatingId(panelId);
      setFloatDragOffset({ x: 120, y: 16 });
    }
  };

  // Dock a panel (from floating or anywhere) into a specific 2D Leaf & Zone
  const dockPanelIntoTarget = (
    panelId: PanelId,
    targetLeafId: string,
    zone: DropZonePosition
  ) => {
    setFloatingWindows((prev) => prev.filter((w) => w.id !== panelId));
    setSplitRoot((prev) => dockPanelIntoTree(prev, panelId, targetLeafId, zone));
  };

  // Freely move any docked or floating panel to Left / Right / Top / Bottom / Center
  const handleDockWindowAtDirection = (
    panelId: PanelId,
    dir: DockDirection,
    fromLeafId?: string
  ) => {
    setFloatingWindows((prev) => prev.filter((w) => w.id !== panelId));
    setSplitRoot((prev) => {
      const leaves = collectLeaves(prev);
      // Prefer a leaf that doesn't only contain panelId, or fallback to first/last leaf
      const otherLeaves = leaves.filter(
        (l) => !(l.tabs.length === 1 && l.tabs[0] === panelId)
      );
      let targetLeaf = otherLeaves[0] || leaves[0];
      if (fromLeafId) {
        const currentIdx = leaves.findIndex((l) => l.id === fromLeafId);
        if (dir === 'left' || dir === 'top') {
          targetLeaf =
            otherLeaves[Math.max(0, currentIdx - 1)] ||
            otherLeaves[0] ||
            leaves[0];
        } else if (dir === 'right' || dir === 'bottom') {
          targetLeaf =
            otherLeaves[Math.min(otherLeaves.length - 1, currentIdx)] ||
            otherLeaves[otherLeaves.length - 1] ||
            leaves[0];
        }
      }
      const targetId = targetLeaf?.id || 'leaf-init';
      return dockPanelIntoTree(prev, panelId, targetId, dir);
    });
  };

  const handleReorderTabInLeaf = (
    leafId: string,
    fromTab: PanelId,
    toTab: PanelId
  ) => {
    if (fromTab === toTab) return;
    setSplitRoot((prev) =>
      updateLeafInTree(prev, leafId, (l) => {
        const fromIdx = l.tabs.indexOf(fromTab);
        const toIdx = l.tabs.indexOf(toTab);
        if (fromIdx < 0 || toIdx < 0) return l;
        const nextTabs = [...l.tabs];
        const [moved] = nextTabs.splice(fromIdx, 1);
        nextTabs.splice(toIdx, 0, moved);
        return { ...l, tabs: nextTabs };
      })
    );
  };

  const handleOpenOrFocusWindow = (
    panelId: PanelId,
    preferredMode: 'dock' | 'float' = 'dock'
  ) => {
    if (preferredMode === 'float') {
      undockPanelToFloat(panelId, 280, 120, false);
      return;
    }

    // If floating, bring to front
    const floating = floatingWindows.find((f) => f.id === panelId);
    if (floating) {
      const nextZ = topZ + 1;
      setTopZ(nextZ);
      setFloatingWindows((prev) =>
        prev.map((w) => (w.id === panelId ? { ...w, zIndex: nextZ } : w))
      );
      return;
    }

    // If already docked in a leaf, activate its tab
    const leaves = collectLeaves(splitRoot);
    const foundLeaf = leaves.find((l) => l.tabs.includes(panelId));
    if (foundLeaf) {
      setSplitRoot((prev) =>
        updateLeafInTree(prev, foundLeaf.id, (l) => ({
          ...l,
          activeTab: panelId,
        }))
      );
      return;
    }

    // Otherwise dock into the best leaf
    const targetLeafId = leaves[leaves.length - 1]?.id || 'leaf-init';
    dockPanelIntoTarget(
      panelId,
      targetLeafId,
      panelId === 'terminal' ? 'bottom' : 'center'
    );
  };

  const handleToggleDockFloat = (panelId: PanelId) => {
    const isFloating = floatingWindows.some((f) => f.id === panelId);
    if (isFloating) {
      const leaves = collectLeaves(splitRoot);
      const targetLeafId = leaves[0]?.id || 'leaf-init';
      dockPanelIntoTarget(
        panelId,
        targetLeafId,
        panelId === 'terminal' ? 'bottom' : 'center'
      );
    } else {
      undockPanelToFloat(panelId, 260, 120, false);
    }
  };

  const handleApplyLayoutPreset = (
    preset: 'default_ide' | 'quad_2x2' | 'multi_col_4' | 'canvas_stage_terminal'
  ) => {
    setFloatingWindows([]);
    if (preset === 'quad_2x2') {
      // True 2D [A | C] over [B | D]
      setSplitRoot({
        kind: 'branch',
        id: 'quad-v',
        direction: 'vertical',
        ratio: 0.54,
        first: {
          kind: 'branch',
          id: 'quad-top-h',
          direction: 'horizontal',
          ratio: 0.52,
          first: {
            kind: 'leaf',
            id: 'cell-a',
            tabs: ['canvas', 'node_library'],
            activeTab: 'canvas',
          },
          second: {
            kind: 'leaf',
            id: 'cell-c',
            tabs: ['stage', 'asset_studio'],
            activeTab: 'stage',
          },
        },
        second: {
          kind: 'branch',
          id: 'quad-bot-h',
          direction: 'horizontal',
          ratio: 0.52,
          first: {
            kind: 'leaf',
            id: 'cell-b',
            tabs: ['ts_code', 'terminal'],
            activeTab: 'ts_code',
          },
          second: {
            kind: 'leaf',
            id: 'cell-d',
            tabs: ['inspector', 'ai_agent'],
            activeTab: 'inspector',
          },
        },
      });
    } else if (preset === 'multi_col_4') {
      // [Col 1 | Col 2 | Col 3 | Col 4]
      setSplitRoot({
        kind: 'branch',
        id: 'mc-1',
        direction: 'horizontal',
        ratio: 0.18,
        first: {
          kind: 'leaf',
          id: 'c-1',
          tabs: ['node_library', 'explorer'],
          activeTab: 'node_library',
        },
        second: {
          kind: 'branch',
          id: 'mc-2',
          direction: 'horizontal',
          ratio: 0.42,
          first: {
            kind: 'leaf',
            id: 'c-2',
            tabs: ['canvas'],
            activeTab: 'canvas',
          },
          second: {
            kind: 'branch',
            id: 'mc-3',
            direction: 'horizontal',
            ratio: 0.54,
            first: {
              kind: 'leaf',
              id: 'c-3',
              tabs: ['stage', 'terminal'],
              activeTab: 'stage',
            },
            second: {
              kind: 'leaf',
              id: 'c-4',
              tabs: ['inspector', 'ai_agent'],
              activeTab: 'inspector',
            },
          },
        },
      });
    } else if (preset === 'canvas_stage_terminal') {
      // Top row: [Canvas | Stage | Inspector], Bottom full-width row: [Terminal & TS Code]
      setSplitRoot({
        kind: 'branch',
        id: 'cst-v',
        direction: 'vertical',
        ratio: 0.68,
        first: {
          kind: 'branch',
          id: 'cst-top-1',
          direction: 'horizontal',
          ratio: 0.44,
          first: {
            kind: 'leaf',
            id: 'cst-canvas',
            tabs: ['canvas', 'node_library'],
            activeTab: 'canvas',
          },
          second: {
            kind: 'branch',
            id: 'cst-top-2',
            direction: 'horizontal',
            ratio: 0.56,
            first: {
              kind: 'leaf',
              id: 'cst-stage',
              tabs: ['stage', 'ui_customizer'],
              activeTab: 'stage',
            },
            second: {
              kind: 'leaf',
              id: 'cst-insp',
              tabs: ['inspector', 'ai_agent'],
              activeTab: 'inspector',
            },
          },
        },
        second: {
          kind: 'leaf',
          id: 'cst-bottom-wide',
          tabs: ['terminal', 'ts_code', 'yaml_code'],
          activeTab: 'terminal',
        },
      });
    } else {
      setSplitRoot(createDefaultSplitTree());
    }
  };

  // ==================== UNIFIED MOUSE & TOUCH POINTER MOVE ====================
  const handlePointerMove = (clientX: number, clientY: number) => {
    // 1. Only detach a docked tab into a Floating Window if dragged > 96px vertically outside the tab bar
    if (pendingTabDragRef.current) {
      const dy = Math.abs(clientY - pendingTabDragRef.current.startY);
      if (dy > 96) {
        const pid = pendingTabDragRef.current.panelId;
        pendingTabDragRef.current = null;
        undockPanelToFloat(pid, clientX, clientY, true);
        return;
      }
    }

    // 2. Dragging a Floating Window (clamped to viewport bounds so it never leaves screen)
    if (draggingFloatingId) {
      setFloatingWindows((prev) =>
        prev.map((w) => {
          if (w.id !== draggingFloatingId) return w;
          const clamped = clampFloatingRect(
            {
              x: clientX - floatDragOffset.x,
              y: clientY - floatDragOffset.y,
              width: w.width,
              height: w.height,
            },
            { width: window.innerWidth, height: window.innerHeight },
            320,
            220
          );
          return {
            ...w,
            x: clamped.x,
            y: clamped.y,
          };
        })
      );

      const zoneElements = document.querySelectorAll('[data-dock-zone]');
      let matched: {
        leafId: string;
        zone: DropZonePosition;
      } | null = null;

      zoneElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const leafId = el.getAttribute('data-dock-leaf') || '';
          const zone = (el.getAttribute('data-dock-zone') ||
            'center') as DropZonePosition;
          if (leafId) {
            matched = { leafId, zone };
          }
        }
      });

      // Also check pane edge zones so user can drag directly to Left / Right / Top / Bottom edge of any pane!
      if (!matched) {
        const leafContainers = document.querySelectorAll('[data-leaf-container]');
        leafContainers.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          ) {
            const leafId = el.getAttribute('data-leaf-container') || '';
            if (!leafId) return;
            const relX = (clientX - rect.left) / Math.max(1, rect.width);
            const relY = (clientY - rect.top) / Math.max(1, rect.height);
            if (relX < 0.18) {
              matched = { leafId, zone: 'left' };
            } else if (relX > 0.82) {
              matched = { leafId, zone: 'right' };
            } else if (relY < 0.18) {
              matched = { leafId, zone: 'top' };
            } else if (relY > 0.82) {
              matched = { leafId, zone: 'bottom' };
            }
          }
        });
      }

      setHoverDropTarget(matched);
      return;
    }

    // 3. Resizing a Floating Window from bottom-right corner (clamped to viewport & min size 320x220)
    if (resizingFloatRef.current) {
      const { panelId, startX, startY, startW, startH } =
        resizingFloatRef.current;
      const dw = clientX - startX;
      const dh = clientY - startY;
      setFloatingWindows((prev) =>
        prev.map((w) => {
          if (w.id !== panelId) return w;
          const clamped = clampFloatingRect(
            {
              x: w.x,
              y: w.y,
              width: startW + dw,
              height: startH + dh,
            },
            { width: window.innerWidth, height: window.innerHeight },
            320,
            220
          );
          return {
            ...w,
            width: clamped.width,
            height: clamped.height,
            x: clamped.x,
            y: clamped.y,
          };
        })
      );
      return;
    }

    // 4. Resizing a 2D Split Branch Sash
    if (resizingBranchRef.current) {
      const { branchId, direction, rect } = resizingBranchRef.current;
      const ratio =
        direction === 'horizontal'
          ? (clientX - rect.left) / Math.max(1, rect.width)
          : (clientY - rect.top) / Math.max(1, rect.height);
      setSplitRoot((prev) => updateBranchRatioInTree(prev, branchId, ratio));
    }
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleGlobalTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    handlePointerMove(t.clientX, t.clientY);
  };

  const handleGlobalMouseUp = () => {
    pendingTabDragRef.current = null;
    resizingBranchRef.current = null;
    resizingFloatRef.current = null;

    if (draggingFloatingId) {
      if (hoverDropTarget) {
        dockPanelIntoTarget(
          draggingFloatingId,
          hoverDropTarget.leafId,
          hoverDropTarget.zone
        );
      }
      setDraggingFloatingId(null);
      setHoverDropTarget(null);
    }
  };

  // Render content of any PanelId
  const renderPanelContent = (id: PanelId) => {
    switch (id) {
      case 'explorer':
      case 'node_library':
      case 'characters':
        return (
          <LeftPanel
            chapters={project.chapters}
            nodes={project.nodes}
            selectedChapterId={selectedChapterId}
            selectedNodeId={selectedNodeId}
            startNodeId={project.startNodeId}
            defaultTab={id === 'node_library' ? 'nodes' : 'chapters'}
            onSelectChapter={setSelectedChapterId}
            onSelectNode={(nid) => {
              setSelectedNodeId(nid);
              if (isMobile) {
                setMobileActivePanel('canvas');
              }
            }}
            onAddChapter={addChapter}
            onAddNode={(type) => {
              addNode(type);
              if (isMobile) {
                setMobileActivePanel('canvas');
              }
            }}
            onAssignBackground={(bgId) => {
              if (!selectedNode) return;
              updateNode(selectedNode.id, (prev) => ({
                ...prev,
                backgroundId: bgId,
              }));
            }}
            onAssignBgm={(bgmId) => {
              if (!selectedNode) return;
              updateNode(selectedNode.id, (prev) => ({ ...prev, bgmId }));
            }}
            onAddCharacterToStage={(charId) => {
              if (!selectedNode) return;
              addCharacterToNode(selectedNode.id, charId);
            }}
            onOpenYamlTab={(chapterId) => {
              setSelectedChapterId(chapterId);
              handleOpenOrFocusWindow('yaml_code', 'dock');
            }}
            onOpenTsTab={() => handleOpenOrFocusWindow('ts_code', 'dock')}
          />
        );
      case 'canvas':
        return (
          <NodeCanvas
            nodes={project.nodes}
            chapters={project.chapters}
            characters={project.characters}
            startNodeId={project.startNodeId}
            selectedNodeId={selectedNodeId}
            selectedChapterId={selectedChapterId}
            onSelectNode={setSelectedNodeId}
            onUpdateNode={updateNode}
            onAddNode={addNode}
            onDeleteNode={deleteNode}
            onAddVisualBlock={addVisualBlock}
            onUpdateVisualBlock={updateVisualBlock}
            onRemoveVisualBlock={removeVisualBlock}
            onOpenInspectorForNode={(nodeId) => {
              setSelectedNodeId(nodeId);
              if (isMobile) {
                setMobileActivePanel('inspector');
              } else {
                handleOpenOrFocusWindow('inspector', 'dock');
              }
            }}
          />
        );
      case 'stage':
        return selectedNode ? (
          <SceneStageView
            node={selectedNode}
            characters={project.characters}
            uiConfig={project.uiConfig}
            motionLevel={motionLevel}
            selectedDialogueIndex={selectedDialogueIndex}
            onSelectDialogueIndex={setSelectedDialogueIndex}
            selectedCharacterPlacementId={selectedCharacterPlacementId}
            onSelectCharacterPlacement={setSelectedCharacterPlacementId}
            onUpdateNode={(updater) => updateNode(selectedNode.id, updater)}
            onAddCharacter={(charId) =>
              addCharacterToNode(selectedNode.id, charId)
            }
            onUpdateCharacter={(placementId, patch) =>
              updateCharacterPlacement(selectedNode.id, placementId, patch)
            }
            onRemoveCharacter={(placementId) =>
              removeCharacterFromNode(selectedNode.id, placementId)
            }
          />
        ) : null;
      case 'ui_customizer':
        return (
          <GameUICustomizer
            project={project}
            onUpdateUIConfig={updateUIConfig}
          />
        );
      case 'ts_code':
        return (
          <ScriptView
            project={project}
            selectedChapterId={selectedChapterId}
            selectedNode={selectedNode}
            onUpdateNode={updateNode}
            onUpdateProject={updateProjectMeta}
            mode="ts"
          />
        );
      case 'yaml_code':
        return (
          <ScriptView
            project={project}
            selectedChapterId={selectedChapterId}
            selectedNode={selectedNode}
            onUpdateNode={updateNode}
            onUpdateProject={updateProjectMeta}
            mode="yaml"
          />
        );
      case 'inspector':
        return selectedNode ? (
          <Inspector
            node={selectedNode}
            allNodes={project.nodes}
            chapters={project.chapters}
            characters={project.characters}
            startNodeId={project.startNodeId}
            selectedDialogueIndex={selectedDialogueIndex}
            onSelectDialogueIndex={setSelectedDialogueIndex}
            onUpdateNode={(updater) => updateNode(selectedNode.id, updater)}
            onAddDialogue={() => addDialogueLine(selectedNode.id)}
            onUpdateDialogue={(lineId, patch) =>
              updateDialogueLine(selectedNode.id, lineId, patch)
            }
            onDeleteDialogue={(lineId) =>
              deleteDialogueLine(selectedNode.id, lineId)
            }
            onAddChoice={() => addChoice(selectedNode.id)}
            onUpdateChoice={(choiceId, patch) =>
              updateChoice(selectedNode.id, choiceId, patch)
            }
            onDeleteChoice={(choiceId) =>
              deleteChoice(selectedNode.id, choiceId)
            }
            onSetStartNode={setAsStartNode}
            onUpdateCharacterProfile={updateCharacterProfile}
            onAddCharacterProfile={addCharacterProfile}
          />
        ) : null;
      case 'ai_agent':
        return (
          <AiAssistantPanel
            project={project}
            selectedChapterId={selectedChapterId}
            selectedNode={selectedNode || undefined}
            onCreateGeneratedNodes={(nodes, connectFromSelected) => {
              nodes.forEach((partial) => {
                const newId = addNode((partial.type as WorkflowNodeType) || 'dialogue');
                updateNode(newId, (prev) => ({
                  ...prev,
                  ...partial,
                  id: prev.id,
                }));
                if (connectFromSelected && selectedNode) {
                  updateNode(selectedNode.id, (prev) => ({
                    ...prev,
                    nextNodeId: newId,
                  }));
                }
              });
            }}
            onUpdateCurrentNode={(updater) => {
              if (!selectedNode) return;
              updateNode(selectedNode.id, updater);
            }}
            onUpdateProjectMeta={updateProjectMeta}
          />
        );
      case 'terminal':
        return (
          <TerminalPanel
            project={project}
            selectedNodeId={selectedNodeId}
            runtimeLogs={runtimeLogs}
            onSelectNode={setSelectedNodeId}
            onClearRuntimeLogs={() => setRuntimeLogs([])}
          />
        );
      case 'asset_studio':
        return (
          <AssetStudioPanel
            project={project}
            selectedNode={selectedNode}
            motionLevel={motionLevel}
            onUpdateNode={(nodeId, patch) =>
              updateNode(nodeId, (prev) => ({ ...prev, ...patch }))
            }
            onUpdateProject={updateProjectMeta}
          />
        );
      default:
        return null;
    }
  };

  // Render an Editor Group Leaf (`EditorGroupLeaf`)
  const renderEditorGroupLeaf = (leaf: EditorGroupLeaf) => {
    const activePanel = leaf.tabs.includes(leaf.activeTab)
      ? leaf.activeTab
      : leaf.tabs[0] || 'canvas';
    const isLeafHovered = hoverDropTarget?.leafId === leaf.id;

    return (
      <div
        key={leaf.id}
        data-leaf-container={leaf.id}
        className="relative flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden bg-[#141417] border-r border-b border-[#242429]"
      >
        {/* Docked Group Tab Header (also acts as a 'center' merge drop zone!) */}
        <div
          data-dock-leaf={leaf.id}
          data-dock-zone="center"
          className={`h-7 bg-[#18181c] border-b px-1.5 flex items-center justify-between shrink-0 transition-colors ${
            isLeafHovered && hoverDropTarget?.zone === 'center'
              ? 'border-sky-400 bg-sky-500/15'
              : 'border-[#27272c]'
          }`}
        >
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
            {leaf.tabs.map((tabId) => {
              const isActive = tabId === activePanel;
              return (
                <div
                  key={tabId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/moovn-tab', tabId);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const draggedTab = e.dataTransfer.getData('text/moovn-tab') as PanelId;
                    if (!draggedTab) return;
                    if (leaf.tabs.includes(draggedTab)) {
                      handleReorderTabInLeaf(leaf.id, draggedTab, tabId);
                    } else {
                      dockPanelIntoTarget(draggedTab, leaf.id, 'center');
                    }
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    setSplitRoot((prev) =>
                      updateLeafInTree(prev, leaf.id, (l) => ({
                        ...l,
                        activeTab: tabId,
                      }))
                    );
                    pendingTabDragRef.current = {
                      panelId: tabId,
                      startX: e.clientX,
                      startY: e.clientY,
                    };
                  }}
                  onTouchStart={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    const t = e.touches[0];
                    setSplitRoot((prev) =>
                      updateLeafInTree(prev, leaf.id, (l) => ({
                        ...l,
                        activeTab: tabId,
                      }))
                    );
                    if (t) {
                      pendingTabDragRef.current = {
                        panelId: tabId,
                        startX: t.clientX,
                        startY: t.clientY,
                      };
                    }
                  }}
                  title="切换 / 拖拽重排"
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-[11px] cursor-grab active:cursor-grabbing transition shrink-0 ${
                    isActive
                      ? 'bg-[#141417] text-zinc-100 font-medium border-t-2 border-t-sky-400 border-x border-x-[#2b2b33]'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="truncate max-w-[115px]">
                    {tPanel(tabId)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      undockPanelToFloat(
                        tabId,
                        rect.left,
                        rect.bottom + 12,
                        false
                      );
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-sky-300 transition"
                    title="弹出为漂浮窗口"
                  >
                    <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSplitRoot((prev) =>
                        removePanelFromSplitTree(prev, tabId)
                      );
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition"
                    title="关闭此标签页"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Split / Float Actions */}
          <div className="flex items-center gap-0.5 shrink-0 pl-1">
            <button
              onClick={() => {
                const candidate: PanelId =
                  leaf.tabs.length > 1
                    ? activePanel
                    : activePanel === 'canvas'
                    ? 'terminal'
                    : activePanel === 'stage'
                    ? 'ts_code'
                    : 'ai_agent';
                dockPanelIntoTarget(candidate, leaf.id, 'bottom');
              }}
              className="icon-btn !w-5 !h-5"
              title="向下拆分新行 (在此窗格下方分栏)"
            >
              <SplitSquareVertical className="w-3 h-3" strokeWidth={1.6} />
            </button>

            <button
              onClick={() => {
                const candidate: PanelId =
                  leaf.tabs.length > 1
                    ? activePanel
                    : activePanel === 'canvas'
                    ? 'stage'
                    : 'ai_agent';
                dockPanelIntoTarget(candidate, leaf.id, 'right');
              }}
              className="icon-btn !w-5 !h-5"
              title="向右拆分新列 (在此窗格右侧分栏)"
            >
              <SplitSquareHorizontal className="w-3 h-3" strokeWidth={1.6} />
            </button>

            <button
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                undockPanelToFloat(
                  activePanel,
                  rect.left,
                  rect.bottom + 12,
                  false
                );
              }}
              className="icon-btn !w-5 !h-5"
              title="切换当前窗口为自由漂浮窗"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* Active Panel Body */}
        <div className="flex-1 overflow-hidden relative">
          {renderPanelContent(activePanel)}

          {/* Edge Drop Snap Preview (No central compass blocking content) */}
          {draggingFloatingId && isLeafHovered && hoverDropTarget && (
            <div className="absolute inset-0 z-50 pointer-events-none">
              <div
                className={`absolute bg-sky-500/20 border-2 border-sky-400 rounded transition-all duration-75 ${
                  hoverDropTarget.zone === 'top'
                    ? 'top-1 left-1 right-1 h-1/2'
                    : hoverDropTarget.zone === 'bottom'
                    ? 'bottom-1 left-1 right-1 h-1/2'
                    : hoverDropTarget.zone === 'left'
                    ? 'top-1 bottom-1 left-1 w-1/2'
                    : hoverDropTarget.zone === 'right'
                    ? 'top-1 bottom-1 right-1 w-1/2'
                    : 'inset-1'
                }`}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Recursive 2D Split Tree Renderer
  const renderSplitTree = (node: EditorSplitNode | null): React.ReactNode => {
    if (!node) return null;
    if (node.kind === 'leaf') {
      return renderEditorGroupLeaf(node);
    }

    const isHorizontal = node.direction === 'horizontal';
    const firstPct = `${(node.ratio * 100).toFixed(1)}%`;
    const secondPct = `${((1 - node.ratio) * 100).toFixed(1)}%`;

    return (
      <div
        key={node.id}
        className={`flex ${
          isHorizontal ? 'flex-row' : 'flex-col'
        } w-full h-full min-w-0 min-h-0 overflow-hidden`}
      >
        <div
          style={isHorizontal ? { width: firstPct } : { height: firstPct }}
          className="min-w-0 min-h-0 overflow-hidden flex"
        >
          {renderSplitTree(node.first)}
        </div>

        {/* Interactive Draggable Sash (6px wide hit area) */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const parent = e.currentTarget.parentElement;
            if (!parent) return;
            resizingBranchRef.current = {
              branchId: node.id,
              direction: node.direction,
              rect: parent.getBoundingClientRect(),
            };
          }}
          onTouchStart={(e) => {
            const parent = e.currentTarget.parentElement;
            if (!parent) return;
            resizingBranchRef.current = {
              branchId: node.id,
              direction: node.direction,
              rect: parent.getBoundingClientRect(),
            };
          }}
          className={`${
            isHorizontal
              ? 'w-1.5 cursor-col-resize hover:bg-sky-500/60'
              : 'h-1.5 cursor-row-resize hover:bg-sky-500/60'
          } bg-[#1e1e24] shrink-0 transition z-20`}
        />

        <div
          style={isHorizontal ? { width: secondPct } : { height: secondPct }}
          className="min-w-0 min-h-0 overflow-hidden flex"
        >
          {renderSplitTree(node.second)}
        </div>
      </div>
    );
  };

  const allLeaves = collectLeaves(splitRoot);

  const panelDescriptors: WindowPanelDescriptor[] = windowOrder.map((id) => ({
    id,
    title: tPanel(id),
    docked: allLeaves.some((l) => l.tabs.includes(id)),
    floating: floatingWindows.some((f) => f.id === id),
  }));

  const orderedRailItems = windowOrder
    .map((id) => ACTIVITY_RAIL_ITEMS.find((item) => item.id === id))
    .filter((item): item is (typeof ACTIVITY_RAIL_ITEMS)[number] => Boolean(item));

  const isPanelActiveAnywhere = (id: PanelId) =>
    allLeaves.some((l) => l.activeTab === id) ||
    floatingWindows.some((f) => f.id === id);

  if (siteSection === 'portal') {
    return <OfficialPortal onEnterStudio={() => setSiteSection('studio')} />;
  }

  const isHorizontalRail = railPosition === 'top' || railPosition === 'bottom';

  return (
    <div
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
      onTouchMove={handleGlobalTouchMove}
      onTouchEnd={handleGlobalMouseUp}
      className={`h-screen w-screen flex flex-col bg-[#111113] text-zinc-200 overflow-hidden select-none ${
        editorTheme === 'light' ? 'theme-light' : ''
      }`}
    >
      {/* Clean Top Studio MenuBar */}
      <MenuBar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        panels={panelDescriptors}
        isFocusMode={isFocusMode}
        onToggleFocusMode={handleToggleFocusMode}
        railPosition={railPosition}
        onChangeRailPosition={handleChangeRailPosition}
        onMoveWindowOrder={handleMoveWindowOrder}
        onDockWindowAtDirection={(id, dir) =>
          handleDockWindowAtDirection(id, dir)
        }
        onOpenOrFocusWindow={(id, mode) => {
          if (isMobile) {
            setMobileActivePanel(id);
          } else {
            handleOpenOrFocusWindow(id, mode);
          }
        }}
        onToggleDockFloat={handleToggleDockFloat}
        onResetLayout={() => {
          setIsFocusMode(false);
          setSplitRoot(createDefaultSplitTree());
          setFloatingWindows([]);
        }}
        onPlayPreview={() => setIsPlayingPreview(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenProjectLauncher={() => setIsLauncherOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        onOpenOfficialPortal={() => {
          if (
            typeof window !== 'undefined' &&
            window.location.pathname.includes('studio')
          ) {
            window.open('/', '_blank', 'noopener,noreferrer');
          } else {
            setSiteSection('portal');
          }
        }}
      />

      {isMobile ? (
        /* ==================== MOBILE DUAL-ZONE TOUCH WORKBENCH ==================== */
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Mobile Scene & Stage Control Strip */}
          <div className="min-h-9 py-1 px-2 bg-[#16161a] border-b border-[#27272c] flex items-center justify-between gap-1.5 text-xs shrink-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <select
                value={selectedChapterId}
                onChange={(e) => {
                  const chId = e.target.value;
                  setSelectedChapterId(chId);
                  const firstInCh = project.nodes.find((n) => n.chapterId === chId);
                  if (firstInCh) setSelectedNodeId(firstInCh.id);
                }}
                className="px-1.5 py-0.5 rounded bg-[#202027] border border-[#2f2f3a] text-[11px] text-sky-300 font-semibold max-w-[92px] truncate"
                title="切换当前章节"
              >
                {project.chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title}
                  </option>
                ))}
              </select>

              <select
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
                className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[#202027] border border-[#2f2f3a] text-[11px] text-zinc-100 truncate"
                title="切换当前编辑节点"
              >
                {project.nodes.map((n, idx) => (
                  <option key={n.id} value={n.id}>
                    #{idx + 1} {n.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setMobilePinStage((v) => !v)}
                className={`px-2 py-1 rounded text-[11px] font-semibold border transition ${
                  mobilePinStage || mobileActivePanel === 'stage'
                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                    : 'bg-[#222228] border-[#2f2f3a] text-zinc-400'
                }`}
                title="常驻展开或收起顶部 16:9 实时舞台"
              >
                {mobilePinStage || mobileActivePanel === 'stage' ? '收起舞台' : '展开舞台'}
              </button>

              <button
                onClick={() =>
                  setEditorTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                }
                className="p-1.5 rounded bg-[#222228] text-zinc-300"
                title="切换黑白界面风格"
              >
                {editorTheme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                )}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 rounded bg-[#222228] text-zinc-300"
                title="设置"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Pinned Collapsible 16:9 Live Stage Monitor (Always visible when stage tab or pinned) */}
          {selectedNode && (mobilePinStage || mobileActivePanel === 'stage') && (
            <div className="shrink-0 border-b border-[#27272c] bg-[#111113]">
              <SceneStageView
                node={selectedNode}
                characters={project.characters}
                uiConfig={project.uiConfig}
                motionLevel={motionLevel}
                selectedDialogueIndex={selectedDialogueIndex}
                onSelectDialogueIndex={setSelectedDialogueIndex}
                selectedCharacterPlacementId={selectedCharacterPlacementId}
                onSelectCharacterPlacement={setSelectedCharacterPlacementId}
                onUpdateNode={(updater) => updateNode(selectedNode.id, updater)}
                onAddCharacter={(charId) =>
                  addCharacterToNode(selectedNode.id, charId)
                }
                onUpdateCharacter={(placementId, patch) =>
                  updateCharacterPlacement(selectedNode.id, placementId, patch)
                }
                onRemoveCharacter={(placementId) =>
                  removeCharacterFromNode(selectedNode.id, placementId)
                }
                compactMobile={true}
              />
            </div>
          )}

          {/* Active Creation Workspace (When on 'stage' tab, shows full Inspector below the 16:9 stage!) */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {renderPanelContent(
              mobileActivePanel === 'stage' ? 'inspector' : mobileActivePanel
            )}
          </div>

          {/* Mobile Bottom Touch Navigation Bar */}
          <nav className="h-14 bg-[#12141c] border-t border-[#262b3b] flex items-center overflow-x-auto px-1.5 gap-1 shrink-0">
            {orderedRailItems.map((item) => {
              const active = mobileActivePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setMobileActivePanel(item.id)}
                  className={`min-w-[58px] px-2 py-1.5 rounded-lg flex flex-col items-center justify-center gap-1 shrink-0 transition ${
                    active
                      ? 'bg-sky-500 text-white font-semibold shadow-md shadow-sky-600/30'
                      : 'text-zinc-400 hover:text-zinc-200 bg-[#191c26]'
                  }`}
                >
                  {item.icon}
                  <span className="text-[10px] leading-none whitespace-nowrap">
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        /* Main Body: Customizable Position Activity Rail + Recursive 2D Multi-Row/Multi-Column Dock Grid */
        <div
          className={`flex-1 flex overflow-hidden relative ${
            railPosition === 'left'
              ? 'flex-row'
              : railPosition === 'right'
              ? 'flex-row-reverse'
              : railPosition === 'top'
              ? 'flex-col'
              : 'flex-col-reverse'
          }`}
        >
          {/* ==================== CUSTOMIZABLE ACTIVITY RAIL (Left / Right / Top / Bottom & Reorderable) ==================== */}
          <aside
            className={`bg-[#141417] border-[#27272c] flex items-center justify-between shrink-0 z-40 ${
              isHorizontalRail
                ? 'h-10 w-full flex-row px-2 border-y'
                : 'w-10 h-full flex-col py-2 border-x'
            }`}
          >
            <div
              className={`flex items-center gap-1.5 ${
                isHorizontalRail ? 'flex-row overflow-x-auto no-scrollbar' : 'flex-col'
              }`}
            >
              {orderedRailItems.map((item) => {
                const active = isPanelActiveAnywhere(item.id);
                return (
                  <button
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggingRailItemId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingRailItemId) {
                        handleReorderRailItems(draggingRailItemId, item.id);
                      }
                      setDraggingRailItemId(null);
                    }}
                    onDragEnd={() => setDraggingRailItemId(null)}
                    onClick={() => handleOpenOrFocusWindow(item.id, 'dock')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenOrFocusWindow(item.id, 'float');
                    }}
                    title={`${tPanel(item.id)} (左键停靠打开 / 右键悬浮打开 / 拖拽调整图标顺序)`}
                    className={`relative w-8 h-8 rounded flex items-center justify-center transition ${
                      active
                        ? 'text-white bg-[#25252d]'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#1d1d23]'
                    } ${draggingRailItemId === item.id ? 'opacity-40' : ''}`}
                  >
                    {active && (
                      <span
                        className={`absolute bg-sky-400 rounded ${
                          isHorizontalRail
                            ? 'bottom-0 left-1.5 right-1.5 h-0.5'
                            : railPosition === 'right'
                            ? 'right-0 top-1.5 bottom-1.5 w-0.5'
                            : 'left-0 top-1.5 bottom-1.5 w-0.5'
                        }`}
                      />
                    )}
                    {item.icon}
                  </button>
                );
              })}
            </div>

            <div
              className={`flex items-center gap-1.5 ${
                isHorizontalRail ? 'flex-row' : 'flex-col'
              }`}
            >
              {/* Quick Rail Position Cycle Button */}
              <button
                onClick={() => {
                  const order: RailPosition[] = ['left', 'top', 'right', 'bottom'];
                  const next = order[(order.indexOf(railPosition) + 1) % order.length];
                  handleChangeRailPosition(next);
                }}
                title={`切换窗口选项栏位置 (当前: ${railPosition})`}
                className="w-8 h-8 rounded flex items-center justify-center text-zinc-500 hover:text-sky-300 hover:bg-[#1d1d23] transition text-[10px] font-mono"
              >
                {railPosition === 'left'
                  ? '⇤'
                  : railPosition === 'right'
                  ? '⇥'
                  : railPosition === 'top'
                  ? '⇧'
                  : '⇩'}
              </button>

              {/* Dark / Light 2 Themes Toggle (`开发方案 2: 界面风格有黑和白2种风格`) */}
              <button
                onClick={() =>
                  setEditorTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                }
                title={
                  editorTheme === 'dark'
                    ? '切换为浅色(白)界面风格'
                    : '切换为深色(黑)界面风格'
                }
                className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#1d1d23] transition"
              >
                {editorTheme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-300" strokeWidth={1.7} />
                ) : (
                  <Moon className="w-4 h-4 text-sky-400" strokeWidth={1.7} />
                )}
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                title="设置"
                className="w-8 h-8 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-[#1d1d23] transition"
              >
                <Settings className="w-4 h-4" strokeWidth={1.7} />
              </button>
            </div>
          </aside>

          {/* ==================== 2D RECURSIVE MULTI-ROW & MULTI-COLUMN DOCK WORKBENCH ==================== */}
          <div className="flex-1 flex overflow-hidden relative">
            {!splitRoot || allLeaves.length === 0 ? (
              <div
                data-dock-leaf="leaf-empty"
                data-dock-zone="center"
                className="flex-1 flex items-center justify-center text-zinc-500 text-xs"
              >
                拖入任意漂浮窗口至此区域即可恢复停靠，或点击左侧图标栏打开窗口
              </div>
            ) : (
              renderSplitTree(splitRoot)
            )}

          {/* ==================== FLOATING WINDOWS LAYER ==================== */}
          {floatingWindows.map((fw) => {
            const isBeingDragged = draggingFloatingId === fw.id;
            return (
              <div
                key={fw.id}
                onMouseDown={() => {
                  setFloatingWindows((prev) =>
                    normalizeWindowZIndices(prev as any, fw.id) as unknown as FloatingWindowState[]
                  );
                }}
                style={{
                  left: fw.x,
                  top: fw.y,
                  width: fw.width,
                  height: fw.height,
                  zIndex: fw.zIndex,
                  pointerEvents: isBeingDragged ? 'none' : 'auto',
                }}
                className={`fixed rounded-lg bg-[#16161a] border shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-opacity ${
                  isBeingDragged
                    ? 'opacity-85 border-sky-400 ring-2 ring-sky-400/40'
                    : 'opacity-100 border-zinc-600/80'
                }`}
              >
                {/* Floating Window Draggable Title Bar (`[标题] ... [停靠] [关闭]`) */}
                <div
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    setDraggingFloatingId(fw.id);
                    setFloatDragOffset({
                      x: e.clientX - fw.x,
                      y: e.clientY - fw.y,
                    });
                  }}
                  onTouchStart={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    const t = e.touches[0];
                    if (!t) return;
                    setDraggingFloatingId(fw.id);
                    setFloatDragOffset({
                      x: t.clientX - fw.x,
                      y: t.clientY - fw.y,
                    });
                  }}
                  className="h-8 bg-[#202027] border-b border-[#2e2e38] px-3 flex items-center justify-between cursor-move shrink-0"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100 min-w-0">
                    <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{tPanel(fw.id)}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleDockFloat(fw.id)}
                      className="px-2 py-0.5 rounded bg-[#2c2c36] hover:bg-sky-500 hover:text-zinc-950 text-[10px] text-zinc-200 flex items-center gap-1 transition"
                      title="停靠归位至工作区网格"
                    >
                      <Minimize2 className="w-3 h-3" strokeWidth={1.6} />
                      <span>停靠归位</span>
                    </button>
                    <button
                      onClick={() =>
                        setFloatingWindows((prev) =>
                          prev.filter((w) => w.id !== fw.id)
                        )
                      }
                      className="icon-btn !w-5 !h-5"
                      title="关闭漂浮窗口"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.6} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  {renderPanelContent(fw.id)}

                  {/* Bottom-Right Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      resizingFloatRef.current = {
                        panelId: fw.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        startW: fw.width,
                        startH: fw.height,
                      };
                    }}
                    className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize z-30 flex items-end justify-end p-0.5 text-zinc-500 hover:text-zinc-200"
                    title="拖拽调整漂浮窗大小"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <path
                        d="M7 1L1 7M7 4L4 7"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Bottom Status Bar (Desktop) */}
      {!isMobile && (
        <StatusBar
          project={project}
          selectedNode={selectedNode}
          isDirty={isDirty}
          lastSavedAt={lastSavedAt}
          storageWarning={storageWarning}
          saveState={saveState}
          saveError={saveError}
          savedPath={savedPathRef.current}
          lastSaveWasAutomatic={lastSaveWasAutomatic}
          onRetrySave={() => void saveCurrentProject()}
          onOpenWindowOverview={() => setIsWindowOverviewOpen(true)}
        />
      )}

      {saveError && (
        <div role="alert" style={{ zIndex: Z_INDEX_TOKENS.toast }} className="fixed bottom-8 right-3 max-w-md bg-rose-950 border border-rose-500 rounded p-3 text-sm text-rose-100 shadow-xl">
          <div>保存失败 ({saveError.code})</div>
          <div className="break-words">{saveError.error}</div>
          <button className="mt-2 underline" onClick={() => void saveCurrentProject()}>重试保存</button>
        </div>
      )}

      {/* Window Overview Modal (`Ctrl+Shift+W`, `GPT-25`, Section 8) */}
      {isWindowOverviewOpen && (
        <div
          style={{ zIndex: Z_INDEX_TOKENS.modal }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsWindowOverviewOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-[#16161b] border border-[#2c2c36] shadow-2xl overflow-hidden text-xs text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#1d1d24] border-b border-[#2c2c36] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white">
                  窗口总览 (Window Overview)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#272732] text-zinc-400 font-mono text-[10px]">
                  Ctrl+Shift+W
                </span>
                <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[10px]">
                  {responsiveBreakpoint === 'three-column'
                    ? '>=1100 三栏模式'
                    : responsiveBreakpoint === 'two-column'
                    ? '768~1099 双栏模式'
                    : '<768 单栏模式'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFocusMode(false);
                    setSplitRoot(createDefaultSplitTree());
                    setFloatingWindows([]);
                  }}
                  className="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold"
                >
                  重置全部为默认三栏
                </button>
                <button
                  type="button"
                  onClick={() => setIsWindowOverviewOpen(false)}
                  className="icon-btn"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-4 py-2.5 bg-[#191920] border-b border-[#272730] flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-200">
                  实验功能：自由悬浮窗 (Experimental Floating Windows)
                </div>
                <div className="text-[11px] text-zinc-400">
                  默认推荐单树分屏布局；开启后可将面板拖出为独立悬浮窗
                </div>
              </div>
              <input
                type="checkbox"
                checked={featureFlags.floatingWindowsExperimental}
                onChange={(e) => {
                  const next = setFeatureFlag(
                    'floatingWindowsExperimental',
                    e.target.checked
                  );
                  setFeatureFlagsState(next);
                  if (!e.target.checked && floatingWindows.length > 0) {
                    setFloatingWindows([]);
                    setSplitRoot(createDefaultSplitTree());
                  }
                }}
                className="w-4 h-4 accent-sky-400 cursor-pointer"
              />
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-[#23232c]">
              {panelDescriptors.map((p) => {
                const fw = floatingWindows.find((w) => w.id === p.id);
                return (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#1c1c24]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-100 truncate">
                        {p.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {p.floating && fw
                          ? `浮动中 · (${fw.x}, ${fw.y}) ${fw.width}×${fw.height} · z=${fw.zIndex}`
                          : p.docked
                          ? '已停靠于分屏树'
                          : '已关闭'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenOrFocusWindow(p.id, 'dock');
                          setIsWindowOverviewOpen(false);
                        }}
                        className="px-2 py-1 rounded bg-[#252530] hover:bg-[#30303e] text-zinc-200"
                      >
                        聚焦 / 停靠
                      </button>
                      {p.floating && (
                        <button
                          type="button"
                          onClick={() => handleToggleDockFloat(p.id)}
                          className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40"
                        >
                          归位分屏
                        </button>
                      )}
                      {(p.docked || p.floating) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFloatingWindows((prev) =>
                              prev.filter((w) => w.id !== p.id)
                            );
                            setSplitRoot((prev) =>
                              removePanelFromSplitTree(prev, p.id)
                            );
                          }}
                          className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                        >
                          关闭
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {isPlayingPreview && (
        <PreviewPlayer
          project={project}
          initialNodeId={selectedNodeId || project.startNodeId}
          motionLevel={motionLevel}
          onClose={() => setIsPlayingPreview(false)}
        />
      )}

      {isExportModalOpen && (
        <ExportModal
          project={project}
          onUpdateProjectPerformance={(perf) =>
            updateProjectMeta({ performanceConfig: perf })
          }
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {isLauncherOpen && (
        <ProjectLauncher
          canClose={true}
          onOpenProject={(proj, savedStorage, requireManualSave) => {
            if (hasOpenProjectRef.current && isDirty && !window.confirm('当前工程有未保存的更改。放弃更改并打开另一个工程吗？')) return;
            hasOpenProjectRef.current = true;
            requireManualSaveRef.current = Boolean(requireManualSave);
            projectSessionRef.current += 1;
            currentProjectRef.current = proj;
            lastSavedProjectRef.current = savedStorage ? proj : null;
            savedPathRef.current = proj.projectPath;
            setSaveError(null);
            setSaveState(savedStorage || 'idle');
            setLastSavedAt(null);
            importProject(proj);
            setIsLauncherOpen(false);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onClose={() => setIsLauncherOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          project={project}
          onUpdateProject={updateProjectMeta}
          onClose={() => {
            setMotionLevel(loadSystemSettings().defaultGameSettings.motionLevel || 'subtle');
            setIsSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
export default App;
