import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  GitBranch,
  Flag,
  Copy,
  Trash2,
  Maximize,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  UserCheck,
  Image as ImageIcon,
  Music,
  Code2,
  Plus,
  Sparkles,
  Type,
  Blocks,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type {
  EdgeRef,
  EditorTheme,
  NodeType,
  ScratchBlockKind,
  StoryNode,
} from "../types";
import { ENDING_LABELS, NODE_TYPE_LABELS, SCRATCH_BLOCK_META } from "../types";
import { BACKGROUNDS, backgroundById } from "../data/assets";
import { charById, nodeById, reachableNodeIds, scratchBlockToTsLine } from "../lib/projectUtils";

export const NODE_WIDTH = 248;
const HEADER_H = 34;
const BODY_TOP = HEADER_H + 8;
const BODY_H = 58;
const PORT_ROW_H = 26;

export function getNodeHeight(node: StoryNode): number {
  const blocksCount = Math.min(3, node.blocks?.length ?? 0);
  const blocksH = blocksCount > 0 ? blocksCount * 22 + 10 : 0;
  if (node.type === "choice") {
    return BODY_TOP + BODY_H + blocksH + 8 + Math.max(1, node.choices.length) * PORT_ROW_H + 10;
  }
  return BODY_TOP + BODY_H + blocksH + 14;
}

export function getOutPortOffsetY(node: StoryNode, port: number): number {
  const blocksCount = Math.min(3, node.blocks?.length ?? 0);
  const blocksH = blocksCount > 0 ? blocksCount * 22 + 10 : 0;
  if (node.type === "choice" && port >= 0) {
    return BODY_TOP + BODY_H + blocksH + 8 + port * PORT_ROW_H + PORT_ROW_H / 2;
  }
  return HEADER_H + (getNodeHeight(node) - HEADER_H) / 2;
}

