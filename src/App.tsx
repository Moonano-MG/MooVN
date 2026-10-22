import React, { useState } from 'react';
import {
  Workflow,
  MonitorPlay,
  FileCode2,
  FileSpreadsheet,
  Sliders,
  Sparkles,
  FolderTree,
  Palette,
  PictureInPicture2,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowDownToLine,
  LayoutGrid,
  X,
} from 'lucide-react';
import { useEditor } from './hooks/useEditor';
import { MenuBar } from './components/MenuBar';
import { LeftPanel } from './components/LeftPanel';
import { NodeCanvas } from './components/NodeCanvas';
import { SceneStageView } from './components/SceneStageView';
import { ScriptView } from './components/ScriptView';
import { Inspector } from './components/Inspector';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { GameUICustomizer } from './components/GameUICustomizer';
import { PreviewPlayer } from './components/PreviewPlayer';
import { ExportModal } from './components/ExportModal';
import { PanelId, DockZoneId, FloatingWindowConfig } from './types';

interface PanelDescriptor {
  id: PanelId;
  title: string;
  icon: React.ReactNode;
}

const ALL_PANELS: Record<PanelId, PanelDescriptor> = {
  explorer: {
    id: 'explorer',
    title: '资源管理器',
    icon: <FolderTree className="w-3.5 h-3.5 text-sky-400" />,
  },
  canvas: {
    id: 'canvas',
    title: '工作流与积木画布',
    icon: <Workflow className="w-3.5 h-3.5 text-sky-400" />,
  },
  stage: {
    id: 'stage',
    title: '舞台与演出预览',
    icon: <MonitorPlay className="w-3.5 h-3.5 text-emerald-400" />,
  },
  ui_customizer: {
    id: 'ui_customizer',
    title: '游戏界面自定义',
    icon: <Palette className="w-3.5 h-3.5 text-pink-400" />,
  },
  inspector: {
    id: 'inspector',
    title: '节点属性检查器',
    icon: <Sliders className="w-3.5 h-3.5 text-amber-400" />,
  },
  ai_agent: {
    id: 'ai_agent',
    title: 'AI 助手',
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
  },
  ts_code: {
    id: 'ts_code',
    title: 'storyEngine.ts',
    icon: <FileCode2 className="w-3.5 h-3.5 text-sky-400" />,
  },
  yaml_code: {
    id: 'yaml_code',
    title: '章节 YAML',
    icon: <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />,
  },
  node_library: {
    id: 'node_library',
    title: '节点库',
    icon: <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />,
  },
  characters: {
    id: 'characters',
    title: '角色表',
    icon: <Sliders className="w-3.5 h-3.5 text-rose-400" />,
  },
};

const DEFAULT_DOCKS: Record<DockZoneId, PanelId[]> = {
  left: ['explorer'],
  center: ['canvas', 'stage', 'ui_customizer', 'ts_code', 'yaml_code'],
  right: ['inspector', 'ai_agent'],
  bottom: [],
};

