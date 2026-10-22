import React, { useState } from 'react';
import { Plus, Trash2, Flag } from 'lucide-react';
import {
  SceneNode,
  DialogueLine,
  ChoiceOption,
  WorkflowNodeType,
  CharacterProfile,
  StoryChapter,
} from '../types';
import { BACKGROUND_ASSETS, AUDIO_ASSETS, CHARACTER_ASSETS } from '../data/assets';
import { NODE_CATEGORIES, NODE_REGISTRY } from '../data/nodeRegistry';

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
  onUpdateCharacterProfile: (charId: string, updater: (c: CharacterProfile) => CharacterProfile) => void;
  onAddCharacterProfile: () => void;
}

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
  onUpdateCharacterProfile,
  onAddCharacterProfile,
}) => {
  const [tab, setTab] = useState<'dialogue' | 'visual' | 'flow' | 'char'>('dialogue');

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-300 select-none overflow-hidden">
      {/* Clean 4-Tab Navigation */}
      <div className="grid grid-cols-4 border-b border-[#27272c] bg-[#141417] shrink-0 text-xs">
        {(
          [
            ['dialogue', '对白'],
            ['visual', '演出'],
            ['flow', '流转'],
            ['char', '角色'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`py-2 font-medium border-b-2 transition ${
              tab === id
                ? 'border-zinc-200 text-white bg-[#161619]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* Compact Node Header */}
        <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={node.title}
              onChange={(e) => onUpdateNode((prev) => ({ ...prev, title: e.target.value }))}
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
            {/* Categorized <optgroup> Node Type Selector */}
            <select
              value={node.type}
              onChange={(e) =>
                onUpdateNode((prev) => ({
                  ...prev,
                  type: e.target.value as WorkflowNodeType,
                }))
              }
              className="px-2 py-1"
              title="节点类型"
            >
              {NODE_CATEGORIES.map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {NODE_REGISTRY.filter((n) => n.category === cat.id).map((item) => (
                    <option key={item.type} value={item.type}>
                      [{item.categoryLabel}] {item.title}
                    </option>
                  ))}
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
        </div>

        {/* ==================== TAB 1: DIALOGUE & SCREEN TEXT ==================== */}
        {tab === 'dialogue' && (
          <div className="space-y-2.5">
            {/* Screen Text Toggle & Controls */}
            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">屏幕文字</span>
                <input
                  type="checkbox"
                  checked={!!node.screenTextConfig}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      screenTextConfig: e.target.checked
                        ? {
                            text: '屏幕中央字幕',
                            subText: '',
                            x: 50,
                            y: 45,
                            fontSize: 30,
                            color: '#ffffff',
                            strokeColor: '#000000',
                            align: 'center',
                            bgOverlay: 'dim',
                            animation: 'fade',
                            durationMs: 2200,
                          }
                        : undefined,
                    }))
                  }
                />
              </div>

              {node.screenTextConfig && (
                <div className="space-y-2 pt-1">
                  <textarea
                    rows={2}
                    value={node.screenTextConfig.text}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        screenTextConfig: {
                          ...prev.screenTextConfig!,
                          text: e.target.value,
                        },
                      }))
                    }
                    placeholder="屏幕显示文字"
                    className="w-full p-2 text-xs resize-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>X</span>
                        <span>{node.screenTextConfig.x}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={node.screenTextConfig.x}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            screenTextConfig: {
                              ...prev.screenTextConfig!,
                              x: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>Y</span>
                        <span>{node.screenTextConfig.y}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={node.screenTextConfig.y}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            screenTextConfig: {
                              ...prev.screenTextConfig!,
                              y: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>字号</span>
                        <span>{node.screenTextConfig.fontSize}</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={64}
                        value={node.screenTextConfig.fontSize}
                        onChange={(e) =>
                          onUpdateNode((prev) => ({
                            ...prev,
                            screenTextConfig: {
                              ...prev.screenTextConfig!,
                              fontSize: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={node.screenTextConfig.bgOverlay}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...prev.screenTextConfig!,
                            bgOverlay: e.target.value as any,
                          },
                        }))
                      }
                      className="px-2 py-1"
                    >
                      <option value="none">透明</option>
                      <option value="dim">暗场</option>
                      <option value="cinematic_bars">电影黑边</option>
                      <option value="black">黑屏</option>
                    </select>
                    <input
                      type="color"
                      value={node.screenTextConfig.color}
                      onChange={(e) =>
                        onUpdateNode((prev) => ({
                          ...prev,
                          screenTextConfig: {
                            ...prev.screenTextConfig!,
                            color: e.target.value,
                          },
                        }))
                      }
                      className="w-full h-7"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Dialogue List Header */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] text-zinc-400">
                台词 ({node.dialogues.length})
              </span>
              <button
                onClick={onAddDialogue}
                className="icon-btn"
                title="新增台词"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
              </button>
            </div>

            <div className="space-y-2">
              {node.dialogues.map((line, index) => {
                const isCurrent = index === selectedDialogueIndex;
                const charObj = characters.find((c) => c.id === line.speakerId);
                const charExpressions = charObj?.expressions || [];

                return (
                  <div
                    key={line.id}
                    onClick={() => onSelectDialogueIndex(index)}
                    className={`p-2 rounded-md border transition cursor-pointer space-y-1.5 ${
                      isCurrent
                        ? 'bg-[#202026] border-zinc-400'
                        : 'bg-[#1a1a1e] border-[#27272c] hover:border-zinc-600'
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
                            const ch = characters.find((c) => c.id === val);
                            if (ch) {
                              onUpdateDialogue(line.id, {
                                speakerId: ch.id,
                                speakerName: ch.name,
                                speakerColor: ch.color,
                                expressionSpriteId: ch.spriteId,
                              });
                            }
                          }
                        }}
                        className="px-2 py-0.5 flex-1"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="narrator">旁白</option>
                      </select>

                      {charExpressions.length > 0 && (
                        <select
                          value={line.expressionSpriteId || charObj?.spriteId}
                          onChange={(e) =>
                            onUpdateDialogue(line.id, {
                              expressionSpriteId: e.target.value,
                            })
                          }
                          className="px-1.5 py-0.5 w-24"
                          title="角色表情差分"
                        >
                          {charExpressions.map((ex) => (
                            <option key={ex.spriteId} value={ex.spriteId}>
                              {ex.label}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDialogue(line.id);
                        }}
                        className="icon-btn !w-5 !h-5"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={line.text}
                      onChange={(e) => onUpdateDialogue(line.id, { text: e.target.value })}
                      className="w-full p-1.5 text-xs resize-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: VISUAL & AUDIO (演出) ==================== */}
        {tab === 'visual' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
              <div className="text-[11px] font-medium text-zinc-300">背景与音频</div>
              <select
                value={node.backgroundId}
                onChange={(e) =>
                  onUpdateNode((prev) => ({ ...prev, backgroundId: e.target.value }))
                }
                className="w-full px-2 py-1"
              >
                {BACKGROUND_ASSETS.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    [{bg.category}] {bg.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={node.bgmId}
                  onChange={(e) => onUpdateNode((prev) => ({ ...prev, bgmId: e.target.value }))}
                  className="px-2 py-1"
                >
                  {AUDIO_ASSETS.filter((a) => a.type === 'bgm').map((bgm) => (
                    <option key={bgm.id} value={bgm.id}>
                      {bgm.name}
                    </option>
                  ))}
                </select>
                <select
                  value={node.sfxId || ''}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({ ...prev, sfxId: e.target.value || undefined }))
                  }
                  className="px-2 py-1"
                >
                  <option value="">无音效</option>
                  {AUDIO_ASSETS.filter((a) => a.type === 'sfx').map((sfx) => (
                    <option key={sfx.id} value={sfx.id}>
                      {sfx.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
              <div className="text-[11px] font-medium text-zinc-300">粒子与色调</div>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={node.weatherEffect || 'none'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      weatherEffect: e.target.value as any,
                    }))
                  }
                  className="px-2 py-1"
                >
                  <option value="none">无粒子</option>
                  <option value="sakura">樱花</option>
                  <option value="sunset_glow">晚霞</option>
                  <option value="rain">细雨</option>
                  <option value="fireflies">萤火</option>
                  <option value="snow">初雪</option>
                </select>
                <select
                  value={node.colorFilter || 'none'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      colorFilter: e.target.value as any,
                    }))
                  }
                  className="px-2 py-1"
                >
                  <option value="none">正常色调</option>
                  <option value="sepia">怀旧</option>
                  <option value="grayscale">黑白</option>
                  <option value="night_blue">夜蓝</option>
                  <option value="dream_bloom">柔光</option>
                </select>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
              <div className="text-[11px] font-medium text-zinc-300">镜头与淡入淡出</div>
              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>缩放</span>
                    <span>{node.cameraConfig?.zoom ?? 1}x</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={1.8}
                    step={0.05}
                    value={node.cameraConfig?.zoom ?? 1}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        cameraConfig: {
                          zoom: Number(e.target.value),
                          offsetX: prev.cameraConfig?.offsetX ?? 0,
                          offsetY: prev.cameraConfig?.offsetY ?? 0,
                          shakeIntensity: prev.cameraConfig?.shakeIntensity ?? 'none',
                          durationMs: 700,
                        },
                      }))
                    }
                  />
                </div>
                <select
                  value={node.cameraConfig?.shakeIntensity || 'none'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      cameraConfig: {
                        zoom: prev.cameraConfig?.zoom ?? 1,
                        offsetX: 0,
                        offsetY: 0,
                        shakeIntensity: e.target.value as any,
                        durationMs: 700,
                      },
                    }))
                  }
                  className="px-2 py-1"
                >
                  <option value="none">无震动</option>
                  <option value="light">轻度震动</option>
                  <option value="medium">中度震动</option>
                  <option value="heavy">剧烈震动</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <select
                  value={node.fadeConfig?.targetType || 'screen'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      fadeConfig: {
                        targetType: e.target.value as any,
                        direction: prev.fadeConfig?.direction || 'in',
                        durationMs: prev.fadeConfig?.durationMs || 800,
                        easing: 'ease-in-out',
                      },
                    }))
                  }
                  className="px-2 py-1"
                >
                  <option value="screen">整屏</option>
                  <option value="character">角色</option>
                  <option value="background">背景</option>
                </select>
                <select
                  value={node.fadeConfig?.direction || 'in'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      fadeConfig: {
                        targetType: prev.fadeConfig?.targetType || 'screen',
                        direction: e.target.value as any,
                        durationMs: prev.fadeConfig?.durationMs || 800,
                        easing: 'ease-in-out',
                      },
                    }))
                  }
                  className="px-2 py-1"
                >
                  <option value="in">淡入</option>
                  <option value="out">淡出</option>
                </select>
                <input
                  type="number"
                  step={100}
                  value={node.fadeConfig?.durationMs || 800}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      fadeConfig: {
                        targetType: prev.fadeConfig?.targetType || 'screen',
                        direction: prev.fadeConfig?.direction || 'in',
                        durationMs: Number(e.target.value),
                        easing: 'ease-in-out',
                      },
                    }))
                  }
                  className="px-2 py-1"
                  title="时长(ms)"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: FLOW & BRANCHES (流转) ==================== */}
        {tab === 'flow' && (
          <div className="space-y-2.5">
            {node.type !== 'choice' &&
              node.type !== 'timed_choice' &&
              node.type !== 'condition' &&
              node.type !== 'end' && (
                <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-1.5">
                  <div className="text-[11px] text-zinc-400">下一节点</div>
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
                    <option value="">无</option>
                    {allNodes
                      .filter((n) => n.id !== node.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

            {node.type === 'timed_choice' && (
              <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between">
                <span className="text-[11px] text-zinc-300">倒计时 (秒)</span>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={node.timedChoiceSeconds || 12}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      timedChoiceSeconds: Number(e.target.value),
                    }))
                  }
                  className="w-20 px-2 py-1"
                />
              </div>
            )}

            {node.type === 'condition' && (
              <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2">
                <div className="text-[11px] font-medium text-zinc-300">条件判断</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={node.conditionRule?.characterId || characters[0]?.id}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        conditionRule: {
                          ...(prev.conditionRule || {
                            variableType: 'affection',
                            attributeKey: 'affection',
                            operator: '>=',
                            compareValue: 50,
                            trueTargetNodeId: startNodeId,
                            falseTargetNodeId: startNodeId,
                          }),
                          characterId: e.target.value,
                        },
                      }))
                    }
                    className="px-2 py-1"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}好感
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={Number(node.conditionRule?.compareValue ?? 50)}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        conditionRule: {
                          ...prev.conditionRule!,
                          compareValue: Number(e.target.value),
                        },
                      }))
                    }
                    className="px-2 py-1"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-zinc-500">满足时跳转</div>
                  <select
                    value={node.conditionRule?.trueTargetNodeId || ''}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        conditionRule: {
                          ...prev.conditionRule!,
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
                <div className="space-y-1">
                  <div className="text-[10px] text-zinc-500">不满足时跳转</div>
                  <select
                    value={node.conditionRule?.falseTargetNodeId || ''}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        conditionRule: {
                          ...prev.conditionRule!,
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
            )}

            {/* Choices */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">
                  分支选项 ({node.choices.length})
                </span>
                <button
                  onClick={onAddChoice}
                  className="icon-btn"
                  title="新增选项"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
                </button>
              </div>
              {node.choices.map((choice) => (
                <div
                  key={choice.id}
                  className="p-2 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => onUpdateChoice(choice.id, { text: e.target.value })}
                      className="flex-1 px-2 py-1"
                    />
                    <button
                      onClick={() => onDeleteChoice(choice.id)}
                      className="icon-btn !w-5 !h-5"
                      title="删除"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={choice.targetNodeId}
                      onChange={(e) =>
                        onUpdateChoice(choice.id, { targetNodeId: e.target.value })
                      }
                      className="col-span-2 px-2 py-1"
                    >
                      {allNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={choice.affectionDelta ?? 0}
                      onChange={(e) =>
                        onUpdateChoice(choice.id, { affectionDelta: Number(e.target.value) })
                      }
                      className="px-2 py-1"
                      title="好感增减"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: CHARACTERS (角色) ==================== */}
        {tab === 'char' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                角色 ({characters.length})
              </span>
              <button
                onClick={onAddCharacterProfile}
                className="icon-btn"
                title="新增角色"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
              </button>
            </div>
            {characters.map((char) => (
              <div
                key={char.id}
                className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-100">{char.name}</span>
                  <span className="text-[10px] text-zinc-500">
                    {char.expressions?.length || 1} 差分
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    value={char.initialAffection}
                    onChange={(e) =>
                      onUpdateCharacterProfile(char.id, (prev) => ({
                        ...prev,
                        initialAffection: Number(e.target.value),
                      }))
                    }
                    className="px-2 py-1"
                    title="初始好感度"
                  />
                  <select
                    value={char.spriteId}
                    onChange={(e) =>
                      onUpdateCharacterProfile(char.id, (prev) => ({
                        ...prev,
                        spriteId: e.target.value,
                      }))
                    }
                    className="px-2 py-1"
                  >
                    {CHARACTER_ASSETS.filter((a) => a.characterGroup === char.name).map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.expressionLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
