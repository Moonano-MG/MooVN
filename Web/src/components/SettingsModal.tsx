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
} from 'lucide-react';
import { VNProject, MooVNSystemSettings } from '../types';
import {
  loadSystemSettings,
  saveSystemSettings,
  exportSettingsFileJson,
  fetchWorkspaceDiskStatus,
  getPlatformDefaultPaths,
  pickDeviceMooVNFolder,
} from '../lib/workspaceManager';

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
  const [settings, setSettings] = useState<MooVNSystemSettings>(() =>
    loadSystemSettings()
  );
  const [activeTab, setActiveTab] = useState<'workspace' | 'script_compiler' | 'game_defaults'>('workspace');
  const [diskStatus, setDiskStatus] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceDiskStatus>
  > | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const refreshDisk = async () => {
    const st = await fetchWorkspaceDiskStatus();
    setDiskStatus(st);
  };

  useEffect(() => {
    refreshDisk();
  }, []);

  const handleSaveAll = async () => {
    saveSystemSettings(settings);
    onUpdateProject({
      projectPath: `${settings.projectsDirectoryPath}/${project.id}.moovn.json`,
      performanceConfig: {
        ...(project.performanceConfig || settings.performanceConfig),
      },
    });
    await refreshDisk();
    setSavedBanner(`已保存并同步写入磁盘: ${settings.settingsFilePath}`);
    setTimeout(() => setSavedBanner(null), 3000);
  };

  const devScriptMode =
    project.nodes[0]?.scriptLanguage === 'javascript' ? 'javascript' : 'typescript';

  const handleSwitchAllNodesLanguage = (lang: 'javascript' | 'typescript') => {
    onUpdateProject({
      nodes: project.nodes.map((n) => ({
        ...n,
        scriptLanguage: lang,
      })),
    });
    setSavedBanner(
      lang === 'javascript'
        ? '已将工程节点脚本切换为 JavaScript 快速开发模式（导出前仍可用 tsc 进行类型检查）'
        : '已将工程节点脚本切换为 TypeScript 严格类型模式'
    );
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
              编辑器与全局目录设置 (MooVN Settings)
            </span>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭设置">
            <X className="w-4 h-4" strokeWidth={1.7} />
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="px-4 py-1.5 bg-[#141418] border-b border-[#27272c] flex items-center gap-2">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'workspace'
                ? 'bg-[#26262f] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" strokeWidth={1.6} />
            MooVN 全局文件夹与磁盘存储
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
            JS / TS 节点脚本与编译策略
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
            游戏运行与流式解压默认参数
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {savedBanner && (
            <div className="px-3 py-2 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 text-xs">
              <Check className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              <span>{savedBanner}</span>
            </div>
          )}

          {activeTab === 'workspace' && (
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
                <div className="text-zinc-100 font-medium">
                  节点脚本双模架构 (JavaScript 快速迭代 ⇄ TypeScript 严格编译)
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  MooVN 中的每一个节点（包括重复循环、条件容器、数学运算、屏幕字、台词演出）在底层都对应一段独立的脚本函数。您可以选择：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() => handleSwitchAllNodesLanguage('javascript')}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      devScriptMode === 'javascript'
                        ? 'bg-[#262630] border-amber-400/70 text-white'
                        : 'bg-[#15151a] border-[#27272c] text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-semibold text-amber-300 mb-1">
                      JavaScript 模式 (推荐日常快速开发)
                    </div>
                    <div className="text-[11px] leading-relaxed">
                      省略显式类型声明，支持快速编写节点自定义逻辑与表达式；在需要测试或正式导出前，随时可在终端或脚本窗口一键运行 TypeScript (`tsc`) 编译查错。
                    </div>
                  </div>

                  <div
                    onClick={() => handleSwitchAllNodesLanguage('typescript')}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      devScriptMode === 'typescript'
                        ? 'bg-[#262630] border-sky-400/70 text-white'
                        : 'bg-[#15151a] border-[#27272c] text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <div className="font-semibold text-sky-300 mb-1">
                      TypeScript 模式 (推荐测试验证与正式发布)
                    </div>
                    <div className="text-[11px] leading-relaxed">
                      为每个节点生成带完整 `VNRuntimeContext` 与 `Promise&lt;string | null&gt;` 类型签名的 TypeScript 代码，静态校验全局变量类型、角色 ID 与跳转目标。
                    </div>
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
            保存设置并写入磁盘
          </button>
        </div>
      </div>
    </div>
  );
};
