import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
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
  const [section, setSection] = useState<'dialogue' | 'choices' | 'menu' | 'presets'>('dialogue');
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
    <div className="flex flex-col h-full bg-[#161619] text-zinc-300 select-none overflow-hidden">
      {/* Clean 4-Tab Sub-Navigation */}
      <div className="flex items-center justify-between border-b border-[#27272c] bg-[#141417] px-2 shrink-0 text-xs">
        <div className="flex items-center">
          {(
            [
              ['dialogue', '对话框'],
              ['choices', '选项'],
              ['menu', '主菜单'],
              ['presets', '预设'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`px-3 py-2 font-medium border-b-2 transition ${
                section === id
                  ? 'border-zinc-200 text-white bg-[#161619]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => applyPreset('classic_blue')}
          className="icon-btn"
          title="重置默认样式"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {section === 'dialogue' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div className="text-[11px] font-medium text-zinc-300">尺寸与坐标</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>底距</span>
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
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>宽度</span>
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
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>高度</span>
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
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>圆角</span>
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
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div className="text-[11px] font-medium text-zinc-300">外观与边框</div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">底色</div>
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
                      className="w-7 h-7"
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
                      className="flex-1 px-2 py-1 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">边框色</div>
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
                      className="w-7 h-7"
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
                      className="flex-1 px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>不透明度</span>
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
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
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
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div className="text-[11px] font-medium text-zinc-300">字号与按钮</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>姓名字号</span>
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
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>正文字号</span>
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
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#161619] border border-[#27272c] text-[11px] cursor-pointer"
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
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'choices' && (
          <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-3">
            <div className="text-[11px] font-medium text-zinc-300">选项框布局与配色</div>
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
              className="w-full px-2 py-1.5"
            >
              <option value="above_left">对话框左上方</option>
              <option value="above_center">对话框正上方</option>
              <option value="screen_center">屏幕居中</option>
            </select>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">底色</div>
                <input
                  type="color"
                  value={ui.choiceBox.bgColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, bgColor: e.target.value },
                    }))
                  }
                  className="w-full h-7"
                />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">悬浮高亮条</div>
                <input
                  type="color"
                  value={ui.choiceBox.hoverAccentColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      choiceBox: { ...prev.choiceBox, hoverAccentColor: e.target.value },
                    }))
                  }
                  className="w-full h-7"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>字号</span>
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
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>圆角</span>
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
                />
              </div>
            </div>
          </div>
        )}

        {section === 'menu' && (
          <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
            <div className="text-[11px] font-medium text-zinc-300">主菜单视觉</div>
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
              className="w-full px-2 py-1.5"
            >
              <option value="left_panel">左侧导航面板</option>
              <option value="right_panel">右侧导航面板</option>
              <option value="center_card">居中卡片</option>
            </select>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">面板底色</div>
                <input
                  type="color"
                  value={ui.mainMenu.panelColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      mainMenu: { ...prev.mainMenu, panelColor: e.target.value },
                    }))
                  }
                  className="w-full h-7"
                />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">强调色</div>
                <input
                  type="color"
                  value={ui.mainMenu.accentColor}
                  onChange={(e) =>
                    onUpdateUIConfig((prev) => ({
                      ...prev,
                      mainMenu: { ...prev.mainMenu, accentColor: e.target.value },
                    }))
                  }
                  className="w-full h-7"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-zinc-500">主视觉背景</div>
              <select
                value={ui.mainMenu.backgroundId}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: { ...prev.mainMenu, backgroundId: e.target.value },
                  }))
                }
                className="w-full px-2 py-1.5"
              >
                {BACKGROUND_ASSETS.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    [{bg.category}] {bg.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-zinc-500">看板立绘</div>
              <select
                value={ui.mainMenu.heroCharacterSpriteId}
                onChange={(e) =>
                  onUpdateUIConfig((prev) => ({
                    ...prev,
                    mainMenu: { ...prev.mainMenu, heroCharacterSpriteId: e.target.value },
                  }))
                }
                className="w-full px-2 py-1.5"
              >
                {CHARACTER_ASSETS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {section === 'presets' && (
          <div className="space-y-1.5">
            {(
              [
                ['classic_blue', '经典深蓝'],
                ['glass_cyan', '琉璃青空'],
                ['sakura_romance', '樱色物语'],
                ['obsidian_gold', '黑金秘典'],
                ['minimal_cinema', '极简电影'],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                onClick={() => applyPreset(id)}
                className={`w-full px-3 py-2 rounded-md text-left border transition text-xs font-medium ${
                  ui.presetId === id
                    ? 'bg-zinc-200 text-zinc-950 border-zinc-200'
                    : 'bg-[#1c1c20] border-[#27272c] text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
