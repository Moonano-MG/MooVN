import React, { useRef, useState } from 'react';
import {
  EditorTheme,
  SceneDef,
  SupportedScriptLang,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from '../types/moovn';
import { audioSynth } from '../services/audioSynth';

interface DifyWorkflowCanvasProps {
  theme: EditorTheme;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  scenes: SceneDef[];
  onChangeNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  onChangeEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>;
  onJumpToScene: (sceneId: string) => void;
  onSyncNodeToScene: (node: WorkflowNode) => void;
}

const NODE_TYPE_STYLE: Record<
  WorkflowNodeType,
  { label: string; color: string; badgeBg: string; icon: string }
> = {
  start: { label: '开始触发器', color: '#10b981', badgeBg: 'rgba(16, 185, 129, 0.16)', icon: '▶' },
  background: { label: '背景节点', color: '#0ea5e9', badgeBg: 'rgba(14, 165, 233, 0.16)', icon: '🏞' },
  character: { label: '角色节点', color: '#ec4899', badgeBg: 'rgba(236, 72, 153, 0.16)', icon: '👤' },
  audio: { label: '音效/BGM', color: '#f59e0b', badgeBg: 'rgba(245, 158, 11, 0.16)', icon: '🎵' },
  dialogue: { label: '对话节点', color: '#3b82f6', badgeBg: 'rgba(59, 130, 246, 0.16)', icon: '💬' },
  choice: { label: '分支/选项', color: '#a855f7', badgeBg: 'rgba(168, 85, 247, 0.16)', icon: '🔀' },
  condition: { label: '好感度条件', color: '#14b8a6', badgeBg: 'rgba(20, 184, 166, 0.16)', icon: '⚖' },
  script: { label: 'Lua/Teal/Py/TS', color: '#6366f1', badgeBg: 'rgba(99, 102, 241, 0.16)', icon: '⚡' },
  ending: { label: '结局终点', color: '#ef4444', badgeBg: 'rgba(239, 68, 68, 0.16)', icon: '🏁' },
};

export const DifyWorkflowCanvas: React.FC<DifyWorkflowCanvasProps> = ({
  theme,
  nodes,
  edges,
  scenes,
  onChangeNodes,
  onChangeEdges,
  onJumpToScene,
  onSyncNodeToScene,
}) => {
  const isDark = theme === 'dark';
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[3]?.id || null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<string[]>([
    '[Dify Workflow Engine] 工作流画布已就绪。支持拖拽编排角色、背景、音效、对话、分支与 Lua/Teal/Python/TS 脚本节点。',
  ]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleAddNode = (type: WorkflowNodeType) => {
    const meta = NODE_TYPE_STYLE[type];
    const id = `wf_${type}_${Date.now().toString().slice(-4)}`;
    const newNode: WorkflowNode = {
      id,
      type,
      title: `${meta.label} #${nodes.length + 1}`,
      subtitle:
        type === 'script'
          ? 'Teal / Lua / Python / TS 脚本逻辑'
          : type === 'character'
          ? '汐月 (Shizuki) | 表情: smile | 好感 +5'
          : type === 'dialogue'
          ? '新台词节点 -> 自动映射独立场景'
          : `新建 ${meta.label}`,
      x: 240 + ((nodes.length * 90) % 700),
      y: 120 + ((nodes.length * 65) % 280),
      sceneId: scenes[0]?.id,
      config:
        type === 'script'
          ? {
              language: 'teal' as SupportedScriptLang,
              code: `-- Dify 脚本节点 (Teal/Lua)\nlocal aff: integer = moovn.get_affection("char_shizuki")\nif aff >= 30 then\n  moovn.say("汐月", "工作流节点脚本校验通过！")\nend`,
            }
          : type === 'character'
          ? { characterId: 'char_shizuki', expression: 'smile', x: 50, y: 56, affectionDelta: 5 }
          : type === 'background'
          ? { presetId: 'deep_sea_observatory', weather: 'bubbles', animated: true }
          : type === 'audio'
          ? { bgmId: 'blue_nocturne', sfxId: 'chime', volume: 80 }
          : { speaker: '汐月', text: '这是通过 Dify 工作流节点编排的新场景对话。' },
    };
    onChangeNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
    setWorkflowLogs((prev) => [...prev, `[+ 节点创建] 已添加 ${newNode.title} (${id})`]);
  };

  // Run simulated Dify workflow execution trace
  const handleRunWorkflowSimulation = () => {
    setWorkflowLogs((prev) => [
      ...prev,
      '▶ 开始执行 Dify 视觉小说工作流编排流水线...',
    ]);
    nodes.forEach((node, idx) => {
      window.setTimeout(() => {
        setRunningNodeId(node.id);
        setSelectedNodeId(node.id);
        audioSynth.playSfx(node.type === 'ending' ? 'chime' : 'page_turn', 55);
        setWorkflowLogs((prev) => [
          ...prev,
          `  [${idx + 1}/${nodes.length}] 执行 ${NODE_TYPE_STYLE[node.type].label}: ${node.title} -> ${node.subtitle}`,
        ]);
        if (idx === nodes.length - 1) {
          window.setTimeout(() => {
            setRunningNodeId(null);
            setWorkflowLogs((prev) => [
              ...prev,
              '✔ 工作流全链路执行完成！所有节点配置已与 YAML 场景树同步。',
            ]);
          }, 600);
        }
      }, idx * 480);
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingNodeId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(20, Math.round(e.clientX - rect.left - dragOffset.dx));
    const y = Math.max(20, Math.round(e.clientY - rect.top - dragOffset.dy));
    onChangeNodes((prev) =>
      prev.map((n) => (n.id === draggingNodeId ? { ...n, x, y } : n))
    );
  };

  const handlePointerUp = () => {
    setDraggingNodeId(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: isDark ? '#090d16' : '#f8fafc',
        color: isDark ? '#e2e8f0' : '#0f172a',
      }}
    >
      {/* Top Dify Workflow Palette Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: isDark ? '#0f172a' : '#ffffff',
          borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#38bdf8',
              marginRight: 4,
            }}
          >
            Dify 工作流节点库:
          </span>
          {(
            [
              'character',
              'background',
              'audio',
              'dialogue',
              'choice',
              'script',
              'ending',
            ] as WorkflowNodeType[]
          ).map((type) => {
            const meta = NODE_TYPE_STYLE[type];
            return (
              <button
                key={type}
                onClick={() => handleAddNode(type)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  background: isDark ? '#1e293b' : '#f1f5f9',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  border: `1px solid ${meta.color}`,
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>{meta.icon}</span>
                <span>+ {meta.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {connectingFromId && (
            <span style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>
              正在连线：请点击目标节点完成连接...
            </span>
          )}
          <button
            onClick={handleRunWorkflowSimulation}
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ▶ 试运行工作流图
          </button>
        </div>
      </div>

      {/* Main Split: Dify Graph Canvas (Left/Center) + Node Inspector (Right) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Infinite-style Dotted Graph Canvas */}
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: 'relative',
            flex: 1,
            overflow: 'auto',
            backgroundImage: isDark
              ? 'radial-gradient(#1e293b 1.25px, transparent 1.25px)'
              : 'radial-gradient(#cbd5e1 1.25px, transparent 1.25px)',
            backgroundSize: '20px 20px',
          }}
        >
          <div style={{ position: 'relative', width: 2050, height: 620 }}>
            {/* Bezier SVG Edges */}
            <svg
              width={2050}
              height={620}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              <defs>
                <marker
                  id="dify-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const x1 = src.x + 230;
                const y1 = src.y + 42;
                const x2 = tgt.x;
                const y2 = tgt.y + 42;
                const cpx1 = x1 + Math.max(60, (x2 - x1) * 0.5);
                const cpx2 = x2 - Math.max(60, (x2 - x1) * 0.5);
                const pathD = `M ${x1} ${y1} C ${cpx1} ${y1}, ${cpx2} ${y2}, ${x2} ${y2}`;

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.2"
                      markerEnd="url(#dify-arrow)"
                      opacity="0.82"
                    />
                    {edge.label && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 8}
                        fill={isDark ? '#93c5fd' : '#1d4ed8'}
                        fontSize="10.5"
                        textAnchor="middle"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Dify Workflow Nodes */}
            {nodes.map((node) => {
              const meta = NODE_TYPE_STYLE[node.type];
              const isSelected = selectedNodeId === node.id;
              const isRunning = runningNodeId === node.id;

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (connectingFromId) {
                      if (connectingFromId !== node.id) {
                        onChangeEdges((prev) => [
                          ...prev,
                          {
                            id: `edge_${Date.now()}`,
                            source: connectingFromId,
                            target: node.id,
                            label: '触发下一步',
                          },
                        ]);
                      }
                      setConnectingFromId(null);
                      return;
                    }
                    setSelectedNodeId(node.id);
                    if (canvasRef.current) {
                      const rect = canvasRef.current.getBoundingClientRect();
                      setDragOffset({
                        dx: e.clientX - rect.left - node.x,
                        dy: e.clientY - rect.top - node.y,
                      });
                      setDraggingNodeId(node.id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    width: 230,
                    background: isDark ? '#111827' : '#ffffff',
                    border: `2px solid ${
                      isRunning ? '#22c55e' : isSelected ? meta.color : isDark ? '#1e293b' : '#cbd5e1'
                    }`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    boxSizing: 'border-box',
                    cursor: 'grab',
                    boxShadow: isRunning
                      ? '0 0 24px rgba(34, 197, 94, 0.55)'
                      : isSelected
                      ? `0 6px 20px ${meta.color}33`
                      : '0 4px 12px rgba(0,0,0,0.18)',
                    userSelect: 'none',
                  }}
                >
                  {/* Node Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: meta.badgeBg,
                        color: meta.color,
                        fontSize: 10.5,
                        fontWeight: 700,
                      }}
                    >
                      {meta.icon} {meta.label}
                    </span>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        title="从该节点拉出连线"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setConnectingFromId(node.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${meta.color}`,
                          color: meta.color,
                          borderRadius: 4,
                          fontSize: 10,
                          padding: '1px 5px',
                          cursor: 'pointer',
                        }}
                      >
                        连线 ➔
                      </button>
                    </div>
                  </div>

                  {/* Node Title & Subtitle */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isDark ? '#f8fafc' : '#0f172a',
                      marginBottom: 4,
                    }}
                  >
                    {node.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: isDark ? '#94a3b8' : '#475569',
                      lineHeight: 1.4,
                    }}
                  >
                    {node.subtitle}
                  </div>

                  {/* Linked Scene Pill */}
                  {node.sceneId && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToScene(node.sceneId!);
                      }}
                      style={{
                        marginTop: 8,
                        paddingTop: 6,
                        borderTop: `1px dashed ${isDark ? '#1e293b' : '#e2e8f0'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 10.5,
                        color: '#38bdf8',
                        cursor: 'pointer',
                      }}
                    >
                      <span>绑定场景: {node.sceneId}</span>
                      <span>跳转编辑 ▸</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side Dify Node Configuration Inspector */}
        <div
          style={{
            width: 340,
            background: isDark ? '#0f172a' : '#ffffff',
            borderLeft: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
            节点属性检查器 (Dify Node Inspector)
          </div>

          {selectedNode ? (
            <>
              <div>
                <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  节点标题
                </label>
                <input
                  type="text"
                  value={selectedNode.title}
                  onChange={(e) =>
                    onChangeNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id ? { ...n, title: e.target.value } : n
                      )
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12.5,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  节点说明 / 触发摘要
                </label>
                <input
                  type="text"
                  value={selectedNode.subtitle}
                  onChange={(e) =>
                    onChangeNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id ? { ...n, subtitle: e.target.value } : n
                      )
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12.5,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  绑定场景 (Chapter &gt; Scene)
                </label>
                <select
                  value={selectedNode.sceneId || ''}
                  onChange={(e) =>
                    onChangeNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id ? { ...n, sceneId: e.target.value } : n
                      )
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12.5,
                  }}
                >
                  {scenes.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.title} ({sc.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Embedded Lua / Teal / Python / TS code inside Script Node */}
              {selectedNode.type === 'script' && (
                <div>
                  <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    节点脚本语言 (支持工作流与 Lua / Teal / Python / TS)
                  </label>
                  <select
                    value={selectedNode.config.language || 'teal'}
                    onChange={(e) =>
                      onChangeNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id
                            ? {
                                ...n,
                                config: { ...n.config, language: e.target.value },
                              }
                            : n
                        )
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      background: isDark ? '#090d16' : '#f8fafc',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: 12.5,
                      marginBottom: 8,
                    }}
                  >
                    <option value="teal">Teal (.tl 强类型 Lua)</option>
                    <option value="lua">Lua (.lua 标准脚本)</option>
                    <option value="python">Python (.py 逻辑脚本)</option>
                    <option value="typescript">TypeScript (.ts 脚本)</option>
                  </select>

                  <textarea
                    rows={6}
                    value={selectedNode.config.code || ''}
                    onChange={(e) =>
                      onChangeNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id
                            ? {
                                ...n,
                                config: { ...n.config, code: e.target.value },
                              }
                            : n
                        )
                      )
                    }
                    style={{
                      width: '100%',
                      padding: 8,
                      borderRadius: 6,
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      background: '#050811',
                      color: '#38bdf8',
                      fontFamily: 'monospace',
                      fontSize: 11.5,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => onSyncNodeToScene(selectedNode)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  同步节点到场景 YAML
                </button>
                <button
                  onClick={() => {
                    onChangeNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
                    onChangeEdges((prev) =>
                      prev.filter(
                        (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
                      )
                    );
                    setSelectedNodeId(null);
                  }}
                  style={{
                    padding: '7px 10px',
                    background: 'rgba(239, 68, 68, 0.16)',
                    color: '#f87171',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  删除节点
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              请在左侧工作流画布中点击任意节点以编辑其角色、背景、音效、对话或脚本配置。
            </div>
          )}

          {/* Workflow Execution Trace Console */}
          <div
            style={{
              marginTop: 'auto',
              background: '#040812',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: 10,
              maxHeight: 170,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#93c5fd',
            }}
          >
            {workflowLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
