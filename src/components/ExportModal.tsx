import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Apple,
  Globe,
  Download,
  CheckCircle2,
  PackageCheck,
} from 'lucide-react';
import { ExportPlatform, VNProject } from '../types';
import { exportPlatformPackage } from '../lib/gamePackager';

interface ExportModalProps {
  project: VNProject;
  onClose: () => void;
}

const PLATFORMS: {
  id: ExportPlatform;
  name: string;
  badge: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'android',
    name: 'Android 移动端',
    badge: 'APK / AAB / 触屏运行时',
    desc: '生成 Android 原生构建包（含 AndroidManifest.xml、横屏触控锁定、Tauri/Capacitor APK 构建脚本与移动端独立运行时）',
    icon: <Smartphone className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: 'windows',
    name: 'Windows 桌面端',
    badge: 'Windows 10/11 x64 (.exe / MSI)',
    desc: '生成 Windows 桌面端原生工程包与一键构建脚本（支持 NSIS 安装程序与免安装便携运行包）',
    icon: <Monitor className="w-5 h-5 text-sky-400" />,
  },
  {
    id: 'macos',
    name: 'macOS 桌面端',
    badge: 'Apple Silicon & Intel (.dmg / .app)',
    desc: '生成 macOS Universal 通用架构应用包与签名构建配置',
    icon: <Apple className="w-5 h-5 text-slate-200" />,
  },
  {
    id: 'ios',
    name: 'iOS / iPadOS 移动端',
    badge: 'iPhone & iPad (.ipa / Xcode)',
    desc: '生成 iOS 全屏横屏视觉小说工程配置与构建清单',
    icon: <Smartphone className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'web',
    name: 'Web 全平台独立包',
    badge: 'PC & Mobile H5',
    desc: '导出零依赖单文件可运行视觉小说游戏（自动剔除编辑器与开发者调试面板）',
    icon: <Globe className="w-5 h-5 text-amber-400" />,
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({ project, onClose }) => {
  const [selectedPlatform, setSelectedPlatform] = useState<ExportPlatform>('android');
  const [packageId, setPackageId] = useState('com.moovn.shiomi');
  const [appName, setAppName] = useState(project.title);
  const [version, setVersion] = useState(project.version || '2.0.0');
  const [fullscreen, setFullscreen] = useState(true);
  const [landscapeLock, setLandscapeLock] = useState(true);
  const [exportedPlatform, setExportedPlatform] = useState<ExportPlatform | null>(null);

  const handleExport = () => {
    exportPlatformPackage(project, {
      platform: selectedPlatform,
      packageId,
      appName,
      version,
      fullscreen,
      landscapeLock,
    });
    setExportedPlatform(selectedPlatform);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#252526] border-b border-[#333333]">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-5 h-5 text-[#007acc]" />
            <span className="text-sm font-bold text-white">多平台游戏打包与构建中心</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#333333]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-12 min-h-[410px]">
          {/* Left: Platform Selector */}
          <div className="col-span-5 bg-[#18181b] border-r border-[#2b2b30] p-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 px-1 mb-1">
              选择目标发布平台
            </div>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPlatform(p.id);
                  setExportedPlatform(null);
                }}
                className={`w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition ${
                  selectedPlatform === p.id
                    ? 'bg-[#094771]/45 border-[#007acc] text-white'
                    : 'bg-[#202024] border-[#2b2b30] text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="mt-0.5 shrink-0">{p.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{p.name}</div>
                  <div className="text-[10px] text-sky-400 mt-0.5">{p.badge}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Right: Configuration */}
          <div className="col-span-7 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              {(() => {
                const active = PLATFORMS.find((p) => p.id === selectedPlatform)!;
                return (
                  <div className="p-3 rounded-lg bg-[#252526] border border-[#333333]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{active.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#007acc]/20 text-sky-300 border border-[#007acc]/40">
                        {active.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {active.desc}
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    应用名称 (App Name)
                  </label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#007acc]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    包名标识 (Package / Bundle ID)
                  </label>
                  <input
                    type="text"
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#007acc]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">发行版本号</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#007acc]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">画面标准分辨率</label>
                  <input
                    type="text"
                    readOnly
                    value={`${project.resolution.width} × ${project.resolution.height} (16:9 HD)`}
                    className="w-full bg-[#18181b] border border-[#2b2b30] rounded px-2.5 py-1.5 text-xs text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={landscapeLock}
                    onChange={(e) => setLandscapeLock(e.target.checked)}
                    className="accent-[#007acc]"
                  />
                  <span>移动端强制横屏沉浸模式（Android / iOS Landscape Lock）</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fullscreen}
                    onChange={(e) => setFullscreen(e.target.checked)}
                    className="accent-[#007acc]"
                  />
                  <span>正式发行版自动剥离「开发者调试」面板与编辑器调试信息</span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-[#2b2b30] flex items-center justify-between">
              {exportedPlatform === selectedPlatform ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>已生成并下载 {selectedPlatform.toUpperCase()} 平台发行包！</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  同时支持通过仓库 GitHub Actions 自动编译全平台安装包
                </div>
              )}

              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#007acc] hover:bg-[#1f8ad2] text-white text-xs font-bold transition shadow-lg"
              >
                <Download className="w-4 h-4" />
                导出 {PLATFORMS.find((p) => p.id === selectedPlatform)?.name} 发行包
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
