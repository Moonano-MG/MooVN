import React, { useRef, useState } from 'react';
import { EditorTheme, GodotNode2D, SupportedScriptLang } from '../types/moovn';

interface GodotFreeEditorProps {
  theme: EditorTheme;
  nodes: GodotNode2D[];
  onChangeNodes: React.Dispatch<React.SetStateAction<GodotNode2D[]>>;
  onSwitchToBlueTemplate: () => void;
}

export const GodotFreeEditor: React.FC<GodotFreeEditorProps> = ({
  theme,
  nodes,
  onChangeNodes,
  onSwitchToBlueTemplate,
}) => {
  const isDark = theme === 'dark';
  const [selectedId, setSelectedId] = useState<string>(nodes[4]?.id || nodes[0]?.id);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedId) || nodes[0];

  const handleAddNode = (type: GodotNode2D['type']) => {
    const id = `node_${Date.now().toString().slice(-4)}`;
    const newNode: GodotNode2D = {
      id,
      name: `${type}_${nodes.length + 1}`,
      type,
      parentId: 'node_root',
      x: 420 + ((nodes.length * 45) % 300),
      y: 280 + ((nodes.length * 35) % 200),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      color: '#38bdf8',
      scriptLang: 'lua',
      scriptCode: `function _ready()\n  print("Node ${type} ready")\nend`,
    };
    onChangeNodes((prev) => [...prev, newNode]);
    setSelectedId(id);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 720);
    onChangeNodes((prev) =>
      prev.map((n) => (n.id === draggingId ? { ...n, x, y } : n))
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        width: '100%',
        height: '100%',
        background: isDark ? '#090d16' : '#f8fafc',
        color: isDark ? '#e2e8f0' : '#0f172a',
        overflow: 'hidden',
      }}
    >
      {/* Left: Godot-Style Scene Tree Dock */}
      <div
        style={{
          width: 270,
          background: isDark ? '#0f172a' : '#ffffff',
          borderRight: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
          场景节点树 (Godot-Style SceneTree)
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          未加载任何模板时，MooVN 作为纯正的通用 2D 可视化引擎运行，并对视觉小说提供原生增强。
        </div>

        {/* Add 2D Node Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(
            ['Sprite2D', 'Node2D', 'Camera2D', 'Label', 'AudioStreamPlayer'] as GodotNode2D['type'][]
          ).map((t) => (
            <button
              key={t}
              onClick={() => handleAddNode(t)}
              style={{
                padding: '4px 8px',
                background: isDark ? '#1e293b' : '#f1f5f9',
                color: isDark ? '#e2e8f0' : '#0f172a',
                border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              + {t}
            </button>
          ))}
        </div>

        {/* Node List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nodes.map((node) => {
            const isSel = node.id === selectedNode?.id;
            return (
              <div
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                style={{
                  padding: '7px 10px',
                  marginLeft: node.parentId ? 14 : 0,
                  borderRadius: 6,
                  background: isSel
                    ? 'rgba(56, 189, 248, 0.18)'
                    : 'transparent',
                  border: `1px solid ${isSel ? '#38bdf8' : 'transparent'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: node.color,
                    }}
                  />
                  <span style={{ fontWeight: isSel ? 700 : 500 }}>{node.name}</span>
                </div>
                <span style={{ fontSize: 10, color: '#64748b' }}>{node.type}</span>
              </div>
            );
          })}
        </div>

        <button
          onClick={onSwitchToBlueTemplate}
          style={{
            padding: '8px 12px',
            background: 'linear-gradient(135deg, #0284c7, #1d4ed8)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          切回「蓝色视觉小说模板」工程
        </button>
      </div>

      {/* Center: 2D Visual Viewport with Grid & Transform Gizmos */}
      <div
        ref={viewportRef}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDraggingId(null)}
        onPointerLeave={() => setDraggingId(null)}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#070b14',
          backgroundImage:
            'linear-gradient(rgba(56, 189, 248, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.07) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 14,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 11.5,
            color: '#93c5fd',
            zIndex: 20,
          }}
        >
          <strong>Godot式通用 2D 视口 (1280×720)</strong> · 直接拖拽节点即可修改 Transform2D 坐标
        </div>

        {/* Render 2D Nodes */}
        {nodes
          .filter((n) => n.visible && n.parentId !== null)
          .map((node) => {
            const isSel = node.id === selectedNode?.id;
            const leftPct = (node.x / 1280) * 100;
            const topPct = (node.y / 720) * 100;

            return (
              <div
                key={node.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(node.id);
                  setDraggingId(node.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: `translate(-50%, -50%) rotate(${node.rotation}deg) scale(${node.scaleX}, ${node.scaleY})`,
                  padding: '14px 20px',
                  borderRadius: 8,
                  background: `${node.color}22`,
                  border: `2px ${isSel ? 'solid' : 'dashed'} ${node.color}`,
                  color: '#f8fafc',
                  cursor: 'grab',
                  userSelect: 'none',
                  boxShadow: isSel ? `0 0 20px ${node.color}55` : 'none',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{node.name}</div>
                <div style={{ fontSize: 10, color: '#bae6fd' }}>
                  ({node.x}, {node.y}) · {node.type}
                </div>
              </div>
            );
          })}
      </div>

      {/* Right: Godot-Style Node2D Inspector & Attached Script */}
      {selectedNode && (
        <div
          style={{
            width: 320,
            background: isDark ? '#0f172a' : '#ffffff',
            borderLeft: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            padding: 14,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
            属性检查器 (Node2D Inspector)
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              节点名称 (Name)
            </label>
            <input
              type="text"
              value={selectedNode.name}
              onChange={(e) =>
                onChangeNodes((prev) =>
                  prev.map((n) =>
                    n.id === selectedNode.id ? { ...n, name: e.target.value } : n
                  )
                )
              }
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 5,
                border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                background: isDark ? '#090d16' : '#f8fafc',
                color: isDark ? '#f8fafc' : '#0f172a',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Position X
              </label>
              <input
                type="number"
                value={selectedNode.x}
                onChange={(e) =>
                  onChangeNodes((prev) =>
                    prev.map((n) =>
                      n.id === selectedNode.id ? { ...n, x: Number(e.target.value) } : n
                    )
                  )
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  background: isDark ? '#090d16' : '#f8fafc',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Position Y
              </label>
              <input
                type="number"
                value={selectedNode.y}
                onChange={(e) =>
                  onChangeNodes((prev) =>
                    prev.map((n) =>
                      n.id === selectedNode.id ? { ...n, y: Number(e.target.value) } : n
                    )
                  )
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  background: isDark ? '#090d16' : '#f8fafc',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Rotation (deg)
              </label>
              <input
                type="number"
                value={selectedNode.rotation}
                onChange={(e) =>
                  onChangeNodes((prev) =>
                    prev.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, rotation: Number(e.target.value) }
                        : n
                    )
                  )
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  background: isDark ? '#090d16' : '#f8fafc',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Scale
              </label>
              <input
                type="number"
                step="0.1"
                value={selectedNode.scaleX}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChangeNodes((prev) =>
                    prev.map((n) =>
                      n.id === selectedNode.id ? { ...n, scaleX: val, scaleY: val } : n
                    )
                  );
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  background: isDark ? '#090d16' : '#f8fafc',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              挂载节点脚本 (Python / TS / Lua / Teal)
            </label>
            <select
              value={selectedNode.scriptLang || 'lua'}
              onChange={(e) =>
                onChangeNodes((prev) =>
                  prev.map((n) =>
                    n.id === selectedNode.id
                      ? { ...n, scriptLang: e.target.value as SupportedScriptLang }
                      : n
                  )
                )
              }
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 5,
                border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                background: isDark ? '#090d16' : '#f8fafc',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 6,
              }}
            >
              <option value="lua">Lua (.lua)</option>
              <option value="teal">Teal (.tl)</option>
              <option value="python">Python (.py)</option>
              <option value="typescript">TypeScript (.ts)</option>
            </select>
            <textarea
              rows={6}
              value={selectedNode.scriptCode || ''}
              onChange={(e) =>
                onChangeNodes((prev) =>
                  prev.map((n) =>
                    n.id === selectedNode.id ? { ...n, scriptCode: e.target.value } : n
                  )
                )
              }
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 5,
                background: '#050811',
                color: '#38bdf8',
                border: '1px solid #1e293b',
                fontFamily: 'monospace',
                fontSize: 11.5,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
