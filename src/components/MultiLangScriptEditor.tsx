import React, { useState } from 'react';
import {
  CharacterDef,
  EditorTheme,
  SceneDef,
  ScriptFile,
  SupportedScriptLang,
  VisualCodeBlock,
} from '../types/moovn';
import { blocksToCode, executeMooVNScript } from '../services/scriptInterpreter';

interface MultiLangScriptEditorProps {
  theme: EditorTheme;
  scripts: ScriptFile[];
  currentScene: SceneDef;
  characters: CharacterDef[];
  onChangeScripts: React.Dispatch<React.SetStateAction<ScriptFile[]>>;
  onApplyScriptToScene: (
    updatedScene: Partial<SceneDef>,
    affectionDeltas: { characterId: string; delta: number }[]
  ) => void;
}

const LANG_BADGE: Record<
  SupportedScriptLang,
  { name: string; ext: string; color: string; desc: string }
> = {
  teal: {
    name: 'Teal (Typed Lua)',
    ext: '.tl',
    color: '#2dd4bf',
    desc: '强类型 Lua 方言，静态类型检查后编译为标准 Lua 字节码',
  },
  lua: {
    name: 'Lua 5.4',
    ext: '.lua',
    color: '#38bdf8',
    desc: '轻量级视觉小说原生内嵌脚本，零延迟驱动舞台与好感度',
  },
  python: {
    name: 'Python 3.11',
    ext: '.py',
    color: '#facc15',
    desc: '内置 Python 剧情逻辑与 AI/属性计算脚本支持',
  },
  typescript: {
    name: 'TypeScript / JS',
    ext: '.ts',
    color: '#60a5fa',
    desc: '完整 @moovn/runtime 类型定义与 Pixi.js 渲染扩展支持',
  },
};

