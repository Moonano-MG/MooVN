import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import {
  SceneNode,
  WorkflowNodeType,
  CharacterProfile,
  StoryChapter,
  VisualScriptBlock,
  VisualBlockKind,
  VisualBlockCategory,
  NodeCategory,
  NestedChildNode,
} from '../types';
import { getBackgroundById } from '../data/assets';
import { NODE_CATEGORIES, NODE_REGISTRY, getNodeMeta } from '../data/nodeRegistry';
import { generateSingleNodeCode } from '../lib/nodeCodeCompiler';

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
}

const BLOCK_ITEMS: {
  kind: VisualBlockKind;
  category: VisualBlockCategory;
  label: string;
  defaultParams: Record<string, string | number | boolean>;
}[] = [
  { kind: 'say', category: 'narrative', label: '台词', defaultParams: { speaker: '星野雪奈', text: '台词内容' } },
  { kind: 'screen_text', category: 'screen_text', label: '屏幕字', defaultParams: { text: '屏幕字幕', x: 50, y: 45 } },
  { kind: 'fade_target', category: 'visual', label: '淡入淡出', defaultParams: { target: 'screen', direction: 'in', durationMs: 800 } },
  { kind: 'switch_expr', category: 'character', label: '表情', defaultParams: { character: 'yukina', spriteId: 'char-yukina-3' } },
  { kind: 'move_char_tween', category: 'character', label: '位移', defaultParams: { character: 'yukina', targetX: 50, targetY: 55 } },
  { kind: 'modify_affection', category: 'control', label: '好感', defaultParams: { character: 'yukina', delta: 10 } },
  { kind: 'camera_effect', category: 'visual', label: '镜头', defaultParams: { zoom: 1.2, shake: 'medium' } },
  { kind: 'call_bridge_script', category: 'script', label: '脚本', defaultParams: { lang: 'lua', fn: 'onStep' } },
];

