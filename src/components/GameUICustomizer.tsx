import React, { useState } from 'react';
import { Palette, MessageSquare, ListChecks, LayoutTemplate, RotateCcw } from 'lucide-react';
import { GameUIConfig, VNProject } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets';
import { DEFAULT_PROJECT } from '../data/defaultProject';

interface GameUICustomizerProps {
  project: VNProject;
  onUpdateUIConfig: (updater: (prev: GameUIConfig) => GameUIConfig) => void;
}

export const GameUICustomizer: React.FC<GameUICustomizerProps> = ({
  project,
  onUpdateUIConfig,
}) => {
  const [section, setSection] = useState<'presets' | 'dialogue' | 'choices' | 'menu'>('dialogue');
  const ui = project.uiConfig;

  const applyPreset = (presetId: GameUIConfig['presetId']) => {
    if (presetId === 'classic_blue') {
      onUpdateUIConfig(() => DEFAULT_PROJECT.uiConfig);
    } else if (presetId === 'glass_cyan') {
      onUpdateUIConfig((prev) => ({
        ...prev,
        presetId,
        dialogueBox: {
          ...prev.dialogueBox,
          bgColor: '#082038',
          bgOpacity: 0.72,
          borderColor: '#22d3ee',
          borderRadius: 20,
          speakerTagMode: 'floating_badge',
        },
        choiceBox: {
          ...prev.choiceBox,
          bgColor: '#09243f',
          borderColor: '#22d3ee',
          hoverAccentColor: '#22d3ee',
          borderRadius: 14,
        },
      }));
    } else if (presetId === 'sakura_romance') {
      onUpdateUIConfig((prev) => ({
        ...prev,
        presetId,
        dialogueBox: {
          ...prev.dialogueBox,
          bgColor: '#1f1024',
          bgOpacity: 0.85,
          borderColor: '#f472b6',
          borderRadius: 18,
          textColor: '#fdf2f8',
        },
        choiceBox: {
          ...prev.choiceBox,
          bgColor: '#2a1230',
          borderColor: '#f472b6',
          hoverAccentColor: '#f472b6',
        },
        mainMenu: {
          ...prev.mainMenu,
          panelColor: '#1f0d29',
          accentColor: '#f472b6',
        },
      }));
    } else if (presetId === 'obsidian_gold') {
      onUpdateUIConfig((prev) => ({
        ...prev,
        presetId,
        dialogueBox: {
          ...prev.dialogueBox,
          bgColor: '#09090b',
          bgOpacity: 0.92,
          borderColor: '#eab308',
          borderRadius: 6,
          textColor: '#fef9c3',
        },
        choiceBox: {
          ...prev.choiceBox,
          bgColor: '#18181b',
          borderColor: '#eab308',
          hoverAccentColor: '#facc15',
          borderRadius: 4,
        },
        mainMenu: {
          ...prev.mainMenu,
          panelColor: '#09090b',
          accentColor: '#eab308',
        },
      }));
    } else if (presetId === 'minimal_cinema') {
      onUpdateUIConfig((prev) => ({
        ...prev,
        presetId,
        dialogueBox: {
          ...prev.dialogueBox,
          bottomOffset: 12,
          widthPercent: 96,
          bgColor: '#020617',
          bgOpacity: 0.65,
          borderWidth: 0,
          borderRadius: 0,
        },
      }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-[#cccccc] select-none overflow-hidden">
      {/* Sub-navigation */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1f1f23] border-b border-[#2b2b30] shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSection('dialogue')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition ${
              section === 'dialogue'
                ? 'bg-[#007acc] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            对话框
          </button>
          <button
            onClick={() => setSection('choices')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition ${
              section === 'choices'
                ? 'bg-[#007acc] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            选项栏
          </button>
          <button
            onClick={() => setSection('menu')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition ${
              section === 'menu'
                ? 'bg-[#007acc] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            主菜单
          </button>
          <button
            onClick={() => setSection('presets')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition ${
              section === 'presets'
                ? 'bg-[#007acc] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            主题预设
          </button>
        </div>

        <button
          onClick={() => applyPreset('classic_blue')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-400 hover:text-white hover:bg-[#2a2d2e]"
          title="恢复默认界面样式"
        >
          <RotateCcw className="w-3 h-3" />
          重置
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* 1. DIALOGUE BOX CUSTOMIZER */}
        {section === 'dialogue' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-200">几何尺寸与屏幕坐标</div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>底部边距</span>
                    <span>{ui.dialogueBox.bottomOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ui.dialogueBox.bottomOffset}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, bottomOffset: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>宽度占比</span>
                    <span>{ui.dialogueBox.widthPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={ui.dialogueBox.widthPercent}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, widthPercent: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>框体高度</span>
                    <span>{ui.dialogueBox.heightPx}px</span>
                  </div>
                  <input
                    type="range"
                    min={120}
                    max={250}
                    value={ui.dialogueBox.heightPx}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, heightPx: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>圆角半径</span>
                    <span>{ui.dialogueBox.borderRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={28}
                    value={ui.dialogueBox.borderRadius}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, borderRadius: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-200">色彩、毛玻璃与边框</div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">对话框背景色</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={ui.dialogueBox.bgColor}
                      onChange={(e) =>
                        onUpdateUIConfig((prev) => ({
                          ...prev,
                          dialogueBox: { ...prev.dialogueBox, bgColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                    />
                    <input
                      type="text"
                      value={ui.dialogueBox.bgColor}
                      onChange={(e) =>
                        onUpdateUIConfig((prev) => ({
                          ...prev,
                          dialogueBox: { ...prev.dialogueBox, bgColor: e.target.value },
                        }))
                      }
                      className="flex-1 bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">边框高亮色</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={ui.dialogueBox.borderColor}
                      onChange={(e) =>
                        onUpdateUIConfig((prev) => ({
                          ...prev,
                          dialogueBox: { ...prev.dialogueBox, borderColor: e.target.value },
                        }))
                      }
                      className="w-7 h-7 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                    />
                    <input
                      type="text"
                      value={ui.dialogueBox.borderColor}
                      onChange={(e) =>
                        onUpdateUIConfig((prev) => ({
                          ...prev,
                          dialogueBox: { ...prev.dialogueBox, borderColor: e.target.value },
                        }))
                      }
                      className="flex-1 bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>背景不透明度</span>
                    <span>{Math.round(ui.dialogueBox.bgOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.02}
                    value={ui.dialogueBox.bgOpacity}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, bgOpacity: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>边框粗细</span>
                    <span>{ui.dialogueBox.borderWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={ui.dialogueBox.borderWidth}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, borderWidth: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-200">字体排版与说话人铭牌</div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>说话人字号</span>
                    <span>{ui.dialogueBox.speakerFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={28}
                    value={ui.dialogueBox.speakerFontSize}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: {
                          ...prev.dialogueBox,
                          speakerFontSize: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>台词正文字号</span>
                    <span>{ui.dialogueBox.textFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={26}
                    value={ui.dialogueBox.textFontSize}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: { ...prev.dialogueBox, textFontSize: Number(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#007acc]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">姓名展示模式</label>
                  <select
                    value={ui.dialogueBox.speakerTagMode}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: {
                          ...prev.dialogueBox,
                          speakerTagMode: e.target.value as 'inside' | 'floating_badge',
                        },
                      }))
                    }
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="inside">框内左上方标题</option>
                    <option value="floating_badge">框顶独立悬浮铭牌</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">控制栏停靠位置</label>
                  <select
                    value={ui.dialogueBox.controlPosition}
                    onChange={(e) =>
                      onUpdateUIConfig((prev) => ({
                        ...prev,
                        dialogueBox: {
                          ...prev.dialogueBox,
                          controlPosition: e.target.value as
                            | 'bottom_right'
                            | 'top_right'
                            | 'bottom_center',
                        },
                      }))
                    }
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="bottom_right">右下角 (经典)</option>
                    <option value="top_right">右上角</option>
                    <option value="bottom_center">底部居中</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 mb-1.5">快捷按钮显示开关</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['back', '后退'],
                      ['auto', '自动'],
                      ['skip', '快进'],
                      ['hide', '隐藏'],
                      ['settings', '设置'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#252526] border border-[#3c3c3c] text-[11px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={ui.dialogueBox.visibleControls[key]}
                        onChange={(e) =>
                          onUpdateUIConfig((prev) => ({
                            ...prev,
                            dialogueBox: {
                              ...prev.dialogueBox,
                              visibleControls: {
                                ...prev.dialogueBox.visibleControls,
                                [key]: e.target.checked,
                              },
                            },
                          }))
                        }
                        className="accent-[#007acc]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. CHOICE BOX CUSTOMIZER */}
        {section === 'choices' && (
          <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-3">
            <div className="text-[11px] font-semibold text-slate-200">分支选项框位置与视觉</div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">选项弹出位置</label>
              <select
                value={ui.choiceBox.position}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    choiceBox: {
                      ...prev.choiceBox,
                      position: e.target.value as 'above_left' | 'above_center' | 'screen_center',
                    },
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 text-[11px] text-white"
              >
                <option value="above_left">对话框左上方（经典规范）</option>
                <option value="above_center">对话框正上方居中</option>
                <option value="screen_center">画面正中央悬浮</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">选项底色</label>
                <input
                  type="color"
                  value={ui.choiceBox.bgColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, bgColor: e.target.value },
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">左侧悬浮高亮竖条色</label>
                <input
                  type="color"
                  value={ui.choiceBox.hoverAccentColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, hoverAccentColor: e.target.value },
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>选项字号</span>
                  <span>{ui.choiceBox.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={13}
                  max={22}
                  value={ui.choiceBox.fontSize}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, fontSize: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#007acc]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>选项圆角</span>
                  <span>{ui.choiceBox.borderRadius}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={ui.choiceBox.borderRadius}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, borderRadius: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#007acc]"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. MAIN MENU CUSTOMIZER */}
        {section === 'menu' && (
          <div className="p-2.5 rounded bg-[#202024] border border-[#2b2b30] space-y-3">
            <div className="text-[11px] font-semibold text-slate-200">游戏主菜单布局与主视觉</div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">主菜单布局结构</label>
              <select
                value={ui.mainMenu.layout}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: {
                      ...prev.mainMenu,
                      layout: e.target.value as 'left_panel' | 'right_panel' | 'center_card',
                    },
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 text-[11px] text-white"
              >
                <option value="left_panel">左侧深蓝毛玻璃导航 + 右侧主视觉 (默认)</option>
                <option value="right_panel">右侧导航面板 + 左侧主视觉</option>
                <option value="center_card">全屏居中标题卡片</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">主菜单面板底色</label>
                <input
                  type="color"
                  value={ui.mainMenu.panelColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      mainMenu: { ...prev.mainMenu, panelColor: e.target.value },
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">主菜单强调色</label>
                <input
                  type="color"
                  value={ui.mainMenu.accentColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      mainMenu: { ...prev.mainMenu, accentColor: e.target.value },
                    }))
                  }
                  className="w-full h-8 rounded bg-transparent border border-[#3c3c3c] cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">主菜单背景画布（共35张背景可选）</label>
              <select
                value={ui.mainMenu.backgroundId}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: { ...prev.mainMenu, backgroundId: e.target.value },
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 text-[11px] text-white"
              >
                {BACKGROUND_ASSETS.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    [{bg.category}] {bg.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">主菜单看板角色立绘（共58张立绘可选）</label>
              <select
                value={ui.mainMenu.heroCharacterSpriteId}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: { ...prev.mainMenu, heroCharacterSpriteId: e.target.value },
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 text-[11px] text-white"
              >
                {CHARACTER_ASSETS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">英文副标题</label>
              <input
                type="text"
                value={ui.mainMenu.subtitleText}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: { ...prev.mainMenu, subtitleText: e.target.value },
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
              />
            </div>
          </div>
        )}

        {/* 4. THEME PRESETS */}
        {section === 'presets' && (
          <div className="grid grid-cols-1 gap-2">
            {(
              [
                ['classic_blue', '经典深蓝 · 汐见之海', '深海蓝底色 + 天青色细边框 + 磨砂毛玻璃'],
                ['glass_cyan', '琉璃青空 · 悬浮铭牌', '高通透青蓝玻璃 + 独立悬浮角色姓名铭牌'],
                ['sakura_romance', '樱色物语 · 春日恋曲', '暮樱紫红底色 + 樱花粉高亮边框'],
                ['obsidian_gold', '黑金秘典 · 钟塔档案馆', '曜石黑高对比底色 + 古典鎏金边框'],
                ['minimal_cinema', '极简电影 · 无框宽银幕', '超低遮挡无边框宽幅字幕条'],
              ] as const
            ).map(([id, title, desc]) => (
              <button
                key={id}
                onClick={() => applyPreset(id)}
                className={`p-3 rounded text-left border transition ${
                  ui.presetId === id
                    ? 'bg-[#094771]/40 border-[#007acc] text-white'
                    : 'bg-[#202024] border-[#2b2b30] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