export function App() {
  const {
    project,
    setProject,
    selectedChapterId,
    setSelectedChapterId,
    selectedNode,
    selectedNodeId,
    selectNode,
    selectedDialogueIndex,
    setSelectedDialogueIndex,
    selectedCharacterPlacementId,
    setSelectedCharacterPlacementId,
    updateUIConfig,
    updateNode,
    addChapter,
    addCharacterProfile,
    updateCharacterProfile,
    addNode,
    deleteNode,
    addDialogueLine,
    updateDialogueLine,
    deleteDialogueLine,
    addChoiceOption,
    updateChoiceOption,
    deleteChoiceOption,
    addCharacterToStage,
    updateCharacterPlacement,
    removeCharacterPlacement,
    addVisualBlock,
    updateVisualBlock,
    removeVisualBlock,
    undo,
    redo,
    canUndo,
    canRedo,
    resetToDefault,
  } = useEditor();

  // Dock zones & active tab per zone
  const [docks, setDocks] = useState<Record<DockZoneId, PanelId[]>>(DEFAULT_DOCKS);
  const [activeTabInDock, setActiveTabInDock] = useState<Record<DockZoneId, PanelId>>({
    left: 'explorer',
    center: 'canvas',
    right: 'inspector',
    bottom: 'stage',
  });

  // Free-floating windows (can be moved & resized anywhere on screen!)
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowConfig[]>([]);
  const [topZIndex, setTopZIndex] = useState(60);

  // Dragging state for floating windows
  const [draggingWinId, setDraggingWinId] = useState<string | null>(null);
  const [winDragOffset, setWinDragOffset] = useState({ x: 0, y: 0 });
  const [resizingWinId, setResizingWinId] = useState<string | null>(null);

  // Drag-and-drop tab across dock zones
  const [draggedPanelId, setDraggedPanelId] = useState<PanelId | null>(null);

  // Resizable dock dimensions
  const [leftWidth, setLeftWidth] = useState(270);
  const [rightWidth, setRightWidth] = useState(360);
  const [bottomHeight, setBottomHeight] = useState(250);
  const [resizingSplitter, setResizingSplitter] = useState<'left' | 'right' | 'bottom' | null>(
    null
  );

  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Move any panel into a target dock zone (`left`, `center`, `right`, `bottom`)
  const movePanelToDock = (panelId: PanelId, targetZone: DockZoneId) => {
    // Remove from floating windows if it was floating
    setFloatingWindows((prev) => prev.filter((w) => w.panelId !== panelId));

    setDocks((prev) => {
      const cleaned: Record<DockZoneId, PanelId[]> = {
        left: prev.left.filter((p) => p !== panelId),
        center: prev.center.filter((p) => p !== panelId),
        right: prev.right.filter((p) => p !== panelId),
        bottom: prev.bottom.filter((p) => p !== panelId),
      };
      cleaned[targetZone] = [...cleaned[targetZone], panelId];

      // Ensure active tabs remain valid
      setActiveTabInDock((act) => {
        const nextAct = { ...act, [targetZone]: panelId };
        (['left', 'center', 'right', 'bottom'] as DockZoneId[]).forEach((z) => {
          if (z !== targetZone && act[z] === panelId && cleaned[z].length > 0) {
            nextAct[z] = cleaned[z][0];
          }
        });
        return nextAct;
      });

      return cleaned;
    });
  };

  // Undock any panel into a free-floating draggable/resizable window
  const floatPanel = (panelId: PanelId) => {
    setDocks((prev) => {
      const cleaned: Record<DockZoneId, PanelId[]> = {
        left: prev.left.filter((p) => p !== panelId),
        center: prev.center.filter((p) => p !== panelId),
        right: prev.right.filter((p) => p !== panelId),
        bottom: prev.bottom.filter((p) => p !== panelId),
      };
      setActiveTabInDock((act) => {
        const nextAct = { ...act };
        (['left', 'center', 'right', 'bottom'] as DockZoneId[]).forEach((z) => {
          if (act[z] === panelId && cleaned[z].length > 0) {
            nextAct[z] = cleaned[z][0];
          }
        });
        return nextAct;
      });
      return cleaned;
    });

    setTopZIndex((z) => z + 1);
    setFloatingWindows((prev) => {
      const existing = prev.find((w) => w.panelId === panelId);
      if (existing) {
        return prev.map((w) =>
          w.panelId === panelId ? { ...w, zIndex: topZIndex + 1 } : w
        );
      }
      const offset = (prev.length % 4) * 36;
      return [
        ...prev,
        {
          id: `float-${panelId}`,
          panelId,
          x: 160 + offset,
          y: 72 + offset,
          width: panelId === 'stage' || panelId === 'canvas' ? 760 : 420,
          height: panelId === 'stage' || panelId === 'canvas' ? 500 : 540,
          zIndex: topZIndex + 1,
        },
      ];
    });
  };

  const focusOrOpenPanel = (panelId: PanelId) => {
    // Check if it's in a floating window
    const fl = floatingWindows.find((w) => w.panelId === panelId);
    if (fl) {
      setTopZIndex((z) => z + 1);
      setFloatingWindows((prev) =>
        prev.map((w) => (w.id === fl.id ? { ...w, zIndex: topZIndex + 1 } : w))
      );
      return;
    }
    // Check which dock it's in
    for (const z of ['left', 'center', 'right', 'bottom'] as DockZoneId[]) {
      if (docks[z].includes(panelId)) {
        setActiveTabInDock((prev) => ({ ...prev, [z]: panelId }));
        return;
      }
    }
    // Otherwise add to center dock
    movePanelToDock(panelId, 'center');
  };

  const resetLayout = () => {
    setFloatingWindows([]);
    setDocks(DEFAULT_DOCKS);
    setActiveTabInDock({
      left: 'explorer',
      center: 'canvas',
      right: 'inspector',
      bottom: 'stage',
    });
    setLeftWidth(270);
    setRightWidth(360);
    setBottomHeight(250);
  };

  const renderPanelContent = (panelId: PanelId) => {
    if (!selectedNode) return null;

    switch (panelId) {
      case 'explorer':
        return (
          <LeftPanel
            chapters={project.chapters}
            nodes={project.nodes}
            startNodeId={project.startNodeId}
            selectedNodeId={selectedNodeId}
            selectedChapterId={selectedChapterId}
            onSelectChapter={(chId) => setSelectedChapterId(chId)}
            onSelectNode={selectNode}
            onAddChapter={addChapter}
            onAssignBackground={(bgId) =>
              updateNode(selectedNode.id, (n) => ({ ...n, backgroundId: bgId }))
            }
            onAssignBgm={(bgmId) =>
              updateNode(selectedNode.id, (n) => ({ ...n, bgmId }))
            }
            onAddCharacterToStage={(charId) => addCharacterToStage(selectedNode.id, charId)}
            onOpenYamlTab={(chId) => {
              setSelectedChapterId(chId);
              focusOrOpenPanel('yaml_code');
            }}
            onOpenTsTab={() => focusOrOpenPanel('ts_code')}
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
            onSelectNode={selectNode}
            onUpdateNode={updateNode}
            onAddNode={addNode}
            onDeleteNode={deleteNode}
            onAddVisualBlock={addVisualBlock}
            onUpdateVisualBlock={updateVisualBlock}
            onRemoveVisualBlock={removeVisualBlock}
          />
        );
      case 'stage':
        return (
          <SceneStageView
            node={selectedNode}
            characters={project.characters}
            uiConfig={project.uiConfig}
            selectedDialogueIndex={selectedDialogueIndex}
            onSelectDialogueIndex={setSelectedDialogueIndex}
            selectedCharacterPlacementId={selectedCharacterPlacementId}
            onSelectCharacterPlacement={setSelectedCharacterPlacementId}
            onUpdateNode={(updater) => updateNode(selectedNode.id, updater)}
            onAddCharacter={(charId) => addCharacterToStage(selectedNode.id, charId)}
            onUpdateCharacter={(placementId, patch) =>
              updateCharacterPlacement(selectedNode.id, placementId, patch)
            }
            onRemoveCharacter={(placementId) =>
              removeCharacterPlacement(selectedNode.id, placementId)
            }
          />
        );
      case 'ui_customizer':
        return (
          <GameUICustomizer project={project} onUpdateUIConfig={updateUIConfig} />
        );
      case 'inspector':
        return (
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
            onDeleteDialogue={(lineId) => deleteDialogueLine(selectedNode.id, lineId)}
            onAddChoice={() => addChoiceOption(selectedNode.id)}
            onUpdateChoice={(choiceId, patch) =>
              updateChoiceOption(selectedNode.id, choiceId, patch)
            }
            onDeleteChoice={(choiceId) => deleteChoiceOption(selectedNode.id, choiceId)}
            onSetStartNode={(id) => setProject((prev) => ({ ...prev, startNodeId: id }))}
            onUpdateCharacterProfile={updateCharacterProfile}
            onAddCharacterProfile={addCharacterProfile}
          />
        );
      case 'ai_agent':
        return (
          <AiAssistantPanel
            project={project}
            selectedNodeId={selectedNode.id}
            onAddNode={(type) => addNode(type)}
            onAddChapter={addChapter}
            onAddCharacter={addCharacterProfile}
            onAppendDialogue={(speakerName, text) => {
              const char =
                project.characters.find((c) => c.name === speakerName) ||
                project.characters[0];
              updateNode(selectedNode.id, (n) => ({
                ...n,
                dialogues: [
                  ...n.dialogues,
                  {
                    id: `dlg-${Date.now()}`,
                    speakerId: char?.id || 'yukina',
                    speakerName: char?.name || speakerName,
                    speakerColor: char?.color || '#60a5fa',
                    text,
                  },
                ],
              }));
            }}
            onSwitchBackground={(bgId) =>
              updateNode(selectedNode.id, (n) => ({ ...n, backgroundId: bgId }))
            }
          />
        );
      case 'ts_code':
        return <ScriptView project={project} selectedChapterId={selectedChapterId} mode="ts" />;
      case 'yaml_code':
        return (
          <ScriptView project={project} selectedChapterId={selectedChapterId} mode="yaml" />
        );
      default:
        return null;
    }
  };

  // Render a Dock Zone with draggable tabs, dock-move buttons, and Float button
  const renderDockZone = (zoneId: DockZoneId) => {
    const panelIds = docks[zoneId];
    if (panelIds.length === 0) return null;
    const activeId = panelIds.includes(activeTabInDock[zoneId])
      ? activeTabInDock[zoneId]
      : panelIds[0];

    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (draggedPanelId) {
            movePanelToDock(draggedPanelId, zoneId);
            setDraggedPanelId(null);
          }
        }}
        className={`flex flex-col h-full w-full bg-[#18181b] overflow-hidden ${
          draggedPanelId ? 'ring-1 ring-[#007acc]/60' : ''
        }`}
      >
        {/* VS Code Tab Bar with Free Dock & Float Controls */}
        <div className="h-9 bg-[#1f1f23] border-b border-[#2b2b30] flex items-center justify-between px-1 shrink-0 overflow-x-auto">
          <div className="flex items-center h-full">
            {panelIds.map((pid) => {
              const desc = ALL_PANELS[pid];
              const isActive = pid === activeId;
              return (
                <div
                  key={pid}
                  draggable
                  onDragStart={() => setDraggedPanelId(pid)}
                  onDragEnd={() => setDraggedPanelId(null)}
                  onClick={() =>
                    setActiveTabInDock((prev) => ({ ...prev, [zoneId]: pid }))
                  }
                  className={`group flex items-center gap-1.5 px-3 h-full text-xs border-r border-[#2b2b30] cursor-grab active:cursor-grabbing transition whitespace-nowrap ${
                    isActive
                      ? 'bg-[#18181b] text-white border-t-2 border-t-[#007acc]'
                      : 'bg-[#252529] text-[#969696] hover:text-slate-200'
                  }`}
                  title="可按住拖拽此标签到左/中/右/底任意停靠区，或点击右侧图标弹出为自由移动窗口"
                >
                  {desc.icon}
                  <span>{desc.title}</span>
                </div>
              );
            })}
          </div>

          {/* Quick Move / Undock Controls for Active Panel in this Zone */}
          <div className="flex items-center gap-0.5 px-1 shrink-0">
            {zoneId !== 'left' && (
              <button
                onClick={() => movePanelToDock(activeId, 'left')}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2a2d2e]"
                title="移至左侧分栏"
              >
                <ArrowLeftToLine className="w-3.5 h-3.5" />
              </button>
            )}
            {zoneId !== 'bottom' && (
              <button
                onClick={() => movePanelToDock(activeId, 'bottom')}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2a2d2e]"
                title="移至底部分栏"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
              </button>
            )}
            {zoneId !== 'right' && (
              <button
                onClick={() => movePanelToDock(activeId, 'right')}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2a2d2e]"
                title="移至右侧分栏"
              >
                <ArrowRightToLine className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => floatPanel(activeId)}
              className="p-1 rounded text-sky-400 hover:text-white hover:bg-[#007acc]"
              title="弹出为自由移动浮动窗口 (可在屏幕任意位置拖拽与缩放)"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Active Panel Content */}
        <div className="flex-1 min-h-0 overflow-hidden">{renderPanelContent(activeId)}</div>
      </div>
    );
  };

  return (
    <div
      onMouseMove={(e) => {
        if (resizingSplitter === 'left') {
          setLeftWidth(Math.min(520, Math.max(190, e.clientX - 44)));
        } else if (resizingSplitter === 'right') {
          setRightWidth(Math.min(640, Math.max(240, window.innerWidth - e.clientX)));
        } else if (resizingSplitter === 'bottom') {
          setBottomHeight(Math.min(520, Math.max(150, window.innerHeight - e.clientY)));
        } else if (draggingWinId) {
          setFloatingWindows((prev) =>
            prev.map((w) =>
              w.id === draggingWinId
                ? {
                    ...w,
                    x: Math.max(0, Math.min(window.innerWidth - 180, e.clientX - winDragOffset.x)),
                    y: Math.max(36, Math.min(window.innerHeight - 80, e.clientY - winDragOffset.y)),
                  }
                : w
            )
          );
        } else if (resizingWinId) {
          setFloatingWindows((prev) =>
            prev.map((w) =>
              w.id === resizingWinId
                ? {
                    ...w,
                    width: Math.max(300, e.clientX - w.x),
                    height: Math.max(240, e.clientY - w.y),
                  }
                : w
            )
          );
        }
      }}
      onMouseUp={() => {
        setResizingSplitter(null);
        setDraggingWinId(null);
        setResizingWinId(null);
        setDraggedPanelId(null);
      }}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#18181b] text-[#cccccc] select-none"
    >
      {/* Top Menu Bar (NO project title in top-left!) */}
      <MenuBar
        project={project}
        selectedChapterId={selectedChapterId}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onImportProject={(imported) => setProject(imported)}
        onResetDefault={resetToDefault}
        onStartPreview={() => setIsPlayingPreview(true)}
        onOpenExportModal={() => setShowExportModal(true)}
        onFloatPanel={floatPanel}
        onMovePanelToDock={movePanelToDock}
        onResetLayout={resetLayout}
      />

      {/* Main VS Code Workbench Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Far-Left VS Code Activity Bar (44px) */}
        <aside className="w-11 bg-[#1f1f23] border-r border-[#2b2b30] flex flex-col items-center py-2 justify-between shrink-0 z-30">
          <div className="flex flex-col items-center gap-2">
            {(
              [
                ['explorer', '资源管理器', <FolderTree className="w-5 h-5" />],
                ['canvas', '工作流与积木画布', <Workflow className="w-5 h-5" />],
                ['stage', '舞台与演出预览', <MonitorPlay className="w-5 h-5" />],
                ['ui_customizer', '游戏界面完全自定义', <Palette className="w-5 h-5" />],
                ['inspector', '节点属性检查器', <Sliders className="w-5 h-5" />],
                ['ai_agent', 'AI 助手', <Sparkles className="w-5 h-5" />],
              ] as const
            ).map(([pid, label, icon]) => (
              <button
                key={pid}
                onClick={() => focusOrOpenPanel(pid)}
                onDoubleClick={() => floatPanel(pid)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#2a2d2e] transition"
                title={`${label} (单击聚焦 / 双击弹出为自由窗口)`}
              >
                {icon}
              </button>
            ))}
          </div>
        </aside>

        {/* Drag-and-Drop Dock Overlay Indicators when dragging a tab */}
        {draggedPanelId && (
          <div className="pointer-events-none absolute inset-0 left-11 z-40 flex items-center justify-between p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                movePanelToDock(draggedPanelId, 'left');
                setDraggedPanelId(null);
              }}
              className="pointer-events-auto w-28 h-48 rounded-xl bg-[#007acc]/30 border-2 border-dashed border-[#007acc] flex items-center justify-center text-xs font-bold text-white backdrop-blur-sm"
            >
              停靠至左侧栏
            </div>
            <div className="flex flex-col items-center gap-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  movePanelToDock(draggedPanelId, 'center');
                  setDraggedPanelId(null);
                }}
                className="pointer-events-auto w-44 h-28 rounded-xl bg-[#007acc]/30 border-2 border-dashed border-[#007acc] flex items-center justify-center text-xs font-bold text-white backdrop-blur-sm"
              >
                停靠至中央主区
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  movePanelToDock(draggedPanelId, 'bottom');
                  setDraggedPanelId(null);
                }}
                className="pointer-events-auto w-44 h-24 rounded-xl bg-[#007acc]/30 border-2 border-dashed border-[#007acc] flex items-center justify-center text-xs font-bold text-white backdrop-blur-sm"
              >
                停靠至底部面板
              </div>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                movePanelToDock(draggedPanelId, 'right');
                setDraggedPanelId(null);
              }}
              className="pointer-events-auto w-28 h-48 rounded-xl bg-[#007acc]/30 border-2 border-dashed border-[#007acc] flex items-center justify-center text-xs font-bold text-white backdrop-blur-sm"
            >
              停靠至右侧栏
            </div>
          </div>
        )}

        {/* Left Dock Zone */}
        {docks.left.length > 0 && (
          <>
            <div style={{ width: leftWidth }} className="h-full shrink-0 overflow-hidden">
              {renderDockZone('left')}
            </div>
            <div
              onMouseDown={() => setResizingSplitter('left')}
              className="w-1 h-full bg-[#2b2b30] hover:bg-[#007acc] cursor-col-resize transition-colors shrink-0 z-20"
            />
          </>
        )}

        {/* Center + Bottom Dock Column */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">{renderDockZone('center')}</div>

          {docks.bottom.length > 0 && (
            <>
              <div
                onMouseDown={() => setResizingSplitter('bottom')}
                className="h-1 w-full bg-[#2b2b30] hover:bg-[#007acc] cursor-row-resize transition-colors shrink-0 z-20"
              />
              <div style={{ height: bottomHeight }} className="w-full shrink-0 overflow-hidden">
                {renderDockZone('bottom')}
              </div>
            </>
          )}
        </div>

        {/* Right Dock Zone */}
        {docks.right.length > 0 && (
          <>
            <div
              onMouseDown={() => setResizingSplitter('right')}
              className="w-1 h-full bg-[#2b2b30] hover:bg-[#007acc] cursor-col-resize transition-colors shrink-0 z-20"
            />
            <div style={{ width: rightWidth }} className="h-full shrink-0 overflow-hidden">
              {renderDockZone('right')}
            </div>
          </>
        )}

        {/* Free-Floating Draggable & Resizable Windows Layer */}
        {floatingWindows.map((win) => {
          const desc = ALL_PANELS[win.panelId];
          return (
            <div
              key={win.id}
              onMouseDown={() => {
                setTopZIndex((z) => z + 1);
                setFloatingWindows((prev) =>
                  prev.map((w) => (w.id === win.id ? { ...w, zIndex: topZIndex + 1 } : w))
                );
              }}
              style={{
                left: win.x,
                top: win.y,
                width: win.width,
                height: win.height,
                zIndex: win.zIndex,
              }}
              className="fixed rounded-xl bg-[#18181b] border-2 border-[#007acc] shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
            >
              {/* Floating Window Draggable Title Bar */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingWinId(win.id);
                  setWinDragOffset({ x: e.clientX - win.x, y: e.clientY - win.y });
                }}
                className="h-8 bg-[#1f1f23] border-b border-[#2b2b30] px-3 flex items-center justify-between cursor-move shrink-0"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  {desc.icon}
                  <span>{desc.title}（自由浮动窗口）</span>
                </div>
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1"
                >
                  <button
                    onClick={() => movePanelToDock(win.panelId, 'left')}
                    className="px-1.5 py-0.5 rounded bg-[#2a2d2e] hover:bg-[#007acc] text-[10px] text-slate-200"
                    title="停靠至左侧"
                  >
                    左
                  </button>
                  <button
                    onClick={() => movePanelToDock(win.panelId, 'center')}
                    className="px-1.5 py-0.5 rounded bg-[#2a2d2e] hover:bg-[#007acc] text-[10px] text-slate-200"
                    title="停靠至中央"
                  >
                    中
                  </button>
                  <button
                    onClick={() => movePanelToDock(win.panelId, 'right')}
                    className="px-1.5 py-0.5 rounded bg-[#2a2d2e] hover:bg-[#007acc] text-[10px] text-slate-200"
                    title="停靠至右侧"
                  >
                    右
                  </button>
                  <button
                    onClick={() => movePanelToDock(win.panelId, 'bottom')}
                    className="px-1.5 py-0.5 rounded bg-[#2a2d2e] hover:bg-[#007acc] text-[10px] text-slate-200"
                    title="停靠至底部"
                  >
                    底
                  </button>
                  <button
                    onClick={() => movePanelToDock(win.panelId, 'center')}
                    className="p-0.5 text-slate-400 hover:text-white"
                    title="收回至主工作台"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {renderPanelContent(win.panelId)}
              </div>

              {/* Bottom-Right Resize Handle */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setResizingWinId(win.id);
                }}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-gradient-to-tl from-[#007acc] to-transparent opacity-80"
                title="拖拽缩放窗口大小"
              />
            </div>
          );
        })}
      </div>

      {/* Fullscreen Playable Game Preview */}
      {isPlayingPreview && (
        <PreviewPlayer
          project={project}
          onClose={() => setIsPlayingPreview(false)}
        />
      )}

      {/* Multi-Platform Export Modal (Android / Windows / macOS / iOS / Web) */}
      {showExportModal && (
        <ExportModal
          project={project}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
export default App;