const QUICK_CHILD_TYPES: {
  type: WorkflowNodeType;
  label: string;
  defaultParams: Record<string, string | number | boolean>;
  isNestedContainer?: boolean;
}[] = [
  { type: 'dialogue', label: '+ 台词节点', defaultParams: { speaker: '星野 雪奈', text: '循环内的演出台词' } },
  { type: 'math_operation', label: '+ 数学运算', defaultParams: { targetVar: 'clueCount', mathOp: '+=', operandValue: 1 } },
  { type: 'affection_change', label: '+ 好感变更', defaultParams: { charId: 'yukina', delta: 5 } },
  { type: 'camera_shake', label: '+ 镜头震动', defaultParams: { intensity: 'medium', durationMs: 400 } },
  { type: 'wait_timer', label: '+ 延时等待', defaultParams: { durationMs: 600 } },
  {
    type: 'repeat_loop',
    label: '+ 嵌套重复',
    defaultParams: { repeatCount: 2 },
    isNestedContainer: true,
  },
  {
    type: 'if_else_container',
    label: '+ 嵌套如果',
    defaultParams: { conditionExpr: 'ctx.affection.yukina >= 50' },
    isNestedContainer: true,
  },
];

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  nodes,
  chapters,
  startNodeId,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onAddNode,
  onDeleteNode,
  onAddVisualBlock,
  onUpdateVisualBlock,
  onRemoveVisualBlock,
}) => {
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 32, y: 32 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [filterChapter, setFilterChapter] = useState<string>('all');
  const [openBlockNodeId, setOpenBlockNodeId] = useState<string | null>(null);
  const [openCodeNodeId, setOpenCodeNodeId] = useState<string | null>(null);
  const [canvasScriptLang, setCanvasScriptLang] = useState<'javascript' | 'typescript'>('typescript');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeCat, setActiveCat] = useState<NodeCategory>('loop_logic');

  const containerRef = useRef<HTMLDivElement>(null);

  const visibleNodes =
    filterChapter === 'all' ? nodes : nodes.filter((n) => n.chapterId === filterChapter);

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.vn-node-card')) return;
    if ((e.target as HTMLElement).closest('.canvas-Floating-ui')) return;
    setShowAddMenu(false);
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
  };

  const startDragNode = (e: React.MouseEvent, node: SceneNode) => {
    e.stopPropagation();
    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.position.x,
      y: (e.clientY - pan.y) / zoom - node.position.y,
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

  // Helper to recursively append a child inside a NestedChildNode tree
  const addNestedSubChild = (
    list: NestedChildNode[],
    parentChildId: string,
    newSub: NestedChildNode
  ): NestedChildNode[] => {
    return list.map((item) => {
      if (item.id === parentChildId) {
        return {
          ...item,
          childrenNodes: [...(item.childrenNodes || []), newSub],
        };
      }
      if (item.childrenNodes && item.childrenNodes.length > 0) {
        return {
          ...item,
          childrenNodes: addNestedSubChild(item.childrenNodes, parentChildId, newSub),
        };
      }
      return item;
    });
  };

  const removeNestedChildById = (
    list: NestedChildNode[],
    targetId: string
  ): NestedChildNode[] => {
    return list
      .filter((item) => item.id !== targetId)
      .map((item) => ({
        ...item,
        childrenNodes: item.childrenNodes
          ? removeNestedChildById(item.childrenNodes, targetId)
          : undefined,
      }));
  };

  // Recursive Scratch-Style Nested Child Slot Renderer on Canvas
  const renderNestedChildrenSlot = (
    node: SceneNode,
    children: NestedChildNode[],
    depth = 0
  ) => {
    return (
      <div
        className="space-y-1 pl-2 border-l-2 py-1"
        style={{
          borderColor: depth === 0 ? '#10b981' : '#38bdf8',
        }}
      >
        {children.map((ch) => {
          const chMeta = getNodeMeta(ch.type);
          const isSubContainer =
            ch.type === 'repeat_loop' ||
            ch.type === 'while_loop' ||
            ch.type === 'if_else_container' ||
            ch.type === 'parallel_container';
          return (
            <div
              key={ch.id}
              onClick={(e) => e.stopPropagation()}
              className="rounded bg-[#131318] border border-[#292933] p-1.5 text-[10px] space-y-1"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    style={{
                      backgroundColor: chMeta.badgeBg,
                      color: chMeta.badgeText,
                    }}
                    className="px-1 py-0.2 rounded text-[9px] font-medium shrink-0"
                  >
                    {chMeta.title}
                  </span>
                  <span className="text-zinc-300 truncate">
                    {ch.type === 'repeat_loop'
                      ? `× ${ch.params.repeatCount ?? 2} 次`
                      : ch.type === 'if_else_container'
                      ? `${ch.params.conditionExpr || '条件'}`
                      : ch.type === 'math_operation'
                      ? `${ch.params.targetVar} ${ch.params.mathOp} ${ch.params.operandValue}`
                      : String(ch.params.text || ch.params.intensity || ch.title)}
                  </span>
                </div>
                <button
                  onClick={() =>
                    onUpdateNode(node.id, (prev) => ({
                      ...prev,
                      childrenNodes: removeNestedChildById(prev.childrenNodes || [], ch.id),
                    }))
                  }
                  className="text-zinc-500 hover:text-rose-400"
                  title="移除此子节点"
                >
                  <Trash2 className="w-2.5 h-2.5" strokeWidth={1.6} />
                </button>
              </div>

              {/* If this child is ITSELF a container node, render its nested children & '+ 子节点' button recursively! */}
              {isSubContainer && (
                <div className="pt-0.5 space-y-1">
                  {renderNestedChildrenSlot(node, ch.childrenNodes || [], depth + 1)}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {QUICK_CHILD_TYPES.slice(0, 4).map((qt) => (
                      <button
                        key={qt.type}
                        onClick={() => {
                          const newSub: NestedChildNode = {
                            id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            type: qt.type,
                            title: qt.label.replace('+ ', ''),
                            params: { ...qt.defaultParams },
                          };
                          onUpdateNode(node.id, (prev) => ({
                            ...prev,
                            childrenNodes: addNestedSubChild(
                              prev.childrenNodes || [],
                              ch.id,
                              newSub
                            ),
                          }));
                        }}
                        className="px-1 py-0.2 rounded bg-[#1f1f27] hover:bg-[#292934] text-emerald-300 border border-emerald-500/30 text-[9px]"
                      >
                        {qt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full overflow-hidden bg-[#111113] select-none cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Minimal Floating Top Bar */}
      <div className="canvas-Floating-ui absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#18181c]/95 border border-[#2c2c34] rounded-md p-1 pointer-events-auto shadow-md">
          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className="!bg-transparent !border-none px-2 py-0.5 text-xs text-zinc-200"
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

          <div className="w-px h-3.5 bg-[#2c2c34]" />

          {/* JS / TS Node Script Mode Switcher */}
          <div className="flex items-center rounded bg-[#131317] p-0.5 border border-[#27272c]">
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
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
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
            onClick={() => {
              setZoom(0.92);
              setPan({ x: 32, y: 32 });
            }}
            className="icon-btn"
            title="重置视图"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* Categorized Quick-Add Popover (9 Color-Coded Categories, 55 Nodes) */}
      {showAddMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="canvas-Floating-ui absolute top-12 left-3 z-40 w-96 bg-[#18181c] border border-[#2e2e36] rounded-lg shadow-2xl overflow-hidden flex flex-col"
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
                    {meta.title}
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
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: meta.isContainer ? 276 : CARD_WIDTH,
                borderColor: isSelected ? meta.accentColor : `${meta.accentColor}45`,
                boxShadow: isSelected
                  ? `0 0 0 1px ${meta.accentColor}65, 0 12px 28px rgba(0,0,0,0.55)`
                  : undefined,
              }}
              className={`vn-node-card group absolute rounded-lg bg-[#18181c] border transition cursor-pointer overflow-hidden ${
                isSelected ? 'z-20' : 'hover:border-zinc-400 z-10 shadow-md'
              }`}
            >
              {/* Category Top Color Accent Strip */}
              <div
                style={{ backgroundColor: meta.accentColor }}
                className="h-1 w-full"
              />

              {/* Input / Output Port Dots */}
              <div className="absolute -left-1.5 top-10 w-2.5 h-2.5 rounded-full bg-[#27272c] border border-zinc-400" />
              <div
                style={{ backgroundColor: meta.accentColor }}
                className="absolute -right-1.5 top-10 w-2.5 h-2.5 rounded-full border border-zinc-950"
              />

              {/* Header: Color-Coded Category Tag + Title + JS/TS Code & Block Buttons */}
              <div
                style={{ backgroundColor: `${meta.accentColor}12` }}
                className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#25252c]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    style={{
                      backgroundColor: meta.badgeBg,
                      color: meta.badgeText,
                      borderColor: `${meta.accentColor}55`,
                    }}
                    className="px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0"
                  >
                    {meta.categoryLabel}
                  </span>
                  <span className="text-xs font-medium text-zinc-100 truncate">
                    {node.title}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
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
                    className="icon-btn !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="积木脚本"
                  >
                    <Blocks className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    className="icon-btn !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除节点"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                </div>
              </div>

              {/* ==================== SPECIALIZED NODE BODY BY TYPE ==================== */}
              <div className="px-2.5 py-2 space-y-1.5">
                {/* 1. SCRATCH-STYLE CONTAINER NODES (Repeat / While / ForEach / If-Else / Parallel / TryCatch) */}
                {meta.isContainer ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="space-y-1.5 text-[11px]"
                  >
                    {/* Container Header Parameter Control */}
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

                    {/* Recursive Indented Child Nodes Stack */}
                    {renderNestedChildrenSlot(node, node.childrenNodes || [], 0)}

                    {/* Inline Multi-Add Child Node Bar (`多重添加`) */}
                    <div className="pt-1 flex flex-wrap gap-1">
                      {QUICK_CHILD_TYPES.map((qt) => (
                        <button
                          key={qt.type}
                          onClick={() => {
                            const newChild: NestedChildNode = {
                              id: `child-${Date.now()}-${Math.random()
                                .toString(36)
                                .slice(2, 5)}`,
                              type: qt.type,
                              title: qt.label.replace('+ ', ''),
                              params: { ...qt.defaultParams },
                              childrenNodes: qt.isNestedContainer
                                ? [
                                    {
                                      id: `inner-${Date.now()}`,
                                      type: 'dialogue',
                                      title: '内层对白',
                                      params: {
                                        speaker: '星野 雪奈',
                                        text: '二重嵌套内部节点执行',
                                      },
                                    },
                                  ]
                                : undefined,
                            };
                            onUpdateNode(node.id, (prev) => ({
                              ...prev,
                              childrenNodes: [...(prev.childrenNodes || []), newChild],
                            }));
                          }}
                          className="px-1.5 py-0.5 rounded bg-[#202028] hover:bg-[#2a2a35] border border-[#30303c] text-[10px] text-zinc-200"
                        >
                          {qt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : node.type === 'math_operation' ||
                  node.type === 'set_variable' ||
                  node.type === 'string_format' ||
                  node.type === 'array_operation' ||
                  node.type === 'function_call' ? (
                  /* 2. FINE LOGIC & VARIABLE NODES */
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
                  /* 3. CONDITION BRANCH NODE */
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
                  /* 4. PLAYER CHOICE / TIMED CHOICE NODE */
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
                  /* 5. SCREEN TEXT / CHAPTER TITLE NODE */
                  <div className="px-2 py-1.5 rounded bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-200 space-y-0.5">
                    <div className="truncate font-medium">{node.screenTextConfig.text}</div>
                    <div className="text-[9px] text-purple-300/75 font-mono">
                      坐标 X:{node.screenTextConfig.x}% Y:{node.screenTextConfig.y}% ·{' '}
                      {node.screenTextConfig.fontSize}px
                    </div>
                  </div>
                ) : (
                  /* 6. NARRATIVE / VISUAL / AUDIO / UI NODES */
                  <div className="text-[11px] text-zinc-300 truncate">
                    {node.dialogues[0]
                      ? `${node.dialogues[0].speakerName}：${node.dialogues[0].text}`
                      : meta.description}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                  <span className="truncate max-w-[140px]">{bg.name}</span>
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

              {/* Optional Collapsible Scratch Blocks Drawer */}
              {isBlocksOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 border-t border-[#25252c] bg-[#141417] rounded-b-lg space-y-1.5"
                >
                  <div className="flex flex-wrap gap-1">
                    {BLOCK_ITEMS.map((b) => (
                      <button
                        key={b.kind}
                        onClick={() =>
                          onAddVisualBlock(node.id, {
                            id: `vb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            category: b.category,
                            kind: b.kind,
                            params: { ...b.defaultParams },
                          })
                        }
                        className="px-1.5 py-0.5 rounded bg-[#222228] hover:bg-[#2c2c34] text-[10px] text-zinc-300 border border-[#2e2e36]"
                      >
                        + {b.label}
                      </button>
                    ))}
                  </div>
                  {(node.visualBlocks || []).map((blk) => (
                    <div
                      key={blk.id}
                      className="p-1.5 rounded bg-[#1c1c21] border border-[#2a2a32] text-[10px] space-y-1"
                    >
                      <div className="flex items-center justify-between text-zinc-300">
                        <span>{blk.kind}</span>
                        <button
                          onClick={() => onRemoveVisualBlock(node.id, blk.id)}
                          className="icon-btn !w-4 !h-4"
                        >
                          <Trash2 className="w-2.5 h-2.5" strokeWidth={1.6} />
                        </button>
                      </div>
                      {Object.entries(blk.params).map(([k, v]) => (
                        <input
                          key={k}
                          type="text"
                          value={String(v)}
                          onChange={(e) =>
                            onUpdateVisualBlock(node.id, blk.id, { [k]: e.target.value })
                          }
                          className="w-full px-1.5 py-0.5 text-[10px]"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
