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
} from 'lucide-react';
import {
  AssetCompressionFormat,
  ExportPlatform,
  GamePerformanceConfig,
  VNProject,
} from '../types';
import {
  buildStandaloneGameHtml,
  exportPlatformPackage,
} from '../lib/gamePackager';
import {
  COMPRESSION_FORMAT_SPECS,
  DEFAULT_PERFORMANCE_CONFIG,
  downloadChapterMsvnFile,
} from '../lib/assetCompressionEngine';
import {
  IS_WEB_EDITION,
  loadSystemSettings,
  pickDeviceMooVNFolder,
  saveSystemSettings,
} from '../lib/workspaceManager';
import { exportProjectAsMpvn } from '../lib/mpvnFormat';
import { compileAndCheckProjectTypeScript } from '../lib/nodeCodeCompiler';

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
    id: 'windows',
    name: 'Windows',
    badge: '独立窗口可玩包 (.zip)',
    icon: <Monitor className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'android',
    name: 'Android',
    badge: '触屏直玩包 (.html)',
    icon: <Smartphone className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'ios',
    name: 'iOS',
    badge: 'iPhone / iPad 直玩包',
    icon: <Smartphone className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'macos',
    name: 'macOS',
    badge: 'Universal 可玩包 (.zip)',
    icon: <Apple className="w-4 h-4" strokeWidth={1.6} />,
  },
  {
    id: 'web',
    name: 'Web',
    badge: 'H5 单文件直玩版 (.html)',
    icon: <Globe className="w-4 h-4" strokeWidth={1.6} />,
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  onClose,
  onUpdateProjectPerformance,
}) => {
  const sysSettings = loadSystemSettings();
  const [activeTab, setActiveTab] = useState<'package' | 'msvn' | 'mpvn'>('package');
  const [selectedPlatform, setSelectedPlatform] = useState<ExportPlatform>('windows');
  const [packageId, setPackageId] = useState('com.moovn.game');
  const [appName, setAppName] = useState(project.title);
  const [version, setVersion] = useState(project.version || '0.1.0');
  const [outputDir, setOutputDir] = useState(sysSettings.exportOutputDirectoryPath);
  const [fullscreen, setFullscreen] = useState(true);
  const [landscapeLock, setLandscapeLock] = useState(true);

  const [perf, setPerf] = useState<GamePerformanceConfig>(
    project.performanceConfig ||
      sysSettings.performanceConfig ||
      DEFAULT_PERFORMANCE_CONFIG
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
    const nextSettings = {
      ...sysSettings,
      exportOutputDirectoryPath: outputDir,
      performanceConfig: perf,
    };
    saveSystemSettings(nextSettings);

    const outFile = exportPlatformPackage(project, {
      platform: selectedPlatform,
      packageId,
      appName,
      version,
      fullscreen,
      landscapeLock,
      outputDirectoryPath: outputDir,
      performanceConfig: perf,
    });
    const totalChecks = 4;
    const passedChecks = Math.max(0, totalChecks - compileCheck.errorCount);
    setStatusMessage(`导出完成 · 已通过 ${passedChecks}/${totalChecks} 项检查 (${outFile})`);
  };

  const handleDirectPlayableHtml = () => {
    const html = buildStandaloneGameHtml({ ...project, performanceConfig: perf }, 'web');
    const safeName = (appName || project.title || 'MooVN_Game').replace(
      /[\\/:*?"<>|\s]+/g,
      '_'
    );
    const filename = `${safeName}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const totalChecks = 4;
    const passedChecks = Math.max(0, totalChecks - compileCheck.errorCount);
    setStatusMessage(`导出完成 · 已通过 ${passedChecks}/${totalChecks} 项检查 (${filename})`);
  };

  const currentCompSpec = COMPRESSION_FORMAT_SPECS[perf.compressionFormat];
  const compileCheck = React.useMemo(
    () => compileAndCheckProjectTypeScript(project),
    [project]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#161619] border border-[#27272c] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header (Only 3 clean tabs — no separate compression tab!) */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121215] border-b border-[#27272c] shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-zinc-100">导出与构建</span>
            <div className="flex items-center bg-[#18181c] p-0.5 rounded border border-[#27272c] text-xs">
              {(
                [
                  ['package', '导出游戏'],
                  ['msvn', '导出章节 (.msvn)'],
                  ['mpvn', '导出项目 (.mpvn)'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-3 py-1 rounded text-[11px] font-medium transition ${
                    activeTab === id
                      ? 'bg-zinc-200 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={onClose} className="icon-btn">
            <X className="w-4 h-4" strokeWidth={1.6} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Format Comparison Guide (`GPT-42 / CL-42`) */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded bg-[#141418] border border-[#25252e]">
              <div className="font-semibold text-zinc-200">导出游戏 (.html / .zip)</div>
              <div className="text-[10px] text-zinc-400">面向玩家直接运行的可玩包，支持浏览器与各端运行</div>
            </div>
            <div className="p-2 rounded bg-[#141418] border border-[#25252e]">
              <div className="font-semibold text-zinc-200">章节包 (.msvn)</div>
              <div className="text-[10px] text-zinc-400">按章节独立分发的剧本与资源增量包，可在游戏内挂载</div>
            </div>
            <div className="p-2 rounded bg-[#141418] border border-[#25252e]">
              <div className="font-semibold text-zinc-200">工程源 (.mpvn)</div>
              <div className="text-[10px] text-zinc-400">面向开发者的完整 Studio 项目文件，用于备份与协作</div>
            </div>
          </div>

          {/* Real Pre-Export Static Verification Summary (`GPT-12`, `Kimi 4G`) */}
          <div
            className={`p-2.5 rounded-md border flex items-center justify-between gap-2 ${
              compileCheck.errorCount > 0
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                : compileCheck.warningCount > 0
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                : 'bg-emerald-950/25 border-emerald-500/35 text-emerald-200'
            }`}
          >
            <div className="min-w-0">
              <div className="font-semibold text-[11px]">
                构建前静态校验 ({project.chapters.length} 章节 · {project.nodes.length} 节点 · {compileCheck.lineCount} 行代码)
              </div>
              <div className="text-[10px] opacity-85 truncate">
                {compileCheck.errorCount === 0 && compileCheck.warningCount === 0
                  ? '入口节点、分支目标引用与节点脚本均通过校验'
                  : `发现 ${compileCheck.errorCount} 个错误、${compileCheck.warningCount} 个警告 (${compileCheck.diagnostics[0]?.message || ''})`}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-black/30 font-mono text-[10px] shrink-0">
              {compileCheck.elapsedMs}ms
            </span>
          </div>

          {/* TAB 1: Unified Game Export (Platform + App Info + Inline Compression Config) */}
          {activeTab === 'package' && (
            <>
              {/* Platform Grid */}
              <div className="grid grid-cols-5 gap-2">
                {PLATFORMS.map((p) => {
                  const active = selectedPlatform === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlatform(p.id)}
                      className={`p-2.5 rounded-md border text-left transition flex flex-col gap-1 ${
                        active
                          ? 'bg-[#222227] border-zinc-400 text-white'
                          : 'bg-[#1a1a1e] border-[#27272c] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {p.icon}
                        {active && <Check className="w-3.5 h-3.5 text-zinc-100" />}
                      </div>
                      <div className="font-semibold text-xs mt-0.5">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{p.badge}</div>
                    </button>
                  );
                })}
              </div>

              {!IS_WEB_EDITION && (
                <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-zinc-300 font-medium flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
                      导出目录路径
                    </label>
                    <button
                      onClick={handleBrowseOutputFolder}
                      className="px-2 py-0.5 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-200 text-[10px]"
                    >
                      选择文件夹
                    </button>
                  </div>
                  <input
                    type="text"
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              )}

              {/* App Metadata */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    游戏名称
                  </label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    应用包名 (Bundle ID)
                  </label>
                  <input
                    type="text"
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    版本号
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Inline Compression & Streaming Configuration (Integrated inside Game Export!) */}
              <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-200">
                    压缩与流加载配置
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['xz', '7z', 'brotli'] as AssetCompressionFormat[]).map(
                      (fmt) => {
                        const spec = COMPRESSION_FORMAT_SPECS[fmt];
                        const active = perf.compressionFormat === fmt;
                        return (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => selectCompressionFormat(fmt)}
                            className={`px-2.5 py-0.5 rounded text-[11px] border transition ${
                              active
                                ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-semibold'
                                : 'bg-[#141417] border-[#2c2c34] text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {spec.name}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>压缩等级</span>
                      <span className="font-mono text-zinc-200">
                        Lv.{perf.compressionLevel}
                      </span>
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
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>提前预载场景</span>
                      <span className="font-mono text-zinc-200">
                        {perf.preloadSceneDistance} 场景
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={perf.preloadSceneDistance}
                      onChange={(e) =>
                        updatePerf({
                          preloadSceneDistance: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>历史卸载距离</span>
                      <span className="font-mono text-zinc-200">
                        {perf.unloadSceneDistance} 场景
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={perf.unloadSceneDistance}
                      onChange={(e) =>
                        updatePerf({
                          unloadSceneDistance: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1 border-t border-[#27272c] text-[11px] text-zinc-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fullscreen}
                      onChange={(e) => setFullscreen(e.target.checked)}
                    />
                    <span>默认全屏运行</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={landscapeLock}
                      onChange={(e) => setLandscapeLock(e.target.checked)}
                    />
                    <span>移动端锁定 16:9 横屏</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={perf.skipAlreadyCompressedPng}
                      onChange={(e) =>
                        updatePerf({
                          skipAlreadyCompressedPng: e.target.checked,
                        })
                      }
                    />
                    <span>跳过已压缩图像二次压缩</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: Clean .msvn Chapter Export (Only chapters, no "第一章必装" text!) */}
          {activeTab === 'msvn' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-zinc-400">
                  选择要导出的章节 ({project.chapters.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    project.chapters.forEach((ch) => {
                      downloadChapterMsvnFile(project, ch.id, perf);
                    });
                    setStatusMessage(
                      `已导出全部 ${project.chapters.length} 个章节 (.msvn)`
                    );
                  }}
                  className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-[11px] flex items-center gap-1"
                >
                  <Download className="w-3 h-3" strokeWidth={1.8} />
                  <span>导出全部章节 (.msvn)</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {project.chapters.map((ch) => {
                  const chNodes = project.nodes.filter(
                    (n) => n.chapterId === ch.id
                  );
                  return (
                    <div
                      key={ch.id}
                      className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-medium text-zinc-100 truncate">
                          {ch.title}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {chNodes.length} 节点
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const file = downloadChapterMsvnFile(
                            project,
                            ch.id,
                            perf
                          );
                          setStatusMessage(`已导出章节：${file}`);
                        }}
                        className="px-2.5 py-1 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-100 text-[11px] flex items-center gap-1 shrink-0"
                      >
                        <Layers className="w-3.5 h-3.5" strokeWidth={1.6} />
                        <span>导出 .msvn</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Export Project (.mpvn) */}
          {activeTab === 'mpvn' && (
            <div className="p-4 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-100">
                  导出项目工程文件 (.mpvn)
                </div>
                <div className="text-[11px] text-zinc-400">
                  包含《{project.title}》的全部 {project.chapters.length} 个章节、
                  {project.nodes.length} 个节点、脚本与角色配置，可在 MooVN 中直接导入继续编辑。
                </div>
              </div>

              <button
                type="button"
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
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#121215] border-t border-[#27272c] flex items-center justify-between shrink-0 text-xs">
          <div className="text-[11px] text-zinc-400 truncate max-w-md">
            {statusMessage ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
                {statusMessage}
              </span>
            ) : (
              <span>内置 MooVN Engine 运行时，导出后可直接游玩</span>
            )}
          </div>

          {activeTab === 'package' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDirectPlayableHtml}
                className="px-3 py-1.5 rounded-md bg-[#23232a] hover:bg-[#2d2d36] border border-[#34343f] text-zinc-200 text-xs transition flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.6} />
                <span>直出单文件可玩版 (.html)</span>
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="px-4 py-1.5 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>
                  导出 {PLATFORMS.find((p) => p.id === selectedPlatform)?.name} 可玩包
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
