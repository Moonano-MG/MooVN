import React, { useState, useRef } from 'react';
import {
  X,
  ExternalLink,
  Minimize2,
  SplitSquareVertical,
  SplitSquareHorizontal,
  GripHorizontal,
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
  explorer: '工程资源与章节',
  node_library: '节点库',
  canvas: '节点画布',
  stage: '场景舞台',
  ui_customizer: '界面定制',
  ts_code: '脚本编辑器 (JS/TS)',
  yaml_code: 'YAML 剧本',
  inspector: '属性检查器',
  characters: '角色好感表',
  ai_agent: 'AI 助手',
  terminal: '终端与编译诊断',
  asset_studio: '抠图与 AI 生图',
  settings: '系统设置',
};

const ALL_WINDOW_IDS: PanelId[] = [
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

export interface DockCell {
  id: string;
  tabs: PanelId[];
  activeTab: PanelId;
  heightRatio: number; // relative weight in column
}

export interface DockColumn {
  id: string;
  widthRatio: number; // relative weight in row
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
    widthRatio: 18,
    cells: [
      {
        id: 'cell-explorer',
        tabs: ['explorer'],
        activeTab: 'explorer',
        heightRatio: 100,
      },
    ],
  },
  {
    id: 'col-center',
    widthRatio: 56,
    cells: [
      {
        id: 'cell-main',
        tabs: ['canvas', 'stage', 'ts_code', 'asset_studio', 'ui_customizer'],
        activeTab: 'canvas',
        heightRatio: 72,
      },
      {
        id: 'cell-bottom',
        tabs: ['terminal'],
        activeTab: 'terminal',
        heightRatio: 28,
      },
    ],
  },
  {
    id: 'col-right',
    widthRatio: 26,
    cells: [
      {
        id: 'cell-inspector',
        tabs: ['inspector', 'ai_agent'],
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

  // Dragging state for seamless Dock <-> Float transitions
  const [draggingFloatingId, setDraggingFloatingId] = useState<PanelId | null>(null);
  const [floatDragOffset, setFloatDragOffset] = useState({ x: 0, y: 0 });
  const [hoverDropTarget, setHoverDropTarget] = useState<{
    colId: string;
    cellId: string;
    zone: DropZonePosition;
  } | null>(null);

  // Pending drag on a docked tab (if dragged > 22px, smoothly detaches into Floating Window)
  const pendingTabDragRef = useRef<{
    panelId: PanelId;
    startX: number;
    startY: number;
  } | null>(null);

  // Column & Row Splitter Resize
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
    `[${new Date().toLocaleTimeString().slice(0, 8)}] MooVN Engine 初始化完成：已挂载 /home/user/MooVN/MooVN_Workspace 全局磁盘目录`,
    `[${new Date().toLocaleTimeString().slice(0, 8)}] 流加载器就绪：提前解压 3 场景，经过 5 场景后自动释放旧场景内存，PNG 免二次重压缩已开启`,
  ]);

  // Remove a panelId from all docked cells (cleaning up empty cells/columns)
  const removePanelFromDock = (
    cols: DockColumn[],
    panelId: PanelId
  ): DockColumn[] => {
    const nextCols = cols
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

    return nextCols;
  };

  // Convert a docked panel directly into a Floating Window (without closing!)
  const undockPanelToFloat = (
    panelId: PanelId,
    clientX = 240,
    clientY = 110,
    startDraggingImmediately = false
  ) => {
    const nextZ = topZ + 1;
    setTopZ(nextZ);
    setColumns((prev) => removePanelFromDock(prev, panelId));
    setFloatingWindows((prev) => {
      const exists = prev.find((f) => f.id === panelId);
      const win: FloatingWindowState = exists
        ? { ...exists, x: clientX - 140, y: Math.max(44, clientY - 16), zIndex: nextZ }
        : {
            id: panelId,
            x: Math.max(40, clientX - 180),
            y: Math.max(46, clientY - 16),
            width: panelId === 'ai_agent' ? 460 : panelId === 'terminal' ? 680 : 620,
            height: panelId === 'terminal' ? 320 : 480,
            zIndex: nextZ,
          };
      return [...prev.filter((f) => f.id !== panelId), win];
    });

    if (startDraggingImmediately) {
      setDraggingFloatingId(panelId);
      setFloatDragOffset({ x: 180, y: 16 });
    }
  };

  // Dock a floating (or already docked) panel into a target cell & zone in the 2D grid
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
          widthRatio: 26,
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

  // Toggle between Docked and Floating with 1 click
  const handleToggleDockFloat = (panelId: PanelId) => {
    const isFloating = floatingWindows.some((f) => f.id === panelId);
    if (isFloating) {
      // Dock back into first available column
      const targetCol = columns[columns.length - 1] || columns[0];
      const targetCell = targetCol?.cells[0];
      if (targetCol && targetCell) {
        dockPanelIntoTarget(panelId, targetCol.id, targetCell.id, 'center');
      }
    } else {
      undockPanelToFloat(panelId, 280, 120, false);
    }
  };

  // Open or focus a panel
  const handleOpenOrFocusWindow = (
    panelId: PanelId,
    mode: 'dock' | 'float' = 'dock'
  ) => {
    if (mode === 'float') {
      undockPanelToFloat(panelId, 300, 120, false);
      return;
    }

    // Check if already docked
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

    // If floating, dock it back
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
    }
  };

  // Apply 2D Multi-Row / Multi-Column Layout Presets
  const handleApplyLayoutPreset = (
    preset: 'default_ide' | 'quad_2x2' | 'multi_col_4' | 'canvas_stage_terminal'
  ) => {
    setFloatingWindows([]);
    if (preset === 'quad_2x2') {
      // 窗口 A | 窗口 C 在上，窗口 B | 窗口 D 在下
      setColumns([
        {
          id: 'col-q1',
          widthRatio: 50,
          cells: [
            {
              id: 'cell-a',
              tabs: ['canvas', 'explorer'],
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
      // 窗口 A | 窗口 B | 窗口 C | 窗口 D 四列并排
      setColumns([
        {
          id: 'col-1',
          widthRatio: 16,
          cells: [{ id: 'c-1', tabs: ['explorer'], activeTab: 'explorer', heightRatio: 100 }],
        },
        {
          id: 'col-2',
          widthRatio: 32,
          cells: [{ id: 'c-2', tabs: ['canvas', 'ts_code'], activeTab: 'canvas', heightRatio: 100 }],
        },
        {
          id: 'col-3',
          widthRatio: 30,
          cells: [
            { id: 'c-3a', tabs: ['stage', 'asset_studio'], activeTab: 'stage', heightRatio: 65 },
            { id: 'c-3b', tabs: ['terminal'], activeTab: 'terminal', heightRatio: 35 },
          ],
        },
        {
          id: 'col-4',
          widthRatio: 22,
          cells: [{ id: 'c-4', tabs: ['inspector', 'ai_agent'], activeTab: 'ai_agent', heightRatio: 100 }],
        },
      ]);
    } else if (preset === 'canvas_stage_terminal') {
      setColumns([
        {
          id: 'col-left',
          widthRatio: 45,
          cells: [
            { id: 'c-top-l', tabs: ['canvas', 'explorer'], activeTab: 'canvas', heightRatio: 68 },
            { id: 'c-bot-l', tabs: ['terminal'], activeTab: 'terminal', heightRatio: 32 },
          ],
        },
        {
          id: 'col-mid',
          widthRatio: 33,
          cells: [
            { id: 'c-top-m', tabs: ['stage', 'asset_studio'], activeTab: 'stage', heightRatio: 68 },
            { id: 'c-bot-m', tabs: ['ts_code'], activeTab: 'ts_code', heightRatio: 32 },
          ],
        },
        {
          id: 'col-right',
          widthRatio: 22,
          cells: [
            { id: 'c-r1', tabs: ['inspector'], activeTab: 'inspector', heightRatio: 55 },
            { id: 'c-r2', tabs: ['ai_agent'], activeTab: 'ai_agent', heightRatio: 45 },
          ],
        },
      ]);
    } else {
      setColumns(createDefaultColumns());
    }
  };

  // Global Pointer Move / Up for Floating Window Drag, Tab Detach-to-Float, and Splitter Resize
  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    // 1. Check if a docked tab is being dragged out to become a Floating Window
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

    // 2. Move active Floating Window
    if (draggingFloatingId) {
      setFloatingWindows((prev) =>
        prev.map((w) =>
          w.id === draggingFloatingId
            ? {
                ...w,
                x: Math.max(8, e.clientX - floatDragOffset.x),
                y: Math.max(42, e.clientY - floatDragOffset.y),
              }
            : w
        )
      );
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
      const deltaPercent = ((e.clientY - startY) / (window.innerHeight - 66)) * 100;
      const newTop = Math.max(15, Math.min(85, startTopRatio + deltaPercent));
      const newBottom = Math.max(15, Math.min(85, startBottomRatio - deltaPercent));
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
              updateNode(selectedNode.id, (prev) => ({ ...prev, backgroundId: bgId }));
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
            onAddCharacter={(charId) => addCharacterToNode(selectedNode.id, charId)}
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

  // Build descriptor list for MenuBar
  const panelDescriptors: WindowPanelDescriptor[] = ALL_WINDOW_IDS.map((id) => ({
    id,
    title: PANEL_TITLES[id],
    docked: columns.some((col) => col.cells.some((c) => c.tabs.includes(id))),
    floating: floatingWindows.some((f) => f.id === id),
  }));

  return (
    <div
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
      className="h-screen w-screen flex flex-col bg-[#111113] text-zinc-200 overflow-hidden select-none"
    >
      {/* Top Studio MenuBar */}
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
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
      />

      {/* ==================== 2D MULTI-COLUMN & MULTI-ROW DOCK WORKBENCH ==================== */}
      <div className="flex-1 flex overflow-hidden relative">
        {columns.map((col, colIndex) => {
          const totalWidth = columns.reduce((s, c) => s + c.widthRatio, 0) || 100;
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

                  return (
                    <React.Fragment key={cell.id}>
                      <div
                        style={{ height: `${cellHeightPercent}%` }}
                        className="relative flex flex-col overflow-hidden bg-[#141417] border-r border-b border-[#242429]"
                      >
                        {/* VS Code Style Docked Cell Tab & Action Bar */}
                        <div className="h-7 bg-[#18181c] border-b border-[#27272c] px-1.5 flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                            {cell.tabs.map((tabId) => {
                              const isActive = tabId === activePanel;
                              return (
                                <div
                                  key={tabId}
                                  onMouseDown={(e) => {
                                    // Activate tab & arm drag-to-float detector
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
                                  title="按住向窗外拖拽可直接丝滑变为漂浮窗口"
                                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-[11px] cursor-grab active:cursor-grabbing transition ${
                                    isActive
                                      ? 'bg-[#141417] text-zinc-100 font-medium border-t border-x border-[#2b2b33]'
                                      : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  <span className="truncate max-w-[120px]">
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

                          {/* Cell Quick Split & Direct Dock->Float Action Buttons */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => {
                                // Split Down: pick another panel or duplicate into lower row
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
                                    : 'inspector';
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
                              title="直接切换为漂浮窗口 (无需关闭重开)"
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

                          {/* 5-Zone VS Code Drop Target Overlay when dragging any Floating Window */}
                          {draggingFloatingId && (
                            <div className="absolute inset-0 z-50 bg-black/25 backdrop-blur-[1px] grid grid-cols-3 grid-rows-3 p-3 gap-2">
                              <div />
                              <div
                                onMouseEnter={() =>
                                  setHoverDropTarget({
                                    colId: col.id,
                                    cellId: cell.id,
                                    zone: 'top',
                                  })
                                }
                                onMouseLeave={() => setHoverDropTarget(null)}
                                className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-medium transition ${
                                  hoverDropTarget?.cellId === cell.id &&
                                  hoverDropTarget.zone === 'top'
                                    ? 'bg-sky-500/35 border-sky-300 text-white scale-105'
                                    : 'bg-zinc-900/60 border-zinc-500/60 text-zinc-300'
                                }`}
                              >
                                停靠到上方行
                              </div>
                              <div />

                              <div
                                onMouseEnter={() =>
                                  setHoverDropTarget({
                                    colId: col.id,
                                    cellId: cell.id,
                                    zone: 'left',
                                  })
                                }
                                onMouseLeave={() => setHoverDropTarget(null)}
                                className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-medium transition ${
                                  hoverDropTarget?.cellId === cell.id &&
                                  hoverDropTarget.zone === 'left'
                                    ? 'bg-sky-500/35 border-sky-300 text-white scale-105'
                                    : 'bg-zinc-900/60 border-zinc-500/60 text-zinc-300'
                                }`}
                              >
                                停靠到左侧列
                              </div>

                              <div
                                onMouseEnter={() =>
                                  setHoverDropTarget({
                                    colId: col.id,
                                    cellId: cell.id,
                                    zone: 'center',
                                  })
                                }
                                onMouseLeave={() => setHoverDropTarget(null)}
                                className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-medium transition ${
                                  hoverDropTarget?.cellId === cell.id &&
                                  hoverDropTarget.zone === 'center'
                                    ? 'bg-emerald-500/35 border-emerald-300 text-white scale-105'
                                    : 'bg-zinc-900/60 border-zinc-500/60 text-zinc-300'
                                }`}
                              >
                                合并到此窗口标签
                              </div>

                              <div
                                onMouseEnter={() =>
                                  setHoverDropTarget({
                                    colId: col.id,
                                    cellId: cell.id,
                                    zone: 'right',
                                  })
                                }
                                onMouseLeave={() => setHoverDropTarget(null)}
                                className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-medium transition ${
                                  hoverDropTarget?.cellId === cell.id &&
                                  hoverDropTarget.zone === 'right'
                                    ? 'bg-sky-500/35 border-sky-300 text-white scale-105'
                                    : 'bg-zinc-900/60 border-zinc-500/60 text-zinc-300'
                                }`}
                              >
                                停靠到右侧列
                              </div>

                              <div />
                              <div
                                onMouseEnter={() =>
                                  setHoverDropTarget({
                                    colId: col.id,
                                    cellId: cell.id,
                                    zone: 'bottom',
                                  })
                                }
                                onMouseLeave={() => setHoverDropTarget(null)}
                                className={`rounded-lg border-2 border-dashed flex items-center justify-center text-xs font-medium transition ${
                                  hoverDropTarget?.cellId === cell.id &&
                                  hoverDropTarget.zone === 'bottom'
                                    ? 'bg-sky-500/35 border-sky-300 text-white scale-105'
                                    : 'bg-zinc-900/60 border-zinc-500/60 text-zinc-300'
                                }`}
                              >
                                停靠到下方行
                              </div>
                              <div />
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
        {floatingWindows.map((fw) => (
          <div
            key={fw.id}
            onMouseDown={() => {
              const nextZ = topZ + 1;
              setTopZ(nextZ);
              setFloatingWindows((prev) =>
                prev.map((w) => (w.id === fw.id ? { ...w, zIndex: nextZ } : w))
              );
            }}
            style={{
              left: fw.x,
              top: fw.y,
              width: fw.width,
              height: fw.height,
              zIndex: fw.zIndex,
            }}
            className="fixed rounded-lg bg-[#16161a] border border-zinc-600/80 shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
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
                  漂浮窗口 · 拖拽到任意工作区格子即可丝滑停靠
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
        ))}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        project={project}
        selectedNode={selectedNode}
      />

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
