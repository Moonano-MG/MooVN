import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Apple,
  Globe,
  Download,
  Check,
  FolderOpen,
  Layers,
  Cpu,
} from 'lucide-react';
import {
  AssetCompressionFormat,
  ExportPlatform,
  GamePerformanceConfig,
  VNProject,
} from '../types';
import { exportPlatformPackage } from '../lib/gamePackager';
import {
  COMPRESSION_FORMAT_SPECS,
  DEFAULT_PERFORMANCE_CONFIG,
  downloadChapterMsvnFile,
} from '../lib/assetCompressionEngine';
import {
  loadSystemSettings,
  pickDeviceMooVNFolder,
  saveSystemSettings,
} from '../lib/workspaceManager';
import { exportProjectAsMpvn } from '../lib/mpvnFormat';

interface ExportModalProps {
  project: VNProject;
  onClose: () => void;
  onUpdateProjectPerformance?: (perf: GamePerformanceConfig) => void;
}

const PLATFORMS: {
  id: ExportPlatform;
  name: string;
  badge: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'android',
    name: 'Android',
    badge: 'APK / AAB 触屏包',
    icon: <Smartphone className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'windows',
    name: 'Windows',
    badge: 'x64 (.exe / MSI)',
    icon: <Monitor className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'macos',
    name: 'macOS',
    badge: 'Universal (.dmg)',
    icon: <Apple className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'ios',
    name: 'iOS',
    badge: 'iPhone / iPad (.ipa)',
    icon: <Smartphone className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'web',
    name: 'Web',
    badge: 'H5 独立单文件',
    icon: <Globe className="w-4 h-4" strokeWidth={1.6} />,
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  onClose,
  onUpdateProjectPerformance,
}) => {
  const sysSettings = loadSystemSettings();
  const [activeTab, setActiveTab] = useState<'package' | 'compression' | 'msvn' | 'mpvn'>('package');
  const [selectedPlatform, setSelectedPlatform] = useState<ExportPlatform>('android');
  const [packageId, setPackageId] = useState('com.moovn.game');
  const [appName, setAppName] = useState(project.title);
  const [version, setVersion] = useState(project.version || '0.1.0');
  const [outputDir, setOutputDir] = useState(sysSettings.exportOutputDirectoryPath);
  const [fullscreen, setFullscreen] = useState(true);
  const [landscapeLock, setLandscapeLock] = useState(true);
  const [exportBaseLoaderOnly, setExportBaseLoaderOnly] = useState(false);

  const [perf, setPerf] = useState<GamePerformanceConfig>(
    project.performanceConfig || sysSettings.performanceConfig || DEFAULT_PERFORMANCE_CONFIG
  );

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const updatePerf = (patch: Partial<GamePerformanceConfig>) => {
    setPerf((prev) => {
      const next = { ...prev, ...patch };
      onUpdateProjectPerformance?.(next);
      return next;
    });
  };

  const selectCompressionFormat = (fmt: AssetCompressionFormat) => {
    const spec = COMPRESSION_FORMAT_SPECS[fmt];
    updatePerf({
      compressionFormat: fmt,
      compressionLevel: spec.recommendedLevel,
    });
  };

  const handleBrowseOutputFolder = async () => {
    const picked = await pickDeviceMooVNFolder();
    if (picked?.loadedSettings) {
      setOutputDir(picked.loadedSettings.exportOutputDirectoryPath);
      setStatusMessage(`已绑定导出目录：${picked.loadedSettings.exportOutputDirectoryPath}`);
    }
  };

  const handleExport = () => {
    // 持久化导出路径与性能配置到系统设置
    const nextSettings = {
      ...sysSettings,
      exportOutputDirectoryPath: outputDir,
      performanceConfig: perf,
    };
    saveSystemSettings(nextSettings);

    exportPlatformPackage(project, {
      platform: selectedPlatform,
      packageId,
      appName,
      version,
      fullscreen,
      landscapeLock,
      outputDirectoryPath: outputDir,
      performanceConfig: perf,
      exportBaseLoaderOnly,
    });
    setStatusMessage(
      `已导出 ${selectedPlatform.toUpperCase()} 包 (${perf.compressionFormat.toUpperCase()} Lv.${perf.compressionLevel}) 至 ${outputDir}`
    );
  };

  const currentCompSpec = COMPRESSION_FORMAT_SPECS[perf.compressionFormat];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#161619] border border-[#27272c] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121215] border-b border-[#27272c] shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-zinc-200">构建与导出发布</span>
            <div className="flex flex-wrap items-center bg-[#18181c] p-0.5 rounded border border-[#27272c] text-xs">
              {(
                [
                  ['package', '导出游戏包'],
                  ['compression', '资源压缩与流加载'],
                  ['msvn', '导出章节包 (.msvn)'],
                  ['mpvn', '导出项目 (.mpvn)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    activeTab === id
                      ? 'bg-zinc-200 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={onClose} className="icon-btn" title="关闭">
            <X className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {/* TAB 1: Platform & Export Path */}
          {activeTab === 'package' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Platform list */}
              <div className="md:col-span-4 space-y-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPlatform(p.id);
                      setStatusMessage(null);
                    }}
                    className={`w-full px-3 py-2 rounded-md border text-left transition flex items-center gap-2.5 ${
                      selectedPlatform === p.id
                        ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                        : 'bg-[#1c1c20] border-[#27272c] text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <span className="shrink-0">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs leading-tight">{p.name}</div>
                      <div
                        className={`text-[10px] truncate ${
                          selectedPlatform === p.id ? 'text-zinc-700' : 'text-zinc-500'
                        }`}
                      >
                        {p.badge}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Right: Config + Export Directory */}
              <div className="md:col-span-8 space-y-3">
                <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-1">导出目标路径 (MooVN 导出目录)</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={outputDir}
                        onChange={(e) => setOutputDir(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 font-mono text-[11px]"
                        placeholder="选择或输入导出文件夹路径..."
                      />
                      <button
                        onClick={handleBrowseOutputFolder}
                        className="px-2.5 py-1.5 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 shrink-0"
                        title="选择设备上已保存的文件夹"
                      >
                        <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
                        选择目录
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <div className="text-[10px] text-zinc-500 mb-1">应用名称</div>
                      <input
                        type="text"
                        value={appName}
                        onChange={(e) => setAppName(e.target.value)}
                        className="w-full px-2 py-1.5"
                      />
                    </div>
                    <div className="col-span-1">
                      <div className="text-[10px] text-zinc-500 mb-1">包名 (Bundle ID)</div>
                      <input
                        type="text"
                        value={packageId}
                        onChange={(e) => setPackageId(e.target.value)}
                        className="w-full px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div className="col-span-1">
                      <div className="text-[10px] text-zinc-500 mb-1">版本号</div>
                      <input
                        type="text"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        className="w-full px-2 py-1.5 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fullscreen}
                        onChange={(e) => setFullscreen(e.target.checked)}
                      />
                      <span>默认全屏</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={landscapeLock}
                        onChange={(e) => setLandscapeLock(e.target.checked)}
                      />
                      <span>横屏锁定</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportBaseLoaderOnly}
                        onChange={(e) => setExportBaseLoaderOnly(e.target.checked)}
                      />
                      <span>仅打包主加载器 + 第一章（其余章节通过 .msvn 按需下载）</span>
                    </label>
                  </div>
                </div>

                {/* Current Compression & Streaming Summary Card */}
                <div className="p-2.5 rounded-md bg-[#141417] border border-[#27272c] flex items-center justify-between text-[11px]">
                  <div className="space-y-0.5">
                    <div className="text-zinc-200 font-medium">
                      内部资源压缩：{currentCompSpec.name} · 级别 {perf.compressionLevel}
                      {perf.skipAlreadyCompressedPng ? ' · PNG 免重压已开启' : ''}
                    </div>
                    <div className="text-zinc-500">
                      提前 {perf.preloadSceneDistance} 场景解压至
                      {perf.decompressTarget === 'memory' ? '内存' : '缓存文件'} · {perf.unloadSceneDistance} 场景后自动释放内存
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('compression')}
                    className="px-2.5 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-300"
                  >
                    配置压缩
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Internal Resource Compression, Streaming & Memory Unloading */}
          {activeTab === 'compression' && (
            <div className="space-y-3">
              {/* 3 Compression Formats */}
              <div className="grid grid-cols-3 gap-2.5">
                {(['xz', '7z', 'brotli'] as AssetCompressionFormat[]).map((fmtId) => {
                  const spec = COMPRESSION_FORMAT_SPECS[fmtId];
                  const isSel = perf.compressionFormat === fmtId;
                  return (
                    <button
                      key={fmtId}
                      onClick={() => selectCompressionFormat(fmtId)}
                      className={`p-3 rounded-md border text-left transition flex flex-col justify-between ${
                        isSel
                          ? 'bg-[#222228] border-zinc-200 text-zinc-100'
                          : 'bg-[#1c1c20] border-[#27272c] text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-white">{spec.name}</span>
                          {fmtId === '7z' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                              最推荐
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-300 leading-relaxed mb-1.5">
                          {spec.summary}
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500 pt-1.5 border-t border-[#27272c]">
                        {spec.recommendationNote}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Compression Level & PNG Skip */}
              <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                    <span>
                      {currentCompSpec.name} 压缩级别 ({currentCompSpec.minLevel} ~ {currentCompSpec.maxLevel}，推荐 {currentCompSpec.recommendedLevel})
                    </span>
                    <span className="font-mono font-semibold">Lv.{perf.compressionLevel}</span>
                  </div>
                  <input
                    type="range"
                    min={currentCompSpec.minLevel}
                    max={currentCompSpec.maxLevel}
                    value={perf.compressionLevel}
                    onChange={(e) =>
                      updatePerf({ compressionLevel: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perf.skipAlreadyCompressedPng}
                      onChange={(e) =>
                        updatePerf({ skipAlreadyCompressedPng: e.target.checked })
                      }
                    />
                    <span>跳过 PNG / WebP / OGG 等已压缩资源（零二次压缩）</span>
                  </label>
                  <div className="text-[10px] text-zinc-500">
                    内置对应压缩器与解压器，仅压缩内部剧情包、脚本、音频原片与未压缩数据。
                  </div>
                </div>
              </div>

              {/* Streaming Preload (1~20 scenes) & Memory Unloading (1~20 scenes) */}
              <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-200 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" strokeWidth={1.6} />
                    磁盘流加载、动态提前解压与旧场景内存卸载
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500">解压目标：</span>
                    <button
                      onClick={() => updatePerf({ decompressTarget: 'memory' })}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        perf.decompressTarget === 'memory'
                          ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                          : 'bg-[#141417] border-[#27272c] text-zinc-400'
                      }`}
                    >
                      内存中
                    </button>
                    <button
                      onClick={() => updatePerf({ decompressTarget: 'cache_file' })}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        perf.decompressTarget === 'cache_file'
                          ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                          : 'bg-[#141417] border-[#27272c] text-zinc-400'
                      }`}
                    >
                      缓存文件
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                      <span>提前解压场景距离 (1~20 场景前)</span>
                      <span className="font-mono">{perf.preloadSceneDistance} 场景</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={perf.preloadSceneDistance}
                      onChange={(e) =>
                        updatePerf({ preloadSceneDistance: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                      <span>旧场景内存卸载距离 (1~20 场景后卸载)</span>
                      <span className="font-mono">{perf.unloadSceneDistance} 场景</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={perf.unloadSceneDistance}
                      onChange={(e) =>
                        updatePerf({ unloadSceneDistance: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                      <span>磁盘提前流加载场景数 (1~20 场景)</span>
                      <span className="font-mono">{perf.streamPreloadScenes} 场景</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={perf.streamPreloadScenes}
                      onChange={(e) =>
                        updatePerf({ streamPreloadScenes: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-300 mb-1">
                      <span>后台解压性能占用上限（保证游玩零卡顿）</span>
                      <span className="font-mono">{perf.workerCpuBudgetPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={80}
                      step={5}
                      value={perf.workerCpuBudgetPercent}
                      onChange={(e) =>
                        updatePerf({ workerCpuBudgetPercent: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Modular .msvn Chapter Packages */}
          {activeTab === 'msvn' && (
            <div className="space-y-3">
              <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between">
                <div className="text-[11px] text-zinc-300">
                  可将不同章节导出为独立 <span className="font-mono text-zinc-100">.msvn</span> 包。玩家只需下载主加载器 + 第一章（必装），后续按需下载新章并卸载旧章；跳过中间章节时自动按各章「最低角色数值」补齐好感度。
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {project.chapters.map((ch, idx) => {
                  const chNodes = project.nodes.filter((n) => n.chapterId === ch.id);
                  const minAff = ch.minCharacterAffection || {};
                  return (
                    <div
                      key={ch.id}
                      className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-100">
                            {ch.title}
                          </span>
                          {idx === 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                              第一章必装
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-[#27272c] text-zinc-300 text-[10px]">
                              可选按需下载 / 可卸载
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-zinc-500">
                            {chNodes.length} 节点
                          </span>
                        </div>

                        <div className="text-[10px] text-zinc-400 flex flex-wrap gap-2">
                          <span>跳章保底好感：</span>
                          {project.characters.slice(0, 4).map((char) => (
                            <span key={char.id} className="text-zinc-300 font-mono">
                              {char.name.split(' ')[0]}≥{minAff[char.id] ?? char.initialAffection + idx * 8}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const file = downloadChapterMsvnFile(project, ch.id, perf);
                          setStatusMessage(`已导出章节包：${file}`);
                        }}
                        className="px-2.5 py-1.5 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-100 text-[11px] flex items-center gap-1 shrink-0"
                      >
                        <Layers className="w-3.5 h-3.5" strokeWidth={1.6} />
                        导出 .msvn
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Export Editable Project (.mpvn) */}
          {activeTab === 'mpvn' && (
            <div className="space-y-3">
              <div className="p-4 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-100">
                    导出 MooVN Studio 项目工程文件 (.mpvn)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    包含当前工程《{project.title}》的全部 {project.chapters.length} 个章节、
                    {project.nodes.length} 个节点与角色设定，可在任意设备的 MooVN Studio 中重新导入编辑。
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const file = await exportProjectAsMpvn(project);
                    setStatusMessage(`已导出项目工程文件：${file}`);
                  }}
                  className="px-4 py-2 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 shrink-0 transition"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                  <span>导出 .mpvn</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#121215] border-t border-[#27272c] flex items-center justify-between shrink-0 text-xs">
          <div className="text-[11px] text-zinc-400 truncate max-w-md">
            {statusMessage ? (
              <span className="inline-flex items-center gap-1 text-zinc-200">
                <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
                {statusMessage}
              </span>
            ) : (
              <span>导出目录：{outputDir}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-4 py-1.5 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
              导出 {PLATFORMS.find((p) => p.id === selectedPlatform)?.name}
              {exportBaseLoaderOnly ? ' (主加载器+第1章)' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
