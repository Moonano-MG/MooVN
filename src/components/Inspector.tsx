import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Flag,
  Code2,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  SceneNode,
  DialogueLine,
  ChoiceOption,
  WorkflowNodeType,
  CharacterProfile,
  StoryChapter,
  NestedChildNode,
} from '../types';
import {
  BACKGROUND_ASSETS,
  AUDIO_ASSETS,
  CHARACTER_ASSETS,
} from '../data/assets';
import {
  NODE_CATEGORIES,
  NODE_REGISTRY,
  getNodeMeta,
} from '../data/nodeRegistry';
import { generateSingleNodeCode } from '../lib/nodeCodeCompiler';
import { soundEngine } from '../lib/soundEngine';

interface InspectorProps {
  node: SceneNode;
  allNodes: SceneNode[];
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  startNodeId: string;
  selectedDialogueIndex: number;
  onSelectDialogueIndex: (idx: number) => void;
  onUpdateNode: (updater: (n: SceneNode) => SceneNode) => void;
  onAddDialogue: () => void;
  onUpdateDialogue: (lineId: string, patch: Partial<DialogueLine>) => void;
  onDeleteDialogue: (lineId: string) => void;
  onAddChoice: () => void;
  onUpdateChoice: (choiceId: string, patch: Partial<ChoiceOption>) => void;
  onDeleteChoice: (choiceId: string) => void;
  onSetStartNode: (id: string) => void;
  onUpdateCharacterProfile: (
    charId: string,
    updater: (c: CharacterProfile) => CharacterProfile
  ) => void;
  onAddCharacterProfile: () => void;
  onUpdateChapter?: (
    chapterId: string,
    updater: (ch: StoryChapter) => StoryChapter
  ) => void;
}

const NESTED_ADD_OPTIONS: {
  type: WorkflowNodeType;
  label: string;
  defaultParams: Record<string, string | number | boolean>;
  isContainer?: boolean;
}[] = [
  {
    type: 'dialogue',
    label: '+ 台词子节点',
    defaultParams: { speaker: '星野 雪奈', text: '嵌套容器内台词' },
  },
  {
    type: 'math_operation',
    label: '+ 数学运算',
    defaultParams: { targetVar: 'clueCount', mathOp: '+=', operandValue: 1 },
  },
  {
    type: 'affection_change',
    label: '+ 好感变更',
    defaultParams: { charId: 'yukina', delta: 5 },
  },
  {
    type: 'camera_shake',
    label: '+ 镜头震动',
    defaultParams: { intensity: 'medium', durationMs: 400 },
  },
  {
    type: 'wait_timer',
    label: '+ 延时等待',
    defaultParams: { durationMs: 600 },
  },
  {
    type: 'repeat_loop',
    label: '+ 嵌套重复循环',
    defaultParams: { repeatCount: 2 },
    isContainer: true,
  },
  {
    type: 'if_else_container',
    label: '+ 嵌套如果否则',
    defaultParams: { conditionExpr: 'ctx.affection.yukina >= 50' },
    isContainer: true,
  },
];

