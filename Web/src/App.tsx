import React, { useState, useRef, useEffect } from 'react';
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
  Play,
  Download,
  Undo2,
  Redo2,
  Smartphone,
  Monitor,
  Globe,
  FolderOpen,
} from 'lucide-react';
import { useEditor } from './hooks/useEditor';
import { MenuBar, WindowPanelDescriptor } from './components/MenuBar';
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
import { saveProjectToWorkspace } from './lib/workspaceManager';

const PANEL_TITLES: Record<PanelId, string> = {
  explorer: '工程资源与章节',
  node_library: '节点与积木库',
  canvas: '可视化节点画布',
  stage: '场景舞台',
  ui_customizer: '界面定制',
  ts_code: '多语言脚本 (TS/JS/Lua/Teal/Python)',
  yaml_code: 'YAML 剧本',
  inspector: '属性与积木检查器',
  characters: '角色好感表',
  ai_agent: 'AI 助手',
  terminal: '终端与编译诊断',
  asset_studio: '抠图与生图工坊',
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
  ratio: 0.18,
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
    ratio: 0.67,
    first: {
      kind: 'branch',
      id: 'center-v-1',
      direction: 'vertical',
      ratio: 0.72,
      first: {
        kind: 'leaf',
        id: 'leaf-center-top',
        tabs: ['canvas', 'stage', 'ts_code', 'yaml_code', 'ui_customizer', 'asset_studio'],
        activeTab: 'canvas',
      },
      second: {
        kind: 'leaf',
        id: 'leaf-center-bottom',
        tabs: ['terminal'],
        activeTab: 'terminal',
      },
    },
    second: {
      kind: 'leaf',
      id: 'leaf-right',
      tabs: ['inspector', 'ai_agent'],
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
    return { ...node, ratio: Math.max(0.14, Math.min(0.86, ratio)) };
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
      id: `leaf-${Date.now()}`,
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
      id: `leaf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tabs: [panelId],
      activeTab: panelId,
    };

    const direction: 'horizontal' | 'vertical' =
      zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical';
    const isFirst = zone === 'left' || zone === 'top';

    return {
      kind: 'branch',
      id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      direction,
      ratio: 0.5,
      first: isFirst ? newLeaf : leaf,
      second: isFirst ? leaf : newLeaf,
    };
  });

  return (
    updated || {
      kind: 'leaf',
      id: `leaf-${Date.now()}`,
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

  // 移动端智能检测（支持竖屏/横屏手机、触控设备自动识别，并支持手动切换手机版/电脑版）
  const detectMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const touchUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    return (
      window.innerWidth < 960 ||
      window.innerHeight < 540 ||
      (touchUA && window.innerWidth < 1280) ||
      Boolean(coarse && window.innerWidth < 1100)
    );
  };

  const [autoIsMobile, setAutoIsMobile] = useState<boolean>(detectMobileDevice);
  const [deviceModeOverride, setDeviceModeOverride] = useState<'auto' | 'mobile' | 'desktop'>('auto');
  const isMobile =
    deviceModeOverride === 'mobile'
      ? true
      : deviceModeOverride === 'desktop'
      ? false
      : autoIsMobile;
  const [mobileActivePanel, setMobileActivePanel] = useState<PanelId>('canvas');

  useEffect(() => {
    const onResize = () => {
      setAutoIsMobile(detectMobileDevice());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const updateProjectMeta = (patch: Partial<typeof project>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };

  const setAsStartNode = (id: string) => {
    setProject((prev) => ({ ...prev, startNodeId: id }));
  };

  const importProject = (proj: typeof project) => {
    setProject(proj);
  };

  // ==================== Recursive 2D Split Tree + Floating State ====================
  const [splitRoot, setSplitRoot] = useState<EditorSplitNode | null>(() =>
    createDefaultSplitTree()
  );
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowState[]>([]);
  const [topZ, setTopZ] = useState<number>(60);

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

  // Modals & Logs
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString().slice(0, 8)}] MooVN Engine 初始化完成：已挂载 /home/user/MooVN/MooVN_Workspace 全局磁盘目录`,
    `[${new Date().toLocaleTimeString().slice(0, 8)}] 流加载器就绪：提前解压 3 场景，经过 5 场景后自动释放旧场景内存，PNG 免二次重压缩已开启`,
  ]);

  // Convert a docked panel directly into a Floating Window
  const undockPanelToFloat = (
    panelId: PanelId,
    clientX = 240,
    clientY = 110,
    startDraggingImmediately = false
  ) => {
    const nextZ = topZ + 1;
    setTopZ(nextZ);
    setSplitRoot((prev) => removePanelFromSplitTree(prev, panelId));

    const defaultW =
      panelId === 'canvas' || panelId === 'stage' ? 680 : 480;
    const defaultH = panelId === 'terminal' ? 320 : 500;
    const newX = Math.max(48, Math.min(window.innerWidth - 320, clientX - 120));
    const newY = Math.max(42, Math.min(window.innerHeight - 180, clientY - 16));

    setFloatingWindows((prev) => {
      const exists = prev.find((w) => w.id === panelId);
      if (exists) {
        return prev.map((w) =>
          w.id === panelId ? { ...w, x: newX, y: newY, zIndex: nextZ } : w
        );
      }
      return [
        ...prev,
        {
          id: panelId,
          x: newX,
          y: newY,
          width: defaultW,
          height: defaultH,
          zIndex: nextZ,
        },
      ];
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

  // ==================== CONFLICT-FREE DRAG-TO-FLOAT & DRAG-TO-DOCK ====================
  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    // 1. Dragging a docked tab out (> 24px) smoothly detaches it into a Floating Window!
    if (pendingTabDragRef.current) {
      const dx = Math.abs(e.clientX - pendingTabDragRef.current.startX);
      const dy = Math.abs(e.clientY - pendingTabDragRef.current.startY);
      if (dx > 24 || dy > 24) {
        const pid = pendingTabDragRef.current.panelId;
        pendingTabDragRef.current = null;
        undockPanelToFloat(pid, e.clientX, e.clientY, true);
        return;
      }
    }

    // 2. Dragging a Floating Window: moves freely in open space; ONLY triggers hoverDropTarget when over a compact [data-dock-zone] button or tab header!
    if (draggingFloatingId) {
      setFloatingWindows((prev) =>
        prev.map((w) =>
          w.id === draggingFloatingId
            ? {
                ...w,
                x: Math.max(42, e.clientX - floatDragOffset.x),
                y: Math.max(36, e.clientY - floatDragOffset.y),
              }
            : w
        )
      );

      const zoneElements = document.querySelectorAll('[data-dock-zone]');
      let matched: {
        leafId: string;
        zone: DropZonePosition;
      } | null = null;

      zoneElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const leafId = el.getAttribute('data-dock-leaf') || '';
          const zone = (el.getAttribute('data-dock-zone') ||
            'center') as DropZonePosition;
          if (leafId) {
            matched = { leafId, zone };
          }
        }
      });

      setHoverDropTarget(matched);
      return;
    }

    // 3. Resizing a Floating Window from bottom-right corner
    if (resizingFloatRef.current) {
      const { panelId, startX, startY, startW, startH } =
        resizingFloatRef.current;
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      setFloatingWindows((prev) =>
        prev.map((w) =>
          w.id === panelId
            ? {
                ...w,
                width: Math.max(280, startW + dw),
                height: Math.max(200, startH + dh),
              }
            : w
        )
      );
      return;
    }

    // 4. Resizing a 2D Split Branch Sash
    if (resizingBranchRef.current) {
      const { branchId, direction, rect } = resizingBranchRef.current;
      const ratio =
        direction === 'horizontal'
          ? (e.clientX - rect.left) / Math.max(1, rect.width)
          : (e.clientY - rect.top) / Math.max(1, rect.height);
      setSplitRoot((prev) => updateBranchRatioInTree(prev, branchId, ratio));
    }
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
          />
        );
      case 'stage':
        return selectedNode ? (
          <SceneStageView
            node={selectedNode}
            characters={project.characters}
            uiConfig={project.uiConfig}
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
            onUpdateChapter={updateChapter}
          />
        ) : null;
      case 'ai_agent':
        return (
          <AiAssistantPanel
            project={project}
            selectedNodeId={selectedNodeId}
            onAddNode={(type) => addNode(type)}
            onUpdateNode={updateNode}
            onAppendDialogue={(speaker, text) => {
              if (!selectedNode) return;
              updateNode(selectedNode.id, (prev) => ({
                ...prev,
                dialogues: [
                  ...prev.dialogues,
                  {
                    id: `line-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 6)}`,
                    speakerId: speaker.includes('雪奈') ? 'yukina' : 'custom',
                    speakerName: speaker,
                    speakerColor: '#38bdf8',
                    text,
                  },
                ],
              }));
            }}
            onSwitchBackground={(bgId) => {
              if (!selectedNode) return;
              updateNode(selectedNode.id, (prev) => ({
                ...prev,
                backgroundId: bgId,
              }));
            }}
            onAddCharacter={() => {
              if (!selectedNode) return;
              addCharacterToNode(
                selectedNode.id,
                project.characters[0]?.id || 'yukina'
              );
            }}
            onAddChapter={addChapter}
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
                  title="点击切换标签 · 按住向外拖拽(>24px)可直接脱离为漂浮窗口"
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-[11px] cursor-grab active:cursor-grabbing transition shrink-0 ${
                    isActive
                      ? 'bg-[#141417] text-zinc-100 font-medium border-t-2 border-t-sky-400 border-x border-x-[#2b2b33]'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="truncate max-w-[115px]">
                    {PANEL_TITLES[tabId]}
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

          {/* Split Down / Split Right / Undock-to-Float Buttons */}
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

          {/* ====================================================================
              VS CODE COMPACT 5-WAY DOCK COMPASS OVERLAY
              Moving a floating window in open space NEVER accidentally docks!
              Only dropping onto one of the 5 central compass buttons or the Tab Header docks!
             ==================================================================== */}
          {draggingFloatingId && (
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
              {/* Glowing Blue Snap Preview showing exact 2D split area */}
              {isLeafHovered && hoverDropTarget && (
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
              )}

              {/* Compact 112x112 Central 5-Way Dock Compass */}
              <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-[#111116]/95 border border-zinc-500/80 shadow-2xl backdrop-blur-md">
                <div />
                <div
                  data-dock-leaf={leaf.id}
                  data-dock-zone="top"
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition ${
                    isLeafHovered && hoverDropTarget?.zone === 'top'
                      ? 'bg-sky-500 border-white text-zinc-950 scale-110 shadow-lg'
                      : 'bg-[#202028] border-zinc-600 text-zinc-200'
                  }`}
                  title="停靠到此分栏上方行"
                >
                  <ArrowUp className="w-4 h-4" />
                </div>
                <div />

                <div
                  data-dock-leaf={leaf.id}
                  data-dock-zone="left"
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition ${
                    isLeafHovered && hoverDropTarget?.zone === 'left'
                      ? 'bg-sky-500 border-white text-zinc-950 scale-110 shadow-lg'
                      : 'bg-[#202028] border-zinc-600 text-zinc-200'
                  }`}
                  title="停靠到此分栏左侧列"
                >
                  <ArrowLeft className="w-4 h-4" />
                </div>

                <div
                  data-dock-leaf={leaf.id}
                  data-dock-zone="center"
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition ${
                    isLeafHovered && hoverDropTarget?.zone === 'center'
                      ? 'bg-emerald-400 border-white text-zinc-950 scale-110 shadow-lg'
                      : 'bg-[#202028] border-zinc-600 text-zinc-200'
                  }`}
                  title="合并到此分栏标签页"
                >
                  <CircleDot className="w-4 h-4" />
                </div>

                <div
                  data-dock-leaf={leaf.id}
                  data-dock-zone="right"
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition ${
                    isLeafHovered && hoverDropTarget?.zone === 'right'
                      ? 'bg-sky-500 border-white text-zinc-950 scale-110 shadow-lg'
                      : 'bg-[#202028] border-zinc-600 text-zinc-200'
                  }`}
                  title="停靠到此分栏右侧列"
                >
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div />
                <div
                  data-dock-leaf={leaf.id}
                  data-dock-zone="bottom"
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition ${
                    isLeafHovered && hoverDropTarget?.zone === 'bottom'
                      ? 'bg-sky-500 border-white text-zinc-950 scale-110 shadow-lg'
                      : 'bg-[#202028] border-zinc-600 text-zinc-200'
                  }`}
                  title="停靠到此分栏下方行"
                >
                  <ArrowDown className="w-4 h-4" />
                </div>
                <div />
              </div>
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

        {/* Interactive Draggable Sash */}
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
          className={`${
            isHorizontal
              ? 'w-1 cursor-col-resize hover:bg-sky-500/60'
              : 'h-1 cursor-row-resize hover:bg-sky-500/60'
          } bg-[#1b1b20] shrink-0 transition z-20`}
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

  const panelDescriptors: WindowPanelDescriptor[] = ALL_WINDOW_IDS.map(
    (id) => ({
      id,
      title: PANEL_TITLES[id],
      docked: allLeaves.some((l) => l.tabs.includes(id)),
      floating: floatingWindows.some((f) => f.id === id),
    })
  );

  const isPanelActiveAnywhere = (id: PanelId) =>
    allLeaves.some((l) => l.activeTab === id) ||
    floatingWindows.some((f) => f.id === id);

  if (siteSection === 'portal') {
    return <OfficialPortal onEnterStudio={() => setSiteSection('studio')} />;
  }

  const isMobileMoreTab =
    mobileActivePanel === 'explorer' ||
    mobileActivePanel === 'node_library' ||
    mobileActivePanel === 'ai_agent' ||
    mobileActivePanel === 'asset_studio' ||
    mobileActivePanel === 'ui_customizer' ||
    mobileActivePanel === 'terminal';

  return (
    <div
      onMouseMove={isMobile ? undefined : handleGlobalMouseMove}
      onMouseUp={isMobile ? undefined : handleGlobalMouseUp}
      className={`h-[100dvh] w-full flex flex-col bg-[#111113] text-zinc-200 overflow-hidden ${
        isMobile ? '' : 'select-none'
      } ${editorTheme === 'light' ? 'theme-light' : ''}`}
    >
      {/* Desktop Top Studio MenuBar (hidden on phone so mobile gets a single clean phone header) */}
      {!isMobile && (
        <MenuBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          panels={panelDescriptors}
          onOpenOrFocusWindow={(id, mode) => {
            handleOpenOrFocusWindow(id, mode);
          }}
          onToggleDockFloat={handleToggleDockFloat}
          onApplyLayoutPreset={handleApplyLayoutPreset}
          onResetLayout={() => {
            setSplitRoot(createDefaultSplitTree());
            setFloatingWindows([]);
          }}
          onPlayPreview={() => setIsPlayingPreview(true)}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          onOpenProjectLauncher={() => setIsLauncherOpen(true)}
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
      )}

      {isMobile ? (
        /* ==================== DEDICATED MOBILE PHONE WORKBENCH ==================== */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0e1117]">
          {/* Single Compact Phone Top Header (48px) */}
          <header className="h-12 px-2.5 bg-[#141822] border-b border-[#252d3d] flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setIsLauncherOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#1d2433] border border-[#2f3a52] text-xs font-semibold text-sky-300 flex items-center gap-1 shrink-0 active:bg-[#263044]"
                title="打开或导入工程 (.mpvn)"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>工程</span>
              </button>

              <select
                value={selectedNodeId}
                onChange={(e) => setSelectedNodeId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-[#181e2b] border border-[#2b354b] text-xs text-zinc-100 truncate"
                title="切换当前剧情节点"
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
                disabled={!canUndo}
                onClick={undo}
                className="p-2 rounded-lg bg-[#1c2230] text-zinc-200 disabled:opacity-35"
                title="撤销"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={redo}
                className="p-2 rounded-lg bg-[#1c2230] text-zinc-200 disabled:opacity-35"
                title="重做"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsPlayingPreview(true)}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 active:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>试玩</span>
              </button>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600 active:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出</span>
              </button>
            </div>
          </header>

          {/* Sub-navigation when inside the 5th tab ("工具箱") */}
          {isMobileMoreTab && (
            <div className="shrink-0 bg-[#141923] border-b border-[#252e40] p-2 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'explorer' as PanelId, label: '章节与素材', icon: <FolderTree className="w-3.5 h-3.5" /> },
                  { id: 'node_library' as PanelId, label: '56类节点库', icon: <Blocks className="w-3.5 h-3.5" /> },
                  { id: 'ai_agent' as PanelId, label: 'AI 助手', icon: <Bot className="w-3.5 h-3.5" /> },
                  { id: 'asset_studio' as PanelId, label: '抠图与生图', icon: <Scissors className="w-3.5 h-3.5" /> },
                  { id: 'ui_customizer' as PanelId, label: 'UI 定制', icon: <Palette className="w-3.5 h-3.5" /> },
                  { id: 'terminal' as PanelId, label: '终端诊断', icon: <Terminal className="w-3.5 h-3.5" /> },
                ].map((tool) => {
                  const active = mobileActivePanel === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setMobileActivePanel(tool.id)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
                        active
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#1a202e] border-[#283246] text-zinc-300'
                      }`}
                    >
                      {tool.icon}
                      <span className="truncate">{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#222a3a]">
                <button
                  type="button"
                  onClick={() =>
                    setEditorTheme((t) => (t === 'dark' ? 'light' : 'dark'))
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#1a202e] border border-[#283246] text-[11px] text-zinc-200 flex items-center justify-center gap-1"
                >
                  {editorTheme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  <span>{editorTheme === 'dark' ? '浅色主题' : '深色主题'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#1a202e] border border-[#283246] text-[11px] text-zinc-200 flex items-center justify-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5 text-sky-400" />
                  <span>工程设置</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeviceModeOverride('desktop')}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#1a202e] border border-[#283246] text-[11px] text-zinc-200 flex items-center justify-center gap-1"
                >
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  <span>电脑分栏版</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      typeof window !== 'undefined' &&
                      window.location.pathname.includes('studio')
                    ) {
                      window.location.href = '/';
                    } else {
                      setSiteSection('portal');
                    }
                  }}
                  className="py-1.5 px-2.5 rounded-lg bg-[#1a202e] border border-[#283246] text-[11px] text-sky-300 flex items-center justify-center gap-1"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>官网</span>
                </button>
              </div>
            </div>
          )}

          {/* Mobile Active Workspace Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative flex flex-col">
            {mobileActivePanel === 'stage' && selectedNode ? (
              /* On phone portrait screens, pair the 16:9 Stage with an interactive Stage Director Drawer right underneath! */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="h-[46%] min-h-[210px] shrink-0 border-b border-[#252d3d]">
                  {renderPanelContent('stage')}
                </div>
                <div className="flex-1 overflow-y-auto p-3 bg-[#10141d] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300">
                      舞台快捷导演台 · {selectedNode.title}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        addCharacterToNode(
                          selectedNode.id,
                          project.characters[0]?.id || 'yukina'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-xs font-semibold"
                    >
                      + 添加登场立绘
                    </button>
                  </div>

                  {/* Quick Character Placement List */}
                  {selectedNode.characters.length > 0 ? (
                    <div className="space-y-2">
                      {selectedNode.characters.map((pl) => {
                        const charProf = project.characters.find(
                          (c) => c.id === pl.characterId
                        );
                        return (
                          <div
                            key={pl.id}
                            className="p-2.5 rounded-xl bg-[#161c28] border border-[#283246] flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <select
                                value={pl.characterId}
                                onChange={(e) => {
                                  const nextChar = project.characters.find(
                                    (c) => c.id === e.target.value
                                  );
                                  const firstExp = nextChar?.expressions?.[0];
                                  updateCharacterPlacement(selectedNode.id, pl.id, {
                                    characterId: e.target.value,
                                    name: nextChar?.name || pl.name,
                                    spriteId: firstExp?.spriteId || pl.spriteId,
                                    expressionLabel: firstExp?.label || pl.expressionLabel,
                                  });
                                }}
                                className="px-2 py-1 rounded bg-[#0d1118] border border-[#2c364c] text-xs text-zinc-100 font-semibold"
                              >
                                {project.characters.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={pl.spriteId}
                                onChange={(e) => {
                                  const exp = charProf?.expressions?.find(
                                    (x) => x.spriteId === e.target.value
                                  );
                                  updateCharacterPlacement(selectedNode.id, pl.id, {
                                    spriteId: e.target.value,
                                    expressionLabel: exp?.label || pl.expressionLabel,
                                  });
                                }}
                                className="flex-1 px-2 py-1 rounded bg-[#0d1118] border border-[#2c364c] text-xs text-sky-200"
                              >
                                {(charProf?.expressions || []).map((exp) => (
                                  <option key={exp.id} value={exp.spriteId}>
                                    差分: {exp.label}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() =>
                                  removeCharacterFromNode(selectedNode.id, pl.id)
                                }
                                className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 text-xs"
                              >
                                移除
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                              <label className="flex items-center gap-2">
                                <span className="shrink-0">水平 {Math.round(pl.x)}%</span>
                                <input
                                  type="range"
                                  min={10}
                                  max={90}
                                  value={pl.x}
                                  onChange={(e) =>
                                    updateCharacterPlacement(selectedNode.id, pl.id, {
                                      x: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label className="flex items-center gap-2">
                                <span className="shrink-0">
                                  缩放 {Math.round((pl.scale || 1) * 100)}%
                                </span>
                                <input
                                  type="range"
                                  min={50}
                                  max={150}
                                  value={Math.round((pl.scale || 1) * 100)}
                                  onChange={(e) =>
                                    updateCharacterPlacement(selectedNode.id, pl.id, {
                                      scale: Number(e.target.value) / 100,
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#151a24] border border-[#252e40] text-xs text-zinc-400 text-center">
                      当前节点暂无登场角色，点击上方「+ 添加登场立绘」或在舞台中直接拖拽。
                    </div>
                  )}

                  {/* Quick Current Dialogue Edit */}
                  <div className="p-2.5 rounded-xl bg-[#161c28] border border-[#283246] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        当前预览台词 ({selectedDialogueIndex + 1}/
                        {Math.max(1, selectedNode.dialogues.length)})
                      </span>
                      <button
                        type="button"
                        onClick={() => addDialogueLine(selectedNode.id)}
                        className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[11px]"
                      >
                        + 新增台词行
                      </button>
                    </div>
                    {selectedNode.dialogues[selectedDialogueIndex] && (
                      <>
                        <input
                          type="text"
                          value={
                            selectedNode.dialogues[selectedDialogueIndex]
                              .speakerName
                          }
                          onChange={(e) =>
                            updateDialogueLine(
                              selectedNode.id,
                              selectedNode.dialogues[selectedDialogueIndex].id,
                              { speakerName: e.target.value }
                            )
                          }
                          placeholder="说话人姓名"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0d1118] border border-[#2c364c] text-xs text-zinc-100"
                        />
                        <textarea
                          rows={2}
                          value={
                            selectedNode.dialogues[selectedDialogueIndex].text
                          }
                          onChange={(e) =>
                            updateDialogueLine(
                              selectedNode.id,
                              selectedNode.dialogues[selectedDialogueIndex].id,
                              { text: e.target.value }
                            )
                          }
                          placeholder="输入台词内容..."
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0d1118] border border-[#2c364c] text-xs text-zinc-100 resize-none"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {renderPanelContent(mobileActivePanel)}
              </div>
            )}
          </div>

          {/* Clean 5-Tab Phone Bottom Navigation Bar (Zero Horizontal Scroll) */}
          <nav className="h-14 bg-[#111520] border-t border-[#242c3d] grid grid-cols-5 items-center px-1 shrink-0">
            {[
              {
                id: 'canvas' as PanelId,
                label: '剧情流',
                icon: <Workflow className="w-4 h-4" />,
                active: mobileActivePanel === 'canvas',
              },
              {
                id: 'stage' as PanelId,
                label: '舞台',
                icon: <MonitorPlay className="w-4 h-4" />,
                active: mobileActivePanel === 'stage',
              },
              {
                id: 'inspector' as PanelId,
                label: '属性',
                icon: <Sliders className="w-4 h-4" />,
                active: mobileActivePanel === 'inspector',
              },
              {
                id: 'ts_code' as PanelId,
                label: '脚本',
                icon: <Code2 className="w-4 h-4" />,
                active: mobileActivePanel === 'ts_code',
              },
              {
                id: 'explorer' as PanelId,
                label: '工具箱',
                icon: <Blocks className="w-4 h-4" />,
                active: isMobileMoreTab,
              },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setMobileActivePanel(tab.id)}
                className={`h-11 mx-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition ${
                  tab.active
                    ? 'bg-gradient-to-b from-sky-500 to-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'text-zinc-400 active:text-zinc-100'
                }`}
              >
                {tab.icon}
                <span className="text-[11px] leading-none">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        /* Main Body: VS Code Left Activity Rail + Recursive 2D Multi-Row/Multi-Column Dock Grid */
        <div className="flex-1 flex overflow-hidden relative">
          {/* ==================== VS CODE LEFT ACTIVITY RAIL (40px) ==================== */}
          <aside className="w-10 bg-[#141417] border-r border-[#27272c] flex flex-col items-center justify-between py-2 shrink-0 z-40">
            <div className="flex flex-col items-center gap-1.5">
              {ACTIVITY_RAIL_ITEMS.map((item) => {
                const active = isPanelActiveAnywhere(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleOpenOrFocusWindow(item.id, 'dock')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenOrFocusWindow(item.id, 'float');
                    }}
                    title={`${item.label} (左键停靠打开 / 右键漂浮打开)`}
                    className={`relative w-8 h-8 rounded flex items-center justify-center transition ${
                      active
                        ? 'text-white bg-[#25252d]'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#1d1d23]'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-sky-400 rounded-r" />
                    )}
                    {item.icon}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              {/* Switch to Mobile Touch Layout anytime */}
              <button
                onClick={() => setDeviceModeOverride('mobile')}
                title="切换为手机触控布局"
                className="w-8 h-8 rounded flex items-center justify-center text-sky-400 hover:text-sky-200 hover:bg-[#1d1d23] transition"
              >
                <Smartphone className="w-4 h-4" strokeWidth={1.7} />
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
                title="系统与全局目录设置"
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
                  const nextZ = topZ + 1;
                  setTopZ(nextZ);
                  setFloatingWindows((prev) =>
                    prev.map((w) =>
                      w.id === fw.id ? { ...w, zIndex: nextZ } : w
                    )
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
                {/* Floating Window Draggable Title Bar */}
                <div
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    setDraggingFloatingId(fw.id);
                    setFloatDragOffset({
                      x: e.clientX - fw.x,
                      y: e.clientY - fw.y,
                    });
                  }}
                  className="h-8 bg-[#202027] border-b border-[#2e2e38] px-3 flex items-center justify-between cursor-move shrink-0"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100 min-w-0">
                    <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{PANEL_TITLES[fw.id]}</span>
                    <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[10px] font-normal shrink-0">
                      自由漂浮 · 拖入中央罗盘即停靠
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleDockFloat(fw.id)}
                      className="px-1.5 py-0.5 rounded bg-[#2c2c36] hover:bg-sky-500 hover:text-zinc-950 text-[10px] text-zinc-200 flex items-center gap-1 transition"
                      title="直接停靠回工作区网格"
                    >
                      <Minimize2 className="w-3 h-3" strokeWidth={1.6} />
                      停靠
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

      {/* Bottom Status Bar (Desktop only) */}
      {!isMobile && <StatusBar project={project} selectedNode={selectedNode} />}

      {/* Modals */}
      {isPlayingPreview && (
        <PreviewPlayer
          project={project}
          initialNodeId={selectedNodeId || project.startNodeId}
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

      {isSettingsOpen && (
        <SettingsModal
          project={project}
          onUpdateProject={updateProjectMeta}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isLauncherOpen && (
        <ProjectLauncher
          canClose={true}
          onOpenProject={(proj) => {
            importProject(proj);
            saveProjectToWorkspace(proj);
            setIsLauncherOpen(false);
          }}
          onClose={() => setIsLauncherOpen(false)}
        />
      )}
    </div>
  );
}
export default App;
