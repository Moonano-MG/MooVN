import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Blocks,
  ChevronDown,
  ChevronUp,
  Search,
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
import { getBackgroundById, BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets';
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

const SCRATCH_PALETTE: {
  kind: VisualBlockKind;
  category: VisualBlockCategory;
  label: string;
  color: string;
  defaultParams: Record<string, string | number | boolean>;
}[] = [
  {
    kind: 'say',
    category: 'narrative',
    label: '角色台词',
    color: 'bg-sky-600 border-sky-400',
    defaultParams: { speaker: '星野雪奈', text: '在钟声落下之前，请握紧我的手。' },
  },
  {
    kind: 'screen_text',
    category: 'screen_text',
    label: '屏幕自由文字',
    color: 'bg-fuchsia-600 border-fuchsia-400',
    defaultParams: { text: '第十三声钟鸣', x: 50, y: 45, fontSize: 32 },
  },
  {
    kind: 'fade_target',
    category: 'visual',
    label: '淡入淡出',
    color: 'bg-teal-600 border-teal-400',
    defaultParams: { target: 'screen', direction: 'in', durationMs: 800 },
  },
  {
    kind: 'switch_expr',
    category: 'character',
    label: '切换立绘表情',
    color: 'bg-rose-600 border-rose-400',
    defaultParams: { character: 'yukina', spriteId: 'char-yukina-8' },
  },
  {
    kind: 'move_char_tween',
    category: 'character',
    label: '立绘补间位移',
    color: 'bg-pink-600 border-pink-400',
    defaultParams: { character: 'yukina', targetX: 50, targetY: 55, durationMs: 600 },
  },
  {
    kind: 'modify_affection',
    category: 'control',
    label: '修改好感度',
    color: 'bg-amber-600 border-amber-400',
    defaultParams: { character: 'yukina', delta: 10 },
  },
  {
    kind: 'camera_effect',
    category: 'visual',
    label: '镜头推拉/震动',
    color: 'bg-cyan-600 border-cyan-400',
    defaultParams: { zoom: 1.2, shake: 'medium', durationMs: 600 },
  },
  {
    kind: 'call_bridge_script',
    category: 'script',
    label: '跨语言桥接脚本',
    color: 'bg-emerald-600 border-emerald-400',
    defaultParams: { lang: 'lua', fn: 'onClockResonance' },
  },
];

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  nodes,
  chapters,
  characters,
  startNodeId,
  selectedNodeId,
  selectedChapterId,
  onSelectNode,
  onUpdateNode,
  onAddNode,
  onDeleteNode,
  onAddVisualBlock,
  onUpdateVisualBlock,
  onRemoveVisualBlock,
}) => {
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [filterChapter, setFilterChapter] = useState<string>('all');
  const [expandedBlockDrawerIds, setExpandedBlockDrawerIds] = useState<Record<string, boolean>>({});
  const [showNodeCatalog, setShowNodeCatalog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NodeCategory | 'all'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  const visibleNodes =
    filterChapter === 'all' ? nodes : nodes.filter((n) => n.chapterId === filterChapter);

  const filteredCatalog = NODE_REGISTRY.filter((item) => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchQuery =
      !catalogSearch.trim() ||
      item.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.categoryLabel.includes(catalogSearch) ||
      item.description.toLowerCase().includes(catalogSearch.toLowerCase());
    return matchCat && matchQuery;
  });

  const toggleBlockDrawer = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBlockDrawerIds((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.vn-node-card')) return;
    if ((e.target as HTMLElement).closest('.node-catalog-popover')) return;
    setShowNodeCatalog(false);
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
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

  const edges: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    color: string;
    label?: string;
  }[] = [];

  const CARD_WIDTH = 288;

  visibleNodes.forEach((node) => {
    const fromX = node.position.x + CARD_WIDTH;
    const fromY = node.position.y + 66;

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
            from: { x: fromX, y: fromY + idx * 20 },
            to: { x: target.position.x, y: target.position.y + 52 },
            color: '#f59e0b',
            label: choice.affectionDelta
              ? `${choice.affectionDelta > 0 ? '+' : ''}${choice.affectionDelta}`
              : undefined,
          });
        }
      });
    } else if (node.type === 'condition' && node.conditionRule) {
      const trueTarget = visibleNodes.find((n) => n.id === node.conditionRule?.trueTargetNodeId);
      const falseTarget = visibleNodes.find((n) => n.id === node.conditionRule?.falseTargetNodeId);
      if (trueTarget) {
        edges.push({
          from: { x: fromX, y: fromY - 8 },
          to: { x: trueTarget.position.x, y: trueTarget.position.y + 44 },
          color: '#34d399',
          label: 'TRUE',
        });
      }
      if (falseTarget) {
        edges.push({
          from: { x: fromX, y: fromY + 18 },
          to: { x: falseTarget.position.x, y: falseTarget.position.y + 68 },
          color: '#fb7185',
          label: 'FALSE',
        });
      }
    } else if (node.nextNodeId) {
      const target = visibleNodes.find((n) => n.id === node.nextNodeId);
      if (target) {
        const meta = getNodeMeta(node.type);
        edges.push({
          from: { x: fromX, y: fromY },
          to: { x: target.position.x, y: target.position.y + 52 },
          color: meta.accentColor,
        });
      }
    }
  });

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full overflow-hidden bg-[#141418] select-none cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(148, 163, 184, 0.13) 1px, transparent 1px)',
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Top Toolbar */}
      <div className="node-catalog-popover absolute top-2.5 left-2.5 right-2.5 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#1f1f23]/95 backdrop-blur-md border border-[#333338] rounded-md px-2 py-1 pointer-events-auto shadow-lg">
          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#007acc]"
          >
            <option value="all">全部章节 ({nodes.length} 节点)</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNodeCatalog((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-[11px] font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            添加节点 ({NODE_REGISTRY.length}种类型)
          </button>

          {/* Quick Category Creation Pills */}
          <div className="hidden xl:flex items-center gap-1 pl-1 border-l border-[#333338]">
            {(
              [
                ['dialogue', '叙事', '对话'],
                ['screen_text', '屏幕文字', '屏幕字'],
                ['choice', '控制', '分支'],
                ['timed_choice', '控制', '限时抉择'],
                ['condition', '控制', '条件If'],
                ['char_expression', '角色', '表情切换'],
                ['fade', '视觉', '淡入淡出'],
                ['camera_shake', '视觉', '震动'],
              ] as const
            ).map(([type, catLabel, shortTitle]) => {
              const meta = getNodeMeta(type);
              return (
                <button
                  key={type}
                  onClick={() => onAddNode(type)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#2f2f35] border border-[#38383e] text-[11px] text-slate-200 transition"
                  title={`添加 [${catLabel}] ${meta.title}`}
                >
                  <span
                    className="px-1 py-0.2 rounded text-[9px] font-bold"
                    style={{ background: meta.badgeBg, color: meta.badgeText }}
                  >
                    {catLabel}
                  </span>
                  <span>{shortTitle}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[#1f1f23]/95 backdrop-blur-md border border-[#333338] rounded-md px-2 py-1 pointer-events-auto shadow-lg">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#2a2d2e]"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-300 w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#2a2d2e]"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoom(0.92);
              setPan({ x: 24, y: 24 });
            }}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#2a2d2e]"
            title="重置视图"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 40-Node Categorized Library Popover */}
      {showNodeCatalog && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="node-catalog-popover absolute top-12 left-2.5 z-40 w-[560px] max-w-[94vw] max-h-[78vh] bg-[#1e1e22] border border-[#3c3c42] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="p-3 bg-[#252529] border-b border-[#333338] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                节点类型库（共 {NODE_REGISTRY.length} 种带类型标节点）
              </span>
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="搜索节点或类型标 (如 控制 / 屏幕文字)..."
                  className="w-full bg-[#18181b] border border-[#3c3c42] rounded pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#007acc]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  selectedCategory === 'all'
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#18181b] text-slate-400 hover:text-white'
                }`}
              >
                全部 ({NODE_REGISTRY.length})
              </button>
              {NODE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition border ${
                    selectedCategory === cat.id
                      ? 'border-white text-white'
                      : 'border-transparent hover:border-slate-600'
                  }`}
                  style={{ background: cat.badgeBg, color: cat.badgeText }}
                >
                  [{cat.label}]
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
            {filteredCatalog.map((meta) => (
              <button
                key={meta.type}
                onClick={() => {
                  onAddNode(meta.type);
                  setShowNodeCatalog(false);
                }}
                className="flex flex-col justify-between p-2.5 rounded-lg bg-[#252529] hover:bg-[#2d2d33] border border-[#34343a] hover:border-[#007acc] text-left transition group"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="text-xs font-bold text-white group-hover:text-sky-300">
                      {meta.title}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                      style={{ background: meta.badgeBg, color: meta.badgeText }}
                    >
                      {meta.categoryLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">
                    {meta.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transform Canvas */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="relative w-[4200px] h-[3000px]"
      >
        {/* Bezier Edges SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          {edges.map((edge, i) => {
            const dx = Math.max(Math.abs(edge.to.x - edge.from.x) * 0.5, 65);
            const path = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + dx} ${edge.from.y}, ${
              edge.to.x - dx
            } ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
            const midX = (edge.from.x + edge.to.x) / 2;
            const midY = (edge.from.y + edge.to.y) / 2;
            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={2.4}
                  strokeOpacity={0.75}
                />
                <circle cx={edge.to.x} cy={edge.to.y} r={4} fill={edge.color} />
                {edge.label && (
                  <g transform={`translate(${midX - 18}, ${midY - 10})`}>
                    <rect
                      width="38"
                      height="16"
                      rx="4"
                      fill="#18181b"
                      stroke={edge.color}
                      strokeWidth="1"
                    />
                    <text
                      x="19"
                      y="11"
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Workflow Node Cards */}
        {visibleNodes.map((node) => {
          const meta = getNodeMeta(node.type);
          const bg = getBackgroundById(node.backgroundId);
          const isSelected = node.id === selectedNodeId;
          const isStart = node.id === startNodeId;
          const firstLine = node.dialogues[0];
          const chObj = chapters.find((c) => c.id === node.chapterId);
          const isDrawerOpen = !!expandedBlockDrawerIds[node.id];

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
                borderColor: isSelected ? meta.accentColor : '#2e2e36',
              }}
              className={`vn-node-card absolute rounded-xl bg-[#1d1d22]/95 backdrop-blur-md border-2 transition-shadow cursor-pointer ${
                isSelected ? 'shadow-2xl z-20' : 'hover:border-slate-600 z-10 shadow-lg'
              }`}
            >
              {/* Node Header with Category Tag Badge (类型标) */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-t-[10px] border-b border-[#2e2e36]"
                style={{
                  background: `linear-gradient(90deg, ${meta.badgeBg}, rgba(29,29,34,0.95))`,
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* 类型标 Category Tag */}
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-wide shrink-0 border"
                    style={{
                      background: meta.badgeBg,
                      color: meta.badgeText,
                      borderColor: `${meta.accentColor}55`,
                    }}
                  >
                    {meta.categoryLabel}
                  </span>
                  <span className="text-xs font-bold text-white truncate">{node.title}</span>
                  {isStart && (
                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded shrink-0">
                      入口
                    </span>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNode(node.id);
                  }}
                  className="p-0.5 text-slate-400 hover:text-rose-400 transition shrink-0"
                  title="删除节点"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Background Strip */}
              <div
                className="h-12 w-full bg-cover bg-center relative"
                style={{ backgroundImage: `url(${bg.path})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d22] via-[#1d1d22]/35 to-transparent" />
                <div className="absolute bottom-1 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-slate-300">
                  <span className="truncate">{bg.name}</span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {chObj?.yamlFileName || 'chapter.yaml'}
                  </span>
                </div>
              </div>

              {/* Body by Node Category / Type */}
              <div className="p-2.5 space-y-2">
                {/* Screen Text Nodes (`screen_text`, `chapter_title`, `floating_subtitle`, `banner_notice`) */}
                {node.screenTextConfig && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded bg-fuchsia-950/25 border border-fuchsia-500/30 space-y-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between text-fuchsia-300 font-semibold">
                      <span>屏幕显示文字</span>
                      <span className="text-[10px] font-mono">
                        ({node.screenTextConfig.x}%, {node.screenTextConfig.y}%) ·{' '}
                        {node.screenTextConfig.fontSize}px
                      </span>
                    </div>
                    <input
                      type="text"
                      value={node.screenTextConfig.text}
                      onChange={(e) =>
                        onUpdateNode(node.id, (prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...prev.screenTextConfig!,
                            text: e.target.value,
                          },
                        }))
                      }
                      className="w-full bg-[#141418] border border-[#34343c] rounded px-2 py-1 text-[11px] text-white"
                    />
                  </div>
                )}

                {/* Timed Choice Countdown */}
                {node.type === 'timed_choice' && (
                  <div className="flex items-center justify-between px-2 py-1 rounded bg-orange-950/30 border border-orange-500/30 text-[10px] text-orange-300">
                    <span>限时倒计时</span>
                    <span className="font-mono font-bold">{node.timedChoiceSeconds || 12} 秒</span>
                  </div>
                )}

                {/* Condition Rule Summary */}
                {node.type === 'condition' && node.conditionRule && (
                  <div className="p-2 rounded bg-amber-950/25 border border-amber-500/30 text-[10px] space-y-1">
                    <div className="text-amber-300 font-mono">
                      IF {node.conditionRule.characterId}.{node.conditionRule.attributeKey}{' '}
                      {node.conditionRule.operator} {String(node.conditionRule.compareValue)}
                    </div>
                    <div className="flex justify-between text-emerald-300">
                      <span>真分支:</span>
                      <span className="truncate max-w-[160px]">
                        {nodes.find((n) => n.id === node.conditionRule?.trueTargetNodeId)?.title ||
                          '未连接'}
                      </span>
                    </div>
                    <div className="flex justify-between text-rose-300">
                      <span>假分支:</span>
                      <span className="truncate max-w-[160px]">
                        {nodes.find((n) => n.id === node.conditionRule?.falseTargetNodeId)?.title ||
                          '未连接'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Fade Config Summary */}
                {node.type === 'fade' && node.fadeConfig && (
                  <div className="p-2 rounded bg-teal-950/25 border border-teal-500/30 text-[10px] text-teal-200 flex items-center justify-between">
                    <span>
                      目标:{' '}
                      {node.fadeConfig.targetType === 'character'
                        ? '角色'
                        : node.fadeConfig.targetType === 'background'
                        ? '背景'
                        : '整屏'}
                    </span>
                    <span>
                      {node.fadeConfig.direction === 'in' ? '淡入' : '淡出'} ·{' '}
                      {node.fadeConfig.durationMs}ms
                    </span>
                  </div>
                )}

                {/* Character Expression Switch Summary */}
                {node.type === 'char_expression' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded bg-rose-950/25 border border-rose-500/30 text-[10px] space-y-1"
                  >
                    <div className="text-rose-300 font-semibold">切换角色表情差分</div>
                    <select
                      value={node.targetExpressionSpriteId || CHARACTER_ASSETS[0].id}
                      onChange={(e) =>
                        onUpdateNode(node.id, (prev) => ({
                          ...prev,
                          targetExpressionSpriteId: e.target.value,
                        }))
                      }
                      className="w-full bg-[#141418] border border-[#34343c] rounded px-1.5 py-1 text-[10px] text-white"
                    >
                      {CHARACTER_ASSETS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Dialogue Preview */}
                {firstLine && !node.screenTextConfig && (
                  <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed bg-[#141418] p-2 rounded border border-[#292930]">
                    <span
                      className="font-semibold mr-1.5"
                      style={{ color: firstLine.speakerColor }}
                    >
                      [{firstLine.speakerName}]
                    </span>
                    {firstLine.text}
                  </div>
                )}

                {/* Choices Preview */}
                {node.choices.length > 0 && (
                  <div className="space-y-1">
                    {node.choices.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="text-[10px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/25 text-amber-200 truncate"
                      >
                        • {c.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Scratch Visual Blocks Drawer Toggle */}
                <div className="pt-1 border-t border-[#292930] flex items-center justify-between">
                  <button
                    onClick={(e) => toggleBlockDrawer(node.id, e)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#25252b] hover:bg-[#2f2f37] text-[10px] text-sky-300 transition"
                  >
                    <Blocks className="w-3 h-3" />
                    <span>积木 ({node.visualBlocks?.length || 0})</span>
                    {isDrawerOpen ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  <span className="text-[10px] text-slate-400">
                    立绘 {node.characters.length} · 台词 {node.dialogues.length}
                  </span>
                </div>

                {isDrawerOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 p-2 rounded-lg bg-[#141418] border border-[#2e2e36] space-y-2"
                  >
                    <div className="flex flex-wrap gap-1">
                      {SCRATCH_PALETTE.map((item) => (
                        <button
                          key={item.kind}
                          onClick={() =>
                            onAddVisualBlock(node.id, {
                              id: `vb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                              category: item.category,
                              kind: item.kind,
                              params: { ...item.defaultParams },
                            })
                          }
                          className={`px-1.5 py-0.5 rounded text-[9px] font-medium text-white border ${item.color} hover:brightness-110 transition`}
                        >
                          + {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(node.visualBlocks || []).map((blk) => (
                        <div
                          key={blk.id}
                          className="p-1.5 rounded bg-[#1f1f25] border border-[#34343d] text-[10px] text-slate-200 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sky-300">{blk.kind}</span>
                            <button
                              onClick={() => onRemoveVisualBlock(node.id, blk.id)}
                              className="text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(blk.params).map(([k, v]) => (
                              <input
                                key={k}
                                type="text"
                                value={String(v)}
                                onChange={(e) =>
                                  onUpdateVisualBlock(node.id, blk.id, { [k]: e.target.value })
                                }
                                className="bg-[#141418] border border-[#34343d] rounded px-1.5 py-0.5 text-[10px] text-white"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
