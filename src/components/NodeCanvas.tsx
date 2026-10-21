import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  GitBranch,
  Flag,
  Play,
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
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { EdgeRef, EditorTheme, NodeType, StoryNode } from "../types";
import { ENDING_LABELS, NODE_TYPE_LABELS } from "../types";
import { backgroundById } from "../data/assets";
import { charById, nodeById, reachableNodeIds } from "../lib/projectUtils";

export const NODE_WIDTH = 228;
const HEADER_H = 34;
const BODY_TOP = HEADER_H + 8;
const BODY_H = 56;
const PORT_ROW_H = 26;
const CHOICE_START_Y = BODY_TOP + BODY_H + 8;

export function getNodeHeight(node: StoryNode): number {
  if (node.type === "choice") {
    return CHOICE_START_Y + Math.max(1, node.choices.length) * PORT_ROW_H + 10;
  }
  return BODY_TOP + BODY_H + 12;
}

export function getOutPortOffsetY(node: StoryNode, port: number): number {
  if (node.type === "choice" && port >= 0) {
    return CHOICE_START_Y + port * PORT_ROW_H + PORT_ROW_H / 2;
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
  onPreviewFrom: (nodeId: string) => void;
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

export default function NodeCanvas({
  editor,
  theme,
  viewport,
  onViewportChange,
  onPreviewFrom,
  notify,
}: NodeCanvasProps) {
  const { project, selectedNodeId, selectedEdge } = editor;
  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const reachable = useMemo(() => reachableNodeIds(project), [project]);
  const chapterTitleById = useMemo(() => {
    const map = new Map<string, string>();
    project.chapters.forEach((c) => map.set(c.id, c.title));
    return map;
  }, [project.chapters]);

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
    const cx = (rect?.width ?? 900) / 2;
    const cy = (rect?.height ?? 560) / 2;
    const wx = (cx - viewport.x) / viewport.zoom - NODE_WIDTH / 2 + (Math.random() * 40 - 20);
    const wy = (cy - viewport.y) / viewport.zoom - 50 + (Math.random() * 40 - 20);
    editor.addNode(type, wx, wy);
    setMoreMenuOpen(false);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const w = screenToWorld(e.clientX, e.clientY);
        editor.addNode("dialogue", w.x - NODE_WIDTH / 2, w.y - 40);
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
      className={`relative min-w-0 flex-1 overflow-hidden select-none ${
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
        {/* 连线 SVG 层 */}
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

        {/* 节点卡片 */}
        {project.nodes.map((node) => {
          const selected = selectedNodeId === node.id;
          const isStart = project.startNodeId === node.id;
          const isHoverTarget = hoverTargetId === node.id;
          const isOrphan = !reachable.has(node.id);
          const bg = backgroundById(node.backgroundId);
          const firstLine = node.lines[0];
          const speaker = firstLine?.characterId ? charById(project, firstLine.characterId) : null;
          const h = getNodeHeight(node);
          const chapterTitle = chapterTitleById.get(node.chapterId);

          const headerStyle =
            node.type === "choice"
              ? "bg-amber-400/12 text-amber-200 border-amber-400/20"
              : node.type === "end"
                ? "bg-emerald-400/12 text-emerald-200 border-emerald-400/20"
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
              onDoubleClick={(e) => {
                e.stopPropagation();
                onPreviewFrom(node.id);
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

              {/* 预览区 */}
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

                <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                  {node.type === "end" ? (
                    <>
                      <div className="font-medium text-emerald-300">
                        {ENDING_LABELS[node.endingKind ?? "normal"]}
                      </div>
                      <div className="line-clamp-2 text-[11px] text-zinc-400">
                        {node.endingDescription || "故事在此落下帷幕"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between truncate text-[10.5px] font-semibold">
                        <span style={{ color: speaker?.color ?? "#a1a1aa" }}>{speaker ? speaker.name : "旁白"}</span>
                        {chapterTitle && (
                          <span className="truncate text-[9.5px] font-normal text-zinc-500">
                            {chapterTitle.split("·")[0]}
                          </span>
                        )}
                      </div>
                      <div className="line-clamp-2 text-zinc-300">
                        {firstLine?.text || <span className="text-zinc-600 italic">（空台词）</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 分支行 */}
              {node.type === "choice" && (
                <div className="mt-1 flex flex-col border-t border-white/[0.06] pt-1">
                  {node.choices.map((c, idx) => (
                    <div
                      key={c.id}
                      style={{ height: PORT_ROW_H }}
                      className="relative flex items-center justify-between pr-4 pl-3 text-[11.5px] text-zinc-300"
                    >
                      <span className="truncate">
                        <span className="mr-1 text-amber-300/80">{idx + 1}.</span>
                        {c.text || "（未命名选项）"}
                      </span>
                      <button
                        onMouseDown={(e) => startConnect(e, node, idx)}
                        title="拖拽连接到目标场景"
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
                className={` -left-[7px] absolute h-3.5 w-3.5 rounded-full border-2 border-[#151519] transition ${
                  isHoverTarget ? "scale-125 bg-emerald-400" : "bg-zinc-500"
                }`}
              />

              {/* 单输出端口 */}
              {node.type !== "choice" && node.type !== "end" && (
                <button
                  onMouseDown={(e) => startConnect(e, node, -1)}
                  title="拖拽连接到下一场景"
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

      {/* 左上悬浮工具条：添加节点 + 缩放控制 */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#151519]/90 p-1 shadow-xl backdrop-blur-md"
      >
        <button
          onClick={() => spawnAtCenter("dialogue")}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-sky-200 transition hover:bg-sky-500/20"
        >
          <MessageSquare size={13} /> + 对话
        </button>
        <button
          onClick={() => spawnAtCenter("choice")}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-amber-200 transition hover:bg-amber-400/20"
        >
          <GitBranch size={13} /> + 选择
        </button>
        <button
          onClick={() => spawnAtCenter("end")}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-emerald-200 transition hover:bg-emerald-400/20"
        >
          <Flag size={13} /> + 结局
        </button>

        {/* 更多工作流节点类型（角色 / 背景 / 音频 / 脚本） */}
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen((v) => !v)}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.08]"
          >
            <Plus size={13} /> 更多节点
          </button>
          {moreMenuOpen && (
            <div className="animate-pop-in absolute top-full left-0 mt-1.5 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#17171b] py-1 shadow-2xl">
              {(["character", "background", "audio", "script"] as NodeType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => spawnAtCenter(type)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]"
                >
                  {type === "character" && <UserCheck size={13} className="text-sky-400" />}
                  {type === "background" && <ImageIcon size={13} className="text-emerald-400" />}
                  {type === "audio" && <Music size={13} className="text-amber-400" />}
                  {type === "script" && <Code2 size={13} className="text-indigo-400" />}
                  <span>+ {NODE_TYPE_LABELS[type]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          onClick={() => zoomAt(0.9)}
          title="缩小"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => onViewportChange({ ...viewport, zoom: 1 })}
          title="重置 100%"
          className="min-w-12 rounded-lg px-1.5 font-mono text-[11.5px] text-zinc-300 hover:bg-white/[0.08]"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          onClick={() => zoomAt(1.1)}
          title="放大"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={fitView}
          title="适应全部节点"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/[0.08]"
        >
          <Maximize size={13} />
        </button>
      </div>

      {/* 底部轻量操作提示 */}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg border border-white/[0.06] bg-[#151519]/80 px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur">
        拖拽圆点连线 · 双击连线断开 · 双击节点试玩 · 右键打开菜单
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
                  onPreviewFrom(menu.nodeId!);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.07]"
              >
                <Play size={13} /> 从此场景试玩
              </button>
              <button
                onClick={() => {
                  editor.setStartNode(menu.nodeId!);
                  setMenu(null);
                  notify("已设为故事起点");
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.07]"
              >
                <Flag size={13} /> 设为故事起点
              </button>
              <button
                onClick={() => {
                  editor.duplicateNode(menu.nodeId!);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.07]"
              >
                <Copy size={13} /> 复制场景
              </button>
              <div className="mx-3 my-1 h-px bg-white/[0.07]" />
              <button
                onClick={() => {
                  editor.deleteNode(menu.nodeId!);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-rose-300 hover:bg-rose-500/15"
              >
                <Trash2 size={13} /> 删除场景
              </button>
            </>
          ) : (
            <>
              {(["dialogue", "choice", "character", "background", "audio", "script", "end"] as NodeType[]).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => {
                      editor.addNode(type, menu.worldX - NODE_WIDTH / 2, menu.worldY - 30);
                      setMenu(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.07]"
                  >
                    <span>在此新建{NODE_TYPE_LABELS[type]}</span>
                  </button>
                ),
              )}
              <div className="mx-3 my-1 h-px bg-white/[0.07]" />
              <button
                onClick={() => {
                  fitView();
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.07]"
              >
                <Maximize size={13} /> 适应全部节点
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
