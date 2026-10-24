import React, { useState } from 'react';
import {
  X,
  FolderOpen,
  Sliders,
  Volume2,
  Check,
  RotateCcw,
  Globe,
} from 'lucide-react';
import { MooVNSystemSettings, VNProject } from '../types';
import {
  IS_WEB_EDITION,
  loadSystemSettings,
  pickDeviceMooVNFolder,
  resetSystemSettings,
  saveSystemSettings,
  syncSystemSettingsToDisk,
} from '../lib/workspaceManager';
import {
  SUPPORTED_UI_LANGUAGES,
  UILanguage,
  useUILanguage,
} from '../lib/i18n';

interface SettingsModalProps {
  project: VNProject;
  onUpdateProject: (patch: Partial<VNProject>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  project,
  onUpdateProject,
  onClose,
}) => {
  const [settings, setSettings] = useState<MooVNSystemSettings>(loadSystemSettings);
  const { lang, setLang, t } = useUILanguage();
  const [activeTab, setActiveTab] = useState<
    'general' | 'game_defaults' | 'workspace'
  >('general');
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const handleSaveAll = async () => {
    saveSystemSettings(settings);
    if (!IS_WEB_EDITION) {
      await syncSystemSettingsToDisk(settings);
    }
    setSavedToast('设置已保存');
    setTimeout(() => setSavedToast(null), 2000);
  };

  const handleBrowseWorkspaceFolder = async () => {
    const picked = await pickDeviceMooVNFolder();
    if (picked?.loadedSettings) {
      setSettings(picked.loadedSettings);
      setSavedToast(`已切换工作区：${picked.folderName}`);
      setTimeout(() => setSavedToast(null), 2500);
    }
  };

  const handleReset = () => {
    const def = resetSystemSettings();
    setSettings(def);
    setSavedToast('已恢复默认设置');
    setTimeout(() => setSavedToast(null), 2000);
  };

  const tabs = [
    {
      id: 'general' as const,
      label: t('settings.tab.general'),
      icon: <Sliders className="w-3.5 h-3.5" strokeWidth={1.6} />,
    },
    {
      id: 'game_defaults' as const,
      label: t('settings.tab.game'),
      icon: <Volume2 className="w-3.5 h-3.5" strokeWidth={1.6} />,
    },
    ...(!IS_WEB_EDITION
      ? [
          {
            id: 'workspace' as const,
            label: t('settings.tab.workspace'),
            icon: <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#161619] border border-[#27272c] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121215] border-b border-[#27272c] shrink-0">
          <span className="text-xs font-semibold text-zinc-100">
            {t('settings.title')}
          </span>
          <button onClick={onClose} className="icon-btn">
            <X className="w-4 h-4" strokeWidth={1.6} />
          </button>
        </div>

        {/* Main Content: Left Sidebar Tabs + Right Panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden text-xs">
          <aside className="w-44 bg-[#131317] border-r border-[#27272c] p-2 space-y-1 shrink-0">
            {tabs.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3 py-2 rounded-md text-left flex items-center gap-2 transition ${
                    active
                      ? 'bg-[#23232b] text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a20]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </aside>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {/* TAB 1: General, Language & Project Meta */}
            {activeTab === 'general' && (
              <>
                {/* Language Switcher integrated directly inside General Settings */}
                <div className="p-3.5 rounded-md bg-[#1c1c21] border border-[#27272c] space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <Globe className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.6} />
                    <span>{t('settings.language')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_UI_LANGUAGES.map((item) => {
                      const active = lang === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setLang(item.id as UILanguage)}
                          className={`px-3 py-2 rounded border text-left flex items-center justify-between transition ${
                            active
                              ? 'bg-[#252530] border-sky-400 text-white font-semibold'
                              : 'bg-[#151519] border-[#2c2c34] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span>{item.nativeName}</span>
                          {active && (
                            <Check className="w-3.5 h-3.5 text-sky-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Project Info & Resolution */}
                <div className="p-3.5 rounded-md bg-[#1c1c21] border border-[#27272c] space-y-3">
                  <div className="text-xs font-semibold text-zinc-100">
                    当前工程参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        作品标题
                      </label>
                      <input
                        type="text"
                        value={project.title}
                        onChange={(e) =>
                          onUpdateProject({ title: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        作者 / 制作组
                      </label>
                      <input
                        type="text"
                        value={project.author}
                        onChange={(e) =>
                          onUpdateProject({ author: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        工程版本
                      </label>
                      <input
                        type="text"
                        value={project.version}
                        onChange={(e) =>
                          onUpdateProject({ version: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        标准画布分辨率
                      </label>
                      <select
                        value={`${project.resolution.width}x${project.resolution.height}`}
                        onChange={(e) => {
                          const [w, h] = e.target.value.split('x').map(Number);
                          onUpdateProject({
                            resolution: { width: w, height: h },
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono"
                      >
                        <option value="1920x1080">1920 × 1080 (16:9 FHD)</option>
                        <option value="1280x720">1280 × 720 (16:9 HD)</option>
                        <option value="2560x1440">2560 × 1440 (16:9 2K)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Editor Preferences */}
                <div className="p-3.5 rounded-md bg-[#1c1c21] border border-[#27272c] space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-100">
                    工作台偏好
                  </div>
                  <label className="flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer">
                    <span>启用节点类别彩色边框标识</span>
                    <input
                      type="checkbox"
                      checked={settings.editorConfig.coloredNodeCategories}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          editorConfig: {
                            ...settings.editorConfig,
                            coloredNodeCategories: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )}

            {/* TAB 2: Default Game Parameters */}
            {activeTab === 'game_defaults' && (
              <div className="p-3.5 rounded-md bg-[#1c1c21] border border-[#27272c] space-y-4">
                <div className="text-xs font-semibold text-zinc-100">
                  游戏运行默认参数
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                    <span>默认文字打字机速度</span>
                    <span className="font-mono">
                      {settings.defaultGameSettings.textSpeedMs} ms/字
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={2}
                    value={settings.defaultGameSettings.textSpeedMs}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          textSpeedMs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                    <span>自动播放 (Auto) 句间停留</span>
                    <span className="font-mono">
                      {settings.defaultGameSettings.autoPlayDelayMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={600}
                    max={4000}
                    step={100}
                    value={settings.defaultGameSettings.autoPlayDelayMs}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          autoPlayDelayMs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                    <span>默认背景音乐 (BGM) 音量</span>
                    <span className="font-mono">
                      {settings.defaultGameSettings.bgmVolume}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.defaultGameSettings.bgmVolume}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          bgmVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                    <span>默认音效 (SFX) 音量</span>
                    <span className="font-mono">
                      {settings.defaultGameSettings.sfxVolume}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.defaultGameSettings.sfxVolume}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          sfxVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Local Workspace Paths (Local Studio Edition Only) */}
            {!IS_WEB_EDITION && activeTab === 'workspace' && (
              <div className="p-3.5 rounded-md bg-[#1c1c21] border border-[#27272c] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">
                    本地工作区路径
                  </span>
                  <button
                    type="button"
                    onClick={handleBrowseWorkspaceFolder}
                    className="px-2.5 py-1 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-200 text-[11px]"
                  >
                    浏览目录
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    工作区根目录
                  </label>
                  <input
                    type="text"
                    value={settings.workspaceRootPath}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        workspaceRootPath: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    项目存储目录
                  </label>
                  <input
                    type="text"
                    value={settings.projectsDirectoryPath}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        projectsDirectoryPath: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    默认导出目录
                  </label>
                  <input
                    type="text"
                    value={settings.exportOutputDirectoryPath}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        exportOutputDirectoryPath: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#121215] border-t border-[#27272c] flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded bg-[#232329] hover:bg-[#2c2c34] text-zinc-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.6} />
              <span>恢复默认</span>
            </button>
            {savedToast && (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {savedToast}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded bg-[#232329] hover:bg-[#2c2c34] text-zinc-300"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-4 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold"
            >
              {t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