export const Inspector: React.FC<InspectorProps> = ({
  node,
  allNodes,
  chapters,
  characters,
  startNodeId,
  selectedDialogueIndex,
  onSelectDialogueIndex,
  onUpdateNode,
  onAddDialogue,
  onUpdateDialogue,
  onDeleteDialogue,
  onAddChoice,
  onUpdateChoice,
  onDeleteChoice,
  onSetStartNode,
}) => {
  const [viewMode, setViewMode] = useState<'config' | 'script'>('config');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const meta = getNodeMeta(node.type);

  // Recursive helper to update or append nested children at any depth
  const appendChildRecursive = (
    list: NestedChildNode[],
    parentId: string,
    newItem: NestedChildNode
  ): NestedChildNode[] =>
    list.map((item) => {
      if (item.id === parentId) {
        return {
          ...item,
          childrenNodes: [...(item.childrenNodes || []), newItem],
        };
      }
      if (item.childrenNodes?.length) {
        return {
          ...item,
          childrenNodes: appendChildRecursive(
            item.childrenNodes,
            parentId,
            newItem
          ),
        };
      }
      return item;
    });

  const deleteChildRecursive = (
    list: NestedChildNode[],
    targetId: string
  ): NestedChildNode[] =>
    list
      .filter((item) => item.id !== targetId)
      .map((item) => ({
        ...item,
        childrenNodes: item.childrenNodes
          ? deleteChildRecursive(item.childrenNodes, targetId)
          : undefined,
      }));

  const updateChildParamRecursive = (
    list: NestedChildNode[],
    targetId: string,
    key: string,
    val: string | number | boolean
  ): NestedChildNode[] =>
    list.map((item) => {
      if (item.id === targetId) {
        return {
          ...item,
          params: { ...item.params, [key]: val },
        };
      }
      if (item.childrenNodes?.length) {
        return {
          ...item,
          childrenNodes: updateChildParamRecursive(
            item.childrenNodes,
            targetId,
            key,
            val
          ),
        };
      }
      return item;
    });

  const renderNestedTreeEditor = (
    children: NestedChildNode[],
    depth = 0
  ): React.ReactNode => {
    return (
      <div
        className="space-y-2 pl-2.5 border-l-2"
        style={{ borderColor: depth === 0 ? '#10b981' : '#38bdf8' }}
      >
        {children.map((ch, idx) => {
          const chMeta = getNodeMeta(ch.type);
          const isSubContainer =
            ch.type === 'repeat_loop' ||
            ch.type === 'while_loop' ||
            ch.type === 'if_else_container' ||
            ch.type === 'parallel_container';

          return (
            <div
              key={ch.id}
              style={{ borderLeftColor: chMeta.accentColor, borderLeftWidth: '3px' }}
              className="p-2 rounded bg-[#141419] border border-[#2a2a34] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    style={{
                      backgroundColor: chMeta.badgeBg,
                      color: chMeta.badgeText,
                    }}
                    className="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                  >
                    #{idx + 1} {chMeta.title}
                  </span>
                </div>
                <button
                  onClick={() =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      childrenNodes: deleteChildRecursive(
                        prev.childrenNodes || [],
                        ch.id
                      ),
                    }))
                  }
                  className="text-zinc-500 hover:text-rose-400"
                  title="删除此子节点"
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(ch.params).map(([pk, pv]) => (
                  <div key={pk}>
                    <label className="block text-[9px] text-zinc-500 mb-0.5">
                      {pk}
                    </label>
                    <input
                      type="text"
                      value={String(pv)}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          childrenNodes: updateChildParamRecursive(
                            prev.childrenNodes || [],
                            ch.id,
                            pk,
                            typeof pv === 'number'
                              ? Number(e.target.value)
                              : e.target.value
                          ),
                        }))
                      }
                      className="w-full px-1.5 py-0.5 text-[11px]"
                    />
                  </div>
                ))}
              </div>

              {isSubContainer && (
                <div className="pt-1 space-y-1.5">
                  {renderNestedTreeEditor(ch.childrenNodes || [], depth + 1)}
                  <div className="flex flex-wrap gap-1">
                    {NESTED_ADD_OPTIONS.slice(0, 5).map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => {
                          const sub: NestedChildNode = {
                            id: `sub-${Date.now()}-${Math.random()
                              .toString(36)
                              .slice(2, 5)}`,
                            type: opt.type,
                            title: opt.label.replace('+ ', ''),
                            params: { ...opt.defaultParams },
                          };
                          onUpdateNode((prev) => ({
                            ...prev,
                            childrenNodes: appendChildRecursive(
                              prev.childrenNodes || [],
                              ch.id,
                              sub
                            ),
                          }));
                        }}
                        className="px-1.5 py-0.5 rounded bg-[#1f1f28] hover:bg-[#2a2a36] border border-emerald-500/30 text-emerald-300 text-[9px]"
                      >
                        {opt.label}
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
    <div className="flex flex-col h-full bg-[#151519] text-zinc-200 select-none overflow-hidden text-xs">
      {/* Category-Colored Top Banner */}
      <div
        style={{
          background: `linear-gradient(90deg, ${meta.accentColor}30 0%, ${meta.accentColor}10 100%)`,
          borderBottomColor: `${meta.accentColor}50`,
        }}
        className="px-3 py-2 border-b flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: meta.accentColor, color: '#09090b' }}
            className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
          >
            {meta.categoryLabel}
          </span>
          <span
            style={{ color: meta.badgeText }}
            className="font-semibold truncate"
          >
            {meta.title}
          </span>
        </div>

        {/* 2-Mode Toggle: Dedicated Node Config vs JS/TS Node Script */}
        <div className="flex items-center bg-[#121216] p-0.5 rounded border border-[#2c2c34] shrink-0">
          <button
            onClick={() => setViewMode('config')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition ${
              viewMode === 'config'
                ? 'bg-zinc-200 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-2.5 h-2.5" />
            专属参数
          </button>
          <button
            onClick={() => setViewMode('script')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition ${
              viewMode === 'script'
                ? 'bg-sky-400 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-2.5 h-2.5" />
            JS/TS 脚本
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Common Identity Card: Title, Type Switcher, Chapter & Next Node Link */}
        <div className="p-2.5 rounded-lg bg-[#1b1b21] border border-[#2a2a33] space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={node.title}
              onChange={(e) =>
                onUpdateNode((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="节点标题"
              className="flex-1 px-2 py-1 text-xs font-medium"
            />
            <button
              onClick={() => onSetStartNode(node.id)}
              className={`icon-btn ${node.id === startNodeId ? 'active' : ''}`}
              title={node.id === startNodeId ? '当前为起始节点' : '设为起始节点'}
            >
              <Flag className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={node.type}
              onChange={(e) =>
                onUpdateNode((prev) => ({
                  ...prev,
                  type: e.target.value as WorkflowNodeType,
                }))
              }
              className="px-2 py-1"
              title="切换节点类型"
            >
              {NODE_CATEGORIES.map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {NODE_REGISTRY.filter((n) => n.category === cat.id).map(
                    (item) => (
                      <option key={item.type} value={item.type}>
                        [{item.categoryLabel}] {item.title}
                      </option>
                    )
                  )}
                </optgroup>
              ))}
            </select>

            <select
              value={node.chapterId}
              onChange={(e) =>
                onUpdateNode((prev) => ({ ...prev, chapterId: e.target.value }))
              }
              className="px-2 py-1"
              title="所属章节"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
          </div>

          {node.type !== 'choice' &&
            node.type !== 'timed_choice' &&
            node.type !== 'condition' &&
            node.type !== 'end' && (
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  执行完毕后跳转到下一节点 (Next Node)
                </label>
                <select
                  value={node.nextNodeId || ''}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      nextNodeId: e.target.value || null,
                    }))
                  }
                  className="w-full px-2 py-1"
                >
                  <option value="">-- 无 (结束或停留) --</option>
                  {allNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      [{getNodeMeta(n.type).title}] {n.title} ({n.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        {/* ==================== MODE 2: NODE JS / TS SCRIPT VIEW ==================== */}
        {viewMode === 'script' ? (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-[#1b1b21] border border-[#2a2a33] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-200">
                  节点脚本语言
                </span>
                <div className="flex items-center rounded bg-[#121216] p-0.5 border border-[#2c2c34]">
                  <button
                    onClick={() =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        scriptLanguage: 'javascript',
                      }))
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      node.scriptLanguage === 'javascript'
                        ? 'bg-amber-500/25 text-amber-300 font-semibold'
                        : 'text-zinc-500'
                    }`}
                  >
                    JavaScript (快速开发)
                  </button>
                  <button
                    onClick={() =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        scriptLanguage: 'typescript',
                      }))
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      node.scriptLanguage !== 'javascript'
                        ? 'bg-sky-500/25 text-sky-300 font-semibold'
                        : 'text-zinc-500'
                    }`}
                  >
                    TypeScript (严格编译)
                  </button>
                </div>
              </div>

              <pre className="p-2.5 rounded bg-[#101014] border border-[#272730] font-mono text-[10px] text-sky-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">
                {generateSingleNodeCode(
                  node,
                  node.scriptLanguage === 'javascript'
                    ? 'javascript'
                    : 'typescript'
                )}
              </pre>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1b1b21] border border-[#2a2a33] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-200">
                  自定义节点代码 (JS / TS)
                </span>
                <button
                  onClick={() =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      customScript: generateSingleNodeCode(
                        node,
                        node.scriptLanguage === 'javascript'
                          ? 'javascript'
                          : 'typescript'
                      ),
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-[#262630] hover:bg-[#30303c] text-[10px] text-zinc-200"
                >
                  载入模板
                </button>
              </div>
              <textarea
                rows={8}
                value={node.customScript || ''}
                onChange={(e) =>
                  onUpdateNode((prev) => ({
                    ...prev,
                    customScript: e.target.value,
                  }))
                }
                placeholder="// 编写自定义 JS/TS 逻辑，可在终端或脚本编辑器中通过 tsc 校验..."
                className="w-full p-2 rounded font-mono text-[11px] leading-relaxed"
              />
            </div>
          </div>
        ) : (
          /* ==================== MODE 1: DEDICATED NODE-TYPE-SPECIFIC CONFIG ==================== */
          <>
            {/* CASE A: SCRATCH-STYLE CONTAINER NODES (Repeat / While / ForEach / IfElse / Parallel / TryCatch) */}
            {meta.isContainer && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/35 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300">
                    {meta.title} · 多重嵌套子节点容器
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {(node.childrenNodes || []).length} 个顶层子节点
                  </span>
                </div>

                {node.type === 'repeat_loop' && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-200">循环执行次数 (N)</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={node.loopConfig?.repeatCount ?? 3}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          loopConfig: {
                            ...(prev.loopConfig || {}),
                            repeatCount: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-24 px-2 py-1 text-right font-mono"
                    />
                  </div>
                )}

                {(node.type === 'while_loop' ||
                  node.type === 'if_else_container') && (
                  <div>
                    <label className="block text-[10px] text-zinc-300 mb-1">
                      判断条件表达式 (JS / TS 布尔表达式)
                    </label>
                    <input
                      type="text"
                      value={
                        node.loopConfig?.conditionExpr ||
                        'ctx.affection.yukina >= 60'
                      }
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          loopConfig: {
                            ...(prev.loopConfig || {}),
                            conditionExpr: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 font-mono text-[11px]"
                    />
                  </div>
                )}

                {node.type === 'for_each_loop' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-300 mb-1">
                        遍历集合
                      </label>
                      <select
                        value={node.loopConfig?.collectionTarget || 'characters'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            loopConfig: {
                              ...(prev.loopConfig || {}),
                              collectionTarget: e.target.value as any,
                            },
                          }))
                        }
                        className="w-full px-2 py-1"
                      >
                        <option value="characters">全体登场角色 (characters)</option>
                        <option value="variables">全局变量表 (variables)</option>
                        <option value="clues">已解锁词条 (clues)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-300 mb-1">
                        迭代变量名
                      </label>
                      <input
                        type="text"
                        value={node.loopConfig?.iteratorVar || 'item'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            loopConfig: {
                              ...(prev.loopConfig || {}),
                              iteratorVar: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Recursive Tree of Nested Child Nodes */}
                {renderNestedTreeEditor(node.childrenNodes || [], 0)}

                {/* Add Child Node Buttons */}
                <div className="pt-1 border-t border-emerald-500/20 space-y-1">
                  <div className="text-[10px] text-emerald-300/80">
                    向容器内添加子节点（支持添加普通节点或继续嵌套容器节点）：
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {NESTED_ADD_OPTIONS.map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            childrenNodes: [
                              ...(prev.childrenNodes || []),
                              {
                                id: `child-${Date.now()}-${Math.random()
                                  .toString(36)
                                  .slice(2, 5)}`,
                                type: opt.type,
                                title: opt.label.replace('+ ', ''),
                                params: { ...opt.defaultParams },
                              },
                            ],
                          }))
                        }
                        className="px-2 py-1 rounded bg-[#1e1e26] hover:bg-[#282834] border border-emerald-500/35 text-emerald-200 text-[10px]"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CASE B: MATH / STRING / ARRAY / VARIABLE / FUNCTION CALL NODES */}
            {(node.type === 'math_operation' ||
              node.type === 'string_format' ||
              node.type === 'array_operation' ||
              node.type === 'set_variable' ||
              node.type === 'break_continue' ||
              node.type === 'function_call') && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-emerald-500/40 space-y-2.5">
                <div className="font-semibold text-emerald-300">
                  {meta.title} · 专属运算参数
                </div>

                {node.type === 'break_continue' ? (
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      循环控制指令
                    </label>
                    <select
                      value={node.loopConfig?.breakMode || 'break'}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          loopConfig: {
                            ...(prev.loopConfig || {}),
                            breakMode: e.target.value as any,
                          },
                        }))
                      }
                      className="w-full px-2 py-1.5 font-mono"
                    >
                      <option value="break">break (立即跳出当前循环)</option>
                      <option value="continue">continue (跳至下一轮迭代)</option>
                    </select>
                  </div>
                ) : node.type === 'set_variable' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        全局变量名 (Key)
                      </label>
                      <input
                        type="text"
                        value={node.variableKey || 'clueCount'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            variableKey: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        赋予新值 (Value)
                      </label>
                      <input
                        type="text"
                        value={String(node.variableValue ?? 1)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = Number(raw);
                          onUpdateNode((prev) => ({
                            ...prev,
                            variableValue:
                              raw === 'true'
                                ? true
                                : raw === 'false'
                                ? false
                                : !Number.isNaN(num) && raw.trim() !== ''
                                ? num
                                : raw,
                          }));
                        }}
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">
                          {node.type === 'function_call' ? '函数名' : '目标变量名'}
                        </label>
                        <input
                          type="text"
                          value={
                            node.type === 'function_call'
                              ? node.logicConfig?.functionName || 'onClocktowerChime'
                              : node.logicConfig?.targetVar || 'clueCount'
                          }
                          onChange={(e) =>
                            onUpdateNode((prev) => ({
                              ...prev,
                              logicConfig: {
                                targetVar:
                                  prev.logicConfig?.targetVar || 'clueCount',
                                operandValue:
                                  prev.logicConfig?.operandValue ?? 1,
                                ...(prev.logicConfig || {}),
                                ...(node.type === 'function_call'
                                  ? { functionName: e.target.value }
                                  : { targetVar: e.target.value }),
                              },
                            }))
                          }
                          className="w-full px-2 py-1 font-mono"
                        />
                      </div>

                      {node.type === 'math_operation' && (
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            数学运算符
                          </label>
                          <select
                            value={node.logicConfig?.mathOp || '+='}
                            onChange={(e) =>
                              onUpdateNode((prev) => ({
                                ...prev,
                                logicConfig: {
                                  targetVar:
                                    prev.logicConfig?.targetVar || 'clueCount',
                                  operandValue:
                                    prev.logicConfig?.operandValue ?? 1,
                                  ...(prev.logicConfig || {}),
                                  mathOp: e.target.value as any,
                                },
                              }))
                            }
                            className="w-full px-2 py-1 font-mono"
                          >
                            <option value="+=">+= (增加)</option>
                            <option value="-=">-= (减少)</option>
                            <option value="*=">*= (乘倍)</option>
                            <option value="/=">/= (除法)</option>
                            <option value="%=">%= (取模)</option>
                            <option value="=">= (赋值)</option>
                            <option value="random">random (随机整数)</option>
                            <option value="clamp">clamp (限制区间)</option>
                          </select>
                        </div>
                      )}

                      {node.type === 'array_operation' && (
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            数组动作
                          </label>
                          <select
                            value={node.logicConfig?.arrayAction || 'push'}
                            onChange={(e) =>
                              onUpdateNode((prev) => ({
                                ...prev,
                                logicConfig: {
                                  targetVar:
                                    prev.logicConfig?.targetVar || 'inventory',
                                  operandValue:
                                    prev.logicConfig?.operandValue || '',
                                  ...(prev.logicConfig || {}),
                                  arrayAction: e.target.value as any,
                                },
                              }))
                            }
                            className="w-full px-2 py-1 font-mono"
                          >
                            <option value="push">push (追加元素)</option>
                            <option value="remove">remove (移除元素)</option>
                            <option value="clear">clear (清空列表)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        {node.type === 'string_format'
                          ? '字符串格式化模板 (支持 ${变量名})'
                          : node.type === 'function_call'
                          ? '传入参数列表'
                          : '运算数值 / 元素内容'}
                      </label>
                      <input
                        type={node.type === 'math_operation' ? 'number' : 'text'}
                        value={
                          node.type === 'string_format'
                            ? node.logicConfig?.formatTemplate || ''
                            : node.type === 'function_call'
                            ? node.logicConfig?.functionArgs || 'ctx'
                            : String(node.logicConfig?.operandValue ?? 1)
                        }
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            logicConfig: {
                              targetVar:
                                prev.logicConfig?.targetVar || 'clueCount',
                              operandValue:
                                node.type === 'math_operation'
                                  ? Number(e.target.value)
                                  : e.target.value,
                              ...(prev.logicConfig || {}),
                              ...(node.type === 'string_format'
                                ? { formatTemplate: e.target.value }
                                : node.type === 'function_call'
                                ? { functionArgs: e.target.value }
                                : {}),
                            },
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CASE C: CHOICE / TIMED CHOICE / SWITCH / RANDOM BRANCH NODES */}
            {(node.type === 'choice' ||
              node.type === 'timed_choice' ||
              node.type === 'switch_branch' ||
              node.type === 'random_branch') && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-amber-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300">
                    {meta.title} · 分支选项路由 ({node.choices.length})
                  </span>
                  <button
                    onClick={onAddChoice}
                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    添加分支
                  </button>
                </div>

                {node.type === 'timed_choice' && (
                  <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[#141418] border border-[#2a2a33]">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">
                        倒计时秒数
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={node.timedChoiceSeconds ?? 10}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            timedChoiceSeconds: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">
                        超时默认跳转节点
                      </label>
                      <select
                        value={node.defaultTimeoutTargetId || ''}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            defaultTimeoutTargetId: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1"
                      >
                        {allNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {node.choices.map((ch, idx) => (
                    <div
                      key={ch.id}
                      className="p-2 rounded bg-[#141418] border border-[#2a2a33] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono text-amber-300">
                          选项 #{idx + 1}
                        </span>
                        <button
                          onClick={() => onDeleteChoice(ch.id)}
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={ch.text}
                        onChange={(e) =>
                          onUpdateChoice(ch.id, { text: e.target.value })
                        }
                        className="w-full px-2 py-1"
                        placeholder="选项文本..."
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={ch.targetNodeId}
                          onChange={(e) =>
                            onUpdateChoice(ch.id, {
                              targetNodeId: e.target.value,
                            })
                          }
                          className="px-2 py-1 text-[11px]"
                        >
                          {allNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              → {n.title}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <select
                            value={ch.affectionCharacterId || ''}
                            onChange={(e) =>
                              onUpdateChoice(ch.id, {
                                affectionCharacterId:
                                  e.target.value || undefined,
                              })
                            }
                            className="flex-1 px-1.5 py-1 text-[11px]"
                          >
                            <option value="">无好感变化</option>
                            {characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={ch.affectionDelta ?? 0}
                            onChange={(e) =>
                              onUpdateChoice(ch.id, {
                                affectionDelta: Number(e.target.value),
                              })
                            }
                            className="w-12 px-1 py-1 text-center font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CASE D: CONDITION BRANCH NODE */}
            {node.type === 'condition' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-amber-500/40 space-y-2.5">
                <div className="font-semibold text-amber-300">
                  条件分支判定规则 (IF / ELSE)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      判定类型
                    </label>
                    <select
                      value={node.conditionRule?.variableType || 'affection'}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          conditionRule: {
                            variableType: e.target.value as any,
                            characterId: characters[0]?.id || 'yukina',
                            attributeKey: 'affection',
                            operator: '>=',
                            compareValue: 50,
                            trueTargetNodeId: prev.nextNodeId || allNodes[0]?.id,
                            falseTargetNodeId: prev.nextNodeId || allNodes[0]?.id,
                            ...(prev.conditionRule || {}),
                          },
                        }))
                      }
                      className="w-full px-2 py-1"
                    >
                      <option value="affection">角色好感度</option>
                      <option value="global_var">全局变量</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      比较运算符
                    </label>
                    <select
                      value={node.conditionRule?.operator || '>='}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          conditionRule: {
                            ...(prev.conditionRule || {
                              variableType: 'affection',
                              attributeKey: 'affection',
                              compareValue: 50,
                              trueTargetNodeId: '',
                              falseTargetNodeId: '',
                            }),
                            operator: e.target.value as any,
                          },
                        }))
                      }
                      className="w-full px-2 py-1 font-mono"
                    >
                      <option value=">=">&gt;= (大于等于)</option>
                      <option value=">">&gt; (大于)</option>
                      <option value="==">== (等于)</option>
                      <option value="<=">&lt;= (小于等于)</option>
                      <option value="<">&lt; (小于)</option>
                      <option value="!=">!= (不等于)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    比较阈值
                  </label>
                  <input
                    type="text"
                    value={String(node.conditionRule?.compareValue ?? 50)}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        conditionRule: {
                          ...(prev.conditionRule || {
                            variableType: 'affection',
                            attributeKey: 'affection',
                            operator: '>=',
                            trueTargetNodeId: '',
                            falseTargetNodeId: '',
                          }),
                          compareValue: Number.isNaN(Number(e.target.value))
                            ? e.target.value
                            : Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full px-2 py-1 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] text-emerald-400 mb-1">
                      成立 (TRUE) 跳转至
                    </label>
                    <select
                      value={node.conditionRule?.trueTargetNodeId || ''}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          conditionRule: {
                            ...(prev.conditionRule as any),
                            trueTargetNodeId: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-2 py-1"
                    >
                      {allNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-rose-400 mb-1">
                      不成立 (FALSE) 跳转至
                    </label>
                    <select
                      value={node.conditionRule?.falseTargetNodeId || ''}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          conditionRule: {
                            ...(prev.conditionRule as any),
                            falseTargetNodeId: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-2 py-1"
                    >
                      {allNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* CASE E: WAIT / STREAM PRELOAD / MSVN / END CONTROL NODES */}
            {(node.type === 'wait_timer' ||
              node.type === 'stream_preload_hint' ||
              node.type === 'msvn_chapter_load' ||
              node.type === 'end') && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-amber-500/40 space-y-2.5">
                <div className="font-semibold text-amber-300">
                  {meta.title} · 控制参数
                </div>
                {node.type === 'wait_timer' && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-zinc-300">暂停等待时长 (毫秒)</span>
                      <span className="font-mono text-amber-300">
                        {node.waitDurationMs ?? 1500} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={10000}
                      step={100}
                      value={node.waitDurationMs ?? 1500}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          waitDurationMs: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                )}

                {node.type === 'stream_preload_hint' && (
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>提前流式解压后续场景数</span>
                        <span className="font-mono text-amber-300">
                          {node.settingsActionConfig?.preloadAheadScenes ?? 3} 个场景
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={node.settingsActionConfig?.preloadAheadScenes ?? 3}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            settingsActionConfig: {
                              ...(prev.settingsActionConfig || {}),
                              preloadAheadScenes: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>自动卸载已走过的旧场景数</span>
                        <span className="font-mono text-amber-300">
                          {node.settingsActionConfig?.unloadBehindScenes ?? 5} 个场景
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={node.settingsActionConfig?.unloadBehindScenes ?? 5}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            settingsActionConfig: {
                              ...(prev.settingsActionConfig || {}),
                              unloadBehindScenes: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                {node.type === 'end' && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        结局类型
                      </label>
                      <select
                        value={node.endingType || 'good'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            endingType: e.target.value as any,
                          }))
                        }
                        className="w-full px-2 py-1"
                      >
                        <option value="true">True Ending (真结局)</option>
                        <option value="good">Good Ending (好结局)</option>
                        <option value="normal">Normal Ending (普通结局)</option>
                        <option value="bad">Bad Ending (坏结局)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        结局标题字幕
                      </label>
                      <input
                        type="text"
                        value={node.endingTitle || '结局：第十三声钟鸣的约定'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            endingTitle: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CASE F: SCREEN TEXT / CHAPTER TITLE / SUBTITLE / BANNER NODES */}
            {(node.type === 'screen_text' ||
              node.type === 'chapter_title' ||
              node.type === 'floating_subtitle' ||
              node.type === 'banner_notice' ||
              Boolean(node.screenTextConfig)) && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-purple-500/40 space-y-2.5">
                <div className="font-semibold text-purple-300">
                  {meta.title} · 屏幕坐标与排版参数
                </div>
                <textarea
                  rows={2}
                  value={node.screenTextConfig?.text || node.title}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      screenTextConfig: {
                        text: e.target.value,
                        x: prev.screenTextConfig?.x ?? 50,
                        y: prev.screenTextConfig?.y ?? 45,
                        fontSize: prev.screenTextConfig?.fontSize ?? 30,
                        color: prev.screenTextConfig?.color || '#ffffff',
                        align: prev.screenTextConfig?.align || 'center',
                        bgOverlay: prev.screenTextConfig?.bgOverlay || 'dim',
                        animation: prev.screenTextConfig?.animation || 'fade',
                        durationMs: prev.screenTextConfig?.durationMs ?? 2200,
                      },
                    }))
                  }
                  className="w-full p-2 text-xs"
                  placeholder="输入屏幕显示的文字..."
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>水平 X</span>
                      <span>{node.screenTextConfig?.x ?? 50}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={node.screenTextConfig?.x ?? 50}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...(prev.screenTextConfig as any),
                            x: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>垂直 Y</span>
                      <span>{node.screenTextConfig?.y ?? 45}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={node.screenTextConfig?.y ?? 45}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...(prev.screenTextConfig as any),
                            y: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>字号</span>
                      <span>{node.screenTextConfig?.fontSize ?? 30}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={64}
                      value={node.screenTextConfig?.fontSize ?? 30}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...(prev.screenTextConfig as any),
                            fontSize: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CASE G: AUDIO NODES (BGM Play / Stop / SFX / Voice) */}
            {meta.category === 'audio' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-orange-500/40 space-y-2.5">
                <div className="font-semibold text-orange-300">
                  {meta.title} · 音频轨道控制
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    选择音频资源
                  </label>
                  <select
                    value={
                      node.type === 'sfx_play'
                        ? node.sfxId || AUDIO_ASSETS[0].id
                        : node.bgmId
                    }
                    onChange={(e) =>
                      onUpdateNode((prev) =>
                        node.type === 'sfx_play'
                          ? { ...prev, sfxId: e.target.value }
                          : { ...prev, bgmId: e.target.value }
                      )
                    }
                    className="w-full px-2 py-1.5"
                  >
                    {AUDIO_ASSETS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const targetId =
                        node.type === 'sfx_play'
                          ? node.sfxId || AUDIO_ASSETS[0].id
                          : node.bgmId;
                      const asset =
                        AUDIO_ASSETS.find((a) => a.id === targetId) ||
                        AUDIO_ASSETS[0];
                      if (playingAudioId === asset.id) {
                        soundEngine.stopBgm();
                        setPlayingAudioId(null);
                      } else {
                        soundEngine.playBgm(asset);
                        setPlayingAudioId(asset.id);
                      }
                    }}
                    className="px-3 py-1.5 rounded bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 flex items-center gap-1.5"
                  >
                    {playingAudioId ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        停止试听
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        试听当前音轨
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* CASE H: CHARACTER NODES (Enter / Exit / Expression / Move / Action / Highlight / Affection) */}
            {meta.category === 'character' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-pink-500/40 space-y-2.5">
                <div className="font-semibold text-pink-300">
                  {meta.title} · 角色与立绘参数
                </div>

                {node.type === 'affection_change' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        目标角色
                      </label>
                      <select
                        value={
                          node.affectionTargetCharId ||
                          characters[0]?.id ||
                          'yukina'
                        }
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            affectionTargetCharId: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        好感度增减值 (Delta)
                      </label>
                      <input
                        type="number"
                        value={node.affectionDelta ?? 10}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            affectionDelta: Number(e.target.value),
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                  </div>
                ) : node.type === 'char_expression' ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        选择切换后的角色差分立绘
                      </label>
                      <select
                        value={
                          node.targetExpressionSpriteId ||
                          CHARACTER_ASSETS[0].id
                        }
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            targetExpressionSpriteId: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1.5"
                      >
                        {CHARACTER_ASSETS.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.characterGroup} · {sp.expressionLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {node.characters.map((pl) => (
                      <div
                        key={pl.id}
                        className="p-2 rounded bg-[#141418] border border-[#2a2a33] space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-pink-200">
                            {pl.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            X:{pl.x}% Y:{pl.y}% Scale:{pl.scale}x
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="range"
                            min={5}
                            max={95}
                            value={pl.x}
                            onChange={(e) =>
                              onUpdateNode((prev) => ({
                                ...prev,
                                characters: prev.characters.map((c) =>
                                  c.id === pl.id
                                    ? { ...c, x: Number(e.target.value) }
                                    : c
                                ),
                              }))
                            }
                            title="水平位置 X%"
                          />
                          <select
                            value={pl.enterAnimation || 'fade'}
                            onChange={(e) =>
                              onUpdateNode((prev) => ({
                                ...prev,
                                characters: prev.characters.map((c) =>
                                  c.id === pl.id
                                    ? {
                                        ...c,
                                        enterAnimation: e.target.value as any,
                                      }
                                    : c
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 text-[11px]"
                          >
                            <option value="fade">淡入 (Fade)</option>
                            <option value="slide-left">左侧滑入</option>
                            <option value="slide-right">右侧滑入</option>
                            <option value="bounce">欢快跃入</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CASE I: VISUAL & CAMERA NODES */}
            {meta.category === 'visual' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-teal-500/40 space-y-2.5">
                <div className="font-semibold text-teal-300">
                  {meta.title} · 视觉演出参数
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    场景背景图
                  </label>
                  <select
                    value={node.backgroundId}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        backgroundId: e.target.value,
                      }))
                    }
                    className="w-full px-2 py-1.5"
                  >
                    {BACKGROUND_ASSETS.map((b) => (
                      <option key={b.id} value={b.id}>
                        [{b.category}] {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {(node.type === 'camera_pan_zoom' ||
                  node.type === 'camera_shake' ||
                  node.type === 'screen_flash') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        镜头缩放 (Zoom)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.8"
                        max="2.0"
                        value={node.cameraConfig?.zoom ?? 1.2}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            cameraConfig: {
                              zoom: Number(e.target.value),
                              offsetX: prev.cameraConfig?.offsetX ?? 0,
                              offsetY: prev.cameraConfig?.offsetY ?? 0,
                              shakeIntensity:
                                prev.cameraConfig?.shakeIntensity || 'medium',
                              durationMs: prev.cameraConfig?.durationMs ?? 700,
                            },
                          }))
                        }
                        className="w-full px-2 py-1 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        震动强度
                      </label>
                      <select
                        value={node.cameraConfig?.shakeIntensity || 'medium'}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            cameraConfig: {
                              zoom: prev.cameraConfig?.zoom ?? 1,
                              offsetX: prev.cameraConfig?.offsetX ?? 0,
                              offsetY: prev.cameraConfig?.offsetY ?? 0,
                              shakeIntensity: e.target.value as any,
                              durationMs: prev.cameraConfig?.durationMs ?? 700,
                            },
                          }))
                        }
                        className="w-full px-2 py-1"
                      >
                        <option value="none">无震动</option>
                        <option value="light">轻度震屏</option>
                        <option value="medium">中度震屏</option>
                        <option value="heavy">剧烈震屏</option>
                      </select>
                    </div>
                  </div>
                )}

                {node.type === 'weather_particles' && (
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      粒子天气特效
                    </label>
                    <select
                      value={node.weatherEffect || 'sakura'}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          weatherEffect: e.target.value as any,
                        }))
                      }
                      className="w-full px-2 py-1.5"
                    >
                      <option value="sakura">樱花飘落</option>
                      <option value="rain">细雨连绵</option>
                      <option value="snow">冬雪纷飞</option>
                      <option value="fireflies">夏夜流萤</option>
                      <option value="sunset_glow">黄昏光尘</option>
                      <option value="none">关闭粒子</option>
                    </select>
                  </div>
                )}

                {node.type === 'color_filter' && (
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      色彩滤镜
                    </label>
                    <select
                      value={node.colorFilter || 'sepia'}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          colorFilter: e.target.value as any,
                        }))
                      }
                      className="w-full px-2 py-1.5"
                    >
                      <option value="sepia">旧日怀旧 (Sepia)</option>
                      <option value="grayscale">黑白记忆 (Grayscale)</option>
                      <option value="night_blue">深蓝夜幕 (Night Blue)</option>
                      <option value="dream_bloom">梦境柔光 (Dream Bloom)</option>
                      <option value="none">标准原色</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* CASE J: UI & SETTINGS NODES */}
            {meta.category === 'ui' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-blue-500/40 space-y-2.5">
                <div className="font-semibold text-blue-300">
                  {meta.title} · 界面与通知参数
                </div>
                {(node.type === 'popup_toast' || node.type === 'clue_unlock') && (
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      顶部弹窗提示文本
                    </label>
                    <input
                      type="text"
                      value={node.toastMessage || ''}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          toastMessage: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1"
                    />
                  </div>
                )}
                {node.type === 'clue_unlock' && (
                  <>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        解锁档案词条标题
                      </label>
                      <input
                        type="text"
                        value={node.unlockedClueTitle || ''}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            unlockedClueTitle: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">
                        档案词条详细描述
                      </label>
                      <textarea
                        rows={2}
                        value={node.unlockedClueDesc || ''}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            unlockedClueDesc: e.target.value,
                          }))
                        }
                        className="w-full p-2 text-xs"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CASE K: NARRATIVE DIALOGUE / MONOLOGUE / CG CAPTION NODES */}
            {meta.category === 'narrative' && (
              <div className="p-3 rounded-lg bg-[#1b1b22] border border-sky-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sky-300">
                    {meta.title} · 台词与独白序列 ({node.dialogues.length})
                  </span>
                  <button
                    onClick={onAddDialogue}
                    className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[11px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    添加台词
                  </button>
                </div>

                <div className="space-y-2">
                  {node.dialogues.map((line, idx) => {
                    const isCurrent = idx === selectedDialogueIndex;
                    return (
                      <div
                        key={line.id}
                        onClick={() => onSelectDialogueIndex(idx)}
                        className={`p-2 rounded border transition cursor-pointer space-y-1.5 ${
                          isCurrent
                            ? 'bg-[#22222c] border-sky-400/60'
                            : 'bg-[#141418] border-[#272730]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <select
                            value={line.speakerId}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'narrator') {
                                onUpdateDialogue(line.id, {
                                  speakerId: 'narrator',
                                  speakerName: '旁白',
                                  speakerColor: '#94a3b8',
                                });
                              } else {
                                const c = characters.find((x) => x.id === val);
                                if (c) {
                                  onUpdateDialogue(line.id, {
                                    speakerId: c.id,
                                    speakerName: c.name,
                                    speakerColor: c.color,
                                  });
                                }
                              }
                            }}
                            className="px-2 py-0.5 text-[11px]"
                          >
                            <option value="narrator">旁白 / 独白</option>
                            {characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDialogue(line.id);
                            }}
                            className="text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <textarea
                          rows={2}
                          value={line.text}
                          onChange={(e) =>
                            onUpdateDialogue(line.id, { text: e.target.value })
                          }
                          className="w-full p-1.5 text-xs resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
