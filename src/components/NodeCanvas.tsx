import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Blocks,
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
} from '../types';
import { getBackgroundById } from '../data/assets';
import { NODE_CATEGORIES, NODE_REGISTRY, getNodeMeta } from '../data/nodeRegistry';

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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeCat, setActiveCat] = useState<NodeCategory>('control');

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

  const CARD_WIDTH = 228;
  const edges: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    active: boolean;
  }[] = [];

  visibleNodes.forEach((node) => {
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
            from: { x: fromX, y: fromY + idx * 12 },
            to: { x: target.position.x, y: target.position.y + 44 },
            active: isFromSelected || target.id === selectedNodeId,
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
        });
      }
      if (fNode) {
        edges.push({
          from: { x: fromX, y: fromY + 10 },
          to: { x: fNode.position.x, y: fNode.position.y + 44 },
          active: isFromSelected,
        });
      }
    } else if (node.nextNodeId) {
      const target = visibleNodes.find((n) => n.id === node.nextNodeId);
      if (target) {
        edges.push({
          from: { x: fromX, y: fromY },
          to: { x: target.position.x, y: target.position.y + 44 },
          active: isFromSelected || target.id === selectedNodeId,
        });
      }
    }
  });

  const getNodeSummary = (node: SceneNode): string => {
    if (node.screenTextConfig) return node.screenTextConfig.text;
    if (node.type === 'condition' && node.conditionRule) {
      return `IF ${node.conditionRule.attributeKey} ${node.conditionRule.operator} ${node.conditionRule.compareValue}`;
    }
    if (node.choices.length > 0) {
      return `${node.choices.length} 个分支选项`;
    }
    const line = node.dialogues[0];
    if (line) {
      return `${line.speakerName}：${line.text}`;
    }
    return node.title;
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
            className="icon-btn"
            title="添加节点"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
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

      {/* Categorized Quick-Add Popover */}
      {showAddMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="canvas-Floating-ui absolute top-12 left-3 z-40 w-80 bg-[#18181c] border border-[#2e2e36] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Category Tabs */}
          <div className="p-1.5 bg-[#141417] border-b border-[#27272c] flex flex-wrap gap-1">
            {NODE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={`px-2 py-0.5 rounded text-[11px] transition ${
                  activeCat === cat.id
                    ? 'bg-zinc-200 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Nodes in Selected Category */}
          <div className="p-2 grid grid-cols-2 gap-1 max-h-60 overflow-y-auto">
            {NODE_REGISTRY.filter((n) => n.category === activeCat).map((meta) => (
              <button
                key={meta.type}
                onClick={() => {
                  onAddNode(meta.type);
                  setShowAddMenu(false);
                }}
                className="px-2.5 py-1.5 rounded bg-[#202025] hover:bg-[#2a2a30] border border-[#2c2c34] text-left transition flex items-center justify-between"
              >
                <span className="text-xs text-zinc-200">{meta.title}</span>
                <Plus className="w-3 h-3 text-zinc-500" strokeWidth={1.6} />
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
        {/* Clean Monochrome Bezier Edges */}
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
                  stroke={edge.active ? '#d4d4d8' : '#3f3f46'}
                  strokeWidth={edge.active ? 2 : 1.5}
                />
                <circle
                  cx={edge.to.x}
                  cy={edge.to.y}
                  r={3}
                  fill={edge.active ? '#f4f4f5' : '#52525b'}
                />
              </g>
            );
          })}
        </svg>

        {/* Compact, Uncluttered Node Cards */}
        {visibleNodes.map((node) => {
          const meta = getNodeMeta(node.type);
          const bg = getBackgroundById(node.backgroundId);
          const isSelected = node.id === selectedNodeId;
          const isStart = node.id === startNodeId;
          const isBlocksOpen = openBlockNodeId === node.id;

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
                width: CARD_WIDTH,
              }}
              className={`vn-node-card group absolute rounded-lg bg-[#18181c] border transition cursor-pointer ${
                isSelected
                  ? 'border-zinc-200 ring-1 ring-zinc-200/20 shadow-2xl z-20'
                  : 'border-[#2a2a32] hover:border-zinc-600 z-10 shadow-md'
              }`}
            >
              {/* Input / Output Port Dots */}
              <div className="absolute -left-1.5 top-10 w-2.5 h-2.5 rounded-full bg-[#27272c] border border-zinc-500" />
              <div className="absolute -right-1.5 top-10 w-2.5 h-2.5 rounded-full bg-zinc-300 border border-zinc-900" />

              {/* Header: Category Tag + Title + Hover Actions */}
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#25252c]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-[#27272c] text-zinc-300 text-[10px] font-medium shrink-0">
                    {meta.categoryLabel}
                  </span>
                  <span className="text-xs font-medium text-zinc-100 truncate">
                    {node.title}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenBlockNodeId(isBlocksOpen ? null : node.id);
                    }}
                    className="icon-btn !w-5 !h-5"
                    title="积木脚本"
                  >
                    <Blocks className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    className="icon-btn !w-5 !h-5"
                    title="删除节点"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                  </button>
                </div>
              </div>

              {/* Concise 1-Line Body */}
              <div className="px-2.5 py-2 space-y-1.5">
                <div className="text-[11px] text-zinc-400 truncate">
                  {getNodeSummary(node)}
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                  <span className="truncate max-w-[140px]">{bg.name}</span>
                  {isStart && (
                    <span className="px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-950 font-semibold text-[9px]">
                      起点
                    </span>
                  )}
                </div>
              </div>

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
