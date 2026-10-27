import { newId } from '../lib/ids';
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Blocks,
  Code2,
  Repeat,
  GitBranch,
  ArrowDown,
  Smartphone,
  Map as MapIcon,
  Link2,
} from 'lucide-react';
import {
  SceneNode,
  WorkflowNodeType,
  CharacterProfile,
  StoryChapter,
  VisualScriptBlock,
  NodeCategory,
} from '../types';
import { getBackgroundById, BACKGROUND_ASSETS } from '../data/assets';
import { NODE_CATEGORIES, NODE_REGISTRY, getNodeMeta, isUnsupportedNode } from '../data/nodeRegistry';
import { generateSingleNodeCode } from '../lib/nodeCodeCompiler';
import { ScratchBlockTree } from './ScratchBlockTree';

interface NodeCanvasProps {
  nodes: SceneNode[];
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  startNodeId: string;
  selectedNodeId: string;
  selectedChapterId: string;
  onSelectNode: (id: string) => void;
  onUpdateNode: (id: string, updater: (n: SceneNode) => SceneNode) => void;
  onAddNode: (type: WorkflowNodeType, position?: { x: number; y: number }) => void;
  onDeleteNode: (id: string) => void;
  onAddVisualBlock: (nodeId: string, block: VisualScriptBlock) => void;
  onUpdateVisualBlock: (
    nodeId: string,
    blockId: string,
    params: Record<string, string | number | boolean>
  ) => void;
  onRemoveVisualBlock: (nodeId: string, blockId: string) => void;
  onOpenInspectorForNode?: (nodeId: string) => void;
}

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  nodes,
  chapters,
  startNodeId,
  selectedNodeId,
  selectedChapterId,
  onSelectNode,
  onUpdateNode,
  onAddNode,
  onDeleteNode,
  onOpenInspectorForNode,
}) => {
  const checkPhoneViewport = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isPhoneUA = /Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    return window.innerWidth < 640 || (isPhoneUA && window.innerWidth < 768);
  };

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(checkPhoneViewport);
  const [mobileViewMode, setMobileViewMode] = useState<'flow' | 'canvas'>('canvas');

  const [zoom, setZoom] = useState(() =>
    checkPhoneViewport() ? 0.78 : 0.92
  );
  const [pan, setPan] = useState({ x: 24, y: 48 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [filterChapter, setFilterChapter] = useState<string>('all');
  const [openBlockNodeId, setOpenBlockNodeId] = useState<string | null>(null);
  const [openCodeNodeId, setOpenCodeNodeId] = useState<string | null>(null);
  const [canvasScriptLang, setCanvasScriptLang] = useState<'javascript' | 'typescript'>('typescript');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeCat, setActiveCat] = useState<NodeCategory>('narrative');
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);

  const pinchDistRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => {
      const mobile = checkPhoneViewport();
      setIsMobileViewport(mobile);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Global touchmove / touchend listener so dragging node cards or panning the 2D canvas on mobile never drops!
  useEffect(() => {
    if (!isPanning && !draggingNodeId) return;
    const onWinTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      if (isPanning) {
        setPan({ x: t.clientX - panStart.x, y: t.clientY - panStart.y });
      } else if (draggingNodeId) {
        const newX = Math.round((t.clientX - pan.x) / zoom - dragOffset.x);
        const newY = Math.round((t.clientY - pan.y) / zoom - dragOffset.y);
        onUpdateNode(draggingNodeId, (prev) => ({
          ...prev,
          position: { x: newX, y: newY },
        }));
      }
    };
    const onWinTouchEnd = () => {
      setIsPanning(false);
      setDraggingNodeId(null);
      pinchDistRef.current = null;
    };
    window.addEventListener('touchmove', onWinTouchMove, { passive: false });
    window.addEventListener('touchend', onWinTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onWinTouchMove);
      window.removeEventListener('touchend', onWinTouchEnd);
    };
  }, [isPanning, draggingNodeId, panStart, pan, zoom, dragOffset]);

  const visibleNodes =
    filterChapter === 'all' ? nodes : nodes.filter((n) => n.chapterId === filterChapter);

  const fitCanvasToNodes = () => {
    if (visibleNodes.length === 0) {
      setZoom(isMobileViewport ? 0.75 : 0.92);
      setPan({ x: 24, y: 48 });
      return;
    }
    const minX = Math.min(...visibleNodes.map((n) => n.position.x));
    const minY = Math.min(...visibleNodes.map((n) => n.position.y));
    const targetZoom = isMobileViewport ? 0.72 : 0.9;
    setZoom(targetZoom);
    setPan({
      x: Math.round(20 - minX * targetZoom),
      y: Math.round(56 - minY * targetZoom),
    });
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.vn-node-card')) return;
    if ((e.target as HTMLElement).closest('.canvas-Floating-ui')) return;
    setShowAddMenu(false);
    setConnectingFromNodeId(null);
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingNodeId) {
      const node = nodes.find((n) => n.id === draggingNodeId);
      if (!node) return;
      const newX = Math.round((e.clientX - pan.x) / zoom - dragOffset.x);
      const newY = Math.round((e.clientY - pan.y) / zoom - dragOffset.y);
      onUpdateNode(draggingNodeId, (prev) => ({
        ...prev,
        position: { x: newX, y: newY },
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    pinchDistRef.current = null;
  };

  const handleTouchStartCanvas = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-Floating-ui')) return;

    // Two-finger pinch-to-zoom support on mobile
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
      setIsPanning(false);
      setDraggingNodeId(null);
      return;
    }

    if ((e.target as HTMLElement).closest('.vn-node-card')) return;
    const t = e.touches[0];
    if (!t) return;
    setShowAddMenu(false);
    setIsPanning(true);
    setPanStart({ x: t.clientX - pan.x, y: t.clientY - pan.y });
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scaleDelta = dist / Math.max(1, pinchDistRef.current);
      pinchDistRef.current = dist;
      setZoom((z) => Math.min(1.5, Math.max(0.38, +(z * scaleDelta).toFixed(2))));
      return;
    }

    const t = e.touches[0];
    if (!t) return;
    if (isPanning) {
      setPan({ x: t.clientX - panStart.x, y: t.clientY - panStart.y });
    } else if (draggingNodeId) {
      const node = nodes.find((n) => n.id === draggingNodeId);
      if (!node) return;
      const newX = Math.round((t.clientX - pan.x) / zoom - dragOffset.x);
      const newY = Math.round((t.clientY - pan.y) / zoom - dragOffset.y);
      onUpdateNode(draggingNodeId, (prev) => ({
        ...prev,
        position: { x: newX, y: newY },
      }));
    }
  };

  const startDragNode = (e: React.MouseEvent, node: SceneNode) => {
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, input, select, textarea, a')) return;
    e.stopPropagation();

    if (connectingFromNodeId && connectingFromNodeId !== node.id) {
      onUpdateNode(connectingFromNodeId, (prev) => ({
        ...prev,
        nextNodeId: node.id,
      }));
      setConnectingFromNodeId(null);
      onSelectNode(node.id);
      return;
    }

    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.position.x,
      y: (e.clientY - pan.y) / zoom - node.position.y,
    });
  };

  const startTouchDragNode = (e: React.TouchEvent, node: SceneNode) => {
    const targetEl = e.target as HTMLElement;
    // Allow buttons, inputs, selects, and textareas inside node cards to be tapped normally on mobile!
    if (targetEl.closest('button, input, select, textarea, a')) {
      return;
    }
    e.stopPropagation();

    if (connectingFromNodeId && connectingFromNodeId !== node.id) {
      onUpdateNode(connectingFromNodeId, (prev) => ({
        ...prev,
        nextNodeId: node.id,
      }));
      setConnectingFromNodeId(null);
      onSelectNode(node.id);
      return;
    }

    const t = e.touches[0];
    if (!t) return;
    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (t.clientX - pan.x) / zoom - node.position.x,
      y: (t.clientY - pan.y) / zoom - node.position.y,
    });
  };

  const CARD_WIDTH = 248;
  const edges: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    active: boolean;
    color?: string;
  }[] = [];

  visibleNodes.forEach((node) => {
    const meta = getNodeMeta(node.type);
    const fromX = node.position.x + CARD_WIDTH;
    const fromY = node.position.y + 44;
    const isFromSelected = node.id === selectedNodeId;

    if (
      (node.type === 'choice' ||
        node.type === 'timed_choice' ||
        node.type === 'switch_branch' ||
        node.type === 'random_branch') &&
      node.choices.length > 0
    ) {
      node.choices.forEach((choice, idx) => {
        const target = visibleNodes.find((n) => n.id === choice.targetNodeId);
        if (target) {
          edges.push({
            from: { x: fromX, y: fromY + idx * 14 },
            to: { x: target.position.x, y: target.position.y + 44 },
            active: isFromSelected || target.id === selectedNodeId,
            color: meta.accentColor,
          });
        }
      });
    } else if (node.type === 'condition' && node.conditionRule) {
      const tNode = visibleNodes.find((n) => n.id === node.conditionRule?.trueTargetNodeId);
      const fNode = visibleNodes.find((n) => n.id === node.conditionRule?.falseTargetNodeId);
      if (tNode) {
        edges.push({
          from: { x: fromX, y: fromY - 6 },
          to: { x: tNode.position.x, y: tNode.position.y + 44 },
          active: isFromSelected,
          color: '#10b981',
        });
      }
      if (fNode) {
        edges.push({
          from: { x: fromX, y: fromY + 10 },
          to: { x: fNode.position.x, y: fNode.position.y + 44 },
          active: isFromSelected,
          color: '#f43f5e',
        });
      }
    } else if (node.nextNodeId) {
      const target = visibleNodes.find((n) => n.id === node.nextNodeId);
      if (target) {
        edges.push({
          from: { x: fromX, y: fromY },
          to: { x: target.position.x, y: target.position.y + 44 },
          active: isFromSelected || target.id === selectedNodeId,
          color: meta.accentColor,
        });
      }
    }
  });

  // ============================================================================
  // MOBILE TOUCH CARD FLOW VIEW (Designed specifically for effortless phone editing)
  // ============================================================================
  if (isMobileViewport && mobileViewMode === 'flow') {
    return (
      <div className="relative w-full h-full flex flex-col bg-[#0e1117] text-zinc-100 overflow-hidden">
        {/* Top Mobile Canvas Toolbar */}
        <div className="shrink-0 px-3 py-2 bg-[#141821] border-b border-[#262d3d] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              value={filterChapter}
              onChange={(e) => setFilterChapter(e.target.value)}
              className="px-2 py-1.5 rounded-md bg-[#1c2230] border border-[#2e374d] text-xs text-zinc-100 max-w-[130px] truncate"
            >
              <option value="all">全部章节 ({nodes.length})</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="px-2.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增节点</span>
            </button>
          </div>

          {/* Switch between Mobile Touch Flow & 2D Free Canvas */}
          <div className="flex items-center rounded-lg bg-[#0b0e14] p-0.5 border border-[#262d3d] shrink-0">
            <button
              type="button"
              onClick={() => setMobileViewMode('flow')}
              className="px-2 py-1 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-semibold flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3" />
              <span>触控流</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileViewMode('canvas');
                setTimeout(fitCanvasToNodes, 30);
              }}
              className="px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <MapIcon className="w-3 h-3" />
              <span>2D画布</span>
            </button>
          </div>
        </div>

        {/* Quick-Add Node Drawer on Mobile */}
        {showAddMenu && (
          <div className="shrink-0 bg-[#171c28] border-b border-[#2c3548] p-2.5 max-h-64 overflow-y-auto space-y-2">
            <div className="flex flex-wrap gap-1">
              {NODE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCat(cat.id)}
                  style={{
                    borderColor: activeCat === cat.id ? cat.color : 'transparent',
                    backgroundColor: activeCat === cat.id ? `${cat.color}28` : '#11151f',
                  }}
                  className="px-2 py-1 rounded border text-[11px] font-medium text-zinc-100 flex items-center gap-1"
                >
                  <span
                    style={{ backgroundColor: cat.color }}
                    className="w-2 h-2 rounded-full"
                  />
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {NODE_REGISTRY.filter((n) => n.category === activeCat).map((meta) => (
                <button
                  key={meta.type}
                        disabled={isUnsupportedNode(meta.type)}
                  type="button"
                  onClick={() => {
                    onAddNode(meta.type);
                    setShowAddMenu(false);
                  }}
                  className="p-2 rounded-lg bg-[#10141d] border border-[#283142] text-left flex flex-col gap-0.5 active:bg-[#1e2638]"
                >
                  <span style={{ color: meta.badgeText }} className="text-xs font-bold">
                    {meta.title}{isUnsupportedNode(meta.type) ? '（未实现）' : ''}
                  </span>
                  <span className="text-[10px] text-zinc-400 line-clamp-1">
                    {meta.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Compact Touch Flowchart (Unselected nodes stay compact; selected node expands inline) */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 pb-20">
          {visibleNodes.map((node, index) => {
            const meta = getNodeMeta(node.type);
            const isSelected = node.id === selectedNodeId;
            const isStart = node.id === startNodeId;
            const firstDlg = node.dialogues[0];
            const nextTargetNode = node.nextNodeId
              ? nodes.find((n) => n.id === node.nextNodeId)
              : null;

            return (
              <React.Fragment key={node.id}>
                <div
                  onClick={() => onSelectNode(node.id)}
                  style={{
                    borderColor: isSelected ? meta.accentColor : '#262d3d',
                    borderLeftWidth: '4px',
                    borderLeftColor: meta.accentColor,
                  }}
                  className={`rounded-xl border bg-[#141822] px-3 py-2.5 shadow-sm transition ${
                    isSelected ? 'ring-1 ring-sky-400/60 bg-[#171d2b]' : ''
                  }`}
                >
                  {/* Compact Card Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] shrink-0">
                        #{index + 1}
                      </span>
                      <span
                        style={{ backgroundColor: meta.accentColor, color: '#09090b' }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                      >
                        {meta.title}
                      </span>
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {node.title}
                      </span>
                      {isStart && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-semibold shrink-0">
                          起点
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenInspectorForNode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(node.id);
                            onOpenInspectorForNode(node.id);
                          }}
                          className="px-2 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[10px] font-semibold"
                        >
                          详细属性
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(node.id);
                          setOpenBlockNodeId(openBlockNodeId === node.id ? null : node.id);
                        }}
                        className="px-1.5 py-1 rounded bg-[#1f2637] text-amber-300 text-[10px] flex items-center gap-0.5"
                      >
                        <Blocks className="w-3 h-3" />
                        <span>{(node.childrenNodes || []).length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(node.id);
                        }}
                        className="p-1 rounded bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                        title="删除节点"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Compact Summary Row (Always visible for fast scanning) */}
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                    <span className="truncate flex-1">
                      {firstDlg
                        ? `${firstDlg.speakerName}：${firstDlg.text}`
                        : meta.description}
                    </span>
                    {node.choices.length > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] shrink-0">
                        {node.choices.length} 项分支
                      </span>
                    ) : nextTargetNode ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(nextTargetNode.id);
                        }}
                        className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] shrink-0 truncate max-w-[110px]"
                      >
                        → {nextTargetNode.title}
                      </button>
                    ) : null}
                  </div>

                  {/* Outgoing Branch Chips for Choice Nodes */}
                  {node.choices.length > 0 && !isSelected && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {node.choices.map((ch, cIdx) => {
                        const tNode = nodes.find((n) => n.id === ch.targetNodeId);
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tNode) onSelectNode(tNode.id);
                            }}
                            className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-400/30 text-[10px] text-purple-200 truncate max-w-full"
                          >
                            分支{cIdx + 1}: {ch.text} {tNode ? `→ ${tNode.title}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Expanded Inline Editor ONLY for the Currently Selected Node */}
                  {isSelected && (
                    <div
                      className="mt-2.5 pt-2.5 border-t border-[#262f42] space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-7">
                          <label className="block text-[10px] text-zinc-400 mb-0.5">
                            节点标题
                          </label>
                          <input
                            type="text"
                            value={node.title}
                            onChange={(e) =>
                              onUpdateNode(node.id, (prev) => ({
                                ...prev,
                                title: e.target.value,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#0d1017] border border-[#283142] text-xs text-zinc-100"
                          />
                        </div>
                        <div className="col-span-5">
                          <label className="block text-[10px] text-zinc-400 mb-0.5">
                            场景背景
                          </label>
                          <select
                            value={node.backgroundId}
                            onChange={(e) =>
                              onUpdateNode(node.id, (prev) => ({
                                ...prev,
                                backgroundId: e.target.value,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#0d1017] border border-[#283142] text-xs text-zinc-100"
                          >
                            {BACKGROUND_ASSETS.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* All Dialogue Lines Quick Editor */}
                      <div className="rounded-lg bg-[#0d1017] border border-[#252d3d] p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-sky-300">
                            本节点台词列表 ({node.dialogues.length} 句)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateNode(node.id, (prev) => ({
                                ...prev,
                                dialogues: [
                                  ...prev.dialogues,
                                  {
                                    id: newId('dlg'),
                                    speakerId: firstDlg?.speakerId || 'narrator',
                                    speakerName: firstDlg?.speakerName || '旁白',
                                    speakerColor: firstDlg?.speakerColor || '#38bdf8',
                                    text: '新台词内容...',
                                  },
                                ],
                              }))
                            }
                            className="px-2 py-0.5 rounded bg-sky-600 text-white text-[10px] font-semibold"
                          >
                            + 新增台词
                          </button>
                        </div>

                        {node.dialogues.map((dlg, dIdx) => (
                          <div
                            key={dlg.id}
                            className="p-1.5 rounded bg-[#141924] border border-[#242d40] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] font-mono text-zinc-500">
                                #{dIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={dlg.speakerName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateNode(node.id, (prev) => ({
                                    ...prev,
                                    dialogues: prev.dialogues.map((d, i) =>
                                      i === dIdx ? { ...d, speakerName: val } : d
                                    ),
                                  }));
                                }}
                                placeholder="说话人"
                                className="flex-1 px-2 py-0.5 rounded bg-[#0d1017] border border-[#283142] text-xs text-sky-200 font-semibold"
                              />
                              {node.dialogues.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateNode(node.id, (prev) => ({
                                      ...prev,
                                      dialogues: prev.dialogues.filter((_, i) => i !== dIdx),
                                    }))
                                  }
                                  className="px-1.5 py-0.5 rounded text-[10px] text-rose-300 bg-rose-500/10"
                                >
                                  删
                                </button>
                              )}
                            </div>
                            <textarea
                              rows={2}
                              value={dlg.text}
                              onChange={(e) => {
                                const val = e.target.value;
                                onUpdateNode(node.id, (prev) => ({
                                  ...prev,
                                  dialogues: prev.dialogues.map((d, i) =>
                                    i === dIdx ? { ...d, text: val } : d
                                  ),
                                }));
                              }}
                              className="w-full px-2 py-1 rounded bg-[#0d1017] border border-[#283142] text-xs text-zinc-100 resize-none"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Container C-Block Editor on Mobile */}
                      {(meta.isContainer || openBlockNodeId === node.id) && (
                        <div className="rounded-lg bg-[#0d1017] border border-emerald-500/30 p-2">
                          <ScratchBlockTree
                            compact
                            blocks={node.childrenNodes || []}
                            onChange={(nextBlocks) =>
                              onUpdateNode(node.id, (prev) => ({
                                ...prev,
                                childrenNodes: nextBlocks,
                              }))
                            }
                          />
                        </div>
                      )}

                      {/* Next Node Connection Selector & One-Tap Append */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="text-[11px] text-zinc-400 shrink-0">下一节点:</span>
                          <select
                            value={node.nextNodeId || ''}
                            onChange={(e) =>
                              onUpdateNode(node.id, (prev) => ({
                                ...prev,
                                nextNodeId: e.target.value || null,
                              }))
                            }
                            className="flex-1 min-w-0 px-2 py-1 rounded bg-[#0d1017] border border-[#283142] text-xs text-sky-200 truncate"
                          >
                            <option value="">-- 无 (章节末尾/分支) --</option>
                            {nodes
                              .filter((n) => n.id !== node.id)
                              .map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.title}
                                </option>
                              ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectNode(node.id);
                            onAddNode('dialogue', {
                              x: node.position.x + 300,
                              y: node.position.y,
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-[11px] font-semibold shrink-0"
                        >
                          + 追加节点
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Flow Arrow Indicator */}
                {index < visibleNodes.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3.5 h-3.5 text-sky-500/50" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStartCanvas}
      onTouchMove={handleTouchMoveCanvas}
      onTouchEnd={handleMouseUp}
      className="relative w-full h-full overflow-hidden bg-[#111113] select-none touch-none cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Minimal Floating Top Bar */}
      <div className="canvas-Floating-ui absolute top-2.5 left-2.5 right-2.5 z-30 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#18181c]/95 border border-[#2c2c34] rounded-md p-1 pointer-events-auto shadow-md">
          {isMobileViewport && (
            <button
              type="button"
              onClick={() => setMobileViewMode('flow')}
              className="px-2 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[11px] font-semibold flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3" />
              <span>返回触控流</span>
            </button>
          )}

          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className="!bg-transparent !border-none px-1.5 py-0.5 text-xs text-zinc-200 max-w-[130px] sm:max-w-none"
          >
            <option value="all">全部章节 ({nodes.length})</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title}
              </option>
            ))}
          </select>

          <div className="w-px h-3.5 bg-[#2c2c34]" />

          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="px-2 py-0.5 rounded bg-[#23232a] hover:bg-[#2d2d36] text-zinc-100 text-[11px] flex items-center gap-1"
            title="打开 9 大分类 55 种节点库"
          >
            <Plus className="w-3 h-3" strokeWidth={1.8} />
            添加节点
          </button>

          {connectingFromNodeId && (
            <button
              type="button"
              onClick={() => setConnectingFromNodeId(null)}
              className="px-2 py-0.5 rounded bg-sky-500/25 border border-sky-400 text-sky-200 text-[11px] animate-pulse"
            >
              请点击目标节点完成连线 (取消)
            </button>
          )}

          <div className="w-px h-3.5 bg-[#2c2c34] hidden sm:block" />

          {/* JS / TS Node Script Mode Switcher */}
          <div className="hidden sm:flex items-center rounded bg-[#131317] p-0.5 border border-[#27272c]">
            <button
              onClick={() => setCanvasScriptLang('javascript')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                canvasScriptLang === 'javascript'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="JavaScript 快速开发视图"
            >
              JS
            </button>
            <button
              onClick={() => setCanvasScriptLang('typescript')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                canvasScriptLang === 'typescript'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="TypeScript 严格类型视图"
            >
              TS
            </button>
          </div>
        </div>

        {/* Monochrome Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-[#18181c]/95 border border-[#2c2c34] rounded-md p-1 pointer-events-auto shadow-md">
          <button
            onClick={() => setZoom((z) => Math.max(0.38, +(z - 0.1).toFixed(2)))}
            className="icon-btn"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            className="icon-btn"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
          <button
            onClick={fitCanvasToNodes}
            className="icon-btn"
            title="自适应居中视图"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* Categorized Quick-Add Popover (9 Color-Coded Categories, 55 Nodes) */}
      {showAddMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="canvas-Floating-ui absolute top-12 left-3 z-40 w-[min(384px,calc(100vw-24px))] bg-[#18181c] border border-[#2e2e36] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Category Tabs */}
          <div className="p-1.5 bg-[#141417] border-b border-[#27272c] flex flex-wrap gap-1">
            {NODE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                style={{
                  borderColor: activeCat === cat.id ? cat.color : 'transparent',
                  color: activeCat === cat.id ? '#ffffff' : '#a1a1aa',
                  backgroundColor: activeCat === cat.id ? `${cat.color}28` : 'transparent',
                }}
                className="px-2 py-0.5 rounded border text-[11px] font-medium transition flex items-center gap-1"
              >
                <span
                  style={{ backgroundColor: cat.color }}
                  className="w-1.5 h-1.5 rounded-full"
                />
                {cat.label}
              </button>
            ))}
          </div>
          {/* Nodes in Selected Category */}
          <div className="p-2 grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
            {NODE_REGISTRY.filter((n) => n.category === activeCat).map((meta) => (
              <button
                key={meta.type}
                        disabled={isUnsupportedNode(meta.type)}
                onClick={() => {
                  onAddNode(meta.type);
                  setShowAddMenu(false);
                }}
                className="p-2 rounded bg-[#202025] hover:bg-[#2a2a30] border border-[#2c2c34] text-left transition flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{ color: meta.badgeText }}
                    className="text-xs font-semibold"
                  >
                    {meta.title}{isUnsupportedNode(meta.type) ? '（未实现）' : ''}
                  </span>
                  {meta.isContainer && (
                    <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">
                      可多重嵌套
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 line-clamp-1">
                  {meta.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas Transform Layer */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="relative w-[4200px] h-[3000px]"
      >
        {/* Color-Aware Bezier Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          {edges.map((edge, i) => {
            const dx = Math.max(Math.abs(edge.to.x - edge.from.x) * 0.45, 55);
            const path = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + dx} ${edge.from.y}, ${
              edge.to.x - dx
            } ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={edge.active ? edge.color || '#d4d4d8' : '#3f3f46'}
                  strokeWidth={edge.active ? 2.2 : 1.5}
                />
                <circle
                  cx={edge.to.x}
                  cy={edge.to.y}
                  r={3}
                  fill={edge.active ? edge.color || '#f4f4f5' : '#52525b'}
                />
              </g>
            );
          })}
        </svg>

        {/* Specialized, Color-Coded Node Cards */}
        {visibleNodes.map((node) => {
          const meta = getNodeMeta(node.type);
          const bg = getBackgroundById(node.backgroundId);
          const isSelected = node.id === selectedNodeId;
          const isStart = node.id === startNodeId;
          const isBlocksOpen = openBlockNodeId === node.id;
          const isCodeOpen = openCodeNodeId === node.id;

          return (
            <div
              key={node.id}
              onMouseDown={(e) => startDragNode(e, node)}
              onTouchStart={(e) => startTouchDragNode(e, node)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: meta.isContainer ? 276 : CARD_WIDTH,
                borderColor: isSelected ? meta.accentColor : `${meta.accentColor}75`,
                borderLeftWidth: '4px',
                borderLeftColor: meta.accentColor,
                background: `linear-gradient(180deg, ${meta.accentColor}16 0%, #17171c 100%)`,
                boxShadow: isSelected
                  ? `0 0 0 2px ${meta.accentColor}85, 0 14px 32px rgba(0,0,0,0.65)`
                  : `0 6px 18px rgba(0,0,0,0.45)`,
              }}
              className={`vn-node-card group absolute rounded-lg border transition cursor-pointer overflow-hidden ${
                isSelected ? 'z-20' : 'hover:brightness-110 z-10'
              }`}
            >
              {/* Input / Output Port Dots */}
              <div
                style={{ borderColor: meta.accentColor }}
                className="absolute -left-1.5 top-10 w-2.5 h-2.5 rounded-full bg-[#18181c] border-2"
              />
              <div
                style={{ backgroundColor: meta.accentColor }}
                className="absolute -right-1.5 top-10 w-2.5 h-2.5 rounded-full border border-zinc-950"
              />

              {/* Header: Rich Category-Colored Gradient Header */}
              <div
                style={{
                  background: `linear-gradient(90deg, ${meta.accentColor}38 0%, ${meta.accentColor}14 100%)`,
                  borderBottomColor: `${meta.accentColor}40`,
                }}
                className="flex items-center justify-between px-2.5 py-1.5 border-b"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    style={{
                      backgroundColor: meta.accentColor,
                      color: '#09090b',
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                  >
                    {meta.categoryLabel}
                  </span>
                  <span
                    style={{ color: meta.badgeText }}
                    className="text-xs font-semibold truncate"
                  >
                    {node.title}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectingFromNodeId(
                        connectingFromNodeId === node.id ? null : node.id
                      );
                    }}
                    className={`icon-btn !w-5 !h-5 ${
                      connectingFromNodeId === node.id ? '!text-sky-300 bg-sky-500/20' : ''
                    }`}
                    title="点击连线至下一节点"
                  >
                    <Link2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenCodeNodeId(isCodeOpen ? null : node.id);
                    }}
                    className={`icon-btn !w-5 !h-5 ${
                      isCodeOpen ? '!text-sky-300' : ''
                    }`}
                    title="查看该节点的 TS / JS 脚本实现"
                  >
                    <Code2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenBlockNodeId(isBlocksOpen ? null : node.id);
                    }}
                    className="icon-btn !w-5 !h-5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    title="积木脚本"
                  >
                    <Blocks className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    className="icon-btn !w-5 !h-5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    title="删除节点"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                </div>
              </div>

              {/* ==================== SPECIALIZED NODE BODY BY TYPE ==================== */}
              <div className="px-2.5 py-2 space-y-1.5">
                {/* 1. CONTAINER NODES (Repeat / While / ForEach / If-Else / Parallel / TryCatch) */}
                {meta.isContainer ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="space-y-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                      <span className="flex items-center gap-1 font-medium">
                        <Repeat className="w-3 h-3" strokeWidth={1.8} />
                        {node.type === 'repeat_loop'
                          ? '重复次数:'
                          : node.type === 'for_each_loop'
                          ? '遍历目标:'
                          : node.type === 'parallel_container'
                          ? '并发子槽:'
                          : '条件表达式:'}
                      </span>
                      {node.type === 'repeat_loop' ? (
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={node.loopConfig?.repeatCount ?? 3}
                          onChange={(e) =>
                            onUpdateNode(node.id, (prev) => ({
                              ...prev,
                              loopConfig: {
                                ...(prev.loopConfig || {}),
                                repeatCount: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-14 px-1.5 py-0.5 text-center font-mono text-[11px]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={
                            node.loopConfig?.conditionExpr ||
                            (node.type === 'for_each_loop'
                              ? 'ctx.characters'
                              : 'ctx.affection.yukina >= 60')
                          }
                          onChange={(e) =>
                            onUpdateNode(node.id, (prev) => ({
                              ...prev,
                              loopConfig: {
                                ...(prev.loopConfig || {}),
                                conditionExpr: e.target.value,
                              },
                            }))
                          }
                          className="w-32 px-1.5 py-0.5 font-mono text-[10px]"
                        />
                      )}
                    </div>

                    <div
                      style={{ borderLeftColor: meta.accentColor }}
                      className="border-l-[10px] pl-2 py-1.5 bg-black/25 rounded-r"
                    >
                      <ScratchBlockTree
                        compact
                        blocks={node.childrenNodes || []}
                        onChange={(nextBlocks) =>
                          onUpdateNode(node.id, (prev) => ({
                            ...prev,
                            childrenNodes: nextBlocks,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : node.type === 'math_operation' ||
                  node.type === 'set_variable' ||
                  node.type === 'string_format' ||
                  node.type === 'array_operation' ||
                  node.type === 'function_call' ? (
                  <div className="px-2 py-1.5 rounded bg-[#131318] border border-[#292932] font-mono text-[11px] text-emerald-300 truncate">
                    {node.type === 'math_operation'
                      ? `${node.logicConfig?.targetVar || 'clueCount'} ${
                          node.logicConfig?.mathOp || '+='
                        } ${node.logicConfig?.operandValue ?? 1}`
                      : node.type === 'set_variable'
                      ? `${node.variableKey || 'clueCount'} = ${JSON.stringify(
                          node.variableValue ?? 1
                        )}`
                      : node.type === 'string_format'
                      ? `${node.logicConfig?.targetVar || 'msg'} = \`${
                          node.logicConfig?.formatTemplate || ''
                        }\``
                      : node.type === 'function_call'
                      ? `await ${node.logicConfig?.functionName || 'fn'}(${
                          node.logicConfig?.functionArgs || 'ctx'
                        })`
                      : `${node.logicConfig?.targetVar || 'list'}.${
                          node.logicConfig?.arrayAction || 'push'
                        }(...)`}
                  </div>
                ) : node.type === 'condition' && node.conditionRule ? (
                  <div className="space-y-1 text-[10px] font-mono">
                    <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 truncate">
                      IF {node.conditionRule.attributeKey} {node.conditionRule.operator}{' '}
                      {String(node.conditionRule.compareValue)}
                    </div>
                    <div className="flex justify-between text-[10px] px-1">
                      <span className="text-emerald-400">
                        TRUE → {node.conditionRule.trueTargetNodeId || '无'}
                      </span>
                      <span className="text-rose-400">
                        FALSE → {node.conditionRule.falseTargetNodeId || '无'}
                      </span>
                    </div>
                  </div>
                ) : node.choices.length > 0 ? (
                  <div className="space-y-1">
                    {node.choices.slice(0, 3).map((ch, idx) => (
                      <div
                        key={ch.id}
                        className="px-2 py-1 rounded bg-[#141419] border border-[#272730] text-[10px] text-amber-200 flex items-center justify-between gap-1"
                      >
                        <span className="truncate">
                          {idx + 1}. {ch.text}
                        </span>
                        <GitBranch className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                      </div>
                    ))}
                  </div>
                ) : node.screenTextConfig ? (
                  <div className="px-2 py-1.5 rounded bg-purple-500/15 border border-purple-500/35 text-[11px] text-purple-200 space-y-0.5">
                    <div className="truncate font-medium">{node.screenTextConfig.text}</div>
                    <div className="text-[9px] text-purple-300/80 font-mono">
                      坐标 X:{node.screenTextConfig.x}% Y:{node.screenTextConfig.y}% ·{' '}
                      {node.screenTextConfig.fontSize}px
                    </div>
                  </div>
                ) : meta.category === 'audio' ? (
                  <div className="px-2 py-1.5 rounded bg-orange-500/15 border border-orange-500/35 text-[11px] text-orange-200 font-mono truncate">
                    {node.type === 'bgm_stop'
                      ? '■ 淡出停止当前背景音乐'
                      : node.type === 'sfx_play'
                      ? `🔊 音效: ${node.sfxId || 'sfx-bell-chime'}`
                      : `♪ 曲轨: ${node.bgmId}`}
                  </div>
                ) : meta.category === 'character' ? (
                  <div className="px-2 py-1.5 rounded bg-pink-500/15 border border-pink-500/35 text-[11px] text-pink-200 truncate">
                    {node.type === 'affection_change'
                      ? `♥ 好感度变更: ${node.affectionTargetCharId || 'yukina'} ${
                          (node.affectionDelta ?? 10) >= 0 ? '+' : ''
                        }${node.affectionDelta ?? 10}`
                      : node.type === 'char_expression'
                      ? `表情切换 → ${node.targetExpressionSpriteId || 'char-yukina-3'}`
                      : `${meta.title}: ${node.characters[0]?.name || '星野雪奈'} (X:${
                          node.characters[0]?.x ?? 50
                        }%)`}
                  </div>
                ) : meta.category === 'visual' ? (
                  <div className="px-2 py-1.5 rounded bg-teal-500/15 border border-teal-500/35 text-[11px] text-teal-200 truncate">
                    {node.type === 'camera_pan_zoom'
                      ? `推拉镜头 Zoom: ${node.cameraConfig?.zoom ?? 1.25}x`
                      : node.type === 'camera_shake'
                      ? `镜头震动: ${node.cameraConfig?.shakeIntensity || 'medium'} (${
                          node.cameraConfig?.durationMs ?? 700
                        }ms)`
                      : node.type === 'screen_flash'
                      ? `画面闪光: ${node.cameraConfig?.flashColor || '#ffffff'}`
                      : node.type === 'weather_particles'
                      ? `粒子天气: ${node.weatherEffect || 'sakura'}`
                      : node.type === 'color_filter'
                      ? `色彩滤镜: ${node.colorFilter || 'sepia'}`
                      : node.type === 'fade'
                      ? `过渡渐变: ${node.fadeConfig?.direction || 'in'} (${
                          node.fadeConfig?.durationMs ?? 800
                        }ms)`
                      : `场景切换 → ${node.backgroundId ? bg.name : '无背景'}`}
                  </div>
                ) : meta.category === 'ui' ? (
                  <div className="px-2 py-1.5 rounded bg-blue-500/15 border border-blue-500/35 text-[11px] text-blue-200 truncate">
                    {node.type === 'popup_toast'
                      ? `弹窗: ${node.toastMessage || '获得关键道具'}`
                      : node.type === 'clue_unlock'
                      ? `词条: ${node.unlockedClueTitle || '新档案词条'}`
                      : node.type === 'game_settings_modify'
                      ? `语速 ${node.settingsActionConfig?.textSpeedMs ?? 28}ms · 音量 ${
                          node.settingsActionConfig?.bgmVolumePercent ?? 75
                        }%`
                      : `${meta.title}: ${meta.description}`}
                  </div>
                ) : meta.category === 'control' ? (
                  <div className="px-2 py-1.5 rounded bg-amber-500/15 border border-amber-500/35 text-[11px] text-amber-200 font-mono truncate">
                    {node.type === 'wait_timer'
                      ? `await sleep(${node.waitDurationMs ?? 1500}ms)`
                      : node.type === 'stream_preload_hint' || node.type === 'msvn_chapter_load'
                      ? '此节点尚未实现'
                      : node.type === 'end'
                      ? `结局: ${node.endingTitle || 'Good Ending'}`
                      : `${meta.title}: → ${node.nextNodeId || '下一节点'}`}
                  </div>
                ) : meta.category === 'script' ? (
                  <div className="px-2 py-1.5 rounded bg-lime-500/15 border border-lime-500/35 text-[10px] text-lime-200 font-mono truncate">
                    {(node.customScript || '// 自定义 TS/JS 脚本').split('\n')[0]}
                  </div>
                ) : (
                  <div className="px-2 py-1.5 rounded bg-sky-500/12 border border-sky-500/30 text-[11px] text-sky-100 truncate">
                    {node.dialogues[0]
                      ? `${node.dialogues[0].speakerName}：${node.dialogues[0].text}`
                      : meta.description}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                  <span className="truncate max-w-[140px]">{node.backgroundId ? bg.name : '无背景'}</span>
                  <div className="flex items-center gap-1">
                    <span className="px-1 py-0.2 rounded bg-[#22222a] text-zinc-400 font-mono text-[9px]">
                      {canvasScriptLang.toUpperCase()}
                    </span>
                    {isStart && (
                      <span className="px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-950 font-semibold text-[9px]">
                        起点
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Compiled TS/JS Snippet Drawer on Node Card */}
              {isCodeOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 border-t border-[#25252c] bg-[#101014] font-mono text-[10px] text-sky-200 overflow-x-auto"
                >
                  <pre className="leading-relaxed whitespace-pre-wrap">
                    {generateSingleNodeCode(node, canvasScriptLang)}
                  </pre>
                </div>
              )}

              {/* Interlocking Puzzle Block Stack Drawer on Any Node */}
              {isBlocksOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-2.5 border-t border-[#25252c] bg-[#121217] rounded-b-lg space-y-2"
                >
                  <div className="text-[10px] font-medium text-amber-300 flex items-center justify-between">
                    <span>嵌套逻辑积木栈</span>
                    <span className="text-zinc-500 font-mono">
                      {(node.childrenNodes || []).length} 块积木
                    </span>
                  </div>
                  <ScratchBlockTree
                    compact
                    blocks={node.childrenNodes || []}
                    onChange={(nextBlocks) =>
                      onUpdateNode(node.id, (prev) => ({
                        ...prev,
                        childrenNodes: nextBlocks,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile 2D Canvas Floating Bottom Node Action Bar (Only on phone screens) */}
      {isMobileViewport && (() => {
        const activeNode = nodes.find((n) => n.id === selectedNodeId);
        if (!activeNode) return null;
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="canvas-Floating-ui absolute bottom-2.5 left-2.5 right-2.5 z-30 bg-[#141822]/95 border border-sky-400/35 rounded-xl px-2.5 py-2 shadow-2xl flex items-center justify-between gap-2 backdrop-blur-md"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-white truncate">
                {activeNode.title}
              </div>
              <div className="text-[10px] text-sky-300/80 truncate">
                {activeNode.dialogues[0]?.text || '点击右侧按钮快速操作此节点'}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onOpenInspectorForNode && (
                <button
                  type="button"
                  onClick={() => onOpenInspectorForNode(activeNode.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-semibold"
                >
                  编辑属性
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onAddNode('dialogue', {
                    x: activeNode.position.x + 290,
                    y: activeNode.position.y,
                  })
                }
                className="px-2 py-1.5 rounded-lg bg-[#1e2638] border border-sky-400/30 text-sky-200 text-[11px] font-semibold"
              >
                +后继
              </button>
              <button
                type="button"
                onClick={() =>
                  setConnectingFromNodeId(
                    connectingFromNodeId === activeNode.id ? null : activeNode.id
                  )
                }
                className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
                  connectingFromNodeId === activeNode.id
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-[#1e2638] text-zinc-200 border-[#2f3b52]'
                }`}
              >
                连线
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
