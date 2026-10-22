import React, { useState } from 'react';
import { X, Smartphone, Monitor, Apple, Globe, Download, Check } from 'lucide-react';
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
      <div className="w-full max-w-xl bg-[#161619] border border-[#27272c] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121215] border-b border-[#27272c]">
          <span className="text-xs font-medium text-zinc-200">导出发布包</span>
          <button onClick={onClose} className="icon-btn" title="关闭">
            <X className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 grid grid-cols-12 gap-4 text-xs">
          {/* Left: Platform list */}
          <div className="col-span-5 space-y-1.5">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPlatform(p.id);
                  setExportedPlatform(null);
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

          {/* Right: Config */}
          <div className="col-span-7 flex flex-col justify-between space-y-3">
            <div className="p-3 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">应用名称</div>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">包名 (Bundle ID)</div>
                  <input
                    type="text"
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                    className="w-full px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">版本号</div>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full px-2 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
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
              </div>
            </div>

            <div className="space-y-2">
              {exportedPlatform === selectedPlatform && (
                <div className="px-2.5 py-1.5 rounded bg-[#1c1c20] border border-[#27272c] text-zinc-300 text-[11px] flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
                  <span>已开始下载 {selectedPlatform.toUpperCase()} 构建包</span>
                </div>
              )}

              <button
                onClick={handleExport}
                className="w-full py-2 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                导出 {PLATFORMS.find((p) => p.id === selectedPlatform)?.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