export function getInPortOffsetY(): number {
  return HEADER_H + 28;
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(64, Math.min(220, Math.abs(x2 - x1) * 0.5));
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface NodeCanvasProps {
  editor: Editor;
  theme: EditorTheme;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  notify: (msg: string) => void;
}

interface ConnectingState {
  edge: EdgeRef;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface ContextMenuState {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  nodeId: string | null;
}

const ALL_SCRATCH_KINDS: ScratchBlockKind[] = [
  "fade",
  "screen_text",
  "say",
  "char",
  "bg",
  "animate",
  "affection",
  "ts_code",
  "bridge_call",
];

export default function NodeCanvas({
  editor,
  theme,
  viewport,
  onViewportChange,
  notify,
}: NodeCanvasProps) {
  const { project, selectedNodeId, selectedNode, selectedEdge } = editor;
  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showScratchDrawer, setShowScratchDrawer] = useState(true);

  const reachable = useMemo(() => reachableNodeIds(project), [project]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const ox = rect ? clientX - rect.left : clientX;
      const oy = rect ? clientY - rect.top : clientY;
      return {
        x: (ox - viewport.x) / viewport.zoom,
        y: (oy - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const fitView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || project.nodes.length === 0) {
      onViewportChange({ x: 80, y: 80, zoom: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of project.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.y + getNodeHeight(n));
    }
    const pad = 70;
    const bw = Math.max(300, maxX - minX + pad * 2);
    const bh = Math.max(240, maxY - minY + pad * 2);
    const zoom = Math.max(0.4, Math.min(1.15, Math.min(rect.width / bw, rect.height / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    onViewportChange({
      x: Math.round(rect.width / 2 - cx * zoom),
      y: Math.round(rect.height / 2 - cy * zoom),
      zoom: Number(zoom.toFixed(2)),
    });
  }, [project.nodes, onViewportChange]);

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = clientX !== undefined && rect ? clientX - rect.left : (rect?.width ?? 800) / 2;
    const cy = clientY !== undefined && rect ? clientY - rect.top : (rect?.height ?? 500) / 2;
    const nextZoom = Math.max(0.35, Math.min(1.8, Number((viewport.zoom * factor).toFixed(3))));
    const wx = (cx - viewport.x) / viewport.zoom;
    const wy = (cy - viewport.y) / viewport.zoom;
    onViewportChange({
      x: Math.round(cx - wx * nextZoom),
      y: Math.round(cy - wy * nextZoom),
      zoom: nextZoom,
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    } else {
      onViewportChange({
        ...viewport,
        x: viewport.x - e.deltaX,
        y: viewport.y - e.deltaY,
      });
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setMenu(null);
    setMoreMenuOpen(false);
    const isMiddle = e.button === 1;
    const isLeftBg = e.button === 0 && (e.target === e.currentTarget || spaceDown);
    if (!isMiddle && !isLeftBg) return;

    if (e.button === 0 && !spaceDown) {
      editor.selectNode(null);
      editor.selectEdge(null);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = viewport.x;
    const origY = viewport.y;
    setPanning(true);

    const onMove = (ev: MouseEvent) => {
      onViewportChange({
        ...viewport,
        x: origX + (ev.clientX - startX),
        y: origY + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startDragNode = (e: React.MouseEvent, node: StoryNode) => {
    if (e.button !== 0 || spaceDown) return;
    e.stopPropagation();
    setMenu(null);
    editor.selectNode(node.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = node.x;
    const origY = node.y;
    const z = viewport.zoom;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      editor.moveNode(node.id, Math.round((origX + dx) / 4) * 4, Math.round((origY + dy) / 4) * 4);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startConnect = (e: React.MouseEvent, node: StoryNode, port: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const startX = node.x + NODE_WIDTH;
    const startY = node.y + getOutPortOffsetY(node, port);
    const w = screenToWorld(e.clientX, e.clientY);
    const state: ConnectingState = {
      edge: { fromNodeId: node.id, port },
      startX,
      startY,
      curX: w.x,
      curY: w.y,
    };
    setConnecting(state);

    let latestTarget: string | null = null;
    const onMove = (ev: MouseEvent) => {
      const pt = screenToWorld(ev.clientX, ev.clientY);
      let found: string | null = null;
      for (const candidate of project.nodes) {
        if (candidate.id === node.id) continue;
        const h = getNodeHeight(candidate);
        if (pt.x >= candidate.x - 16 && pt.x <= candidate.x + NODE_WIDTH && pt.y >= candidate.y && pt.y <= candidate.y + h) {
          found = candidate.id;
          break;
        }
      }
      latestTarget = found;
      setHoverTargetId(found);
      setConnecting((prev) => (prev ? { ...prev, curX: pt.x, curY: pt.y } : null));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (latestTarget) {
        editor.connect({ fromNodeId: node.id, port }, latestTarget);
      }
      setHoverTargetId(null);
      setConnecting(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const edges = useMemo(() => {
    const list: {
      key: string;
      edge: EdgeRef;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind: "dialogue" | "choice";
    }[] = [];

    for (const n of project.nodes) {
      if (n.type !== "choice" && n.type !== "end" && n.nextNodeId) {
        const target = nodeById(project, n.nextNodeId);
        if (target) {
          list.push({
            key: `${n.id}->next`,
            edge: { fromNodeId: n.id, port: -1 },
            x1: n.x + NODE_WIDTH,
            y1: n.y + getOutPortOffsetY(n, -1),
            x2: target.x,
            y2: target.y + getInPortOffsetY(),
            kind: "dialogue",
          });
        }
      }
      if (n.type === "choice") {
        n.choices.forEach((c, idx) => {
          if (!c.targetNodeId) return;
          const target = nodeById(project, c.targetNodeId);
          if (!target) return;
          list.push({
            key: `${n.id}->c${idx}`,
            edge: { fromNodeId: n.id, port: idx },
            x1: n.x + NODE_WIDTH,
            y1: n.y + getOutPortOffsetY(n, idx),
            x2: target.x,
            y2: target.y + getInPortOffsetY(),
            kind: "choice",
          });
        });
      }
    }
    return list;
  }, [project]);

  const spawnAtCenter = (type: NodeType) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 700) / 2;
    const cy = (rect?.height ?? 460) / 2;
    const wx = (cx - viewport.x) / viewport.zoom - NODE_WIDTH / 2 + (Math.random() * 40 - 20);
    const wy = (cy - viewport.y) / viewport.zoom - 50 + (Math.random() * 40 - 20);
    editor.addNode(type, wx, wy);
    setMoreMenuOpen(false);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden select-none">
      {/* 上半部：Dify 工作流画布 */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const w = screenToWorld(e.clientX, e.clientY);
          editor.addNode("dialogue", w.x - NODE_WIDTH / 2, w.y - 40);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const blockKind = e.dataTransfer.getData("text/moovn-scratch-kind") as ScratchBlockKind;
          if (blockKind) {
            const w = screenToWorld(e.clientX, e.clientY);
            const nodeType: NodeType =
              blockKind === "fade"
                ? "fade"
                : blockKind === "screen_text"
                  ? "screen_text"
                  : blockKind === "ts_code" || blockKind === "bridge_call"
                    ? "script"
                    : "dialogue";
            const newId = editor.addNode(nodeType, w.x - NODE_WIDTH / 2, w.y - 40);
            if (nodeType === "dialogue" || nodeType === "script") {
              editor.addBlockToNode(newId, blockKind);
            }
            notify(`已通过拖拽积木创建新节点`);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const w = screenToWorld(e.clientX, e.clientY);
          const rect = containerRef.current?.getBoundingClientRect();
          setMenu({
            screenX: e.clientX - (rect?.left ?? 0),
            screenY: e.clientY - (rect?.top ?? 0),
            worldX: w.x,
            worldY: w.y,
            nodeId: null,
          });
        }}
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        }}
        className={`relative min-h-0 flex-1 overflow-hidden ${
          theme === "light" ? "canvas-dots-light bg-[#f3f5f9]" : "canvas-dots-dark bg-[#09090b]"
        } ${panning || spaceDown ? "cursor-grabbing" : "cursor-default"}`}
      >
        {/* 世界层 */}
        <div
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
          className="pointer-events-none absolute top-0 left-0 h-0 w-0"
        >
          {/* 连线 SVG */}
          <svg className="pointer-events-auto overflow-visible" style={{ width: 1, height: 1 }}>
            {edges.map((item) => {
              const isSel =
                selectedEdge?.fromNodeId === item.edge.fromNodeId && selectedEdge?.port === item.edge.port;
              const d = bezierPath(item.x1, item.y1, item.x2, item.y2);
              const color = isSel ? "#38bdf8" : item.kind === "choice" ? "#fbbf24" : "#38bdf8";
              return (
                <g
                  key={item.key}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.selectEdge(item.edge);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    editor.connect(item.edge, null);
                    notify("已断开连线");
                  }}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeOpacity={isSel ? 1 : 0.65}
                    strokeWidth={isSel ? 3 : 2}
                    strokeLinecap="round"
                  />
                  <circle cx={item.x2} cy={item.y2} r={isSel ? 4.5 : 3} fill={color} />
                </g>
              );
            })}
            {connecting && (
              <path
                d={bezierPath(connecting.startX, connecting.startY, connecting.curX, connecting.curY)}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.2}
                strokeDasharray="6 4"
              />
            )}
          </svg>

          {/* 节点卡片（支持直接拖入 Scratch 积木块或美术资源） */}
          {project.nodes.map((node) => {
            const selected = selectedNodeId === node.id;
            const isStart = project.startNodeId === node.id;
            const isHoverTarget = hoverTargetId === node.id || dropTargetNodeId === node.id;
            const isOrphan = !reachable.has(node.id);
            const bg = backgroundById(node.backgroundId);
            const firstLine = node.lines[0];
            const speaker = firstLine?.characterId ? charById(project, firstLine.characterId) : null;
            const h = getNodeHeight(node);
            const blocks = node.blocks ?? [];

            const headerStyle =
              node.type === "choice"
                ? "bg-amber-400/12 text-amber-200 border-amber-400/20"
                : node.type === "end"
                  ? "bg-emerald-400/12 text-emerald-200 border-emerald-400/20"
                  : node.type === "fade"
                    ? "bg-cyan-400/12 text-cyan-200 border-cyan-400/20"
                    : node.type === "screen_text"
                      ? "bg-pink-400/12 text-pink-200 border-pink-400/20"
                      : node.type === "script"
                        ? "bg-indigo-400/12 text-indigo-200 border-indigo-400/20"
                        : "bg-sky-400/12 text-sky-200 border-sky-400/20";

            return (
              <div
                key={node.id}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: NODE_WIDTH,
                  height: h,
                }}
                onMouseDown={(e) => startDragNode(e, node)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTargetNodeId(node.id);
                }}
                onDragLeave={() => setDropTargetNodeId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTargetNodeId(null);
                  const blockKind = e.dataTransfer.getData("text/moovn-scratch-kind") as ScratchBlockKind;
                  if (blockKind) {
                    editor.addBlockToNode(node.id, blockKind);
                    editor.selectNode(node.id);
                    notify(`已将「${SCRATCH_BLOCK_META[blockKind].label}」积木放入「${node.title}」`);
                    return;
                  }
                  const assetRaw = e.dataTransfer.getData("application/moovn-asset");
                  if (assetRaw) {
                    try {
                      const asset = JSON.parse(assetRaw);
                      if (asset.type === "bg") {
                        editor.updateNode(node.id, { backgroundId: asset.id });
                        notify(`已更新「${node.title}」的背景`);
                      } else if (asset.type === "character" && asset.id) {
                        editor.upsertStageCharacter(node.id, asset.id, { x: 50, y: 54 });
                        notify(`已将角色加入「${node.title}」`);
                      }
                    } catch {
                      // ignore
                    }
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  editor.selectNode(node.id);
                  const w = screenToWorld(e.clientX, e.clientY);
                  const rect = containerRef.current?.getBoundingClientRect();
                  setMenu({
                    screenX: e.clientX - (rect?.left ?? 0),
                    screenY: e.clientY - (rect?.top ?? 0),
                    worldX: w.x,
                    worldY: w.y,
                    nodeId: node.id,
                  });
                }}
                className={`pointer-events-auto absolute top-0 left-0 rounded-2xl border bg-[#151519]/95 shadow-[0_14px_32px_rgba(0,0,0,0.48)] backdrop-blur-md transition-shadow ${
                  selected
                    ? "border-sky-400 ring-3 ring-sky-400/25"
                    : isHoverTarget
                      ? "border-emerald-400 ring-3 ring-emerald-400/30"
                      : "border-white/[0.09] hover:border-white/20"
                }`}
              >
                {/* 顶部色带 */}
                <div
                  style={{ height: HEADER_H }}
                  className={`flex items-center gap-1.5 rounded-t-2xl border-b px-3 text-[12px] font-semibold ${headerStyle}`}
                >
                  {node.type === "choice" && <GitBranch size={13} />}
                  {node.type === "end" && <Flag size={13} />}
                  {node.type === "fade" && <Sparkles size={13} />}
                  {node.type === "screen_text" && <Type size={13} />}
                  {node.type === "character" && <UserCheck size={13} />}
                  {node.type === "background" && <ImageIcon size={13} />}
                  {node.type === "audio" && <Music size={13} />}
                  {node.type === "script" && <Code2 size={13} />}
                  {node.type === "dialogue" && <MessageSquare size={13} />}
                  <span className="min-w-0 flex-1 truncate text-zinc-100">{node.title}</span>
                  {isStart && (
                    <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
                      起点
                    </span>
                  )}
                  {isOrphan && !isStart && (
                    <span title="没有从起点连通到此节点" className="text-amber-300">
                      <AlertTriangle size={12} />
                    </span>
                  )}
                </div>

                {/* 主体预览 */}
                <div style={{ height: BODY_H }} className="flex items-center gap-2.5 px-3 pt-2">
                  {bg ? (
                    <img
                      src={bg.url}
                      alt={bg.name}
                      draggable={false}
                      className="h-11 w-14 shrink-0 rounded-lg border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-[10px] text-zinc-600">
                      无背景
                    </div>
                  )}

                  <div className="min-w-0 flex-1 text-[11px] leading-snug">
                    {node.type === "end" ? (
                      <>
                        <div className="font-medium text-emerald-300">
                          {ENDING_LABELS[node.endingKind ?? "normal"]}
                        </div>
                        <div className="line-clamp-2 text-[10.5px] text-zinc-400">
                          {node.endingDescription || "故事在此落下帷幕"}
                        </div>
                      </>
                    ) : node.type === "fade" && node.fadeConfig ? (
                      <>
                        <div className="font-semibold text-cyan-300">
                          {node.fadeConfig.direction === "out" ? "淡出" : "淡入"} ·{" "}
                          {node.fadeConfig.target === "character"
                            ? charById(project, node.fadeConfig.characterId)?.name || "角色"
                            : node.fadeConfig.target === "background"
                              ? "背景场景"
                              : "整屏画面"}
                        </div>
                        <div className="text-[10.5px] text-zinc-400">
                          时长 {node.fadeConfig.durationMs}ms → 透明度 {node.fadeConfig.targetOpacity}
                        </div>
                      </>
                    ) : node.type === "screen_text" && node.screenTexts?.[0] ? (
                      <>
                        <div className="font-semibold text-pink-300">
                          屏幕文字 ({node.screenTexts[0].fontSize}px)
                        </div>
                        <div className="line-clamp-2 text-zinc-200">{node.screenTexts[0].text}</div>
                      </>
                    ) : (
                      <>
                        <div
                          className="truncate text-[10.5px] font-semibold"
                          style={{ color: speaker?.color ?? "#a1a1aa" }}
                        >
                          {speaker ? speaker.name : "旁白"}
                        </div>
                        <div className="line-clamp-2 text-zinc-300">
                          {firstLine?.text || <span className="text-zinc-600 italic">（空台词）</span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 节点内嵌 Scratch 积木块徽章预览 */}
                {blocks.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 border-t border-white/[0.06] px-2.5 pt-1.5">
                    {blocks.slice(0, 3).map((b) => {
                      const meta = SCRATCH_BLOCK_META[b.kind];
                      return (
                        <div
                          key={b.id}
                          className={`flex h-[18px] items-center justify-between rounded border px-1.5 text-[10px] ${meta.color}`}
                        >
                          <span className="truncate font-medium">{meta.label}</span>
                          <span className="font-mono text-[9px] opacity-75">{meta.badge}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 分支选项端口 */}
                {node.type === "choice" && (
                  <div className="mt-1 flex flex-col border-t border-white/[0.06] pt-1">
                    {node.choices.map((c, idx) => (
                      <div
                        key={c.id}
                        style={{ height: PORT_ROW_H }}
                        className="relative flex items-center justify-between pr-4 pl-3 text-[11px] text-zinc-300"
                      >
                        <span className="truncate">
                          <span className="mr-1 text-amber-300/80">{idx + 1}.</span>
                          {c.text || "（未命名选项）"}
                        </span>
                        <button
                          onMouseDown={(e) => startConnect(e, node, idx)}
                          title="拖拽连接到目标节点"
                          className={`absolute -right-[7px] h-3.5 w-3.5 rounded-full border-2 border-[#151519] transition hover:scale-125 ${
                            c.targetNodeId ? "bg-amber-400" : "bg-zinc-600 hover:bg-amber-300"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 输入端口 */}
                <div
                  style={{ top: getInPortOffsetY() - 7 }}
                  className={`-left-[7px] absolute h-3.5 w-3.5 rounded-full border-2 border-[#151519] transition ${
                    isHoverTarget ? "scale-125 bg-emerald-400" : "bg-zinc-500"
                  }`}
                />

                {/* 输出端口 */}
                {node.type !== "choice" && node.type !== "end" && (
                  <button
                    onMouseDown={(e) => startConnect(e, node, -1)}
                    title="拖拽连接到下一节点"
                    style={{ top: getOutPortOffsetY(node, -1) - 7 }}
                    className={`absolute -right-[7px] h-3.5 w-3.5 rounded-full border-2 border-[#151519] transition hover:scale-125 ${
                      node.nextNodeId ? "bg-sky-400" : "bg-zinc-600 hover:bg-sky-300"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 左上悬浮工具条：新增节点（包含淡入淡出节点、屏幕文字节点） + Scratch 积木抽屉开关 */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#151519]/92 p-1 shadow-xl backdrop-blur-md"
        >
          <button
            onClick={() => spawnAtCenter("dialogue")}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-sky-200 hover:bg-sky-500/20"
          >
            <MessageSquare size={12} /> + 对话
          </button>
          <button
            onClick={() => spawnAtCenter("choice")}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-amber-200 hover:bg-amber-400/20"
          >
            <GitBranch size={12} /> + 选择
          </button>
          <button
            onClick={() => spawnAtCenter("fade")}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-cyan-200 hover:bg-cyan-400/20"
          >
            <Sparkles size={12} /> + 淡入淡出
          </button>
          <button
            onClick={() => spawnAtCenter("screen_text")}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-pink-200 hover:bg-pink-400/20"
          >
            <Type size={12} /> + 屏幕文字
          </button>
          <button
            onClick={() => spawnAtCenter("end")}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-400/20"
          >
            <Flag size={12} /> + 结局
          </button>

          <div className="relative">
            <button
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-zinc-300 hover:bg-white/[0.08]"
            >
              <Plus size={12} /> 更多
            </button>
            {moreMenuOpen && (
              <div className="animate-pop-in absolute top-full left-0 mt-1.5 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#17171b] py-1 shadow-2xl">
                {(["character", "background", "audio", "script"] as NodeType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => spawnAtCenter(type)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]"
                  >
                    <span>+ {NODE_TYPE_LABELS[type]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-white/10" />

          <button
            onClick={() => setShowScratchDrawer((v) => !v)}
            className={`flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              showScratchDrawer
                ? "bg-sky-500 text-white"
                : "text-zinc-300 hover:bg-white/[0.08]"
            }`}
          >
            <Blocks size={12} /> Scratch 积木箱
          </button>

          <div className="mx-1 h-4 w-px bg-white/10" />
          <button
            onClick={() => zoomAt(0.9)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={() => onViewportChange({ ...viewport, zoom: 1 })}
            className="min-w-11 rounded-lg px-1 font-mono text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            onClick={() => zoomAt(1.1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={fitView}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
          >
            <Maximize size={12} />
          </button>
        </div>

        {/* 右键菜单 */}
        {menu && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ left: menu.screenX, top: menu.screenY }}
            className="animate-pop-in absolute z-30 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#17171b] py-1.5 shadow-2xl"
          >
            {menu.nodeId ? (
              <>
                <button
                  onClick={() => {
                    editor.setStartNode(menu.nodeId!);
                    setMenu(null);
                    notify("已设为故事起点");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]"
                >
                  <Flag size={13} /> 设为故事起点
                </button>
                <button
                  onClick={() => {
                    editor.duplicateNode(menu.nodeId!);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]"
                >
                  <Copy size={13} /> 复制节点
                </button>
                <div className="mx-3 my-1 h-px bg-white/[0.07]" />
                <button
                  onClick={() => {
                    editor.deleteNode(menu.nodeId!);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-rose-300 hover:bg-rose-500/15"
                >
                  <Trash2 size={13} /> 删除节点
                </button>
              </>
            ) : (
              <>
                {(
                  ["dialogue", "choice", "fade", "screen_text", "character", "background", "audio", "script", "end"] as NodeType[]
                ).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      editor.addNode(type, menu.worldX - NODE_WIDTH / 2, menu.worldY - 30);
                      setMenu(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]"
                  >
                    <span>在此新建{NODE_TYPE_LABELS[type]}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 下半部：Dify + Scratch 融合代码块工作台（可将积木拖入任意工作流节点，底层实时编译为 TypeScript） */}
      {showScratchDrawer && (
        <div className="flex h-60 shrink-0 border-t border-white/[0.08] bg-[#101015]">
          {/* 左侧：可拖拽 Scratch 积木箱 */}
          <div className="editor-scroll flex w-64 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-white/[0.06] p-2.5">
            <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-semibold text-zinc-400">
              <span>Scratch 积木箱（拖拽到节点或点击插入）</span>
            </div>
            {ALL_SCRATCH_KINDS.map((kind) => {
              const meta = SCRATCH_BLOCK_META[kind];
              return (
                <div
                  key={kind}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/moovn-scratch-kind", kind);
                  }}
                  onClick={() => {
                    if (!selectedNode) {
                      notify("请先选择一个节点，或直接将积木拖到画布上");
                      return;
                    }
                    editor.addBlockToNode(selectedNode.id, kind);
                  }}
                  className={`flex cursor-grab items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11.5px] transition active:cursor-grabbing hover:brightness-110 ${meta.color}`}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <GripVertical size={12} className="opacity-60" />
                    {meta.label}
                  </span>
                  <span className="font-mono text-[10px] opacity-80">{meta.badge}</span>
                </div>
              );
            })}
          </div>

          {/* 右侧：当前选中节点的 Scratch 积木堆栈（直接对应底层 TypeScript API） */}
          <div className="editor-scroll flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            {!selectedNode ? (
              <div className="flex h-full items-center justify-center text-[12px] text-zinc-500">
                在上方画布选择一个节点，即可在此拼装该节点的 Scratch 积木块（底层自动生成 TypeScript）
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-zinc-200">
                    「{selectedNode.title}」的积木块序列 ({(selectedNode.blocks ?? []).length})
                  </span>
                  <span className="font-mono text-[11px] text-sky-400">
                    底层引擎：TypeScript (@moovn/sdk)
                  </span>
                </div>

                {(selectedNode.blocks ?? []).length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-[12px] text-zinc-500">
                    从左侧拖拽积木块到此处或节点卡片上
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(selectedNode.blocks ?? []).map((blk, idx) => {
                      const meta = SCRATCH_BLOCK_META[blk.kind];
                      const p = blk.params || {};
                      return (
                        <div
                          key={blk.id}
                          className={`rounded-xl border p-2.5 ${meta.color}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10.5px] font-bold">
                              #{idx + 1} {meta.label}
                            </span>

                            {/* 针对不同积木类型的行内参数编辑器 */}
                            {blk.kind === "fade" && (
                              <>
                                <select
                                  value={p.target || "character"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { target: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="character">角色立绘</option>
                                  <option value="background">场景背景</option>
                                  <option value="screen">整屏画面</option>
                                </select>
                                {p.target === "character" && (
                                  <select
                                    value={p.characterId || ""}
                                    onChange={(e) =>
                                      editor.updateBlockInNode(selectedNode.id, blk.id, {
                                        characterId: e.target.value || null,
                                      })
                                    }
                                    className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                  >
                                    {project.characters.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <select
                                  value={p.direction || "out"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, {
                                      direction: e.target.value,
                                      targetOpacity: e.target.value === "out" ? 0 : 1,
                                    })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="out">淡出 (Fade Out)</option>
                                  <option value="in">淡入 (Fade In)</option>
                                </select>
                                <input
                                  type="number"
                                  step={100}
                                  value={p.durationMs ?? 600}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, {
                                      durationMs: Number(e.target.value),
                                    })
                                  }
                                  className="w-16 rounded border border-white/15 bg-black/50 px-1.5 py-0.5 text-center text-[11px] text-white"
                                />
                                <span className="text-[10.5px]">ms</span>
                              </>
                            )}

                            {blk.kind === "screen_text" && (
                              <>
                                <input
                                  value={p.text ?? ""}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { text: e.target.value })
                                  }
                                  placeholder="屏幕文字内容"
                                  className="min-w-36 flex-1 rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                />
                                <label className="flex items-center gap-1 text-[10.5px]">
                                  字号
                                  <input
                                    type="number"
                                    value={p.fontSize ?? 28}
                                    onChange={(e) =>
                                      editor.updateBlockInNode(selectedNode.id, blk.id, {
                                        fontSize: Number(e.target.value),
                                      })
                                    }
                                    className="w-12 rounded border border-white/15 bg-black/50 px-1 py-0.5 text-center text-white"
                                  />
                                </label>
                                <input
                                  type="color"
                                  value={p.color || "#ffffff"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { color: e.target.value })
                                  }
                                  className="h-5 w-6 cursor-pointer rounded border border-white/20 bg-transparent"
                                />
                                <label className="flex items-center gap-1 text-[10.5px]">
                                  X%
                                  <input
                                    type="number"
                                    value={p.x ?? 50}
                                    onChange={(e) =>
                                      editor.updateBlockInNode(selectedNode.id, blk.id, { x: Number(e.target.value) })
                                    }
                                    className="w-11 rounded border border-white/15 bg-black/50 px-1 py-0.5 text-center text-white"
                                  />
                                </label>
                                <label className="flex items-center gap-1 text-[10.5px]">
                                  Y%
                                  <input
                                    type="number"
                                    value={p.y ?? 24}
                                    onChange={(e) =>
                                      editor.updateBlockInNode(selectedNode.id, blk.id, { y: Number(e.target.value) })
                                    }
                                    className="w-11 rounded border border-white/15 bg-black/50 px-1 py-0.5 text-center text-white"
                                  />
                                </label>
                              </>
                            )}

                            {blk.kind === "say" && (
                              <>
                                <input
                                  value={p.speaker ?? ""}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { speaker: e.target.value })
                                  }
                                  placeholder="说话人"
                                  className="w-20 rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                />
                                <input
                                  value={p.text ?? ""}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { text: e.target.value })
                                  }
                                  placeholder="台词文本"
                                  className="min-w-40 flex-1 rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                />
                              </>
                            )}

                            {blk.kind === "bg" && (
                              <>
                                <select
                                  value={p.backgroundId || "bg-classroom"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { backgroundId: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  {BACKGROUNDS.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={p.mediaKind || "static"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { mediaKind: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="static">静态图</option>
                                  <option value="frame_sequence">多图片序列帧动画</option>
                                  <option value="video">视频流</option>
                                  <option value="tween">动态粒子补间</option>
                                </select>
                              </>
                            )}

                            {blk.kind === "char" && (
                              <>
                                <select
                                  value={p.characterId || "c-yuki"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { characterId: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  {project.characters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={p.tween || "breathe"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { tween: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="none">无动作</option>
                                  <option value="breathe">呼吸律动</option>
                                  <option value="bounce">轻快跳跃</option>
                                  <option value="float">悬浮微动</option>
                                  <option value="shake">惊讶震动</option>
                                  <option value="slide_in">平滑滑入</option>
                                </select>
                              </>
                            )}

                            {blk.kind === "animate" && (
                              <>
                                <select
                                  value={p.kind || "frame_sequence"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { kind: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="frame_sequence">多图片序列帧动画</option>
                                  <option value="video">视频动画</option>
                                  <option value="tween">补间动画</option>
                                </select>
                                <label className="flex items-center gap-1 text-[10.5px]">
                                  FPS
                                  <input
                                    type="number"
                                    value={p.fps ?? 8}
                                    onChange={(e) =>
                                      editor.updateBlockInNode(selectedNode.id, blk.id, { fps: Number(e.target.value) })
                                    }
                                    className="w-12 rounded border border-white/15 bg-black/50 px-1 py-0.5 text-center text-white"
                                  />
                                </label>
                              </>
                            )}

                            {blk.kind === "affection" && (
                              <>
                                <select
                                  value={p.characterId || "c-yuki"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { characterId: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  {project.characters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  value={p.delta ?? 10}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { delta: Number(e.target.value) })
                                  }
                                  className="w-14 rounded border border-white/15 bg-black/50 px-1.5 py-0.5 text-center text-[11px] text-white"
                                />
                              </>
                            )}

                            {blk.kind === "ts_code" && (
                              <input
                                value={p.code ?? ""}
                                onChange={(e) =>
                                  editor.updateBlockInNode(selectedNode.id, blk.id, { code: e.target.value })
                                }
                                className="min-w-48 flex-1 rounded border border-white/15 bg-black/50 px-2 py-0.5 font-mono text-[11px] text-white"
                              />
                            )}

                            {blk.kind === "bridge_call" && (
                              <>
                                <select
                                  value={p.bridgeLang || "lua"}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { bridgeLang: e.target.value })
                                  }
                                  className="rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] text-white"
                                >
                                  <option value="lua">TS Bridge → Lua</option>
                                  <option value="teal">TS Bridge → Teal</option>
                                  <option value="python">TS Bridge → Python</option>
                                </select>
                                <input
                                  value={p.code ?? ""}
                                  onChange={(e) =>
                                    editor.updateBlockInNode(selectedNode.id, blk.id, { code: e.target.value })
                                  }
                                  className="min-w-44 flex-1 rounded border border-white/15 bg-black/50 px-2 py-0.5 font-mono text-[11px] text-white"
                                />
                              </>
                            )}

                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={() => editor.moveBlockInNode(selectedNode.id, blk.id, -1)}
                                disabled={idx === 0}
                                className="rounded p-1 hover:bg-black/40 disabled:opacity-30"
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                onClick={() => editor.moveBlockInNode(selectedNode.id, blk.id, 1)}
                                disabled={idx === (selectedNode.blocks?.length ?? 1) - 1}
                                className="rounded p-1 hover:bg-black/40 disabled:opacity-30"
                              >
                                <ArrowDown size={11} />
                              </button>
                              <button
                                onClick={() => editor.removeBlockFromNode(selectedNode.id, blk.id)}
                                className="rounded p-1 hover:bg-rose-500/30"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {/* 底层 TypeScript 代码实时映射行 */}
                          <div className="mt-1.5 rounded bg-black/45 px-2 py-0.5 font-mono text-[10.5px] text-sky-300/90 truncate">
                            {scratchBlockToTsLine(blk)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
