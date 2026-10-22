import React, { useState, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useEditor } from './hooks/useEditor';
import { MenuBar, WorkspaceNavMode } from './components/MenuBar';
import { LeftPanel } from './components/LeftPanel';
import { NodeCanvas } from './components/NodeCanvas';
import { SceneStageView } from './components/SceneStageView';
import { Inspector } from './components/Inspector';
import { PreviewPlayer } from './components/PreviewPlayer';
import { ScriptView } from './components/ScriptView';
import { StatusBar } from './components/StatusBar';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { GameUICustomizer } from './components/GameUICustomizer';
import { ExportModal } from './components/ExportModal';
import { PanelId, FloatingWindowConfig } from './types';

const WINDOW_TITLES: Record<PanelId, string> = {
  explorer: '资源与节点',
  node_library: '节点库',
  canvas: '流程图',
  stage: '舞台',
  ui_customizer: '界面定制',
  ts_code: '脚本',
  yaml_code: '章节 YAML',
  inspector: '属性',
  characters: '角色',
  ai_agent: 'AI 助手',
};

export function App() {
  const editor = useEditor();
  const [activeNav, setActiveNav] = useState<WorkspaceNavMode>('graph');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playStartNodeId, setPlayStartNodeId] = useState<string | undefined>(undefined);
  const [showExportModal, setShowExportModal] = useState(false);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(256);
  const [rightWidth, setRightWidth] = useState(328);
  const [maximizedWindow, setMaximizedWindow] = useState<PanelId | null>(null);

  // Optional floating windows (VS Code undock support without cluttering default layout)
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowConfig[]>([]);

  const resizingRef = useRef<{
    type: 'left' | 'right' | null;
    startX: number;
    startY: number;
    initialSize: number;
  }>({ type: null, startX: 0, startY: 0, initialSize: 0 });

  const floatingDragRef = useRef<{
    panelId: PanelId | null;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initialRect: FloatingWindowConfig;
  } | null>(null);

  const toggleFloatWindow = (panelId: PanelId) => {
    setFloatingWindows((prev) => {
      if (prev.some((w) => w.panelId === panelId)) {
        return prev.filter((w) => w.panelId !== panelId);
      }
      return [
        ...prev,
        {
          id: `float-${panelId}`,
          panelId,
          x: 180,
          y: 90,
          width: 560,
          height: 420,
          zIndex: 40 + prev.length,
        },
      ];
    });
  };

  const renderWindowBody = (id: PanelId) => {
    switch (id) {
      case 'explorer':
      case 'node_library':
      case 'characters':
        return (
          <LeftPanel
            chapters={editor.project.chapters}
            nodes={editor.project.nodes}
            startNodeId={editor.project.startNodeId}
            selectedNodeId={editor.selectedNodeId}
            selectedChapterId={editor.selectedChapterId}
            defaultTab={
              activeNav === 'stage' ? 'assets' : activeNav === 'code' ? 'chapters' : 'nodes'
            }
            onSelectChapter={editor.setSelectedChapterId}
            onSelectNode={editor.selectNode}
            onAddChapter={editor.addChapter}
            onAddNode={(type) => editor.addNode(type)}
            onAssignBackground={(bgId) =>
              editor.updateNode(editor.selectedNodeId, (n) => ({ ...n, backgroundId: bgId }))
            }
            onAssignBgm={(bgmId) =>
              editor.updateNode(editor.selectedNodeId, (n) => ({ ...n, bgmId }))
            }
            onAddCharacterToStage={(charId) =>
              editor.addCharacterToStage(editor.selectedNodeId, charId)
            }
            onOpenYamlTab={(chapterId) => {
              editor.setSelectedChapterId(chapterId);
              setActiveNav('code');
            }}
            onOpenTsTab={() => setActiveNav('code')}
          />
        );
      case 'canvas':
        return (
          <NodeCanvas
            nodes={editor.project.nodes}
            chapters={editor.project.chapters}
            characters={editor.project.characters}
            startNodeId={editor.project.startNodeId}
            selectedNodeId={editor.selectedNodeId}
            selectedChapterId={editor.selectedChapterId}
            onSelectNode={editor.selectNode}
            onUpdateNode={editor.updateNode}
            onAddNode={editor.addNode}
            onDeleteNode={editor.deleteNode}
            onAddVisualBlock={editor.addVisualBlock}
            onUpdateVisualBlock={editor.updateVisualBlock}
            onRemoveVisualBlock={editor.removeVisualBlock}
          />
        );
      case 'stage':
        return (
          <SceneStageView
            node={editor.selectedNode}
            characters={editor.project.characters}
            uiConfig={editor.project.uiConfig}
            selectedDialogueIndex={editor.selectedDialogueIndex}
            onSelectDialogueIndex={editor.setSelectedDialogueIndex}
            selectedCharacterPlacementId={editor.selectedCharacterPlacementId}
            onSelectCharacterPlacement={editor.setSelectedCharacterPlacementId}
            onUpdateNode={(updater) => editor.updateNode(editor.selectedNodeId, updater)}
            onAddCharacter={(charId) =>
              editor.addCharacterToStage(editor.selectedNodeId, charId)
            }
            onUpdateCharacter={(placementId, patch) =>
              editor.updateCharacterPlacement(editor.selectedNodeId, placementId, patch)
            }
            onRemoveCharacter={(placementId) =>
              editor.removeCharacterPlacement(editor.selectedNodeId, placementId)
            }
          />
        );
      case 'inspector':
        return (
          <Inspector
            node={editor.selectedNode}
            allNodes={editor.project.nodes}
            chapters={editor.project.chapters}
            characters={editor.project.characters}
            startNodeId={editor.project.startNodeId}
            selectedDialogueIndex={editor.selectedDialogueIndex}
            onSelectDialogueIndex={editor.setSelectedDialogueIndex}
            onUpdateNode={(updater) => editor.updateNode(editor.selectedNodeId, updater)}
            onAddDialogue={() => editor.addDialogueLine(editor.selectedNodeId)}
            onUpdateDialogue={(lineId, patch) =>
              editor.updateDialogueLine(editor.selectedNodeId, lineId, patch)
            }
            onDeleteDialogue={(lineId) =>
              editor.deleteDialogueLine(editor.selectedNodeId, lineId)
            }
            onAddChoice={() => editor.addChoiceOption(editor.selectedNodeId)}
            onUpdateChoice={(choiceId, patch) =>
              editor.updateChoiceOption(editor.selectedNodeId, choiceId, patch)
            }
            onDeleteChoice={(choiceId) =>
              editor.deleteChoiceOption(editor.selectedNodeId, choiceId)
            }
            onSetStartNode={(nodeId) =>
              editor.setProject((prev) => ({ ...prev, startNodeId: nodeId }))
            }
            onUpdateCharacterProfile={(charId, updater) =>
              editor.setProject((prev) => ({
                ...prev,
                characters: prev.characters.map((c) => (c.id === charId ? updater(c) : c)),
              }))
            }
            onAddCharacterProfile={editor.addCharacterProfile}
          />
        );
      case 'ui_customizer':
        return (
          <GameUICustomizer
            project={editor.project}
            onUpdateUIConfig={editor.updateUIConfig}
          />
        );
      case 'ai_agent':
        return (
          <AiAssistantPanel
            project={editor.project}
            selectedNodeId={editor.selectedNodeId}
            onAddNode={(type) => editor.addNode(type)}
            onAddChapter={editor.addChapter}
            onAddCharacter={() =>
              editor.addCharacterToStage(
                editor.selectedNodeId,
                editor.project.characters[0]?.id || 'yukina'
              )
            }
            onAppendDialogue={(speakerName, text) => {
              editor.updateNode(editor.selectedNodeId, (n) => ({
                ...n,
                dialogues: [
                  ...n.dialogues,
                  {
                    id: `dlg-${Date.now()}`,
                    speakerId: editor.project.characters[0]?.id || 'narrator',
                    speakerName,
                    speakerColor: '#38bdf8',
                    text,
                  },
                ],
              }));
            }}
            onSwitchBackground={(bgId) => {
              editor.updateNode(editor.selectedNodeId, (n) => ({
                ...n,
                backgroundId: bgId,
              }));
            }}
          />
        );
      case 'ts_code':
        return (
          <ScriptView
            project={editor.project}
            selectedChapterId={editor.selectedChapterId}
            mode="ts"
          />
        );
      case 'yaml_code':
        return (
          <ScriptView
            project={editor.project}
            selectedChapterId={editor.selectedChapterId}
            mode="yaml"
          />
        );
    }
  };

  // Determine the focused center & right panels from the top navigation mode
  const getPrimaryPanelsForNav = (
    nav: WorkspaceNavMode
  ): {
    showLeft: boolean;
    centerId: PanelId;
    rightId: PanelId;
  } => {
    switch (nav) {
      case 'graph':
        return { showLeft: true, centerId: 'canvas', rightId: 'inspector' };
      case 'stage':
        return { showLeft: true, centerId: 'stage', rightId: 'inspector' };
      case 'ui':
        return { showLeft: false, centerId: 'stage', rightId: 'ui_customizer' };
      case 'code':
        return { showLeft: true, centerId: 'ts_code', rightId: 'inspector' };
      case 'ai':
        return { showLeft: false, centerId: 'canvas', rightId: 'ai_agent' };
    }
  };

  const { showLeft, centerId, rightId } = getPrimaryPanelsForNav(activeNav);

  const startResize = (
    type: 'left' | 'right',
    e: React.MouseEvent,
    initialSize: number
  ) => {
    e.preventDefault();
    resizingRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialSize,
    };

    const handleMove = (ev: MouseEvent) => {
      const state = resizingRef.current;
      if (!state.type) return;
      if (state.type === 'left') {
        const delta = ev.clientX - state.startX;
        setLeftWidth(Math.max(200, Math.min(480, state.initialSize + delta)));
      } else if (state.type === 'right') {
        const delta = state.startX - ev.clientX;
        setRightWidth(Math.max(260, Math.min(520, state.initialSize + delta)));
      }
    };

    const handleUp = () => {
      resizingRef.current.type = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const startFloatingInteraction = (
    panelId: PanelId,
    mode: 'move' | 'resize',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = floatingWindows.find((w) => w.panelId === panelId);
    if (!rect) return;
    floatingDragRef.current = {
      panelId,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialRect: { ...rect },
    };

    const handleMove = (ev: MouseEvent) => {
      const cur = floatingDragRef.current;
      if (!cur || !cur.panelId) return;
      const dx = ev.clientX - cur.startX;
      const dy = ev.clientY - cur.startY;
      setFloatingWindows((prev) =>
        prev.map((w) => {
          if (w.panelId !== cur.panelId) return w;
          return cur.mode === 'move'
            ? {
                ...w,
                x: Math.max(8, cur.initialRect.x + dx),
                y: Math.max(44, cur.initialRect.y + dy),
              }
            : {
                ...w,
                width: Math.max(280, cur.initialRect.width + dx),
                height: Math.max(220, cur.initialRect.height + dy),
              };
        })
      );
    };

    const handleUp = () => {
      floatingDragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-[#121215] text-zinc-200 overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <MenuBar
        project={editor.project}
        selectedChapterId={editor.selectedChapterId}
        activeNav={activeNav}
        onSelectNav={(nav) => {
          setActiveNav(nav);
          setMaximizedWindow(null);
        }}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onImportProject={(proj) => {
          editor.setProject(proj);
          editor.selectNode(proj.startNodeId);
        }}
        onResetDefault={editor.resetToDefault}
        onStartPreview={() => {
          setPlayStartNodeId(editor.project.startNodeId);
          setIsPlaying(true);
        }}
        onOpenExportModal={() => setShowExportModal(true)}
        onFloatPanel={(panelId) => toggleFloatWindow(panelId)}
        onResetLayout={() => {
          setFloatingWindows([]);
          setMaximizedWindow(null);
          setLeftCollapsed(false);
          setRightCollapsed(false);
        }}
      />

      {/* Focused Main Workspace */}
      {maximizedWindow ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#161619]">
          <div className="h-8 bg-[#141417] border-b border-[#27272c] px-3 flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-200">{WINDOW_TITLES[maximizedWindow]}</span>
            <button
              onClick={() => setMaximizedWindow(null)}
              className="icon-btn"
              title="还原"
            >
              <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">{renderWindowBody(maximizedWindow)}</div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {/* Left Panel (shown in graph / stage / code modes) */}
          {showLeft && (
            <>
              {!leftCollapsed ? (
                <div
                  style={{ width: leftWidth }}
                  className="h-full shrink-0 flex flex-col bg-[#161619] border-r border-[#27272c]"
                >
                  <div className="h-8 bg-[#141417] border-b border-[#27272c] px-2.5 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-medium text-zinc-400">
                      {WINDOW_TITLES.explorer}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => toggleFloatWindow('explorer')}
                        className="icon-btn w-6 h-6"
                        title="浮动窗口"
                      >
                        <ExternalLink className="w-3 h-3" strokeWidth={1.6} />
                      </button>
                      <button
                        onClick={() => setLeftCollapsed(true)}
                        className="icon-btn w-6 h-6"
                        title="折叠侧栏"
                      >
                        <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.6} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">{renderWindowBody('explorer')}</div>
                </div>
              ) : (
                <div className="w-8 h-full bg-[#141417] border-r border-[#27272c] flex flex-col items-center py-2 shrink-0">
                  <button
                    onClick={() => setLeftCollapsed(false)}
                    className="icon-btn"
                    title="展开侧栏"
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
                  </button>
                </div>
              )}

              {/* Left Splitter */}
              {!leftCollapsed && (
                <div
                  onMouseDown={(e) => startResize('left', e, leftWidth)}
                  className="w-1 bg-transparent hover:bg-zinc-600 cursor-col-resize transition shrink-0"
                />
              )}
            </>
          )}

          {/* Center Primary Canvas */}
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#121215]">
            <div className="h-8 bg-[#141417] border-b border-[#27272c] px-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-medium text-zinc-300">
                {WINDOW_TITLES[centerId]}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleFloatWindow(centerId)}
                  className="icon-btn w-6 h-6"
                  title="浮动窗口"
                >
                  <ExternalLink className="w-3 h-3" strokeWidth={1.6} />
                </button>
                <button
                  onClick={() => setMaximizedWindow(centerId)}
                  className="icon-btn w-6 h-6"
                  title="最大化"
                >
                  <Maximize2 className="w-3 h-3" strokeWidth={1.6} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">{renderWindowBody(centerId)}</div>
          </div>

          {/* Right Splitter */}
          {!rightCollapsed && (
            <div
              onMouseDown={(e) => startResize('right', e, rightWidth)}
              className="w-1 bg-transparent hover:bg-zinc-600 cursor-col-resize transition shrink-0"
            />
          )}

          {/* Right Focused Inspector / Customizer / AI Panel */}
          {!rightCollapsed ? (
            <div
              style={{ width: rightWidth }}
              className="h-full shrink-0 flex flex-col bg-[#161619] border-l border-[#27272c]"
            >
              <div className="h-8 bg-[#141417] border-b border-[#27272c] px-2.5 flex items-center justify-between shrink-0">
                <span className="text-[11px] font-medium text-zinc-300">
                  {WINDOW_TITLES[rightId]}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => toggleFloatWindow(rightId)}
                    className="icon-btn w-6 h-6"
                    title="浮动窗口"
                  >
                    <ExternalLink className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={() => setMaximizedWindow(rightId)}
                    className="icon-btn w-6 h-6"
                    title="最大化"
                  >
                    <Maximize2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={() => setRightCollapsed(true)}
                    className="icon-btn w-6 h-6"
                    title="折叠侧栏"
                  >
                    <PanelRightClose className="w-3.5 h-3.5" strokeWidth={1.6} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">{renderWindowBody(rightId)}</div>
            </div>
          ) : (
            <div className="w-8 h-full bg-[#141417] border-l border-[#27272c] flex flex-col items-center py-2 shrink-0">
              <button
                onClick={() => setRightCollapsed(false)}
                className="icon-btn"
                title="展开侧栏"
              >
                <PanelRightOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
              </button>
            </div>
          )}

          {/* Optional Floating Windows */}
          {floatingWindows.map((win) => (
            <div
              key={win.id}
              style={{
                left: win.x,
                top: win.y,
                width: win.width,
                height: win.height,
                zIndex: win.zIndex,
              }}
              className="fixed flex flex-col rounded-lg overflow-hidden bg-[#161619] border border-[#2e2e36] shadow-2xl"
            >
              <div
                onMouseDown={(e) => startFloatingInteraction(win.panelId, 'move', e)}
                className="h-8 bg-[#121215] border-b border-[#27272c] px-3 flex items-center justify-between cursor-move text-xs"
              >
                <span className="font-medium text-zinc-200">{WINDOW_TITLES[win.panelId]}</span>
                <button
                  onClick={() => toggleFloatWindow(win.panelId)}
                  className="icon-btn w-6 h-6"
                  title="停靠回主界面"
                >
                  <Minimize2 className="w-3 h-3" strokeWidth={1.6} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {renderWindowBody(win.panelId)}
              </div>
              <div
                onMouseDown={(e) => startFloatingInteraction(win.panelId, 'resize', e)}
                className="w-3.5 h-3.5 absolute right-0 bottom-0 cursor-nwse-resize"
              />
            </div>
          ))}
        </div>
      )}

      {/* Status Bar */}
      <StatusBar project={editor.project} selectedNode={editor.selectedNode} />

      {/* Multi-Platform Export Modal */}
      {showExportModal && (
        <ExportModal project={editor.project} onClose={() => setShowExportModal(false)} />
      )}

      {/* Fullscreen Visual Novel Runtime Player */}
      {isPlaying && (
        <PreviewPlayer
          project={editor.project}
          initialNodeId={playStartNodeId}
          onClose={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
}

export default App;