export const MultiLangScriptEditor: React.FC<MultiLangScriptEditorProps> = ({
  theme,
  scripts,
  currentScene,
  characters,
  onChangeScripts,
  onApplyScriptToScene,
}) => {
  const isDark = theme === 'dark';
  const [activeScriptId, setActiveScriptId] = useState<string>(scripts[0]?.id || 'script_teal');
  const [devMode, setDevMode] = useState<'hybrid' | 'blocks_only' | 'code_only'>('hybrid');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[MooVN Polyglot Engine] 已加载内置多语言运行时：Python 3.11 / TypeScript 5.6 / Lua 5.4 / Teal 0.15。',
    '[提示] 支持「可视化代码块」与「纯代码编程」双模式双向转换，照顾视觉化与纯代码两类开发者。',
  ]);
  const [transpiledPreview, setTranspiledPreview] = useState<string | null>(null);

  const activeScript = scripts.find((s) => s.id === activeScriptId) || scripts[0];

  const handleUpdateCode = (newCode: string) => {
    onChangeScripts((prev) =>
      prev.map((s) => (s.id === activeScript.id ? { ...s, content: newCode } : s))
    );
  };

  const handleAddVisualBlock = (
    category: VisualCodeBlock['category'],
    command: string,
    defaultParams: Record<string, string | number>
  ) => {
    const newBlock: VisualCodeBlock = {
      id: `vb_${Date.now()}`,
      category,
      command,
      params: defaultParams,
    };
    const updatedBlocks = [...activeScript.visualBlocks, newBlock];
    const generatedCode = blocksToCode(updatedBlocks, activeScript.language);
    onChangeScripts((prev) =>
      prev.map((s) =>
        s.id === activeScript.id
          ? { ...s, visualBlocks: updatedBlocks, content: generatedCode }
          : s
      )
    );
    setConsoleLogs((prev) => [
      ...prev,
      `[Visual Blocks -> ${activeScript.language.toUpperCase()}] 已添加代码块「${command}」并同步生成代码。`,
    ]);
  };

  const handleUpdateBlockParam = (blockId: string, key: string, value: string | number) => {
    const updatedBlocks = activeScript.visualBlocks.map((b) =>
      b.id === blockId ? { ...b, params: { ...b.params, [key]: value } } : b
    );
    const generatedCode = blocksToCode(updatedBlocks, activeScript.language);
    onChangeScripts((prev) =>
      prev.map((s) =>
        s.id === activeScript.id
          ? { ...s, visualBlocks: updatedBlocks, content: generatedCode }
          : s
      )
    );
  };

  const handleDeleteBlock = (blockId: string) => {
    const updatedBlocks = activeScript.visualBlocks.filter((b) => b.id !== blockId);
    const generatedCode = blocksToCode(updatedBlocks, activeScript.language);
    onChangeScripts((prev) =>
      prev.map((s) =>
        s.id === activeScript.id
          ? { ...s, visualBlocks: updatedBlocks, content: generatedCode }
          : s
      )
    );
  };

  const handleRunActiveScript = () => {
    const result = executeMooVNScript(
      activeScript.language,
      activeScript.content,
      currentScene,
      characters
    );
    setConsoleLogs((prev) => [...prev, ...result.logs]);
    if (result.transpiledLua) {
      setTranspiledPreview(result.transpiledLua);
    } else {
      setTranspiledPreview(null);
    }
    if (result.updatedScene || result.affectionDeltas.length > 0) {
      onApplyScriptToScene(result.updatedScene || {}, result.affectionDeltas);
    }
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
      {/* Top Language & Mode Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: isDark ? '#0f172a' : '#ffffff',
          borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {/* 4 Built-in Language Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {scripts.map((scr) => {
            const meta = LANG_BADGE[scr.language];
            const isSelected = scr.id === activeScript.id;
            return (
              <button
                key={scr.id}
                onClick={() => setActiveScriptId(scr.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: isSelected
                    ? isDark
                      ? '#1e293b'
                      : '#e0f2fe'
                    : 'transparent',
                  border: `1.5px solid ${
                    isSelected ? meta.color : isDark ? '#334155' : '#cbd5e1'
                  }`,
                  borderRadius: 6,
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: meta.color,
                  }}
                />
                <span>{scr.name}</span>
                <span style={{ fontSize: 10, color: meta.color }}>[{meta.name}]</span>
              </button>
            );
          })}
        </div>

        {/* Developer Mode Switch: 可视化代码块 + 纯代码双照顾 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'inline-flex',
              borderRadius: 6,
              overflow: 'hidden',
              border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
            }}
          >
            {[
              { id: 'hybrid' as const, label: '分屏：可视化块 + 纯代码' },
              { id: 'blocks_only' as const, label: '仅可视化代码块' },
              { id: 'code_only' as const, label: '仅纯代码 IDE' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setDevMode(m.id)}
                style={{
                  padding: '5px 10px',
                  background:
                    devMode === m.id
                      ? '#0284c7'
                      : isDark
                      ? '#0f172a'
                      : '#f1f5f9',
                  color: devMode === m.id ? '#fff' : isDark ? '#94a3b8' : '#475569',
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleRunActiveScript}
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ▶ 执行 {activeScript.language.toUpperCase()} 脚本并同步舞台
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Pane: Visual Code Block Builder (可视化代码块) */}
        {(devMode === 'hybrid' || devMode === 'blocks_only') && (
          <div
            style={{
              flex: devMode === 'blocks_only' ? 1 : 0.48,
              borderRight: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              padding: 14,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
                  可视化代码块编程 (Visual Code Blocks)
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  拖拽或点击下方积木块，自动转译为 {LANG_BADGE[activeScript.language].name} 纯代码
                </div>
              </div>
              <button
                onClick={() => {
                  const code = blocksToCode(activeScript.visualBlocks, activeScript.language);
                  handleUpdateCode(code);
                }}
                style={{
                  padding: '4px 10px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                重新生成代码 ➔
              </button>
            </div>

            {/* Quick Add Block Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                onClick={() =>
                  handleAddVisualBlock('scene', 'set_background', {
                    preset: 'deep_sea_observatory',
                    weather: 'bubbles',
                  })
                }
                style={{
                  padding: '5px 10px',
                  background: 'rgba(14, 165, 233, 0.16)',
                  color: '#38bdf8',
                  border: '1px solid #0ea5e9',
                  borderRadius: 5,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                + 切换场景背景块
              </button>
              <button
                onClick={() =>
                  handleAddVisualBlock('character', 'add_affection', {
                    characterId: 'char_shizuki',
                    delta: 10,
                  })
                }
                style={{
                  padding: '5px 10px',
                  background: 'rgba(236, 72, 153, 0.16)',
                  color: '#f472b6',
                  border: '1px solid #ec4899',
                  borderRadius: 5,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                + 角色好感度变更块
              </button>
              <button
                onClick={() =>
                  handleAddVisualBlock('dialogue', 'say', {
                    speaker: '汐月',
                    text: '通过可视化代码块添加的新台词！',
                  })
                }
                style={{
                  padding: '5px 10px',
                  background: 'rgba(59, 130, 246, 0.16)',
                  color: '#60a5fa',
                  border: '1px solid #3b82f6',
                  borderRadius: 5,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                + 输出对话台词块
              </button>
              <button
                onClick={() =>
                  handleAddVisualBlock('audio', 'play_bgm', {
                    bgm: 'starlight_waltz',
                    volume: 85,
                  })
                }
                style={{
                  padding: '5px 10px',
                  background: 'rgba(245, 158, 11, 0.16)',
                  color: '#fbbf24',
                  border: '1px solid #f59e0b',
                  borderRadius: 5,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                + 播放 BGM 音轨块
              </button>
            </div>

            {/* Active Visual Blocks Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeScript.visualBlocks.map((block, idx) => (
                <div
                  key={block.id}
                  style={{
                    background: isDark ? '#111827' : '#ffffff',
                    border: `1.5px solid ${
                      block.category === 'scene'
                        ? '#0ea5e9'
                        : block.category === 'character'
                        ? '#ec4899'
                        : block.category === 'audio'
                        ? '#f59e0b'
                        : '#3b82f6'
                    }`,
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      #{idx + 1} · [{block.category.toUpperCase()}] {block.command}
                    </span>
                    <button
                      onClick={() => handleDeleteBlock(block.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      删除 ✕
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Object.entries(block.params).map(([k, v]) => (
                      <div key={k}>
                        <label
                          style={{
                            fontSize: 10.5,
                            color: '#64748b',
                            display: 'block',
                            marginBottom: 2,
                          }}
                        >
                          参数: {k}
                        </label>
                        <input
                          type={typeof v === 'number' ? 'number' : 'text'}
                          value={v}
                          onChange={(e) =>
                            handleUpdateBlockParam(
                              block.id,
                              k,
                              typeof v === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                          style={{
                            width: '100%',
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                            background: isDark ? '#090d16' : '#f8fafc',
                            color: isDark ? '#f8fafc' : '#0f172a',
                            fontSize: 11.5,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right Pane: Pure Code Editor (纯代码编程 IDE) */}
        {(devMode === 'hybrid' || devMode === 'code_only') && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: '8px 14px',
                background: isDark ? '#0b1120' : '#f1f5f9',
                borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11.5,
              }}
            >
              <span>
                <strong>{activeScript.path}</strong> — {LANG_BADGE[activeScript.language].desc}
              </span>
              <span style={{ color: '#38bdf8' }}>内置智能 API: moovn.bg / moovn.char / moovn.say / moovn.affection</span>
            </div>

            <textarea
              value={activeScript.content}
              onChange={(e) => handleUpdateCode(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                width: '100%',
                padding: 16,
                background: '#050811',
                color: '#e2e8f0',
                border: 'none',
                outline: 'none',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 13,
                lineHeight: 1.65,
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />

            {/* Teal -> Lua Transpiled Preview if active */}
            {transpiledPreview && activeScript.language === 'teal' && (
              <div
                style={{
                  padding: '8px 14px',
                  background: '#081529',
                  borderTop: '1px solid #1e3a8a',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#2dd4bf',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  [Teal 编译器输出 - 已转译为标准 Lua 5.4]:
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{transpiledPreview}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Output Console */}
      <div
        style={{
          height: 125,
          background: '#040710',
          borderTop: '1px solid #1e293b',
          padding: '8px 14px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 11.5,
          color: '#93c5fd',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#38bdf8',
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          <span>多语言运行时终端 (Python / TypeScript / Lua / Teal VM Output)</span>
          <button
            onClick={() => setConsoleLogs([])}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            清空日志
          </button>
        </div>
        {consoleLogs.map((line, i) => (
          <div key={i} style={{ marginBottom: 3 }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
