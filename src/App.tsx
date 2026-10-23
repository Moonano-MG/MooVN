import React, { useState, useRef } from 'react';
import {
  X,
  ExternalLink,
  Minimize2,
  SplitSquareVertical,
  SplitSquareHorizontal,
  GripHorizontal,
  FolderTree,
  Workflow,
  MonitorPlay,
  Code2,
  Wand2,
  Palette,
  Bot,
  Terminal as TerminalIcon,
  Settings,
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
import { PanelId } from './types';
import { saveProjectToWorkspace } from './lib/workspaceManager';

const PANEL_TITLES: Record<PanelId, string> = {
  explorer: '章节与目录',
  node_library: '节点库',
  canvas: '节点画布',
  stage: '场景舞台',
  ui_customizer: '界面定制',
  ts_code: '脚本编辑器',
  yaml_code: 'YAML 剧本',
  inspector: '节点属性',
  characters: '角色好感表',
  ai_agent: 'AI 助手',
  terminal: '终端',
  asset_studio: '抠图与生图',
  settings: '系统设置',
};

const ALL_WINDOW_IDS: PanelId[] = [
  'node_library',
  'explorer',
  'canvas',
  'stage',
  'inspector',
  'ts_code',
  'terminal',
  'ai_agent',
  'asset_studio',
  'ui_customizer',
];

const ACTIVITY_RAIL_ITEMS: {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'node_library',
    label: '节点库与工程章节',
    icon: <FolderTree className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'canvas',
    label: '节点画布',
    icon: <Workflow className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'stage',
    label: '场景舞台',
    icon: <MonitorPlay className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ts_code',
    label: '脚本编辑器 (JS/TS)',
    icon: <Code2 className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'asset_studio',
    label: '智能抠图与 AI 生图',
    icon: <Wand2 className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ui_customizer',
    label: '游戏界面定制',
    icon: <Palette className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'ai_agent',
    label: 'AI 助手窗口',
    icon: <Bot className="w-4 h-4" strokeWidth={1.7} />,
  },
  {
    id: 'terminal',
    label: '终端与 tsc 诊断',
    icon: <TerminalIcon className="w-4 h-4" strokeWidth={1.7} />,
  },
];

export interface DockCell {
  id: string;
  tabs: PanelId[];
  activeTab: PanelId;
  heightRatio: number;
}

export interface DockColumn {
  id: string;
  widthRatio: number;
  cells: DockCell[];
}

export interface FloatingWindowState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

type DropZonePosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

const createDefaultColumns = (): DockColumn[] => [
  {
    id: 'col-left',
    widthRatio: 19,
    cells: [
      {
        id: 'cell-left',
        tabs: ['node_library', 'explorer'],
        activeTab: 'node_library',
        heightRatio: 100,
      },
    ],
  },
  {
    id: 'col-center',
    widthRatio: 55,
    cells: [
      {
        id: 'cell-main',
        tabs: ['canvas', 'stage', 'ts_code'],
        activeTab: 'canvas',
        heightRatio: 100,
      },
    ],
  },
  {
    id: 'col-right',
    widthRatio: 26,
    cells: [
      {
        id: 'cell-inspector',
        tabs: ['inspector'],
        activeTab: 'inspector',
        heightRatio: 100,
      },
    ],
  },
];

