import React, { useState, useEffect } from 'react';
import {
  X,
  FolderOpen,
  Check,
  Download,
  RefreshCw,
  HardDrive,
  Sliders,
  Code2,
  Languages,
  Cpu,
} from 'lucide-react';
import { VNProject, MooVNSystemSettings, ScriptLanguage } from '../types';
import {
  IS_WEB_EDITION,
  loadSystemSettings,
  saveSystemSettings,
  exportSettingsFileJson,
  fetchWorkspaceDiskStatus,
  getPlatformDefaultPaths,
  pickDeviceMooVNFolder,
} from '../lib/workspaceManager';
import { SUPPORTED_UI_LANGUAGES, UILanguage, useUILanguage } from '../lib/i18n';
import { RESERVED_RENDERER_STATUS } from '../lib/moovnEngineBridge';

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
  const { lang, setLang, t } = useUILanguage();
  const [settings, setSettings] = useState<MooVNSystemSettings>(() =>
    loadSystemSettings()
  );
  const [activeTab, setActiveTab] = useState<
    'language' | 'workspace' | 'script_compiler' | 'game_defaults'
  >('language');
  const [diskStatus, setDiskStatus] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceDiskStatus>
  > | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const refreshDisk = async () => {
    if (IS_WEB_EDITION) return;
    const st = await fetchWorkspaceDiskStatus();
    setDiskStatus(st);
  };

  useEffect(() => {
    refreshDisk();
  }, []);

  const handleSaveAll = async () => {
    saveSystemSettings(settings);
    onUpdateProject({
      ...(IS_WEB_EDITION
        ? {}
        : { projectPath: `${settings.projectsDirectoryPath}/${project.id}.mpvn` }),
      performanceConfig: {
        ...(project.performanceConfig || settings.performanceConfig),
      },
    });
    if (!IS_WEB_EDITION) {
      await refreshDisk();
    }
    setSavedBanner(
      IS_WEB_EDITION
        ? '已应用当前编辑器与引擎设置'
        : `已保存并同步写入磁盘: ${settings.settingsFilePath}`
    );
    setTimeout(() => setSavedBanner(null), 3000);
  };

  const devScriptMode: ScriptLanguage =
    project.nodes[0]?.scriptLanguage || project.defaultLanguage || 'typescript';

  const handleSwitchAllNodesLanguage = (targetLang: ScriptLanguage) => {
    onUpdateProject({
      defaultLanguage: targetLang,
      nodes: project.nodes.map((n) => ({
        ...n,
        scriptLanguage: targetLang,
      })),
    });
    setSavedBanner(`已将工程节点默认脚本语言切换为 ${targetLang.toUpperCase()} (MooVN Engine 多语言翻译层已同步)`);
    setTimeout(() => setSavedBanner(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#16161a] border border-[#2c2c34] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh] text-xs text-zinc-200">
        {/* Header */}
        <div className="px-4 py-3 bg-[#1b1b20] border-b border-[#2c2c34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-zinc-300" strokeWidth={1.7} />
            <span className="text-sm font-semibold text-white">
              {t('settings.title')}
            </span>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭设置">
            <X className="w-4 h-4" strokeWidth={1.7} />
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="px-4 py-1.5 bg-[#141418] border-b border-[#27272c] flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('language')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'language'
                ? 'bg-[#26262f] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Languages className="w-3.5 h-3.5" strokeWidth={1.6} />
            {t('settings.tab.language')}
          </button>

          <button
            onClick={() => setActiveTab('script_compiler')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'script_compiler'
                ? 'bg-[#26262f] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            {t('settings.tab.engine')}
          </button>

          <button
            onClick={() => setActiveTab('game_defaults')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'game_defaults'
                ? 'bg-[#26262f] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" strokeWidth={1.6} />
            {t('settings.tab.game')}
          </button>

          {!IS_WEB_EDITION && (
            <button
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                activeTab === 'workspace'
                  ? 'bg-[#26262f] text-white border border-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" strokeWidth={1.6} />
              {t('settings.tab.workspace')}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {savedBanner && (
            <div className="px-3 py-2 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 text-xs">
              <Check className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              <span>{savedBanner}</span>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#1b1b21] border border-[#292932] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-zinc-100 font-semibold">
                      界面与系统语言 (Interface Language)
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      实时切换 MooVN Studio / MooVN Web 工作台菜单、面板与提示语言
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-300 font-mono text-[11px]">
                    {lang}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUPPORTED_UI_LANGUAGES.map((item) => {
                    const active = lang === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setLang(item.id as UILanguage);
                          setSavedBanner(`已切换系统语言为: ${item.label}`);
                          setTimeout(() => setSavedBanner(null), 2500);
                        }}
                        className={`p-3 rounded-lg border text-left transition flex items-center justify-between ${
                          active
                            ? 'bg-sky-500/15 border-sky-400 text-white'
                            : 'bg-[#15151a] border-[#27272c] text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-xs">{item.nativeName}</div>
                          <div className="text-[10px] text-zinc-400">{item.label}</div>
                        </div>
                        {active && (
                          <Check className="w-4 h-4 text-sky-400 shrink-0" strokeWidth={2} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!IS_WEB_EDITION && activeTab === 'workspace' && (
            <div className="space-y-4">
              {/* Platform Preset Selector */}
              <div className="p-3 rounded-lg bg-[#1b1b21] border border-[#292932] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-200">
                    目标设备路径预设与 Web 本地目录挂载
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['web', 'windows', 'android', 'ios', 'macos'] as const).map((plat) => (
                      <button
                        key={plat}
                        onClick={() => {
                          const def = getPlatformDefaultPaths(plat);
                          setSettings((s: MooVNSystemSettings) => ({
                            ...s,
                            platform: plat,
                            ...def,
                          }));
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          settings.platform === plat
                            ? 'bg-[#2b2b36] border-zinc-400 text-white'
                            : 'bg-[#15151a] border-[#27272c] text-zinc-400'
                        }`}
                      >
                        {plat.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      MooVN 全局工作区根目录
                    </label>
                    <input
                      type="text"
                      value={settings.workspaceRootPath}
                      onChange={(e) =>
                        setSettings({ ...settings, workspaceRootPath: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      工程默认保存文件夹 (Projects)
                    </label>
                    <input
                      type="text"
                      value={settings.projectsDirectoryPath}
                      onChange={(e) =>
                        setSettings({ ...settings, projectsDirectoryPath: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      游戏打包导出文件夹 (Exports)
                    </label>
                    <input
                      type="text"
                      value={settings.exportOutputDirectoryPath}
                      onChange={(e) =>
                        setSettings({ ...settings, exportOutputDirectoryPath: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      设置文件保存路径 (settings.moovn.json)
                    </label>
                    <input
                      type="text"
                      value={settings.settingsFilePath}
                      onChange={(e) =>
                        setSettings({ ...settings, settingsFilePath: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={async () => {
                      const picked = await pickDeviceMooVNFolder();
                      if (picked?.loadedSettings) {
                        setSettings(picked.loadedSettings);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded bg-[#25252e] hover:bg-[#2f2f3a] border border-zinc-600 text-zinc-100 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
                    选择设备上已有的 MooVN 文件夹
                  </button>
                  <button
                    onClick={() => exportSettingsFileJson(settings)}
                    className="px-2.5 py-1.5 rounded bg-[#1f1f27] hover:bg-[#282832] border border-[#2d2d37] text-zinc-300 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                    导出 settings.moovn.json
                  </button>
                  <button
                    onClick={refreshDisk}
                    className="px-2.5 py-1.5 rounded bg-[#1f1f27] hover:bg-[#282832] border border-[#2d2d37] text-zinc-300 flex items-center gap-1.5 ml-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.6} />
                    刷新磁盘真实文件列表
                  </button>
                </div>
              </div>

              {/* Real Disk Status Inspection */}
              <div className="p-3 rounded-lg bg-[#121216] border border-[#27272c] space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between text-zinc-300 font-sans font-medium">
                  <span>磁盘真实目录状态 (/home/user/MooVN/MooVN_Workspace)</span>
                  <span className="text-emerald-400 text-[11px]">
                    {diskStatus?.ok ? '● 磁盘目录已挂载并实时同步' : '○ 读取中'}
                  </span>
                </div>
                {diskStatus && (
                  <div className="space-y-1.5 text-zinc-400">
                    <div>根目录: {diskStatus.workspaceRoot}</div>
                    <div>配置文件: {diskStatus.settingsFile}</div>
                    <div>
                      Projects/ ({diskStatus.projectFiles.length} 个工程文件):{' '}
                      {diskStatus.projectFiles.map((f) => f.name).join(', ') || '暂无'}
                    </div>
                    <div>
                      Exports/ ({diskStatus.exportFiles.length} 个导出包):{' '}
                      {diskStatus.exportFiles.map((f) => f.name).join(', ') || '暂无'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'script_compiler' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-[#1b1b21] border border-[#292932] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-zinc-100 font-semibold">
                    MooVN Engine (Rust 内核) · 多语言快速 API 翻译架构
                  </div>
                  <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-300 font-mono text-[10px]">
                    JS / TS / C# / C++ / Rust
                  </span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  MooVN Engine 采用 Rust 编写，通过多语言翻译层接入 JavaScript/TypeScript、C++、C#、Rust 的视觉小说快速 API 接口（不同语言指令自动编译为统一的底层 `EngineOp` 指令）：
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(
                    [
                      ['javascript', 'JavaScript', 'moobn.sava:create(NAME)'],
                      ['typescript', 'TypeScript', 'moobn.sava:create(NAME)'],
                      ['csharp', 'C#', 'moovn.save:create(NAME)'],
                      ['cpp', 'C++20', 'moovn::save::create(NAME)'],
                      ['rust', 'Rust', 'moovn::save::create(NAME)'],
                    ] as const
                  ).map(([id, title, example]) => (
                    <div
                      key={id}
                      onClick={() => handleSwitchAllNodesLanguage(id)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition ${
                        devScriptMode === id
                          ? 'bg-[#262630] border-sky-400 text-white'
                          : 'bg-[#15151a] border-[#27272c] text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <div className="font-semibold text-sky-300 text-xs mb-1">
                        {title}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-300 break-all">
                        {example}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reserved Rust + C++ Renderer Interface Status */}
              <div className="p-3.5 rounded-lg bg-[#141824] border border-sky-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sky-300 font-semibold">
                    <Cpu className="w-4 h-4" strokeWidth={1.7} />
                    <span>预留混合渲染器接口 (Rust + C++20 Renderer Bridge · 开发中)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-mono">
                    ABI Ready
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono text-zinc-300">
                  <div className="p-2 rounded bg-[#10131c] border border-[#22283a]">
                    Rust Trait: {RESERVED_RENDERER_STATUS.rustTrait}
                  </div>
                  <div className="p-2 rounded bg-[#10131c] border border-[#22283a]">
                    C++ Header: {RESERVED_RENDERER_STATUS.cppHeader}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'game_defaults' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#1b1b21] border border-[#292932] space-y-2.5">
                <div className="font-medium text-zinc-100">游戏运行默认设置</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">默认打字速度 (ms/字)</span>
                    <span>{settings.defaultGameSettings.textSpeedMs}ms</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
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
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">默认背景音乐音量</span>
                    <span>{settings.defaultGameSettings.bgmVolume}%</span>
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
                    className="w-full"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#1b1b21] border border-[#292932] space-y-2.5">
                <div className="font-medium text-zinc-100">流式预载与自动内存卸载 (1~20 场景)</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">提前流式解压场景数</span>
                    <span>{settings.performanceConfig.preloadSceneDistance} 个场景</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={settings.performanceConfig.preloadSceneDistance}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        performanceConfig: {
                          ...settings.performanceConfig,
                          preloadSceneDistance: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">经过几个场景后释放旧场景内存</span>
                    <span>{settings.performanceConfig.unloadSceneDistance} 个场景</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={settings.performanceConfig.unloadSceneDistance}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        performanceConfig: {
                          ...settings.performanceConfig,
                          unloadSceneDistance: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#1b1b20] border-t border-[#2c2c34] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[#23232b] hover:bg-[#2c2c36] text-zinc-300"
          >
            关闭
          </button>
          <button
            onClick={handleSaveAll}
            className="px-3.5 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-semibold flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
            {IS_WEB_EDITION ? '应用设置' : '保存设置并写入磁盘'}
          </button>
        </div>
      </div>
    </div>
  );
};
