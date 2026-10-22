import React, { useState } from 'react';
import {
  Sliders,
  MessageSquare,
  GitBranch,
  Plus,
  Trash2,
  Heart,
  Code2,
  Eye,
  Type,
  Camera,
} from 'lucide-react';
import {
  SceneNode,
  DialogueLine,
  ChoiceOption,
  WorkflowNodeType,
  ScriptLanguage,
  CharacterProfile,
  StoryChapter,
} from '../types';
import { BACKGROUND_ASSETS, AUDIO_ASSETS, CHARACTER_ASSETS } from '../data/assets';
import { NODE_REGISTRY, getNodeMeta } from '../data/nodeRegistry';

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
  const [section, setSection] = useState<'dialogue' | 'scene' | 'branch' | 'characters'>('dialogue');
  const meta = getNodeMeta(node.type);

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-[#cccccc] select-none overflow-hidden">
      {/* Sub-tabs */}
      <div className="grid grid-cols-4 border-b border-[#2b2b30] bg-[#1f1f23] shrink-0">
        <button
          onClick={() => setSection('dialogue')}
          className={`flex items-center justify-center gap-1 py-2 text-[11px] font-medium border-b-2 transition ${
            section === 'dialogue'
              ? 'border-[#007acc] text-white bg-[#18181b]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          台词与文字
        </button>
        <button
          onClick={() => setSection('scene')}
          className={`flex items-center justify-center gap-1 py-2 text-[11px] font-medium border-b-2 transition ${
            section === 'scene'
              ? 'border-[#007acc] text-white bg-[#18181b]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          节点属性
        </button>
        <button
          onClick={() => setSection('branch')}
          className={`flex items-center justify-center gap-1 py-2 text-[11px] font-medium border-b-2 transition ${
            section === 'branch'
              ? 'border-[#007acc] text-white bg-[#18181b]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          控制与分流
        </button>
        <button
          onClick={() => setSection('characters')}
          className={`flex items-center justify-center gap-1 py-2 text-[11px] font-medium border-b-2 transition ${
            section === 'characters'
              ? 'border-[#007acc] text-white bg-[#18181b]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          角色好感
        </button>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Node Identity Card */}
        <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ background: meta.badgeBg, color: meta.badgeText }}
            >
              类型标：{meta.categoryLabel}
            </span>
            {node.id !== startNodeId ? (
              <button
                onClick={() => onSetStartNode(node.id)}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition"
              >
                设为起始节点
              </button>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                起始入口
              </span>
            )}
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">节点标题</label>
            <input
              type="text"
              value={node.title}
              onChange={(e) => onUpdateNode((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#007acc]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                节点类型 (共{NODE_REGISTRY.length}种)
              </label>
              <select
                value={node.type}
                onChange={(e) =>
                  onUpdateNode((prev) => ({
                    ...prev,
                    type: e.target.value as WorkflowNodeType,
                  }))
                }
                className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
              >
                {NODE_REGISTRY.map((item) => (
                  <option key={item.type} value={item.type}>
                    [{item.categoryLabel}] {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">所属章节文件</label>
              <select
                value={node.chapterId}
                onChange={(e) =>
                  onUpdateNode((prev) => ({ ...prev, chapterId: e.target.value }))
                }
                className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
              >
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 1. DIALOGUE & SCREEN TEXT SECTION */}
        {section === 'dialogue' && (
          <div className="space-y-3">
            {/* Screen Text Editor (available on screen_text nodes or toggleable on any node!) */}
            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-300">
                  <Type className="w-3.5 h-3.5" />
                  <span>屏幕自由文字显示 (Screen Text)</span>
                </div>
                <button
                  onClick={() =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      screenTextConfig: prev.screenTextConfig
                        ? undefined
                        : {
                            text: '显示在屏幕上的关键文字',
                            subText: 'SHIOMI CHRONICLE',
                            x: 50,
                            y: 45,
                            fontSize: 30,
                            color: '#ffffff',
                            strokeColor: '#020617',
                            align: 'center',
                            bgOverlay: 'dim',
                            animation: 'fade',
                            durationMs: 2200,
                          },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-[#252529] hover:bg-[#2f2f37] border border-[#3c3c42] text-[10px] text-slate-200"
                >
                  {node.screenTextConfig ? '关闭屏幕字' : '+ 开启屏幕字'}
                </button>
              </div>

              {node.screenTextConfig && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">屏幕主文字内容</label>
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
                      className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        X坐标 ({node.screenTextConfig.x}%)
                      </label>
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
                        className="w-full accent-[#007acc]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        Y坐标 ({node.screenTextConfig.y}%)
                      </label>
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
                        className="w-full accent-[#007acc]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        字号 ({node.screenTextConfig.fontSize}px)
                      </label>
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
                        className="w-full accent-[#007acc]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">幕布衬底</label>
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
                        className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                      >
                        <option value="none">透明无衬底</option>
                        <option value="dim">半透明暗场</option>
                        <option value="cinematic_bars">上下电影黑边</option>
                        <option value="black">全黑幕布</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">文字颜色</label>
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
                        className="w-full h-7 rounded bg-transparent border border-[#3c3c42] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dialogue Lines List */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                角色对白序列 ({node.dialogues.length})
              </span>
              <button
                onClick={onAddDialogue}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-[11px] font-medium transition"
              >
                <Plus className="w-3 h-3" />
                新增台词
              </button>
            </div>

            <div className="space-y-2.5">
              {node.dialogues.map((line, index) => {
                const isCurrent = index === selectedDialogueIndex;
                const charObj = characters.find((c) => c.id === line.speakerId);
                const charExpressions = charObj?.expressions || [];

                return (
                  <div
                    key={line.id}
                    onClick={() => onSelectDialogueIndex(index)}
                    className={`p-2.5 rounded border transition cursor-pointer ${
                      isCurrent
                        ? 'bg-[#202024] border-[#007acc]'
                        : 'bg-[#1c1c20] border-[#2b2b30] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2">
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
                        className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-0.5 text-[11px] text-white"
                      >
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="narrator">旁白 / 独白</option>
                      </select>

                      {/* Expression selector per dialogue line */}
                      {charExpressions.length > 0 && (
                        <select
                          value={line.expressionSpriteId || charObj?.spriteId}
                          onChange={(e) =>
                            onUpdateDialogue(line.id, {
                              expressionSpriteId: e.target.value,
                            })
                          }
                          className="bg-[#252529] border border-[#3c3c42] rounded px-1.5 py-0.5 text-[10px] text-amber-300"
                          title="该句台词对应的角色表情差分"
                        >
                          {charExpressions.map((ex) => (
                            <option key={ex.spriteId} value={ex.spriteId}>
                              表情：{ex.label}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDialogue(line.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400"
                        title="删除该句台词"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={line.text}
                      onChange={(e) => onUpdateDialogue(line.id, { text: e.target.value })}
                      className="w-full bg-[#141418] border border-[#34343c] rounded p-2 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-[#007acc] resize-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. SCENE & VISUAL EFFECTS SECTION */}
        {section === 'scene' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                场景背景（共 {BACKGROUND_ASSETS.length} 张高清动漫背景）
              </label>
              <select
                value={node.backgroundId}
                onChange={(e) =>
                  onUpdateNode((prev) => ({ ...prev, backgroundId: e.target.value }))
                }
                className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1.5 text-xs text-white"
              >
                {BACKGROUND_ASSETS.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    [{bg.category}] {bg.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">背景音乐 (BGM)</label>
                <select
                  value={node.bgmId}
                  onChange={(e) => onUpdateNode((prev) => ({ ...prev, bgmId: e.target.value }))}
                  className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1.5 text-xs text-white"
                >
                  {AUDIO_ASSETS.filter((a) => a.type === 'bgm').map((bgm) => (
                    <option key={bgm.id} value={bgm.id}>
                      {bgm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">环境音效 (SFX)</label>
                <select
                  value={node.sfxId || ''}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({ ...prev, sfxId: e.target.value || undefined }))
                  }
                  className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="">无单次音效</option>
                  {AUDIO_ASSETS.filter((a) => a.type === 'sfx').map((sfx) => (
                    <option key={sfx.id} value={sfx.id}>
                      {sfx.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">天气粒子特效</label>
                <select
                  value={node.weatherEffect || 'none'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      weatherEffect: e.target.value as any,
                    }))
                  }
                  className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="none">无粒子</option>
                  <option value="sakura">樱花飘落</option>
                  <option value="sunset_glow">黄昏暖辉</option>
                  <option value="rain">细雨绵绵</option>
                  <option value="fireflies">夏夜萤火</option>
                  <option value="snow">初雪纷飞</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">画面色调滤镜</label>
                <select
                  value={node.colorFilter || 'none'}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      colorFilter: e.target.value as any,
                    }))
                  }
                  className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="none">标准正常色调</option>
                  <option value="sepia">回忆泛黄 (Sepia)</option>
                  <option value="grayscale">黑白旧影</option>
                  <option value="night_blue">静谧夜蓝</option>
                  <option value="dream_bloom">梦境柔光</option>
                </select>
              </div>
            </div>

            {/* Camera Pan / Zoom / Shake */}
            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                <Camera className="w-3.5 h-3.5" />
                <span>镜头推拉摇移与震动</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    镜头缩放 ({node.cameraConfig?.zoom ?? 1}x)
                  </label>
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
                          durationMs: prev.cameraConfig?.durationMs ?? 700,
                        },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">震动强度</label>
                  <select
                    value={node.cameraConfig?.shakeIntensity || 'none'}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        cameraConfig: {
                          zoom: prev.cameraConfig?.zoom ?? 1,
                          offsetX: prev.cameraConfig?.offsetX ?? 0,
                          offsetY: prev.cameraConfig?.offsetY ?? 0,
                          shakeIntensity: e.target.value as any,
                          durationMs: 700,
                        },
                      }))
                    }
                    className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="none">无震动</option>
                    <option value="light">轻微震动</option>
                    <option value="medium">中度震动</option>
                    <option value="heavy">剧烈震动</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Fade In/Out Config */}
            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-300">
                <Eye className="w-3.5 h-3.5" />
                <span>淡入淡出过渡 (Fade In/Out)</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
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
                  className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="screen">整屏画面</option>
                  <option value="character">指定角色</option>
                  <option value="background">背景场景</option>
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
                  className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="in">淡入 (In)</option>
                  <option value="out">淡出 (Out)</option>
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
                  className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                  placeholder="毫秒"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. FLOW CONTROL & BRANCHING SECTION */}
        {section === 'branch' && (
          <div className="space-y-3">
            {node.type !== 'choice' &&
              node.type !== 'timed_choice' &&
              node.type !== 'condition' &&
              node.type !== 'end' && (
                <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-1.5">
                  <label className="block text-[11px] text-slate-400">
                    顺序流转的下一目标节点
                  </label>
                  <select
                    value={node.nextNodeId || ''}
                    onChange={(e) =>
                      onUpdateNode((prev) => ({
                        ...prev,
                        nextNodeId: e.target.value || null,
                      }))
                    }
                    className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">（无后续节点）</option>
                    {allNodes
                      .filter((n) => n.id !== node.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          [{getNodeMeta(n.type).categoryLabel}] {n.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

            {node.type === 'timed_choice' && (
              <div className="p-2.5 rounded bg-[#202024] border border-orange-500/30 space-y-2">
                <label className="block text-[11px] text-orange-300 font-semibold">
                  限时抉择倒计时秒数
                </label>
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
                  className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                />
              </div>
            )}

            {node.type === 'condition' && (
              <div className="p-2.5 rounded bg-[#202024] border border-amber-500/30 space-y-2">
                <div className="text-xs font-semibold text-amber-300">条件判断规则 (If/Else)</div>
                <div className="grid grid-cols-2 gap-2">
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
                    className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} 好感度
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
                    className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-emerald-400 mb-1">满足条件跳转 (TRUE)</label>
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
                    className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                  >
                    {allNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-rose-400 mb-1">不满足跳转 (FALSE)</label>
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
                    className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
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

            {/* Choice Options List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  分支选项 ({node.choices.length})
                </span>
                <button
                  onClick={onAddChoice}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px]"
                >
                  <Plus className="w-3 h-3" />
                  添加选项
                </button>
              </div>
              {node.choices.map((choice) => (
                <div
                  key={choice.id}
                  className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => onUpdateChoice(choice.id, { text: e.target.value })}
                      className="flex-1 bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
                    />
                    <button
                      onClick={() => onDeleteChoice(choice.id)}
                      className="p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={choice.targetNodeId}
                      onChange={(e) =>
                        onUpdateChoice(choice.id, { targetNodeId: e.target.value })
                      }
                      className="col-span-2 bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-amber-300"
                    >
                      {allNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          跳转：{n.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={choice.affectionDelta ?? 0}
                      onChange={(e) =>
                        onUpdateChoice(choice.id, { affectionDelta: Number(e.target.value) })
                      }
                      className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-pink-300"
                      title="好感增减"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. CHARACTERS & AFFECTION SECTION */}
        {section === 'characters' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                角色设定与差分库 ({characters.length}名角色)
              </span>
              <button
                onClick={onAddCharacterProfile}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#007acc] text-white text-[11px]"
              >
                <Plus className="w-3 h-3" />
                新增角色
              </button>
            </div>
            {characters.map((char) => (
              <div
                key={char.id}
                className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: char.color }}>
                    {char.name} · {char.titleRole}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    差分立绘: {char.expressions?.length || 1} 张
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">初始好感度</label>
                    <input
                      type="number"
                      value={char.initialAffection}
                      onChange={(e) =>
                        onUpdateCharacterProfile(char.id, (prev) => ({
                          ...prev,
                          initialAffection: Number(e.target.value),
                        }))
                      }
                      className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-pink-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">默认立绘</label>
                    <select
                      value={char.spriteId}
                      onChange={(e) =>
                        onUpdateCharacterProfile(char.id, (prev) => ({
                          ...prev,
                          spriteId: e.target.value,
                        }))
                      }
                      className="w-full bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-white"
                    >
                      {CHARACTER_ASSETS.filter((a) => a.characterGroup === char.name).map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