export function App() {
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

  const updateProjectMeta = (patch: Partial<typeof project>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };

  const setAsStartNode = (id: string) => {
    setProject((prev) => ({ ...prev, startNodeId: id }));
  };

  const importProject = (proj: typeof project) => {
    setProject(proj);
  };

  // ==================== 2D Grid Dock + Floating State ====================
  const [columns, setColumns] = useState<DockColumn[]>(createDefaultColumns);
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowState[]>([]);
  const [topZ, setTopZ] = useState<number>(60);

  const [draggingFloatingId, setDraggingFloatingId] = useState<PanelId | null>(null);
  const [floatDragOffset, setFloatDragOffset] = useState({ x: 0, y: 0 });
  const [hoverDropTarget, setHoverDropTarget] = useState<{
    colId: string;
    cellId: string;
    zone: DropZonePosition;
  } | null>(null);

  const pendingTabDragRef = useRef<{
    panelId: PanelId;
    startX: number;
    startY: number;
  } | null>(null);

  const resizingColRef = useRef<{
    colIndex: number;
    startX: number;
    startLeftRatio: number;
    startRightRatio: number;
  } | null>(null);

  const resizingRowRef = useRef<{
    colId: string;
    cellIndex: number;
    startY: number;
    startTopRatio: number;
    startBottomRatio: number;
  } | null>(null);

  // Modals & Logs
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString().slice(0, 8)}] MooVN Engine 就绪：全局目录 /home/user/MooVN/MooVN_Workspace 已挂载`,
    `[${new Date().toLocaleTimeString().slice(0, 8)}] 场景流加载器：预载 3 场景 / 卸载 5 场景前，PNG 免二次重压缩已开启`,
  ]);

  // Remove a panelId from all docked cells
  const removePanelFromDock = (
    cols: DockColumn[],
    panelId: PanelId
  ): DockColumn[] => {
    return cols
      .map((col) => {
        const nextCells = col.cells
          .map((cell) => {
            if (!cell.tabs.includes(panelId)) return cell;
            const remaining = cell.tabs.filter((t) => t !== panelId);
            if (remaining.length === 0) return null;
            return {
              ...cell,
              tabs: remaining,
              activeTab:
                cell.activeTab === panelId ? remaining[0] : cell.activeTab,
            };
          })
          .filter((c): c is DockCell => c !== null);

        if (nextCells.length === 0) return null;
        return { ...col, cells: nextCells };
      })
      .filter((col): col is DockColumn => col !== null);
  };

  // Smoothly convert a docked panel directly into a Floating Window
  const undockPanelToFloat = (
    panelId: PanelId,
    clientX = 260,
    clientY = 100,
    startDraggingImmediately = false
  ) => {
    const nextZ = topZ + 1;
    setTopZ(nextZ);
    setColumns((prev) => removePanelFromDock(prev, panelId));
    setFloatingWindows((prev) => {
      const exists = prev.find((f) => f.id === panelId);
      const win: FloatingWindowState = exists
        ? {
            ...exists,
            x: Math.max(48, clientX - 150),
            y: Math.max(40, clientY - 14),
            zIndex: nextZ,
          }
        : {
            id: panelId,
            x: Math.max(48, clientX - 160),
            y: Math.max(42, clientY - 14),
            width:
              panelId === 'ai_agent'
                ? 440
                : panelId === 'terminal'
                ? 660
                : 580,
            height: panelId === 'terminal' ? 300 : 460,
            zIndex: nextZ,
          };
      return [...prev.filter((f) => f.id !== panelId), win];
    });

    if (startDraggingImmediately) {
      setDraggingFloatingId(panelId);
      setFloatDragOffset({ x: 160, y: 14 });
    }
  };

  // Dock a floating (or docked) panel into a target cell & zone in the 2D grid
  const dockPanelIntoTarget = (
    panelId: PanelId,
    targetColId: string,
    targetCellId: string,
    zone: DropZonePosition
  ) => {
    setFloatingWindows((prev) => prev.filter((f) => f.id !== panelId));

    setColumns((prev) => {
      const cleaned = removePanelFromDock(prev, panelId);
      if (cleaned.length === 0) {
        return [
          {
            id: `col-${Date.now()}`,
            widthRatio: 100,
            cells: [
              {
                id: `cell-${Date.now()}`,
                tabs: [panelId],
                activeTab: panelId,
                heightRatio: 100,
              },
            ],
          },
        ];
      }

      if (zone === 'left' || zone === 'right') {
        const colIdx = cleaned.findIndex((c) => c.id === targetColId);
        const newCol: DockColumn = {
          id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          widthRatio: 28,
          cells: [
            {
              id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              tabs: [panelId],
              activeTab: panelId,
              heightRatio: 100,
            },
          ],
        };
        const insertAt =
          colIdx === -1
            ? cleaned.length
            : zone === 'left'
            ? colIdx
            : colIdx + 1;
        const copy = [...cleaned];
        copy.splice(insertAt, 0, newCol);
        return copy;
      }

      return cleaned.map((col) => {
        if (col.id !== targetColId) return col;

        if (zone === 'center') {
          return {
            ...col,
            cells: col.cells.map((cell) =>
              cell.id === targetCellId
                ? {
                    ...cell,
                    tabs: cell.tabs.includes(panelId)
                      ? cell.tabs
                      : [...cell.tabs, panelId],
                    activeTab: panelId,
                  }
                : cell
            ),
          };
        }

        // 'top' or 'bottom': split vertically inside this column!
        const cellIdx = col.cells.findIndex((c) => c.id === targetCellId);
        const newCell: DockCell = {
          id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          tabs: [panelId],
          activeTab: panelId,
          heightRatio: 50,
        };
        const nextCells = [...col.cells];
        const insertIdx =
          cellIdx === -1
            ? nextCells.length
            : zone === 'top'
            ? cellIdx
            : cellIdx + 1;
        nextCells.splice(insertIdx, 0, newCell);
        return { ...col, cells: nextCells };
      });
    });
  };

  const handleToggleDockFloat = (panelId: PanelId) => {
    const isFloating = floatingWindows.some((f) => f.id === panelId);
    if (isFloating) {
      const targetCol = columns[columns.length - 1] || columns[0];
      const targetCell = targetCol?.cells[0];
      if (targetCol && targetCell) {
        dockPanelIntoTarget(panelId, targetCol.id, targetCell.id, 'center');
      } else {
        dockPanelIntoTarget(panelId, 'col-init', 'cell-init', 'center');
      }
    } else {
      undockPanelToFloat(panelId, 280, 110, false);
    }
  };

  const handleOpenOrFocusWindow = (
    panelId: PanelId,
    mode: 'dock' | 'float' = 'dock'
  ) => {
    if (mode === 'float') {
      undockPanelToFloat(panelId, 280, 110, false);
      return;
    }

    const alreadyDocked = columns.some((col) =>
      col.cells.some((c) => c.tabs.includes(panelId))
    );
    if (alreadyDocked) {
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          cells: col.cells.map((cell) =>
            cell.tabs.includes(panelId) ? { ...cell, activeTab: panelId } : cell
          ),
        }))
      );
      return;
    }

    const targetCol =
      panelId === 'terminal'
        ? columns[1] || columns[0]
        : panelId === 'ai_agent' || panelId === 'inspector'
        ? columns[columns.length - 1] || columns[0]
        : columns[1] || columns[0];
    const targetCell = targetCol?.cells[0];
    if (targetCol && targetCell) {
      dockPanelIntoTarget(
        panelId,
        targetCol.id,
        targetCell.id,
        panelId === 'terminal' ? 'bottom' : 'center'
      );
    } else {
      dockPanelIntoTarget(panelId, 'col-init', 'cell-init', 'center');
    }
  };

  const handleApplyLayoutPreset = (
    preset: 'default_ide' | 'quad_2x2' | 'multi_col_4' | 'canvas_stage_terminal'
  ) => {
    setFloatingWindows([]);
    if (preset === 'quad_2x2') {
      setColumns([
        {
          id: 'col-q1',
          widthRatio: 50,
          cells: [
            {
              id: 'cell-a',
              tabs: ['canvas', 'node_library'],
              activeTab: 'canvas',
              heightRatio: 55,
            },
            {
              id: 'cell-b',
              tabs: ['ts_code', 'terminal'],
              activeTab: 'ts_code',
              heightRatio: 45,
            },
          ],
        },
        {
          id: 'col-q2',
          widthRatio: 50,
          cells: [
            {
              id: 'cell-c',
              tabs: ['stage', 'asset_studio'],
              activeTab: 'stage',
              heightRatio: 55,
            },
            {
              id: 'cell-d',
              tabs: ['inspector', 'ai_agent'],
              activeTab: 'inspector',
              heightRatio: 45,
            },
          ],
        },
      ]);
    } else if (preset === 'multi_col_4') {
      setColumns([
        {
          id: 'col-1',
          widthRatio: 17,
          cells: [
            {
              id: 'c-1',
              tabs: ['node_library', 'explorer'],
              activeTab: 'node_library',
              heightRatio: 100,
            },
          ],
        },
        {
          id: 'col-2',
          widthRatio: 33,
          cells: [
            {
              id: 'c-2',
              tabs: ['canvas'],
              activeTab: 'canvas',
              heightRatio: 100,
            },
          ],
        },
        {
          id: 'col-3',
          widthRatio: 28,
          cells: [
            {
              id: 'c-3a',
              tabs: ['stage', 'asset_studio'],
              activeTab: 'stage',
              heightRatio: 65,
            },
            {
              id: 'c-3b',
              tabs: ['terminal'],
              activeTab: 'terminal',
              heightRatio: 35,
            },
          ],
        },
        {
          id: 'col-4',
          widthRatio: 22,
          cells: [
            {
              id: 'c-4',
              tabs: ['inspector', 'ai_agent'],
              activeTab: 'inspector',
              heightRatio: 100,
            },
          ],
        },
      ]);
    } else if (preset === 'canvas_stage_terminal') {
      setColumns([
        {
          id: 'col-left',
          widthRatio: 48,
          cells: [
            {
              id: 'c-top-l',
              tabs: ['canvas', 'node_library'],
              activeTab: 'canvas',
              heightRatio: 68,
            },
            {
              id: 'c-bot-l',
              tabs: ['terminal'],
              activeTab: 'terminal',
              heightRatio: 32,
            },
          ],
        },
        {
          id: 'col-mid',
          widthRatio: 30,
          cells: [
            {
              id: 'c-top-m',
              tabs: ['stage', 'asset_studio'],
              activeTab: 'stage',
              heightRatio: 68,
            },
            {
              id: 'c-bot-m',
              tabs: ['ts_code'],
              activeTab: 'ts_code',
              heightRatio: 32,
            },
          ],
        },
        {
          id: 'col-right',
          widthRatio: 22,
          cells: [
            {
              id: 'c-r1',
              tabs: ['inspector'],
              activeTab: 'inspector',
              heightRatio: 55,
            },
            {
              id: 'c-r2',
              tabs: ['ai_agent'],
              activeTab: 'ai_agent',
              heightRatio: 45,
            },
          ],
        },
      ]);
    } else {
      setColumns(createDefaultColumns());
    }
  };

  // ==================== COORDINATE-BASED DRAG-TO-FLOAT & DRAG-TO-DOCK ====================
  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    // 1. If dragging a docked tab out (> 22px), smoothly detach it into a Floating Window!
    if (pendingTabDragRef.current) {
      const dx = Math.abs(e.clientX - pendingTabDragRef.current.startX);
      const dy = Math.abs(e.clientY - pendingTabDragRef.current.startY);
      if (dx > 22 || dy > 22) {
        const pid = pendingTabDragRef.current.panelId;
        pendingTabDragRef.current = null;
        undockPanelToFloat(pid, e.clientX, e.clientY, true);
        return;
      }
    }

    // 2. If dragging a Floating Window, update its position AND hit-test [data-dock-zone] elements via getBoundingClientRect()
    if (draggingFloatingId) {
      setFloatingWindows((prev) =>
        prev.map((w) =>
          w.id === draggingFloatingId
            ? {
                ...w,
                x: Math.max(42, e.clientX - floatDragOffset.x),
                y: Math.max(38, e.clientY - floatDragOffset.y),
              }
            : w
        )
      );

      // Hit-test all [data-dock-zone] elements directly by screen coordinates (never blocked by the floating window!)
      const zoneElements = document.querySelectorAll('[data-dock-zone]');
      let matched: {
        colId: string;
        cellId: string;
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
          const colId = el.getAttribute('data-dock-col') || '';
          const cellId = el.getAttribute('data-dock-cell') || '';
          const zone = (el.getAttribute('data-dock-zone') ||
            'center') as DropZonePosition;
          if (colId && cellId) {
            matched = { colId, cellId, zone };
          }
        }
      });

      setHoverDropTarget(matched);
    }

    // 3. Column horizontal resize
    if (resizingColRef.current) {
      const { colIndex, startX, startLeftRatio, startRightRatio } =
        resizingColRef.current;
      const deltaPercent = ((e.clientX - startX) / window.innerWidth) * 100;
      const newLeft = Math.max(12, Math.min(75, startLeftRatio + deltaPercent));
      const newRight = Math.max(
        12,
        Math.min(75, startRightRatio - deltaPercent)
      );
      setColumns((prev) =>
        prev.map((col, idx) =>
          idx === colIndex
            ? { ...col, widthRatio: newLeft }
            : idx === colIndex + 1
            ? { ...col, widthRatio: newRight }
            : col
        )
      );
    }

    // 4. Row vertical resize inside a column
    if (resizingRowRef.current) {
      const { colId, cellIndex, startY, startTopRatio, startBottomRatio } =
        resizingRowRef.current;
      const deltaPercent =
        ((e.clientY - startY) / (window.innerHeight - 66)) * 100;
      const newTop = Math.max(15, Math.min(85, startTopRatio + deltaPercent));
      const newBottom = Math.max(
        15,
        Math.min(85, startBottomRatio - deltaPercent)
      );
      setColumns((prev) =>
        prev.map((col) =>
          col.id !== colId
            ? col
            : {
                ...col,
                cells: col.cells.map((cell, idx) =>
                  idx === cellIndex
                    ? { ...cell, heightRatio: newTop }
                    : idx === cellIndex + 1
                    ? { ...cell, heightRatio: newBottom }
                    : cell
                ),
              }
        )
      );
    }
  };

  const handleGlobalMouseUp = () => {
    pendingTabDragRef.current = null;
    resizingColRef.current = null;
    resizingRowRef.current = null;

    if (draggingFloatingId) {
      if (hoverDropTarget) {
        dockPanelIntoTarget(
          draggingFloatingId,
          hoverDropTarget.colId,
          hoverDropTarget.cellId,
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
            onSelectNode={setSelectedNodeId}
            onAddChapter={addChapter}
            onAddNode={(type) => addNode(type)}
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

  const panelDescriptors: WindowPanelDescriptor[] = ALL_WINDOW_IDS.map(
    (id) => ({
      id,
      title: PANEL_TITLES[id],
      docked: columns.some((col) =>
        col.cells.some((c) => c.tabs.includes(id))
      ),
      floating: floatingWindows.some((f) => f.id === id),
    })
  );

  const isPanelActiveAnywhere = (id: PanelId) =>
    columns.some((col) => col.cells.some((c) => c.activeTab === id)) ||
    floatingWindows.some((f) => f.id === id);

  return (
    <div
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
      className="h-screen w-screen flex flex-col bg-[#111113] text-zinc-200 overflow-hidden select-none"
    >
      {/* Clean Top Studio MenuBar */}
      <MenuBar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        panels={panelDescriptors}
        onOpenOrFocusWindow={handleOpenOrFocusWindow}
        onToggleDockFloat={handleToggleDockFloat}
        onApplyLayoutPreset={handleApplyLayoutPreset}
        onResetLayout={() => {
          setColumns(createDefaultColumns());
          setFloatingWindows([]);
        }}
        onPlayPreview={() => setIsPlayingPreview(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenProjectLauncher={() => setIsLauncherOpen(true)}
      />

      {/* Main Body: VS Code Left Activity Rail + 2D Multi-Row/Multi-Column Dock Grid */}
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
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-zinc-100 rounded-r" />
                  )}
                  {item.icon}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="系统与全局目录设置"
              className="w-8 h-8 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-[#1d1d23] transition"
            >
              <Settings className="w-4 h-4" strokeWidth={1.7} />
            </button>
          </div>
        </aside>

        {/* ==================== 2D MULTI-COLUMN & MULTI-ROW DOCK WORKBENCH ==================== */}
        <div className="flex-1 flex overflow-hidden relative">
          {columns.length === 0 && (
            <div
              data-dock-col="col-empty"
              data-dock-cell="cell-empty"
              data-dock-zone="center"
              className="flex-1 flex items-center justify-center text-zinc-500 text-xs"
            >
              拖入任意漂浮窗口至此区域即可恢复停靠，或点击左侧图标栏打开窗口
            </div>
          )}

          {columns.map((col, colIndex) => {
            const totalWidth =
              columns.reduce((s, c) => s + c.widthRatio, 0) || 100;
            const colWidthPercent = (col.widthRatio / totalWidth) * 100;
            const totalCellHeight =
              col.cells.reduce((s, c) => s + c.heightRatio, 0) || 100;

            return (
              <React.Fragment key={col.id}>
                <div
                  style={{ width: `${colWidthPercent}%` }}
                  className="h-full flex flex-col overflow-hidden"
                >
                  {col.cells.map((cell, cellIndex) => {
                    const cellHeightPercent =
                      (cell.heightRatio / totalCellHeight) * 100;
                    const activePanel = cell.activeTab;
                    const isCellHovered = hoverDropTarget?.cellId === cell.id;

                    return (
                      <React.Fragment key={cell.id}>
                        <div
                          style={{ height: `${cellHeightPercent}%` }}
                          className="relative flex flex-col overflow-hidden bg-[#141417] border-r border-b border-[#242429]"
                        >
                          {/* Docked Cell Tab Header (also acts as a 'center' merge drop zone!) */}
                          <div
                            data-dock-col={col.id}
                            data-dock-cell={cell.id}
                            data-dock-zone="center"
                            className="h-7 bg-[#18181c] border-b border-[#27272c] px-1.5 flex items-center justify-between shrink-0"
                          >
                            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                              {cell.tabs.map((tabId) => {
                                const isActive = tabId === activePanel;
                                return (
                                  <div
                                    key={tabId}
                                    onMouseDown={(e) => {
                                      setColumns((prev) =>
                                        prev.map((c) =>
                                          c.id !== col.id
                                            ? c
                                            : {
                                                ...c,
                                                cells: c.cells.map((ce) =>
                                                  ce.id === cell.id
                                                    ? { ...ce, activeTab: tabId }
                                                    : ce
                                                ),
                                              }
                                        )
                                      );
                                      pendingTabDragRef.current = {
                                        panelId: tabId,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                      };
                                    }}
                                    title="按住向窗外拖拽可直接脱离为漂浮窗口"
                                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-[11px] cursor-grab active:cursor-grabbing transition ${
                                      isActive
                                        ? 'bg-[#141417] text-zinc-100 font-medium border-t border-x border-[#2b2b33]'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                  >
                                    <span className="truncate max-w-[110px]">
                                      {PANEL_TITLES[tabId]}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setColumns((prev) =>
                                          removePanelFromDock(prev, tabId)
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
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => {
                                  const candidate: PanelId =
                                    activePanel === 'canvas'
                                      ? 'terminal'
                                      : activePanel === 'stage'
                                      ? 'ts_code'
                                      : 'ai_agent';
                                  dockPanelIntoTarget(
                                    candidate,
                                    col.id,
                                    cell.id,
                                    'bottom'
                                  );
                                }}
                                className="icon-btn !w-5 !h-5"
                                title="向下分栏 (在此列下方新增一行窗口)"
                              >
                                <SplitSquareVertical
                                  className="w-3 h-3"
                                  strokeWidth={1.6}
                                />
                              </button>

                              <button
                                onClick={() => {
                                  const candidate: PanelId =
                                    activePanel === 'canvas'
                                      ? 'stage'
                                      : 'ai_agent';
                                  dockPanelIntoTarget(
                                    candidate,
                                    col.id,
                                    cell.id,
                                    'right'
                                  );
                                }}
                                className="icon-btn !w-5 !h-5"
                                title="向右分栏 (在右侧新增一列窗口)"
                              >
                                <SplitSquareHorizontal
                                  className="w-3 h-3"
                                  strokeWidth={1.6}
                                />
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
                                title="切换为漂浮窗口"
                              >
                                <ExternalLink
                                  className="w-3 h-3"
                                  strokeWidth={1.6}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Active Panel Body */}
                          <div className="flex-1 overflow-hidden relative">
                            {renderPanelContent(activePanel)}

                            {/* ==================== VS CODE 5-ZONE DOCK TARGET COMPASS & SNAP PREVIEW ==================== */}
                            {draggingFloatingId && (
                              <div className="absolute inset-0 z-50 pointer-events-none">
                                {/* Glowing Blue Snap Preview showing exact area where window will dock */}
                                {isCellHovered && (
                                  <div
                                    className={`absolute bg-sky-500/25 border-2 border-sky-400 rounded transition-all duration-75 ${
                                      hoverDropTarget?.zone === 'top'
                                        ? 'top-0 left-0 right-0 h-1/2'
                                        : hoverDropTarget?.zone === 'bottom'
                                        ? 'bottom-0 left-0 right-0 h-1/2'
                                        : hoverDropTarget?.zone === 'left'
                                        ? 'top-0 bottom-0 left-0 w-1/2'
                                        : hoverDropTarget?.zone === 'right'
                                        ? 'top-0 bottom-0 right-0 w-1/2'
                                        : 'inset-0'
                                    }`}
                                  />
                                )}

                                {/* 5 Hit-Test Dock Zones (evaluated via getBoundingClientRect in handleGlobalMouseMove) */}
                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-4 gap-2">
                                  <div />
                                  <div
                                    data-dock-col={col.id}
                                    data-dock-cell={cell.id}
                                    data-dock-zone="top"
                                    className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-semibold transition ${
                                      isCellHovered &&
                                      hoverDropTarget?.zone === 'top'
                                        ? 'bg-sky-500/45 border-sky-200 text-white scale-105 shadow-lg'
                                        : 'bg-zinc-950/70 border-zinc-500/70 text-zinc-200'
                                    }`}
                                  >
                                    ↑ 停靠到上方行
                                  </div>
                                  <div />

                                  <div
                                    data-dock-col={col.id}
                                    data-dock-cell={cell.id}
                                    data-dock-zone="left"
                                    className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-semibold transition ${
                                      isCellHovered &&
                                      hoverDropTarget?.zone === 'left'
                                        ? 'bg-sky-500/45 border-sky-200 text-white scale-105 shadow-lg'
                                        : 'bg-zinc-950/70 border-zinc-500/70 text-zinc-200'
                                    }`}
                                  >
                                    ← 停靠为左列
                                  </div>

                                  <div
                                    data-dock-col={col.id}
                                    data-dock-cell={cell.id}
                                    data-dock-zone="center"
                                    className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-semibold transition ${
                                      isCellHovered &&
                                      hoverDropTarget?.zone === 'center'
                                        ? 'bg-emerald-500/45 border-emerald-200 text-white scale-105 shadow-lg'
                                        : 'bg-zinc-950/70 border-zinc-500/70 text-zinc-200'
                                    }`}
                                  >
                                    ● 合并到此标签
                                  </div>

                                  <div
                                    data-dock-col={col.id}
                                    data-dock-cell={cell.id}
                                    data-dock-zone="right"
                                    className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-semibold transition ${
                                      isCellHovered &&
                                      hoverDropTarget?.zone === 'right'
                                        ? 'bg-sky-500/45 border-sky-200 text-white scale-105 shadow-lg'
                                        : 'bg-zinc-950/70 border-zinc-500/70 text-zinc-200'
                                    }`}
                                  >
                                    → 停靠为右列
                                  </div>

                                  <div />
                                  <div
                                    data-dock-col={col.id}
                                    data-dock-cell={cell.id}
                                    data-dock-zone="bottom"
                                    className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-semibold transition ${
                                      isCellHovered &&
                                      hoverDropTarget?.zone === 'bottom'
                                        ? 'bg-sky-500/45 border-sky-200 text-white scale-105 shadow-lg'
                                        : 'bg-zinc-950/70 border-zinc-500/70 text-zinc-200'
                                    }`}
                                  >
                                    ↓ 停靠到下方行
                                  </div>
                                  <div />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Vertical Row Resizer inside Column */}
                        {cellIndex < col.cells.length - 1 && (
                          <div
                            onMouseDown={(e) => {
                              resizingRowRef.current = {
                                colId: col.id,
                                cellIndex,
                                startY: e.clientY,
                                startTopRatio: cell.heightRatio,
                                startBottomRatio:
                                  col.cells[cellIndex + 1].heightRatio,
                              };
                            }}
                            className="h-1 bg-[#1b1b20] hover:bg-sky-500/60 cursor-row-resize shrink-0 transition"
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Horizontal Column Resizer */}
                {colIndex < columns.length - 1 && (
                  <div
                    onMouseDown={(e) => {
                      resizingColRef.current = {
                        colIndex,
                        startX: e.clientX,
                        startLeftRatio: col.widthRatio,
                        startRightRatio: columns[colIndex + 1].widthRatio,
                      };
                    }}
                    className="w-1 bg-[#1b1b20] hover:bg-sky-500/60 cursor-col-resize shrink-0 transition"
                  />
                )}
              </React.Fragment>
            );
          })}

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
                    ? 'opacity-75 border-sky-400 scale-[0.98]'
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
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                    <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{PANEL_TITLES[fw.id]}</span>
                    <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[10px] font-normal">
                      漂浮 · 拖入停靠区松手即可停靠
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleDockFloat(fw.id)}
                      className="px-1.5 py-0.5 rounded bg-[#2c2c36] hover:bg-[#383844] text-[10px] text-zinc-200 flex items-center gap-1"
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

                <div className="flex-1 overflow-hidden">
                  {renderPanelContent(fw.id)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar project={project} selectedNode={selectedNode} />

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
